import {
  campaignJoin,
  campaignRoom,
  diceRollRequest,
  tokenMove,
  type ClientToServerEvents,
  type MemberRole,
  type ServerToClientEvents,
  type User,
} from "@dnd/contracts";
import { rollDice } from "@dnd/rules";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { SESSION_COOKIE, validateSession } from "../auth/session";
import { toRollResult } from "../campaigns/routes";
import { memberRole } from "../campaigns/membership";
import type { Db } from "../db";
import { chatMessages } from "../db/schema";

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
      ack({ ok: true });
    });

    socket.on("token:move", (payload) => {
      const parsed = tokenMove.safeParse(payload);
      if (!parsed.success || !canAct(parsed.data.campaignId)) return;
      socket.to(campaignRoom(parsed.data.campaignId)).emit("token:moved", parsed.data);
    });

    // Dice are rolled on the server so players can't fake results, and logged.
    socket.on("dice:roll", async (payload, ack) => {
      const parsed = diceRollRequest.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid payload" });
      const { campaignId, expression, label } = parsed.data;
      if (!canAct(campaignId)) return ack({ ok: false, error: "join the campaign first" });
      let roll;
      try {
        roll = rollDice(expression);
      } catch (err) {
        return ack({ ok: false, error: (err as Error).message });
      }
      const [row] = await db.orm
        .insert(chatMessages)
        .values({
          campaignId,
          userId: user.id,
          kind: "roll",
          expression,
          label,
          rolls: roll.rolls,
          total: roll.total,
        })
        .returning();
      io.to(campaignRoom(campaignId)).emit("dice:rolled", toRollResult(row!, user.displayName));
      ack({ ok: true });
    });
  });

  app.addHook("onClose", async () => {
    await io.close();
  });

  return io;
}
