import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import { registerAuth, type AuthConfig } from "./auth/plugin";
import { campaignRoutes } from "./campaigns/routes";
import { playRoutes } from "./characters/play";
import { characterRoutes } from "./characters/routes";
import type { Config } from "./config";
import type { Db } from "./db";
import { registerSocket } from "./plugins/socket";
import { attackRoutes } from "./scenes/attacks";
import { encounterRoutes } from "./scenes/encounter";
import { sceneRoutes } from "./scenes/routes";
import { tokenRoutes } from "./scenes/tokens";
import { promoRoutes, type PromoConfig } from "./promo/routes";
import { compendiumRoutes } from "./routes/compendium";
import { healthRoutes } from "./routes/health";
import type { Storage } from "./storage";

export interface AppDeps {
  config: AuthConfig & PromoConfig & Pick<Config, "WEB_DIST">;
  db: Db;
  storage: Storage | null;
}

export async function buildApp({ config, db, storage }: AppDeps) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await registerAuth(app, config, db);
  const io = registerSocket(app, db);
  await app.register(healthRoutes, { prefix: "/api", db });
  await app.register(compendiumRoutes, { prefix: "/api" });
  await app.register(campaignRoutes, { prefix: "/api", db });
  await app.register(characterRoutes, { prefix: "/api", db });
  await app.register(playRoutes, { prefix: "/api", db, io });
  await app.register(promoRoutes, { prefix: "/api/promo", db, config, storage });
  await app.register(sceneRoutes, { prefix: "/api", db, io, storage });
  await app.register(tokenRoutes, { prefix: "/api", db, io });
  await app.register(encounterRoutes, { prefix: "/api", db, io });
  await app.register(attackRoutes, { prefix: "/api", db, io });

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
