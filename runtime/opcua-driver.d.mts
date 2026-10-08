import type { MqttConnectionCallbacks, MqttTagSample } from "./mqtt-driver.mjs";
export interface OpcUaBinding {
  tag: string; namespaceUri: string; nodeId: string; writeEnabled?: boolean; staleAfterMs?: number;
}
export interface OpcUaConnectionConfig {
  id: string; url: string; allowWrites?: boolean; allowInsecure?: boolean;
  securityMode: "None" | "Sign" | "SignAndEncrypt";
  securityPolicy: "None" | "Basic256Sha256" | "Aes128_Sha256_RsaOaep" | "Aes256_Sha256_RsaPss";
  applicationUri?: string; certificateFile?: string; privateKeyFile?: string; pkiDirectory?: string;
  usernameEnv?: string; passwordEnv?: string;
  timeoutMs?: number; reconnectMs?: number; readIntervalMs?: number; samplingIntervalMs?: number;
  bindings: OpcUaBinding[];
}
export interface OpcUaTagSample extends MqttTagSample { opcUaStatusCode?: number; serverTimestamp?: number }
export function createOpcUaPlcConnection(config: OpcUaConnectionConfig,
  variables: readonly { name: string; dataType: string; access: "read" | "write" | "read-write" }[],
  callbacks?: Omit<MqttConnectionCallbacks, "onSample"> & { onSample?: (sample: OpcUaTagSample) => void },
): {
  readonly state: string; read(tag: string): OpcUaTagSample | undefined; start(): Promise<void>; stop(): Promise<void>;
  write(tag: string, value: string | number | boolean): Promise<{ tag: string; delivery: "opcua-service"; plcConfirmed: false }>;
};
