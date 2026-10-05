import { describe, expect, it } from "vitest";
import { executeHmiScript, executeHmiScriptAsync, inspectHmiScript, type HmiScriptProgram, type HmiScriptTimerCallback } from "../src/core/hmiScript";
import { hmiScriptFunctions, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";
import { createHmiTimerManager, type HmiTimerClock } from "../src/core/hmiTimers";

function fakeClock() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { callback: () => void; due: number; delay: number; interval: boolean }>();
  const clock: HmiTimerClock = {
    now: () => now,
    setTimeout(callback, delay) { const id = nextHandle++; pending.set(id, { callback, due: now + delay, delay, interval: false }); return id; },
    clearTimeout(handle) { pending.delete(Number(handle)); },
    setInterval(callback, delay) { const id = nextHandle++; pending.set(id, { callback, due: now + delay, delay, interval: true }); return id; },
    clearInterval(handle) { pending.delete(Number(handle)); },
  };
  return {
    clock,
    advance(milliseconds: number) {
      const target = now + milliseconds;
      while (true) {
        const due = [...pending.entries()].filter(([, item]) => item.due <= target).sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
        if (!due) break;
        now = due[1].due;
        if (due[1].interval) due[1].due += due[1].delay;
        else pending.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
  };
}

const callbackProgram = (callback: HmiScriptTimerCallback): HmiScriptProgram => callback.kind === "inline"
  ? callback.program
  : { version: 1, statements: [{ kind: "module-call", call: callback.call }] };

describe("HMIRuntime.Timers", () => {
  it("crea un interval con callback di modulo, restituisce l'ID e lo cancella", async () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Clock", alias: "Clock", functions: [{ name: "Tick", parameters: [], source: 'Tags("Tick").Write(1);' }] }] });
    const functions = hmiScriptFunctions(catalog);
    const fired: string[] = [];
    const fake = fakeClock();
    let manager: ReturnType<typeof createHmiTimerManager>;
    manager = createHmiTimerManager(async (callback) => {
      const result = await executeHmiScriptAsync(callbackProgram(callback), {}, { functions, timerManager: manager });
      fired.push(result.writes.Tick);
    }, undefined, fake.clock);
    const setup = inspectHmiScript('const timerId = HMIRuntime.Timers.SetInterval(Modules.Clock.Tick, 1000); Tags("Timer.Id").Write(timerId);', functions);
    expect(setup.error).toBeUndefined();
    expect(executeHmiScript(setup.program!, {}, { functions, timerManager: manager }).writes).toEqual({ "Timer.Id": "1" });
    expect(manager.snapshot()).toMatchObject([{ id: 1, mode: "interval", delayMs: 1000 }]);
    fake.advance(2000);
    await Promise.resolve();
    await Promise.resolve();
    expect(fired).toEqual(["1", "1"]);
    const clear = inspectHmiScript('HMIRuntime.Timers.ClearInterval(Tags("Timer.Id").Read());');
    expect(executeHmiScript(clear.program!, { "Timer.Id": "1" }, { timerManager: manager }).error).toBeUndefined();
    expect(manager.snapshot()).toEqual([]);
  });

  it("esegue una callback inline una sola volta e ne ispeziona le dipendenze", async () => {
    const fake = fakeClock();
    const writes: Record<string, string>[] = [];
    let manager: ReturnType<typeof createHmiTimerManager>;
    manager = createHmiTimerManager(async (callback) => {
      const result = await executeHmiScriptAsync(callbackProgram(callback), { Source: "7" }, { timerManager: manager });
      writes.push(result.writes);
    }, undefined, fake.clock);
    const inspection = inspectHmiScript('HMIRuntime.Timers.SetTimeout(() => { Tags("Result").Write(Tags("Source").Read()); }, 250);');
    expect(inspection).toMatchObject({ tagsRead: ["Source"], tagsWritten: ["Result"] });
    expect(executeHmiScript(inspection.program!, {}, { timerManager: manager }).error).toBeUndefined();
    fake.advance(250);
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual([{ Result: "7" }]);
    expect(manager.snapshot()).toEqual([]);
  });

  it("rifiuta callback, firme, ritardi e contesti timer non validi", () => {
    expect(inspectHmiScript("HMIRuntime.Timers.SetTimeout(fetch, 10);").error).toContain("callback inline");
    expect(executeHmiScript(inspectHmiScript("HMIRuntime.Timers.SetTimeout(() => {}, 1);").program!, {}).error).toContain("gestore timer");
    const manager = createHmiTimerManager(() => undefined, undefined, fakeClock().clock);
    expect(executeHmiScript(inspectHmiScript("HMIRuntime.Timers.SetTimeout(() => {}, -1);").program!, {}, { timerManager: manager }).error).toContain("UInt32");
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Bad", alias: "Bad", functions: [{ name: "NeedsValue", parameters: ["value"], source: "return value;" }] }] });
    expect(inspectHmiScript("HMIRuntime.Timers.SetInterval(Modules.Bad.NeedsValue, 10);", hmiScriptFunctions(catalog)).error).toContain("richiede 1 argomenti");
    expect(executeHmiScript(inspectHmiScript("HMIRuntime.Timers.ClearTimeout(1);").program!, {}).error).toContain("gestore timer");
  });
});
