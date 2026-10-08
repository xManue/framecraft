import { defineConfig } from "vitest/config";
import { testRunnerDefaults } from "./vitest.settings";

export default defineConfig({ test: { ...testRunnerDefaults, environment: "node", include: ["tests/runtime-mqtt.integration.ts", "tests/runtime-gateway.integration.ts", "tests/runtime-mqtt-faults.integration.ts", "tests/runtime-opcua.integration.ts"], maxWorkers: 1 } });
