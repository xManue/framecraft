import { OperatorAuthError, operatorCapabilities, operatorKeys, operatorText, type OperatorProfile, type OperatorSession } from "../../runtime/operator-policy.mjs";

interface OperatorProvider { currentUser(): OperatorProfile | null; open(opener?: HTMLElement): void; headers(): Record<string, string> }
type OperatorWindow = typeof globalThis & { __framecraftOperatorSession?: OperatorProvider & { dispose(): void } };
export function operatorSessionHeaders(): Record<string, string> { return (globalThis as OperatorWindow).__framecraftOperatorSession?.headers() ?? {}; }

function parseSession(value: unknown): OperatorSession {
  if (!operatorKeys(value, ["user", "csrfToken", "expiresInMs"])) throw new OperatorAuthError("AUTH_STORE");
  const session = value as OperatorSession;
  if (session.user === null) { if (session.csrfToken !== null || session.expiresInMs !== 0) throw new OperatorAuthError("AUTH_STORE"); return session; }
  const user = session.user;
  if (!operatorKeys(user, ["id", "name", "role", "permissions", "capabilities"]) || !operatorText(user.id, 80) || !operatorText(user.name) || !operatorText(user.role, 80)
    || !Array.isArray(user.permissions) || user.permissions.length > 64 || user.permissions.some(id => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id)) || new Set(user.permissions).size !== user.permissions.length
    || !Array.isArray(user.capabilities) || user.capabilities.length > operatorCapabilities.length || user.capabilities.some(id => !operatorCapabilities.includes(id)) || new Set(user.capabilities).size !== user.capabilities.length
    || typeof session.csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(session.csrfToken) || !Number.isFinite(session.expiresInMs) || session.expiresInMs <= 0 || session.expiresInMs > 480 * 60000) throw new OperatorAuthError("AUTH_STORE");
  return structuredClone(session);
}

