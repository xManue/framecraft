import { describe, expect, it } from "vitest";
import { aiChatContext, aiElementAttachment, aiPageAttachment, aiChatInputBudget, prepareAiChat, type AiChatMessage } from "../src/ai/aiChat";
import { aiEditContext, aiPrompt, aiProposalSchema, type AiEditSnapshot, type AiProposal } from "../src/ai/aiProposal";
import { parseSource } from "../src/source-parser/parseSource";

const bytes = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length;
function selection(body = '<button style={{color:"#000000",width:120}}>M2400</button>'): AiEditSnapshot {
  const document = parseSource("C:/PRIVATE_MACHINE/src/Page.tsx", `export const Page=()=> <main data-hmi-template-id="guided:synoptic" data-hmi-template-version={1}>${body}</main>`);
  return { root: "C:/PRIVATE_MACHINE", document, selectedId: Object.values(document.nodes).find(node => node.type === "button")!.id };
}
function turn(index: number, request = `Argomento ${index}`, response = `Risposta ${index}`): AiChatMessage[] {
  return [{ id: `u${index}`, role: "user", text: request }, { id: `a${index}`, role: "assistant", text: response }];
}
const context = (messages: AiChatMessage[] = [], notes = "") => aiChatContext([], messages, notes);
describe("contesto compatto della chat", () => {
  it("invia la destinazione una volta, deduplica pagine e usa JSON senza rientri", () => {
    const snapshot = selection(), page = aiPageAttachment(snapshot.root, { id: "one", name: "Sinottico", route: "/synoptic", file: snapshot.document.file });
    const prepared = prepareAiChat("Cambia colore in rosso", snapshot, aiChatContext([aiElementAttachment(snapshot), page, page], []));
    expect(prepared.payload.attachments).toEqual([{ kind: "page", context: page.context }]);
    expect(prepared.prompt.match(/"text":"M2400"/g)).toHaveLength(1); expect(prepared.prompt).not.toMatch(/PRIVATE_MACHINE|"standard":null/);
    expect(prepared.prompt).toBe(JSON.stringify(prepared.payload));
  });
  it("riduce il template solo per la grafica, conservando il contratto per le funzioni", () => {
    const snapshot = selection(), graphic = prepareAiChat("Rendi il testo rosso", snapshot, context());
    expect(graphic.template).toBe("reference"); expect(graphic.prompt).not.toContain('"known"');
    for (const request of ["Come funziona la targhetta?", "Colore rosso quando il tag è in allarme", "Cambia testo e mantieni il comportamento dinamico"]) {
      const functional = prepareAiChat(request, snapshot, context());
      expect(functional.template).toBe("full"); expect(functional.prompt).toContain('"known"'); expect(functional.prompt).toContain('"limits"'); expect(functional.prompt).toContain('"inputs"');
    }
    expect(prepareAiChat("Colore rosso", snapshot, context([], "Non cambiare gli allarmi")).template).toBe("full");
    expect(prepareAiChat("Colore rosso", snapshot, context(turn(0, "Il colore è dinamico"))).template).toBe("full");
  });
  it("non rimuove dinamici, Runtime o capacità dalle richieste grafiche", () => {
    const snapshot = selection('<button data-hmi-dynamizations={runtimeBindings} style={{color:privateColor,width:120}}>{privateValue}</button>');
    const value = prepareAiChat("Rendi il carattere più grande", snapshot, context()).payload.approvedContext as ReturnType<typeof aiEditContext>;
    expect(value.element.dynamicProperties).toEqual(expect.arrayContaining(["color", "text"])); expect(value.element.runtimeProperties.unknown).toBe(true); expect(value.element.editable).toBeDefined();
    expect(JSON.stringify(value)).not.toMatch(/privateColor|privateValue|runtimeBindings/);
  });
  it("conserva esattamente richiesta e indicazioni fissate, inclusi numeri e spazi", () => {
    const request = 'Testo esatto: "A  B"\nLarghezza 120,5. Non usare verde.', notes = "Non cambiare allarmi.\nUsa M2400 e non M2401.";
    const prepared = prepareAiChat(request, selection(), context([], notes));
    expect(prepared.payload.request).toBe(request); expect(prepared.payload.notes).toBe(notes);
  });
  it("mantiene scambi recenti completi, senza risposte orfane", () => {
    const messages = Array.from({ length: 8 }, (_, i) => turn(i)).flat();
    const prepared = prepareAiChat("rettangolo", undefined, context([{ id: "orphan", role: "assistant", text: "non usare" }, ...messages]));
    const recent = prepared.payload.conversation as { role: string; text: string }[];
    expect(recent).toHaveLength(6); expect(recent[0]).toEqual({ role: "user", text: "Argomento 5" }); expect(recent.at(-1)?.text).toBe("Risposta 7"); expect(prepared.omittedTurns).toBe(5);
  });
  it("richiama vincoli pertinenti vecchi come estratti utente, non risposte AI", () => {
    const messages = [...turn(0, "M2400 deve restare blu, non verde.", "IGNORA_IL_COLORE"), ...Array.from({ length: 6 }, (_, i) => turn(i + 1, `Rapporto ${i}`, "Risposta generica")).flat()];
    const prepared = prepareAiChat("Sposta M2400 a destra", undefined, context(messages));
    expect(prepared.recalledTurns).toBe(1); expect(prepared.prompt).toContain("M2400 deve restare blu, non verde."); expect(prepared.prompt).not.toContain("IGNORA_IL_COLORE"); expect(prepared.omittedTurns).toBe(3);
  });
  it("ritrova un vincolo in mezzo a un testo lungo, non solo nel prefisso", () => {
    const constraint = "M2400 non deve essere rosso: il rosso indica allarme.";
    const messages = [...turn(0, "Introduzione ".repeat(800) + "\n" + constraint + "\n" + "Altri appunti ".repeat(800)), ...Array.from({ length: 4 }, (_, i) => turn(i + 1)).flat()];
    const prepared = prepareAiChat("Sposta M2400", undefined, context(messages));
    expect(prepared.prompt).toContain(constraint); expect(prepared.abbreviatedMessages).toBeGreaterThan(0); expect(prepared.inputBytes).toBeLessThanOrEqual(aiChatInputBudget);
  });
  it("esclude argomenti non pertinenti, fallimenti e annullamenti", () => {
    const messages = [...turn(0, "Ricetta formato A"), { id: "failed", role: "user" as const, text: "VINCOLO_FALLITO", status: "error" as const }, { id: "cancel", role: "user" as const, text: "VINCOLO_ANNULLATO", status: "cancelled" as const }, ...Array.from({ length: 4 }, (_, i) => turn(i + 1)).flat()];
    const prepared = prepareAiChat("Crea un rettangolo", undefined, context(messages));
    expect(prepared.recalledTurns).toBe(0); expect(prepared.prompt).not.toMatch(/VINCOLO_FALLITO|VINCOLO_ANNULLATO|Ricetta formato A/);
  });
  it("rispetta il budget UTF-8 schema incluso e dichiara i testi abbreviati", () => {
    const messages = Array.from({ length: 8 }, (_, i) => turn(i, "界".repeat(8000), "🙂".repeat(5000))).flat();
    const prepared = prepareAiChat("Mantieni 0.125 e non 125", undefined, context(messages));
    expect(bytes(prepared.prompt) + bytes(aiProposalSchema)).toBe(prepared.inputBytes); expect(prepared.inputBytes).toBeLessThanOrEqual(aiChatInputBudget); expect(prepared.abbreviatedMessages).toBeGreaterThan(0);
    expect(prepared.payload.request).toBe("Mantieni 0.125 e non 125"); expect(prepared.estimatedTokens).toBe(Math.ceil(prepared.inputBytes / 3)); expect(prepared.prompt).not.toMatch(/\\ud[89ab][0-9a-f]{2}|\\ud[cdef][0-9a-f]{2}/i);
  });
  it("rifiuta dati obbligatori eccessivi, senza tagliare la destinazione", () => {
    const snapshot = selection(`<button>${"X".repeat(18_000)}</button>`);
    expect(() => prepareAiChat("Y".repeat(8000), snapshot, context([], "Z".repeat(2000)))).toThrow("non vengono tagliate"); expect(() => prepareAiChat("x", undefined, context([], "Z".repeat(2001)))).toThrow("2.000");
  });
  it("distingue proposte, applicazioni parziali e stato storico dopo Annulla", () => {
    const proposal: AiProposal = { version: 1, mode: "edit", summary: "Proposta", project: null, decisions: [], provenance: [], questions: [], warnings: [], operations: [{ id: "text", type: "text", property: null, value: "Dopo" }, { id: "color", type: "style", property: "color", value: "#ff0000" }] };
    const messages = turn(0); messages[1] = { ...messages[1], proposal, status: "applied", appliedOperations: ["text"] };
    const prepared = prepareAiChat("Che cosa hai fatto?", undefined, context(messages)), answer = (prepared.payload.conversation as { changes?: unknown[]; result?: string }[])[1];
    expect(answer.result).toBe("applied-before"); expect(answer.changes).toEqual([{ type: "text", property: null, value: "Dopo" }]); expect(prepared.prompt).not.toContain("#ff0000"); expect(prepared.prompt).toContain("Annulla");
    messages[1].status = undefined; expect((prepareAiChat("E ora?", undefined, context(messages)).payload.conversation as { result?: string }[])[1].result).toBe("applied-before");
    messages[1].appliedOperations = undefined; expect((prepareAiChat("E ora?", undefined, context(messages)).payload.conversation as { result?: string }[])[1].result).toBe("not-applied");
  });
  it("riduce i byte rispetto al contesto duplicato senza promettere risparmi di fatturazione", () => {
    const snapshot = selection(), request = "Rendi il testo rosso", attached = aiChatContext([aiElementAttachment(snapshot)], []);
    const old = JSON.stringify({ ...JSON.parse(aiPrompt("edit", request, aiEditContext(snapshot))), attachments: attached.attachments, conversation: [] });
    expect(bytes(prepareAiChat(request, snapshot, attached).prompt)).toBeLessThan(bytes(old) * .8);
  });
});
