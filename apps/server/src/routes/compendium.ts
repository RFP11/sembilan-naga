import { spells } from "@dnd/data";
import type { FastifyPluginAsync } from "fastify";

export const compendiumRoutes: FastifyPluginAsync = async (app) => {
  app.get("/spells", async () => spells);
};
