# AI facoltativa in Framecraft

Aggiornato al 14 ottobre 2026.

L'obiettivo finale è accompagnare l'intero ciclo di costruzione dell'HMI senza rendere l'AI un
requisito. Priorità aggiornata dall’utente: completare adesso la pipeline AI + app,
rinviando le capacità WinCC Unified/FactoryTalk Optix ancora mancanti. L’AI usa
le stesse primitive pubbliche dell'editor che usa una persona. Non esiste un formato di progetto
"AI" separato e un progetto generato resta sempre modificabile interamente a mano.

## Prima pipeline guidata implementata (14 ottobre 2026)

Nuovo pannello propone la scelta **Con AI / Senza AI**. Il percorso AI non inizia più da una
richiesta libera: raccoglie nome e processo, desktop/mobile, numero esatto delle pagine e nome,
funzione e categoria di ciascuna. I passi successivi dipendono dalle funzioni scelte: contenuti,
immagini della macchina o delle singole parti (necessarie/facoltative/non desiderate), tag
JSON/CSV e catalogo allarmi Framecraft JSON. Si possono rimandare esplicitamente gli input
non disponibili: diventano segnaposto e attività residue, mai dati macchina inventati.

L’AI riceve solo le risposte approvate e i conteggi dei dati: foto, file, nomi tag, indirizzi e
percorsi locali non vengono trasmessi. Domande ulteriori hanno un campo per ogni risposta.
Account, modello e consenso sono richiesti solo prima dell’invio; nessun login o inferenza
parte aprendo la procedura. Codex CLI/App Server usa un profilo Framecraft separato e l’account
ChatGPT individuale, senza API key condivisa; l’adapter è sostituibile. Protocollo verificato
contro le definizioni della CLI locale 0.159.2; il login e l’inferenza reali richiedono ancora
collaudo nella nuova build desktop, non provati dai test con provider sintetico.

Il generatore standard accetta anche un piano esplicito: crea solo le pagine approvate,
router/manifesto/menu coerenti, immagini per pagina e cataloghi locali validati. Salva requisiti
e parti da completare in framecraft.requirements.json; la connessione PLC rimane disabilitata.
Valori e curve leggono soltanto tag scelti dall’utente. I pulsanti macchina restano disabilitati
finché azioni, interlock e permessi non vengono configurati e collaudati. Targhette e grafiche
restano modificabili nel normale editor. Le risposte sopravvivono alla chiusura/riapertura della
finestra durante la stessa sessione; recupero persistente del questionario ancora da aggiungere.

L’assistenza durante le modifiche mantiene la richiesta libera, ma oggi applica solo testo e
stile dell’elemento selezionato, con revisione parziale, controllo di sorgente/selezione e un
unico Annulla/Ripeti. Il testo JSX è codificato per evitare che diventi codice eseguibile.
Non equivale a completamento AI: restano generazione completa di funzioni operative, mapping
approvati di scrittura, ricette, PDF, ruoli server, modifiche multi-file atomiche, licensing,
privacy/eval e commissioning industriale. Lingua inglese e protocollo selezionato sono requisiti
da completare, non traduzioni o connessioni automaticamente pronte.

## Le tre modalità devono essere equivalenti

1. **Manuale** — l'utente crea e modifica tutto senza configurare un modello AI.
2. **Generazione iniziale assistita** — l'utente fornisce gli input disponibili, sceglie lo
   standard/target e può chiedere all'AI di preparare la prima versione del pannello.
3. **Assistenza durante il lavoro** — l'utente può chiedere modifiche locali o trasversali in
   qualunque momento, oppure ignorare completamente l'AI.

Il passaggio da una modalità all'altra non deve convertire il progetto né perdere informazioni.

Chiarimento del 30 settembre 2026: l'AI prepara o modifica un HMI autonomo Framecraft, non un
progetto da distribuire in TIA/Rockwell. Può proporre mapping OPC UA/MQTT da input reali approvati,
ma non inventa endpoint, NodeId, topic, payload, credenziali o permessi di scrittura. Configurazione
e collaudo della connessione restano possibili senza AI.

