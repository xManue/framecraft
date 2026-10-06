import { describe, expect, it } from "vitest";
import { cleanDiagnosticText, describeEditorMessage, type MessageContext } from "../src/core/editorMessages";

describe("messaggi comprensibili senza alterare l'errore originale", () => {
  it.each<[string, MessageContext, string]>([
    ['The config path contains the "?" character (\\\\?\\C:\\panel\\.framecraft\\vite.editor.config.mjs)', "preview", "percorso Windows"],
    ['Error: Failed to load url \\\\?\\C:\\panel\\.framecraft\\vite.editor.config.mjs', "preview", "percorso Windows"],
    ["failed to load config from C:/panel/.framecraft/vite.editor.config.mjs", "preview", "configurazione"],
    ["Failed to resolve import ./Missing.jsx from Page.jsx", "preview", "Manca un componente"],
    ["Error: Cannot find package react", "preview", "Manca un componente"],
    ["Vite non risulta attivo. Usa le opzioni nel menu Visualizza", "preview", "non è stata avviata"],
    ["Vite si è chiuso inaspettatamente", "preview", "si è fermato"],
    ["Error: EADDRINUSE 127.0.0.1:4173", "preview", "porta"],
    ["Vite si è chiuso inaspettatamente (codice 1). Ultimo output: Error: EBUSY: resource busy or locked, watch 'C:/panel/public/framecraft-assets/image-2.png'", "preview", "file temporaneamente occupato"],
    ["EBUSY: resource busy or locked, copyfile 'image.png'", "editor", "temporaneamente occupato"],
    ["Error: ENOENT: no such file C:/panel/Page.jsx", "recovery", "file necessario"],
    ["Bozza locale non conservata: disco pieno", "backup", "non è stata aggiornata"],
    ["EPERM: permission denied", "editor", "accedere"],
    ["La bozza contiene file non più autorizzati.", "recovery", "non autorizzata"],
    ["La copia temporanea è scaduta.", "recovery", "troppo vecchia"],
    ["TypeError: Cannot read properties of undefined", "editor", "completare l’operazione"],
  ])("spiega %s e mantiene i dettagli", (raw, context, expected) => {
    const result = describeEditorMessage(raw, context);
    expect(result.text).toContain(expected);
    expect(result.details).toBe(raw);
    expect(result.nextStep).toBeTruthy();
  });

  it("non attribuisce un arresto di Vite a dipendenze mancanti solo perché appare vite.cmd", () => {
    const raw = "Vite non si è avviato. C:/panel/node_modules/.bin/vite.cmd si è chiuso subito dopo l’avvio.";
    expect(describeEditorMessage(raw, "preview").text).toBe("Il servizio dell’anteprima si è fermato.");
  });

  it("un avviso di compatibilità non dichiara fallita un'anteprima funzionante", () => {
    const message = describeEditorMessage('The config path contains the "?" character', "preview", "warning");
    expect(message.text).toContain("Avviso");
    expect(message.nextStep).toContain("Se l’anteprima funziona, puoi continuare");
    expect(message.text).not.toContain("non riesce");
  });

  it("non promette un backup riuscito né gli ultimi caratteri recuperabili", () => {
    const message = describeEditorMessage("accesso negato", "backup");
    expect(message.nextStep).toContain("potrebbero non essere recuperabili");
    expect(message.nextStep).toContain("prima di uscire");
  });

  it("distingue una modifica respinta da una pagina realmente non salvabile", () => {
    const canceled = describeEditorMessage("Modifica annullata: avrebbe lasciato Page.jsx con codice non valido (Unexpected token). Il file non è stato toccato.");
    expect(canceled.text).toContain("modifica è stata annullata");
    expect(canceled.nextStep).toContain("non è stato modificato");
    const failedSave = describeEditorMessage("Page.jsx contiene un errore di sintassi (Unexpected token), quindi non è stato salvato. Correggilo in modalità Code.");
    expect(failedSave.nextStep).toContain("salvataggio è stato fermato");
  });

  it("rimuove codici terminale ANSI e titoli OSC, non percorsi o punti del codice", () => {
    const text = "\x1b]0;titolo terminale\x07\x1b[31mError: Unexpected token C:/panel/Page.jsx:20:3\x1b[0m";
    expect(cleanDiagnosticText(text)).toBe("Error: Unexpected token C:/panel/Page.jsx:20:3");
    expect(describeEditorMessage(text).details).toBe("Error: Unexpected token C:/panel/Page.jsx:20:3");
  });

  it("mantiene messaggi italiani già chiari e tracce HMI, senza reinterpretare i tag", () => {
    expect(describeEditorMessage("Elemento rimosso da questa pagina.", "editor", "success")).toEqual({ text: "Elemento rimosso da questa pagina." });
    expect(describeEditorMessage("[HMI Tapped] Motor.Error=0", "editor", "info")).toEqual({ text: "[HMI Tapped] Motor.Error=0" });
  });
});
