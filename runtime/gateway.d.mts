import type { MqttConnectionCallbacks, MqttTagSample } from "./mqtt-driver.mjs";
import type { OpcUaTagSample } from "./opcua-driver.mjs";
import type { ConnectionCatalog } from "./connection-config.mjs";
import type { ConnectionDiagnostic } from "./connection-diagnostics.mjs";
import type { AlarmCatalog, AlarmSnapshot, AlarmEvent, AlarmCommand } from "./alarm-engine.mjs";
import type { IncomingMessage } from "node:http";
import type { RecipeCommand, RecipeStoreError } from "./recipe-catalog.mjs";
import type { RecipeStore } from "./recipe-store.mjs";
import type { LocalOperatorAuth } from "./operator-auth.mjs";
import type { OperatorAuthError } from "./operator-policy.mjs";
import type { RuntimeAudit, RuntimeAuditReader } from "./audit-store.mjs";
import type { AlarmHistoryStore } from "./alarm-history-store.mjs";
import type { AlarmHistoryCapture, AlarmHistoryError } from "./alarm-history.mjs";
import type { RecipePlcConfig, RecipePlcError } from "./recipe-plc.mjs";
import type { RecipeApplyConfig, RecipeApplyError } from "./recipe-apply.mjs";
import type { RecipeApplyStore } from "./recipe-apply-store.mjs";
import type { DataLogStore } from "./data-log-store.mjs";
import type { DataLogCapture, DataLogError } from "./data-log.mjs";
export interface GatewayConfig {
  enabled: boolean; host?: "127.0.0.1"; port: number; tokenEnv: string; allowedOrigins: string[]; allowWrites?: boolean;
}
export interface GatewaySnapshot {
  dataLogs?: DataLogCapture & { instanceId: string };
  alarmHistory?: AlarmHistoryCapture;
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
  options?: Pick<MqttConnectionCallbacks, "resolveSecret" | "onState" | "onError" | "onDiagnostic"> & { alarmCatalog?: AlarmCatalog; onAlarmEvent?: (event: AlarmEvent) => void; authorizeAlarmAction?: (request: IncomingMessage, command: AlarmCommand) => string | undefined | Promise<string | undefined>;
    recipeStore?: RecipeStore;
    dataLogCatalog?: unknown;
    dataLogStore?: DataLogStore;
    dataLogUnavailable?: DataLogError;
    onDataLogDiagnostic?: (event: { type: "data-log"; code: string; error: string; remedy: string }) => void;
    recipeApplyConfig?: RecipeApplyConfig;
    recipeApplyNamespace?: string;
    recipeApplyStore?: RecipeApplyStore;
    recipeApplyUnavailable?: RecipeApplyError;
    onRecipeApplyDiagnostic?: (event: { type: "recipe-apply"; code: string; error: string; remedy: string }) => void;
    recipePlcCatalog?: RecipePlcConfig;
    recipePlcUnavailable?: RecipePlcError;
    onRecipePlcDiagnostic?: (event: { type: "recipe-plc"; code: string; error: string; remedy: string; fieldId?: string }) => void;
    alarmHistory?: AlarmHistoryStore;
    historyUnavailable?: AlarmHistoryError;
    onHistoryDiagnostic?: (event: { type: "alarm-history"; code: string; error: string; remedy: string }) => void;
    audit?: RuntimeAudit & Partial<RuntimeAuditReader>;
    operatorAuth?: LocalOperatorAuth;
    operatorUnavailable?: OperatorAuthError;
    authorizeTagWrite?: (request: IncomingMessage, command: { id: string; tag: string; value: string | number | boolean }) => string | undefined | Promise<string | undefined>;
    recipeUnavailable?: RecipeStoreError;
    authorizeRecipeAction?: (request: IncomingMessage, command: RecipeCommand | { action: "read" }) => string | undefined | Promise<string | undefined>;
    onRecipeDiagnostic?: (event: { type: "recipe"; code: string; error: string; remedy: string; fieldId?: string }) => void;
  },
): { readonly address: string | undefined; snapshot(): GatewaySnapshot; start(): Promise<void>; stop(): Promise<void> };
export const createMqttGateway: typeof createPlcGateway;
