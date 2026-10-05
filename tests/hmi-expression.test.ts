import { describe, expect, it } from "vitest";
import { evaluateHmiExpression, inspectHmiExpression } from "../src/core/hmiExpression";

describe("espressioni HMI sicure", () => {
  it("legge operatori WinCC e raccoglie tutti i tag", () => {
    const source = 'Machine.Enabled AND (Drive.Speed >= 1200 OR tag("Linea 1.Ready"))';
    expect(inspectHmiExpression(source)).toEqual({ tags: ["Machine.Enabled", "Drive.Speed", "Linea 1.Ready"] });
    expect(evaluateHmiExpression(source, {
      "Machine.Enabled": "true",
      "Drive.Speed": "900",
      "Linea 1.Ready": "1",
    })).toEqual({ value: true, tags: ["Machine.Enabled", "Drive.Speed", "Linea 1.Ready"] });
  });

  it("calcola formule, conversioni e bit senza usare eval", () => {
    expect(evaluateHmiExpression("round(Average * 10) / 10", { Average: "12.34" })).toMatchObject({ value: 12.3 });
    expect(evaluateHmiExpression("(Status & 4) != 0 XOR Alarm", { Status: "4", Alarm: "false" })).toMatchObject({ value: true });
    expect(evaluateHmiExpression('text(Code) + " - OK"', { Code: "17" })).toMatchObject({ value: "17 - OK" });
  });

  it("spiega sintassi, funzioni e valori mancanti", () => {
    expect(inspectHmiExpression("Machine.Ready AND (").error).toContain("Espressione incompleta");
    expect(inspectHmiExpression("mistero(Machine.Ready)").error).toContain("non supportata");
    expect(evaluateHmiExpression("Machine.Ready AND Safety.Ok", { "Machine.Ready": "1" }))
      .toMatchObject({ error: "Il tag Safety.Ok non ha un valore di prova" });
  });
});
