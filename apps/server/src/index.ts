import { buildApp } from "./app";
import { config } from "./config";
import { createDb } from "./db";

const sql = createDb(config.DATABASE_URL);
const app = await buildApp({ config, sql });

const shutdown = async () => {
  await app.close();
  await sql?.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
