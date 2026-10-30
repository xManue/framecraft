export const operatorCapabilities = Object.freeze(["recipes.read", "recipes.capture", "recipes.apply", "recipes.create", "recipes.update", "recipes.copy", "recipes.rename", "recipes.delete", "recipes.import", "alarms.acknowledge", "alarms.confirm", "alarms.shelve", "alarms.unshelve", "alarms.comments.read", "alarms.comment", "dataLogs.read", "dataLogs.sample", "alarms.history.read", "tags.write", "audit.read"]);
const messages = {
  AUTH_AUDIT_CHANGED: [409, "Il registro è cambiato", "Ricarica la prima pagina del registro. Le pagine di archivi diversi non vengono mescolate."],
  AUTH_AUDIT_RESPONSE: [502, "Risposta del registro non valida", "Non fidarti di questi dati. Controlla versione, servizio e proxy con il responsabile; nessun comando viene ripetuto."],
  AUTH_NODE: [503, "Node.js non disponibile per la gestione locale", "Installa una versione Node LTS supportata nel sistema, poi chiudi e riapri Framecraft. Gli eseguibili dentro al progetto non vengono usati per amministrare password e account."],
  AUTH_CONFIG: [503, "Accesso operatore non configurato", "Configura esplicitamente gli account locali e il trasporto protetto del servizio. Non usare il PIN browser o l’account ChatGPT."],
  AUTH_STORE: [503, "Archivio operatori non disponibile", "Controlla file, backup e permessi dell’account servizio. Non vengono creati utenti o sostituiti archivi automaticamente."],
  AUTH_BUSY: [429, "Servizio accessi occupato", "Attendi e riprova manualmente. Nessuna richiesta di accesso viene accodata."],
  AUTH_CONFLICT: [409, "Gli account sono cambiati", "Rileggi gli account e ripeti soltanto la modifica che hai verificato. Nessuna sovrascrittura automatica."],
  AUTH_UNCERTAIN: [503, "Modifica account con esito incerto", "Conserva l’archivio e verifica l’account prima di ripetere l’operazione. Non eliminare file o lock come rimedio."],
  AUTH_INPUT: [400, "Dati operatore non validi", "Controlla nome utente, password, campi e permessi esplicitamente assegnati."],
  AUTH_CREDENTIALS: [401, "Accesso non riuscito", "Controlla nome utente e password. Se non riesci, contatta il responsabile degli account del pannello."],
  AUTH_REQUIRED: [401, "Accesso operatore richiesto", "Accedi al pannello con un account autorizzato. Il PIN locale e il token del gateway non sostituiscono la sessione server."],
  AUTH_PERMISSION: [403, "Operazione non autorizzata", "L’account attivo non ha il permesso richiesto. Chiedi al responsabile, senza cambiare i permessi nel browser."],
  AUTH_RESOURCE: [403, "Risorsa non autorizzata per questo account", "Il responsabile deve verificare sia la capacità generale sia le risorse consentite all’operatore. Nessun comando è stato inviato; non viene ripetuto automaticamente."],
  AUTH_AUDIT: [503, "Registro delle operazioni non disponibile", "Nessun nuovo comando viene avviato. Fai verificare spazio, integrità e permessi della cartella audit dal responsabile. Non cancellare il registro o i suoi file come rimedio."],
  AUTH_AUDIT_NODE: [503, "Node.js richiede un aggiornamento per il registro", "Usa una versione Node LTS con SQLite corretto per WAL-reset: almeno 3.51.3, oppure i backport 3.50.7 o 3.44.6. Node 24.19 è stato collaudato qui. Fai aggiornare il Runtime dal responsabile; non cancellare archivi o disattivare l’audit."],
  AUTH_AUDIT_PATH: [503, "Percorso del registro non supportato", "Usa una cartella su disco locale del PC del servizio, non un percorso UNC o di rete. Fai verificare anche unità mappate e cartelle sincronizzate dal responsabile; non spostare o cancellare archivi mentre il servizio è aperto."],
  AUTH_AUDIT_LIMIT: [503, "Registro delle operazioni pieno", "Il limite del registro è raggiunto. Fai predisporre archiviazione verificata e manutenzione dal responsabile, a servizio fermo. Non cancellare eventi per sbloccare la macchina: nessun comando viene reinviato automaticamente."],
  AUTH_AUDIT_BUSY: [503, "Registro delle operazioni occupato", "Nessun nuovo comando viene avviato. Fai verificare se un altro processo sta usando il registro; non eliminare file o lock. Dopo la verifica riavvia manualmente il servizio e controlla lo stato prima di impartire altri comandi."],
  AUTH_AUDIT_UNCERTAIN: [503, "Operazione da verificare: esito non registrato", "Il comando può essere già avvenuto, ma il registro non ha confermato il suo esito. Controlla lo stato reale e il registro con il responsabile; non ripetere alla cieca. Nessun reinvio automatico."],
  AUTH_CSRF: [403, "Sessione operatore da verificare", "Rileggi lo stato dell’accesso e riprova solo l’operazione confermata. Nessun comando viene reinviato automaticamente."],
  AUTH_ORIGIN: [403, "Origine dell’accesso non consentita", "Controlla HTTPS, origine pubblica e proxy del pannello. HTTP è ammesso solo sul loopback di sviluppo esplicitamente configurato."],
  AUTH_THROTTLED: [429, "Troppi tentativi di accesso", "Attendi almeno un minuto prima di riprovare. Se il problema continua, contatta il responsabile del servizio."],
};
export class OperatorAuthError extends Error {
  constructor(code) { const known = Object.hasOwn(messages, code) ? code : "AUTH_STORE", [status, message, remedy] = messages[known]; super(message); this.name = "OperatorAuthError"; this.code = known; this.status = status; this.remedy = remedy; this.outcome = known === "AUTH_AUDIT_UNCERTAIN" ? "uncertain" : "rejected"; }
}
export const operatorObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const operatorKeys = (value, keys) => operatorObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const operatorText = (value, max = 160) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
export const operatorUsername = value => typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);

