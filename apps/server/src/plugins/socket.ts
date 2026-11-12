import {
  boardPing,
  campaignJoin,
  campaignGmRoom,
  campaignRoom,
  diceRollRequest,
  tokenMove,
  type ClientToServerEvents,
  type MemberRole,
  type ServerToClientEvents,
  type User,
} from "@dnd/contracts";
import { rollDice } from "@dnd/rules";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { SESSION_COOKIE, validateSession } from "../auth/session";
import { memberRole } from "../campaigns/membership";
import { recordRoll } from "../campaigns/rolls";
import type { Db } from "../db";
import { users } from "../db/schema";
import { noteOpportunities } from "../scenes/encounter";
import { moveToken } from "../scenes/tokens";

interface SocketData {
  user: User;
  /** Role per joined campaign id. */
  roles: Map<string, MemberRole>;
}

export type IO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export function registerSocket(app: FastifyInstance, db: Db): IO {
  const io: IO = new Server(app.server, { path: "/socket.io" });

  // Same cookie session as the REST API; anonymous sockets are refused.
  io.use(async (socket, next) => {
    try {
      const token = app.parseCookie(socket.handshake.headers.cookie ?? "")[SESSION_COOKIE];
      const session = token ? await validateSession(db.orm, token) : null;
      if (!session) return next(new Error("login required"));
      socket.data.user = session.user;
      socket.data.roles = new Map();
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on("connection", (socket) => {
    const { user, roles } = socket.data;
    /** Members who may act (move tokens, roll); spectators only watch. */
    const canAct = (campaignId: string) => {
      const role = roles.get(campaignId);
      return role === "gm" || role === "player";
    };

    socket.on("campaign:join", async (payload, ack) => {
      const parsed = campaignJoin.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid payload" });
      const role = await memberRole(db.orm, parsed.data.campaignId, user.id);
      if (!role) return ack({ ok: false, error: "not a member of this campaign" });
      roles.set(parsed.data.campaignId, role);
      await socket.join(campaignRoom(parsed.data.campaignId));
      if (role === "gm") await socket.join(campaignGmRoom(parsed.data.campaignId));
      ack({ ok: true });
    });

    socket.on("token:move", async (payload) => {
      const parsed = tokenMove.safeParse(payload);
      if (!parsed.success || !canAct(parsed.data.campaignId)) return;
      const { campaignId, tokenId } = parsed.data;
      try {
        const moved = await moveToken(db.orm, user.id, parsed.data);
        if (!moved) return;
        // Players never learn where a hidden token goes, or a token that ends up in the fog.
        const secret = moved.hidden || moved.foggedAfter;
        const room = secret ? campaignGmRoom(campaignId) : campaignRoom(campaignId);
        socket.to(room).emit("token:moved", { campaignId, tokenId, x: moved.x, y: moved.y });
        // Walking into or out of the fog changes who may see it: players fetch tokens again.
        if (!moved.hidden && moved.foggedBefore !== moved.foggedAfter) {
          io.to(campaignRoom(campaignId)).emit("tokens:changed", { campaignId });
        }
        const prompted = await noteOpportunities(db.orm, tokenId, moved.from, moved);
        if (prompted) {
          io.to(campaignRoom(campaignId)).emit("encounter:changed", { campaignId });
        }
      } catch (err) {
        app.log.error({ err }, "token move failed");
      }
    });

    // Pings: at most one every 400 ms per connection, so nobody can flood the table.
    let lastPing = 0;
    socket.on("board:ping", (payload) => {
      const parsed = boardPing.safeParse(payload);
      if (!parsed.success || !canAct(parsed.data.campaignId)) return;
      const now = Date.now();
      if (now - lastPing < 400) return;
      lastPing = now;
      io.to(campaignRoom(parsed.data.campaignId)).emit("board:pinged", {
        ...parsed.data,
        by: user.displayName,
        userId: user.id,
      });
    });

    // Dice are rolled on the server so players can't fake results, and logged.
    socket.on("dice:roll", async (payload, ack) => {
      const parsed = diceRollRequest.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid payload" });
      const { campaignId, expression, label, secret } = parsed.data;
      if (!canAct(campaignId)) return ack({ ok: false, error: "join the campaign first" });
      let roll;
      try {
        roll = rollDice(expression);
      } catch (err) {
        return ack({ ok: false, error: (err as Error).message });
      }
      // The dice colour may have changed since this socket connected.
      const [fresh] = await db.orm
        .select({ diceColor: users.diceColor })
        .from(users)
        .where(eq(users.id, user.id));
      await recordRoll(db.orm, io, {
        campaignId,
        user: { ...user, diceColor: fresh?.diceColor ?? user.diceColor },
        expression,
        label,
        rolls: roll.rolls,
        total: roll.total,
        secret: secret && roles.get(campaignId) === "gm",
      });
      ack({ ok: true });
    });
  });

  app.addHook("onClose", async () => {
    await io.close();
  });

  return io;
}
