// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { guidedCommandAttributes, guidedCommandBinding, guidedCommandIssues, newGuidedCommand, withGuidedItemLabels, type GuidedCommandItem } from "../src/core/guidedCommands";
import { executeHmiEvent, executeHmiEventAsync, parseHmiEvents, serializeHmiEvents } from "../src/core/hmiEvents";
import { inspectHmiScript, type HmiScriptCommandResult, type HmiScriptTransport } from "../src/core/hmiScript";
import { newGuidedWriteAction } from "../src/core/hmiActions";
import { newAiInterview, newGuidedPage, interviewConfig, interviewContext, interviewPrompt } from "../src/ai/aiInterview";
import { guidedProjectIssues, guidedProjectPending } from "../src/core/guidedProject";
import { standardProjectFiles } from "../src/core/standardProject";
import { parseSource } from "../src/source-parser/parseSource";
import type { PlcVariableDefinition } from "../src/core/plcVariables";

const tags: PlcVariableDefinition[] = [{ name: "Command.Start", dataType: "Bool", access: "write", address: "%M10.0", description: "Comando" }, { name: "Command.Speed", dataType: "Int", access: "read-write", address: "%MW20", description: "Velocità" }, { name: "Value.Weight", dataType: "Real", access: "read", address: "%MD100", description: "Peso" }];
const item = (): GuidedCommandItem => ({ label: "Avvia", tag: "Command.Start", command: { ...newGuidedCommand(), value: "true", reviewed: true } });
const interview = () => { const draft = newAiInterview(); draft.machineName = "Linea test"; draft.spec.purpose = "Comandare la stazione"; draft.spec.tagsMode = "import"; draft.spec.tags = tags; draft.spec.pages = [{ ...newGuidedPage(0), title: "Manuali stazione", kind: "commands", section: "manuals", imageNeed: "none", items: [item()] }]; return draft; };

