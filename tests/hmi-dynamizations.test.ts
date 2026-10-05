import { describe, expect, it } from "vitest";
import { availableDynamizedProperties, hmiDynamizationAttribute, newHmiDynamization, parseHmiDynamizations, removeHmiDynamization, replaceHmiDynamization, serializeHmiDynamizations } from "../src/core/hmiDynamizations";
import { parseSource } from "../src/source-parser/parseSource";
import { updateStaticAttributes } from "../src/source-parser/transformSource";

describe("dinamiche HMI", () => {
  it("legge e riscrive tag, soglie e valori senza perdere il contratto", () => {
    const items = parseHmiDynamizations(JSON.stringify([
      { property: "BackColor", kind: "Tag", tag: "Machine.State", conditionType: "Range", entries: [{ from: 0, to: 2, value: "#808080" }, { from: 3, to: 3, value: "#00A1D1" }] },
      { property: "Visible", kind: "Expression", source: "Machine.Enabled && User.CanOperate" },
    ]));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ property: "BackColor", tag: "Machine.State" });
    expect(items[0].entries?.[0]).toEqual({ from: 0, to: 2, value: "#808080" });
    expect(parseHmiDynamizations(serializeHmiDynamizations(items))).toEqual(items);
  });

  it("ignora configurazioni rotte invece di rompere l'Inspector", () => {
    expect(parseHmiDynamizations("non-json")).toEqual([]);
    expect(parseHmiDynamizations([{ property: "" }, null, 3])).toEqual([]);
  });

  it("compila script, trigger e ciclo nel contratto consegnato al Runtime", () => {
    const raw = serializeHmiDynamizations([{
      property: "BackColor", kind: "Script", conditionType: "None",
      source: 'return Tags("Machine.State").Read() === 1 ? "#FF00A1D1" : "#FF808080";',
      triggers: ["Machine.State", " Machine.State "], cycleMs: 250,
    }]);
    const [item] = parseHmiDynamizations(raw);
    expect(item.triggers).toEqual(["Machine.State"]);
    expect(item.cycleMs).toBe(250);
    expect(item.scriptTags).toEqual({ read: ["Machine.State"], written: [] });
    expect(item.program).toMatchObject({ version: 1 });
    expect(raw).toContain('"program":{"version":1');
  });

  it("conserva colori, condizione, frequenza e limiti del lampeggio Unified", () => {
    const raw = serializeHmiDynamizations([{
      property: "BorderColor", kind: "Flashing", conditionType: "None",
      color: "#FFFF0000", alternateColor: "#FF000000",
      flashingCondition: "RangeViolation", flashingRate: "Fast",
      tag: "Temperature", minimum: 10, maximum: 80,
    }]);
    const [item] = parseHmiDynamizations(raw);
    expect(item).toEqual({
      property: "BorderColor", kind: "Flashing", conditionType: "None",
      color: "#FFFF0000", alternateColor: "#FF000000",
      flashingCondition: "RangeViolation", flashingRate: "Fast",
      tag: "Temperature", minimum: 10, maximum: 80,
    });
  });

  it("aggiunge, sostituisce e rimuove una proprietà soltanto", () => {
    const first = newHmiDynamization("BackColor", "Machine.State");
    const items = [first, newHmiDynamization("Visible", "Machine.Enabled")];
    const changed = replaceHmiDynamization(items, 0, { ...first, conditionType: "Singlebit", entries: [{ condition: "0", value: "#00A1D1" }] });
    expect(changed[0].conditionType).toBe("Singlebit");
    expect(changed[1]).toEqual(items[1]);
    expect(removeHmiDynamization(changed, 0)).toEqual([items[1]]);
    expect(availableDynamizedProperties(items)).not.toContain("BackColor");
  });

  it("resta un attributo statico leggibile dopo la modifica del JSX", () => {
    const source = `export function Page(){return <button type="button">Avvia</button>}`;
    const node = Object.values(parseSource("Page.tsx", source).nodes).find((item) => item.type === "button")!;
    const value = serializeHmiDynamizations([{ property: "BackColor", kind: "Tag", tag: "Machine.Ready", conditionType: "Singlebit", entries: [{ condition: "0", value: "#00A1D1" }] }]);
    const updated = updateStaticAttributes(source, node.source.start, node.source.end, { [hmiDynamizationAttribute]: value });
    const updatedButton = Object.values(parseSource("Page.tsx", updated).nodes).find((item) => item.type === "button")!;
    expect(updatedButton.props[hmiDynamizationAttribute]).toBe(value);
    expect(parseHmiDynamizations(updatedButton.props[hmiDynamizationAttribute])[0].tag).toBe("Machine.Ready");
  });
});