export function installHmiOperatorSession(options: { path?: string; enabled: boolean; canSwitch?: () => boolean; request?: typeof fetch }) {
  const scope = globalThis as OperatorWindow; scope.__framecraftOperatorSession?.dispose();
  const path = options.path ?? "/_framecraft/plc/v1";
  const configured = options.enabled && path === "/_framecraft/plc/v1";
  let session: OperatorSession = { user: null, csrfToken: null, expiresInMs: 0 }, disposed = false, busy = false, checking = false, epoch = 0;
  let notice = configured ? "Verifica dell’accesso…" : "Accesso server non configurato. Configura gli account locali e abilita framecraft.auth.json e il gateway. Il PIN browser non abilita i comandi PLC.";
  let modal: HTMLDialogElement | undefined, opener: HTMLElement | undefined, expiration: ReturnType<typeof setTimeout> | undefined;
  const requests = new Set<AbortController>();
  const emit = () => window.dispatchEvent(new CustomEvent("framecraft:user-changed"));
  const clear = (reason = "") => { clearTimeout(expiration); session = { user: null, csrfToken: null, expiresInMs: 0 }; notice = reason; emit(); render(); };
  const accept = (value: OperatorSession, elapsed: number) => {
    const changed = JSON.stringify(session.user) !== JSON.stringify(value.user) || !!notice;
    clearTimeout(expiration); session = value; notice = "";
    if (value.user) expiration = setTimeout(() => clear("Sessione scaduta. Accedi di nuovo prima di inviare comandi."), Math.max(0, value.expiresInMs - elapsed));
    emit(); if (changed) render();
  };
  const request = async (suffix: string, input?: unknown) => {
    const controller = new AbortController(); requests.add(controller); const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await (options.request ?? fetch)(path + "/session" + suffix, { method: input === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: input === undefined ? {} : { "Content-Type": "application/json", ...operatorSessionHeaders() }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
      const text = await response.text(); if (text.length > 32768) throw new OperatorAuthError("AUTH_STORE");
      let value; try { value = JSON.parse(text); } catch { throw new OperatorAuthError("AUTH_STORE"); }
      if (!response.ok) throw new OperatorAuthError(value?.type === "operator" && typeof value.code === "string" ? value.code : "AUTH_CONFIG");
      return parseSession(value);
    } finally { clearTimeout(timer); requests.delete(controller); }
  };
  const refresh = async () => {
    if (disposed || !configured || checking || busy) return;
    checking = true; const current = epoch, started = performance.now();
    try { const next = await request(""); if (!disposed && current === epoch) accept(next, performance.now() - started); }
    catch (error) { if (!disposed && current === epoch) { const safe = error instanceof OperatorAuthError ? error : new OperatorAuthError("AUTH_STORE"); clear(`${safe.message}. ${safe.remedy}`); } }
    finally { checking = false; }
  };
  const close = () => { if (busy) return; modal?.close(); modal?.remove(); modal = undefined; opener?.focus(); };
  const perform = async (action: "login" | "logout", input: unknown) => {
    if (disposed || busy || !configured || options.canSwitch?.() === false) return;
    busy = true; epoch++; const started = performance.now(); render();
    try { const next = await request("/" + action, input); if (!disposed) { accept(next, performance.now() - started); notice = action === "logout" ? "Accesso chiuso sul server." : "Accesso riuscito. I comandi richiedono comunque i permessi assegnati."; } }
    catch (error) {
      if (!disposed) { const safe = error instanceof OperatorAuthError ? error : new OperatorAuthError("AUTH_STORE"); clear((action === "logout" ? "Uscita non confermata dal server. Verifica l’accesso prima di lasciare il pannello. " : "") + `${safe.message}. ${safe.remedy}`); }
    } finally { busy = false; if (!disposed) render(); }
  };
  function render() {
    if (!modal) return;
    modal.innerHTML = `<header><h1 id="fc-operator-title">Accesso al pannello</h1><button type="button" data-close aria-label="Chiudi accesso">×</button></header><p data-notice role="status" aria-live="polite"></p><section></section>`;
    modal.setAttribute("aria-busy", String(busy)); modal.querySelector("[data-notice]")!.textContent = notice;
    const section = modal.querySelector("section")!;
    if (session.user) {
      section.innerHTML = `<h2></h2><p data-role></p><p>Capacità autorizzate dal server:</p><ul></ul><p>La sessione scade per inattività o alla durata massima prevista. Le modifiche agli account revocano gli accessi attivi.</p><button type="button" data-logout>Esci / cambia utente</button>`;
      section.querySelector("h2")!.textContent = session.user.name; section.querySelector("[data-role]")!.textContent = session.user.role;
      for (const capability of session.user.capabilities.length ? session.user.capabilities : ["Nessuna: comandi protetti bloccati"]) { const item = document.createElement("li"); item.textContent = capability; section.querySelector("ul")!.append(item); }
      section.querySelector("[data-logout]")!.addEventListener("click", () => void perform("logout", {}));
    } else {
      section.innerHTML = `<p>Usa l’account operatore di questo pannello, non l’account ChatGPT né il PIN locale.</p><form><label for="fc-operator-name">Nome utente</label><input id="fc-operator-name" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="64" required><label for="fc-operator-password">Password</label><input id="fc-operator-password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">Accedi al pannello</button></form>`;
      section.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault(); const form = event.currentTarget as HTMLFormElement, data = new FormData(form), password = String(data.get("password") ?? "");
        (form.elements.namedItem("password") as HTMLInputElement).value = "";
        void perform("login", { username: String(data.get("username") ?? "").trim().toLowerCase(), password });
      });
    }
    const verify = document.createElement("button"); verify.type = "button"; verify.textContent = "Verifica accesso"; verify.addEventListener("click", () => void refresh()); section.append(verify);
    modal.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach(element => { element.disabled = busy || !configured && !element.hasAttribute("data-close"); });
    modal.querySelector("[data-close]")!.addEventListener("click", close);
    if (busy) modal.querySelector<HTMLHeadingElement>("h1")?.setAttribute("tabindex", "-1");
    (busy ? modal.querySelector<HTMLElement>("h1") : modal.querySelector<HTMLElement>(session.user ? "[data-logout]" : "input"))?.focus();
  }
  const style = document.createElement("style");
  style.textContent = `[data-fc-operator-root]{box-sizing:border-box;position:fixed;inset:0;width:min(720px,calc(100% - 24px));max-height:calc(100dvh - 24px);margin:auto;padding:24px;border:1px solid #59718a;border-radius:12px;background:#111c29;color:#edf4fc;font:16px/1.5 system-ui,sans-serif;overflow:auto;overflow-wrap:anywhere}[data-fc-operator-root]::backdrop{background:#000b}[data-fc-operator-root] *{box-sizing:border-box}[data-fc-operator-root] header{display:flex;align-items:center;justify-content:space-between;gap:12px}[data-fc-operator-root] h1{font-size:24px;margin:0}[data-fc-operator-root] form{display:grid;gap:12px}[data-fc-operator-root] input,[data-fc-operator-root] button{min-height:48px;max-width:100%;font:inherit;color:inherit;border:1px solid #728ca6;border-radius:6px;padding:10px 14px;background:#192b3e}[data-fc-operator-root] input{width:100%}[data-fc-operator-root] button{cursor:pointer;margin:8px 8px 0 0}[data-fc-operator-root] button:hover{background:#2c4864}[data-fc-operator-root] :focus-visible{outline:3px solid #8acbff;outline-offset:3px}[data-fc-operator-root] :disabled{opacity:.65;cursor:wait}[data-fc-operator-root] [data-notice]{border-left:3px solid #8acbff;padding-left:12px;color:#deedfc}[data-fc-operator-root] [data-notice]:empty{display:none}`;
  document.head.append(style);
  const provider = {
    currentUser: () => disposed ? null : structuredClone(session.user),
    headers: (): Record<string, string> => !disposed && session.user && session.csrfToken ? { "X-Framecraft-CSRF": session.csrfToken } : {},
    open(source?: HTMLElement) {
      if (disposed) return; if (modal) { modal.focus(); return; }
      opener = source; modal = document.createElement("dialog"); modal.dataset.fcOperatorRoot = ""; modal.setAttribute("aria-labelledby", "fc-operator-title");
      modal.addEventListener("cancel", event => { event.preventDefault(); close(); }); document.body.append(modal); modal.showModal(); render();
    },
    dispose() { if (disposed) return; disposed = true; epoch++; clearInterval(poll); clearTimeout(expiration); for (const controller of requests) controller.abort(); requests.clear(); modal?.remove(); modal = undefined; style.remove(); session = { user: null, csrfToken: null, expiresInMs: 0 }; emit(); },
  };
  const poll = setInterval(() => void refresh(), 30000);
  scope.__framecraftOperatorSession = provider; emit(); void refresh();
  return { ...provider, refresh };
}