describe("mapping dei comandi guidati", () => {
  it("prepara una sola scrittura, tipizzata e compilata dalla stessa IR dell’Inspector", () => {
    const binding = guidedCommandBinding(item(), tags)!;
    expect(binding.event).toBe("Tapped"); expect(inspectHmiScript(binding.script).tagsWritten).toEqual(["Command.Start"]);
    const serialized = parseHmiEvents(serializeHmiEvents([binding])); expect(serialized[0].program?.statements).toHaveLength(1);
    expect(executeHmiEvent(serialized[0], {}).writes).toEqual({ "Command.Start": "true" });
  });
  it.each(["Tapped", "DoubleTapped", "ContextTapped"] as const)("rispetta l’evento %s senza aggiungerne altri", event => {
    const selected = item(); selected.command!.event = event;
    expect(parseHmiEvents(serializeHmiEvents([guidedCommandBinding(selected, tags)!])).map(binding => binding.event)).toEqual([event]);
  });
  it.each(["", "Value.Weight", "Invented"])("non abilita un comando sul tag non scrivibile %s", tag => {
    const selected = { ...item(), tag }; expect(guidedCommandIssues(selected, tags)[0]).toContain("scrivibile"); expect(() => guidedCommandBinding(selected, tags)).toThrow();
  });
  it("rifiuta cataloghi duplicati o tag soltanto rilevati, e mapping non confermati", () => {
    expect(guidedCommandIssues(item(), [tags[0], tags[0]])[0]).toContain("scrivibile");
    expect(guidedCommandIssues(item(), [{ ...tags[0], detected: true }])[0]).toContain("scrivibile");
    const selected = item(); selected.command!.reviewed = false; expect(() => guidedCommandBinding(selected, tags)).toThrow("conferma");
  });
  it.each(["32768", "-32769", "1.5", "Infinity", "not-a-number"])("rifiuta il valore Int %s prima di generare un evento", value => {
    const selected = { ...item(), tag: "Command.Speed", command: { ...item().command!, value } };
    expect(() => guidedCommandBinding(selected, tags)).toThrow("compatibile con Int");
  });
  it("rifiuta eventi automatici, permessi inventati e campi script arbitrari", () => {
    for (const command of [{ ...item().command!, event: "Loaded" }, { ...item().command!, permission: "admin_invented" }, { ...item().command!, script: "writeAnyTag()" }]) expect(() => guidedCommandBinding({ ...item(), command: command as never }, tags)).toThrow();
    expect(() => newGuidedWriteAction("Command.Start", Infinity)).toThrow();
  });
  it("spiega il limite dei tipi senza suggerire un protocollo diverso da quello scelto", () => {
    const issues = guidedCommandIssues(item(), [{ ...tags[0], dataType: "DateTime" }]);
    expect(issues[0]).toContain("non è disponibile per le scritture guidate"); expect(issues[0]).not.toContain("MQTT");
  });
  it("testo di tipo String resta un valore, mai un secondo script", () => {
    const value = '\"); Tags("Other").Write(1); //';
    const selected = { ...item(), tag: "Command.Text", command: { ...item().command!, value } };
    const binding = guidedCommandBinding(selected, [{ ...tags[0], name: "Command.Text", dataType: "String" }])!;
    expect(inspectHmiScript(binding.script).tagsWritten).toEqual(["Command.Text"]);
    expect(executeHmiEvent(binding, {}).writes).toEqual({ "Command.Text": value });
  });
  it("lascia i comandi rimandati disabilitati e senza eventi", () => {
    expect(guidedCommandBinding({ label: "Dopo", tag: "" }, tags)).toBeUndefined();
    const attributes = guidedCommandAttributes({ label: "Dopo", tag: "" }, tags); expect(attributes).toContain("disabled"); expect(attributes).not.toContain("data-hmi-events");
  });
  it("genera le stesse pagine, con binding e gate del permesso realmente editabili", () => {
    const draft = interview(); draft.spec.users = "roles-later"; draft.spec.pages[0].items[0].command!.permission = "comandi";
    const files = standardProjectFiles(interviewConfig(draft)), page = files.find(file => file.path === "src/pages/GuidedPage1.tsx")!;
    const node = Object.values(parseSource(page.path, page.content).nodes).find(node => node.type === "button")!;
    expect(node.props["data-fc-user-requires"]).toBe("comandi"); expect(node.props.disabled).not.toBe(true);
    expect(parseHmiEvents(node.props["data-hmi-events"])[0].program?.statements).toHaveLength(1);
    expect(node.capabilities.text).toBe(true); expect(node.capabilities.style).toBe(true);
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
    expect(JSON.parse(files.find(file => file.path === "framecraft.requirements.json")!.content).pages[0].items[0].command.reviewed).toBe(true);
  });
  it("non autorizza tutti quando sono stati richiesti ruoli diversi", () => {
    const draft = interview(); draft.spec.users = "roles-later";
    expect(guidedProjectIssues(draft.spec)[0]).toContain("ruoli separati");
    draft.spec.pages[0].items[0].command!.permission = "comandi"; expect(guidedProjectIssues(draft.spec)).toEqual([]);
    expect(guidedProjectPending(draft.spec).some(pending => pending.includes("senza permesso"))).toBe(true);
  });
  it("non invia tag, indirizzi o valori dei comandi al provider AI", () => {
    const draft = interview(); draft.spec.pages[0].items[0] = { ...item(), tag: "Command.Speed", command: { ...item().command!, value: "12345" } };
    const prompt = interviewPrompt(draft); for (const value of ["Command.Speed", "%MW20", "12345"]) expect(prompt).not.toContain(value);
    expect(interviewContext(draft).pages[0].elements[0].command).toMatchObject({ configured: true, event: "Tapped" });
  });
  it("cancellare o riordinare righe non sposta tag e azioni sul nome sbagliato", () => {
    const start = item(), stop = { ...item(), label: "Arresta", command: { ...item().command!, value: "false" } };
    expect(withGuidedItemLabels([start, stop], ["Arresta", "Avvia"])).toEqual([stop, start]);
    expect(withGuidedItemLabels([start, stop], ["Arresta"])).toEqual([stop]);
    expect(withGuidedItemLabels([start], ["Nuovo comando"])).toEqual([{ label: "Nuovo comando", tag: "" }]);
    expect(withGuidedItemLabels([start], ["Avvia", "Avvia"]).every(item => !item.command && !item.tag)).toBe(true);
  });
});
describe("scrittura guidata nel trasporto asincrono comune", () => {
  it("attende una sola ricevuta senza conferma PLC o aggiornamento ottimistico", async () => {
    let finish!: (result: HmiScriptCommandResult) => void;
    const transport: HmiScriptTransport = { read: vi.fn(), write: vi.fn<HmiScriptTransport["write"]>(() => new Promise<HmiScriptCommandResult>(resolve => { finish = resolve; })) };
    const values = { "Command.Start": "false" }, pending = executeHmiEventAsync(guidedCommandBinding(item(), tags)!, values, { transport });
    await vi.waitFor(() => expect(transport.write).toHaveBeenCalledTimes(1));
    expect(vi.mocked(transport.write).mock.calls[0][0]).toMatchObject({ tag: "Command.Start", value: true, mode: 0 });
    finish({ tag: "Command.Start", outcome: "delivered", delivery: "opcua-service", plcConfirmed: false });
    expect(await pending).toMatchObject({ writes: {}, commands: [{ outcome: "delivered", plcConfirmed: false }] }); expect(values["Command.Start"]).toBe("false");
  });
  it("un comando rifiutato non viene ritentato o accodato", async () => {
    const transport: HmiScriptTransport = { read: vi.fn(), write: vi.fn<HmiScriptTransport["write"]>(async request => ({ tag: request.tag, outcome: "rejected", plcConfirmed: false, error: "Servizio non autorizzato" })) };
    const result = await executeHmiEventAsync(guidedCommandBinding(item(), tags)!, {}, { transport });
    expect(result.error).toContain("Servizio non autorizzato"); expect(transport.write).toHaveBeenCalledTimes(1); expect(result.writes).toEqual({});
  });
});
