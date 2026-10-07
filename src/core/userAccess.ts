const runtimeMarker = "framecraft-user-access-runtime";
const configStart = "/* framecraft-user-access-config-start */";
const configEnd = "/* framecraft-user-access-config-end */";

/** One thing an account is allowed to do. The panel names it, the elements ask for it. */
export type UserAccessPermission = { id: string; label: string };

export type UserAccessAccount = {
  id: string;
  name: string;
  /** Kept in clear text inside the generated project: it guards a local panel, not a network. */
  pin: string;
  role: string;
  permissions: string[];
};

export type UserAccessConfig = {
  permissions: UserAccessPermission[];
  accounts: UserAccessAccount[];
  /** Minutes of inactivity before the panel logs out on its own. 0 leaves the session open. */
  autoLogoutMinutes: number;
};

/** What a panel gets before anybody configures anything: the two roles every machine has, and the
 * three things they are usually allowed to do. It is a starting point to rename, not a rule. */
export const defaultUserAccessConfig: UserAccessConfig = {
  permissions: [
    { id: "comandi", label: "Comandare la macchina" },
    { id: "parametri", label: "Cambiare i parametri" },
    { id: "manutenzione", label: "Manutenzione e diagnostica" },
  ],
  accounts: [
    { id: "operatore", name: "Operatore", pin: "", role: "Operatore", permissions: ["comandi"] },
    { id: "manutentore", name: "Manutentore", pin: "1234", role: "Manutentore", permissions: ["comandi", "parametri", "manutenzione"] },
  ],
  autoLogoutMinutes: 0,
};

/** Names are written by hand and end up in the source of the panel, so they are reduced to something
 * safe to put in an attribute before anything else refers to them. */
export function userAccessId(value: string, fallback: string) {
  const slug = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function uniqueId(candidate: string, taken: Set<string>) {
  let id = candidate;
  let counter = 2;
  while (taken.has(id)) id = `${candidate}-${counter++}`;
  taken.add(id);
  return id;
}

/** The config travels through a file the user can open and edit by hand, so nothing that comes back
 * is trusted: every field is rebuilt with the shape the runtime and the window expect. */
export function normalizeUserAccessConfig(value: unknown): UserAccessConfig {
  const raw = (value ?? {}) as Partial<Record<keyof UserAccessConfig, unknown>>;
  const permissionIds = new Set<string>();
  const permissions = (Array.isArray(raw.permissions) ? raw.permissions : []).flatMap((item, index) => {
    const entry = (item ?? {}) as Partial<UserAccessPermission>;
    const label = String(entry.label ?? entry.id ?? "").trim();
    if (!label) return [];
    return [{ id: uniqueId(userAccessId(String(entry.id ?? label), `permesso-${index + 1}`), permissionIds), label }];
  });
  const known = new Set(permissions.map((permission) => permission.id));
  const accountIds = new Set<string>();
  const accounts = (Array.isArray(raw.accounts) ? raw.accounts : []).flatMap((item, index) => {
    const entry = (item ?? {}) as Partial<UserAccessAccount>;
    const name = String(entry.name ?? "").trim();
    if (!name) return [];
    const granted = (Array.isArray(entry.permissions) ? entry.permissions : []).map(String).filter((permission) => known.has(permission));
    return [{
      id: uniqueId(userAccessId(String(entry.id ?? name), `utente-${index + 1}`), accountIds),
      name,
      pin: String(entry.pin ?? "").trim(),
      role: String(entry.role ?? "Operatore").trim() || "Operatore",
      permissions: [...new Set(granted)],
    }];
  });
  const minutes = Number(raw.autoLogoutMinutes);
  return { permissions, accounts, autoLogoutMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), 480) : 0 };
}

export function userAccessImport(source: string, specifier: string) {
  if (source.includes(runtimeMarker) || source.includes(specifier)) return source;
  return `import ${JSON.stringify(specifier)}; // ${runtimeMarker}\n${source}`;
}

