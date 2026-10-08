import type { MqttConnectionConfig } from "./mqtt-driver.mjs";
import type { OpcUaConnectionConfig } from "./opcua-driver.mjs";
import type { GatewayConfig } from "./gateway.mjs";
export interface MqttVariable { name: string; dataType: string; access: "read" | "write" | "read-write" }
export type PlcConnectionConfig = (MqttConnectionConfig & { protocol: "mqtt"; enabled: boolean }) | (OpcUaConnectionConfig & { protocol: "opcua"; enabled: boolean });
export interface ConnectionCatalog { version: 1; gateway: GatewayConfig; connections: PlcConnectionConfig[] }
export class ConnectionConfigurationError extends Error { path: string; constructor(message: string, path: string) }
export function normalizeMqttTagValue(value: unknown, dataType: string): string | number | boolean;
export function validateMqttConnection(config: unknown, variables: readonly MqttVariable[], prefix?: string): Map<string, MqttVariable>;
export function validateOpcUaConnection(config: unknown, variables: readonly MqttVariable[], prefix?: string): Map<string, MqttVariable>;
export function validatePlcConnection(config: unknown, variables: readonly MqttVariable[], prefix?: string): Map<string, MqttVariable>;
export function validateGatewayConfiguration(config: unknown, allowEphemeralPort?: boolean): void;
export function validateConnectionCatalog(catalog: unknown, variables: readonly MqttVariable[], options?: { includeDisabled?: boolean; allowEphemeralPort?: boolean }): void;
