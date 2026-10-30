import type { HealthResponse } from "@dnd/contracts";
import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db";

export const healthRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.get("/health", async (): Promise<HealthResponse> => {
    try {
      await db.orm.execute(sql`select 1`);
      return { status: "ok", db: "up" };
    } catch {
      return { status: "ok", db: "down" };
    }
  });
};
