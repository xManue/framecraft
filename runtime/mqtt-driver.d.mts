export interface MqttBinding {
  tag: string; topic?: string; qos?: 0 | 1 | 2; encoding?: "json" | "text";
  valuePath?: string; qualityPath?: string; timestampPath?: string; timestampUnit?: "ms" | "s";
  staleAfterMs?: number; writeTopic?: string; writeQos?: 0 | 1 | 2; writeEncoding?: "json" | "text"; writeRetain?: false;
}
export function normalizeMqttTagValue(value: unknown, dataType: string): string | number | boolean;
export interface MqttConnectionConfig {
  id: string; url: string; clientId?: string; allowInsecure?: boolean; allowWrites?: boolean;
  reconnectMs?: number; timeoutMs?: number; maxPayloadBytes?: number; protocolVersion?: 4 | 5;
  usernameEnv?: string; passwordEnv?: string;
  tls?: { caFile?: string; certificateFile?: string; privateKeyFile?: string };
  bindings: MqttBinding[];
}
export interface MqttTagSample {
  tag: string; value?: string; qualityCode?: number; timestamp?: number; sourceTimestamp?: number;
  receivedAt: number; retained?: boolean; lastError?: string; errorDescription?: string;
}
export interface MqttConnectionCallbacks {
  onSample?: (sample: MqttTagSample) => void;
  onState?: (event: { id: string; state: string; error?: string }) => void;
  onError?: (message: string) => void;
  resolveSecret?: (name: string) => string | undefined;
}
export function createMqttPlcConnection(
  config: MqttConnectionConfig,
  variables: readonly { name: string; dataType: string; access: "read" | "write" | "read-write" }[],
  callbacks?: MqttConnectionCallbacks,
): {
  readonly state: string; read(tag: string): MqttTagSample | undefined; start(): Promise<void>; stop(): Promise<void>;
  write(tag: string, value: string | number | boolean): Promise<{ tag: string; delivery: "broker-ack" | "transport"; plcConfirmed: false }>;
};
