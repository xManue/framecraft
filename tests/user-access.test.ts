// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultUserAccessConfig, normalizeUserAccessConfig, parseUserAccessRuntime, relativeModulePath, serializeUserAccessRuntime, userAccessImport, type UserAccessConfig } from "../src/core/userAccess";
import { parseSource } from "../src/source-parser/parseSource";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile, createFile: bridge.createFile },
}));
import { useEditorStore } from "../src/state/editorStore";

const panelConfig: UserAccessConfig = {
  permissions: [{ id: "comandi", label: "Comandare la macchina" }, { id: "parametri", label: "Cambiare i parametri" }],
  accounts: [
    { id: "mario", name: "Mario", pin: "1234", role: "Manutentore", permissions: ["comandi", "parametri"] },
    { id: "linea", name: "Linea 1", pin: "", role: "Operatore", permissions: ["comandi"] },
  ],
  autoLogoutMinutes: 0,
};

function install(config: UserAccessConfig) {
  new Function(serializeUserAccessRuntime(config))();
}

describe("ready-made user access", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: () => null, get length() { return values.size; } };
    vi.stubGlobal("localStorage", storage);
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((style) => style.remove());
    localStorage.clear();
    bridge.readFile.mockReset();
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    bridge.createFile.mockReset().mockResolvedValue("C:/panel/src/framecraft/user-access.js");
  });

  it("adds one portable side-effect import", () => {
    expect(relativeModulePath("C:\\panel\\src\\main.jsx", "C:\\panel\\src\\framecraft\\user-access.js")).toBe("./framecraft/user-access.js");
    const once = userAccessImport("createRoot(root).render(<App />);", "./framecraft/user-access.js");
    expect(once).toContain("framecraft-user-access-runtime");
    expect(userAccessImport(once, "./framecraft/user-access.js")).toBe(once);
    expect(() => new Function(serializeUserAccessRuntime(defaultUserAccessConfig))).not.toThrow();
  });

  it("carries the accounts inside the generated file and reads them back", () => {
    const source = serializeUserAccessRuntime(panelConfig);
    expect(source).toContain("framecraft.operator-session");
    expect(source).toContain("@media(max-width:600px)");
    expect(source).toContain("grid-template-columns:minmax(0,1fr)");
    expect(parseUserAccessRuntime(source)).toEqual(panelConfig);
    expect(parseUserAccessRuntime("console.log('altro file');")).toBeUndefined();
  });

  it("rebuilds a config edited by hand", () => {
    const config = normalizeUserAccessConfig({
      permissions: [{ label: "Cambiare i parametri" }, { label: "Cambiare i parametri" }, { label: "  " }],
      accounts: [{ name: "Mario", permissions: ["cambiare-i-parametri", "inventato"] }, { name: "" }],
      autoLogoutMinutes: "12",
    });
    // Two permissions written with the same name stay two, with ids the elements can tell apart.
    expect(config.permissions.map((permission) => permission.id)).toEqual(["cambiare-i-parametri", "cambiare-i-parametri-2"]);
    expect(config.accounts).toEqual([{ id: "mario", name: "Mario", pin: "", role: "Operatore", permissions: ["cambiare-i-parametri"] }]);
    expect(config.autoLogoutMinutes).toBe(12);
  });

  it("opens the login page, validates the PIN and unlocks what the account may press", () => {
    const trigger = document.createElement("button");
    trigger.dataset.fcUserAccess = "true";
    trigger.innerHTML = "User: <strong>DefaultUser</strong>";
    const command = document.createElement("button");
    command.dataset.fcUserRequires = "parametri";
    command.textContent = "Parametri";
    document.body.append(trigger, command);
    install(panelConfig);

    expect(command.dataset.fcUserGranted).toBe("false");
    expect(command.disabled).toBe(true);
    expect(command.getAttribute("title")).toContain("Cambiare i parametri");

    trigger.click();
    const accounts = document.querySelectorAll<HTMLButtonElement>(".fcua-account");
    expect([...accounts].map((account) => account.dataset.account)).toEqual(["mario", "linea"]);
    accounts[0].click();

    const form = document.querySelector<HTMLFormElement>(".fcua-pin-form")!;
    const keys = [...document.querySelectorAll<HTMLButtonElement>(".fcua-keypad button")];
    keys.filter((key) => key.dataset.key === "9").forEach((key) => { key.click(); key.click(); key.click(); key.click(); });
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(document.querySelector(".fcua-error")?.textContent).toContain("PIN non corretto");

    ["1", "2", "3", "4"].forEach((digit) => keys.find((key) => key.dataset.key === digit)!.click());
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(document.querySelector(".fcua-page")).toBeNull();
    expect(trigger.querySelector("strong")?.textContent).toBe("Mario");
    expect(trigger.dataset.fcAuthenticated).toBe("true");
    expect(command.dataset.fcUserGranted).toBe("true");
    expect(command.disabled).toBe(false);

    trigger.click();
    expect(document.querySelector(".fcua-permissions")?.textContent).toContain("Cambiare i parametri");
    document.querySelector<HTMLButtonElement>(".fcua-danger")!.click();
    expect(trigger.querySelector("strong")?.textContent).toBe("Nessun utente");
    expect(command.disabled).toBe(true);
    expect(document.querySelectorAll(".fcua-account").length).toBe(2);
  });

  it("lets an account with no PIN in, and still opens a panel configured before the accounts existed", () => {
    const trigger = document.createElement("button");
    trigger.dataset.fcUserAccess = "true";
    trigger.dataset.fcUserName = "Vecchio";
    trigger.dataset.fcUserPin = "";
    trigger.dataset.fcUserRole = "Operatore";
    document.body.append(trigger);
    install({ permissions: [{ id: "comandi", label: "Comandare" }], accounts: [], autoLogoutMinutes: 0 });

    trigger.click();
    document.querySelector<HTMLButtonElement>(".fcua-account")!.click();
    expect(document.querySelector<HTMLInputElement>("input[name=pin]")?.disabled).toBe(true);
    document.querySelector<HTMLFormElement>(".fcua-pin-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(JSON.parse(localStorage.getItem("framecraft.operator-session")!)).toMatchObject({ name: "Vecchio", permissions: ["comandi"] });
  });

  it("keeps login attributes and the runtime import when the selected button lives in the React entry file", async () => {
    const mainFile = "C:/panel/src/main.jsx";
    const main = 'import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")).render(<button>User</button>);';
    const document = parseSource(mainFile, main);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    bridge.readFile.mockResolvedValue(main);
    useEditorStore.setState({
      project: { root: "C:/panel", name: "panel", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [mainFile], files: [], scripts: {}, dependencies: ["react"], hasNodeModules: true, missingDependencies: [] },
      document, selectedId: button.id, selectionInfo: undefined, selectionStyles: {}, interactionMode: "edit", editScope: "instance",
      dirty: false, loading: false, history: [], future: [], consoleEntries: [], lastError: undefined,
      userAccessConfig: undefined, userAccessOpen: false, panelManifest: undefined,
    });

    await useEditorStore.getState().configureUserAccess();

    const writes = bridge.writeFile.mock.calls.filter(([file]) => file === mainFile);
    expect(writes.length).toBeGreaterThan(0);
    const finalSource = writes.at(-1)![1] as string;
    expect(finalSource).toContain('import "./framecraft/user-access.js"');
    expect(finalSource).toContain('data-fc-user-access="true"');
    expect(finalSource).toContain('data-fc-user-logged-out="Nessun utente"');
    expect(finalSource).toContain('createRoot(document.getElementById("root")).render(');
    expect(finalSource).toContain('>User</button>');
    expect(useEditorStore.getState().document?.source).toBe(finalSource);
    expect(useEditorStore.getState().userAccessOpen).toBe(true);
    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(parseUserAccessRuntime(bridge.createFile.mock.calls[0][1] as string)).toEqual(defaultUserAccessConfig);
  });

  it("reports a missing React entry without referring to removed editor modes", async () => {
    useEditorStore.setState({
      project: { root: "C:/panel", name: "panel", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files: [], scripts: {}, dependencies: ["react"], hasNodeModules: true, missingDependencies: [] },
      document: undefined, selectedId: undefined, lastError: undefined, consoleEntries: [],
      userAccessConfig: undefined, userAccessBusy: false,
    });

    await useEditorStore.getState().saveUserAccess(panelConfig);

    const state = useEditorStore.getState();
    expect(state.lastError).toContain("Non trovo il file che avvia React");
    expect(state.lastError).toContain("file di ingresso");
    expect(state.lastError).not.toMatch(/modalit[aà]/i);
    expect(state.userAccessBusy).toBe(false);
  });

  it("installs the ready action from the selected element", async () => {
    const appFile = "C:/panel/src/App.jsx";
    const mainFile = "C:/panel/src/main.jsx";
    const app = "export default function App(){ return <main><button>User</button></main>; }";
    const main = 'import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")).render(null);';
    const document = parseSource(appFile, app);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    bridge.readFile.mockImplementation(async (file: string) => file === mainFile ? main : app);
    useEditorStore.setState({
      project: { root: "C:/panel", name: "panel", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [appFile, mainFile], files: [], scripts: {}, dependencies: ["react"], hasNodeModules: true, missingDependencies: [] },
      document, selectedId: button.id, selectionInfo: undefined, history: [], future: [], consoleEntries: [], lastError: undefined,
      userAccessConfig: undefined, userAccessOpen: false,
    });

    await useEditorStore.getState().configureUserAccess();

    const [[path, runtime]] = bridge.createFile.mock.calls as [string, string][];
    expect(path).toBe("src/framecraft/user-access.js");
    expect(parseUserAccessRuntime(runtime)).toEqual(defaultUserAccessConfig);
    const written = bridge.writeFile.mock.calls.map(([, source]) => source as string);
    expect(written.some((source) => source.includes('data-fc-user-access="true"'))).toBe(true);
    expect(written.some((source) => source.includes('import "./framecraft/user-access.js"'))).toBe(true);
    // The element no longer carries a single user: the accounts belong to the whole panel.
    expect(written.some((source) => source.includes("data-fc-user-pin"))).toBe(false);
    expect(useEditorStore.getState().userAccessOpen).toBe(true);
    expect(useEditorStore.getState().lastError).toBeUndefined();

    bridge.createFile.mockClear();
    await useEditorStore.getState().saveUserAccess(panelConfig);
    expect(parseUserAccessRuntime(bridge.createFile.mock.calls[0][1] as string)).toEqual(panelConfig);
    expect(useEditorStore.getState().userAccessConfig).toEqual(panelConfig);
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });
});
