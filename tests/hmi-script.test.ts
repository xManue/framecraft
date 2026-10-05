import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import { executeHmiScript, executeHmiScriptAsync, hmiScriptRuntimeModuleSource, inspectHmiScript } from "../src/core/hmiScript";
import { hmiScriptCatalogIssues, hmiScriptFunctions, hmiScriptModulesRuntimeSource, parseHmiScriptCatalog, serializeHmiScriptCatalog } from "../src/core/hmiScriptModules";
import { createHmiFaceplatePopupManager } from "../src/core/hmiPopupManager";

describe("sandbox script HMI", () => {
  it("compila Faceplate.RaiseEvent e conserva parametri scalari senza eval", () => {
    const inspection = inspectHmiScript('Faceplate.RaiseEvent("Selected", { index: 4, accepted: true, label: "M2400" });');
    expect(inspection.error).toBeUndefined();
    expect(executeHmiScript(inspection.program!, {}).faceplateEvents).toEqual([{
      name: "Selected", parameters: { index: 4, accepted: true, label: "M2400" },
    }]);
    expect(inspectHmiScript('Faceplate.RaiseEvent("Selected", window);').error).toContain("oggetto");
  });

  it("compila ed esegue funzioni di modulo globali e locali senza eval", () => {
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "Conversioni", alias: "Units", functions: [{ name: "Scale", parameters: ["value", "factor"], source: 'HMIRuntime.Trace("scale"); return value * factor;' }] }],
      localDefinitions: [{ scope: "2001", context: "events", functions: [{ name: "WriteSpeed", parameters: ["value"], source: 'Tags("Command.Speed").Write(value);' }] }],
    });
    const inspection = inspectHmiScript('const scaled = Modules.Units.Scale(12, 10); Local.WriteSpeed(scaled); return scaled;');
    expect(inspection.error).toBeUndefined();
    const result = executeHmiScript(inspection.program!, {}, { functions: hmiScriptFunctions(catalog, "2001", "events") });
    expect(result).toMatchObject({ returned: 120, writes: { "Command.Speed": "120" }, traces: ["scale"] });
  });

  it("rifiuta funzioni non importate, firme errate e ricorsione", () => {
    const missing = inspectHmiScript("return Modules.Tools.Missing(1);");
    expect(executeHmiScript(missing.program!, {}).error).toContain("non definita");
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Loop", alias: "Loop", functions: [{ name: "Again", parameters: [], source: "return Modules.Loop.Again();" }] }] });
    const functions = hmiScriptFunctions(catalog);
    expect(executeHmiScript(inspectHmiScript("return Modules.Loop.Again();").program!, {}, { functions }).error).toContain("ricorsiva");
    expect(executeHmiScript(inspectHmiScript("return Modules.Loop.Again(1);").program!, {}, { functions }).error).toContain("richiede 0 argomenti");
  });

  it("serializza programmi compilati e separa il contesto locale", () => {
    const serialized = serializeHmiScriptCatalog(parseHmiScriptCatalog({
      globalModules: [],
      localDefinitions: [
        { scope: "2001", context: "events", functions: [{ name: "EventOnly", source: "return 1;" }] },
        { scope: "2001", context: "dynamizations", functions: [{ name: "DynamicOnly", source: "return 2;" }] },
      ],
    }));
    const parsed = parseHmiScriptCatalog(serialized);
    expect(JSON.parse(serialized).localDefinitions[0].functions[0].program.version).toBe(1);
    expect(Object.keys(hmiScriptFunctions(parsed, "2001", "events"))).toContain("Local.EventOnly");
    expect(Object.keys(hmiScriptFunctions(parsed, "2001", "events"))).not.toContain("Local.DynamicOnly");
    expect(hmiScriptModulesRuntimeSource()).toContain("const identifier = /");
  });

  it("porta nell'ispezione le dipendenze dei moduli e segnala i collegamenti mancanti", () => {
    const catalog = parseHmiScriptCatalog({ globalModules: [{ name: "Machine", alias: "Machine", functions: [{
      name: "Ready", parameters: [], source: 'const ready = Tags("Machine.Ready").Read(); Tags("Machine.Checked").Write(ready); return ready;',
    }] }] });
    const functions = hmiScriptFunctions(catalog);
    expect(inspectHmiScript("return Modules.Machine.Ready();", functions)).toMatchObject({
      tagsRead: ["Machine.Ready"], tagsWritten: ["Machine.Checked"], hasReturn: true,
    });
    expect(inspectHmiScript("return Modules.Unknown.Ready();", functions).error).toContain("non definita");
  });

  it("conserva e segnala nomi vuoti invece di eliminare silenziosamente le voci", () => {
    const catalog = parseHmiScriptCatalog({
      globalModules: [{ name: "", alias: "", functions: [{ name: "", source: "return 1;" }] }],
      localDefinitions: [{ scope: "", context: "events", functions: [{ name: "", source: "return 2;" }] }],
    });
    expect(catalog.globalModules).toHaveLength(1);
    expect(catalog.globalModules[0].functions).toHaveLength(1);
    expect(catalog.localDefinitions).toHaveLength(1);
    expect(catalog.localDefinitions[0].functions).toHaveLength(1);
    expect(hmiScriptCatalogIssues(catalog)).toEqual(expect.arrayContaining([
      "Il nome del modulo globale e' obbligatorio.",
      "Alias globale non valido: . Usa un identificatore JavaScript.",
      "La pagina / route della definizione locale e' obbligatoria.",
    ]));
  });
  it("legge tag, restituisce una proprieta' e registra trace senza eval", () => {
    const source = [
      'const stateTag = Tags("Machine.State");',
      "const state = stateTag.Read();",
      'HMIRuntime.Trace("state=" + state);',
      'return state === 1 ? "#FF00A1D1" : "#FF808080";',
    ].join("\n");
    const inspection = inspectHmiScript(source);
    expect(inspection).toMatchObject({ tagsRead: ["Machine.State"], tagsWritten: [], hasReturn: true });
    expect(inspection.error).toBeUndefined();
    const result = executeHmiScript(inspection.program!, { "Machine.State": "1" });
    expect(result).toMatchObject({ returned: "#FF00A1D1", traces: ["state=1"], writes: {}, navigation: [] });
  });

  it("esegue scritture, bit, if, switch e cambio pagina in modo deterministico", () => {
    const source = [
      'let command = Tags("Command");',
      'command.Write(2);',
      'HMIRuntime.Tags.SysFct.SetBitInTag("Command", 0);',
      'if (Tags("Ready").Read()) HMIRuntime.Tags.SysFct.SetTagValue("Speed", 120);',
      'switch (Tags("Mode").Read()) { case 3: HMIRuntime.UI.SysFct.ChangeScreen("/settings"); break; default: HMIRuntime.Trace("idle"); }',
    ].join("\n");
    const inspection = inspectHmiScript(source);
    expect(inspection).toMatchObject({ tagsRead: ["Ready", "Mode"], tagsWritten: ["Command", "Speed"], hasReturn: false });
    const result = executeHmiScript(inspection.program!, { Ready: "1", Mode: "3", Command: "0" });
    expect(result.error).toBeUndefined();
    expect(result.writes).toEqual({ Command: "3", Speed: "120" });
    expect(result.navigation).toEqual(["/settings"]);
  });

  it("blocca rete, DOM, eval, funzioni e loop", () => {
    for (const source of [
      'fetch("/api")',
      'eval("1 + 1")',
      "document.body.remove()",
      "while (true) {}",
      "function helper() { return 1; }",
    ]) expect(inspectHmiScript(source).error, source).toBeTruthy();
  });

  it("esegue il parametro gesture e gli enum usati dagli script WinCC reali", () => {
    const inspection = inspectHmiScript([
      "if (gesture == UI.Enums.HmiGesture.SwipeLeft) {",
      '  HMIRuntime.UI.SysFct.ChangeScreen("1041_Counters", ".");',
      "}",
    ].join("\n"));
    expect(inspection.error).toBeUndefined();
    expect(executeHmiScript(inspection.program!, {}, { locals: { gesture: "SwipeLeft" } }).navigation).toEqual(["1041_Counters"]);
    expect(executeHmiScript(inspection.program!, {}, { locals: { gesture: "SwipeRight" } }).navigation).toEqual([]);
  });

  it("legge piu' tag con il contratto sincrono TagSet di WinCC", () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Machine.Speed", "Machine.State"]);',
      "tagSet.Read();",
      'HMIRuntime.Trace(String(tagSet("Machine.Speed").Value));',
      'return tagSet("Machine.State").Value;',
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsRead: ["Machine.Speed", "Machine.State"], tagsWritten: [], hasReturn: true });
    expect(inspection.error).toBeUndefined();
    const result = executeHmiScript(inspection.program!, { "Machine.Speed": "1250", "Machine.State": "2" });
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      returned: 2,
      traces: ["1250"],
      writes: {},
    });
  });

  it("prepara e scrive insieme i valori di un TagSet", () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Command.Start", "Command.Speed"]);',
      'tagSet("Command.Start").Value = true;',
      'tagSet("Command.Speed").Value = 900;',
      "tagSet.Write();",
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsRead: [], tagsWritten: ["Command.Start", "Command.Speed"], hasReturn: false });
    expect(inspection.error).toBeUndefined();
    expect(executeHmiScript(inspection.program!, {}).writes).toEqual({ "Command.Start": "true", "Command.Speed": "900" });
  });

  it("supporta la forma compatta nome-valore di CreateTagSet", () => {
    const inspection = inspectHmiScript('Tags.CreateTagSet([["Command.Mode", 3], ["Command.Reset", false]]).Write();');
    expect(inspection).toMatchObject({ tagsRead: [], tagsWritten: ["Command.Mode", "Command.Reset"] });
    expect(inspection.error).toBeUndefined();
    expect(executeHmiScript(inspection.program!, {}).writes).toEqual({ "Command.Mode": "3", "Command.Reset": "false" });
  });

  it("rende espliciti gli errori e le forme TagSet non supportate", () => {
    const read = inspectHmiScript('const tagSet = Tags.CreateTagSet(["Missing"]); tagSet.Read(); return tagSet("Missing").Value;');
    expect(executeHmiScript(read.program!, {}).error).toContain("Missing");
    expect(inspectHmiScript('const tagSet = Tags.CreateTagSet(["A"]); tagSet.Read(fetch("/api"));').error).toBeTruthy();
    expect(inspectHmiScript('const tagSet = Tags.CreateTagSet(["A"]); tagSet.Add(fetch("/api"));').error).toContain("nomi tag statici");
  });

  it("aggiunge, rimuove e svuota i tag del TagSet con le firme Siemens", () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Old"]);',
      'tagSet.Add([["Command.Speed", 900], "Command.Start"]);',
      'tagSet.Remove("Old");',
      'tagSet("Command.Start").Value = true;',
      "tagSet.Write();",
      'HMIRuntime.Trace("count=" + tagSet.Count);',
      "tagSet.Clear();",
      "return tagSet.Count;",
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsRead: [], tagsWritten: ["Command.Start", "Command.Speed"], hasReturn: true });
    expect(inspection.error).toBeUndefined();
    const result = executeHmiScript(inspection.program!, {});
    expect(result).toMatchObject({ returned: 0, traces: ["count=2"], writes: { "Command.Speed": "900", "Command.Start": "true" } });
  });

  it("esegue ReadAsync con il Promise pattern ufficiale e le proprieta' di qualita'", async () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Machine.Speed", "Machine.State"]);',
      "tagSet.ReadAsync().then(function(result) {",
      '  HMIRuntime.Trace(String(result.Count));',
      '  HMIRuntime.Trace(String(result("Machine.Speed").Value));',
      '  HMIRuntime.Trace(String(result("Machine.Speed").QualityCode));',
      '  HMIRuntime.Trace(String(result("Machine.Speed").TimeStamp));',
      "}).catch(function(errorCode) {",
      '  HMIRuntime.Trace("rejected=" + errorCode);',
      "});",
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsRead: ["Machine.Speed", "Machine.State"], hasAsync: true });
    expect(inspection.error).toBeUndefined();
    expect(executeHmiScript(inspection.program!, { "Machine.Speed": "1450", "Machine.State": "2" }).error).toContain("executeHmiScriptAsync");
    const result = await executeHmiScriptAsync(inspection.program!, { "Machine.Speed": "1450", "Machine.State": "2" }, {
      tagStatus: { "Machine.Speed": { qualityCode: 128, timeStamp: "2026-09-25T08:00:00Z" } },
    });
    expect(result.error).toBeUndefined();
    expect(result.traces).toEqual(["2", "1450", "128", "2026-09-25T08:00:00Z"]);
  });

  it("mantiene fulfilled una lettura parziale e rende leggibili gli errori per tag", async () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Available", "Missing"]);',
      "tagSet.ReadAsync().then(function(result) {",
      '  HMIRuntime.Trace("set=" + result.LastError);',
      '  HMIRuntime.Trace(result("Missing").ErrorDescription);',
      "}).catch(function(errorCode) {",
      '  HMIRuntime.Trace("rejected=" + errorCode);',
      "});",
    ].join("\n"));
    const result = await executeHmiScriptAsync(inspection.program!, { Available: "1" });
    expect(result.error).toBeUndefined();
    expect(result.traces[0]).toBe(`set=${0x80040004}`);
    expect(result.traces[1]).toContain("Missing");
    expect(result.traces.join(" ")).not.toContain("rejected=");
  });

  it("rifiuta la Promise solo se nessun tag riesce e passa il codice al catch", async () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["A", "B"]);',
      "tagSet.ReadAsync().then(function(result) {",
      '  HMIRuntime.Trace("unexpected");',
      "}).catch(function(errorCode) {",
      '  HMIRuntime.Trace("error=" + errorCode);',
      "});",
    ].join("\n"));
    const result = await executeHmiScriptAsync(inspection.program!, {});
    expect(result.error).toBeUndefined();
    expect(result.traces).toEqual([`error=${0x80040004}`]);
  });

  it("scrive in modo asincrono, conserva gli errori parziali e supporta hmiWriteWait", async () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet([["Command.Speed", 900], ["Command.Start", true]]);',
      "tagSet.WriteAsync(HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteWait).then(function(result) {",
      '  HMIRuntime.Trace("set=" + result.LastError);',
      '  HMIRuntime.Trace(result("Command.Start").ErrorDescription);',
      "}).catch(function(errorCode) {",
      '  HMIRuntime.Trace("rejected=" + errorCode);',
      "});",
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsWritten: ["Command.Speed", "Command.Start"], hasAsync: true });
    const result = await executeHmiScriptAsync(inspection.program!, {}, {
      writeFailures: { "Command.Start": { code: 0x80040002, description: "PLC non raggiungibile" } },
    });
    expect(result.error).toBeUndefined();
    expect(result.writes).toEqual({ "Command.Speed": "900" });
    expect(result.traces).toEqual([`set=${0x80040004}`, "PLC non raggiungibile"]);
  });

  it("supporta await con try/catch senza eseguire JavaScript arbitrario", async () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Missing"]);',
      "try {",
      "  await tagSet.ReadAsync();",
      "} catch (errorCode) {",
      '  HMIRuntime.Trace("caught=" + errorCode);',
      "}",
    ].join("\n"));
    expect(inspection).toMatchObject({ hasAsync: true, tagsRead: ["Missing"] });
    const result = await executeHmiScriptAsync(inspection.program!, {});
    expect(result.error).toBeUndefined();
    expect(result.traces).toEqual([`caught=${0x80040002}`]);
  });

  it("esegue ReadMaxAge come Promise e controlla il parametro UInt32", async () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Machine.Speed"]);',
      "tagSet.ReadMaxAge(250).then(function(result) {",
      '  HMIRuntime.Trace(String(result("Machine.Speed").Value));',
      '  HMIRuntime.Trace(String(result("Machine.Speed").TimeStamp));',
      "});",
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsRead: ["Machine.Speed"], hasAsync: true });
    expect(inspection.error).toBeUndefined();
    const result = await executeHmiScriptAsync(inspection.program!, { "Machine.Speed": "1200" }, { tagStatus: { "Machine.Speed": { timeStamp: "2026-09-25T10:30:00Z" } } });
    expect(result).toMatchObject({ traces: ["1200", "2026-09-25T10:30:00Z"] });

    const invalid = inspectHmiScript('let tagSet = Tags.CreateTagSet(["A"]); await tagSet.ReadMaxAge(-1);');
    expect((await executeHmiScriptAsync(invalid.program!, { A: "1" })).error).toContain("UInt32");
  });

  it("scrive valore, QualityCode e TimeStamp con TagSet.WriteQCD", () => {
    const inspection = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet(["Archive.Speed"]);',
      'tagSet.Item("Archive.Speed").Value = 1450;',
      'tagSet.Item("Archive.Speed").QualityCode = 64;',
      'tagSet.Item("Archive.Speed").TimeStamp = "2026-09-25T12:30:00Z";',
      "tagSet.WriteQCD(HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteWait);",
      'HMIRuntime.Trace(String(tagSet.Item("Archive.Speed").QualityCode));',
      'HMIRuntime.Trace(String(tagSet.Item("Archive.Speed").TimeStamp));',
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsWritten: ["Archive.Speed"], hasAsync: false });
    expect(inspection.error).toBeUndefined();
    const result = executeHmiScript(inspection.program!, {});
    expect(result).toMatchObject({
      writes: { "Archive.Speed": "1450" },
      traces: ["64", "2026-09-25T12:30:00Z"],
      tagStatus: { "Archive.Speed": { qualityCode: 64, timeStamp: "2026-09-25T12:30:00Z", lastError: 0 } },
    });
  });

  it("supporta WriteAsyncQCD con Promise e la scrittura QCD di un singolo tag", async () => {
    const batch = inspectHmiScript([
      'let tagSet = Tags.CreateTagSet([["Archive.Count", 12]]);',
      'tagSet("Archive.Count").QualityCode = 128;',
      'tagSet("Archive.Count").TimeStamp = 1770000000000;',
      "await tagSet.WriteAsyncQCD(HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteWait);",
    ].join("\n"));
    expect(batch).toMatchObject({ tagsWritten: ["Archive.Count"], hasAsync: true });
    const batchResult = await executeHmiScriptAsync(batch.program!, {});
    expect(batchResult.tagStatus["Archive.Count"]).toMatchObject({ qualityCode: 128, timeStamp: 1770000000000 });

    const single = inspectHmiScript('Tags("Archive.State").WriteQCD(3, HMIRuntime.Tags.Enums.hmiWriteType.hmiWriteWait, "2026-09-25T13:00:00Z", 192);');
    const singleResult = executeHmiScript(single.program!, {});
    expect(singleResult).toMatchObject({ writes: { "Archive.State": "3" }, tagStatus: { "Archive.State": { qualityCode: 192, timeStamp: "2026-09-25T13:00:00Z" } } });
  });

  it("registra i messaggi operatore per tag singoli e TagSet", () => {
    const inspection = inspectHmiScript([
      'Tags("Command.Speed").WriteWithOperatorMessage(1200, "Cambio formato");',
      'let tagSet = Tags.CreateTagSet([["Command.Start", true], ["Command.Mode", 2]]);',
      'tagSet.WriteWithOperatorMessage("Avvio lotto");',
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsWritten: ["Command.Speed", "Command.Start", "Command.Mode"] });
    const result = executeHmiScript(inspection.program!, { "Command.Speed": "900", "Command.Start": "false", "Command.Mode": "1" }, {
      operatorContext: { user: "Operatore1", host: "HMI-01", units: { "Command.Speed": "rpm" } },
    });
    expect(result.error).toBeUndefined();
    expect(result.operatorMessages).toEqual([
      { tag: "Command.Speed", reason: "Cambio formato", oldValue: "900", newValue: "1200", user: "Operatore1", host: "HMI-01", unit: "rpm" },
      { tag: "Command.Start", reason: "Avvio lotto", oldValue: "false", newValue: "true", user: "Operatore1", host: "HMI-01" },
      { tag: "Command.Mode", reason: "Avvio lotto", oldValue: "1", newValue: "2", user: "Operatore1", host: "HMI-01" },
    ]);
  });

  it("rifiuta metadati QCD non validi", () => {
    const invalidQuality = inspectHmiScript('let tags = Tags.CreateTagSet([["A", 1]]); tags("A").QualityCode = -1; tags.WriteQCD();');
    expect(executeHmiScript(invalidQuality.program!, {}).error).toContain("UInt32");
    const emptyReason = inspectHmiScript('Tags("A").WriteWithOperatorMessage(1, "");');
    expect(executeHmiScript(emptyReason.program!, {}).error).toContain("motivo");
  });

  it("ferma programmi oltre il budget e segnala tag senza valore", () => {
    const inspection = inspectHmiScript('const value = Tags("Missing").Read(); return value;');
    expect(executeHmiScript(inspection.program!, {}).error).toContain("Missing");
    expect(executeHmiScript(inspection.program!, { Missing: "1" }, { maxSteps: 1 }).error).toContain("1 operazioni");
  });

  it("apre e controlla un popup faceplate con il contratto WinCC Unified", () => {
    const opened: unknown[] = [];
    const updated: unknown[] = [];
    const closed: unknown[] = [];
    const popupManager = createHmiFaceplatePopupManager({
      open: (state) => opened.push(state),
      update: (state) => updated.push(state),
      close: (state) => closed.push(state),
    });
    const inspection = inspectHmiScript([
      "let po = UI.OpenFaceplateInPopup(\"Motor_V_1_0_0\", \"Motore M2400\", { Speed: { Tag: \"Motor.Speed\" }, Enabled: true }, UI.ActiveScreen, true, \"MotorPopup\", false, 20, 30, 400, 260);",
      "po.Left = 100;",
      "po.Top = 150;",
      "po.Visible = true;",
      "let flags = po.WindowFlags;",
      "po.WindowFlags = flags | UI.Enums.HmiWindowFlag.AlwaysInParent;",
      "HMIRuntime.Trace(String(po.Left));",
    ].join("\n"));
    expect(inspection).toMatchObject({ tagsRead: ["Motor.Speed"] });
    expect(inspection.error).toBeUndefined();
    const result = executeHmiScript(inspection.program!, {}, { popupManager });
    expect(result.error).toBeUndefined();
    expect(result.traces).toEqual(["100"]);
    expect(opened).toHaveLength(1);
    expect(updated).toHaveLength(4);
    expect(popupManager.states()).toEqual([expect.objectContaining({
      scope: "screen", faceplateType: "Motor_V_1_0_0", title: "Motore M2400",
      interfaceValues: { Speed: { Tag: "Motor.Speed" }, Enabled: true }, parentBound: true,
      visible: true, left: 100, top: 150, width: 400, height: 260, windowFlags: 211,
    })]);
    popupManager.closeParentBound("screen");
    expect(closed).toHaveLength(1);
    expect(popupManager.states()).toEqual([]);
  });

  it("supporta il popup relativo al faceplate e Faceplate.Close", () => {
    const closed: string[] = [];
    const popupManager = createHmiFaceplatePopupManager({ open: () => {}, update: () => {}, close: (state) => closed.push(state.popupId) });
    const inspection = inspectHmiScript([
      "let nested = Faceplate.OpenFaceplateInPopup(\"Details_V_1_0_0\", \"Dettagli\", false, false, \"DetailsPopup\", true);",
      "Faceplate.Close();",
    ].join("\n"));
    expect(inspection.error).toBeUndefined();
    expect(executeHmiScript(inspection.program!, {}, { popupManager }).error).toBeUndefined();
    expect(closed).toHaveLength(1);
    expect(popupManager.states()).toEqual([]);
  });

  it("genera un esecutore standalone valido e privo di parser o eval", () => {
    const source = hmiScriptRuntimeModuleSource();
    expect(() => parse(source, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(source).not.toContain("@babel");
    expect(source).not.toMatch(/\beval\s*\(/);
  });

  it("esegue davvero il modulo standalone generato con Add e ReadMaxAge", async () => {
    const source = hmiScriptRuntimeModuleSource().replace(/\bexport\s+/g, "");
    const runtime = Function(`${source}\nreturn { executeHmiScript, executeHmiScriptAsync };`)() as {
      executeHmiScriptAsync: typeof executeHmiScriptAsync;
    };
    const inspection = inspectHmiScript([
      "let tagSet = Tags.CreateTagSet();",
      'tagSet.Add("Machine.Speed");',
      "await tagSet.ReadMaxAge(0);",
      'HMIRuntime.Trace(String(tagSet("Machine.Speed").Value));',
    ].join("\n"));
    const result = await runtime.executeHmiScriptAsync(inspection.program!, { "Machine.Speed": "1500" });
    expect(result).toMatchObject({ traces: ["1500"], writes: {} });
  });
});
