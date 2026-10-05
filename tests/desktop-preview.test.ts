// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewExit } from "../src/core/types";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tauri-apps/api/core")>(), invoke: core.invoke, isTauri: () => true,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { desktopBridge } from "../src/filesystem/desktopBridge";

const callbacks = new Map<number, (message: unknown) => void>();
const unregisterCallback = vi.fn((id: number) => { callbacks.delete(id); });
beforeEach(() => {
  core.invoke.mockReset(); callbacks.clear(); unregisterCallback.mockClear();
  let nextId = 0;
  vi.stubGlobal("__TAURI_INTERNALS__", {
    transformCallback(callback: (message: unknown) => void) { const id = ++nextId; callbacks.set(id, callback); return id; },
    unregisterCallback,
  });
});
afterEach(() => { callbacks.clear(); vi.unstubAllGlobals(); });

describe("native preview channel contract", () => {
  it("sets up the exit callback before invoking the native start command", async () => {
    const onExit = vi.fn();
    const exit: PreviewExit = { sessionId: "run-1", code: 7, message: "Vite stopped" };
    core.invoke.mockImplementation(async (command, args) => {
      expect(command).toBe("start_preview");
      expect(args).toMatchObject({ root: "C:/panel", force: true, sessionId: "run-1" });
      expect(args.onExit.toJSON()).toBe(`__CHANNEL__:${args.onExit.id}`);
      callbacks.get(args.onExit.id)!({ message: exit, index: 0 });
      callbacks.get(args.onExit.id)!({ end: true, index: 1 });
      expect(onExit).toHaveBeenCalledExactlyOnceWith(exit);
      expect(unregisterCallback).toHaveBeenCalledExactlyOnceWith(args.onExit.id);
      return { sessionId: "run-1", url: "http://127.0.0.1:4173", port: 4173 };
    });
    await expect(desktopBridge.startPreview("C:/panel", true, "run-1", onExit)).resolves.toMatchObject({ sessionId: "run-1" });
  });

  it("retains an early channel end until its queued exit message has been delivered", async () => {
    const onExit = vi.fn();
    const exit: PreviewExit = { sessionId: "run-queued", code: 0, message: "Stopped" };
    core.invoke.mockImplementation(async (_command, args) => {
      const receive = callbacks.get(args.onExit.id)!;
      receive({ end: true, index: 1 });
      expect(unregisterCallback).not.toHaveBeenCalled();
      receive({ message: exit, index: 0 });
      expect(onExit).toHaveBeenCalledExactlyOnceWith(exit);
      expect(unregisterCallback).toHaveBeenCalledExactlyOnceWith(args.onExit.id);
      return { sessionId: "run-queued", url: "http://127.0.0.1:4173", port: 4173 };
    });
    await desktopBridge.startPreview("C:/panel", false, "run-queued", onExit);
  });

  it("provides a unique identifier and a safe channel for callers without a callback", async () => {
    core.invoke.mockResolvedValue({ url: "http://127.0.0.1:4173", port: 4173 });
    await desktopBridge.startPreview("C:/panel");
    await desktopBridge.startPreview("C:/panel");
    const first = core.invoke.mock.calls[0][1];
    const second = core.invoke.mock.calls[1][1];
    expect(first.sessionId).toBeTypeOf("string");
    expect(first.sessionId.length).toBeGreaterThan(0);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(() => first.onExit.onmessage({ sessionId: first.sessionId, code: 0, message: "Stopped" })).not.toThrow();
  });
});
