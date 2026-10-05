import { describe, expect, it } from "vitest";
import { hmiAlarmMatches, hmiCalendarTriggerIssue, nextHmiCalendarDue } from "../src/core/hmiSchedule";

const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) => new Date(year, month - 1, day, hour, minute, second).getTime();

describe("calendario e filtri allarme HMI", () => {
  it("calcola ricorrenze locali giornaliere e settimanali", () => {
    expect(nextHmiCalendarDue({ kind: "calendar", frequency: "daily", time: "09:30:00" }, local(2026, 9, 28, 8))).toBe(local(2026, 9, 28, 9, 30));
    expect(nextHmiCalendarDue({ kind: "calendar", frequency: "daily", time: "09:30:00" }, local(2026, 9, 28, 9, 30), false)).toBe(local(2026, 9, 29, 9, 30));
    expect(nextHmiCalendarDue({ kind: "calendar", frequency: "weekly", weekDay: 1, time: "10:00" }, local(2026, 9, 29))).toBe(local(2026, 10, 5, 10));
  });

  it("salta i giorni inesistenti senza spostarli al mese seguente", () => {
    expect(nextHmiCalendarDue({ kind: "calendar", frequency: "monthly", day: 31, time: "07:00" }, local(2026, 4, 1))).toBe(local(2026, 5, 31, 7));
    expect(nextHmiCalendarDue({ kind: "calendar", frequency: "yearly", month: 2, day: 29, time: "12:00" }, local(2026, 1, 1))).toBe(local(2028, 2, 29, 12));
    expect(hmiCalendarTriggerIssue({ kind: "calendar", frequency: "yearly", month: 4, day: 31, time: "12:00" })).toContain("non produce");
  });

  it("filtra classe e stato senza distinzione maiuscole e priorita' numericamente", () => {
    const alarm = { alarmClass: "Warning", state: "Incoming", priority: 12 };
    expect(hmiAlarmMatches({ kind: "alarm", criterion: "class", condition: "equals", operand: "warning" }, alarm)).toBe(true);
    expect(hmiAlarmMatches({ kind: "alarm", criterion: "state", condition: "not-equals", operand: "Outgoing" }, alarm)).toBe(true);
    expect(hmiAlarmMatches({ kind: "alarm", criterion: "priority", condition: "greater-or-equal", operand: "8" }, alarm)).toBe(true);
    expect(hmiAlarmMatches({ kind: "alarm", criterion: "priority", condition: "less", operand: "12" }, alarm)).toBe(false);
  });
});
