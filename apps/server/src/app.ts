import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import { registerAuth, type AuthConfig } from "./auth/plugin";
import { campaignRoutes } from "./campaigns/routes";
import type { Config } from "./config";
import type { Db } from "./db";
import { registerSocket } from "./plugins/socket";
import { compendiumRoutes } from "./routes/compendium";
import { healthRoutes } from "./routes/health";

export interface AppDeps {
  config: AuthConfig & Pick<Config, "WEB_DIST">;
  db: Db;
}

export async function buildApp({ config, db }: AppDeps) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await registerAuth(app, config, db);
  await app.register(healthRoutes, { prefix: "/api", db });
  await app.register(compendiumRoutes, { prefix: "/api" });
  await app.register(campaignRoutes, { prefix: "/api", db });
  registerSocket(app, db);

  // Production: serve the React build from the same origin, with SPA fallback.
  if (config.WEB_DIST) {
    const root = path.resolve(config.WEB_DIST);
    await app.register(fastifyStatic, { root, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  }

  return app;
}
