export function createHmiFaceplatePreview(view, options, runtime) {
  const root = view.document, hosts = new Map();
  let packet, origin, disposed = false;
  const active = () => !disposed && options.active() && packet?.pageId === options.pageId();
  const accepts = (event) => !disposed && event.source === view.parent && !!event.origin && event.origin !== "null" && (!origin || origin === event.origin) && event.data?.pageId === options.pageId();
  const attributes = ["data-framecraft-faceplate-visual-signature", "title", "aria-description"];
  const capture = (host) => ({ nodes: [...host.childNodes], style: host.getAttribute("style"),
    attributes: Object.fromEntries(attributes.map(name => [name, host.getAttribute(name)])),
    binding: host.getAttribute("data-hmi-faceplate"), popup: host.hasAttribute("data-hmi-popup-faceplate-type"), owned: undefined, renderedStyle: undefined });
  const restoreHost = (host, before) => {
    const replaced = before.owned && !host.contains(before.owned), nodes = [...host.childNodes], style = host.getAttribute("style");
    host.replaceChildren(...(replaced ? nodes : before.nodes));
    const restoredStyle = replaced || before.renderedStyle !== undefined && style !== before.renderedStyle ? style : before.style;
    if (restoredStyle === null) host.removeAttribute("style"); else host.setAttribute("style", restoredStyle);
    for (const [name, value] of Object.entries(before.attributes)) { if (value === null) host.removeAttribute(name); else host.setAttribute(name, value); }
    if (before.popup) { if (before.binding === null) host.removeAttribute("data-hmi-faceplate"); else host.setAttribute("data-hmi-faceplate", before.binding); }
  };
  const restore = () => { for (const [host, before] of hosts) restoreHost(host, before); hosts.clear(); };
  const render = () => {
    if (!active()) { restore(); return; }
    for (const [host, before] of hosts) {
      if (!host.isConnected) { restoreHost(host, before); hosts.delete(host); }
      else if (before.owned && !host.contains(before.owned)) { restoreHost(host, before); hosts.set(host, capture(host)); }
    }
    for (const host of root.querySelectorAll('[data-hmi-faceplate], [data-hmi-popup-faceplate-type]')) {
      if (host.parentElement?.closest('[data-hmi-faceplate]')) continue;
      if (!hosts.has(host)) hosts.set(host, capture(host));
      options.instanceId(host);
    }
    runtime.renderHmiFaceplates(root, packet.catalog, packet.values, {
      localValues: (host, type) => {
        const local = packet.locals?.[options.instanceId(host)], signature = `${type.id}@${type.version}:${type.localTags.map(tag => `${tag.name}=${tag.startValue ?? ""}`).join("|")}`;
        return local?.signature === signature ? local.values : Object.fromEntries(type.localTags.map(tag => [tag.name, tag.startValue ?? (/bool/i.test(tag.dataType) ? "false" : /string/i.test(tag.dataType) ? "" : "0")]));
      },
    });
    for (const [host, before] of hosts) {
      const owned = host.querySelector(':scope > [data-hmi-faceplate-visual-root]');
      if (!owned) continue;
      before.owned = owned;
      const hint = [before.attributes.title, "PROVA LOCALE · nessun PLC collegato"].filter(Boolean).join("\n");
      if (host.title !== hint) host.title = hint;
      if (host.getAttribute("aria-description") !== hint) host.setAttribute("aria-description", hint);
      before.renderedStyle = host.getAttribute("style");
    }
  };
  return {
    accepts,
    receive(event) {
      if (!accepts(event) || event.data.type !== "framecraft:faceplate-preview") return;
      origin = event.origin;
      const data = event.data;
      if (data.catalog?.version !== 1 || !Array.isArray(data.catalog.types) || !data.values || typeof data.values !== "object" || Array.isArray(data.values)) { packet = undefined; restore(); return; }
      packet = data; render();
    },
    refresh() { render(); },
    reset() { packet = undefined; restore(); },
    dispose() { disposed = true; packet = undefined; restore(); },
  };
}
