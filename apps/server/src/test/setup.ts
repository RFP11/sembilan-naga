// Shared test helpers: a migrated `<db>_test` database, reset and re-seeded per test file.

import { sql } from "drizzle-orm";
import { buildApp } from "../app";
import { createDb, runMigrations, testDatabaseUrl, type Db } from "../db";
import { seed } from "../db/seed";

try {
  process.loadEnvFile("../../.env");
} catch {
  // CI provides DATABASE_URL directly
}

export const TEST_CONFIG = {
  NODE_ENV: "test",
  PUBLIC_URL: "http://localhost:5173",
  DEV_LOGIN: true,
} as const;

export async function createTestDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("server tests need DATABASE_URL (run `pnpm db:setup`, see README)");
  const db = createDb(testDatabaseUrl(url));
  await runMigrations(db);
  await db.orm.execute(
    sql`truncate users, sessions, campaigns, campaign_members, chat_messages, characters cascade`,
  );
  await seed(db.orm);
  return db;
}

export async function createTestApp() {
  const db = await createTestDb();
  const app = await buildApp({ config: TEST_CONFIG, db });
  return { app, db };
}

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

/** Logs in as a seed user through the dev login and returns the Cookie header value. */
export async function loginAs(app: App, userId: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/dev-login", payload: { userId } });
  if (res.statusCode !== 200) throw new Error(`dev login failed: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === "session");
  return `session=${cookie!.value}`;
}