## Principi obbligatori

- **Opt-in reale**: nessuna chiave, account o connessione AI è necessaria per usare l'editor.
- **Stesse primitive**: AI, Inspector, canvas e operazioni massive invocano lo stesso command layer.
- **Proposte verificabili**: prima di applicare un cambiamento importante l'utente vede file, pagine,
  oggetti, tag e comportamenti coinvolti.
- **Undo completo**: una proposta accettata è una singola operazione annullabile, anche se modifica
  più pagine.
- **Nessun dato inventato**: tag, allarmi, interlock, soglie, ricette e sicurezza provengono da
  input approvati oppure restano esplicitamente incompleti.
- **Provenienza**: ogni decisione generata indica quali documenti, standard, template o mapping ha
  usato e quali assunzioni sono ancora da confermare.
- **Validazione prima dell'applicazione**: lo stesso validatore WinCC/Optix controlla le modifiche
  manuali e quelle proposte dall'AI.
- **Privacy e scelta del modello**: progetto locale, provider e dati inviati devono essere visibili;
  le funzioni manuali continuano a funzionare offline.
- **Controllo granulare**: l'utente può accettare tutto, solo alcune modifiche o nessuna.
- **Nessuna azione Runtime nascosta**: l'AI non scrive su PLC, non effettua deploy e non modifica
  impianti senza un comando esplicito e i controlli previsti per quella operazione.

## 1. Fondazione comune prima dell'AI

| ID | Capacità | Stato | Criterio di completamento |
|---|---|---|---|
| AI-BASE-01 | Command layer unico per ogni modifica editor | PARZIALE | Ogni comando manuale è invocabile e descrivibile senza automazione UI |
| AI-BASE-02 | Modello progetto tipizzato WinCC/Optix | PARZIALE | L'AI non deve modificare stringhe o JSX senza comprenderne il contratto |
| AI-BASE-03 | Validatore completo di progetto | PARZIALE | Errori, warning e blocchi sono identici per persona e AI |
| AI-BASE-04 | Diff semantico e impact analysis | DA FARE | La proposta mostra effetti su pagine, tag, eventi, allarmi e sicurezza |
| AI-BASE-05 | Transazioni multi-file e undo/redo | PARZIALE | Una proposta è applicata o annullata in modo atomico |
| AI-BASE-06 | Indice del progetto e ricerca dipendenze | PARZIALE | Recupero mirato del contesto senza inviare l'intero progetto |
| AI-BASE-07 | Test generabili dalle funzioni HMI | DA FARE | Ogni funzione critica proposta porta verifiche eseguibili |
| AI-BASE-08 | Provenienza e assunzioni strutturate | DA FARE | Ogni proposta distingue fatti, mapping approvati e parti mancanti |

## 2. Input per la generazione iniziale

| ID | Input | Stato | Regola |
|---|---|---|---|
| AI-IN-01 | Standard HMI e target WinCC/Optix | PARZIALE | Versione e dispositivo devono essere espliciti |
| AI-IN-02 | Catalogo PLC, tipi e programmi esportati | PARZIALE | I tag operativi provengono solo dall'input reale |
| AI-IN-03 | PDF/schema elettrico e documenti macchina | DA FARE | Estrazione con riferimenti alla pagina e richiesta di conferma |
| AI-IN-04 | Descrizione funzionale e sequenze | DA FARE | Separare requisiti certi, preferenze e ipotesi |
| AI-IN-05 | Immagini o layout della macchina | PARZIALE | Usare asset reali; targhette e hotspot restano configurabili |
| AI-IN-06 | Lista allarmi, ricette, utenti e permessi | PARZIALE | Nessuna semantica viene dedotta soltanto dal nome di un tag |
| AI-IN-07 | Progetto HMI precedente o di riferimento | DA FARE | Importare, confrontare e dichiarare ciò che viene riusato |
| AI-IN-08 | Mapping macchina-PLC-HMI approvato | DA FARE | È il gate per generare comandi e binding operativi |

## 3. Pianificazione AI del pannello

