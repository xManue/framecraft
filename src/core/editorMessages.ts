import type { ConsoleEntry } from "./types";

export type MessageContext = "editor" | "preview" | "recovery" | "backup" | "interface";
export interface EditorMessage {
  text: string;
  nextStep?: string;
  details?: string;
}

export function cleanDiagnosticText(value: string) {
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim();
}

/** Presentation only: keep the original log and recovery payload unchanged. */
export function describeEditorMessage(raw: string, context: MessageContext = "editor", level: ConsoleEntry["level"] = "error"): EditorMessage {
  const details = cleanDiagnosticText(raw);
  const message = (text: string, nextStep?: string): EditorMessage => ({ text, nextStep, details: details || undefined });
  if (context === "backup" || /Bozza locale non conservata|non posso conservare la bozza/i.test(details)) {
    return message("La copia automatica della bozza non è stata aggiornata.",
      `${/ENOSPC|disco pieno|spazio insufficiente/i.test(details) ? "Libera spazio sul disco. " : ""}Le ultime modifiche potrebbero non essere recuperabili dopo la chiusura. Salva la pagina o copia le modifiche prima di uscire; poi riprova il backup.`);
  }
  if (context === "interface") return message("L’interfaccia dell’editor si è interrotta.",
    "Prova a tornare ai progetti. Se ci sono modifiche non salvate, conferma l’uscita solo dopo averle conservate. Se ricapita, comunica i dettagli tecnici a chi ti assiste.");
  if (/config path contains.*\?/i.test(details)) return message("Avviso sul percorso Windows dell’anteprima.",
    "Se l’anteprima funziona, puoi continuare. Se non parte, apri la diagnostica e mostra il percorso a chi ti assiste: l’avviso da solo non prova che il progetto sia danneggiato.");
  if (/Failed to load url.*\\\\\?\\/i.test(details)) return message("L’anteprima non riesce a leggere un percorso Windows.",
    "Riprova l’anteprima. Se l’errore continua, mostra i dettagli tecnici a chi ti assiste: non occorre rinominare la cartella a tentativi.");
  if (/failed to load config|failed to load url.*vite.*config|config.*non valida/i.test(details)) return message("La configurazione dell’anteprima non può essere caricata.",
    "Apri la diagnostica per individuare il file indicato. Riprova dopo aver corretto la configurazione; ricostruire la cache da solo potrebbe non bastare.");
  if (/failed to resolve import|cannot find (?:module|package)|module not found|ERR_MODULE_NOT_FOUND/i.test(details)) return message("Manca un componente necessario per mostrare il pannello.",
    "La diagnostica indica il componente o il file mancante. Chiedi a chi gestisce il progetto di verificarlo, poi riprova l’anteprima.");
  if (/node_modules|vite\.cmd|node(?:\.exe)?.*(?:not found|non trovato|non disponibile)|npm.*(?:not found|non trovato)/i.test(details)
    && /mancant|non trovat|not found|non disponibil/i.test(details)) return message("L’anteprima non trova gli strumenti necessari per avviarsi.",
      "Verifica l’installazione di Node.js e delle dipendenze del progetto con chi ti assiste, poi riprova l’anteprima.");
  if (/EADDRINUSE|port.*already in use|porta.*occupata/i.test(details)) return message("La porta richiesta dall’anteprima è già occupata.",
    "Riprova l’anteprima. Se il problema continua, verifica nella diagnostica quale programma sta usando quella porta.");
  if (/\bEBUSY\b|resource busy or locked/i.test(details)) return message(
    /\bwatch\b/i.test(details) ? "L’anteprima non ha potuto sorvegliare un file temporaneamente occupato." : "Un file è temporaneamente occupato da un’altra operazione.",
    "Attendi che la copia o l’importazione del file finisca, poi riprova. Se l’anteprima si è fermata, usa Riprova anteprima: il progetto e la bozza restano nell’editor. Se ricapita, apri la diagnostica per vedere quale file è coinvolto.");
  if (context === "recovery") {
    if (/non più autorizzat|fuori.*autorizzat/i.test(details)) return message("Una parte della bozza si trova in una cartella non autorizzata.",
      "Per recuperare la bozza serve verificare l’accesso alla cartella indicata nei dettagli; il recupero non aggiunge permessi da solo.");
    if (/backend non ha più aperto|Un altro progetto|sessione.*cambiata/i.test(details)) return message("Il progetto della bozza non è disponibile in questa sessione.",
      "La bozza resta conservata. Riprova il recupero; se il problema continua, verifica con chi ti assiste la cartella indicata sotto.");
    if (/scaduta/i.test(details)) return message("Questa copia temporanea è troppo vecchia per il recupero automatico.",
      "Puoi ancora consultare il codice conservato per assistenza. Non scartare la bozza se contiene modifiche che vuoi conservare.");
    if (/non.*valid|formato|JSON|SyntaxError/i.test(details)) return message("La copia locale non può essere letta correttamente.",
      "Nessun progetto è stato aperto dal recupero. Consulta i dettagli con chi ti assiste prima di scartare la copia.");
  }
  if (/ENOSPC|disco pieno|spazio insufficiente/i.test(details)) return message("Non c’è abbastanza spazio sul disco per completare l’operazione.",
    "Libera spazio, poi riprova. Prima di chiudere l’editor conserva eventuali modifiche non salvate.");
  if (/EACCES|EPERM|access is denied|permission denied|accesso negato|Accesso.*non consentito/i.test(details)) return message("Framecraft non può accedere al file o alla cartella richiesta.",
    "Verifica che la cartella sia accessibile e autorizzata e che il file non sia bloccato da un altro programma, poi riprova.");
  if (/ENOENT|os error 2|file non trovato|file.*non esiste|no such file|impossibile trovare il file/i.test(details)) return message("Un file necessario non è stato trovato.",
    context === "recovery" ? "Il recupero non ha eliminato la copia locale. Verifica che la cartella non sia stata spostata e riprova il recupero." : "Controlla il percorso nei dettagli e verifica che il progetto non sia stato spostato o che il file non sia stato eliminato.");
  if (/Modifica annullata:.*codice non valido/i.test(details)) return message("La modifica è stata annullata perché avrebbe reso la pagina non valida.",
    "Il file non è stato modificato da questa operazione. Controlla i dettagli con chi ti assiste prima di riprovare.");
  if (/non è stato salvato.*modalità Code|errore di sintassi|SyntaxError|Unexpected token/i.test(details)) return message("La pagina contiene un errore nel codice.",
    /non è stato salvato/.test(details) ? "Il salvataggio è stato fermato. Fai correggere il punto indicato nei dettagli tecnici e riprova a salvare." : "Apri i dettagli per individuare il punto da correggere. Se non lavori sul codice, chiedi assistenza prima di riprovare.");
  if (/Vite.*(?:non si è avviato|chius|terminat|interrott|non risulta attivo)|error when starting dev server/i.test(details)) return message(
    /chius|terminat/.test(details) ? "Il servizio dell’anteprima si è fermato." : "L’anteprima non è stata avviata.",
    "Il progetto resta nell’editor. Usa Riprova anteprima per avviarla; se non parte, apri la diagnostica. Il riavvio non salva le modifiche della bozza.");
  if (context === "preview" && /\bVITE\b.*\bready in\b/i.test(details)) return message("Il servizio dell’anteprima è pronto.");
  if (context === "preview" && /^\s*(?:➜\s*)?Local:\s*https?:/i.test(details)) return message("Indirizzo locale dell’anteprima.");
  if (/^Desktop bridge ready$/.test(details)) return { text: "App desktop pronta: puoi aprire e modificare progetti locali." };
  if (/^Browser mode:/.test(details)) return { text: "Anteprima nel browser: per aprire o salvare progetti locali usa l’app desktop." };
  if (/^Preview (?:avviata|riavviata) su /i.test(details)) return message("Anteprima avviata.");
  if (/^Riavvio Vite/i.test(details)) return message("Riavvio dell’anteprima in corso…", "Documento e cronologia restano nell’editor.");
  const technical = /^(?:Error|TypeError|ReferenceError|RangeError|SyntaxError|URIError|AggregateError)\b|\bat (?:\S+\s+\(|file:\/\/)|\b(?:cannot|failed to|uncaught|undefined is not|unexpected end of)\b/i.test(details) || /^E[A-Z]{3,}\b/.test(details);
  if (technical || !details) return message(context === "recovery" ? "Non è stato possibile completare il recupero." : level === "warning" ? "È necessario verificare un avviso tecnico." : "Non è stato possibile completare l’operazione.",
    "Apri i dettagli tecnici per capire quale passaggio si è fermato. Se l’errore ricompare, comunicali a chi ti assiste.");
  return { text: details };
}

export function consoleMessageSource(item: ConsoleEntry) {
  return item.source ?? (cleanDiagnosticText(item.message).startsWith("[HMI ") ? "hmi" : "editor");
}
