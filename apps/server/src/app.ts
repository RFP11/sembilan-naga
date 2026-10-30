import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import type { Config } from "./config";
import type { Sql } from "./db";
import { registerSocket } from "./plugins/socket";
import { compendiumRoutes } from "./routes/compendium";
import { healthRoutes } from "./routes/health";

export interface AppDeps {
  config: Pick<Config, "NODE_ENV" | "WEB_DIST">;
  sql?: Sql;
}

export async function buildApp({ config, sql }: AppDeps) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await app.register(healthRoutes, { prefix: "/api", sql });
  await app.register(compendiumRoutes, { prefix: "/api" });
  registerSocket(app);

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