| ID | Capacità | Stato | Risultato richiesto |
|---|---|---|---|
| AI-PLAN-01 | Valutazione della completezza degli input | DA FARE | Elenco dati sufficienti, mancanti e contraddittori |
| AI-PLAN-02 | Scelta motivata di template e famiglie pagina | DA FARE | Nessuna pagina inventata per riempire il menu |
| AI-PLAN-03 | Piano pagine, navigazione e popup | DA FARE | Route e destinazioni verificabili prima della generazione |
| AI-PLAN-04 | Piano binding e interazioni | DA FARE | Tag, direzione, evento e permessi espliciti |
| AI-PLAN-05 | Piano allarmi, trend, ricette e diagnostica | DA FARE | Solo funzioni sostenute dagli input disponibili |
| AI-PLAN-06 | Piano utenti e sicurezza | DA FARE | Matrice ruoli/operazioni da approvare separatamente |
| AI-PLAN-07 | Stima compatibilità target e licenze | DA FARE | Limiti funzionali Framecraft, licenze dipendenze/provider e diritti degli asset verificati prima di creare file; destinazione React autonoma OPC UA/MQTT, non licenze dei Runtime vendor |
| AI-PLAN-08 | Revisione e approvazione del piano | DA FARE | L'utente può correggere singole decisioni o procedere manualmente |

## 4. Generazione iniziale facoltativa

| ID | Capacità | Stato | Risultato richiesto |
|---|---|---|---|
| AI-GEN-01 | Creazione del progetto dallo standard scelto | PARZIALE | Stessa pipeline "Nuovo pannello standard" disponibile manualmente |
| AI-GEN-02 | Generazione di guscio, menu e pagine | PARZIALE | Solo template compatibili e copertura dichiarata |
| AI-GEN-03 | Posizionamento di grafica macchina, hotspot e targhette | PARZIALE | Immagini e identificativi reali, niente macchina fittizia |
| AI-GEN-04 | Binding tag e dinamizzazioni | PARZIALE | Mapping approvato, tipi compatibili e dipendenze verificabili |
| AI-GEN-05 | Eventi, script e navigazione | DA FARE | Builder tipizzato, sandbox e test prima dell'applicazione |
| AI-GEN-06 | Allarmi, trend, ricette e report | DA FARE | Configurazione reale, non widget decorativi |
| AI-GEN-07 | Testi e traduzioni | PARZIALE | Dizionario, fallback e copertura lingua visibili |
| AI-GEN-08 | Utenti, ruoli e autorizzazioni | PARZIALE | Proposta separata ad alta attenzione e matrice revisionabile |
| AI-GEN-09 | Validazione e test del progetto generato | PARZIALE | Report completo prima di dichiarare pronta la prima versione |
| AI-GEN-10 | Handoff all'editor manuale | PARZIALE | Nessun lock-in: canvas, Inspector e sorgente restano normali |

## 5. AI durante le modifiche

| ID | Capacità | Stato | Esempio |
|---|---|---|---|
| AI-EDIT-01 | Comando naturale su selezione corrente | DA FARE | "Rendi questo indicatore rosso quando il tag è in allarme" |
| AI-EDIT-02 | Comando su pagina o gruppo di pagine | DA FARE | "Aggiungi la stessa diagnostica a tutti i motori" |
| AI-EDIT-03 | Refactoring trasversale sicuro | DA FARE | Rinomina tag o aggiorna un faceplate mostrando l'impatto |
| AI-EDIT-04 | Generazione da screenshot/documento | DA FARE | Propone struttura e geometrie senza inventare comportamenti |
| AI-EDIT-05 | Diagnosi di errori e binding rotti | DA FARE | Spiega la causa e prepara una correzione selezionabile |
| AI-EDIT-06 | Suggerimenti non invasivi | DA FARE | Accessibilità, copertura lingue, performance e coerenza standard |
| AI-EDIT-07 | Spiegazione del progetto | DA FARE | Risponde usando dipendenze reali e link all'oggetto interessato |
| AI-EDIT-08 | Generazione e manutenzione test | DA FARE | Aggiorna i test insieme alla funzione proposta |
| AI-EDIT-09 | Chat con anteprima del diff | DA FARE | Conversazione, piano, preview, accettazione parziale, applicazione |
| AI-EDIT-10 | Cronologia delle proposte AI | DA FARE | Autore, input, diff, esito e rollback leggibili |

