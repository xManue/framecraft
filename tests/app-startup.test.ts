import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import config from "../vite.config";
import { standardProjectPageCount, standardProjectSectionChoices } from "../src/core/standardProjectChoices";
import * as generator from "../src/core/standardProject";
import { settingsProgramChoices } from "../src/core/hmiSectionMenu";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { runScripts: string }) => { window: Window & typeof globalThis & { close(): void } };
};
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
let browser: InstanceType<typeof JSDOM> | undefined;
function startup() { browser = new JSDOM(html, { runScripts: "dangerously" }); return browser.window; }
afterEach(() => browser?.window.close());

describe("first HTML before the editor module loads", () => {
  it("shows a dark accessible status without waiting for React or external assets", () => {
    const frame = startup();
    expect(frame.document.querySelector('[role="status"]')?.textContent).toContain("Avvio dell’editor");
    expect(frame.getComputedStyle(frame.document.body).backgroundColor).toBe("rgb(11, 13, 17)");
    expect(frame.document.querySelector("style")?.textContent).toContain("prefers-reduced-motion: reduce");
    expect(frame.document.querySelectorAll('script[src]:not([type="module"])')).toHaveLength(0);
  });

  it.each(["module-error", "module-resource-error", "unhandled-rejection"])("explains %s while startup is still mounted", (kind) => {
    const frame = startup();
    if (kind === "module-error") frame.dispatchEvent(new frame.ErrorEvent("error", { message: "Module unavailable" }));
    else if (kind === "unhandled-rejection") frame.dispatchEvent(new frame.Event("unhandledrejection"));
    else frame.document.querySelector('script[type="module"]')!.dispatchEvent(new frame.Event("error"));
    const alert = frame.document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Controlla l’errore nel terminale");
    expect(alert?.textContent).toContain("Progetti e bozze non sono stati eliminati");
    expect(frame.getComputedStyle(frame.document.querySelector(".startup-progress")!).display).toBe("none");
  });

  it("does not treat an unrelated image error as a failed startup", () => {
    const frame = startup(), image = frame.document.createElement("img"); frame.document.body.append(image);
    image.dispatchEvent(new frame.Event("error"));
    expect(frame.document.querySelector('[role="alert"]')).toBeNull();
  });

  it("never replaces an already mounted editor or its draft after a later error", () => {
    const frame = startup(), editor = frame.document.createElement("textarea"); editor.value = "unsaved draft";
    frame.document.getElementById("root")!.replaceChildren(editor);
    frame.dispatchEvent(new frame.ErrorEvent("error", { message: "Later failure" }));
    frame.dispatchEvent(new frame.Event("unhandledrejection"));
    expect(frame.document.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("unsaved draft");
    expect(frame.document.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("development startup boundaries", () => {
  it("scans only the real app entry and excludes its temporary tree from watching", () => {
    expect(config.optimizeDeps?.entries).toEqual(["index.html"]);
    expect(config.server?.warmup?.clientFiles).toEqual(["./src/main.tsx"]);
    const ignored = config.server?.watch?.ignored;
    expect(Array.isArray(ignored)).toBe(true);
    const predicate = (ignored as unknown[]).find(entry => typeof entry === "function") as (path: string) => boolean;
    const temporary = fileURLToPath(new URL("../.hmi-preview", import.meta.url));
    expect(predicate(temporary)).toBe(true);
    expect(predicate(temporary + "/copy/public/file.png")).toBe(true);
    expect(predicate(temporary.replaceAll("/", "\\") + "\\copy\\file.ts")).toBe(true);
    expect(predicate(temporary + "-backup/file.ts")).toBe(false);
    expect(predicate(fileURLToPath(new URL("../src/main.tsx", import.meta.url)))).toBe(false);
  });

  it("keeps the native window background consistent before the first HTML is available", () => {
    const native = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    expect(native.app.windows[0].backgroundColor).toBe("#0b0d11");
    expect(html).toContain(`background: ${native.app.windows[0].backgroundColor}`);
    expect(native.build.beforeDevCommand).toBe("npm run web:dev");
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(packageJson.scripts.dev).toBe("tauri dev --config src-tauri/tauri.dev.conf.json");
    const development = JSON.parse(readFileSync(new URL("../src-tauri/tauri.dev.conf.json", import.meta.url), "utf8"));
    expect(development).toEqual({ bundle: { resources: null } });
    expect(native.bundle.resources["../scripts/framecraft-vite-plugin.mjs"]).toBe("scripts/framecraft-vite-plugin.mjs");
  });

  it("preserves the generator exports and exact section counts after the lightweight split", () => {
    expect(generator.standardProjectSectionChoices).toBe(standardProjectSectionChoices);
    expect(generator.standardProjectPageCount).toBe(standardProjectPageCount);
    expect(standardProjectSectionChoices.map(choice => choice.id)).toEqual(["main", "settings", "alarms", "statistics", "manuals", "diagnostic", "formats"]);
    expect(standardProjectPageCount(["main"])).toBe(9);
    for (const { id } of settingsProgramChoices) {
      expect(standardProjectPageCount(["settings"], id)).toBeGreaterThan(1);
      expect(standardProjectPageCount([], id)).toBe(0);
    }
  });
});
