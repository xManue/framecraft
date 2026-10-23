import { describe, expect, it } from "vitest";
import { emptyRecipeApplyConfig, newRecipeApplyProfile, parseRecipeApplyConfig, recipeApplyConfigurationIssues, recipeApplyEnvironment, recipeApplyConfigurationError } from "../src/core/recipeApplyConfiguration";
import { applySnapshot, applyRecipes } from "./fixtures/recipeApplyConfiguration";
const config = () => ({ version: 1 as const, schemas: [{ ...newRecipeApplyProfile("s"), channelId: "line1", requestTag: "Request", responseTag: "Response" }] });
describe("manual recipe apply interface configuration", () => {
  it("starts off with no invented channel or tag, and validates an explicitly prepared transport", () => {
    expect(emptyRecipeApplyConfig()).toEqual({ version: 1, schemas: [] }); expect(newRecipeApplyProfile("s")).toMatchObject({ channelId: "", requestTag: "", responseTag: "" });
    const environment = recipeApplyEnvironment(applySnapshot()); expect(recipeApplyConfigurationIssues(config(), applyRecipes, environment)).toEqual([]); expect(parseRecipeApplyConfig(config(), applyRecipes, environment.variables)).toEqual(config());
  });
  it("requires declared scalar text tags, correct access and two separate buffers", () => {
    const environment = recipeApplyEnvironment(applySnapshot());
    for (const requestTag of ["", "WrongType", "ReadOnly", "Detected"]) expect(recipeApplyConfigurationIssues({ ...config(), schemas: [{ ...config().schemas[0], requestTag }] }, applyRecipes, environment).some(issue => issue.includes("tag richiesta"))).toBe(true);
    expect(recipeApplyConfigurationIssues({ ...config(), schemas: [{ ...config().schemas[0], responseTag: "Request" }] }, applyRecipes, environment).join(" ")).toContain("due tag diversi");
  });
  it("never grants connection or operator permissions by configuring an interface", () => {
    const environment = recipeApplyEnvironment(applySnapshot()); environment.auth!.enabled = false; environment.connections.gateway.allowWrites = false; environment.connections.connections[0].allowWrites = false;
    const before = JSON.stringify(environment), issues = recipeApplyConfigurationIssues(config(), applyRecipes, environment).join(" "); expect(issues).toContain("Account e permessi"); expect(issues).toContain("abilita esplicitamente"); expect(issues).toContain("scritture della connessione"); expect(JSON.stringify(environment)).toBe(before);
  });
  it("requires the same active connection, raw MQTT requests, explicit response quality and sufficient transport capacity", () => {
    const environment = recipeApplyEnvironment(applySnapshot()), connection = environment.connections.connections[0];
    if (connection.protocol !== "mqtt") throw Error("fixture"); connection.bindings[0].writeEncoding = "json"; delete connection.bindings[1].qualityPath; connection.maxPayloadBytes = 4096;
    const issues = recipeApplyConfigurationIssues(config(), applyRecipes, environment).join(" "); expect(issues).toContain("codifica testo"); expect(issues).toContain("qualità esplicita"); expect(issues).toContain("limite messaggio");
    connection.enabled = false; expect(recipeApplyConfigurationIssues(config(), applyRecipes, environment).join(" ")).toContain("stessa connessione PLC attiva");
  });
  it("validates explicit OPC UA node write consent without a protocol-specific shortcut", () => {
    const environment = recipeApplyEnvironment(applySnapshot()); environment.connections.connections = [{ id: "ua", protocol: "opcua", enabled: true, url: "opc.tcp://127.0.0.1:4840", allowInsecure: true, securityMode: "None", securityPolicy: "None", allowWrites: true, bindings: [{ tag: "Request", namespaceUri: "urn:synthetic", nodeId: "s=request" }, { tag: "Response", namespaceUri: "urn:synthetic", nodeId: "s=response" }] }];
    expect(recipeApplyConfigurationIssues(config(), applyRecipes, environment).join(" ")).toContain("scrittura del nodo richiesta"); const connection = environment.connections.connections[0]; if (connection.protocol !== "opcua") throw Error("fixture"); connection.bindings[0].writeEnabled = true; expect(recipeApplyConfigurationIssues(config(), applyRecipes, environment)).toEqual([]);
  });
  it("rejects invalid budgets and sharing incompatible channel definitions", () => {
    const environment = recipeApplyEnvironment(applySnapshot()), invalid = config(); Object.assign(invalid.schemas[0], { channelId: "", maxPayloadBytes: 254, maxAgeMs: NaN, prepareTimeoutMs: 20001, stageLifetimeMs: 1000 });
    const issues = recipeApplyConfigurationIssues(invalid, applyRecipes, environment).join(" "); for (const text of ["ID canale", "capacità richiesta", "età massima", "attese", "durata preparazione"]) expect(issues).toContain(text);
    const shared = config(); shared.schemas.push(Object.fromEntries(Object.entries({ ...shared.schemas[0], schemaId: "other" }).reverse()) as typeof shared.schemas[0]); expect(recipeApplyConfigurationIssues(shared, applyRecipes, environment)).toEqual([]); shared.schemas[1].maxAgeMs++; expect(recipeApplyConfigurationIssues(shared, applyRecipes, environment).join(" ")).toContain("Canali incompatibili");
  });
  it("preserves orphan profiles and never includes corrupt files or inline secrets in errors", () => {
    const environment = recipeApplyEnvironment(applySnapshot()); expect(recipeApplyConfigurationIssues(config(), { version: 1, schemas: [] }, environment).join(" ")).toContain("Schema mancante");
    for (const source of ["SYNTHETIC_PRIVATE_BROKEN", '{"version":1,"connections":[],"password":"SYNTHETIC_PRIVATE_SECRET"}']) { try { recipeApplyEnvironment(applySnapshot({ connections: source })); throw Error("Expected failure"); } catch (error) { expect(String(error)).not.toContain("SYNTHETIC_PRIVATE"); } }
    expect(recipeApplyConfigurationError(new Error("Command read_recipe_apply_configuration not found"))).toContain("build aggiornata");
  });
});
