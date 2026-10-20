import type { IncomingMessage } from "node:http";
import type { OperatorAuthConfig, OperatorCapability, OperatorSession } from "./operator-policy.mjs";
export interface LocalOperatorAuth {
  status(request: IncomingMessage): Promise<OperatorSession>;
  login(request: IncomingMessage, input: unknown): Promise<{ body: OperatorSession; cookie: string }>;
  logout(request: IncomingMessage): Promise<{ body: OperatorSession; cookie: string }>;
  authorize(request: IncomingMessage, capability: OperatorCapability, mutation?: boolean): Promise<string>;
  close(): void;
}
export function createLocalOperatorAuth(options: { file: string; config: OperatorAuthConfig; allowedOrigins: string[]; now?: () => number; onEvent?: (event: { type: "operator"; code: string; actor?: string; timestamp: string }) => void }): LocalOperatorAuth;
