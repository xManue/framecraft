import { defineConfig } from "vitest/config";
import { testRunnerDefaults } from "./vitest.settings";

export default defineConfig({
  test: { ...testRunnerDefaults, environment: "node", include: ["tests/editor-recovery.integration.ts"], maxWorkers: 1 },
});
