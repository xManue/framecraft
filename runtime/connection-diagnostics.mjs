// Static messages only: never interpolate transport errors, payloads or credentials.
export const connectionMessages = Object.freeze({
  CONNECTING: ["info", "Collegamento in corso", "Il servizio sta aprendo la connessione.", "Attendi il risultato; salvare la configurazione non avvia la rete.", "Nessun comando viene accodato."],
  CONNECTED: ["info", "Connessione disponibile", "Il collegamento e le sottoscrizioni sono attivi.", "Controlla anche qualità e aggiornamento dei singoli tag.", "Connesso non significa che il PLC abbia eseguito un comando."],
  STOPPED: ["info", "Connessione arrestata", "Il servizio ha chiuso il collegamento.", "Riavvia manualmente il servizio solo dopo aver verificato la configurazione.", "Nessun comando viene reinviato."],
  INSECURE_TRANSPORT: ["warning", "Collegamento senza TLS", "È stato autorizzato esplicitamente un collegamento MQTT non cifrato.", "Usalo solo per prove su una rete isolata. Per produzione configura mqtts/wss e certificati verificati; eventuali credenziali su mqtt/ws viaggiano senza cifratura TLS.", "Questo consenso non equivale ad approvazione per la produzione."],
  CONNECTION_LOST: ["warning", "Collegamento interrotto", "La comunicazione è stata persa; il servizio prova a riconnettersi.", "Controlla rete e disponibilità del broker. Verifica separatamente gli eventuali comandi incerti.", "Gli ultimi valori restano visibili ma non validi. Nessun replay dei comandi."],
  NETWORK_REFUSED: ["error", "Servizio non raggiungibile", "La porta di destinazione ha rifiutato la connessione.", "Controlla indirizzo e porta, avvio del broker e regole del firewall.", "Non ci sono dati aggiornati e i comandi non vengono accodati."],
  NETWORK_DNS: ["error", "Nome del server non trovato", "Il nome configurato non viene risolto dalla rete del servizio.", "Controlla il nome del broker, DNS e collegamento alla rete corretta.", "Nessun collegamento disponibile."],
  NETWORK_TIMEOUT: ["error", "Il collegamento non risponde", "Connessione o sottoscrizione non completata entro il timeout.", "Controlla rete, porta, firewall e disponibilità del broker; non aumentare il timeout senza verificare la causa.", "Non sono stati accodati nuovi comandi."],
  NETWORK_ERROR: ["error", "Errore di comunicazione", "Il collegamento non è disponibile.", "Controlla rete e broker; usa il codice tecnico per l’assistenza se il problema persiste.", "I valori acquisiti non vengono considerati aggiornati."],
  AUTH_DENIED: ["error", "Accesso al broker rifiutato", "Il broker non ha autorizzato il collegamento.", "Controlla utente e password nell’ambiente del servizio e i permessi dell’account sul broker.", "La connessione resta ferma: nessun tentativo ripetuto con credenziali rifiutate."],
  CLIENT_ID_CONFLICT: ["error", "Client ID già in uso", "Il broker ha interrotto la sessione perché un altro client usa lo stesso identificativo.", "Assegna un Client ID diverso a ciascun servizio; poi riavvia quello corretto.", "Nessuna riconnessione automatica che sottragga la sessione all’altro client."],
  CLIENT_ID_INVALID: ["error", "Client ID rifiutato", "L’identificativo client non rispetta i vincoli del broker.", "Controlla lunghezza e caratteri ammessi dal broker e assegna un identificativo unico al servizio.", "Collegamento bloccato; nessun reinvio dei comandi."],
  MQTT_VERSION: ["error", "Versione MQTT rifiutata", "Il broker non accetta la versione del protocollo richiesta.", "Seleziona MQTT 3.1.1 o 5.0 in base alla configurazione reale del broker.", "Nessun comando inviato."],
  SUBSCRIPTION_DENIED: ["error", "Lettura dei topic rifiutata", "Il broker non ha accettato tutte le sottoscrizioni richieste.", "Controlla i topic di lettura e le autorizzazioni subscribe dell’account; poi riavvia il servizio.", "La connessione non viene dichiarata pronta con un mapping incompleto."],
  TLS_UNTRUSTED: ["error", "Certificato del server non attendibile", "La catena del certificato TLS non è verificabile.", "Fatti fornire la CA corretta dall’amministratore e configura il percorso CA sul servizio. Non disattivare la verifica TLS.", "Il collegamento è bloccato per proteggere dati e credenziali."],
  TLS_EXPIRED: ["error", "Certificato scaduto o non ancora valido", "La validità temporale del certificato TLS non è corretta.", "Controlla data e ora del servizio e fai rinnovare il certificato dal responsabile.", "Il collegamento sicuro resta bloccato."],
  TLS_HOSTNAME: ["error", "Certificato e indirizzo non corrispondono", "Il certificato non è valido per il nome del broker configurato.", "Usa il nome presente nel certificato oppure fai correggere il certificato; non aggirare la verifica.", "Il collegamento sicuro resta bloccato."],
  TLS_CONFIGURATION: ["error", "Configurazione TLS non valida", "Certificato o chiave client non possono essere utilizzati.", "Verifica formato, abbinamento certificato/chiave e permessi di lettura del servizio.", "Nessun collegamento sicuro disponibile."],
  SECRET_MISSING: ["error", "Credenziale del servizio mancante", "Una variabile ambiente richiesta per l’accesso non è disponibile.", "Imposta le variabili indicate nei campi utente/password/token sul servizio e sul proxy, poi riavviali. Non inserire i valori nei JSON o in VITE_*.", "Nessun segreto viene mostrato nel messaggio."],
  TLS_FILE: ["error", "File TLS non disponibile", "Il servizio non può leggere uno dei file di certificato o chiave configurati.", "Controlla i percorsi sulla macchina che esegue il servizio e i permessi del suo account.", "Il collegamento non viene avviato."],
  CONFIGURATION: ["error", "Configurazione da correggere", "I cataloghi del pannello non sono validi o non sono leggibili.", "Apri Pannello → Connessioni PLC, correggi i campi segnalati e salva. Controlla anche Variabili PLC e runtime/README.md.", "Nessun collegamento o comando avviato."],
  OPC_UA_UNAVAILABLE: ["warning", "OPC UA non ancora disponibile", "Questa versione non contiene il driver OPC UA; un profilo OPC UA non viene convertito in MQTT.", "Mantieni il profilo locale. Per collegare un server OPC UA serve prima implementare e collaudare il client, inclusi certificati, namespace e permessi.", "Nessuna connessione OPC UA o conferma PLC simulata."],
  BAD_PAYLOAD: ["error", "Dato ricevuto non valido", "Il payload non corrisponde al formato o al tipo del tag configurato.", "Controlla formato JSON/testo, tipo PLC e un esempio reale del payload con il responsabile del broker.", "L’ultimo valore viene conservato con qualità Bad, non sostituito da un valore inventato."],
  BAD_MAPPING: ["error", "Campo del JSON non trovato", "Il percorso configurato non è presente nel messaggio ricevuto.", "Correggi Valore/Qualità/Timestamp nel JSON. Esempio: per {\"value\":42} usa /value; per 42 lascia vuoto.", "Il tag non viene considerato valido."],
  BAD_QUALITY: ["error", "Qualità del tag non valida", "Il campo qualità non contiene un codice intero valido.", "Verifica qualityPath e il formato della qualità pubblicata; non attribuire Good a un codice mancante.", "L’ultimo valore resta conservato con qualità Bad."],
  BAD_TIMESTAMP: ["error", "Timestamp del tag non valido", "Il campo data/ora non è interpretabile.", "Verifica timestampPath e unità: secondi, millisecondi Unix oppure una data ISO valida.", "Il campione non sostituisce l’ultimo valore valido."],
  PAYLOAD_TOO_LARGE: ["error", "Messaggio troppo grande", "Il payload supera il limite configurato.", "Controlla che il topic contenga un valore scalare, non un’intera struttura; modifica il limite solo se necessario.", "Il dato non viene accettato."],
  OLD_SAMPLE: ["warning", "Campione precedente ignorato", "È arrivato un timestamp sorgente più vecchio dell’ultimo campione.", "Controlla l’orologio della sorgente e l’ordine dei messaggi, inclusi quelli retained.", "Il valore più recente non viene sovrascritto."],
  STALE_SAMPLE: ["warning", "Tag non aggiornato", "Non è arrivato un campione entro il limite configurato, oppure non ne è ancora arrivato nessuno.", "Controlla il publisher, il topic e la frequenza di invio; imposta Scadenza campione coerente con quella frequenza.", "Il valore precedente, se presente, resta visibile con qualità Bad."],
  SAMPLE_RECOVERED: ["info", "Tag nuovamente disponibile", "È arrivato un campione valido dopo un errore o una scadenza.", "Controlla la qualità pubblicata dalla sorgente: una qualità mancante resta sconosciuta.", "Solo l’acquisizione aggiorna il valore, mai la ricevuta di un comando."],
  SOURCE_BAD: ["warning", "La sorgente segnala qualità Bad", "Il publisher dichiara che il valore non è affidabile.", "Controlla la diagnostica del PLC/publisher e il mapping della qualità.", "L’ultimo valore valido resta conservato; non usare il tag per decisioni operative."],
  WRITE_DENIED: ["error", "Scrittura non autorizzata", "Il tag o la connessione non consentono questo comando.", "Verifica accesso del tag, topic comando e i due consensi di scrittura: connessione e gateway. Abilitali solo se previsti dalla macchina.", "Comando non inviato."],
  WRITE_INVALID: ["error", "Valore del comando non valido", "Il valore non rientra nel tipo PLC dichiarato o nel limite del payload.", "Correggi il valore e verifica il tipo del tag; numeri fuori intervallo non vengono arrotondati o inviati.", "Comando non inviato."],
  WRITE_OFFLINE: ["error", "Comando non inviato", "Il collegamento non è pronto.", "Ripristina la connessione e verifica lo stato prima di dare un nuovo comando manuale.", "Nessuna coda offline e nessun invio successivo automatico."],
  WRITE_REJECTED: ["error", "Comando rifiutato dal broker", "Il broker ha restituito un rifiuto esplicito del comando.", "Controlla autorizzazioni publish, topic e limiti del broker; correggi la causa prima di un nuovo comando manuale.", "Nessuna conferma di esecuzione PLC e nessun reinvio automatico."],
  WRITE_UNCERTAIN: ["error", "Esito del comando incerto", "Dopo l’invio non è stata ottenuta una ricevuta affidabile, oppure la richiesta è stata interrotta.", "Verifica lo stato reale della macchina e la diagnostica del PLC prima di qualsiasi nuovo comando. Non ripetere alla cieca.", "Il comando potrebbe essere arrivato. Non viene reinviato e il valore visualizzato non viene aggiornato ottimisticamente."],
  NO_RECEIVERS: ["warning", "Il broker non segnala destinatari", "Il broker ha risposto che non ci sono sottoscrittori corrispondenti al topic del comando.", "Controlla che il PLC/publisher sia connesso e sottoscritto al topic corretto; verifica lo stato macchina prima di un nuovo comando.", "Una ricevuta MQTT non prova l’esecuzione PLC."],
  GATEWAY_AUTH: ["error", "Pannello non autorizzato al gateway", "Il servizio ha rifiutato l’autenticazione del proxy/pannello.", "Verifica che servizio e proxy usino lo stesso token privato; riavvia entrambi dopo averlo corretto. Non metterlo nel browser.", "Nessun nuovo comando viene accodato."],
  GATEWAY_ORIGIN: ["error", "Origine del pannello non autorizzata", "Il gateway non accetta l’indirizzo web da cui arriva la richiesta.", "Controlla Origini HTTP/HTTPS autorizzate e il reverse proxy. Inserisci l’origine esatta, non *.", "Richiesta rifiutata prima dell’invio al broker."],
  GATEWAY_OFFLINE: ["error", "Gateway non disponibile", "Il pannello non riceve una risposta valida dal servizio locale.", "Controlla che il servizio sia avviato, porta e proxy; consulta i log del servizio. Rete del broker e gateway sono collegamenti distinti.", "I valori non sono aggiornati e i comandi non vengono accodati."],
  GATEWAY_BUSY: ["warning", "Servizio occupato", "È stato raggiunto il limite delle richieste o del registro comandi.", "Attendi e verifica i comandi già in corso; non ripetere quelli con esito incerto.", "Il nuovo comando è rifiutato, non accodato."],
  GATEWAY_CONFLICT: ["error", "Identificativo comando già utilizzato", "Lo stesso identificativo è associato a un comando diverso.", "Controlla il client o l’integrazione; non riutilizzare identificativi per nuovi comandi.", "Il comando diverso è rifiutato."],
  GATEWAY_REQUEST: ["error", "Richiesta al gateway non valida", "La richiesta non rispetta il formato o l’operazione previsti.", "Controlla configurazione e versione del client; usa i sorgenti runtime generati insieme al pannello.", "Richiesta rifiutata prima dell’invio al broker."],
  GATEWAY_LISTEN: ["error", "Gateway non avviato", "Il servizio non può aprire la porta locale configurata.", "Controlla se un altro servizio occupa la porta e i permessi dell’account. Correggi la porta anche nel proxy.", "Nessuna connessione PLC viene avviata da questo servizio."],
  LOG_UNAVAILABLE: ["warning", "Log su disco non disponibile", "Il servizio non riesce a conservare il registro nella cartella prevista.", "Controlla spazio su disco e permessi di .framecraft-runtime/logs. I messaggi restano disponibili nella console del servizio.", "L’errore di logging non interrompe il collegamento; il registro potrebbe essere incompleto."],
  LOG_OVERFLOW: ["warning", "Troppi eventi da conservare", "Il limite della coda del registro è stato raggiunto.", "Controlla errori ripetuti e prestazioni del disco; usa anche la console del servizio.", "Alcuni eventi su disco potrebbero mancare; nessun comando viene ripetuto."],
});

