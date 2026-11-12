// Puts the map images into the private bucket:
//   pnpm promo:upload-map [folder]     (default: apps/server/promo-assets)
// The images aren't in git, so later eras can't be seen by reading the repository.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { createStorage, MAP_FILE, mapKey } from "../storage";

const folder = process.argv[2] ?? "promo-assets";
const storage = createStorage(config);
if (!storage) {
  console.error("S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY must be set (see README).");
  process.exit(1);
}

const files = (await readdir(folder)).filter((file) => MAP_FILE.test(file));
if (files.length === 0) {
  console.error(`No map images in ${folder}.`);
  process.exit(1);
}
for (const file of files) {
  await storage.put(mapKey(file), await readFile(path.join(folder, file)), "image/webp");
}
console.log(`Uploaded ${files.length} map images to bucket "${config.S3_BUCKET}".`);
