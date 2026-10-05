export type HmiCalendarFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface HmiCalendarTrigger {
  kind: "calendar";
  frequency: HmiCalendarFrequency;
  /** Ora locale del pannello nel formato HH:mm o HH:mm:ss. */
  time: string;
  /** Domenica = 0, sabato = 6. Usato dalla ricorrenza settimanale. */
  weekDay?: number;
  /** Giorno del mese, da 1 a 31. Usato dalle ricorrenze mensile e annuale. */
  day?: number;
  /** Mese, da 1 a 12. Usato dalla ricorrenza annuale. */
  month?: number;
}

export type HmiAlarmCriterion = "class" | "state" | "priority";
export type HmiAlarmCondition = "equals" | "not-equals" | "greater" | "greater-or-equal" | "less" | "less-or-equal";

export interface HmiAlarmTrigger {
  kind: "alarm";
  criterion: HmiAlarmCriterion;
  condition: HmiAlarmCondition;
  operand: string;
}

export interface HmiAlarmNotification {
  alarmClass: string;
  state: string;
  priority: number;
  name?: string;
  text?: string;
}

function calendarTime(value: string): { hour: number; minute: number; second: number } | undefined {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  return hour <= 23 && minute <= 59 && second <= 59 ? { hour, minute, second } : undefined;
}

function calendarDateMatches(trigger: HmiCalendarTrigger, date: Date): boolean {
  if (trigger.frequency === "daily") return true;
  if (trigger.frequency === "weekly") return date.getDay() === trigger.weekDay;
  if (trigger.frequency === "monthly") return date.getDate() === trigger.day;
  return date.getMonth() + 1 === trigger.month && date.getDate() === trigger.day;
}

/** Trova la prossima ricorrenza nel fuso locale del Runtime. Le date inesistenti, ad esempio il
 * 31 aprile o le ore saltate dal cambio legale, vengono saltate invece di essere spostate. */
export function nextHmiCalendarDue(trigger: HmiCalendarTrigger, after: number, includeAfter = true): number | undefined {
  const time = calendarTime(trigger.time);
  if (!time || !Number.isFinite(after)) return undefined;
  const start = new Date(after);
  start.setHours(0, 0, 0, 0);
  for (let offset = 0; offset <= 3700; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    if (!calendarDateMatches(trigger, day)) continue;
    const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hour, time.minute, time.second, 0);
    if (candidate.getHours() !== time.hour || candidate.getMinutes() !== time.minute || candidate.getSeconds() !== time.second) continue;
    const due = candidate.getTime();
    if (due > after || (includeAfter && due === after)) return due;
  }
  return undefined;
}

export function hmiCalendarTriggerIssue(trigger: HmiCalendarTrigger): string | undefined {
  if (!calendarTime(trigger.time)) return "l'ora deve usare il formato HH:mm o HH:mm:ss.";
  if (trigger.frequency === "weekly" && (!Number.isInteger(trigger.weekDay) || trigger.weekDay! < 0 || trigger.weekDay! > 6)) return "il giorno della settimana deve essere compreso tra 0 e 6.";
  if ((trigger.frequency === "monthly" || trigger.frequency === "yearly") && (!Number.isInteger(trigger.day) || trigger.day! < 1 || trigger.day! > 31)) return "il giorno del mese deve essere compreso tra 1 e 31.";
  if (trigger.frequency === "yearly" && (!Number.isInteger(trigger.month) || trigger.month! < 1 || trigger.month! > 12)) return "il mese deve essere compreso tra 1 e 12.";
  if (nextHmiCalendarDue(trigger, new Date(2000, 0, 1).getTime()) === undefined) return "la ricorrenza non produce alcuna data valida.";
  return undefined;
}

function alarmValue(trigger: HmiAlarmTrigger, alarm: HmiAlarmNotification): string | number {
  if (trigger.criterion === "class") return alarm.alarmClass;
  if (trigger.criterion === "state") return alarm.state;
  return alarm.priority;
}

/** Applica al cambio allarme gli stessi operatori relazionali usati dai filtri Unified. */
export function hmiAlarmMatches(trigger: HmiAlarmTrigger, alarm: HmiAlarmNotification): boolean {
  const actual = alarmValue(trigger, alarm);
  const leftNumber = typeof actual === "number" ? actual : Number(actual);
  const rightNumber = Number(trigger.operand);
  const numeric = trigger.criterion === "priority" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  const left: number | string = numeric ? leftNumber : String(actual).trim().toLocaleLowerCase();
  const right: number | string = numeric ? rightNumber : trigger.operand.trim().toLocaleLowerCase();
  if (trigger.condition === "equals") return left === right;
  if (trigger.condition === "not-equals") return left !== right;
  if (typeof left === "number" && typeof right === "number") {
    if (trigger.condition === "greater") return left > right;
    if (trigger.condition === "greater-or-equal") return left >= right;
    if (trigger.condition === "less") return left < right;
    return left <= right;
  }
  const leftText = String(left);
  const rightText = String(right);
  if (trigger.condition === "greater") return leftText > rightText;
  if (trigger.condition === "greater-or-equal") return leftText >= rightText;
  if (trigger.condition === "less") return leftText < rightText;
  return leftText <= rightText;
}

/** Helper puro copiato nel progetto esportato, condiviso dal Runtime degli Scheduler. */
export function hmiScheduleRuntimeSource(): string {
  return `// @ts-nocheck\n${String(calendarTime)}\n${String(calendarDateMatches)}\nexport ${String(nextHmiCalendarDue)}\n${String(alarmValue)}\nexport ${String(hmiAlarmMatches)}\n`;
}
