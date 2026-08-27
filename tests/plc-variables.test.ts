import { describe, expect, it } from "vitest";
import { detectPlcVariables, mergePlcVariables, parsePlcCatalog, plcVariableIssues, renamePlcVariableUsage, serializePlcCatalog } from "../src/core/plcVariables";

describe("PLC variable catalog", () => {
  it("detects only explicit PLC/HMI variable usages", () => {
    const variables = detectPlcVariables({
      "App.jsx": `const speed = hmi.value("Machine.Speed"); plc.write('Commands.Start', true); const label = "Ignore.Me";`,
      "Status.jsx": `<output data-plc-variable="Machine.Speed" />`,
    });
    expect(variables.map((item) => item.name)).toEqual(["Commands.Start", "Machine.Speed"]);
    expect(variables.find((item) => item.name === "Machine.Speed")?.usages).toHaveLength(2);
    expect(variables.find((item) => item.name === "Commands.Start")?.access).toBe("write");
  });

  it("merges configured metadata with detected usage and reports missing PLC fields", () => {
    const detected = detectPlcVariables({ "App.jsx": `hmi.value("Machine.Speed")` });
    const merged = mergePlcVariables([{
      name: "Machine.Speed", dataType: "REAL", access: "read", address: "ns=3;s=DB_HMI.Speed", description: "Velocità linea",
    }], detected);
    expect(merged[0].usages).toHaveLength(1);
    expect(plcVariableIssues(merged[0])).toEqual([]);
    expect(plcVariableIssues({ ...merged[0], address: "" })).toContain("Indirizzo PLC mancante");
  });

  it("round-trips the catalog and renames only recognized variable usages", () => {
    const variables = [{ name: "Machine.Speed", dataType: "REAL", access: "read" as const, address: "DB1.Speed", description: "" }];
    expect(parsePlcCatalog(serializePlcCatalog(variables))).toEqual(variables);
    const source = `hmi.value("Machine.Speed"); const untouched = "Machine.Speed"; <div data-plc-tag='Machine.Speed' />`;
    const renamed = renamePlcVariableUsage(source, "Machine.Speed", "Line.Speed");
    expect(renamed).toContain(`hmi.value("Line.Speed")`);
    expect(renamed).toContain(`const untouched = "Machine.Speed"`);
    expect(renamed).toContain(`data-plc-tag='Line.Speed'`);
  });
});
