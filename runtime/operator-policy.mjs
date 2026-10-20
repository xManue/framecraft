export const operatorCapabilities = Object.freeze(["recipes.read", "recipes.create", "recipes.update", "recipes.copy", "recipes.rename", "recipes.delete", "alarms.acknowledge", "alarms.confirm", "tags.write"]);
const messages = {
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
  AUTH_CSRF: [403, "Sessione operatore da verificare", "Rileggi lo stato dell’accesso e riprova solo l’operazione confermata. Nessun comando viene reinviato automaticamente."],
  AUTH_ORIGIN: [403, "Origine dell’accesso non consentita", "Controlla HTTPS, origine pubblica e proxy del pannello. HTTP è ammesso solo sul loopback di sviluppo esplicitamente configurato."],
  AUTH_THROTTLED: [429, "Troppi tentativi di accesso", "Attendi almeno un minuto prima di riprovare. Se il problema continua, contatta il responsabile del servizio."],
};
export class OperatorAuthError extends Error {
  constructor(code) { const known = Object.hasOwn(messages, code) ? code : "AUTH_STORE", [status, message, remedy] = messages[known]; super(message); this.name = "OperatorAuthError"; this.code = known; this.status = status; this.remedy = remedy; }
}
export const operatorObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const operatorKeys = (value, keys) => operatorObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const operatorText = (value, max = 160) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
export const operatorUsername = value => typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);

export function parseOperatorAuthConfig(value) {
  if (!operatorKeys(value, ["version", "enabled", "namespace", "allowHttpLoopback", "idleMinutes", "absoluteMinutes"]) || value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.allowHttpLoopback !== "boolean" || typeof value.namespace !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.namespace) || !Number.isInteger(value.idleMinutes) || value.idleMinutes < 1 || value.idleMinutes > 60 || !Number.isInteger(value.absoluteMinutes) || value.absoluteMinutes < value.idleMinutes || value.absoluteMinutes > 480) throw new OperatorAuthError("AUTH_CONFIG");
  return { ...value };
}
