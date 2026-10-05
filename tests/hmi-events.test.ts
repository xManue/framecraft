import { describe, expect, it } from "vitest";
import { executeHmiEvent, executeHmiEventAsync, hmiEventTypesFor, newHmiEvent, parseHmiEvents, serializeHmiEvents } from "../src/core/hmiEvents";

describe("eventi Runtime HMI", () => {
  it("salva insieme allo script il programma sicuro per il pannello generato", () => {
    const raw = serializeHmiEvents([{ event: "Tapped", script: 'HMIRuntime.Tags.SysFct.SetTagValue("Command", 1);' }]);
    expect(raw).toContain('"program":{"version":1');
    const parsed = parseHmiEvents(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ event: "Tapped", script: 'HMIRuntime.Tags.SysFct.SetTagValue("Command", 1);' });
    expect(parsed[0].program?.statements).toHaveLength(1);
  });

  it("esegue trace, scritture e navigazione con i valori Runtime", () => {
    const binding = {
      event: "Down" as const,
      script: [
        'HMIRuntime.Trace("start");',
        'Tags("Command").Write(Tags("Enable").Read());',
        'HMIRuntime.UI.SysFct.OpenScreen("/manuals");',
      ].join("\n"),
    };
    expect(executeHmiEvent(binding, { Enable: "1" })).toMatchObject({
      writes: { Command: "1" }, traces: ["start"], navigation: ["/manuals"],
    });
  });

  it("ignora eventi sconosciuti e crea un Tapped modificabile", () => {
    expect(parseHmiEvents([{ event: "Unknown", script: "return 1" }])).toEqual([]);
    expect(newHmiEvent()).toMatchObject({ event: "Tapped" });
  });

  it("passa la direzione allo script GestureDetected", () => {
    const binding = {
      event: "GestureDetected" as const,
      script: 'if (gesture == UI.Enums.HmiGesture.SwipeDown) Tags("Direction").Write(4);',
    };
    expect(executeHmiEvent(binding, {}, { gesture: "SwipeDown" }).writes).toEqual({ Direction: "4" });
    expect(executeHmiEvent(binding, {}, { gesture: "SwipeUp" }).writes).toEqual({});
  });

  it("esegue gli eventi con Promise TagSet senza bloccare il contratto sincrono", async () => {
    const binding = {
      event: "Tapped" as const,
      script: [
        'let tags = Tags.CreateTagSet([["Command.Speed", 1200], ["Command.Start", true]]);',
        "tags.WriteAsync().then(function(result) {",
        '  HMIRuntime.Trace("written=" + result.Count);',
        "});",
      ].join("\n"),
    };
    expect(executeHmiEvent(binding, {}).error).toContain("executeHmiScriptAsync");
    await expect(executeHmiEventAsync(binding, {})).resolves.toMatchObject({
      writes: { "Command.Speed": "1200", "Command.Start": "true" }, traces: ["written=2"],
    });
  });

  it("passa qualità e timestamp impostati nella simulazione allo script", async () => {
    const binding = {
      event: "Loaded" as const,
      script: 'let tags = Tags.CreateTagSet(["Machine.Live"]); tags.ReadAsync().then(function(result) { HMIRuntime.Trace(String(result("Machine.Live").QualityCode) + "@" + result("Machine.Live").TimeStamp); });',
    };
    const result = await executeHmiEventAsync(binding, { "Machine.Live": "1" }, {
      tagStatus: { "Machine.Live": { qualityCode: 64, timeStamp: "2026-09-25T10:30" } },
    });
    expect(result.traces).toEqual(["64@2026-09-25T10:30"]);
  });

  it("propone gli eventi compatibili con la famiglia dell'oggetto", () => {
    const props = {};
    expect(hmiEventTypesFor({ type: "button", props })).toEqual(expect.arrayContaining(["Down", "Up", "ContextTapped"]));
    expect(hmiEventTypesFor({ type: "button", props })).not.toContain("Loaded");
    expect(hmiEventTypesFor({ type: "main", props: { "data-hmi-type": "HmiScreen" } })).toEqual(expect.arrayContaining(["Loaded", "Unloaded", "HotKey"]));
    expect(hmiEventTypesFor({ type: "input", props })).toContain("Change");
    expect(hmiEventTypesFor({ type: "div", props: { "data-hmi-type": "CustomWebControl" } })).toContain("InterfaceEvent");
  });

  it("passa tastiera e payload dei controlli come variabili locali sicure", () => {
    expect(executeHmiEvent({ event: "KeyDown", script: 'if (key === "Enter") Tags("Key.Ok").Write(true);' }, {}, { key: "Enter" }).writes).toEqual({ "Key.Ok": "true" });
    expect(executeHmiEvent({ event: "CommandFired", script: 'if (command === "Export") Tags("Command.Ok").Write(true);' }, {}, { command: "Export" }).writes).toEqual({ "Command.Ok": "true" });
    expect(executeHmiEvent({ event: "InterfaceEvent", script: 'HMIRuntime.Trace(interfaceEvent);' }, {}, { interfaceEvent: "RecipeLoaded" }).traces).toEqual(["RecipeLoaded"]);
  });

  it("passa nome e parametri dell'evento faceplate allo script dell'istanza", async () => {
    const result = await executeHmiEventAsync({ event: "InterfaceEvent", script: 'HMIRuntime.Trace(interfaceEvent + ":" + motor); Tags("Faceplate.Selected").Write(index);' }, {}, {
      interfaceEvent: "MotorSelected", parameters: { motor: "M2400", index: 3 },
    });
    expect(result.traces).toEqual(["MotorSelected:M2400"]);
    expect(result.writes).toEqual({ "Faceplate.Selected": "3" });
  });
});
