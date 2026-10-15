// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { hasAiInterviewAnswers, parseAiInterviewDraft, serializeAiInterviewDraft, type AiInterviewDraftSnapshot } from "../src/ai/aiInterviewDraft";
import { useEditorAi } from "../src/state/editorAi";
import { installAiInterviewDraftRecovery, useEditorAiDraft } from "../src/state/editorAiDraft";

const initialAi = useEditorAi.getState(), initialDraft = useEditorAiDraft.getState();
let cleanup: (() => void) | undefined;
const settle = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
afterEach(async () => { cleanup?.(); cleanup = undefined; await settle(); vi.useRealTimers(); vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorAiDraft.setState(initialDraft, true); });
function fixture(source: string | null = null) {
  vi.useFakeTimers(); useEditorAi.setState({ ...initialAi, interview: newAiInterview(), busy: false, proposal: undefined }, true);
  let disk: AiInterviewDraftSnapshot = { revision: "0", source }, revision = 0;
  const bridge = {
    readAiInterviewDraft: vi.fn(async () => structuredClone(disk)),
    writeAiInterviewDraft: vi.fn(async (expected: string, source: string | null) => { if (expected !== disk.revision) throw new Error("Bozza cambiata: rileggila"); disk = { revision: String(++revision), source }; return structuredClone(disk); }),
  };
  cleanup = installAiInterviewDraftRecovery(bridge);
  return { bridge, read: () => disk, external(next: string) { disk = { revision: String(++revision), source: next }; } };
}
const answer = (machineName: string) => useEditorAi.getState().updateInterview({ ...useEditorAi.getState().interview, machineName });

