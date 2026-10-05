import { describe, expect, it, vi } from "vitest";
import { createHmiFaceplatePopupManager, hmiPopupManagerRuntimeModuleSource } from "../src/core/hmiPopupManager";

const options = {
  scope: "screen" as const,
  faceplateType: "Motor_V_1_0_0",
  title: "Motor",
  interfaceValues: { Speed: { Tag: "Motor.Speed" } },
  parentBound: true,
  invisible: false,
  popupWindowName: "MotorPopup",
  adaptWindow: false,
  left: 10,
  top: 20,
  width: 300,
  height: 180,
};

describe("gestore popup faceplate", () => {
  it("mantiene stato, proprietà e unicità del nome finestra", () => {
    const surface = { open: vi.fn(), update: vi.fn(), close: vi.fn() };
    const manager = createHmiFaceplatePopupManager(surface);
    const reference = manager.open(options);
    expect(() => manager.open(options)).toThrow(/già in uso/);
    manager.set(reference, "Width", 420);
    manager.set(reference, "Visible", false);
    expect(manager.get(reference, "Width")).toBe(420);
    expect(manager.get(reference, "Visible")).toBe(false);
    expect(surface.update).toHaveBeenCalledTimes(2);
    manager.close(reference);
    expect(surface.close).toHaveBeenCalledTimes(1);
    expect(() => manager.get(reference, "Left")).toThrow(/non e' più aperta/);
    expect(() => manager.open(options)).not.toThrow();
  });

  it("chiude soltanto i popup legati al contesto richiesto", () => {
    const surface = { open: vi.fn(), update: vi.fn(), close: vi.fn() };
    const manager = createHmiFaceplatePopupManager(surface);
    manager.open(options);
    manager.open({ ...options, popupWindowName: "Nested", scope: "faceplate" });
    manager.open({ ...options, popupWindowName: "Free", parentBound: false });
    manager.closeParentBound("screen");
    expect(manager.states().map((state) => state.popupWindowName)).toEqual(["Nested", "Free"]);
    manager.dispose();
    expect(manager.states()).toEqual([]);
  });

  it("genera un modulo Runtime autonomo", () => {
    const source = hmiPopupManagerRuntimeModuleSource();
    expect(source).toContain("createHmiFaceplatePopupManager");
    expect(source).not.toContain("../");
  });
});
