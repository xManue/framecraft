import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/runtime-production-generation.integration.ts", "tests/highlight-region-production.integration.ts", "tests/preview-watch.integration.ts"],
    maxWorkers: 1,
  },
});
