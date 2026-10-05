// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSource } from "../src/source-parser/parseSource";
import { findArrayLiteral, replaceListItems } from "../src/source-parser/listData";
import { isPlcVariableName, parsePlcCatalog, plcVariableIssues, serializePlcCatalog } from "../src/core/plcVariables";
import { listRowsFromVariables, mergeImportedVariables, plcVariablesFromSheet, plcVariablesMatching, tagSheetOf } from "../src/core/tagImport";
import { readWorkbook, type WorkbookSheet } from "../src/core/workbook";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile },
}));
import { useEditorStore } from "../src/state/editorStore";

const fixture = resolve("tests/fixtures/hmi-tags.xlsx");

async function sheets(): Promise<WorkbookSheet[]> {
  const file = await readFile(fixture);
  return readWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
}

describe("reading a tag export", () => {
  it("opens the spreadsheet without a library and keeps every sheet", async () => {
    const workbook = await sheets();

    expect(workbook.map((sheet) => sheet.name)).toEqual(["Hmi Tags", "Substitute Value Usage"]);
    expect(workbook[0].rows[0].slice(0, 4)).toEqual(["Name", "Path", "Connection", "PLC tag"]);
    expect(workbook[0].rows).toHaveLength(5);
  });

  it("takes the sheet that holds the tags, not the one beside it", async () => {
    const sheet = tagSheetOf(await sheets());
    expect(sheet?.name).toBe("Hmi Tags");
  });

  it("maps the columns a panel exports and drops what the export means as empty", async () => {
    const { variables, skipped, withoutPlcTag } = plcVariablesFromSheet(tagSheetOf(await sheets())!);

    expect(variables.map((variable) => variable.name)).toEqual(["Alarms_Trigger", "Alarms_Data{1}_Active"]);
    const trigger = variables[0];
    expect(trigger.dataType).toBe("Bool");
    expect(trigger.address).toBe("PV_Cans.Alarm_Trigger");
    expect(trigger.table).toBe("Alarms");
    expect(trigger.connection).toBe("HMI_Connection");
    expect(trigger.cycle).toBe("T500ms");
    expect(trigger.description).toBe("Trigger lista allarmi");
    // `<No Value>` is how the export writes "nothing", and carrying it over would look like an address.
    expect(variables[1].description).toBe("");
    // A row the editor cannot use is reported, never silently dropped.
    expect(skipped).toEqual(["1_not_a_tag"]);
  });

  it("leaves out the tags the panel keeps to itself, the ones with no PLC tag", async () => {
    const sheet = tagSheetOf(await sheets())!;
    const { variables, withoutPlcTag } = plcVariablesFromSheet(sheet);

    // Machine.Speed is an internal HMI tag: it has an address of its own but nothing on the PLC side.
    expect(variables.map((variable) => variable.name)).not.toContain("Machine.Speed");
    expect(withoutPlcTag).toBe(1);
  });

  it("takes every row when the sheet has no PLC tag column to judge by", () => {
    const sheet = { name: "Fatto a mano", rows: [["Nome", "Indirizzo"], ["Machine.Speed", "%MD10"], ["Machine.Ready", "%M0.1"]] };
    const { variables, withoutPlcTag } = plcVariablesFromSheet(sheet);

    expect(variables.map((variable) => variable.name)).toEqual(["Machine.Speed", "Machine.Ready"]);
    expect(variables[0].address).toBe("%MD10");
    expect(withoutPlcTag).toBe(0);
  });

  it("accepts the names a real panel uses, dotted or not", () => {
    expect(isPlcVariableName("Alarms_Trigger")).toBe(true);
    expect(isPlcVariableName("Alarms_Data{1}_Active")).toBe(true);
    expect(isPlcVariableName("Machine.Speed")).toBe(true);
    expect(isPlcVariableName("1_not_a_tag")).toBe(false);
    expect(plcVariableIssues({ name: "Alarms_Trigger", dataType: "Bool", access: "read-write", address: "DB1.X", description: "" })).toEqual([]);
  });

  it("keeps what only the project knows when the same file is imported again", () => {
    const existing = [{ name: "Alarms_Trigger", dataType: "", access: "read" as const, address: "", description: "Scritta a mano" }];
    const imported = [
      { name: "Alarms_Trigger", dataType: "Bool", access: "read-write" as const, address: "DB1.Trigger", description: "Dal file", table: "Alarms" },
      { name: "Alarms_Reset", dataType: "Bool", access: "read-write" as const, address: "DB1.Reset", description: "", table: "Alarms" },
    ];

    const merged = mergeImportedVariables(existing, imported);

    expect(merged.added).toBe(1);
    expect(merged.updated).toBe(1);
    const trigger = merged.variables.find((variable) => variable.name === "Alarms_Trigger")!;
    expect(trigger.dataType).toBe("Bool");
    expect(trigger.address).toBe("DB1.Trigger");
    expect(trigger.description).toBe("Scritta a mano");
    expect(trigger.table).toBe("Alarms");
  });

  it("round-trips the tag table through the catalog file", () => {
    const variables = [{ name: "Alarms_Trigger", dataType: "Bool", access: "read-write" as const, address: "DB1.Trigger", description: "", table: "Alarms", cycle: "T500ms" }];
    expect(parsePlcCatalog(serializePlcCatalog(variables))).toEqual(variables);
  });
});

