import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import { componentRegistry } from "../src/components/registry";
import { standardShellComponentTypes } from "../src/core/hmiTemplateCoverage";
import { itemTypes } from "../src/core/hmiStandard";

describe("component library", () => {
  it("offers a complete categorized palette", () => {
    expect(componentRegistry.all().length).toBeGreaterThanOrEqual(50);
    expect(componentRegistry.categories()).toEqual(["Standard HMI", "HMI e PLC", "Base", "Layout", "Moduli", "Dati", "Web"]);
  });

  it("offre i pezzi dello standard, e ognuno dichiara in che oggetto Hmi* diventerà", () => {
    const standard = componentRegistry.all().filter((item) => item.category === "Standard HMI");
    expect(standard.length).toBeGreaterThanOrEqual(8);
    // Un pezzo che non dice di che tipo è non serve a chi dovrà tradurlo in WinCC.
    for (const item of standard) expect(item.createJsx()).toContain("data-hmi-type=");
    for (const type of standardShellComponentTypes) expect(componentRegistry.get(type), type).toBeDefined();
  });

  it("i pezzi dello standard usano le misure e i colori veri, non arrotondamenti", () => {
    const row = componentRegistry.get("hmi-settings-row")?.createJsx() ?? "";
    // Riga 403x75, campo largo 70 a 348 dal bordo: sono le misure del progetto WinCC.
    expect(row).toContain("width: 403");
    expect(row).toContain("height: 75");
    expect(row).toContain("width: 70");
    // Le pagine sono chiare: la riga e' bianca sul grigio, non il grigio scuro del guscio.
    expect(row).toContain("#FFFFFF");
    expect(row).not.toContain("#48494E");
    // La linguetta aperta prende il colore della sua sezione, non un azzurro qualsiasi.
    expect(componentRegistry.get("hmi-folder-tabs")?.createJsx()).toContain("#C20000");
  });

  it("offre almeno un blocco per tutti i tipi Hmi usati dallo standard", () => {
    const source = componentRegistry.all().filter((item) => item.category === "Standard HMI" || item.category === "HMI e PLC").map((item) => item.createJsx()).join("\n");
    for (const type of itemTypes) expect(source, type).toContain(`data-hmi-type="${type}"`);
  });

  it("i controlli PLC generici partono neutrali e aspettano i tag veri del progetto", () => {
    const controls = componentRegistry.all().filter((item) => item.category === "HMI e PLC");
    for (const item of controls) {
      const jsx = item.createJsx();
      expect(jsx, item.type).toContain("data-hmi-type=");
      expect(jsx, item.type).not.toMatch(/data-plc-variable="(?:Machine|Motor|Commands|Alarms|Cycle)\./);
      expect(jsx, item.type).not.toMatch(/#22c55e|#4f46e5|#cbd5e1/);
    }
  });

  it("offre targhetta motore e linea di richiamo neutrali per gli screen macchina", () => {
    const callout = componentRegistry.get("hmi-machine-callout")?.createJsx() ?? "";
    const line = componentRegistry.get("hmi-callout-line")?.createJsx() ?? "";

    expect(callout).toContain("M0000");
    expect(callout).toContain('data-plc-variable=""');
    expect(callout).toContain('data-hmi-action=""');
    expect(callout).toContain("width: 148");
    expect(callout).toContain("height: 52");
    expect(callout).not.toMatch(/M(?!0000)\d{4}/);
    expect(line).toContain('data-hmi-type="HmiLine"');
    expect(line).toContain("width: 156");
    expect(line).toContain("height: 55");
    expect(line).toContain('strokeDasharray: "5 4"');
  });

  it.each(componentRegistry.all())("creates valid React JSX for $name", (definition) => {
    expect(() => parse(`function Preview() { return (${definition.createJsx().trim()}); }`, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    })).not.toThrow();
  });
});