## 6. Esperienza utente

| ID | Capacità | Stato | Regola UX |
|---|---|---|---|
| AI-UX-01 | Scelta iniziale Manuale / Con AI | DA FARE | Default chiaro e modificabile, senza pressione sull'utente |
| AI-UX-02 | Pannello AI richiudibile | DA FARE | Il canvas non dipende dalla sua presenza |
| AI-UX-03 | Contesto esplicito | DA FARE | Mostrare selezione, pagina, file e documenti inviati |
| AI-UX-04 | Preview visuale e diff semantico | DA FARE | Evidenziare cosa cambia prima di accettare |
| AI-UX-05 | Accettazione parziale | DA FARE | Selezione per gruppo logico, non solo per file |
| AI-UX-06 | Domande quando manca un dato critico | DA FARE | Chiedere invece di indovinare tag, soglie o permessi |
| AI-UX-07 | Stato di esecuzione e annullamento | DA FARE | Operazioni lunghe visibili, cancellabili e recuperabili |
| AI-UX-08 | Funzionamento offline manuale | PARZIALE | L'assenza AI non degrada le capacità dell'editor |

## 7. Sicurezza, qualità e valutazione

| ID | Capacità | Stato | Criterio |
|---|---|---|---|
| AI-SAFE-01 | Confini tra progetto, sorgenti esterne e istruzioni | DA FARE | Documenti importati sono dati, mai comandi nascosti |
| AI-SAFE-02 | Controllo dei dati inviati al provider | DA FARE | Preview, redazione e policy per file/cartelle |
| AI-SAFE-03 | Conferma per deploy e operazioni su impianto | DA FARE | L'AI può proporre ma non eseguire senza autorità esplicita |
| AI-SAFE-04 | Validazione deterministica post-generazione | PARZIALE | Il risultato non dipende dalla fiducia nel testo del modello |
| AI-SAFE-05 | Evals su progetti standard e regressioni | DA FARE | Completezza, correttezza binding, fedeltà e mancata invenzione |
| AI-SAFE-06 | Confronto AI/manuale sullo stesso task | DA FARE | L'AI deve risparmiare tempo senza ridurre la qualità |
| AI-SAFE-07 | Tracciamento costi, latenza e fallimenti | DA FARE | L'utente conosce stato e impatto prima delle operazioni grandi |
| AI-SAFE-08 | Provider sostituibile o modello locale | DA FARE | Il command layer non dipende da un singolo servizio |

## Sequenza

1. Collegare Codex CLI/App Server all’app desktop, con account ChatGPT individuale,
   opt-in esplicito e adapter sostituibile in futuro con API; nessun token copiato
   dall’app Codex esistente, account comune o richiesta AI implicita all’avvio.
2. Chiudere il flusso iniziale: richiesta, piano revisionabile, creazione con la pipeline
   standard dell’app e handoff a canvas/Inspector normali.
3. Chiudere il flusso di modifica: contesto approvato, proposta verificata, accettazione
   selettiva, rilevamento cambiamenti intervenuti e applicazione annullabile.
4. Estendere le capacità di proposta alle primitive disponibili, consolidare transazioni,
   eval, privacy, sicurezza, qualità e compatibilità del collegamento Codex.
5. Riprendere le capacità WinCC Unified e FactoryTalk Optix rimaste incomplete.
6. Ampliare provider, automazioni e funzionalità oltre la parità, mantenendo AI facoltativa.

L’AI entra ora come orchestratore delle capacità già disponibili. Le funzioni mancanti
rimangono dichiarate, senza progetti finti, mapping PLC inventati o bypass dei gate industriali.
Il percorso manuale rimane indipendente e l’obiettivo completo WinCC/Optix non viene cancellato.
