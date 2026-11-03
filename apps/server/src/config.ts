import { z } from "zod";

const flag = z.enum(["true", "false", "1", "0", ""]).transform((v) => v === "true" || v === "1");

const env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().optional(),
    WEB_DIST: z.string().optional(),
    /** Production image only; defaults to apps/server/drizzle. */
    MIGRATIONS_DIR: z.string().optional(),
    /** Origin users open in the browser; OAuth redirects back to it. */
    PUBLIC_URL: z.url().default("http://localhost:5173"),
    /** Google login is offered only when both are set. */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** Quick login as a seed user. Ignored when NODE_ENV=production. */
    DEV_LOGIN: flag.default(false),
    /** The campaign the public page promotes; registrations stay closed while unset. */
    PROMO_CAMPAIGN_ID: z.uuid().or(z.literal("")).optional(),
    /** MinIO, for character sheets and map images. Registrations stay closed while unset. */
    S3_ENDPOINT: z.url().or(z.literal("")).optional(),
    S3_BUCKET: z.string().default("dnd-serpih"),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
  })
  .parse(process.env);

export const config = env;
export type Config = typeof env;
