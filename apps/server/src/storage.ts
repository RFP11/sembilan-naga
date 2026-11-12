import { Client } from "minio";
import type { Readable } from "node:stream";
import type { Config } from "./config";

// Private object storage (MinIO). The bucket has no public access: browsers only reach files
// through server routes, which check who is asking first.

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** The object's bytes, or null when it doesn't exist. */
  get(key: string): Promise<Readable | null>;
  remove(key: string): Promise<void>;
}

export type StorageConfig = Pick<
  Config,
  "S3_ENDPOINT" | "S3_BUCKET" | "S3_ACCESS_KEY" | "S3_SECRET_KEY"
>;

/** Null when storage isn't configured; registrations stay closed and the map has no images. */
export function createStorage(config: StorageConfig): Storage | null {
  if (!config.S3_ENDPOINT || !config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) return null;
  const url = new URL(config.S3_ENDPOINT);
  const useSSL = url.protocol === "https:";
  const client = new Client({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : useSSL ? 443 : 80,
    useSSL,
    region: "us-east-1",
    accessKey: config.S3_ACCESS_KEY,
    secretKey: config.S3_SECRET_KEY,
  });
  const bucket = config.S3_BUCKET;
  return {
    async put(key, data, contentType) {
      await client.putObject(bucket, key, data, data.length, { "Content-Type": contentType });
    },
    async get(key) {
      try {
        return await client.getObject(bucket, key);
      } catch (err) {
        if ((err as { code?: string }).code === "NoSuchKey") return null;
        throw err;
      }
    },
    async remove(key) {
      await client.removeObject(bucket, key);
    },
  };
}

export const sheetKey = (name: string) => `sheets/${name}`;
export const mapKey = (file: string) => `map/${file}`;
export const sceneKey = (name: string) => `scenes/${name}`;

/** The map images, by era. The hidden island is deliberately not one of them. */
export const MAP_FILE =
  /^(emas|pertanda|senja)-(bg|shipA|shipB|solmara|pasar|simpang|karang|rimba|badai|nadir)\.webp$/;
