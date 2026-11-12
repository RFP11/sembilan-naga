import { buildApp } from "./app";
import { config } from "./config";
import { createDb, runMigrations } from "./db";
import { createStorage } from "./storage";

if (!config.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:setup` (see README).",
  );
  process.exit(1);
}

const db = createDb(config.DATABASE_URL);
await runMigrations(db, config.MIGRATIONS_DIR);
const storage = createStorage(config);
if (!storage) console.warn("S3_* is not set: registrations are closed and the map has no images.");
const app = await buildApp({ config, db, storage });

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
