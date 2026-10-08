import type { MqttConnectionCallbacks, MqttTagSample } from "./mqtt-driver.mjs";
import type { OpcUaTagSample } from "./opcua-driver.mjs";
import type { ConnectionCatalog } from "./connection-config.mjs";
import type { ConnectionDiagnostic } from "./connection-diagnostics.mjs";
import type { AlarmCatalog, AlarmSnapshot, AlarmEvent, AlarmCommand } from "./alarm-engine.mjs";
import type { IncomingMessage } from "node:http";
export interface GatewayConfig {
  enabled: boolean; host?: "127.0.0.1"; port: number; tokenEnv: string; allowedOrigins: string[]; allowWrites?: boolean;
}
export interface GatewaySnapshot {
  alarms?: AlarmSnapshot;
  version: 1; allowWrites: boolean;
  connections: { id: string; state: string; error?: string; diagnostic?: ConnectionDiagnostic }[];
  diagnostics?: ConnectionDiagnostic[];
  tags: { name: string; dataType: string; access: "read" | "write" | "read-write"; connectionId: string; writable: boolean }[];
  samples: ((MqttTagSample | OpcUaTagSample) & { connectionId: string })[];
}
export function createPlcGateway(
  catalog: ConnectionCatalog,
  variables: readonly { name: string; dataType: string; access: "read" | "write" | "read-write" }[],
  options?: Pick<MqttConnectionCallbacks, "resolveSecret" | "onState" | "onError" | "onDiagnostic"> & { alarmCatalog?: AlarmCatalog; onAlarmEvent?: (event: AlarmEvent) => void; authorizeAlarmAction?: (request: IncomingMessage, command: AlarmCommand) => string | undefined | Promise<string | undefined> },
): { readonly address: string | undefined; snapshot(): GatewaySnapshot; start(): Promise<void>; stop(): Promise<void> };
export const createMqttGateway: typeof createPlcGateway;
