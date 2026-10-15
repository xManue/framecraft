import { describe, expect, it } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { updateInlineStyles } from "../src/source-parser/transformSource";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { aiEditContext, parseAiProposal, prepareAiEdits, type AiEditSnapshot, type AiProposal } from "../src/ai/aiProposal";
import { reviewAiEdits } from "../src/ai/aiEditReview";
import { inspectElementValues } from "../src/source-parser/inspectElementValues";

function snapshot(jsx: string): AiEditSnapshot {
  const document = parseSource("C:/synthetic/Page.tsx", `export const Page=()=> <main>${jsx}</main>`);
  return { root: "C:/synthetic", document, selectedId: Object.values(document.nodes).find(node => node.type === "button" || node.type === "Widget")!.id };
}
function proposal(operations: AiProposal["operations"]): AiProposal { return { version: 1, mode: "edit", summary: "Solo modifiche scelte", questions: [], warnings: [], provenance: ["approved-selection"], project: null, operations }; }
const style = (property: string, value: string, id = property): AiProposal["operations"][number] => ({ id, type: "style", property, value });
const text = (value: string, id = "text"): AiProposal["operations"][number] => ({ id, type: "text", property: null, value });

describe("stili condivisi tra AI e modifica manuale", () => {
  it("valuta una sola volta lo stile originale anche applicando più proprietà insieme", () => {
    const source = 'let calls=0;const base=()=>{calls++;return {color:"#00ff00",padding:12}};export const count=()=>calls;export const Element=()=> <button style={{color:"#000000",...base()}}>Prima</button>';
    const document = parseSource("Page.tsx", source), selectedId = Object.values(document.nodes).find(node => node.type === "button")!.id;
    const changed = prepareAiEdits({ root: "C:/synthetic", document, selectedId }, proposal([style("color", "#ff0000"), style("width", "160")]), ["color", "width"]);
    const javascript = transpileModule(changed, { compilerOptions: { jsx: 2, module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const output = { exports: {} as { count: () => number; Element: () => { props: { style: { color: string; width: number; padding: number } } } } };
    new Function("exports", "module", "React", javascript)(output.exports, output, { createElement: (_type: string, props: unknown) => ({ props }) });
    expect(output.exports.Element().props.style).toEqual({ color: "#ff0000", padding: 12, width: 160 }); expect(output.exports.count()).toBe(1);
  });
  it.each(['{color:"#000000",}', '{color:"#000000" // commento\n}', '{color:"#000000", // commento\n}', '{/* commento */}'])("aggiunge proprietà rispettando virgole finali e commenti: %s", style => {
    const source = `export const Page=()=> <button style={${style}}>Prima</button>`, document = parseSource("Page.tsx", source), node = Object.values(document.nodes).find(node => node.type === "button")!;
    const changed = updateInlineStyles(source, node.source.start, node.source.end, { width: 120 }), parsed = parseSource("Page.tsx", changed);
    expect(Object.values(parsed.nodes).find(node => node.type === "button")?.styles.width).toBe(120);
  });
  it.each(['{color:"#000000",...base}', '{color:"#000000",[key]:"#00ff00"}', '{color:"#000000",color:"#00ff00"}'])("la modifica esplicita prevale senza perdere gli altri stili: %s", style => {
    const source = `const base={color:"#00ff00",padding:12};const key="color";export const Element=()=> <button style={${style}}>Testo</button>`;
    const document = parseSource("Page.tsx", source), node = Object.values(document.nodes).find(node => node.type === "button")!;
    const changed = updateInlineStyles(source, node.source.start, node.source.end, { color: "#ff0000" });
    const javascript = transpileModule(changed, { compilerOptions: { jsx: 2, module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const output = { exports: {} as { Element?: () => { props: { style: { color: string; padding?: number } } } } };
    new Function("exports", "module", "React", javascript)(output.exports, output, { createElement: (_type: string, props: unknown) => ({ props }) });
    expect(output.exports.Element!().props.style.color).toBe("#ff0000");
    if (style.includes("...base")) expect(output.exports.Element!().props.style.padding).toBe(12);
    expect(changed).toContain("Testo");
  });
});
describe("confronto semantico AI locale", () => {
  it("legge valori negativi e mostra prima/dopo senza modificare il sorgente", () => {
    const selected = snapshot('<button style={{left:-12,width:80,color:"#000000",opacity:0}}>Prima</button>');
    const review = reviewAiEdits(selected, proposal([text("Dopo"), style("left", "24"), style("width", "160px"), style("color", "#ff0000")]));
    expect(review.error).toBeUndefined(); expect(review.defaults).toEqual(["text", "left", "width", "color"]);
    expect(review.changes[1]).toMatchObject({ label: "Posizione orizzontale", beforeText: "-12 px", afterText: "24 px" });
    expect(review.changes[2]).toMatchObject({ beforeText: "80 px", afterText: "160px" });
    expect(selected.document.source).toContain(">Prima</button>");
  });
  it("non preseleziona valori dinamici e non espone le espressioni o i tag al provider", () => {
    const selected = snapshot('<button style={{color:PRIVATE_PLC_VALUE?"#ff0000":"#00ff00",width:80}}>{PRIVATE_PLC_VALUE}</button>');
    const plan = proposal([text("Fisso"), style("color", "#0000ff"), style("width", "160")]), review = reviewAiEdits(selected, plan);
    expect(review.defaults).toEqual(["width"]); expect(review.changes[0].requiresConfirmation).toBe(true); expect(review.changes[1].requiresConfirmation).toBe(true);
    expect(review.changes[0].warnings.join(" ")).toContain("rinunciare");
    const context = aiEditContext(selected); expect(context.element.dynamicProperties).toContain("color"); expect(context.element.dynamicProperties).toContain("text");
    expect(JSON.stringify(context)).not.toContain("PRIVATE_PLC_VALUE"); expect(JSON.stringify(context)).not.toContain(selected.root);
    expect(prepareAiEdits(selected, plan, ["width"])).toContain("{PRIVATE_PLC_VALUE}");
    expect(prepareAiEdits(selected, plan, ["text", "color"])).not.toContain("PRIVATE_PLC_VALUE");
  });
  it("distingue il valore base dal Runtime e conserva il binding e gli eventi", () => {
    const bindings = JSON.stringify([{ property: "BackColor", kind: "Tag", tag: "PRIVATE_REAL_TAG" }]);
    const selected = snapshot(`<button data-hmi-dynamizations={${JSON.stringify(bindings)}} onClick={realHandler} style={{backgroundColor:"#000000"}}>Prima</button>`);
    const plan = proposal([style("backgroundColor", "#ff0000"), text("Dopo")]), review = reviewAiEdits(selected, plan);
    expect(review.defaults).toEqual(["text"]); expect(review.changes[0].warnings.join(" ")).toContain("dinamizzazione HMI resta collegata");
    const context = aiEditContext(selected); expect(context.element.runtimeProperties.properties).toEqual(["backgroundColor"]); expect(JSON.stringify(context)).not.toContain("PRIVATE_REAL_TAG");
    const changed = prepareAiEdits(selected, plan, ["backgroundColor"]); expect(changed).toContain("PRIVATE_REAL_TAG"); expect(changed).toContain("onClick={realHandler}");
  });
  it("esclude le modifiche senza variazione, compresi numeri/px equivalenti", () => {
    const selected = snapshot('<button style={{width:80,opacity:0}}>Prima</button>');
    const review = reviewAiEdits(selected, proposal([text("Prima"), style("width", "80px"), style("opacity", "0")]));
    expect(review.defaults).toEqual([]); expect(review.changes.every(change => change.unchanged)).toBe(true);
  });
  it.each(['<button {...shared}>Prima</button>', '<button style={{color:"#000000"}} {...shared}>Prima</button>'])("non promette di cambiare uno stile sostituito da attributi condivisi: %s", jsx => {
    const selected = snapshot(jsx), plan = proposal([style("color", "#ff0000"), text("Dopo")]), review = reviewAiEdits(selected, plan);
    expect(review.changes[0].blocked).toContain("proprietà condivise"); expect(review.defaults).toEqual(["text"]);
    expect(() => prepareAiEdits(selected, plan, ["color"])).toThrow("proprietà condivise");
  });
  it("non cambia stili di componenti custom e conserva le parti dinamiche adiacenti al testo fisso", () => {
    const custom = snapshot('<Widget>Prima</Widget>'); expect(reviewAiEdits(custom, proposal([style("width", "80")])).changes[0].blocked).toContain("template");
    const mixed = snapshot('<button>Stato: {value}<Icon /></button>'), review = reviewAiEdits(mixed, proposal([text("Valore:")]));
    expect(review.defaults).toEqual(["text"]); expect(review.changes[0].warnings.join(" ")).toContain("adiacenti");
    const changed = prepareAiEdits(mixed, proposal([text("Valore:")]), ["text"]); expect(changed).toContain("{value}<Icon />");
  });
  it("rifiuta proposte ambigue con due operazioni sulla stessa proprietà", () => {
    expect(() => parseAiProposal(proposal([style("width", "100", "a"), style("width", "200", "b")]), "edit")).toThrow("stessa proprietà");
    expect(() => prepareAiEdits(snapshot("<button>Prima</button>"), proposal([text("A", "a"), text("B", "b")]), ["a"])).toThrow("stessa proprietà");
  });
  it("dopo una modifica dello spread non crea altri wrapper inutili sulla stessa proprietà", () => {
    const selected = snapshot('<button style={{color:"#000000",...shared}}>Prima</button>');
    const first = prepareAiEdits(selected, proposal([style("color", "#ff0000")]), ["color"]), doc = parseSource(selected.document.file, first);
    const next = { ...selected, document: doc, selectedId: Object.values(doc.nodes).find(node => node.type === "button")!.id };
    const second = prepareAiEdits(next, proposal([style("color", "#0000ff")]), ["color"]);
    const parsed = parseSource(doc.file, second), node = Object.values(parsed.nodes).find(node => node.type === "button")!;
    expect(second.length).toBe(first.length); expect(inspectElementValues(second, node.source, ["color"]).styles.color).toEqual({ kind: "literal", value: "#0000ff" });
  });
});
