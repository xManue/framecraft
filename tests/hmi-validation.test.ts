import { describe, expect, it } from "vitest";
import { describeHmiIssues, validateHmiProject } from "../src/core/hmiValidation";
import { standardProjectFiles, standardProjectSectionChoices } from "../src/core/standardProject";
import type { PlcVariableDefinition } from "../src/core/plcVariables";
import { emptyHmiResourceCatalog } from "../src/core/hmiResources";
import { parseHmiScriptCatalog } from "../src/core/hmiScriptModules";
import { standardHmiFaceplateCatalog } from "../src/core/hmiFaceplates";
import { defaultHmiTrendConfig, serializeHmiTrendConfig } from "../src/core/hmiTrend";

const tag = (name: string): PlcVariableDefinition => ({ name, dataType: "Int", access: "read", address: "%DB1.DBW0", description: "" });

describe("controllo del pannello prima del salvataggio", () => {
  it("controlla i tag di inizializzazione e delle funzioni che leggono export di altri moduli", () => {
    const scripts = parseHmiScriptCatalog({
      globalModules: [
        { name: "Source", alias: "Source", globalDefinition: { source: "export const speed = Tags('Speed');" }, functions: [] },
        { name: "Reader", alias: "Reader", globalDefinition: { source: "const privateTag = Modules.Source.speed; const initial = Tags('Startup.Module').Read();" }, functions: [{ name: "Read", parameters: [], source: "return privateTag.Read();" }] },
      ],
      localDefinitions: [{ scope: "/settings", context: "events", globalDefinition: { source: "const initial = Tags('Startup.Local').Read();" }, functions: [] }],
      schedulerDefinition: { source: "const initial = Tags('Startup.Scheduler').Read();" },
    });
    const sources = { "src/Page.tsx": "export const Page = () => <main />" };
    const issues = validateHmiProject({ sources, scripts, variables: [tag("Known")] });
    for (const name of ["Speed", "Startup.Module", "Startup.Local", "Startup.Scheduler"]) expect(issues.some((item) => item.kind === "tag-undeclared" && item.file === "framecraft.scripts.json" && item.message.includes(`\"${name}\"`))).toBe(true);
    expect(validateHmiProject({ sources, scripts, variables: ["Speed", "Startup.Module", "Startup.Local", "Startup.Scheduler"].map(tag) })).toEqual([]);
  });

  it("trova i tag letti dagli export e rifiuta le variabili private negli eventi", () => {
    const scripts = parseHmiScriptCatalog({ globalModules: [{ name: "Values", alias: "Values", functions: [], globalDefinition: { source: "export const source = Tags(\"Speed\"); let secret = 42;" } }] });
    const dynamization = JSON.stringify([{ property: "Text", kind: "Script", source: "return Modules.Values.source.Read();" }]);
    const event = JSON.stringify([{ event: "Tapped", script: "HMIRuntime.Trace(Modules.Values.secret);" }]);
    const issues = validateHmiProject({
      sources: { "src/Page.tsx": `<span data-hmi-dynamizations='${dynamization}' />\n<button data-hmi-events='${event}' />` },
      variables: [tag("Known")], scripts,
    });
    expect(issues.some((item) => item.kind === "tag-undeclared" && item.line === 1 && item.message.includes("Speed"))).toBe(true);
    expect(issues.some((item) => item.kind === "script-invalid" && item.line === 1)).toBe(false);
    expect(issues.some((item) => item.kind === "event-invalid" && item.line === 2 && item.message.includes("non esportata"))).toBe(true);
  });

  it("controlla sintassi, route e tag usati dai moduli JavaScript", () => {
    const scripts = parseHmiScriptCatalog({
      globalModules: [{ name: "Commands", alias: "Commands", functions: [{ name: "Start", parameters: [], source: 'Tags("Missing.Command").Write(true);' }] }],
      localDefinitions: [{ scope: "/missing-page", context: "events", functions: [{ name: "Broken", parameters: [], source: "return document.cookie;" }] }],
      scheduledTasks: [{ id: "watch", name: "Controllo", trigger: { kind: "tag", tag: "Missing.Trigger", condition: "changed" }, script: "Modules.Commands.Start();" }],
    });
    const issues = validateHmiProject({
      sources: { "src/Page.tsx": "export const Page = () => <main />" },
      variables: [{ name: "Known", dataType: "Bool", address: "%M0.0", access: "read-write", description: "" }],
      routes: ["/"],
      scripts,
    });
    expect(issues.some((item) => item.kind === "script-invalid" && item.message.includes("Broken"))).toBe(true);
    expect(issues.some((item) => item.kind === "script-invalid" && item.message.includes("/missing-page"))).toBe(true);
    expect(issues.some((item) => item.kind === "tag-undeclared" && item.message.includes("Missing.Command"))).toBe(true);
    expect(issues.some((item) => item.kind === "tag-undeclared" && item.message.includes("Missing.Trigger"))).toBe(true);
  });
  it("segnala i tag mancanti nelle strutture restituite dai moduli, non i riferimenti privati inutilizzati", () => {
    const scripts = parseHmiScriptCatalog({ globalModules: [{
      name: "Data", alias: "Data",
      globalDefinition: { source: "const cfg = { sources: [Tags('Speed'), Tags('Backup')] }; const unused = Tags('Unused');" },
      functions: [{ name: "Get", parameters: [], source: "return cfg;" }],
    }] });
    const dynamics = JSON.stringify([{ property: "Text", kind: "Script", source: 'const cfg = Modules.Data.Get(); return cfg.sources[Tags("Index").Read()].Read();' }]);
    const issues = validateHmiProject({ sources: { "src/Page.tsx": "<span data-hmi-dynamizations='" + dynamics + "' />" }, variables: [tag("Known")], scripts });
    for (const name of ["Speed", "Backup", "Index"]) expect(issues.some((issue) => issue.kind === "tag-undeclared" && issue.message.includes(name))).toBe(true);
    expect(issues.some((issue) => issue.kind === "tag-undeclared" && issue.message.includes("Unused"))).toBe(false);
    expect(issues.some((issue) => issue.kind === "script-invalid")).toBe(false);
  });
  it("dice quale tag manca e quale nessuno ha dichiarato", () => {
    const issues = validateHmiProject({
      sources: {
        "src/pages/Una.tsx": [
          '<span data-plc-variable="Motore.Velocita" />',
          '<span data-plc-variable="" />',
          '<span data-plc-variable="Motore.Corrente" />',
        ].join("\n"),
      },
      variables: [tag("Motore.Velocita")],
    });
    expect(issues.map((issue) => [issue.kind, issue.line, issue.severity])).toEqual([
      ["tag-missing", 2, "warning"],
      ["tag-undeclared", 3, "warning"],
    ]);
    expect(issues[1].message).toContain('"Motore.Corrente"');
  });

  it("senza catalogo PLC non accusa nessun tag", () => {
    const sources = { "src/pages/Una.tsx": '<span data-plc-variable="Motore.Velocita" />' };
    expect(validateHmiProject({ sources })).toEqual([]);
  });

  it("trova le dinamiche lasciate a meta'", () => {
    const dynamization = (items: unknown) => `<div data-hmi-dynamizations='${JSON.stringify(items)}' />`;
    const issues = validateHmiProject({
      sources: {
        "src/pages/Una.tsx": [
          dynamization([{ property: "Left", kind: "Tag", tag: "Pack.Pos_X" }]),
          dynamization([{ property: "Top", kind: "Tag", tag: "  " }]),
          dynamization([{ property: "Visible", kind: "Script" }]),
          dynamization([{ property: "Fill", kind: "Tag", tag: "Pack.Pos_X", conditionType: "Range", entries: [{ value: "#FF0000" }] }]),
          dynamization([{ kind: "Tag", tag: "Pack.Pos_X" }]),
          "<div data-hmi-dynamizations='[{' />",
        ].join("\n"),
      },
      variables: [tag("Pack.Pos_X")],
    });
    expect(issues.map((issue) => issue.line)).toEqual([2, 3, 4, 5, 6]);
    expect(issues.every((issue) => issue.kind === "dynamization-incomplete" && issue.severity === "error")).toBe(true);
    expect(issues[0].message).toContain("da quale tag");
    expect(issues[1].message).toContain("Script");
    expect(issues[2].message).toContain("soglia");
    expect(issues[4].message).toContain("JSON");
  });

  it("valida sintassi e tag delle espressioni", () => {
    const dynamization = (items: unknown) => `<div data-hmi-dynamizations='${JSON.stringify(items)}' />`;
    const issues = validateHmiProject({
      sources: {
        "src/pages/Una.tsx": [
          dynamization([{ property: "Visible", kind: "Expression", source: "Machine.Ready AND (" }]),
          dynamization([{ property: "Enabled", kind: "Expression", source: "Machine.Ready AND Safety.Ok" }]),
          dynamization([{ property: "BackColor", kind: "Tag", tag: "Temperature", conditionType: "Expression", entries: [{ condition: "value >= HighLimit", value: "red" }] }]),
        ].join("\n"),
      },
      variables: [tag("Machine.Ready"), tag("Temperature"), tag("HighLimit")],
    });
    expect(issues.map((issue) => [issue.kind, issue.line])).toEqual([
      ["dynamization-incomplete", 1],
      ["tag-undeclared", 2],
    ]);
    expect(issues[0].message).toContain("espressione");
    expect(issues[1].message).toContain("Safety.Ok");
  });

  it("controlla colori, contrasto, tag e limiti del lampeggio", () => {
    const dynamization = (items: unknown) => `<div data-hmi-dynamizations='${JSON.stringify(items)}' />`;
    const issues = validateHmiProject({
      sources: { "src/pages/Flashing.tsx": [
        dynamization([{ property: "BackColor", kind: "Flashing", color: "#FF000000", alternateColor: "#FF000000", flashingCondition: "Always" }]),
        dynamization([{ property: "BorderColor", kind: "Flashing", color: "#FFFF0000", alternateColor: "#FF000000", flashingCondition: "RangeViolation", tag: "Missing.Temperature", minimum: 90, maximum: 20 }]),
        dynamization([{ property: "ForeColor", kind: "Flashing", color: "#777777", alternateColor: "#888888", flashingCondition: "Always" }]),
      ].join("\n") },
      variables: [tag("Known")],
    });
    expect(issues.map((issue) => [issue.kind, issue.line, issue.severity])).toEqual([
      ["dynamization-incomplete", 1, "error"],
      ["tag-undeclared", 2, "warning"],
      ["dynamization-incomplete", 2, "error"],
      ["dynamization-incomplete", 3, "warning"],
    ]);
    expect(issues[0].message).toContain("due colori uguali");
    expect(issues[1].message).toContain("Missing.Temperature");
    expect(issues[2].message).toContain("minimo maggiore");
    expect(issues[3].message).toContain("contrasto");
  });

  it("controlla tipo, versione e mapping delle istanze faceplate", () => {
    const faceplate = (binding: unknown) => `<div data-hmi-type="HmiFaceplateContainer" data-hmi-faceplate='${JSON.stringify(binding)}' />`;
    const issues = validateHmiProject({
      sources: { "src/pages/Faceplates.tsx": [
        faceplate({ typeId: "pack", version: "0.0.8", tagBindings: { Width: "Pack.Width", Height: "Pack.Height", Group_Nr: "Pack.Group", Group_Selected: "Pack.Selected" }, propertyValues: {} }),
        faceplate({ typeId: "pack", version: "9.9.9", tagBindings: {}, propertyValues: {} }),
      ].join("\n") },
      variables: [
        { ...tag("Pack.Width"), dataType: "Int" }, { ...tag("Pack.Height"), dataType: "Bool" },
        { ...tag("Pack.Group"), dataType: "Int" }, { ...tag("Pack.Selected"), dataType: "Int" },
      ],
      faceplates: standardHmiFaceplateCatalog(),
    });
    expect(issues.map((issue) => [issue.kind, issue.line, issue.severity])).toEqual([
      ["faceplate-invalid", 1, "error"],
      ["faceplate-invalid", 2, "error"],
    ]);
    expect(issues[0].message).toContain("Pack.Height");
    expect(issues[1].message).toContain("non trovato");
  });

  it("controlla configurazione, assi, soglie e tag del Trend Control", () => {
    const config = defaultHmiTrendConfig();
    config.leftAxis = { scale: "linear", minimum: 100, maximum: 0 };
    config.trends[0] = { ...config.trends[0], tag: "Missing.Temperature", lowThreshold: 90, highThreshold: 20 };
    const issues = validateHmiProject({
      sources: { "src/pages/Trend.tsx": `<div data-hmi-type="HmiTrendControl" data-hmi-trend='${serializeHmiTrendConfig(config)}' />` },
      variables: [tag("Known")],
    });
    expect(issues.filter((issue) => issue.kind === "trend-invalid")).toHaveLength(3);
    expect(issues.some((issue) => issue.message.includes("Missing.Temperature"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("soglia bassa"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Asse sinistro"))).toBe(true);
  });

  it("controlla script, trigger e cicli prima del Runtime", () => {
    const dynamization = (items: unknown) => `<div data-hmi-dynamizations='${JSON.stringify(items)}' />`;
    const issues = validateHmiProject({
      sources: { "src/pages/Script.tsx": [
        dynamization([{ property: "Visible", kind: "Script", source: "while (true) {}", triggers: ["Ready"] }]),
        dynamization([{ property: "Visible", kind: "Script", source: 'Tags("Ready").Read();', triggers: ["Ready"] }]),
        dynamization([{ property: "BackColor", kind: "Script", source: 'Tags("Ready").Write(1); return "red";', triggers: ["Ready"] }]),
        dynamization([{ property: "Text", kind: "Script", source: 'return Tags("Missing").Read();' }]),
        dynamization([{ property: "Text", kind: "Script", source: 'let tags = Tags.CreateTagSet(["Ready"]); tags.ReadAsync().then(function(result) { HMIRuntime.Trace(result("Ready").Value); }); return "attesa";', triggers: ["Ready"] }]),
      ].join("\n") },
      variables: [tag("Ready")],
    });
    expect(issues.map((issue) => [issue.kind, issue.line])).toEqual([
      ["script-invalid", 1],
      ["script-invalid", 2],
      ["script-trigger-loop", 3],
      ["tag-undeclared", 4],
      ["script-invalid", 5],
    ]);
  });

  it("controlla gli script locali degli eventi", () => {
    const event = (items: unknown) => `<button data-hmi-events='${JSON.stringify(items)}' />`;
    const issues = validateHmiProject({
      sources: { "src/pages/Eventi.tsx": [
        event([{ event: "Tapped", script: 'Tags("Command").Write(1);' }]),
        event([{ event: "Tapped", script: 'fetch("/api")' }]),
        event([{ event: "Ignoto", script: "return 1" }]),
      ].join("\n") },
      variables: [tag("Ready")],
    });
    expect(issues.map((issue) => [issue.kind, issue.line])).toEqual([
      ["tag-undeclared", 1],
      ["event-invalid", 2],
      ["event-invalid", 3],
    ]);
  });

  it("controlla tag, tipo e traduzioni delle liste risorse", () => {
    const dynamization = (items: unknown) => `<div data-hmi-dynamizations='${JSON.stringify(items)}' />`;
    const resources = {
      ...emptyHmiResourceCatalog(),
      languages: ["it-IT", "en-US"],
      textLists: [{ name: "MachineState", rangeType: "Decimal" as const, entries: [
        { id: "idle", type: "SingleValue" as const, fromValue: 0, texts: { "it-IT": "Ferma" } },
      ] }],
    };
    const issues = validateHmiProject({
      sources: { "src/pages/Una.tsx": [
        dynamization([{ property: "Text", kind: "ResourceList", source: "MachineState", tag: "Machine.State" }]),
        dynamization([{ property: "Graphic", kind: "ResourceList", source: "MachineState", tag: "Machine.State" }]),
        dynamization([{ property: "Text", kind: "ResourceList", source: "Missing", tag: "" }]),
      ].join("\n") },
      variables: [tag("Machine.State")],
      resources,
    });
    expect(issues.map((issue) => [issue.kind, issue.line, issue.severity])).toEqual([
      ["translation-missing", 1, "warning"],
      ["resource-list-missing", 2, "error"],
      ["translation-missing", 2, "warning"],
      ["dynamization-incomplete", 3, "error"],
      ["resource-list-missing", 3, "error"],
    ]);
  });

  it("controlla chiavi e copertura dei testi statici multilingua", () => {
    const resources = {
      ...emptyHmiResourceCatalog(),
      languages: ["it-IT", "en-US"],
      multilingualTexts: [{ key: "Page.Title", texts: { "it-IT": "Impostazioni" } }],
    };
    const issues = validateHmiProject({
      sources: { "src/pages/Una.tsx": '<h1 data-hmi-text="Page.Title">Titolo</h1>\n<span data-hmi-text="Missing">Altro</span>' },
      resources,
    });
    expect(issues.map((issue) => [issue.kind, issue.line, issue.severity])).toEqual([
      ["translation-missing", 1, "warning"],
      ["multilingual-text-missing", 2, "error"],
    ]);
  });

  it("segnala due pagine con lo stesso numero, e nomina entrambe", () => {
    const issues = validateHmiProject({
      sources: {
        "src/pages/Prima.tsx": '<section data-page-number={2001} />',
        "src/pages/Seconda.tsx": '\n<section data-page-number={2001} />',
        "src/pages/Terza.tsx": '<section data-page-number={2002} />',
      },
    });
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => [issue.file, issue.line])).toEqual([["src/pages/Prima.tsx", 1], ["src/pages/Seconda.tsx", 2]]);
    expect(issues[0].message).toContain("Prima.tsx, Seconda.tsx");
  });

  it("segnala il pulsante che porta dove non c'e' niente, e tace se il router non si conosce", () => {
    const sources = { "src/pages/Una.tsx": 'onClick={() => openPage("/settings/mancante")}\nonClick={() => openPage("/settings")}' };
    expect(validateHmiProject({ sources })).toEqual([]);
    const issues = validateHmiProject({ sources, routes: ["/settings"] });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("navigation-dangling");
    expect(issues[0].message).toContain('"/settings/mancante"');
  });

  it("il pannello standard appena generato non ha errori", () => {
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: standardProjectSectionChoices.map((section) => section.id) });
    const sources = Object.fromEntries(files.filter((file) => /\.tsx$/.test(file.path)).map((file) => [file.path, file.content]));
    const routes = [...files.find((file) => file.path.endsWith("App.tsx"))!.content.matchAll(/<Route path="([^"]*)"/g)].map((match) => match[1]);
    const issues = validateHmiProject({ sources, routes });
    const count = (kind: string) => issues.filter((issue) => issue.kind === kind).length;
    expect({ dinamiche: count("dynamization-incomplete"), numeri: count("page-number-duplicate"), navigazione: count("navigation-dangling") }).toEqual({ dinamiche: 0, numeri: 0, navigazione: 0 });
    // Restano solo avvisi, e sono i campi che lo standard disegna lasciando il tag alla macchina:
    // e' la lista di cosa collegare, non un difetto del pannello.
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(count("tag-missing")).toBeGreaterThan(100);
  });

  it("riassume in una riga", () => {
    expect(describeHmiIssues([])).toBe("Controllo HMI: nessun problema.");
    const issues = validateHmiProject({
      sources: { "src/pages/Una.tsx": '<span data-plc-variable="" />\n<span data-plc-variable="Ignoto" />' },
      variables: [tag("Noto")],
    });
    expect(describeHmiIssues(issues)).toBe("Controllo HMI: 2 avvisi.");
  });
});
