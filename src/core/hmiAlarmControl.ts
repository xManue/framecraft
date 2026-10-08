import { alarmStateLabel, type AlarmCommand, type AlarmRow, type AlarmSnapshot } from "../../runtime/alarm-engine.mjs";

export function createHmiAlarmControl(host: HTMLElement, action: (command: AlarmCommand) => Promise<void>) {
  const original = [...host.childNodes], oldStyle = host.getAttribute("style"), oldRole = host.getAttribute("role"), oldLabel = host.getAttribute("aria-label");
  host.dataset.hmiAlarmRoot = ""; host.setAttribute("role", "region"); host.setAttribute("aria-label", "Allarmi operativi");
  Object.assign(host.style, { background: "#333333", color: "#ffffff", display: "flex", flexDirection: "column", overflow: "hidden", fontSize: "16px" });
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, value?: string) => { const node = host.ownerDocument.createElement(tag); if (value !== undefined) node.textContent = value; return node; };
  const notice = make("p"), toolbar = make("div"), status = make("p"), scroller = make("div"), table = make("table"), head = make("thead"), body = make("tbody");
  notice.setAttribute("role", "status"); status.setAttribute("role", "status");
  Object.assign(notice.style, { margin: "0", padding: "8px", background: "#20252e", lineHeight: "1.4" });
  Object.assign(status.style, { margin: "0", padding: "4px 8px", minHeight: "28px" });
  Object.assign(toolbar.style, { display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px" });
  Object.assign(scroller.style, { overflow: "auto", flex: "1", minHeight: "0" });
  Object.assign(table.style, { borderCollapse: "collapse", width: "100%", textAlign: "left" });
  const searchLabel = make("label", "Cerca "), search = make("input"), areaLabel = make("label", "Zona "), area = make("select");
  search.type = "search"; search.placeholder = "Nome o messaggio"; searchLabel.append(search); areaLabel.append(area);
  const button = (label: string) => { const node = make("button", label); node.type = "button"; Object.assign(node.style, { minHeight: "44px", padding: "6px 12px", cursor: "pointer", border: "1px solid #8894a4", borderRadius: "4px", background: "#252d39", color: "#fff" }); return node; };
  for (const input of [search, area]) Object.assign(input.style, { minHeight: "44px", maxWidth: "100%", background: "#181e28", color: "#fff", border: "1px solid #8894a4", borderRadius: "4px", padding: "6px" });
  const ack = button("Prendi in visione"), confirm = button("Conferma rientro"), previous = button("Precedenti"), next = button("Successivi");
  toolbar.append(searchLabel, areaLabel, ack, confirm, previous, next);
  const headers = make("tr"); for (const label of ["Allarme", "Stato", "Messaggio", "Zona", "Ora"]) { const th = make("th", label); th.scope = "col"; th.style.padding = "8px"; headers.append(th); }
  head.append(headers); table.append(head, body); scroller.append(table); host.replaceChildren(notice, toolbar, status, scroller);
  let snapshot: AlarmSnapshot | undefined, connected = false, busy = false, disposed = false, signature = "", page = 0;
  let selected: { id: string; occurrence?: string; revision: number } | undefined;
  const source = host.dataset.hmiAlarmSource === "history" ? "history" : "active";
  const filter = host.dataset.hmiFilter?.trim(), match = filter?.match(/^AlarmClassName\s*=\s*'([^']+)'$/);
  const invalidFilter = !!filter && !match;
  const matches = (className: string, zone: string, values: string[]) => (!match || className === match[1]) && (!area.value || zone === area.value) && values.join(" ").toLocaleLowerCase().includes(search.value.toLocaleLowerCase());
  const render = () => {
    if (disposed) return;
    const zones = [...new Set((snapshot?.rows ?? []).map((row) => row.area ?? "").filter(Boolean))].sort();
    const zoneSignature = JSON.stringify(zones);
    if (area.dataset.zones !== zoneSignature) { const value = area.value; area.replaceChildren(make("option", "Tutte"), ...zones.map((zone) => { const item = make("option", zone); item.value = zone; return item; })); area.options[0].value = ""; area.value = zones.includes(value) ? value : ""; area.dataset.zones = zoneSignature; }
    notice.textContent = !connected ? "Servizio non disponibile: gli stati mostrati non sono aggiornati. Controlla la diagnostica PLC." : !snapshot?.rows.length ? "Nessun allarme configurato. Nell'editor apri Pannello → Allarmi." : source === "history" ? "Storico della sessione del servizio, non archivio industriale. Eventi usciti dal limite: " + snapshot.historyDropped : "Presa visione ≠ guasto risolto. Il rientro dipende dal segnale PLC.";
    const rows = invalidFilter ? [] : source === "history"
      ? [...(snapshot?.history ?? [])].reverse().filter((row) => matches(row.alarmClass, row.area, [row.name, row.text, row.id]))
      : [...(snapshot?.rows ?? [])].filter((row) => (row.pending || row.quality !== "good") && matches(row.className, row.area ?? "", [row.name, row.text, row.id])).sort((a, b) => b.priority - a.priority || (b.activatedAt ?? 0) - (a.activatedAt ?? 0));
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / 100) - 1)); previous.disabled = page === 0; next.disabled = (page + 1) * 100 >= rows.length;
    const current = snapshot?.rows.find((row) => row.id === selected?.id), unchanged = current && current.occurrence === selected?.occurrence && current.revision === selected?.revision;
    const canAct = connected && snapshot?.actionsEnabled && source !== "history" && unchanged && current?.pending && !busy && !host.closest('[disabled], [hidden], [inert], [aria-disabled="true"]');
    ack.disabled = !canAct || current!.acknowledged || current!.acknowledgment === "none";
    confirm.disabled = !canAct || current!.active !== false || !current!.acknowledged || current!.acknowledgment !== "reset" || current!.quality !== "good";
    ack.hidden = source === "history"; confirm.hidden = source === "history";
    if (!busy) status.textContent = invalidFilter ? "Filtro non supportato: usa AlarmClassName = 'nome classe'. Nessun allarme viene mostrato con un filtro ambiguo." : selected && !unchanged ? "L'allarme è cambiato: selezionalo di nuovo prima di agire." : connected && snapshot && !snapshot.actionsEnabled && source !== "history" ? "Presa visione bloccata finché il servizio non autorizza l'operatore." : rows.length + " risultati · pagina " + (page + 1);
    const visible = rows.slice(page * 100, (page + 1) * 100), nextSignature = JSON.stringify([visible, selected, page]);
    if (signature === nextSignature) return; signature = nextSignature;
    const focusedLabel = body.contains(host.ownerDocument.activeElement) ? host.ownerDocument.activeElement?.getAttribute("aria-label") : undefined;
    body.replaceChildren(...visible.map((item) => {
      const tr = make("tr"), history = "state" in item, row = item as AlarmRow;
      Object.assign(tr.style, { background: !history && selected?.id === item.id ? "#23466a" : "#333333", borderBottom: "1px solid #596372" });
      const cell = make("td"); cell.style.padding = "6px 8px";
      if (history) cell.textContent = item.name;
      else { const select = button(item.name); select.setAttribute("aria-label", "Seleziona " + item.name); select.setAttribute("aria-pressed", String(selected?.id === item.id)); select.onclick = () => { selected = { id: row.id, occurrence: row.occurrence, revision: row.revision }; render(); }; cell.append(select); }
      tr.append(cell);
      const state = history ? ({ Incoming: "Attivato", Outgoing: "Rientrato", Acknowledged: "Presa visione", Confirmed: "Rientro confermato" }[item.state]) + (item.actor ? " · " + item.actor : "") : alarmStateLabel(row) + (row.quality !== "good" ? " · segnale non valido" : "");
      const time = history ? item.time : row.activatedAt;
      for (const value of [state, item.text, item.area ?? "", time === undefined ? "—" : new Date(time).toLocaleString()]) { const td = make("td", value); Object.assign(td.style, { padding: "8px", overflowWrap: "anywhere" }); tr.append(td); }
      if (!history && row.diagnostic) tr.title = row.diagnostic;
      return tr;
    }));
    if (!visible.length) { const tr = make("tr"), td = make("td", "Nessun allarme corrispondente ai filtri."); td.colSpan = 5; td.style.padding = "12px"; tr.append(td); body.append(tr); }
    if (focusedLabel) ([...body.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.getAttribute("aria-label") === focusedLabel) ?? search).focus();
  };
  const act = async (kind: AlarmCommand["action"]) => {
    if (!selected?.occurrence || busy || !connected || !snapshot?.actionsEnabled || host.closest('[disabled], [hidden], [inert], [aria-disabled="true"]') || (kind === "acknowledge" ? ack.disabled : confirm.disabled)) return;
    const command = { alarmId: selected.id, occurrence: selected.occurrence, revision: selected.revision, action: kind };
    busy = true; render(); status.textContent = "Operazione in corso…";
    try { await action(command); if (!disposed) { selected = undefined; status.textContent = kind === "acknowledge" ? "Presa visione registrata. Il segnale di guasto non è stato modificato." : "Rientro confermato."; } }
    catch (error) { if (!disposed) status.textContent = error instanceof Error ? error.message : "Operazione non completata. Aggiorna la vista e controlla il servizio."; }
    finally { busy = false; if (!disposed) { ack.disabled = true; confirm.disabled = true; } }
  };
  ack.onclick = () => { void act("acknowledge"); }; confirm.onclick = () => { void act("confirm"); };
  search.oninput = area.onchange = () => { page = 0; render(); }; previous.onclick = () => { page--; render(); }; next.onclick = () => { page++; render(); };
  return {
    update(value: AlarmSnapshot | undefined, available = true) { if (value) snapshot = value; connected = available && !!value; render(); },
    dispose() { disposed = true; delete host.dataset.hmiAlarmRoot; host.replaceChildren(...original); for (const [name, value] of [["style", oldStyle], ["role", oldRole], ["aria-label", oldLabel]]) { if (value === null) host.removeAttribute(name!); else host.setAttribute(name!, value!); } },
  };
}
