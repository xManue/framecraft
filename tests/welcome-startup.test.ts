// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { chooseImage: vi.fn() } }));
import { WelcomeScreen } from "../src/editor/WelcomeScreen";
import { useEditorStore } from "../src/state/editorStore";
import { useEditorAi } from "../src/state/editorAi";
import { standardProjectPageCount, standardProjectSectionChoices } from "../src/core/standardProjectChoices";

const initialEditor = useEditorStore.getState(), initialAi = useEditorAi.getState();
let root: Root, host: HTMLDivElement;
const button = (text: string) => [...host.querySelectorAll("button")].find(button => button.textContent?.includes(text))!;
async function click(text: string) { await act(async () => { button(text).click(); await vi.dynamicImportSettled(); }); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useEditorStore.setState({ ...initialEditor, project: undefined, loading: false, recentProjects: [], lastError: undefined }, true);
  useEditorAi.setState({ ...initialAi, open: false }, true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(WelcomeScreen)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorStore.setState(initialEditor, true); useEditorAi.setState(initialAi, true); });

describe("deferred new-panel procedure", () => {
  it("opens on demand, keeps manual state during rerenders, and reopens cleanly after closing", async () => {
    const create = vi.fn(); useEditorStore.setState({ createStandardProject: create });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await click("Nuovo pannello"); expect(host.textContent).toContain("Come vuoi costruire il pannello?");
    await click("Senza AI"); expect(host.textContent).toContain("Crea un pannello HMI standard");
    const count = standardProjectPageCount(standardProjectSectionChoices.map(choice => choice.id));
    expect(host.textContent).toContain(`${count} pagine iniziali`);
    await act(async () => useEditorStore.setState({ recentProjects: ["C:/synthetic-panel"] }));
    expect(host.textContent).toContain("Crea un pannello HMI standard");
    expect(host.querySelector<HTMLInputElement>(".standard-project-name input")?.value).toBe("Nuovo pannello operatore");
    await click("Scegli cartella e crea");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ machineName: "Nuovo pannello operatore", layout: "desktop-mobile", sections: standardProjectSectionChoices.map(choice => choice.id) }));
    await click("Annulla"); expect(host.querySelector('[role="dialog"]')).toBeNull();
    await click("Nuovo pannello"); expect(host.textContent).toContain("Come vuoi costruire il pannello?");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("still hands the AI option to the guided interview without creating a project", async () => {
    const create = vi.fn(); useEditorStore.setState({ createStandardProject: create });
    await click("Nuovo pannello"); await click("Con AI");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(useEditorAi.getState().open).toBe(true); expect(useEditorAi.getState().mode).toBe("create");
    expect(create).not.toHaveBeenCalled();
  });
});
