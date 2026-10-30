import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, Vite serves the UI and forwards API + websocket traffic to the Fastify server.
export default defineConfig({
  plugins: [react()],
  // Pre-bundle deps that only lazy-loaded code imports, so Vite doesn't reload the page the
  // first time someone opens those screens in dev.
  optimizeDeps: { include: ["zod"] },
  server: {
    port: 5173,
    // Listen on every interface so the app opens from other devices on the LAN / tailnet
    // (e.g. http://192.168.0.113:5173). The API server stays on 127.0.0.1 behind this proxy.
    host: true,
    // Allow opening the dev server through the tailnet (e.g. homeserver.tailabc13c.ts.net).
    allowedHosts: [".ts.net"],
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/socket.io": { target: "http://127.0.0.1:4000", ws: true },
    },
  },
});
