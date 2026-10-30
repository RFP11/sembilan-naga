import { z } from "zod";

const env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().optional(),
    WEB_DIST: z.string().optional(),
  })
  .parse(process.env);

export const config = env;
export type Config = typeof env;
