import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const orm = drizzle(client, { schema, casing: "snake_case" });
  return { client, orm, close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>;
/** The Drizzle instance, or a transaction on it. */
export type Orm = Db["orm"];

/**
 * Where `pnpm db:generate` writes migrations. Server scripts (dev, start, test, db:*) all run
 * from apps/server; the Docker image sets MIGRATIONS_DIR instead.
 */
export const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

/** Applies pending migrations; already-applied ones are skipped. */
export async function runMigrations(db: Db, folder = MIGRATIONS_DIR): Promise<void> {
  await migrate(db.orm, { migrationsFolder: folder });
}

/** postgres://u:p@host:5432/dnd → postgres://u:p@host:5432/dnd_test */
export function testDatabaseUrl(url: string): string {
  const u = new URL(url);
  u.pathname = `${u.pathname.replace(/^\//, "")}_test`;
  return u.toString();
}
