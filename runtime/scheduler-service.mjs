import { randomUUID, createHash } from "node:crypto";
import { SchedulerError } from "./scheduler-store.mjs";

const truthy = value => !/^(?:|0|false|no|off)$/i.test(String(value).trim());
const keyFor = task => createHash("sha256").update(JSON.stringify([task.id,task.trigger])).digest("hex");
export function createServerScheduler({ catalog, runtime, store, authorize, transport, samples, onDiagnostic, onTrace, now = Date.now, monotonic = () => performance.now(), automatic = true }) {
  if (catalog?.version !== 1 || catalog?.schedulerService?.enabled !== true || !Array.isArray(catalog.scheduledTasks) || catalog.scheduledTasks.length > 256 || catalog.scheduledTasks.some(task => !task || typeof task.enabled !== "boolean")) throw new SchedulerError("SCHEDULER_CONFIG");
  const tasks = catalog.scheduledTasks.filter(task => task.enabled === true);
  if (!catalog?.schedulerService?.enabled || !store || !runtime || !/^[a-f0-9-]{36}$/.test(catalog.schedulerService.accountId) || tasks.length > 256 || new Set(tasks.map(t => t.id)).size !== tasks.length) throw new SchedulerError("SCHEDULER_CONFIG");
  for (const task of tasks) {
    if (!task.program || ![1,2,3,4,5,6,7,8].includes(task.program.version) || typeof task.id !== "string" || !/^[A-Za-z0-9_.-]{1,80}$/.test(task.id)) throw new SchedulerError("SCHEDULER_CONFIG");
    const t = task.trigger;
    if (!t || !["interval","once","calendar","tag","alarm"].includes(t.kind) || t.kind === "interval" && (!Number.isSafeInteger(t.intervalMs) || t.intervalMs < 100 || t.intervalMs > 2147483647 || t.startDelayMs !== undefined && (!Number.isSafeInteger(t.startDelayMs) || t.startDelayMs < 0)) || t.kind === "once" && !Number.isFinite(Date.parse(t.at)) || t.kind === "calendar" && runtime.nextHmiCalendarDue(t, now()) === undefined || t.kind === "tag" && (typeof t.tag !== "string" || !["changed","rising","falling","equals"].includes(t.condition))) throw new SchedulerError("SCHEDULER_CONFIG");
  }
  const rejectUi = node => { if (!node || typeof node !== "object") return; if (["navigate","popup-open","popup-close","popup-set","popup-get","screen-item","screen-item-get","screen-item-set","property-flashing","popup-property","raise-faceplate-event"].includes(node.kind)) throw new SchedulerError("SCHEDULER_CONFIG"); for (const child of Object.values(node)) { if (Array.isArray(child)) child.forEach(rejectUi); else if (child && typeof child === "object") rejectUi(child); } };
  // Library code may contain unused UI helpers; reachable UI calls still fail in the VM without host objects.
  for (const task of tasks) rejectUi(task.program);
  const contexts = runtime.createHmiScriptContextManager(), controller = new AbortController(), due = new Map(), baselines = new Map(), pending = new Set(), queue = [];
  let state = "stopped", timer, drain = Promise.resolve(), active = false, wallHigh = now(), lastDiagnostic, dropped = 0, traceBudget = 50, traceAt = monotonic(), droppedTraces = 0;
  const report = (code, task, cause) => { const error = new SchedulerError(code); const detail=typeof cause?.message === "string" ? cause.message.replace(/[\u0000-\u001f]/g," ").slice(0,400) : ""; lastDiagnostic = { type: "scheduler", code: error.code, error: error.message + (detail ? " " + detail : ""), remedy: cause?.remedy ?? error.remedy, ...(task ? { task } : {}) }; try { onDiagnostic?.({ ...lastDiagnostic }); } catch {} };
  const values = () => Object.fromEntries(samples().filter(s => s.value !== undefined).map(s => [s.tag, s.value]));
  const status = () => Object.fromEntries(samples().map(s => [s.tag,{ qualityCode:s.qualityCode ?? 0,timeStamp:s.sourceTimestamp ?? 0,lastError:s.lastError ? 0x80040002 : 0,errorDescription:s.lastError ?? "" }]));
  const authorized = async capability => { if (state !== "running" || controller.signal.aborted) throw new SchedulerError("SCHEDULER_FAILED"); return authorize(catalog.schedulerService.accountId, capability); };
  const scopedTransport = {
    async read(request, signal) { await authorized("scheduler.execute"); if (signal.aborted || state !== "running") throw new SchedulerError("SCHEDULER_FAILED"); return transport.read(request, signal); },
    async write(request, signal) { await authorized("scheduler.execute"); if (signal.aborted || state !== "running") throw new SchedulerError("SCHEDULER_FAILED"); return transport.write(request, signal, catalog.schedulerService.accountId); },
  };
  const execute = async item => {
    const { task, cause, scheduledAt, alarm, timerContext } = item; const id = randomUUID();
    // Claim before any script or driver access. Interrupted/uncertain occurrences are never retried.
    if (!store.claim({ id, task:task.id, cause, scheduledAt, key:["once","calendar"].includes(cause) ? keyFor(task) : undefined })) return;
    let resultState = "uncertain", code = "SCHEDULER_FAILED";
    try {
      await authorized("scheduler.execute");
      if (now() - scheduledAt > 5000 && ["once","calendar"].includes(cause)) { resultState = "skipped"; code = "SCHEDULER_SKIPPED"; report(code,task.id); return; }
      const result = await runtime.executeHmiScriptAsync(task.program, values(), { ...(timerContext ?? {}), timerManager, tagStatus:status(), ...(timerContext ?? contexts.options(catalog,undefined,"scheduler")), locals:{ taskId:task.id,scheduledAt,trigger:cause,...(alarm ? { alarmClass:alarm.alarmClass,alarmState:alarm.state,alarmPriority:alarm.priority,alarmName:alarm.name ?? "",alarmText:alarm.text ?? "" } : {}) },transport:scopedTransport,signal:controller.signal,isActive:()=>state === "running",transportTimeoutMs:5000 });
      const current=monotonic(); traceBudget=Math.min(50,traceBudget+Math.max(0,current-traceAt)*50/60000); traceAt=current;
      let emitted=0;
      for (const message of result.traces.slice(0,20)) if (traceBudget >= 1) { traceBudget--; emitted++; try { onTrace?.({type:"scheduler-trace",task:task.id,runId:id,timestamp:new Date(now()).toISOString(),message:String(message).slice(0,500)}); } catch { emitted--; } }
      droppedTraces+=result.traces.length-emitted;
      if (result.error || result.commands?.some(command => command.outcome !== "delivered") || result.navigation.length || result.faceplateEvents.length) throw new Error(result.error ?? result.commands?.find(command => command.outcome !== "delivered")?.error ?? "Lo script richiede un’interfaccia grafica assente sul server.");
      resultState = "completed"; code = "SCHEDULER_COMPLETED";
    } catch (error) { report(code,task.id,error); state="error"; controller.abort(); timerController.dispose(); queue.length=0; pending.clear(); }
    finally { store.finish(id,resultState,code); }
  };
  const pump = () => { if (active) return; active = true;
    drain = (async () => { while (state === "running" && queue.length) { const item = queue.shift(); try { await execute(item); } catch { report("SCHEDULER_STORAGE",item.task.id); state = "error"; controller.abort(); } finally { pending.delete(item.task.id); } } })().finally(()=>{ active = false; });
  };
  const enqueue = (task,cause,scheduledAt,alarm,timerContext) => {
    if (state !== "running") return;
    if (pending.has(task.id) || queue.length >= 64) { dropped++; if (dropped === 1 || dropped % 100 === 0) report("SCHEDULER_BUSY",task.id); return; }
    pending.add(task.id); queue.push({task,cause,scheduledAt,alarm,timerContext}); pump();
  };
  const timerController = runtime.createHmiTimerManager((callback,timer,context) => {
    const program=callback.kind === "inline" ? callback.program : {version:1,statements:[{kind:"module-call",call:callback.call}]};
    enqueue({id:"timer-"+timer.id,program},"timer",now(),undefined,context);
  },()=>report("SCHEDULER_FAILED"));
  const timerManager = { clear:(...args)=>timerController.clear(...args),set:(mode,callback,delay,context)=>{ if (timerController.snapshot().length >= 256 || delay < 100) throw new SchedulerError("SCHEDULER_BUSY"); return timerController.set(mode,callback,delay,context); } };
  const engine = {
    async start() {
      if (state !== "stopped" || controller.signal.aborted) throw new SchedulerError("SCHEDULER_CONFIG");
      state = "starting";
      try { await authorize(catalog.schedulerService.accountId,"scheduler.execute");
        if (store.needsReview()) throw new SchedulerError("SCHEDULER_REVIEW");
        const errors = contexts.initialize(catalog,undefined,"scheduler",values(),{tagStatus:status()}); if (errors.length) throw new SchedulerError("SCHEDULER_CONFIG");
        wallHigh = now(); const mono = monotonic();
        for (const s of samples()) if (s.value !== undefined && (s.qualityCode & 0xc0) === 0xc0) baselines.set(s.tag,s.value);
        for (const task of tasks) { const t=task.trigger; if (t.kind === "interval") due.set(task.id,mono+(t.startDelayMs ?? t.intervalMs)); else if (t.kind === "once") due.set(task.id,Date.parse(t.at)); else if (t.kind === "calendar") due.set(task.id,runtime.nextHmiCalendarDue(t,wallHigh)); }
        state = "running"; if (automatic) { timer=setInterval(()=>engine.tick(),100); timer.unref?.(); } engine.tick();
      } catch (error) { state="error"; controller.abort(); report(error instanceof SchedulerError ? error.code : "SCHEDULER_CONFIG",undefined,error); throw error; }
    },
    tick() {
      if (state !== "running") return; const wall=now(),mono=monotonic(); if (!Number.isFinite(wall) || !Number.isFinite(mono)) return;
      const backwards = wall < wallHigh; wallHigh=Math.max(wallHigh,wall);
      for (const task of tasks) { const t=task.trigger,at=due.get(task.id); if (at === undefined || at > (t.kind === "interval" ? mono : wall) || backwards && t.kind !== "interval") continue;
        if (t.kind === "interval") { due.set(task.id,mono+t.intervalMs); enqueue(task,"interval",wall); }
        else if (t.kind === "once") { due.delete(task.id); enqueue(task,"once",at); }
        else if (t.kind === "calendar") { due.set(task.id,runtime.nextHmiCalendarDue(t,wall,false)); enqueue(task,"calendar",at); }
      }
    },
    sample(sample) {
      if (state !== "running") return; const previous=baselines.get(sample.tag);
      if (sample.value === undefined || (sample.qualityCode & 0xc0) !== 0xc0) { baselines.delete(sample.tag); return; }
      baselines.set(sample.tag,sample.value); if (previous === undefined || previous === sample.value) return;
      for (const task of tasks) { const t=task.trigger; if (t.kind === "tag" && t.tag === sample.tag && (t.condition === "changed" || t.condition === "rising" && !truthy(previous) && truthy(sample.value) || t.condition === "falling" && truthy(previous) && !truthy(sample.value) || t.condition === "equals" && sample.value === t.value)) enqueue(task,"tag",now()); }
    },
    disconnect(tags) { for (const tag of tags) baselines.delete(tag); },
    alarm(alarm) { if (state === "running") for (const task of tasks) if (task.trigger.kind === "alarm" && runtime.hmiAlarmMatches(task.trigger,alarm)) enqueue(task,"alarm",now(),alarm); },
    snapshot() { return { state,owner:"server",pending:pending.size,dropped,droppedTraces,...(lastDiagnostic ? {diagnostic:{...lastDiagnostic}} : {}),history:store.history() }; },
    async idle() { await drain; },
    async stop() { state="stopping"; clearInterval(timer); timerController.dispose(); controller.abort(); queue.length=0; await drain; pending.clear(); contexts.dispose(); state="stopped"; },
  };
  return engine;
}