export function relativeModulePath(fromFile: string, toFile: string) {
  const from = fromFile.replaceAll("\\", "/").split("/").slice(0, -1);
  const to = toFile.replaceAll("\\", "/").split("/");
  let common = 0;
  while (common < from.length && common < to.length && from[common].toLowerCase() === to[common].toLowerCase()) common += 1;
  const value = [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

/** The generated project receives no Framecraft dependency: this function is serialized as plain JS
 * and the accounts travel with it, so the panel keeps working when it is opened somewhere else. */
function installUserAccess(config: UserAccessConfig) {
  if (typeof document === "undefined") return;
  const storageKey = "framecraft.operator-session";
  const selector = "[data-fc-user-access]";
  const gateSelector = "[data-fc-user-requires], [data-fc-user-visible-requires]";
  const permissions = Array.isArray(config?.permissions) ? config.permissions : [];
  const accounts = Array.isArray(config?.accounts) ? config.accounts : [];
  const idleLimit = Number(config?.autoLogoutMinutes) > 0 ? Number(config.autoLogoutMinutes) * 60000 : 0;
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => replacements[character]);
  type Session = { id?: string; name: string; role?: string; permissions?: string[]; loginAt?: string };
  const session = (): Session | null => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as Session | null;
      if (!saved || typeof saved.name !== "string") return null;
      const account = accounts.find((item) => item.id === saved.id);
      if (accounts.length && !account) return null;
      return { ...saved, ...(account ? { name: account.name, role: account.role } : {}), permissions: (account?.permissions ?? saved.permissions ?? []).filter((id) => permissions.some((permission) => permission.id === id)) };
    }
    catch { return null; }
  };
  const labelOf = (trigger: HTMLElement) => trigger.querySelector<HTMLElement>("[data-fc-user-name], strong") || trigger;
  const permissionLabel = (id: string) => permissions.find((permission) => permission.id === id)?.label || id;

  const gateBefore = new Map<HTMLElement, { aria: string | null; title: string | null; notice: string }>();
  const gatedElements = new Set<HTMLElement>();
  const editMode = () => document.documentElement.dataset.framecraftMode === "edit";
  const applyGates = () => {
    const active = session();
    const granted = new Set(active?.permissions || []);
    const elements = new Set([...document.querySelectorAll<HTMLElement>(gateSelector), ...gatedElements]);
    elements.forEach((element) => {
      gatedElements.add(element);
      const required = (element.dataset.fcUserRequires || "").split(",").map((value) => value.trim()).filter(Boolean);
      const missing = required.filter((permission) => !granted.has(permission));
      const visibleRequired = (element.dataset.fcUserVisibleRequires || "").split(",").map((value) => value.trim()).filter(Boolean);
      const visible = visibleRequired.every((permission) => granted.has(permission));
      const usable = missing.length ? "false" : "true";
      if (element.dataset.fcUserGranted !== usable) element.dataset.fcUserGranted = usable;
      if (element.dataset.fcUserVisibleGranted !== String(visible)) element.dataset.fcUserVisibleGranted = String(visible);
      const locked = missing.length > 0 && !editMode() && element.isConnected;
      element.classList.toggle("fcua-locked", locked);
      if (locked) {
        if (!gateBefore.has(element)) gateBefore.set(element, { aria: element.getAttribute("aria-disabled"), title: element.getAttribute("title"), notice: "" });
        const before = gateBefore.get(element)!;
        before.notice = `Serve il permesso: ${missing.map(permissionLabel).join(", ")}`;
        if (element.getAttribute("aria-disabled") !== "true") element.setAttribute("aria-disabled", "true");
        if (element.getAttribute("title") !== before.notice) element.setAttribute("title", before.notice);
      } else {
        const before = gateBefore.get(element);
        if (before) {
          if (element.getAttribute("aria-disabled") === "true") before.aria === null ? element.removeAttribute("aria-disabled") : element.setAttribute("aria-disabled", before.aria);
          if (element.getAttribute("title") === before.notice) before.title === null ? element.removeAttribute("title") : element.setAttribute("title", before.title);
          gateBefore.delete(element);
        }
      }
      if (!element.isConnected || !element.hasAttribute("data-fc-user-requires") && !element.hasAttribute("data-fc-user-visible-requires")) {
        gatedElements.delete(element);
        element.removeAttribute("data-fc-user-granted");
        element.removeAttribute("data-fc-user-visible-granted");
      }
    });
  };

  const updateLabels = () => {
    const active = session();
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (element.dataset.fcAuthenticated !== String(Boolean(active))) element.dataset.fcAuthenticated = String(Boolean(active));
      const label = labelOf(element);
      const text = active?.name || element.dataset.fcUserLoggedOut || "Nessun utente";
      if (!label.childElementCount && label.textContent !== text) label.textContent = text;
      const description = active ? `Utente ${active.name}. Apri gestione accesso` : "Accedi al pannello";
      if (element.getAttribute("aria-label") !== description) element.setAttribute("aria-label", description);
    });
    applyGates();
  };

  let idleTimer = 0;
  const startIdleTimer = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    if (!idleLimit || !session()) return;
    idleTimer = setTimeout(() => logout("Sessione chiusa per inattività."), idleLimit) as unknown as number;
  };

  const setSession = (next: Session | null) => {
    if (next) localStorage.setItem(storageKey, JSON.stringify(next));
    else localStorage.removeItem(storageKey);
    window.dispatchEvent(new CustomEvent("framecraft:user-changed", { detail: next }));
  };

  function logout(reason?: string) {
    setSession(null);
    if (page) render({ mode: "accounts", notice: reason });
  }

  /** The login is a page of its own, not a small box: on a panel there are several accounts to pick
   * from and a keypad to hit with a glove, and none of that fits in a corner of the screen. */
  type View = { mode: "accounts" | "pin"; account?: UserAccessAccount; notice?: string; pin?: string };
  let page: HTMLDivElement | undefined;
  let trigger: HTMLElement | undefined;
  let view: View = { mode: "accounts" };

  const closePage = () => {
    page?.remove();
    page = undefined;
    trigger?.focus?.();
  };

  const availableAccounts = (): UserAccessAccount[] => {
    if (accounts.length) return accounts;
    // A panel configured before the accounts existed still carries its single user on the trigger.
    const name = trigger?.dataset.fcUserName || "";
    if (!name) return [];
    return [{ id: "utente", name, pin: trigger?.dataset.fcUserPin || "", role: trigger?.dataset.fcUserRole || "Operatore", permissions: permissions.map((permission) => permission.id) }];
  };

  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join("") || "?";

  const accountsView = (list: UserAccessAccount[]) => `<h2>Scegli il tuo utente</h2>
    <p class="fcua-hint">Tocca il nome e inserisci il PIN. Ogni utente comanda solo quello che gli è stato assegnato.</p>
    <div class="fcua-accounts">${list.map((account) => `<button type="button" class="fcua-account" data-account="${escapeHtml(account.id)}">
      <span class="fcua-avatar">${escapeHtml(initials(account.name))}</span>
      <span class="fcua-account-text"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.role)}</small></span>
      <span class="fcua-account-badge">${account.pin ? "PIN" : "Libero"}</span>
    </button>`).join("")}</div>`;

  const pinView = (account: UserAccessAccount, value: string) => `<button type="button" class="fcua-back">← Cambia utente</button>
    <div class="fcua-identity"><span class="fcua-avatar large">${escapeHtml(initials(account.name))}</span>
      <div><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.role)}</small></div></div>
    <form class="fcua-pin-form">
      <label><span>${account.pin ? "PIN di accesso" : "Nessun PIN richiesto"}</span>
      <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" value="${escapeHtml(value)}"${account.pin ? "" : " disabled"} /></label>
      ${account.pin ? `<div class="fcua-keypad">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"].map((key) => `<button type="button" data-key="${key}">${key}</button>`).join("")}</div>` : ""}
      <p class="fcua-error" role="alert" aria-live="polite"></p>
      <button type="submit" class="fcua-primary">Entra nel pannello</button>
    </form>
    ${account.permissions.length
      ? `<div class="fcua-permissions"><small>PUÒ FARE</small><ul>${account.permissions.map((permission) => `<li>${escapeHtml(permissionLabel(permission))}</li>`).join("")}</ul></div>`
      : `<p class="fcua-hint">A questo utente non è stato assegnato nessun permesso.</p>`}`;

  const freeView = () => `<h2>Accedi al pannello</h2>
    <p class="fcua-hint">Nessun account è ancora stato configurato: entra con un nome e prepara gli account dall’editor.</p>
    <form class="fcua-pin-form"><label><span>Nome utente</span><input name="username" autocomplete="username" required /></label>
      <p class="fcua-error" role="alert" aria-live="polite"></p>
      <button type="submit" class="fcua-primary">Entra nel pannello</button></form>`;

  const sessionView = (active: Session) => `<div class="fcua-identity"><span class="fcua-avatar large">${escapeHtml(initials(active.name))}</span>
      <div><strong>${escapeHtml(active.name)}</strong><small>${escapeHtml(active.role || "Operatore")}</small></div></div>
    <div class="fcua-permissions"><small>PERMESSI ATTIVI</small>${active.permissions?.length
      ? `<ul>${active.permissions.map((permission) => `<li>${escapeHtml(permissionLabel(permission))}</li>`).join("")}</ul>`
      : `<p class="fcua-hint">Nessun permesso assegnato: i comandi protetti restano bloccati.</p>`}</div>
    ${idleLimit ? `<p class="fcua-hint">Il pannello esce da solo dopo ${Math.round(idleLimit / 60000)} minuti senza attività.</p>` : ""}
    <div class="fcua-session-actions"><button type="button" class="fcua-secondary fcua-switch">Cambia utente</button>
      <button type="button" class="fcua-danger">Esci dal pannello</button></div>`;

  function render(next: View) {
    view = next;
    if (!page) return;
    const body = page.querySelector<HTMLElement>(".fcua-body");
    const title = page.querySelector<HTMLElement>(".fcua-bar h1");
    if (!body || !title) return;
    const active = session();
    const list = availableAccounts();
    const mode = active ? "session" : view.mode === "pin" && view.account ? "pin" : list.length ? "accounts" : "free";
    title.textContent = mode === "session" ? "Utente attivo" : "Accesso al pannello";
    body.innerHTML = (view.notice ? `<p class="fcua-notice" role="status">${escapeHtml(view.notice)}</p>` : "")
      + (mode === "session" && active ? sessionView(active)
        : mode === "pin" && view.account ? pinView(view.account, view.pin || "")
        : mode === "accounts" ? accountsView(list) : freeView());
    body.querySelectorAll<HTMLElement>(".fcua-account").forEach((button) => button.addEventListener("click", () => {
      const account = list.find((candidate) => candidate.id === button.dataset.account);
      if (account) render({ mode: "pin", account, pin: "" });
    }));
    body.querySelector<HTMLElement>(".fcua-back")?.addEventListener("click", () => render({ mode: "accounts" }));
    body.querySelector<HTMLElement>(".fcua-switch")?.addEventListener("click", () => logout());
    body.querySelector<HTMLElement>(".fcua-danger")?.addEventListener("click", () => logout("Sessione chiusa."));
    const input = body.querySelector<HTMLInputElement>("input[name=pin]");
    body.querySelectorAll<HTMLElement>(".fcua-keypad button").forEach((key) => key.addEventListener("click", () => {
      if (!input) return;
      const value = key.dataset.key || "";
      input.value = value === "C" ? "" : value === "←" ? input.value.slice(0, -1) : input.value + value;
      input.focus();
    }));
    body.querySelector<HTMLFormElement>("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const error = body.querySelector<HTMLElement>(".fcua-error");
      const account = view.account;
      if (!account) {
        const name = String(data.get("username") || "").trim();
        if (!name) { if (error) error.textContent = "Inserisci il nome utente."; return; }
        setSession({ name, role: "Operatore", permissions: permissions.map((permission) => permission.id), loginAt: new Date().toISOString() });
        closePage();
        return;
      }
      if (account.pin && String(data.get("pin") || "") !== account.pin) {
        if (error) error.textContent = "PIN non corretto.";
        if (input) { input.value = ""; input.focus(); }
        return;
      }
      setSession({ id: account.id, name: account.name, role: account.role, permissions: account.permissions, loginAt: new Date().toISOString() });
      closePage();
    });
    requestAnimationFrame(() => body.querySelector<HTMLElement>("input:not([disabled]), .fcua-account, .fcua-primary, .fcua-danger")?.focus());
  }

  const openPage = (source: HTMLElement) => {
    closePage();
    trigger = source;
    page = document.createElement("div");
    page.className = "fcua-page";
    page.setAttribute("role", "dialog");
    page.setAttribute("aria-modal", "true");
    page.innerHTML = `<header class="fcua-bar"><div><small>ACCESSO PANNELLO</small><h1>Accesso al pannello</h1></div>
      <button type="button" class="fcua-close" aria-label="Chiudi">×</button></header><div class="fcua-body"></div>`;
    document.body.append(page);
    page.querySelector<HTMLElement>(".fcua-close")?.addEventListener("click", closePage);
    render({ mode: "accounts" });
  };

  const style = document.createElement("style");
  style.textContent = `.fcua-page{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0d141c;font:16px Inter,Arial,sans-serif;color:#edf2f7;overflow:auto}.fcua-bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid #33414f;background:#131c26}.fcua-bar small{display:block;color:#9cc9e8;font-size:11px;font-weight:700;letter-spacing:.11em}.fcua-bar h1{margin:4px 0 0;font-size:24px}.fcua-close{width:52px;height:52px;border:1px solid #3c4a58;border-radius:8px;background:transparent;color:#c3ced8;font-size:30px;line-height:1;cursor:pointer}.fcua-close:hover{background:#22303c;color:white}.fcua-body{flex:1 1 auto;width:min(760px,100%);margin:0 auto;padding:26px 24px 34px;display:flex;flex-direction:column;gap:18px;align-items:stretch}.fcua-body h2{margin:0;font-size:21px}.fcua-hint{margin:0;color:#a8b6c4;font-size:14px;line-height:1.5}.fcua-notice{margin:0;padding:11px 14px;border-left:3px solid #63b3ed;border-radius:5px;background:#16232f;color:#cfe3f3;font-size:14px}.fcua-accounts{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}.fcua-account{display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #3a4757;border-radius:10px;background:#18212b;color:inherit;font:inherit;text-align:left;cursor:pointer}.fcua-account:hover{border-color:#63b3ed;background:#1e2a36}.fcua-account-text{flex:1 1 auto}.fcua-account-text strong{display:block;font-size:17px}.fcua-account-text small{display:block;margin-top:3px;color:#a8b6c4;font-size:13px}.fcua-account-badge{padding:4px 9px;border-radius:99px;background:#25313d;color:#cfe3f3;font-size:11px;font-weight:700;letter-spacing:.06em}.fcua-avatar{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:#2b6cb0;color:white;font-size:18px;font-weight:700}.fcua-avatar.large{width:62px;height:62px;font-size:23px}.fcua-identity{display:flex;align-items:center;gap:15px}.fcua-identity strong{display:block;font-size:20px}.fcua-identity small{display:block;margin-top:4px;color:#a8b6c4;font-size:14px}.fcua-back{align-self:flex-start;padding:9px 13px;border:1px solid #3c4a58;border-radius:7px;background:transparent;color:#cfe3f3;font:inherit;cursor:pointer}.fcua-back:hover{background:#1e2a36}.fcua-pin-form{display:grid;gap:15px;max-width:340px}.fcua-pin-form label{display:grid;gap:7px}.fcua-pin-form span{font-size:13px;color:#c5d0da}.fcua-pin-form input{height:52px;padding:0 14px;border:1px solid #536272;border-radius:7px;background:#0a1017;color:white;font-size:22px;letter-spacing:.3em}.fcua-pin-form input:disabled{opacity:.5}.fcua-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.fcua-keypad button{height:58px;border:1px solid #3c4a58;border-radius:8px;background:#18212b;color:#edf2f7;font-size:20px;font-weight:600;cursor:pointer}.fcua-keypad button:hover{background:#24313e}.fcua-primary,.fcua-danger,.fcua-secondary{min-height:52px;padding:0 20px;border:0;border-radius:7px;font-size:16px;font-weight:700;cursor:pointer}.fcua-primary{background:#3182ce;color:white}.fcua-primary:hover{background:#4299e1}.fcua-secondary{border:1px solid #536272;background:transparent;color:#e2e8f0}.fcua-secondary:hover{background:#1e2a36}.fcua-danger{background:#c53030;color:white}.fcua-danger:hover{background:#e53e3e}.fcua-session-actions{display:flex;flex-wrap:wrap;gap:11px}.fcua-error{min-height:20px;margin:0;color:#feb2b2;font-size:14px}.fcua-permissions{padding:15px 17px;border:1px solid #33414f;border-radius:9px;background:#141d26}.fcua-permissions small{color:#9cc9e8;font-size:11px;font-weight:700;letter-spacing:.1em}.fcua-permissions ul{margin:9px 0 0;padding-left:19px;display:grid;gap:6px;color:#d4dee7;font-size:14px}.fcua-permissions p{margin:8px 0 0}.fcua-locked{opacity:.42;cursor:not-allowed;filter:grayscale(.6)}.fcua-page input:focus,.fcua-page button:focus-visible{outline:3px solid #63b3ed;outline-offset:2px}`;
  style.textContent += `.fcua-page,.fcua-page *{box-sizing:border-box}.fcua-close{flex-shrink:0}.fcua-account-text{min-width:0;overflow-wrap:anywhere}
    html:not([data-framecraft-mode="edit"]) [data-fc-user-visible-granted="false"]{display:none!important}
    @media(max-width:600px){.fcua-bar{padding:calc(12px + env(safe-area-inset-top,0px)) 16px 12px;gap:12px}.fcua-bar h1{font-size:20px}.fcua-body{min-width:0;padding:18px 16px calc(24px + env(safe-area-inset-bottom,0px))}.fcua-accounts{grid-template-columns:minmax(0,1fr)}.fcua-pin-form{width:100%;min-width:0}.fcua-pin-form input{width:100%;min-width:0}.fcua-permissions{overflow-wrap:anywhere}.fcua-session-actions>*{flex:1 1 auto}}`;
  document.head.append(style);

  const eventTypes: Record<string, string> = { click: "Tapped", dblclick: "DoubleTapped", pointerdown: "Down", pointerup: "Up", contextmenu: "ContextTapped", keydown: "KeyDown", keyup: "KeyUp", change: "Change", focusin: "Activated", focusout: "Deactivated" };
  const onReaction = (event: Event) => {
    if (editMode()) return;
    const element = event.target instanceof Element ? event.target : null;
    const granted = new Set(session()?.permissions || []);
    for (let current = element; current; current = current.parentElement) {
      const required = [current.getAttribute("data-fc-user-requires"), current.getAttribute("data-fc-user-visible-requires")].filter(Boolean).join(",").split(",").map((value) => value.trim()).filter(Boolean);
      if (current.getAttribute("data-fc-reacts") === "false" || required.some((id) => !granted.has(id))) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
    const found = element?.closest<HTMLElement>(selector);
    if (!found) return;
    if (eventTypes[event.type] !== (found.dataset.fcUserEvent || "Tapped")) return;
    if (found.closest('[disabled], [hidden], [inert], [aria-disabled="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPage(found);
  };
  const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && page) closePage(); };
  // Only a session that is running is worth watching: without one there is nothing to close.
  const onActivity = () => { if (idleTimer) startIdleTimer(); };
  const guardedEvents = [...Object.keys(eventTypes), "mousedown", "mouseup", "touchstart", "touchend", "input", "submit", "framecraft:interface-event", "framecraft:faceplate-event", "framecraft:command-fired"];
  guardedEvents.forEach((type) => document.addEventListener(type, onReaction, true));
  document.addEventListener("keydown", onEscape);
  document.addEventListener("pointerdown", onActivity, true);
  document.addEventListener("keydown", onActivity, true);

  /** The dev server re-runs this module on every save, so the installation before this one is taken
   * down first: otherwise each reload would add another listener and another login page. */
  const scope = globalThis as { __framecraftUserAccess?: { dispose: () => void } };
  scope.__framecraftUserAccess?.dispose();
  const onChanged = () => { updateLabels(); startIdleTimer(); };
  const observer = new MutationObserver(() => updateLabels());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-framecraft-mode", "data-fc-user-requires", "data-fc-user-visible-requires", "data-fc-user-access", "data-fc-user-logged-out"] });
  window.addEventListener("framecraft:user-changed", onChanged);
  window.addEventListener("storage", onChanged);
  const onReady = () => { updateLabels(); startIdleTimer(); };
  scope.__framecraftUserAccess = {
    dispose() {
      if (idleTimer) clearTimeout(idleTimer);
      closePage();
      style.remove();
      guardedEvents.forEach((type) => document.removeEventListener(type, onReaction, true));
      observer.disconnect();
      window.removeEventListener("framecraft:user-changed", onChanged);
      window.removeEventListener("storage", onChanged);
      document.removeEventListener("DOMContentLoaded", onReady);
      for (const [element, before] of gateBefore) {
        if (element.getAttribute("aria-disabled") === "true") before.aria === null ? element.removeAttribute("aria-disabled") : element.setAttribute("aria-disabled", before.aria);
        if (element.getAttribute("title") === before.notice) before.title === null ? element.removeAttribute("title") : element.setAttribute("title", before.title);
        element.classList.remove("fcua-locked");
      }
      for (const element of gatedElements) { element.removeAttribute("data-fc-user-granted"); element.removeAttribute("data-fc-user-visible-granted"); }
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("pointerdown", onActivity, true);
      document.removeEventListener("keydown", onActivity, true);
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady, { once: true });
  else { updateLabels(); startIdleTimer(); }
}

/** The accounts are written into the generated file, not beside it: one file to copy, and the panel
 * still runs when the project is opened on another machine. */
export function serializeUserAccessRuntime(config: UserAccessConfig) {
  const normalized = normalizeUserAccessConfig(config);
  return `${configStart}\nconst framecraftUserAccess = ${JSON.stringify(normalized, null, 2)};\n${configEnd}\n(${installUserAccess.toString()})(framecraftUserAccess);\n`;
}

/** Reads back what the window last wrote. Anything else in the file is left alone. */
export function parseUserAccessRuntime(source: string): UserAccessConfig | undefined {
  const start = source.indexOf(configStart);
  const end = source.indexOf(configEnd);
  if (start < 0 || end < start) return undefined;
  const block = source.slice(start + configStart.length, end);
  const assignment = block.indexOf("=");
  if (assignment < 0) return undefined;
  try {
    return normalizeUserAccessConfig(JSON.parse(block.slice(assignment + 1).trim().replace(/;$/, "")));
  } catch {
    return undefined;
  }
}
