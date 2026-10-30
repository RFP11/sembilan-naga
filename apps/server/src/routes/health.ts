import type { HealthResponse } from "@dnd/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { Sql } from "../db";

export const healthRoutes: FastifyPluginAsync<{ sql?: Sql }> = async (app, { sql }) => {
  app.get("/health", async (): Promise<HealthResponse> => {
    if (!sql) return { status: "ok", db: "not-configured" };
    try {
      await sql`select 1`;
      return { status: "ok", db: "up" };
    } catch {
      return { status: "ok", db: "down" };
    }
  });
};