const safeLabel = (value) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) : undefined;
const technicalCodes = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ETIME", "ENOENT", "EACCES", "EPERM", "EBUSY", "EADDRINUSE", "ENOSPC", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_REVOKED", "ERR_OSSL_PEM_NO_START_LINE", "ERR_OSSL_X509_KEY_VALUES_MISMATCH", "ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED", "ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE", "ERR_SSL_TLSV1_ALERT_UNKNOWN_CA"]);
export function connectionDiagnostic(code, context = {}) {
  const selected = Object.hasOwn(connectionMessages, code) ? code : "NETWORK_ERROR";
  const [level, title, message, action, impact] = connectionMessages[selected];
  const technicalCode = typeof context.technicalCode === "number" && Number.isInteger(context.technicalCode) && context.technicalCode >= 0 && context.technicalCode <= 65535 ? String(context.technicalCode)
    : typeof context.technicalCode === "string" && (technicalCodes.has(context.technicalCode) || /^\d{1,5}$/.test(context.technicalCode) && Number(context.technicalCode) <= 65535) ? context.technicalCode : undefined;
  return { code: selected, level, title, message, action, impact, protocol: ["mqtt", "opcua", "gateway"].includes(context.protocol) ? context.protocol : "mqtt",
    timestamp: Number.isFinite(context.timestamp) && Math.abs(context.timestamp) <= 8640000000000000 ? context.timestamp : Date.now(),
    ...(safeLabel(context.connectionId) ? { connectionId: safeLabel(context.connectionId) } : {}), ...(safeLabel(context.tag) ? { tag: safeLabel(context.tag) } : {}), ...(technicalCode ? { technicalCode } : {}) };
}
export function diagnosticText(event) { return event.title + ". " + event.message + " " + event.impact + " Come risolvere: " + event.action; }
export class ConnectionOperationError extends Error {
  constructor(diagnostic, outcome = "rejected") { super(diagnosticText(diagnostic)); this.name = "ConnectionOperationError"; this.diagnostic = diagnostic; this.outcome = outcome; }
}
export function transportDiagnosticCode(error) {
  const code = error?.code;
  if ([4, 5, 134, 135, 138, 140].includes(code)) return "AUTH_DENIED";
  if ([1, 132].includes(code)) return "MQTT_VERSION";
  if ([2, 133].includes(code)) return "CLIENT_ID_INVALID";
  if (code === 142) return "CLIENT_ID_CONFLICT";
  if (["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) return "NETWORK_REFUSED";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "NETWORK_DNS";
  if (["ETIMEDOUT", "ETIME"].includes(code)) return "NETWORK_TIMEOUT";
  if (["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"].includes(code)) return "TLS_EXPIRED";
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return "TLS_HOSTNAME";
  if (["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_REVOKED"].includes(code)) return "TLS_UNTRUSTED";
  if (typeof code === "string" && /^(ERR_SSL_|ERR_OSSL_|ERR_TLS_)/.test(code)) return "TLS_CONFIGURATION";
  return "NETWORK_ERROR";
}
export function safeNotify(callback, value) { try { callback?.(value); } catch { /* Observers must not break a transport or trigger a replay. */ } }
export function createDiagnosticReporter(callback, context = {}, options = {}) {
  const records = new Map(), interval = options.intervalMs ?? 5000, maxEntries = options.maxEntries ?? 512;
  return (code, extra = {}) => {
    const event = connectionDiagnostic(code, { ...context, ...extra });
    const key = event.code + "\0" + (event.tag ?? "") + "\0" + (event.technicalCode ?? ""), now = event.timestamp;
    const previous = records.get(key);
    if (event.level !== "info" && previous && now - previous.at < interval) { previous.count++; return event; }
    records.delete(key);
    if (records.size >= maxEntries) records.delete(records.keys().next().value);
    records.set(key, { at: now, count: 0 });
    safeNotify(callback, { ...event, occurrences: 1 + (previous?.count ?? 0) });
    return event;
  };
}
