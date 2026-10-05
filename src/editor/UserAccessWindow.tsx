import { useEffect, useMemo, useState } from "react";
import { Clock, KeyRound, Plus, Save, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEditorStore } from "../state/editorStore";
import { userAccessId, type UserAccessAccount, type UserAccessConfig, type UserAccessPermission } from "../core/userAccess";

/** Accounts and permissions are a job of their own: a panel has a handful of people on it, each with
 * a PIN and a different set of things they may press. That does not fit in the property sheet on the
 * side, so it gets a window that covers the editor while it is being sorted out. */
export function UserAccessWindow() {
  const config = useEditorStore((state) => state.userAccessConfig);
  const busy = useEditorStore((state) => state.userAccessBusy);
  const close = useEditorStore((state) => state.closeUserAccess);
  const save = useEditorStore((state) => state.saveUserAccess);
  const [draft, setDraft] = useState<UserAccessConfig | undefined>(config);
  const [tab, setTab] = useState<"accounts" | "permissions">("accounts");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => { setDraft(config); }, [config]);
  const dirty = useMemo(() => Boolean(draft && config) && JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);
  const dismiss = () => {
    if (dirty && !window.confirm("Ci sono modifiche agli accessi non salvate. Chiudo lo stesso?")) return;
    close();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!draft) return <div className="access-backdrop" role="presentation"><section className="access-window loading" role="dialog" aria-modal="true" aria-label="Accessi e permessi"><p>Lettura degli accessi del progetto…</p></section></div>;

  const account = draft.accounts[selected];
  const patchAccount = (values: Partial<UserAccessAccount>) => setDraft({ ...draft, accounts: draft.accounts.map((item, index) => index === selected ? { ...item, ...values } : item) });
  const addAccount = () => {
    setDraft({ ...draft, accounts: [...draft.accounts, { id: "", name: `Utente ${draft.accounts.length + 1}`, pin: "", role: "Operatore", permissions: [] }] });
    setSelected(draft.accounts.length);
    setTab("accounts");
  };
  const removeAccount = () => {
    if (!account || !window.confirm(`Elimino l’account «${account.name}»?`)) return;
    setDraft({ ...draft, accounts: draft.accounts.filter((_, index) => index !== selected) });
    setSelected(Math.max(0, selected - 1));
  };
  const togglePermission = (permission: UserAccessPermission) => {
    if (!account) return;
    const granted = account.permissions.includes(permission.id);
    patchAccount({ permissions: granted ? account.permissions.filter((item) => item !== permission.id) : [...account.permissions, permission.id] });
  };
  const patchPermission = (index: number, label: string) => setDraft({ ...draft, permissions: draft.permissions.map((item, position) => position === index ? { ...item, label } : item) });
  const removePermission = (permission: UserAccessPermission) => {
    if (!window.confirm(`Elimino il permesso «${permission.label}»? Gli elementi che lo richiedono resteranno bloccati finché non ne scegli un altro.`)) return;
    setDraft({
      ...draft,
      permissions: draft.permissions.filter((item) => item.id !== permission.id),
      accounts: draft.accounts.map((item) => ({ ...item, permissions: item.permissions.filter((value) => value !== permission.id) })),
    });
  };

  /** Ids are what the elements of the panel refer to, so an existing one is never rebuilt from its
   * label: renaming "Manutenzione" must not unlock every button that asked for it. */
  const persist = async () => {
    const named = draft.accounts.every((item) => item.name.trim());
    if (!named) { setError("Ogni account deve avere un nome."); return; }
    if (draft.permissions.some((item) => !item.label.trim())) { setError("Ogni permesso deve avere un nome."); return; }
    setError(undefined);
    await save({
      ...draft,
      permissions: draft.permissions.map((item, index) => ({ ...item, id: item.id || userAccessId(item.label, `permesso-${index + 1}`) })),
      accounts: draft.accounts.map((item, index) => ({ ...item, id: item.id || userAccessId(item.name, `utente-${index + 1}`) })),
    });
  };

  return <div className="access-backdrop" role="presentation" onMouseDown={dismiss}>
    <section className="access-window" role="dialog" aria-modal="true" aria-label="Accessi e permessi" onMouseDown={(event) => event.stopPropagation()}>
      <header className="access-header">
        <div><small>ACCESSO AL PANNELLO</small><h2>Account e permessi</h2></div>
        <div className="access-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "accounts"} className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}><Users size={14} /> Account <em>{draft.accounts.length}</em></button>
          <button role="tab" aria-selected={tab === "permissions"} className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}><KeyRound size={14} /> Permessi <em>{draft.permissions.length}</em></button>
        </div>
        <button className="access-close" onClick={dismiss} aria-label="Chiudi"><X size={17} /></button>
      </header>

      {tab === "accounts" ? <div className="access-body accounts">
        <div className="access-list">
          {draft.accounts.map((item, index) => <button key={index} className={`access-row ${index === selected ? "active" : ""}`} onClick={() => setSelected(index)}>
            <span className="access-avatar">{(item.name.trim()[0] || "?").toUpperCase()}</span>
            <span className="access-row-text"><strong>{item.name || "Senza nome"}</strong><small>{item.role} · {item.permissions.length} permessi</small></span>
            {item.pin ? <KeyRound size={12} /> : <em>libero</em>}
          </button>)}
          {!draft.accounts.length && <p className="access-empty">Nessun account: il pannello chiederà solo un nome.</p>}
          <button className="access-add" onClick={addAccount}><UserPlus size={14} /> Nuovo account</button>
        </div>
        {account ? <div className="access-detail">
          <label><span>Nome utente</span><input value={account.name} onChange={(event) => patchAccount({ name: event.target.value })} placeholder="Mario Rossi" /></label>
          <div className="access-pair">
            <label><span>Ruolo mostrato</span><input value={account.role} onChange={(event) => patchAccount({ role: event.target.value })} placeholder="Manutentore" /></label>
            <label><span>PIN</span><input value={account.pin} onChange={(event) => patchAccount({ pin: event.target.value.replace(/\s/g, "") })} placeholder="nessun PIN" autoComplete="off" /></label>
          </div>
          <p className="access-note">Il PIN è scritto nel progetto in chiaro: protegge un pannello locale da un tocco sbagliato, non sostituisce l’autenticazione aziendale.</p>
          <div className="access-permissions">
            <strong>Cosa può fare</strong>
            {draft.permissions.map((permission) => <label key={permission.id || permission.label} className="access-check">
              <input type="checkbox" checked={account.permissions.includes(permission.id)} onChange={() => togglePermission(permission)} />
              <span>{permission.label}</span>
            </label>)}
            {!draft.permissions.length && <p className="access-note">Nessun permesso definito: creane uno nella scheda Permessi.</p>}
          </div>
          <button className="access-remove" onClick={removeAccount}><Trash2 size={13} /> Elimina account</button>
        </div> : <div className="access-detail empty"><Users size={24} /><p>Aggiungi il primo account del pannello.</p></div>}
      </div> : <div className="access-body permissions">
        <div className="access-permission-list">
          <p className="access-note">Un permesso è una cosa che si può fare sul pannello. Assegnalo agli account qui a fianco, poi seleziona un elemento e chiedigli quel permesso nella scheda «Cosa fa»: senza, resta visibile ma bloccato.</p>
          {draft.permissions.map((permission, index) => <div key={index} className="access-permission-row">
            <KeyRound size={13} />
            <input value={permission.label} onChange={(event) => patchPermission(index, event.target.value)} placeholder="Cambiare i parametri" />
            <small>{permission.id || "nuovo"}</small>
            <button onClick={() => removePermission(permission)} aria-label={`Elimina ${permission.label}`}><Trash2 size={13} /></button>
          </div>)}
          <button className="access-add" onClick={() => setDraft({ ...draft, permissions: [...draft.permissions, { id: "", label: `Permesso ${draft.permissions.length + 1}` }] })}><Plus size={14} /> Nuovo permesso</button>
        </div>
        <div className="access-detail">
          <label><span><Clock size={12} /> Uscita automatica</span>
            <input type="number" min={0} max={480} value={draft.autoLogoutMinutes}
              onChange={(event) => setDraft({ ...draft, autoLogoutMinutes: Math.max(0, Math.min(480, Number(event.target.value) || 0)) })} /></label>
          <p className="access-note">Minuti di inattività dopo i quali il pannello esce da solo. Zero lascia la sessione aperta finché qualcuno preme «Esci».</p>
          <div className="access-summary"><ShieldCheck size={15} /><span>Account e permessi finiscono in <code>src/framecraft/user-access.js</code>, dentro al progetto: il pannello funziona anche aperto su un’altra macchina.</span></div>
        </div>
      </div>}

      <footer className="access-footer">
        {error ? <span className="access-error" role="alert">{error}</span> : <span className="access-hint">{dirty ? "Modifiche non ancora salvate." : "Tutto salvato nel progetto."}</span>}
        <button className="access-secondary" onClick={dismiss}>Chiudi</button>
        <button className="access-primary" onClick={() => void persist()} disabled={busy || !dirty}><Save size={14} /> {busy ? "Salvataggio…" : "Salva nel progetto"}</button>
      </footer>
    </section>
  </div>;
}
