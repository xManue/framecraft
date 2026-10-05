import { describe, expect, it } from "vitest";
import { advanceHmiScheduler, createHmiSchedulerState, notifyHmiSchedulerAlarm, notifyHmiSchedulerTag, runHmiScheduledTask } from "../src/core/hmiScheduler";
import { hmiScriptCatalogIssues, parseHmiScriptCatalog } from "../src/core/hmiScriptModules";

describe("scheduler HMI deterministico", () => {
  const local = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();

  it("esegue intervalli e operazioni singole in ordine usando tempo virtuale", async () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "pulse", name: "Impulso", trigger: { kind: "interval", intervalMs: 100, startDelayMs: 50 }, script: 'Tags("Pulse").Write(1);' },
      { id: "once", name: "Avvio", trigger: { kind: "once", at: "1970-01-01T00:00:00.250Z" }, script: 'Tags("Started").Write(true);' },
    ] });
    const state = createHmiSchedulerState(catalog, 0, {});
    const result = await advanceHmiScheduler(catalog, state, 300, {});
    expect(result.error).toBeUndefined();
    expect(result.executions.map((item) => [item.taskId, item.scheduledAt])).toEqual([
      ["pulse", 50], ["pulse", 150], ["pulse", 250], ["once", 250],
    ]);
    expect(result.values).toMatchObject({ Pulse: "1", Started: "true" });
    expect(result.state).toMatchObject({ now: 300, nextDue: { pulse: 350 }, completedOnce: ["once"] });
  });

  it("reagisce ai fronti tag e mette in coda le scritture generate dalle operazioni", async () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "start", name: "Start", trigger: { kind: "tag", tag: "Command", condition: "rising" }, script: 'Tags("Started").Write(true);' },
      { id: "audit", name: "Audit", trigger: { kind: "tag", tag: "Started", condition: "equals", value: "true" }, script: 'Tags("Audit").Write("done");' },
    ] });
    const state = createHmiSchedulerState(catalog, 1000, { Command: "0", Started: "false" });
    const result = await notifyHmiSchedulerTag(catalog, state, "Command", 1, { Command: "0", Started: "false" });
    expect(result.executions.map((item) => item.taskId)).toEqual(["start", "audit"]);
    expect(result.values).toMatchObject({ Command: "1", Started: "true", Audit: "done" });
  });

  it("permette una prova manuale senza aspettare il trigger", async () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "night", name: "Turno notte", enabled: false, trigger: { kind: "interval", intervalMs: 60000 }, script: 'HMIRuntime.Trace("test");' },
    ] });
    const result = await runHmiScheduledTask(catalog, createHmiSchedulerState(catalog, 42), "night", {});
    expect(result.executions[0]).toMatchObject({ taskId: "night", scheduledAt: 42, cause: "manual", result: { traces: ["test"] } });
  });

  it("esegue le ricorrenze giornaliere, settimanali, mensili e annuali in ordine", async () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "daily", name: "Giornaliera", trigger: { kind: "calendar", frequency: "daily", time: "09:00:00" }, script: 'Tags("Daily").Write(1);' },
      { id: "weekly", name: "Settimanale", trigger: { kind: "calendar", frequency: "weekly", weekDay: 1, time: "10:00:00" }, script: 'Tags("Weekly").Write(1);' },
      { id: "monthly", name: "Mensile", trigger: { kind: "calendar", frequency: "monthly", day: 29, time: "11:00:00" }, script: 'Tags("Monthly").Write(1);' },
      { id: "yearly", name: "Annuale", trigger: { kind: "calendar", frequency: "yearly", month: 9, day: 30, time: "12:00:00" }, script: 'Tags("Yearly").Write(1);' },
    ] });
    const start = local(2026, 9, 28, 8);
    const result = await advanceHmiScheduler(catalog, createHmiSchedulerState(catalog, start), local(2026, 9, 30, 13), {});
    expect(result.executions.map((item) => [item.taskId, new Date(item.scheduledAt).getDate(), new Date(item.scheduledAt).getHours()])).toEqual([
      ["daily", 28, 9], ["weekly", 28, 10], ["daily", 29, 9], ["monthly", 29, 11], ["daily", 30, 9], ["yearly", 30, 12],
    ]);
    expect(result.values).toMatchObject({ Daily: "1", Weekly: "1", Monthly: "1", Yearly: "1" });
    expect(result.executions.every((item) => item.cause === "calendar")).toBe(true);
  });

  it("esegue i task che corrispondono al cambio stato allarme", async () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "class", name: "Classe", trigger: { kind: "alarm", criterion: "class", condition: "equals", operand: "Warning" }, script: 'Tags("Alarm.Class").Write(alarmClass);' },
      { id: "priority", name: "Priorita", trigger: { kind: "alarm", criterion: "priority", condition: "greater-or-equal", operand: "12" }, script: 'Tags("Alarm.Priority").Write(alarmPriority);' },
      { id: "state", name: "Stato", trigger: { kind: "alarm", criterion: "state", condition: "equals", operand: "Outgoing" }, script: 'Tags("Alarm.State").Write(1);' },
    ] });
    const state = createHmiSchedulerState(catalog, 1000);
    const result = await notifyHmiSchedulerAlarm(catalog, state, { alarmClass: "warning", state: "Incoming", priority: 12, name: "M2400" }, {});
    expect(result.executions.map((item) => item.taskId)).toEqual(["class", "priority"]);
    expect(result.values).toMatchObject({ "Alarm.Class": "warning", "Alarm.Priority": "12" });
  });

  it("valida trigger, date, nomi e collegamenti ai moduli", () => {
    const catalog = parseHmiScriptCatalog({ scheduledTasks: [
      { id: "same", name: "", trigger: { kind: "interval", intervalMs: 0 }, script: "Modules.Missing.Run();" },
      { id: "same", name: "Bad date", trigger: { kind: "once", at: "mai" }, script: 'HMIRuntime.Trace("x");' },
      { id: "tag", name: "Tag", trigger: { kind: "tag", tag: "", condition: "equals" }, script: 'HMIRuntime.Trace("x");' },
      { id: "system", name: "System", trigger: { kind: "tag", tag: "@UserName", condition: "changed" }, script: 'HMIRuntime.Trace("x");' },
      { id: "calendar", name: "Calendario", trigger: { kind: "calendar", frequency: "yearly", month: 4, day: 31, time: "25:00" }, script: 'HMIRuntime.Trace("x");' },
      { id: "alarm", name: "Allarme", trigger: { kind: "alarm", criterion: "priority", condition: "equals", operand: "17" }, script: 'HMIRuntime.Trace("x");' },
    ] });
    const issues = hmiScriptCatalogIssues(catalog).join("\n");
    expect(issues).toContain("nome dell'operazione");
    expect(issues).toContain("UInt32 maggiore di zero");
    expect(issues).toContain("ID operazione pianificata duplicato");
    expect(issues).toContain("data e ora di esecuzione non valide");
    expect(issues).toContain("trigger richiede un tag");
    expect(issues).toContain("confronto richiede un valore");
    expect(issues).toContain("@UserName");
    expect(issues).toContain("formato HH:mm");
    expect(issues).toContain("intero tra 0 e 16");
    expect(issues).toContain("non definita");
  });
});
