// Database commands behind `pnpm db:*` (see README "Database").
// Usage: tsx src/db/cli.ts <create|migrate|seed|setup|reset>

import postgres from "postgres";
import { config } from "../config";
import { createDb, runMigrations, testDatabaseUrl } from "./index";
import { seed } from "./seed";

const command = process.argv[2];
const url = config.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README).");
  process.exit(1);
}

/** Runs `fn` against the server's maintenance database ("postgres"). */
async function withAdmin<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const admin = new URL(url!);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const dbName = (u: string) => decodeURIComponent(new URL(u).pathname.slice(1));

async function create() {
  await withAdmin(async (sql) => {
    for (const name of [dbName(url!), dbName(testDatabaseUrl(url!))]) {
      const [exists] = await sql`select 1 from pg_database where datname = ${name}`;
      if (exists) console.log(`database "${name}" already exists`);
      else {
        await sql`create database ${sql(name)}`;
        console.log(`created database "${name}"`);
      }
    }
  });
}

async function migrateAll() {
  for (const target of [url!, testDatabaseUrl(url!)]) {
    const db = createDb(target);
    try {
      await runMigrations(db);
      console.log(`migrated "${dbName(target)}"`);
    } finally {
      await db.close();
    }
  }
}

async function runSeed() {
  if (config.NODE_ENV === "production") throw new Error("refusing to seed a production database");
  const db = createDb(url!);
  try {
    await seed(db.orm);
    console.log(`seeded "${dbName(url!)}"`);
  } finally {
    await db.close();
  }
}

async function reset() {
  if (config.NODE_ENV === "production") throw new Error("refusing to reset a production database");
  await withAdmin(async (sql) => {
    for (const name of [dbName(url!), dbName(testDatabaseUrl(url!))]) {
      await sql`drop database if exists ${sql(name)} with (force)`;
      console.log(`dropped database "${name}"`);
    }
  });
  await create();
  await migrateAll();
  await runSeed();
}

const commands: Record<string, () => Promise<void>> = {
  create,
  migrate: migrateAll,
  seed: runSeed,
  setup: async () => {
    await create();
    await migrateAll();
    await runSeed();
  },
  reset,
};

const run = command ? commands[command] : undefined;
if (!run) {
  console.error(`usage: db:<${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
try {
  await run();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
