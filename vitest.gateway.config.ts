import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["tests/runtime-mqtt.integration.ts", "tests/runtime-gateway.integration.ts", "tests/runtime-mqtt-faults.integration.ts"], maxWorkers: 1 } });
