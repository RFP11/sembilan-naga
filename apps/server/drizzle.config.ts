import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env; the app scripts use --env-file, this mirrors it.
try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env: rely on the environment
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  casing: "snake_case",
});
