import type { MqttConnectionConfig, MqttConnectionCallbacks, MqttTagSample } from "./mqtt-driver.mjs";
export interface GatewayConfig {
  enabled: boolean; host?: "127.0.0.1"; port: number; tokenEnv: string; allowedOrigins: string[]; allowWrites?: boolean;
}
export interface GatewaySnapshot {
  version: 1; allowWrites: boolean;
  connections: { id: string; state: string; error?: string }[];
  tags: { name: string; dataType: string; access: "read" | "write" | "read-write"; connectionId: string; writable: boolean }[];
  samples: (MqttTagSample & { connectionId: string })[];
}
export function createMqttGateway(
  catalog: { version: 1; gateway: GatewayConfig; connections: (MqttConnectionConfig & { protocol: "mqtt"; enabled: boolean })[] },
  variables: readonly { name: string; dataType: string; access: "read" | "write" | "read-write" }[],
  options?: Pick<MqttConnectionCallbacks, "resolveSecret" | "onState" | "onError">,
): { readonly address: string | undefined; snapshot(): GatewaySnapshot; start(): Promise<void>; stop(): Promise<void> };
