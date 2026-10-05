import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/editor-recovery.integration.ts"], maxWorkers: 1 },
});
