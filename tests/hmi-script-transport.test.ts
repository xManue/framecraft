import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiScriptScope, executeHmiScript, executeHmiScriptAsync, inspectHmiScript, type HmiScriptCommandResult, type HmiScriptTransport } from "../src/core/hmiScript";
import { createHmiScriptContextManager, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

const program = (source: string) => { const inspected = inspectHmiScript(source); expect(inspected.error).toBeUndefined(); return inspected.program!; };
const delivered = (tag: string): HmiScriptCommandResult => ({ tag, outcome: "delivered", delivery: "broker-ack", plcConfirmed: false });
const transport = (): HmiScriptTransport => ({ read: vi.fn(async () => ({ value: "10", status: { qualityKnown: false, timeStamp: 100 } })), write: vi.fn(async (request) => delivered(request.tag)) });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("continuazioni script collegate al trasporto reale", () => {
  it("attende davvero la ricevuta, non rigioca effetti e non aggiorna il dato acquisito", async () => {
    const driver = transport(); let resolve!: (value: HmiScriptCommandResult) => void;
    driver.write = vi.fn(() => new Promise<HmiScriptCommandResult>(r => { resolve = r; }));
    const scope = createHmiScriptScope(program("let counter = 0;"));
    const input = { Speed: "4" };
    const pending = executeHmiScriptAsync(program('counter = counter + 1; Tags("Speed").Write(20); counter = counter + 1; return Tags("Speed").Read();'), input, { transport: driver, globalScope: scope });
    await vi.waitFor(() => expect(driver.write).toHaveBeenCalledOnce());
    expect(scope.values.get("counter")).toBe(1);
    resolve(delivered("Speed"));
    const result = await pending;
    expect(result.error).toBeUndefined(); expect(scope.values.get("counter")).toBe(2);
    expect(result).toMatchObject({ returned: 10, reads: { Speed: "10" }, writes: {}, commands: [delivered("Speed")] });
    expect(result.tagStatus.Speed.qualityCode).toBe(0); expect(result.tagStatus.Speed.qualityKnown).toBe(false);
    expect(input.Speed).toBe("4"); expect(driver.write).toHaveBeenCalledOnce();
  });

  it("mantiene fulfilled un batch parziale e LastError distinto per tag", async () => {
    const driver = transport();
    driver.write = vi.fn<HmiScriptTransport["write"]>(async (request) => request.tag === "A" ? delivered("A") : { tag: "B", outcome: "uncertain", plcConfirmed: false, error: "Risposta persa" });
    const result = await executeHmiScriptAsync(program('const set = Tags.CreateTagSet([["A", 5], ["B", 8]]); await set.WriteAsync(0); HMIRuntime.Trace(String(set.LastError)); HMIRuntime.Trace(String(set("B").LastError));'), {}, { transport: driver });
    expect(result.error).toBeUndefined(); expect(result.traces).toEqual([String(0x80040004), String(0x80040003)]);
    expect(result.commands?.map(x => x.outcome)).toEqual(["delivered", "uncertain"]); expect(result.writes).toEqual({});
    expect(driver.write).toHaveBeenCalledTimes(2);
  });

  it("passa nel catch se nessun tag viene consegnato, senza ritentare", async () => {
    const driver = transport(); driver.write = vi.fn<HmiScriptTransport["write"]>(async request => ({ tag: request.tag, outcome: "rejected", plcConfirmed: false, error: "Read only" }));
    const result = await executeHmiScriptAsync(program('const set = Tags.CreateTagSet([["A", 1], ["B", 2]]); set.WriteAsync().then(function(result) { HMIRuntime.Trace("NO"); }).catch(function(code) { HMIRuntime.Trace(String(code)); });'), {}, { transport: driver });
    expect(result.error).toBeUndefined(); expect(result.traces).toEqual([String(0x80040004)]); expect(driver.write).toHaveBeenCalledTimes(2);
  });

  it("aggiorna Value solo con ReadAsync, non con WriteAsync", async () => {
    const result = await executeHmiScriptAsync(program('const set = Tags.CreateTagSet([["Speed", 20]]); await set.WriteAsync(); HMIRuntime.Trace(String(set("Speed").Value)); await set.ReadAsync(); return set("Speed").Value;'), { Speed: "4" }, { transport: transport() });
    expect(result).toMatchObject({ returned: 10, traces: ["20"], writes: {}, reads: { Speed: "10" } });
  });

  it("sospende moduli annidati, array, switch e inizializzatori senza duplicarli", async () => {
    const driver = transport();
    const catalog = parseHmiScriptCatalog({ globalModules: [{ alias: "Tools", name: "Tools", globalDefinition: { source: 'let start = Tags("Speed").Read(); let counter = 0;' }, functions: [{ name: "Next", parameters: [], source: 'counter = counter + 1; const set = Tags.CreateTagSet([["A", counter]]); await set.WriteAsync(); return counter + start;' }] }] });
    const contexts = createHmiScriptContextManager();
    const result = await executeHmiScriptAsync(program('const array = [Modules.Tools.Next(), Modules.Tools.Next()]; switch (12) { case Modules.Tools.Next(): return array[0] + array[1]; default: return array[1]; }'), {}, { transport: driver, ...contexts.options(catalog, "page") });
    expect(result.error).toBeUndefined(); expect(result.returned).toBe(12); expect(driver.write).toHaveBeenCalledTimes(3); expect(driver.read).toHaveBeenCalledOnce();
    expect(result.reads).toEqual({ Speed: "10" }); expect(result.commands).toHaveLength(3);
  });

  it("esclude l'attesa della rete dal budget CPU anche dopo un modulo", async () => {
    vi.useFakeTimers({ now: 1000 });
    const driver = transport(); let resolve!: (value: HmiScriptCommandResult) => void;
    driver.write = vi.fn(() => new Promise<HmiScriptCommandResult>(r => { resolve = r; }));
    const catalog = parseHmiScriptCatalog({ globalModules: [{ alias: "Tools", name: "Tools", functions: [{ name: "Send", parameters: [], source: 'Tags("A").Write(1); return 2;' }] }] });
    const contexts = createHmiScriptContextManager();
    const pending = executeHmiScriptAsync(program("const sent = Modules.Tools.Send(); return sent + 1;"), {}, { transport: driver, timeoutMs: 50, transportTimeoutMs: 5000, ...contexts.options(catalog, "page") });
    await vi.advanceTimersByTimeAsync(1000); resolve(delivered("A"));
    expect(await pending).toMatchObject({ returned: 3 });
  });

  it("alla chiusura segnala esito incerto e non invia il comando seguente", async () => {
    const driver = transport(); const abort = new AbortController();
    driver.write = vi.fn(() => new Promise<HmiScriptCommandResult>(() => {}));
    const pending = executeHmiScriptAsync(program('try { Tags("A").Write(1); } catch(code) { HMIRuntime.Trace(String(code)); } Tags("B").Write(2);'), {}, { transport: driver, signal: abort.signal });
    await vi.waitFor(() => expect(driver.write).toHaveBeenCalledOnce()); abort.abort();
    const result = await pending; expect(result.error).toContain("attivo"); expect(result.commands?.[0].outcome).toBe("uncertain"); expect(driver.write).toHaveBeenCalledOnce();
  });

  it("un timeout non lascia in sospeso la coda e non ritenta", async () => {
    const driver = transport(); driver.write = vi.fn(() => new Promise<HmiScriptCommandResult>(() => {}));
    const result = await executeHmiScriptAsync(program('Tags("A").Write(1); Tags("B").Write(2);'), {}, { transport: driver, transportTimeoutMs: 15 });
    expect(result.commands?.[0].outcome).toBe("uncertain"); expect(result.error).toBeTruthy(); expect(driver.write).toHaveBeenCalledOnce();
  });

  it("rifiuta ricevute incoerenti o falsamente confermate dal PLC", async () => {
    const driver = transport(); driver.write = vi.fn(async () => ({ ...delivered("Other"), plcConfirmed: true } as unknown as HmiScriptCommandResult));
    const result = await executeHmiScriptAsync(program('Tags("A").Write(1);'), {}, { transport: driver });
    expect(result.commands?.[0].outcome).toBe("uncertain"); expect(result.error).toContain("non valida"); expect(result.writes).toEqual({});
  });

  it("non spaccia la consegna MQTT per hmiWriteWait e non invia il comando", async () => {
    const driver = transport();
    const result = await executeHmiScriptAsync(program('const set = Tags.CreateTagSet([["A", 5]]); await set.WriteAsync(HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteWait);'), {}, { transport: driver });
    expect(result.error).toContain("conferma PLC"); expect(result.commands).toMatchObject([{ tag: "A", outcome: "rejected", plcConfirmed: false }]);
    expect(driver.write).not.toHaveBeenCalled(); expect(result.writes).toEqual({});
  });

  it("non manda tag locali del faceplate sul PLC", async () => {
    const driver = transport(); const result = await executeHmiScriptAsync(program('Tags("Local.State").Write(2); return Tags("Local.State").Read();'), {}, { transport: driver, localTags: new Set(["Local.State"]) });
    expect(result).toMatchObject({ returned: 2, writes: { "Local.State": "2" }, commands: [] }); expect(driver.write).not.toHaveBeenCalled(); expect(driver.read).not.toHaveBeenCalled();
  });

  it("impedisce I/O nell'esecutore sincrono e scritture bit simulate in modalità connessa", async () => {
    const driver = transport(); expect(executeHmiScript(program('Tags("A").Write(1);'), {}, { transport: driver }).error).toContain("executeHmiScriptAsync");
    expect((await executeHmiScriptAsync(program('HMIRuntime.Tags.SysFct.SetBitInTag("A", 2);'), {}, { transport: driver })).error).toContain("atomica"); expect(driver.write).not.toHaveBeenCalled();
  });

  it("le guardie del Runtime sincrono valgono anche per Write e bit", () => {
    for (const source of ['Tags("A").Write(1);', 'HMIRuntime.Tags.SysFct.SetBitInTag("A", 1);']) {
      const result = executeHmiScript(program(source), { A: "0" }, { writeFailures: { A: { description: "Non supportato" } } });
      expect(result.error).toContain("Non supportato"); expect(result.writes).toEqual({});
    }
  });
  it("finally esegue il cleanup anche dopo una scrittura respinta non intercettata", async () => {
    const driver = transport(); driver.write = vi.fn<HmiScriptTransport["write"]>(async request => ({ tag: request.tag, outcome: "rejected", plcConfirmed: false, error: "Denied" }));
    const result = await executeHmiScriptAsync(program('try { Tags("A").Write(1); } finally { HMIRuntime.Trace("cleanup"); }'), {}, { transport: driver });
    expect(result.error).toContain("Denied"); expect(result.traces).toEqual(["cleanup"]); expect(driver.write).toHaveBeenCalledOnce();
  });
});
