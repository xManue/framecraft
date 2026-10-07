import { describe, expect, it } from "vitest";
import { guidedActionLabels, guidedActionScript, newGuidedAction, readGuidedAction, type GuidedActionKind } from "../src/core/hmiActions";
import { executeHmiEvent, parseHmiEvents, serializeHmiEvents } from "../src/core/hmiEvents";
import { inspectHmiScript } from "../src/core/hmiScript";

describe("azioni guidate", () => {
  it.each(Object.keys(guidedActionLabels) as GuidedActionKind[])("compila e conserva %s con doppio click e testo escapato", (kind) => {
    const target = 'M2400 "zona"\\test\n';
    const binding = newGuidedAction(kind, target, "DoubleTapped");
    expect(inspectHmiScript(binding.script).error).toBeUndefined();
    expect(readGuidedAction(binding.script)).toEqual({ kind, target });
    expect(parseHmiEvents(serializeHmiEvents([binding]))[0]).toMatchObject(binding);
  });
  it("non confonde script aggiuntivi con una sola azione guidata", () => {
    expect(readGuidedAction(guidedActionScript("trace", "ok") + 'Tags("Command").Write(1);')).toBeUndefined();
    expect(executeHmiEvent(newGuidedAction("navigate", "/settings", "DoubleTapped"), {}).navigation).toEqual(["/settings"]);
    expect(executeHmiEvent(newGuidedAction("trace", "Pronto"), {}).traces).toEqual(["Pronto"]);
  });
});
