// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe("preferenze di aiuto dell’editor", () => {
  it("rispetta le preferenze e il suggerimento visto dopo la riapertura", async () => {
    const first = await import("../src/state/editorGuidance");
    first.useEditorGuidance.getState().markSeen();
    first.useEditorGuidance.getState().setEnabled(false);
    vi.resetModules();
    const second = await import("../src/state/editorGuidance");
    expect(second.useEditorGuidance.getState()).toMatchObject({ seen: true, enabled: false });
    second.useEditorGuidance.getState().replay();
    vi.resetModules();
    const third = await import("../src/state/editorGuidance");
    expect(third.useEditorGuidance.getState()).toMatchObject({ seen: false, enabled: true });
  });
  it("applica gli aiuti nella sessione e spiega quando non può conservarli", async () => {
    const { useEditorGuidance } = await import("../src/state/editorGuidance");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    expect(useEditorGuidance.getState().setEnabled(false)).toContain("questa sessione");
    expect(useEditorGuidance.getState().enabled).toBe(false);
    expect(useEditorGuidance.getState().replay()).toContain("prossimo avvio");
    expect(useEditorGuidance.getState().enabled).toBe(true);
    useEditorGuidance.getState().markSeen();
    expect(useEditorGuidance.getState().seen).toBe(true);
  });
});