describe("bozza locale validata del questionario", () => {
  it("conserva anche risposte incomplete, immagini, tag, requisiti e deleghe senza conservare l’approvazione dei comandi", () => {
    const interview = newAiInterview(); interview.machineName = "Linea reale"; interview.spec.purpose = "";
    interview.spec.pages = [{ ...newGuidedPage(0), title: "", image: "C:/local/machine.svg", kind: "commands", items: [{ label: "Avanti", tag: "Motor.Start", command: { event: "Tapped", value: "true", permission: "comandi", reviewed: true } }] }];
    interview.spec.tags = [{ name: "Motor.Start", access: "write", dataType: "BOOL", address: "real-local-address", description: "Solo locale" }];
    interview.spec.requirements!.answers["connections.equipment"] = "PLC macchina";
    interview.delegated = ["machineName"]; interview.followups = [{ question: "Come organizziamo?", answer: "", skipped: true }];
    interview.step = "page-1";
    const source = serializeAiInterviewDraft(interview), restored = parseAiInterviewDraft(source);
    expect(restored.interview.spec.pages[0].image).toBe("C:/local/machine.svg");
    expect(restored.interview.spec.tags).toEqual(interview.spec.tags); expect(restored.interview.spec.requirements).toEqual(interview.spec.requirements);
    expect(restored.interview.followups).toEqual(interview.followups); expect(restored.interview.delegated).toEqual(["machineName"]);
    expect(restored.interview.step).toBe("page-1"); expect(restored.interview.spec.pages[0].items[0].command?.reviewed).toBe(false);
    expect(interview.spec.pages[0].items[0].command?.reviewed).toBe(true);
    expect(Object.keys(JSON.parse(source))).toEqual(["version", "savedAt", "interview"]);
    expect(hasAiInterviewAnswers(newAiInterview())).toBe(false); expect(hasAiInterviewAnswers(interview)).toBe(true);
  });
  it("rifiuta corruzione, versioni/campi sconosciuti e strutture pericolose prima del rendering", () => {
    const source = JSON.parse(serializeAiInterviewDraft(newAiInterview()));
    for (const bad of ["not-json", JSON.stringify({ ...source, version: 2 }), JSON.stringify({ ...source, account: { token: "never" } }), JSON.stringify({ ...source, interview: { ...source.interview, spec: { ...source.interview.spec, pages: [null] } } }), JSON.stringify({ ...source, interview: { ...source.interview, spec: { ...source.interview.spec, tags: [1] } } })]) expect(() => parseAiInterviewDraft(bad)).toThrow();
    source.interview.step = "removed-page"; expect(parseAiInterviewDraft(JSON.stringify(source)).interview.step).toBe("machine");
    source.interview.spec.pages = [newGuidedPage(0), newGuidedPage(0)]; expect(() => parseAiInterviewDraft(JSON.stringify(source))).toThrow("duplicate");
  });
});
describe("coordinamento del recupero e dei salvataggi", () => {
  it("non crea una bozza vuota e conserva l’ultima risposta dopo il debounce", async () => {
    const test = fixture(); await settle(); expect(test.bridge.writeAiInterviewDraft).not.toHaveBeenCalled();
    answer("Prima"); answer("Ultima"); await vi.advanceTimersByTimeAsync(350); await settle();
    expect(test.bridge.writeAiInterviewDraft).toHaveBeenCalledTimes(1);
    expect(parseAiInterviewDraft(test.read().source!).interview.machineName).toBe("Ultima"); expect(useEditorAiDraft.getState().savedAt).toBeTruthy();
  });
  it("offre la ripresa senza richiesta AI né ripristino di proposta o conferme", async () => {
    const interview = newAiInterview(); interview.machineName = "Riprendi";
    const test = fixture(serializeAiInterviewDraft(interview)); await settle();
    expect(useEditorAiDraft.getState().needsChoice).toBe(true); expect(useEditorAi.getState().interview.machineName).toBe("");
    expect(test.bridge.writeAiInterviewDraft).not.toHaveBeenCalled();
    const propose = vi.spyOn(useEditorAi.getState().provider, "propose"), connect = vi.spyOn(useEditorAi.getState().provider, "connect");
    useEditorAiDraft.getState().resume(); await settle();
    expect(useEditorAi.getState().interview.machineName).toBe("Riprendi"); expect(useEditorAi.getState().proposal).toBeUndefined();
    expect(useEditorAiDraft.getState().needsChoice).toBe(false); expect(propose).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it("un salvataggio vecchio in corso non fa rispuntare il questionario dopo il reset", async () => {
    const test = fixture(); await settle();
    let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
    const write = test.bridge.writeAiInterviewDraft.getMockImplementation()!;
    test.bridge.writeAiInterviewDraft.mockImplementationOnce(async (...args) => { await wait; return write(...args); });
    answer("Da finire"); await vi.advanceTimersByTimeAsync(350); await settle();
    useEditorAi.getState().resetInterview(); release(); await settle();
    expect(test.read().source).toBeNull(); expect(test.bridge.writeAiInterviewDraft.mock.calls.at(-1)?.[1]).toBeNull();
  });
  it("flush e reinstallazione StrictMode preservano l’ultima risposta senza riprenderla in automatico", async () => {
    const test = fixture(); await settle(); answer("Ultimo carattere"); cleanup!(); cleanup = installAiInterviewDraftRecovery(test.bridge); await settle();
    expect(parseAiInterviewDraft(test.read().source!).interview.machineName).toBe("Ultimo carattere");
    expect(useEditorAiDraft.getState().pending?.interview.machineName).toBe("Ultimo carattere");
  });
  it.each(["corrupt", ""])("una bozza corrotta (%j) non viene sovrascritta neanche rileggendola", async source => {
    const test = fixture(source); await settle(); expect(useEditorAiDraft.getState().error).toContain("non è leggibile");
    await useEditorAiDraft.getState().retry(); expect(useEditorAiDraft.getState().needsChoice).toBe(true);
    useEditorAiDraft.getState().sessionOnly(); answer("Solo memoria"); await vi.advanceTimersByTimeAsync(1000); await settle();
    expect(test.read().source).toBe(source); expect(test.bridge.writeAiInterviewDraft).not.toHaveBeenCalled();
    await useEditorAiDraft.getState().restart(); await settle(); expect(test.read().source).toBeNull(); expect(useEditorAi.getState().interview.machineName).toBe("");
  });
  it("un errore di scrittura conserva le risposte; una copia esterna più recente richiede una scelta", async () => {
    const test = fixture(); await settle(); test.bridge.writeAiInterviewDraft.mockRejectedValueOnce(new Error("Disco pieno: libera spazio e riprova"));
    answer("Risposta non persa"); await vi.advanceTimersByTimeAsync(350); await settle();
    expect(useEditorAiDraft.getState().error).toContain("libera spazio"); expect(useEditorAi.getState().interview.machineName).toBe("Risposta non persa");
    const external = newAiInterview(); external.machineName = "Altra finestra"; test.external(serializeAiInterviewDraft(external));
    await useEditorAiDraft.getState().retry(); expect(useEditorAiDraft.getState().pending?.interview.machineName).toBe("Altra finestra");
    expect(useEditorAi.getState().interview.machineName).toBe("Risposta non persa"); expect(test.bridge.writeAiInterviewDraft).toHaveBeenCalledTimes(1);
  });
});
