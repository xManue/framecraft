// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAlarmEngine, emptyAlarmCatalog, type AlarmCatalog } from "../runtime/alarm-engine.mjs";
import { alarmSummaryFilter, createHmiAlarmSummary, defaultHmiAlarmSummaryConfig, hmiAlarmSummaryAttribute, hmiAlarmSummaryIssues, hmiAlarmSummaryJsx, hmiAlarmSummaryView, parseHmiAlarmSummaryConfig, serializeHmiAlarmSummaryConfig } from "../src/core/hmiAlarmSummary";
import { componentRegistry } from "../src/components/registry";
import { validateHmiProject } from "../src/core/hmiValidation";

const variables = [0, 1, 2, 3].map((i) => ({ name: "Signal" + i, dataType: "Bool", access: "read" }));
const catalog: AlarmCatalog = { ...emptyAlarmCatalog(), classes: [{ name: "C", acknowledgment: "single" }, { name: "R", acknowledgment: "reset" }], alarms: variables.map((v, i) => ({ id: "a" + i, name: "Motor " + i, text: i === 0 ? "<script>fault</script>" : "Controlla motore " + i, tag: v.name, className: i === 0 ? "R" : "C", area: i < 2 ? "Zona 1" : "Zona 2", enabled: true, priority: i * 10, trigger: { kind: "bit", bit: 0, activeWhen: "set" } })) };
const create = () => createAlarmEngine(catalog, variables);
const sample = (engine: ReturnType<typeof create>, index: number, value = "1", qualityCode = 192) => engine.updateSample({ tag: "Signal" + index, value, qualityCode });
const known = (engine: ReturnType<typeof create>) => variables.forEach((_, i) => sample(engine, i, "0"));
const button = (host: ParentNode, text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
const mount = (kind = "HmiAlarmIndicator", config = defaultHmiAlarmSummaryConfig()) => { const host = document.createElement("div"); host.dataset.hmiType = kind; host.setAttribute(hmiAlarmSummaryAttribute, serializeHmiAlarmSummaryConfig(config)); document.body.append(host); return host; };
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe("riepiloghi allarmi: configurazione e stati", () => {
  it("i totali sconosciuti non mostrano zero e gli stati conservati sono espliciti", () => {
    const engine = create(), host = mount(), summary = createHmiAlarmSummary(host, { action: vi.fn() });
    try {
      summary.update(engine.snapshot()); expect(host.textContent).toContain("— · pendenti"); expect(host.textContent).not.toContain("0 attivi");
      known(engine); summary.update(engine.snapshot()); expect(host.textContent).toContain("0 · pendenti");
      sample(engine, 0); sample(engine, 1, "0", 0); summary.update(engine.snapshot());
      expect(host.textContent).toContain("1 · pendenti"); expect(host.textContent).toContain("stato parziale");
      summary.update(engine.snapshot(), false); expect(host.textContent).toContain("— · pendenti");
    } finally { summary.dispose(); }
  });
  it("i dettagli hanno etichette uniche anche senza randomUUID nel browser", () => {
    const engine = create(); known(engine); sample(engine, 0);
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => { throw Error("Not available in this browser"); });
    const hosts = [mount(), mount()];
    const controls = hosts.map(host => createHmiAlarmSummary(host, { action: vi.fn() }));
    try {
      controls.forEach(control => control.update(engine.snapshot())); hosts.forEach(host => button(host, "Mostra allarmi").click());
      const labels = [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.getAttribute("aria-labelledby"));
      expect(labels).toHaveLength(2); expect(new Set(labels).size).toBe(2);
      labels.forEach(label => expect(document.getElementById(label!)?.textContent).toBe("Allarmi"));
    } finally { controls.forEach(control => control.dispose()); }
  });
  it("palette e JSX persistono il contratto senza inventare tag o contatori", () => {
    for (const [kind, type] of [["indicator", "HmiAlarmIndicator"], ["line", "HmiAlarmLine"]] as const) {
      const source = hmiAlarmSummaryJsx(kind); expect(source).toContain(type); expect(source).toContain("In attesa dei segnali"); expect(source).not.toContain("data-plc-variable");
      expect(componentRegistry.get("hmi-alarm-" + kind)?.createJsx()).toContain(type);
    }
  });
  it.each(["bad json", {}, { ...defaultHmiAlarmSummaryConfig(), rows: 4 }, { ...defaultHmiAlarmSummaryConfig(), classes: ["C", "C"] }, { ...defaultHmiAlarmSummaryConfig(), alarmColor: "url(javascript:bad)" }, { ...defaultHmiAlarmSummaryConfig(), pageRoute: null }, { ...defaultHmiAlarmSummaryConfig(), password: "PRIVATE" }])("configurazione errata non diventa una configurazione predefinita", (value) => { expect(parseHmiAlarmSummaryConfig(value)).toBeUndefined(); });
  it("valida destinazioni interne e riporta errori nel controllo progetto", () => {
    const config = { ...defaultHmiAlarmSummaryConfig(), pageRoute: "/missing" };
    expect(hmiAlarmSummaryIssues(config, ["/main"])).toHaveLength(1); expect(hmiAlarmSummaryIssues({ ...config, pageRoute: "//other" })).not.toEqual([]);
    expect(validateHmiProject({ sources: { "src/Page.tsx": `<div ${hmiAlarmSummaryAttribute}='${JSON.stringify(config)}' />` }, routes: ["/main"] })).toMatchObject([{ kind: "alarm-invalid", severity: "error", file: "src/Page.tsx" }]);
  });
  it("il controllo progetto legge anche il JSX dell'Inspector, ignora commenti e non esegue configurazioni dinamiche", () => {
    const config = { ...defaultHmiAlarmSummaryConfig(), pageRoute: "/missing" };
    const source = `export function Page(){return <div ${hmiAlarmSummaryAttribute}={${JSON.stringify(JSON.stringify(config))}} />}`;
    expect(validateHmiProject({ sources: { "src/Page.tsx": source }, routes: ["/main"] })).toMatchObject([{ kind: "alarm-invalid", severity: "error" }]);
    expect(validateHmiProject({ sources: { "src/Page.tsx": `// ${hmiAlarmSummaryAttribute}="broken"\nexport function Page(){return <div/>}` } })).toEqual([]);
    expect(validateHmiProject({ sources: { "src/Page.tsx": `<div ${hmiAlarmSummaryAttribute}={neverExecuteThis()} />` } })).toMatchObject([{ kind: "alarm-invalid", severity: "warning" }]);
  });
  it("zero senza segnale o senza catalogo non è uno stato normale e non nasconde l'indicatore", () => {
    const c = { ...defaultHmiAlarmSummaryConfig(), showAlways: false }, engine = create();
    expect(hmiAlarmSummaryView(undefined, c)).toMatchObject({ state: "unknown", known: false, hidden: false });
    expect(hmiAlarmSummaryView(engine.snapshot(), c)).toMatchObject({ state: "unknown", invalid: 4, hidden: false });
    expect(hmiAlarmSummaryView(createAlarmEngine(emptyAlarmCatalog(), []).snapshot(), c)).toMatchObject({ state: "unknown", hidden: false });
    known(engine); expect(hmiAlarmSummaryView(engine.snapshot(), c)).toMatchObject({ state: "normal", known: true, hidden: true });
  });
  it("conta separatamente guasto, presa visione e conferma; Bad non cancella il guasto", () => {
    const engine = create(), c = defaultHmiAlarmSummaryConfig(); known(engine); sample(engine, 0);
    expect(hmiAlarmSummaryView(engine.snapshot(), c)).toMatchObject({ active: 1, pending: 1, unacknowledged: 1 });
    let row = engine.snapshot().rows[0]; engine.action({ alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: "acknowledge" }, "Prova");
    sample(engine, 0, "0", 0); expect(hmiAlarmSummaryView(engine.snapshot(), c)).toMatchObject({ active: 1, pending: 1, invalid: 1, unacknowledged: 0 });
    sample(engine, 0, "0"); expect(hmiAlarmSummaryView(engine.snapshot(), c)).toMatchObject({ active: 0, pending: 1, unconfirmed: 1 });
    row = engine.snapshot().rows[0]; engine.action({ alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: "confirm" }, "Prova"); expect(hmiAlarmSummaryView(engine.snapshot(), c).pending).toBe(0);
  });
  it("filtra classe/zona/priorità e distingue pendenti, attivi e presa visione", () => {
    const engine = create(); known(engine); variables.forEach((_, i) => sample(engine, i));
    const c = { ...defaultHmiAlarmSummaryConfig(), classes: ["C"], areas: ["Zona 2"], minPriority: 25 };
    expect(hmiAlarmSummaryView(engine.snapshot(), c)).toMatchObject({ count: 1, active: 1, pending: 1 }); expect(alarmSummaryFilter(engine.snapshot().rows[0], c)).toBe(false);
    sample(engine, 3, "0"); expect(hmiAlarmSummaryView(engine.snapshot(), { ...c, mode: "active" }).count).toBe(0); expect(hmiAlarmSummaryView(engine.snapshot(), c).count).toBe(1);
  });
  it("mostra fino a tre messaggi ordinati senza modificare lo snapshot", () => {
    let time = 100; const engine = createAlarmEngine(catalog, variables, { now: () => time++ }); known(engine); [3, 2, 1, 0].forEach((i) => sample(engine, i)); const snapshot = engine.snapshot(), before = JSON.stringify(snapshot);
    expect(hmiAlarmSummaryView(snapshot, { ...defaultHmiAlarmSummaryConfig("line"), rows: 3 }).selected.map((r) => r.id)).toEqual(["a0", "a1", "a2"]);
    expect(hmiAlarmSummaryView(snapshot, { ...defaultHmiAlarmSummaryConfig("line"), rows: 3, order: "priority" }).selected.map((r) => r.id)).toEqual(["a3", "a2", "a1"]); expect(JSON.stringify(snapshot)).toBe(before);
  });
});
describe("riepiloghi DOM e dettaglio filtrato", () => {
  it.each(["visibility", "display", "pointerEvents"])("chiude il dettaglio al blocco CSS %s e non riapre da click sintetici", (property) => {
    const engine = create(); known(engine); sample(engine, 1); const host = mount(), action = vi.fn(), control = createHmiAlarmSummary(host, { action }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Mostra allarmi").click();
    Object.assign(host.style, { [property]: property === "visibility" ? "hidden" : "none" }); control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); button(host, "Mostra allarmi").click(); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); expect(action).not.toHaveBeenCalled(); control.dispose();
  });
  it("mantiene il focus nel popup e spiega la navigazione fallita senza mostrare l'errore privato", () => {
    const engine = create(); known(engine); sample(engine, 1); const host = mount("HmiAlarmIndicator", { ...defaultHmiAlarmSummaryConfig(), pageRoute: "/main" });
    const control = createHmiAlarmSummary(host, { action: vi.fn(), routes: ["/main"], navigate: () => { throw new Error("PRIVATE_SERVER_DATA"); } }); control.update(engine.snapshot()); button(host, "Mostra allarmi").focus(); button(host, "Mostra allarmi").click();
    const popup = document.querySelector<HTMLElement>('[data-hmi-alarm-popup]')!, first = button(popup, "Apri pagina collegata"); first.focus(); const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }); document.dispatchEvent(backward); expect(backward.defaultPrevented).toBe(true); expect(popup.contains(document.activeElement)).toBe(true); expect(document.activeElement).not.toBe(first);
    first.click(); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); expect(host.textContent).toContain("Pagina non aperta"); expect(host.textContent).not.toContain("PRIVATE_SERVER_DATA"); control.dispose();
  });
  it("riga solo lettura, contenuti sicuri e qualità visibile anche con sola icona", () => {
    const engine = create(); known(engine); sample(engine, 0); const line = mount("HmiAlarmLine", defaultHmiAlarmSummaryConfig("line")), action = vi.fn(), control = createHmiAlarmSummary(line, { action }); control.update({ ...engine.snapshot(), actionsEnabled: true });
    expect(line.textContent).toContain("<script>fault</script>"); expect(line.querySelector("script")).toBeNull(); expect(button(line, "Mostra allarmi").hidden).toBe(true); expect(action).not.toHaveBeenCalled();
    const indicator = mount("HmiAlarmIndicator", { ...defaultHmiAlarmSummaryConfig(), display: "icon", flash: true }), summary = createHmiAlarmSummary(indicator, { action }); sample(engine, 0, "0", 0); summary.update({ ...engine.snapshot(), actionsEnabled: true }); expect(indicator.textContent).toContain("segnali non validi"); expect(indicator.getAttribute("aria-label")).toBeNull(); expect(indicator.querySelector('[aria-label]')?.getAttribute("aria-label")).toContain("1 attivi"); expect(indicator.querySelector("style")!.textContent).toContain("prefers-reduced-motion"); control.dispose(); summary.dispose();
  });
  it("dettaglio rispetta gli stessi filtri e l'autorizzazione; Escape restituisce il focus", async () => {
    const engine = create(); known(engine); sample(engine, 0); sample(engine, 3);
    const host = mount("HmiAlarmIndicator", { ...defaultHmiAlarmSummaryConfig(), areas: ["Zona 2"] }), action = vi.fn(async () => undefined), control = createHmiAlarmSummary(host, { action }); control.update({ ...engine.snapshot(), actionsEnabled: false }); const opener = button(host, "Mostra allarmi"); opener.focus(); opener.click();
    const popup = document.querySelector<HTMLElement>('[data-hmi-alarm-popup]')!; expect(popup.querySelector('[role="dialog"]')).toBeTruthy(); expect(popup.textContent).toContain("Motor 3"); expect(popup.textContent).not.toContain("Motor 0"); button(popup, "Motor 3").click(); expect(button(popup, "Prendi in visione").disabled).toBe(true); expect(action).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); expect(document.activeElement).toBe(opener); control.dispose();
  });
  it("qualità, selezione revisionata e aggiornamenti passano al dettaglio aperto", async () => {
    const engine = create(); known(engine); sample(engine, 1); const host = mount();
    const action = vi.fn(async (command) => { engine.action(command, "Prova locale"); control.update({ ...engine.snapshot(), actionsEnabled: true }); }), control = createHmiAlarmSummary(host, { action }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Mostra allarmi").click(); const popup = document.querySelector<HTMLElement>('[data-hmi-alarm-popup]')!; button(popup, "Motor 1").click(); button(popup, "Prendi in visione").click(); await vi.waitFor(() => expect(action).toHaveBeenCalledOnce()); expect(engine.snapshot().rows[1]).toMatchObject({ active: true, acknowledged: true }); expect(host.textContent).toContain("0 da prendere in visione");
    control.update(undefined, false); expect(popup.textContent).toContain("non sono aggiornati"); expect(button(popup, "Prendi in visione").disabled).toBe(true); control.dispose();
  });
  it("regole dell'utente chiudono il dettaglio e impediscono nuove azioni", () => {
    const engine = create(); known(engine); sample(engine, 1); const host = mount(), action = vi.fn(), control = createHmiAlarmSummary(host, { action }); control.update({ ...engine.snapshot(), actionsEnabled: true }); button(host, "Mostra allarmi").click(); host.setAttribute("inert", ""); control.update({ ...engine.snapshot(), actionsEnabled: true }); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); expect(button(host, "Mostra allarmi").disabled).toBe(true); expect(action).not.toHaveBeenCalled(); control.dispose();
  });
  it("configurazione non valida è segnalata, cambi di filtro chiudono il dettaglio, dispose ripristina la bozza", () => {
    const engine = create(), host = mount(); known(engine); const original = document.createElement("span"); original.textContent = "bozza"; host.append(original); host.style.color = "red"; const control = createHmiAlarmSummary(host, { action: vi.fn() }); control.update({ ...engine.snapshot(), actionsEnabled: false }); expect(host.querySelector('[data-hmi-alarm-summary-state="normal"]')).not.toBeNull(); button(host, "Mostra allarmi").click(); host.setAttribute(hmiAlarmSummaryAttribute, '{"PRIVATE":"broken'); control.update({ ...engine.snapshot(), actionsEnabled: false }); expect(host.textContent).toContain("Configurazione allarmi non valida"); expect(host.textContent).not.toContain("PRIVATE"); expect(host.querySelector('[data-hmi-alarm-summary-state="normal"]')).toBeNull(); expect(host.querySelector('[aria-label]')?.getAttribute("aria-label")).toContain("Configurazione allarmi non valida"); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); control.dispose(); expect(host.firstChild).toBe(original); expect(host.style.color).toBe("red"); expect(host.hasAttribute("data-hmi-alarm-summary-root")).toBe(false);
  });
  it("la navigazione richiede una pagina del progetto e non prende in visione l'allarme", () => {
    const engine = create(); known(engine); sample(engine, 1); const host = mount("HmiAlarmIndicator", { ...defaultHmiAlarmSummaryConfig(), pageRoute: "/main" }), navigate = vi.fn(), action = vi.fn(), control = createHmiAlarmSummary(host, { action, navigate, routes: ["/main"] }); control.update({ ...engine.snapshot(), actionsEnabled: false }); button(host, "Mostra allarmi").click(); button(document, "Apri pagina collegata").click(); expect(navigate).toHaveBeenCalledWith("/main"); expect(action).not.toHaveBeenCalled(); expect(document.querySelector('[data-hmi-alarm-popup]')).toBeNull(); control.dispose();
  });
});