describe("filling a table from the catalog", () => {
  const catalog = [
    { name: "Alarms_Trigger", dataType: "Bool", access: "read-write" as const, address: "DB1.Trigger", description: "Trigger lista", table: "Alarms" },
    { name: "Alarms_Data{1}_Active", dataType: "Bool", access: "read-write" as const, address: "DB1.A1", description: "", table: "Alarms" },
    { name: "Machine.Speed", dataType: "Real", access: "read-write" as const, address: "%MD10", description: "Velocità", table: "Motors" },
  ];

  it("matches on the name and on the tag table, and on nothing when nothing is asked", () => {
    expect(plcVariablesMatching(catalog, "Alarm").map((variable) => variable.name)).toEqual(["Alarms_Trigger", "Alarms_Data{1}_Active"]);
    expect(plcVariablesMatching(catalog, "motors").map((variable) => variable.name)).toEqual(["Machine.Speed"]);
    expect(plcVariablesMatching(catalog, "  ")).toEqual([]);
  });

  it("writes the columns the table already has, and leaves the runtime ones empty", () => {
    const rows = listRowsFromVariables(plcVariablesMatching(catalog, "Alarm"), ["id", "category", "text", "time", "unitName"]);

    expect(rows[0]).toEqual({ id: "Alarms_Trigger", category: "", text: "Trigger lista", time: "", unitName: "Alarms" });
    // Without a description the name is the only honest label there is.
    expect(rows[1].text).toBe("Alarms_Data{1}_Active");
    // The row already names the signal, so no second key is invented for it.
    expect(rows[0].plcVariable).toBeUndefined();
  });

  it("keeps the signal reachable when no column names it", () => {
    const rows = listRowsFromVariables(catalog.slice(0, 1), ["label", "colore"]);
    expect(rows[0]).toEqual({ label: "Trigger lista", colore: "", plcVariable: "Alarms_Trigger" });
  });

  it("rewrites the array in place without breaking the file", () => {
    const source = `export const alarms = [\n  { id: "A-001", text: "Esempio" },\n];\n`;
    const array = findArrayLiteral(source, "alarms")!;
    const next = replaceListItems(source, array.start, array.end, [{ id: "Alarms_Trigger", text: "Trigger lista" }, { id: "X", text: "" }]);

    expect(next).toContain(`{ id: "Alarms_Trigger", text: "Trigger lista" }`);
    expect(findArrayLiteral(next, "alarms")!.items).toHaveLength(2);
    expect(next.startsWith("export const alarms = [")).toBe(true);
  });
});

describe("the alarm table of a panel", () => {
  const dataFile = "C:/p/src/alarmData.js";
  const pageFile = "C:/p/src/AlarmList.jsx";
  const data = `export const alarms = [
  { id: "A-001", category: "Warning", text: "Example active alarm", time: "10:24:12", unitName: "UN01" },
  { id: "A-002", category: "Safety", text: "Example safety condition", time: "10:26:48", unitName: "UN03" },
];
`;
  const page = `import { alarms } from "./alarmData";

export default function AlarmList() {
  return <div>{alarms.map((alarm) => <span key={alarm.id}>{alarm.text}</span>)}</div>;
}
`;
  const files: Record<string, string> = {};

  beforeEach(() => {
    files[dataFile] = data;
    files[pageFile] = page;
    bridge.readFile.mockReset().mockImplementation(async (file: string) => {
      if (files[file] == null) throw new Error(`nessun file ${file}`);
      return files[file];
    });
    bridge.writeFile.mockReset().mockImplementation(async (file: string, content: string) => { files[file] = content; });
    const document = parseSource(pageFile, page);
    const span = Object.values(document.nodes).find((node) => node.type === "span")!;
    useEditorStore.setState({
      document, selectedId: span.id, history: [], future: [], consoleEntries: [], lastError: undefined,
      project: undefined, editScope: "instance", listBinding: undefined, callSites: undefined,
      selectionInfo: { instanceIndex: 0, instanceCount: 2, listIndex: 0 },
      plcVariables: [
        { name: "Alarms_Trigger", dataType: "Bool", access: "read-write", address: "DB1.Trigger", description: "Trigger lista", table: "Alarms" },
        { name: "Alarms_Data{1}_Active", dataType: "Bool", access: "read-write", address: "DB1.A1", description: "", table: "Alarms" },
        { name: "Machine.Speed", dataType: "Real", access: "read-write", address: "%MD10", description: "Velocità", table: "Motors" },
      ],
    });
  });

  it("replaces the example rows with the alarm signals of the catalog", async () => {
    await useEditorStore.getState().fillListFromPlcVariables("Alarm");

    expect(useEditorStore.getState().lastError).toBeUndefined();
    const written = files[dataFile];
    expect(written).toContain(`id: "Alarms_Trigger"`);
    expect(written).toContain(`id: "Alarms_Data{1}_Active"`);
    expect(written).not.toContain("Example active alarm");
    const items = findArrayLiteral(written, "alarms")!.items;
    expect(items).toHaveLength(2);
    expect(items[0].properties.map((property) => property.name)).toEqual(["id", "category", "text", "time", "unitName"]);
    expect(items[0].properties.find((property) => property.name === "unitName")?.value).toBe("Alarms");
  });

  it("says so instead of emptying the table when nothing matches", async () => {
    await useEditorStore.getState().fillListFromPlcVariables("Pressione");

    expect(useEditorStore.getState().lastError).toContain("Nessuna variabile");
    expect(files[dataFile]).toBe(data);
  });
});
