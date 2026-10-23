import type { RecipeApplyConfigurationSnapshot } from "../../src/core/recipeApplyConfiguration";
export const applyRecipes = { version: 1 as const, schemas: ["s", "other"].map(id => ({ id, name: id === "s" ? "Formato principale" : "Formato esteso", fields: [{ id: "n", name: "Velocità", type: "number" as const }], records: [] })) };
export const applyVariables = [
  { name: "Request", dataType: "String", access: "write" }, { name: "Response", dataType: "WString", access: "read" },
  { name: "WrongType", dataType: "Real", access: "read-write" }, { name: "ReadOnly", dataType: "String", access: "read" }, { name: "Detected", dataType: "String", access: "read-write", detected: true },
];
export const applyConnections = { version: 1 as const, gateway: { enabled: true, port: 4877, tokenEnv: "SYNTHETIC_APPLY_TOKEN", allowedOrigins: ["http://127.0.0.1:4173"], allowWrites: true }, connections: [{ id: "line1", protocol: "mqtt" as const, enabled: true, url: "mqtt://127.0.0.1:1883", allowInsecure: true, allowWrites: true, bindings: [{ tag: "Request", writeTopic: "synthetic/recipe/request", writeEncoding: "text" as const }, { tag: "Response", topic: "synthetic/recipe/response", valuePath: "/value", qualityPath: "/quality" }] }] };
export const applyAuth = { version: 1 as const, enabled: true, namespace: "00000000-0000-4000-8000-000000000001", allowHttpLoopback: true, idleMinutes: 10, absoluteMinutes: 20 };
export function applySnapshot(overrides: Partial<RecipeApplyConfigurationSnapshot> = {}): RecipeApplyConfigurationSnapshot { return { generation: 9, source: null, recipes: JSON.stringify(applyRecipes), plc: JSON.stringify({ version: 1, variables: applyVariables }), connections: JSON.stringify(applyConnections), auth: JSON.stringify(applyAuth), commissioned: false, ...overrides }; }
