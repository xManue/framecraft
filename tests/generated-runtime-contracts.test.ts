import { parse } from "@babel/parser";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";
import { standardProjectFiles } from "../src/core/standardProject";

const source = standardProjectFiles({ machineName: "Synthetic contracts", layout: "desktop", sections: ["main"] }).find(file => file.path === "src/framecraftHmiRuntime.ts")!.content;
const declaration = parse(source, { sourceType: "module", plugins: ["typescript"] }).program.body.find(node => node.type === "FunctionDeclaration" && node.id?.name === "scriptWriteEntries")!;
const javascript = transpileModule(source.slice(declaration.start!, declaration.end!) + "\nexport const entries = scriptWriteEntries;", { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
const exports: { entries?: (result: { writes: object }) => [string, string][] } = {};
new Function("exports", javascript)(exports);

describe("contratti del Runtime generato", () => {
  it("mantiene i valori stringa previsti dall’esecutore IR senza conversioni implicite", () => {
    expect(exports.entries!({ writes: { Flag: "true", Value: "12", Empty: "" } })).toEqual([["Flag", "true"], ["Value", "12"], ["Empty", ""]]);
  });
  it("rifiuta un lotto invalido prima di applicare anche la prima scrittura valida", () => {
    const applied: [string, string][] = [];
    expect(() => { for (const entry of exports.entries!({ writes: { Valid: "1", Invalid: { value: "secret-test-value" } } })) applied.push(entry); }).toThrow("nessun valore applicato");
    expect(applied).toEqual([]);
  });
});
