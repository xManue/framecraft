// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { panelClockText, panelHeaderIssues, panelHeaderReading, panelHeaderScale, panelHeaderTags, newPanelHeader } from "../src/core/panelHeader";
import { resolveHmiTagReference } from "../src/core/hmiTagBinding";
import { newAiInterview, newGuidedPage, interviewConfig, interviewContext, interviewStepIssues } from "../src/ai/aiInterview";
import { resolveInterviewDelegation, toggleInterviewDelegation } from "../src/ai/aiDelegation";
import { standardProjectFiles } from "../src/core/standardProject";

const tags = [{ name: "PRIVATE_SPEED", dataType: "REAL", access: "read" as const, address: "PRIVATE_ADDRESS", description: "" }, { name: "PRIVATE_FORMAT", dataType: "STRING", access: "read" as const, address: "", description: "" }];
const config = { ...newPanelHeader(), tags: { speed: tags[0].name, formatName: tags[1].name }, speedMin: "0", speedMax: "150", speedUnit: "PRIVATE_UNIT" };
describe("barra con dati reali", () => {
  it("l’orologio usa il dispositivo e una lingua risorsa non valida non rompe il pannello", () => {
    const date = new Date("2026-10-14T12:30:00Z");
    expect(panelClockText(date, "it-IT").time).toBe(date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    expect(panelClockText(date, "invalid_locale").time).toBe(date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
  });
  it("filtra scalari leggibili senza assumere PackML o tag rilevati", () => {
    const catalog = [...tags, { ...tags[0], name: "Write", access: "write" }, { ...tags[0], name: "Array", dataType: "REAL[]" }, { ...tags[0], name: "Detected", detected: true }];
    expect(panelHeaderTags(catalog, true).map(tag => tag.name)).toEqual([tags[0].name]);
    expect(panelHeaderTags(catalog, false).map(tag => tag.name)).toEqual(tags.map(tag => tag.name));
    expect(panelHeaderIssues(config, tags)).toEqual([]);
    expect(panelHeaderIssues({ ...config, tags: { speed: tags[1].name } }, tags)[0]).toContain("numerico");
  });
  it.each([null, [], { version: 2, tags: {} }, { version: 1, tags: { extra: "unknown" } }, { ...config, tags: { speed: "UNKNOWN" } }, { ...config, speedMax: "0" }, { ...config, speedMax: "Infinity" }, { ...config, speedMin: "" }, { ...config, speedUnit: "\n" }, { ...config, speedMax: null }])("blocca un contratto non valido %j", value => {
    expect(panelHeaderIssues(value, tags).length).toBeGreaterThan(0);
  });
  it("nessun dato, campione Bad, Uncertain o senza qualità non riutilizzano il vecchio valore", () => {
    expect(panelHeaderReading(undefined, true, {}, {})).toMatchObject({ text: "—", reason: expect.any(String) });
    for (const status of [{}, { qualityCode: 0 }, { qualityCode: 64 }, { qualityCode: 192, qualityKnown: false }, { qualityCode: 192, lastError: 1 }, { qualityCode: 192, localValue: true }]) {
      expect(panelHeaderReading("speed", true, { speed: "40" }, { speed: status }).text).toBe("—");
    }
    expect(panelHeaderReading("speed", true, { speed: "40" }, { speed: { qualityCode: 128 } })).toMatchObject({ text: "40", value: 40 });
    expect(panelHeaderReading("speed", true, { speed: "not a number" }, { speed: { qualityCode: 192 } }).text).toBe("—");
    expect(panelHeaderReading("state", false, { state: "2" }, { state: { qualityCode: 192 } }).text).toBe("2");
    expect(panelHeaderScale(config)).toEqual({ min: 0, max: 150 }); expect(panelHeaderScale(newPanelHeader())).toBeUndefined();
  });
  it("anche le letture dirette controllano qualità, senza togliere la prova manuale offline", () => {
    const binding = { property: "Text", tag: "speed" }, values = { speed: "40" };
    expect(resolveHmiTagReference(binding, values)).toMatchObject({ value: "40" });
    expect(resolveHmiTagReference(binding, values, [], { speed: { localValue: true } })).toMatchObject({ value: "40" });
    expect(resolveHmiTagReference(binding, values, [], {}, true)).toHaveProperty("reason");
    for (const qualityCode of [0, 64, -1, 65536, 192.5]) expect(resolveHmiTagReference(binding, values, [], { speed: { qualityCode } })).toHaveProperty("reason");
    for (const qualityCode of [128, 192, 216]) expect(resolveHmiTagReference(binding, values, [], { speed: { qualityCode } }, true)).toMatchObject({ value: "40" });
  });
  it("collega la barra della pipeline e conserva i dati tecnici solo localmente", () => {
    const interview = newAiInterview(); interview.machineName = "Macchina sintetica"; interview.spec.purpose = "Prova";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "Vista", imageNeed: "none", itemsDeferred: true }];
    interview.spec.tagsMode = "import"; interview.spec.tags = tags; interview.spec.header = config;
    expect(interviewStepIssues(interview, "header")).toEqual([]);
    const context = JSON.stringify(interviewContext(interview));
    for (const secret of ["PRIVATE_SPEED", "PRIVATE_FORMAT", "PRIVATE_ADDRESS", "PRIVATE_UNIT"]) expect(context).not.toContain(secret);
    const skipped = toggleInterviewDelegation(interview, "header.speed");
    expect(resolveInterviewDelegation(skipped).spec.header).toEqual(config);
    expect(() => resolveInterviewDelegation(skipped, [{ key: "header.speed", value: "INVENTED_TAG" }])).toThrow("inventato");
    const files = new Map(standardProjectFiles(interviewConfig(interview)).map(file => [file.path, file.content]));
    expect(JSON.parse(files.get("framecraft.header.json")!)).toEqual(config);
    const app = files.get("src/App.tsx")!;
    for (const fake of ["DefaultUser", "EMERGENCY BUTTON PRESSED E.C.2", "31.08.2026", 'width: "40%"', "Euro Pallet", ">Production<", ">Aborted<"]) expect(app).not.toContain(fake);
    expect(app).toContain("panelClockText(clock, runtimeLanguage)"); expect(app).toContain("HmiAlarmLine");
    expect(files.get("src/framecraftPanelHeaderUi.tsx")).toContain("subscribeRuntimeTags");
    expect(files.get("framecraft.runtime.json")).toContain('"enabled": false');
  });
});
