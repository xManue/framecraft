import { parse } from "@babel/parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHmiDataLogRuntime,
  emptyHmiDataLogCatalog,
  hmiDataLogCatalogIssues,
  hmiDataLogRuntimeModuleSource,
  parseHmiDataLogCatalog,
  serializeHmiDataLogCatalog,
  type HmiDataLogCatalog,
  type HmiDataLogStorage,
} from "../src/core/hmiDataLogs";

const memoryStorage = (): HmiDataLogStorage & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
};

function configuredCatalog(): HmiDataLogCatalog {
  return {
    version: 1,
    projectKey: "oven",
    logs: [{
      id: "process", name: "Processo", enabled: true, storage: "browser-local", retentionMs: 86_400_000, maxEntries: 100, segmentDurationMs: 3_600_000,
      tags: [
        { id: "temperature", name: "Temperatura", tag: "Oven.Temperature", mode: "on-change", cycleMs: 1_000, includeUnchanged: false, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 60_000 },
        { id: "pressure", name: "Pressione", tag: "Oven.Pressure", mode: "on-demand", cycleMs: 1_000, triggerTag: "Oven.Store", triggerCondition: "rising", includeUnchanged: true, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 60_000 },
        { id: "speed", name: "Velocità", tag: "Oven.Speed", mode: "cyclic", cycleMs: 500, includeUnchanged: true, smoothingSamples: 1, aggregation: "none", aggregationWindowMs: 60_000 },
      ],
    }],
  };
}

afterEach(() => vi.useRealTimers());

describe("Data Log Unified", () => {
  it("normalizza, serializza e valida log, modalità e variabili PLC", () => {
    const catalog = parseHmiDataLogCatalog(serializeHmiDataLogCatalog(configuredCatalog()));
    catalog.logs[0].tags.push({ ...catalog.logs[0].tags[0], id: "temperature", tag: "Missing.Tag", cycleMs: 100, mode: "cyclic" });
    const issues = hmiDataLogCatalogIssues(catalog, [{ name: "Oven.Temperature", dataType: "Real", access: "read", address: "%MD0", description: "" }]);
    expect(issues.some((issue) => issue.message.includes("duplicato"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("500 ms"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Missing.Tag"))).toBe(true);
  });

  it("acquisisce su variazione, trigger e ciclo, conserva quality e ricarica l'archivio persistente", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    let at = 1_000;
    const values = { "Oven.Temperature": "20", "Oven.Pressure": "1.2", "Oven.Speed": "100", "Oven.Store": "0" };
    const status = { "Oven.Temperature": { qualityCode: 192, timeStamp: at } };
    const runtime = createHmiDataLogRuntime(configuredCatalog(), { storage, now: () => at });
    runtime.start(() => ({ values, status }));
    expect(runtime.updateSnapshot(values, status)).toBe(1);
    at = 1_500;
    expect(runtime.updateTag("Oven.Temperature", "20", { qualityCode: 192, timeStamp: at })).toBe(0);
    values["Oven.Temperature"] = "25";
    expect(runtime.updateTag("Oven.Temperature", "25", { qualityCode: 128, timeStamp: at })).toBe(1);
    runtime.updateTag("Oven.Store", "0");
    at = 2_000; runtime.updateTag("Oven.Store", "1");
    expect(runtime.query("process", "pressure")).toHaveLength(1);
    at = 2_500; vi.advanceTimersByTime(500);
    expect(runtime.query("process", "speed")).toHaveLength(1);
    expect(runtime.query("process", "temperature")[1]).toMatchObject({ value: "25", qualityCode: 128, segmentStart: 0 });
    runtime.stop();

    const restored = createHmiDataLogRuntime(configuredCatalog(), { storage, now: () => at });
    expect(restored.query("process", "temperature")).toHaveLength(2);
    expect(restored.query("process", "pressure")).toHaveLength(1);
    restored.clear(); restored.flush();
    expect(restored.sampleCount()).toBe(0);
  });

  it("applica media mobile, aggregazione e limite massimo senza trasformare il log in un buffer grafico", () => {
    let at = 0;
    const catalog = configuredCatalog();
    catalog.logs[0].tags = [{ id: "temperature", name: "Temperatura", tag: "Oven.Temperature", mode: "on-change", cycleMs: 1_000, includeUnchanged: true, smoothingSamples: 2, aggregation: "average", aggregationWindowMs: 500 }];
    const values = { "Oven.Temperature": "10" };
    const runtime = createHmiDataLogRuntime(catalog, { storage: memoryStorage(), now: () => at });
    runtime.start(() => ({ values }));
    runtime.updateTag("Oven.Temperature", "10");
    at = 100; values["Oven.Temperature"] = "20"; runtime.updateTag("Oven.Temperature", "20");
    at = 600; runtime.tick(at);
    expect(runtime.query("process", "temperature")).toMatchObject([{ time: 500, value: "12.5" }]);
    runtime.stop();
  });

  it("scarica anche l'ultimo intervallo aggregato parziale quando il Runtime viene fermato", () => {
    let at = 100;
    const catalog = configuredCatalog();
    catalog.logs[0].tags = [{ id: "temperature", name: "Temperatura", tag: "Oven.Temperature", mode: "on-change", cycleMs: 1_000, includeUnchanged: true, smoothingSamples: 1, aggregation: "maximum", aggregationWindowMs: 1_000 }];
    const runtime = createHmiDataLogRuntime(catalog, { storage: memoryStorage(), now: () => at });
    runtime.updateSnapshot({ "Oven.Temperature": "10" });
    at = 250; runtime.updateSnapshot({ "Oven.Temperature": "30" });
    expect(runtime.query("process", "temperature")).toHaveLength(0);
    runtime.stop();
    expect(runtime.query("process", "temperature")).toMatchObject([{ time: 250, value: "30" }]);
  });

  it("genera un modulo Runtime autonomo e privo di eval", () => {
    const source = hmiDataLogRuntimeModuleSource();
    expect(() => parse(source, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(emptyHmiDataLogCatalog("panel-a").projectKey).toBe("panel-a");
  });
});
