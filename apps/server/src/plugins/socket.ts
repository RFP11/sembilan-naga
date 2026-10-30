import {
  campaignJoin,
  campaignRoom,
  diceRollRequest,
  tokenMove,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@dnd/contracts";
import { rollDice } from "@dnd/rules";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerSocket(app: FastifyInstance): IO {
  const io: IO = new Server(app.server, { path: "/socket.io" });

  io.on("connection", (socket) => {
    // TODO(auth): replace with the logged-in user once auth exists.
    const userName = `guest-${socket.id.slice(0, 4)}`;

    socket.on("campaign:join", async (payload, ack) => {
      const parsed = campaignJoin.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid payload" });
      await socket.join(campaignRoom(parsed.data.campaignId));
      ack({ ok: true });
    });

    socket.on("token:move", (payload) => {
      const parsed = tokenMove.safeParse(payload);
      if (!parsed.success) return;
      const room = campaignRoom(parsed.data.campaignId);
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit("token:moved", parsed.data);
    });

    // Dice are rolled on the server so players can't fake results.
    socket.on("dice:roll", (payload, ack) => {
      const parsed = diceRollRequest.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid payload" });
      const room = campaignRoom(parsed.data.campaignId);
      if (!socket.rooms.has(room)) return ack({ ok: false, error: "join the campaign first" });
      try {
        const { rolls, modifier, total } = rollDice(parsed.data.expression);
        io.to(room).emit("dice:rolled", { ...parsed.data, rolls, modifier, total, by: userName });
        ack({ ok: true });
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    });
  });

  app.addHook("onClose", async () => {
    await io.close();
  });

  return io;
}