export const operatorResourceKinds = Object.freeze(["tagWrites", "alarmActions", "recipeChanges"]);
export const defaultOperatorResources = (all = false) => Object.fromEntries(operatorResourceKinds.map(kind => [kind, all ? { mode: "all" } : { mode: "selected", ids: [] }]));
export function parseOperatorResources(value) {
  if (!operatorKeys(value, operatorResourceKinds)) throw new OperatorAuthError("AUTH_INPUT");
  return Object.fromEntries(operatorResourceKinds.map(kind => {
    const filter = value[kind];
    if (operatorKeys(filter, ["mode"]) && filter.mode === "all") return [kind, { mode: "all" }];
    if (!operatorKeys(filter, ["mode", "ids"]) || filter.mode !== "selected" || !Array.isArray(filter.ids) || filter.ids.length > 256 || new Set(filter.ids).size !== filter.ids.length || filter.ids.some(id => !operatorText(id, 200))) throw new OperatorAuthError("AUTH_INPUT");
    return [kind, { mode: "selected", ids: [...filter.ids] }];
  }));
}
export function operatorResourceAllowed(store, accountId, capability, context) {
  if (store.version === 1) return true;
  const mapping = capability === "tags.write" ? ["tagWrites", "tag"] : ["alarms.acknowledge", "alarms.confirm", "alarms.shelve", "alarms.unshelve", "alarms.comments.read", "alarms.comment"].includes(capability) ? ["alarmActions", "alarmId"] : capability.startsWith("recipes.") && capability !== "recipes.read" ? ["recipeChanges", "schemaId"] : undefined;
  if (!mapping) return true;
  const [kind, key] = mapping, rule = store.resourceRules.find(item => item.accountId === accountId), id = context?.[key];
  return !!rule && operatorKeys(context, [key]) && operatorText(id, 200) && (rule.limits[kind].mode === "all" || rule.limits[kind].ids.includes(id));
}

export function parseOperatorAuthConfig(value) {
  if (!operatorKeys(value, ["version", "enabled", "namespace", "allowHttpLoopback", "idleMinutes", "absoluteMinutes"]) || value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.allowHttpLoopback !== "boolean" || typeof value.namespace !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.namespace) || !Number.isInteger(value.idleMinutes) || value.idleMinutes < 1 || value.idleMinutes > 60 || !Number.isInteger(value.absoluteMinutes) || value.absoluteMinutes < value.idleMinutes || value.absoluteMinutes > 480) throw new OperatorAuthError("AUTH_CONFIG");
  return { ...value };
}
