import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, Vite serves the UI and forwards API + websocket traffic to the Fastify server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow opening the dev server through the tailnet (e.g. homeserver.tailabc13c.ts.net).
    allowedHosts: [".ts.net"],
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/socket.io": { target: "http://127.0.0.1:4000", ws: true },
    },
  },
});
