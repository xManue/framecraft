import { createHmiAlarmControl } from "./hmi-alarm-control.mjs";
import { createHmiAlarmSummary } from "./hmi-alarm-summary.mjs";

export function createHmiAlarmPreviewSurfaceWith(root, options, runtime) {
  const { createHmiAlarmControl, createHmiAlarmSummary } = runtime;
  let disposed = false, enabled = false, snapshot;
  const routes = [], controls = new Map(), clearButtons = new Map();
  const active = () => !disposed && enabled && options.active();
  const restore = () => {
    for (const { control } of controls.values()) control.dispose();
    controls.clear();
    for (const [button, before] of clearButtons) { button.disabled = before.disabled; button.title = before.title; }
    clearButtons.clear();
  };
  const action = async (command) => {
    if (!active() || !snapshot?.instanceId) throw new Error("La prova allarmi non è attiva.");
    await options.action(command, snapshot.instanceId);
  };
  const render = () => {
    if (!active()) { restore(); return; }
    for (const [host, entry] of controls) {
      if (!host.isConnected) { entry.control.dispose(); controls.delete(host); }
      else if (entry.root && !host.contains(entry.root)) {
        const children = [...host.childNodes], style = host.getAttribute("style");
        entry.control.dispose(); host.replaceChildren(...children);
        if (style === null) host.removeAttribute("style"); else host.setAttribute("style", style);
        controls.delete(host);
      }
    }
    for (const [button, before] of clearButtons) if (!button.isConnected) { button.disabled = before.disabled; button.title = before.title; clearButtons.delete(button); }
    for (const host of root.querySelectorAll('[data-hmi-type="HmiAlarmControl"], [data-hmi-type="HmiAlarmIndicator"], [data-hmi-type="HmiAlarmLine"]')) {
      if (!controls.has(host)) {
        const control = host.dataset.hmiType === "HmiAlarmControl" ? createHmiAlarmControl(host, action) : createHmiAlarmSummary(host, { action, routes, navigate: (route) => { if (active() && routes.includes(route)) options.navigate(route); } });
        const content = host.querySelector('[data-hmi-alarm-summary-content]') ?? host;
        const owned = content === host ? host.firstElementChild : content;
        const note = root.createElement("small"); note.textContent = "SIMULAZIONE · nessun PLC collegato"; note.dataset.hmiAlarmPreviewNote = "";
        Object.assign(note.style, { display: "block", padding: "4px", flexShrink: "0", color: "#FACC15", fontSize: "16px", overflowWrap: "anywhere" });
        content.append(note); controls.set(host, { control, root: owned });
      }
      controls.get(host).control.update(snapshot, !!snapshot);
    }
    for (const button of root.querySelectorAll('button[data-hmi-action="clear-alarm-log"]')) {
      if (!clearButtons.has(button)) clearButtons.set(button, { disabled: button.disabled, title: button.title });
      if (!button.disabled) button.disabled = true;
      const title = "Storico di prova locale: Ferma la prova per azzerarlo. Nessun archivio macchina viene cancellato.";
      if (button.title !== title) button.title = title;
    }
  };
  const observer = new root.defaultView.MutationObserver((records) => {
    const hosts = [...controls.keys()];
    const relevant = records.filter((record) => record.target.nodeType !== 1 || !record.target.closest('[data-hmi-alarm-root], [data-hmi-alarm-summary-root]') || hosts.includes(record.target));
    if (relevant.some((record) => record.type === "childList" || hosts.some((host) => record.target.contains(host)) || clearButtons.has(record.target))) render();
  });
  observer.observe(root.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-hmi-alarm-summary", "data-hmi-type", "disabled", "hidden", "inert", "aria-disabled", "style", "class", "data-fc-reacts", "data-fc-user-requires", "data-fc-user-granted", "data-fc-user-visible-requires", "data-fc-user-visible-granted"] });
  return {
    update(next, on, pageRoutes = []) {
      if (disposed) return;
      snapshot = next; enabled = on === true; routes.splice(0, routes.length, ...pageRoutes.filter((route) => typeof route === "string" && /^\/[A-Za-z0-9/_-]*$/.test(route) && !route.startsWith("//")));
      render();
    },
    refresh() { render(); },
    dispose() { disposed = true; observer.disconnect(); restore(); snapshot = undefined; },
  };
}

export function createHmiAlarmPreviewBridgeWith(view, options, createHmiAlarmPreviewSurface) {
  let pageId = view.crypto.randomUUID();
  const pending = new Map();
  let origin, instanceId, disposed = false;
  const cancel = (message) => {
    for (const request of pending.values()) { view.clearTimeout(request.timer); request.reject(new Error(message)); }
    pending.clear();
  };
  const surface = createHmiAlarmPreviewSurface(view.document, {
    active: options.active,
    navigate: options.navigate,
    action: (command, currentInstance) => new Promise((resolve, reject) => {
      if (disposed || !options.active() || !origin || currentInstance !== instanceId) { reject(new Error("La prova allarmi è cambiata. Aggiorna la vista prima di agire.")); return; }
      if (pending.size >= 128) { reject(new Error("Attendi la risposta alle operazioni già in corso.")); return; }
      const requestId = view.crypto.randomUUID();
      const timer = view.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("L'editor non ha risposto alla prova allarmi. L'azione non viene ripetuta automaticamente; torna a Modifica e riapri Usa il pannello."));
      }, 3000);
      pending.set(requestId, { instanceId: currentInstance, timer, resolve, reject });
      try { view.parent.postMessage({ type: "framecraft:alarm-command", pageId, requestId, instanceId: currentInstance, command }, origin); }
      catch { pending.delete(requestId); view.clearTimeout(timer); reject(new Error("L'editor non è raggiungibile. Nessuna azione viene ripetuta; riapri la prova del pannello.")); }
    }),
  });
  return {
    get pageId() { return pageId; },
    newPage() {
      pageId = view.crypto.randomUUID(); instanceId = undefined;
      cancel("La pagina è cambiata. Nessuna azione viene ripetuta.");
      surface.refresh(); surface.update(undefined, false);
    },
    receive(event) {
      if (disposed || event.source !== view.parent || !event.origin || event.origin === "null" || event.data?.pageId !== pageId || origin && origin !== event.origin) return;
      const data = event.data;
      if (data.type === "framecraft:alarm-preview") {
        origin = event.origin;
        const next = data.snapshot;
        const valid = next?.version === 1 && typeof next.instanceId === "string" && Array.isArray(next.rows) && Array.isArray(next.history);
        if (!data.enabled || !valid || instanceId !== next.instanceId) cancel("La prova allarmi è cambiata. Nessuna azione viene ripetuta.");
        instanceId = valid ? next.instanceId : undefined;
        surface.update(valid ? next : undefined, data.enabled === true, Array.isArray(data.routes) ? data.routes : []);
      } else if (data.type === "framecraft:alarm-command-result") {
        const request = pending.get(data.requestId);
        if (!request || request.instanceId !== data.instanceId) return;
        pending.delete(data.requestId); view.clearTimeout(request.timer);
        if (data.ok === true) request.resolve();
        else request.reject(new Error(typeof data.error === "string" && data.error.length <= 1024 ? data.error : "La prova allarmi non ha completato l'azione. Aggiorna la vista e riprova."));
      }
    },
    refresh() {
      if (!options.active()) cancel("La prova allarmi è stata sospesa. Nessuna azione viene ripetuta.");
      surface.refresh();
    },
    suspend() { cancel("La pagina è stata chiusa. Nessuna azione viene ripetuta."); surface.update(undefined, false); },
    dispose() { disposed = true; cancel("La pagina è stata chiusa. Nessuna azione viene ripetuta."); surface.dispose(); },
  };
}

export function createHmiAlarmPreviewSurface(root, options) {
  return createHmiAlarmPreviewSurfaceWith(root, options, { createHmiAlarmControl, createHmiAlarmSummary });
}

export function createHmiAlarmPreviewBridge(view, options) {
  return createHmiAlarmPreviewBridgeWith(view, options, createHmiAlarmPreviewSurface);
}
