// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installHmiOperatorSession, operatorSessionHeaders } from "../src/core/hmiOperatorSession";
import { serializeUserAccessRuntime } from "../src/core/userAccess";
const csrf = "A".repeat(43), user = { id: "synthetic-user", name: "Operatore sintetico", role: "Operatore", permissions: ["comandi"], capabilities: ["recipes.read", "recipes.create"] };
const anonymous = { user: null, csrfToken: null, expiresInMs: 0 }, active = { user, csrfToken: csrf, expiresInMs: 60000 };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
type TestGlobal = typeof globalThis & { __framecraftOperatorSession?: ReturnType<typeof installHmiOperatorSession>; __framecraftUserAccess?: { dispose(): void } };
const scope = globalThis as TestGlobal;
beforeEach(() => {
  document.body.innerHTML = "";
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ id: "admin", name: "FAKE_BROWSER_ADMIN", permissions: ["comandi", "parametri"] }), setItem: vi.fn(), removeItem: vi.fn() });
});
afterEach(() => { scope.__framecraftOperatorSession?.dispose(); scope.__framecraftUserAccess?.dispose(); delete scope.__framecraftOperatorSession; delete scope.__framecraftUserAccess; vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("accesso operatore browser", () => {
  it("nessun PIN o storage locale concede accesso quando il provider server esiste", async () => {
    const request = vi.fn(async () => response(anonymous)); const client = installHmiOperatorSession({ enabled: true, request });
    new Function(serializeUserAccessRuntime({ accounts: [], permissions: [{ id: "comandi", label: "Comandi" }], autoLogoutMinutes: 0 }))();
    document.body.innerHTML = '<button data-fc-user-access>Accesso</button><button data-fc-user-requires="comandi">Comando</button>';
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1)); window.dispatchEvent(new CustomEvent("framecraft:user-changed"));
    expect(client.currentUser()).toBeNull(); expect(document.querySelector('[data-fc-user-requires]')?.getAttribute("data-fc-user-granted")).toBe("false");
    document.querySelector<HTMLButtonElement>("[data-fc-user-access]")!.click(); expect(document.querySelector("dialog")).not.toBeNull(); expect(document.querySelector(".fcua-page")).toBeNull(); expect(document.body.textContent).not.toContain("FAKE_BROWSER_ADMIN"); expect(operatorSessionHeaders()).toEqual({});
  });
  it("login esplicito, password cancellata, CSRF soltanto nei POST e logout esplicito", async () => {
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => response(init?.method === "POST" && String(_url).endsWith("/login") ? active : anonymous));
    const client = installHmiOperatorSession({ enabled: true, request }); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    client.open(); const name = document.querySelector<HTMLInputElement>('input[name="username"]')!, password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    expect(name.autocomplete).toBe("username"); expect(password.type).toBe("password"); name.value = "operator"; password.value = "SYNTHETIC-password";
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(password.value).toBe(""); await vi.waitFor(() => expect(client.currentUser()?.name).toBe(user.name));
    expect(request.mock.calls[1][1]).toMatchObject({ credentials: "same-origin", redirect: "error", headers: { "Content-Type": "application/json" } }); expect(operatorSessionHeaders()).toEqual({ "X-Framecraft-CSRF": csrf });
    const copy = client.currentUser()!; copy.permissions.push("parametri"); expect(client.currentUser()?.permissions).toEqual(["comandi"]);
    document.querySelector<HTMLButtonElement>("[data-logout]")!.click(); await vi.waitFor(() => expect(client.currentUser()).toBeNull());
    expect(request.mock.calls[2][1]?.headers).toMatchObject({ "X-Framecraft-CSRF": csrf }); expect(operatorSessionHeaders()).toEqual({}); expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it("scadenza e arresto tolgono autorità, senza fallback alla sessione browser", async () => {
    vi.useFakeTimers(); const request = vi.fn(async () => response({ ...active, expiresInMs: 1000 })); const client = installHmiOperatorSession({ enabled: true, request });
    await vi.advanceTimersByTimeAsync(1); expect(client.currentUser()?.name).toBe(user.name); await vi.advanceTimersByTimeAsync(1001); expect(client.currentUser()).toBeNull();
    client.dispose(); expect(operatorSessionHeaders()).toEqual({}); expect(scope.__framecraftOperatorSession?.currentUser()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it("errore rete e risposta fuori contratto non mostrano segreti o concedono permessi", async () => {
    const client = installHmiOperatorSession({ enabled: true, request: async () => response({ ...active, user: { ...user, capabilities: ["admin"] } }) });
    await vi.waitFor(() => { client.open(); expect(document.body.textContent).toContain("Archivio operatori non disponibile"); }); expect(client.currentUser()).toBeNull();
    expect(document.body.textContent).not.toContain(csrf);
  });
  it("configurazione assente non fa rete; guardia bozza blocca il cambio account", async () => {
    const request = vi.fn(async () => response(anonymous)); const disabled = installHmiOperatorSession({ enabled: false, request }); disabled.open(); expect(document.body.textContent).toContain("Accesso server non configurato"); expect(request).not.toHaveBeenCalled(); disabled.dispose();
    const client = installHmiOperatorSession({ enabled: true, request, canSwitch: () => false }); await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1)); client.open();
    document.querySelector<HTMLInputElement>('[name="username"]')!.value = "operator"; document.querySelector<HTMLInputElement>('[name="password"]')!.value = "SYNTHETIC-password";
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); expect(request).toHaveBeenCalledTimes(1);
  });
});
