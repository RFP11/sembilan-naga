import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files share one database (`<db>_test`) and reset it on start, so run them in turn.
    fileParallelism: false,
  },
});
