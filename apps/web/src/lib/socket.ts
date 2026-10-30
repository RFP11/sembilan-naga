import type { ClientToServerEvents, ServerToClientEvents } from "@dnd/contracts";
import { io, type Socket } from "socket.io-client";

// One shared connection for the whole app (same origin; Vite proxies it in dev).
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  path: "/socket.io",
  autoConnect: false,
});
