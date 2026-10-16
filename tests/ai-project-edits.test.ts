import { expect, it } from "vitest";
import { aiProjectPath, appendAiVariables, assertAiSourceShareable, parseAiProjectPlan, prepareAiProjectChanges, validateAiProjectCode, type AiProjectPlan } from "../src/ai/aiProjectEdits";

const plan = (update: Partial<AiProjectPlan> = {}): AiProjectPlan => ({ summary: "Collega la velocità", questions: [], warnings: [], reads: [], edits: [], variables: [], ...update });
const source = 'import { HeaderValue, HeaderGauge } from "./Header"; const headerConfig={version:1,tags:{}}; export const Page=()=> <section><HeaderValue field="speed" config={headerConfig}/><HeaderGauge config={headerConfig}/></section>';
const before = 'const headerConfig={version:1,tags:{}}';
const after = 'const headerConfig={version:1,tags:{speed:"Panel_Speed"}}';
const variable = { name: "Panel_Speed", dataType: "REAL", description: "Velocità da collegare alla macchina" };

it("prepara modifiche header e variabile mancante con soli dati sintetici locali", () => {
  const proposal = parseAiProjectPlan(JSON.stringify(plan({ edits: [{ path: "src/App.tsx", before, after }], variables: [variable] })));
  const changes = prepareAiProjectChanges(proposal, new Map<string, string | null>([["src/App.tsx", source], ["framecraft.plc.json", null]]), new Map([["src/App.tsx", [source]]]), ["src/App.tsx", "src/Header.tsx"]);
  expect(changes).toHaveLength(2); expect(changes[0].after).toContain('tags:{speed:"Panel_Speed"}'); expect(changes[0].after).toContain("<HeaderGauge");
  expect(JSON.parse(changes[1].after).variables[0]).toMatchObject({ ...variable, access: "read", address: "" });
  expect(JSON.parse(changes[1].after).variables[0]).not.toHaveProperty("connection");
});
it.each(["../src/App.tsx", "src/../../x.ts", "/src/App.tsx", "src\\App.tsx", "src/.env.ts", "src/secret.ts", "src/token.ts", "src/CON.ts", "src/lpt1.js", "src/node_modules/x.js", "package.json", "framecraft.connections.json", "src/a.ts "])("rifiuta percorsi protetti %s", path => {
  expect(aiProjectPath(path)).toBe(false); expect(() => parseAiProjectPlan(JSON.stringify(plan({ edits: [{ path, before: "a", after: "b" }] })))).toThrow();
});
it("mantiene campi, indirizzi e proprietà extra del catalogo sintetico esistente", () => {
  const old = { version: 1, custom: "keep", variables: [{ name: "Existing", dataType: "REAL", access: "read-write", address: "synthetic-address", connection: "ExistingConnection", custom: 42 }] };
  const next = JSON.parse(appendAiVariables(JSON.stringify(old), [variable]));
  expect(next.custom).toBe("keep"); expect(next.variables[0]).toEqual(old.variables[0]); expect(next.variables[1].address).toBe("");
});
it("rifiuta variabili duplicate, tipi sconosciuti e riscrittura del catalogo", () => {
  expect(() => parseAiProjectPlan(JSON.stringify(plan({ variables: [variable, variable] })))).toThrow("duplicate");
  expect(() => parseAiProjectPlan(JSON.stringify(plan({ variables: [{ ...variable, dataType: "UDT" }] })))).toThrow();
  expect(() => parseAiProjectPlan(JSON.stringify(plan({ edits: [{ path: "framecraft.plc.json", before: "x", after: "y" }] })))).toThrow("catalogo reale");
  expect(() => appendAiVariables(JSON.stringify({ variables: [variable] }), [{ ...variable, name: "panel_speed" }])).toThrow("esiste già");
});
it("rifiuta file non letti o modifiche esterne al frammento disponibile", () => {
  const proposal = plan({ edits: [{ path: "src/App.tsx", before, after }] });
  expect(() => prepareAiProjectChanges(proposal, new Map(), new Map(), [])).toThrow("leggere");
  expect(() => prepareAiProjectChanges(proposal, new Map([["src/App.tsx", source]]), new Map([["src/App.tsx", ["un altro frammento"]]]), [])).toThrow("fuori dal codice letto");
});
it("non sostituisce una stringa ambigua in più componenti", () => {
  const input = 'export const A=()=> <button>Avvia</button>;export const B=()=> <button>Avvia</button>';
  expect(() => prepareAiProjectChanges(plan({ edits: [{ path: "src/App.tsx", before: "Avvia", after: "Start" }] }), new Map([["src/App.tsx", input]]), new Map([["src/App.tsx", [input]]]), [])).toThrow("non è unico");
});
it("permette un componente nuovo solo dopo verifica di assenza", () => {
  const value = plan({ edits: [{ path: "src/Widget.tsx", before: "", after: "export const Widget=()=> <span/>" }] });
  expect(prepareAiProjectChanges(value, new Map([["src/Widget.tsx", null]]), new Map(), [])[0].before).toBeNull();
  expect(() => prepareAiProjectChanges(value, new Map([["src/Widget.tsx", "existing"]]), new Map(), [])).toThrow();
});
it("rifiuta errori sintattici e nuove dipendenze e controlla i nuovi import", () => {
  expect(() => validateAiProjectCode("src/App.tsx", source, "export const Page=()=> <", new Set())).toThrow();
  expect(() => validateAiProjectCode("src/New.tsx", null, 'import x from "uninstalled";export const X=()=>null', new Set())).toThrow("dipendenza");
  expect(() => validateAiProjectCode("src/New.tsx", null, 'import {H} from "./Missing";export const X=()=> <H/>', new Set())).toThrow("non risolvibile");
  expect(() => validateAiProjectCode("src/New.tsx", null, 'import {H} from "./Header";export const X=()=> <H/>', new Set(["src/Header.tsx"]))).not.toThrow();
});
it.each(['plc.write("Motor",true)', 'hmi.setpoint("Speed",100)', 'fetch("https://example.invalid")', 'eval("x")', 'new WebSocket("ws://example.invalid")'])("segnala nuove chiamate operative note %s", call => {
  expect(() => validateAiProjectCode("src/App.tsx", "export const A=()=>null", `export const A=()=>{${call};return null}`, new Set())).toThrow();
});
it("conserva un comando esistente ma segnala il suo spostamento fuori dal click", () => {
  const old = 'export const A=()=> <button onClick={()=>plc.write("Motor",true)}>Start</button>';
  expect(() => validateAiProjectCode("src/App.tsx", old, old.replace(">Start<", ">Avvia<"), new Set())).not.toThrow();
  expect(() => validateAiProjectCode("src/App.tsx", old, 'plc.write("Motor",true);export const A=()=>null', new Set())).toThrow();
});
it.each(['const password="synthetic-secret"', 'const API_KEY="synthetic-secret"', '-----BEGIN PRIVATE KEY-----'])("segnala forme note di credenziali nei dati sintetici %s", content => {
  expect(() => assertAiSourceShareable(content)).toThrow("credenziali");
});
it("lascia invariato il progetto se mancano letture o chiarimenti", () => {
  expect(() => parseAiProjectPlan(JSON.stringify(plan({ reads: [{ path: "src/Header.tsx", find: "HeaderGauge" }], variables: [variable] })))).toThrow("prima leggere");
  expect(prepareAiProjectChanges(plan({ questions: ["Quale unità?"], variables: [variable] }), new Map(), new Map(), [])).toEqual([]);
});
it("controlla CSS e non aggiunge risorse esterne", () => {
  expect(() => validateAiProjectCode("src/style.css", "a{}", "a{color:red}", new Set())).not.toThrow();
  expect(() => validateAiProjectCode("src/style.css", "a{}", "a{background:url(https://example.invalid/a.png)}", new Set())).toThrow("rete");
});
it("rivalida anche piani e variabili passati direttamente dalle API interne", () => {
  const malformed = plan({ edits: [{ path: "../outside.ts", before: "x", after: "y" }] });
  expect(() => prepareAiProjectChanges(malformed, new Map([["../outside.ts", "x"]]), new Map([["../outside.ts", ["x"]]]), [])).toThrow("protetto");
  expect(() => appendAiVariables(null, [{ ...variable, dataType: "UnknownType" }])).toThrow("tipo");
});
