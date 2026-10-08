import { defineConfig } from "vitest/config";
import { testRunnerDefaults } from "./vitest.settings";

export default defineConfig({
  test: {
    ...testRunnerDefaults,
    environment: "node",
    include: ["tests/runtime-production-generation.integration.ts", "tests/highlight-region-production.integration.ts", "tests/preview-watch.integration.ts"],
    maxWorkers: 1,
  },
});
