# AI facoltativa in Framecraft

Aggiornato al 15 ottobre 2026.

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

Ogni domanda ora ha **Lascia scegliere all’AI / Rispondo io**, comprese le domande aggiuntive.
La delega è distinta da “da completare”: il modello propone le scelte di struttura/grafica
delegate nel riepilogo prima di creare. Risposte precedenti conservate per tornare indietro,
ma non inviate come indicazioni alle domande delegate. Numero/piano pagine delegato può
aggiungere pagine, non cancellare o sostituire quelle già scelte; nomi ancora vuoti possono
essere proposti dal modello. Le decisioni hanno chiavi note e valori validati; risposte
esplicite e collegamenti reali non possono essere modificati senza delega.
Tag, protocollo reale, disponibilità documenti, immagini, interblocchi, autorizzazioni e
altri fatti macchina sconosciuti non vengono dedotti: rimangono attività da configurare.
L’AI può proporre la necessità di un’immagine o etichette scollegate, non un asset o un
mapping PLC reale. Saltare l’accesso lascia le autorizzazioni da definire e disabilita i
comandi senza un permesso reale già specificato. Nessun account o permesso è inventato.
La proposta usa lo stesso generatore e resta soggetta ad approvazione, consenso e controlli
di obsolescenza; non parte alcuna inferenza automatica quando si salta una domanda.

La raccolta ora include dodici aree e oltre sessanta domande mirate: dispositivo/grafica,
navigazione/popup/oggetti riutilizzabili, PLC/qualità dei dati, comandi/sequenze, allarmi,
trend/archivi, ricette, produzione/manutenzione, utenti/audit, lingue/accessibilità,
report/documenti/integrazioni e pubblicazione/backup/collaudo. I dettagli facoltativi si aprono
soltanto per funzioni richieste o pagine dedicate; ogni scelta può essere rimandata. Il riepilogo
permette di correggere ogni area senza perdere risposte. Pagina iniziale e tempi dei trend sono
applicati dal generatore; gli altri campi restano requisiti espliciti nel progetto, non
configurazioni dichiarate pronte. Ricette, produzione, manutenzione e report hanno strutture
di pagina chiaramente incomplete. PDF/documenti e file ricette non sono importati/interpretati
dalle nuove domande; ne viene raccolta la disponibilità. Dettagli testuali tecnici soltanto
locali, all’AI arrivano opzioni validate e presenza dei dettagli. Nessun segreto richiesto.

Ogni template standard e ogni base guidata ora dichiara una scheda di funzionamento versionata:
scopo, comportamenti noti, input macchina necessari, stato strutturale/funzionale, limiti e
default effettivi. Catalogo, intervista e AI usano la stessa fonte. Le richieste AI includono
solo schede selezionate, senza duplicazioni; non devono far rispiegare ciò che la base prevede già.
Le impostazioni note vengono ereditate e mostrate separatamente, personalizzabili senza
sovrascrivere risposte/rinvii espliciti. Restano da raccogliere solo i dati macchina non noti.
Il progetto conserva framecraft.templates.json e marcatori ID/versione nelle pagine; l’assistente
sugli elementi risolve la scheda dal genitore noto senza inviare sorgenti o percorsi. Vecchie
pagine, ID e versioni sconosciuti non ricevono semantica inventata. Le schede descrivono la base,
non il codice successivamente modificato né un collaudo industriale.

L’AI riceve solo le risposte approvate e i conteggi dei dati: foto, file, nomi tag, indirizzi e
percorsi locali non vengono trasmessi. Domande ulteriori hanno un campo per ogni risposta.
Account, modello e consenso sono richiesti solo prima dell’invio; nessun login o inferenza
parte aprendo la procedura. Codex CLI/App Server usa un profilo Framecraft separato e l’account
ChatGPT individuale, senza API key condivisa; l’adapter è sostituibile. Account, verifica
accesso e modello si gestiscono soltanto in Impostazioni → AI e account. La schermata AI mostra
lo stato e un pulsante per aprirle; il ritorno conserva risposte e richiesta di modifica. Le
notifiche di fine accesso restano osservate anche a finestre chiuse, senza login o inferenza
impliciti. Protocollo verificato
contro le definizioni della CLI locale 0.159.2. Una richiesta reale autorizzata è stata completata
con il profilo Framecraft: parser strict, generazione nativa, build e browser del pannello
verificati (LAVORO, punti 124–125). Restano i gesti completi di login/dialoghi/IPC nella finestra
desktop; il test motore/provider non prova ogni gesto della UI nativa.

Il generatore standard accetta anche un piano esplicito: crea solo le pagine approvate,
router/manifesto/menu coerenti, immagini per pagina e cataloghi locali validati. Salva requisiti
e parti da completare in framecraft.requirements.json; la connessione PLC rimane disabilitata.
Valori e curve leggono soltanto tag scelti dall’utente. I pulsanti non configurati restano
disabilitati; per scritture singole il questionario raccoglie evento operatore, tag scrivibile,
valore compatibile, permesso e conferma esplicita del mapping. Usa la stessa IR/eventi
dell’Inspector; tag e valori restano locali, il modello non li inventa o modifica. Cambi di
valore/evento/permesso o reimport del catalogo revocano la conferma; rinominare/cancellare/riordinare
righe non sposta il mapping sul comando sbagliato. I gate utente restano fail-closed senza
permesso; gateway disabilitato, autorizzazioni server, interlock e collaudo sono passi separati.
Non sono comandi a uomo presente o funzioni di sicurezza: pressione/rilascio e watchdog PLC
richiedono un contratto operativo e prove di guasto. Targhette e grafiche
restano modificabili nel normale editor. Le risposte sopravvivono alla chiusura/riapertura della
finestra durante la stessa sessione. Nell’app desktop la bozza locale permette anche la ripresa
dopo riavvio, con scelta esplicita e conferma prima di eliminarla. Conserva solo intervista,
requisiti, cataloghi e percorsi immagini nel profilo locale; nessun account, proposta AI o
consenso all’invio. Le conferme dei mapping di scrittura vengono revocate nella copia conservata
e al recupero. Conflitti fra istanze, file corrotti/bloccati e mancato salvataggio sono segnalati;
si può continuare senza recupero locale senza cancellare la copia. Il salvataggio è atomico e
serializzato; la chiusura forzata può perdere le ultime modifiche non ancora confermate.

L’assistenza durante le modifiche è una chat laterale continua: barra attività o Pannello → Chat AI.
Tasto destro su elemento/pagina per allegare, oppure comandi nel compositore. Bozza e messaggi
restano nella sessione del progetto; chiusura/cambio progetto e cambio account li svuotano.
Fino a cinque pagine con struttura, testi e stili reali ricavati dal sorgente locale; anche i figli
di un contenitore allegato sono modificabili. I target sono precisi e validati, non solo nomi pagina.
Gli interni di componenti importati e il rendering Runtime non vengono dedotti.
Consenso valido per la sessione progetto/account, revocabile e non persistito: copre richieste,
allegati, indicazioni fissate e cronologia selezionata. Nessuna spunta a ogni messaggio:
fino a tre scambi recenti e due estratti utente precedenti pertinenti, senza altre chiamate AI.
JSON compatto e destinazione una sola volta, budget 24.000 byte UTF-8 per prompt più schema;
stima locale token non equivalente al consumo Codex. Indicazioni fissate sempre integre,
conservate con Nuova chat ma non dopo cambio progetto/account. Esclusioni e abbreviazioni
visibili, richiesta tecnica ispezionabile; nessuna garanzia di memoria perfetta dei messaggi vecchi.
Nuova chat con conferma, annullamento e isolamento
delle risposte tardive. Nessun salvataggio persistente delle conversazioni o invio automatico.
Modello e ragionamento selezionabili nella chat dal catalogo Codex; predefinito senza override,
livelli validati anche dal backend. Collegamento account solo nelle impostazioni.
Chiarimenti con campi nella chat e rinvio esplicito della parte non definita: ripresa dell’obiettivo,
allegati vincolati e risposte precedenti nella stessa catena, senza cancellare la bozza separata.
Contesto del seguito ispezionabile e stesso budget; niente invio o applicazione automatici.
Selezione locale di fino a otto dati: nome scelto, tipo e ID anonimo all’AI, nomi tag/indirizzi/valori
non raccolti per il provider. Prime dinamiche read-only di testo, colore e visibilità BOOL, sempre
non preselezionate e con confronto del tag reale locale. Tag cambiati o tipi incompatibili bloccano
il salvataggio; eventi e altre dinamiche sono preservati. Nessuna connessione o scrittura PLC creata.
Oggi applica testo e stile/geometria/layout dei nodi allegati. Revisione con valori prima/dopo, nomi italiani, no-op
esclusi e schema indicativo aggiornato dalle sole modifiche accettate. Valori dinamici o basi
ancora pilotate dal Runtime non sono preselezionati: la sostituzione o il cambio del fallback
richiede una scelta esplicita. Lo schema non monta JSX, immagini o eventi del progetto.
Controllo del sorgente e del progetto; per il singolo elemento anche selezione/istanza/ambito.
Conferma e un unico Annulla/Ripeti per file, non una transazione multi-file; il testo JSX è codificato
per evitare che diventi codice eseguibile. Non è una preview completa della pagina né un’analisi
delle dipendenze e dei comportamenti di tutto il progetto.
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
| AI-BASE-04 | Diff semantico e impact analysis | PARZIALE | Prima/dopo sul singolo elemento, valori dinamici e basi Runtime espliciti; restano impatto trasversale su pagine, tag, eventi, allarmi e sicurezza |
| AI-BASE-05 | Transazioni multi-file e undo/redo | PARZIALE | Una proposta è applicata o annullata in modo atomico |
| AI-BASE-06 | Indice del progetto e ricerca dipendenze | PARZIALE | Recupero mirato del contesto senza inviare l'intero progetto |
| AI-BASE-07 | Test generabili dalle funzioni HMI | DA FARE | Ogni funzione critica proposta porta verifiche eseguibili |
| AI-BASE-08 | Provenienza e assunzioni strutturate | PARZIALE | Contratti base con ID/versione, comportamento/input/limiti e rinvii; provenienza operativa e analisi del codice modificato da completare |

## 2. Input per la generazione iniziale

| ID | Input | Stato | Regola |
|---|---|---|---|
| AI-IN-01 | Standard HMI e target WinCC/Optix | PARZIALE | Versione e dispositivo devono essere espliciti |
| AI-IN-02 | Catalogo PLC, tipi e programmi esportati | PARZIALE | I tag operativi provengono solo dall'input reale |
| AI-IN-03 | PDF/schema elettrico e documenti macchina | DA FARE | Estrazione con riferimenti alla pagina e richiesta di conferma |
| AI-IN-04 | Descrizione funzionale e sequenze | PARZIALE | Domande mirate su modalità, consensi, feedback e sequenze conservate localmente; interpretazione operativa e contratto PLC da completare |
| AI-IN-05 | Immagini o layout della macchina | PARZIALE | Usare asset reali; targhette e hotspot restano configurabili |
| AI-IN-06 | Lista allarmi, ricette, utenti e permessi | PARZIALE | Nessuna semantica viene dedotta soltanto dal nome di un tag |
| AI-IN-07 | Progetto HMI precedente o di riferimento | DA FARE | Importare, confrontare e dichiarare ciò che viene riusato |
| AI-IN-08 | Mapping macchina-PLC-HMI approvato | PARZIALE | Letture e scritture singole da tag importati con valore/evento/permesso e approvazione; sequenze, comandi a uomo presente, handshake PLC e mapping connessioni ancora da completare |

## 3. Pianificazione AI del pannello

| ID | Capacità | Stato | Risultato richiesto |
|---|---|---|---|
| AI-PLAN-01 | Valutazione della completezza degli input | PARZIALE | Validazione del questionario, rinvii e conflitti monitoraggio/comandi e ruoli/accesso; completezza industriale da verificare |
| AI-PLAN-02 | Scelta motivata di template e famiglie pagina | PARZIALE | Famiglie scelte dall’utente con funzionamento noto nel contesto AI; scelta automatica motivata tra tutti i template da implementare |
| AI-PLAN-03 | Piano pagine, navigazione e popup | PARZIALE | Pagine/categorie esplicite e pagina iniziale applicata; popup e oggetti ripetuti raccolti come requisiti da configurare |
| AI-PLAN-04 | Piano binding e interazioni | PARZIALE | Letture e comandi singoli con tag, valore, evento e permessi espliciti; matrice operativa completa ancora da fare |
| AI-PLAN-05 | Piano allarmi, trend, ricette e diagnostica | PARZIALE | Catalogo allarmi locale, tempi trend applicati e requisiti ricette/archivio; generazione operativa completa da implementare |
| AI-PLAN-06 | Piano utenti e sicurezza | PARZIALE | Requisiti mirati su identità, ruoli, sessione e audit; implementazione server e matrice da approvare separatamente |
| AI-PLAN-07 | Stima compatibilità target e licenze | DA FARE | Limiti funzionali Framecraft, licenze dipendenze/provider e diritti degli asset verificati prima di creare file; destinazione React autonoma OPC UA/MQTT, non licenze dei Runtime vendor |
| AI-PLAN-08 | Revisione e approvazione del piano | DA FARE | L'utente può correggere singole decisioni o procedere manualmente |

## 4. Generazione iniziale facoltativa

| ID | Capacità | Stato | Risultato richiesto |
|---|---|---|---|
| AI-GEN-01 | Creazione del progetto dallo standard scelto | PARZIALE | Stessa pipeline "Nuovo pannello standard" disponibile manualmente |
| AI-GEN-02 | Generazione di guscio, menu e pagine | PARZIALE | Solo template compatibili e copertura dichiarata |
| AI-GEN-03 | Posizionamento di grafica macchina, hotspot e targhette | PARZIALE | Immagini e identificativi reali, niente macchina fittizia |
| AI-GEN-04 | Binding tag e dinamizzazioni | PARZIALE | Mapping approvato, tipi compatibili e dipendenze verificabili |
| AI-GEN-05 | Eventi, script e navigazione | PARZIALE | Scritture singole confermate compilate con la stessa IR dell’editor e gate di interazione; altri script/azioni/handshake ancora da fare |
| AI-GEN-06 | Allarmi, trend, ricette e report | PARZIALE | Catalogo allarmi e letture/tempi trend da dati scelti; ricette/report solo strutture esplicitamente incomplete e requisiti, non funzioni operative |
| AI-GEN-07 | Testi e traduzioni | PARZIALE | Dizionario, fallback e copertura lingua visibili |
| AI-GEN-08 | Utenti, ruoli e autorizzazioni | PARZIALE | Proposta separata ad alta attenzione e matrice revisionabile |
| AI-GEN-09 | Validazione e test del progetto generato | PARZIALE | Report completo prima di dichiarare pronta la prima versione |
| AI-GEN-10 | Handoff all'editor manuale | PARZIALE | Nessun lock-in: canvas, Inspector e sorgente restano normali |

## 5. AI durante le modifiche

| ID | Capacità | Stato | Esempio |
|---|---|---|---|
| AI-EDIT-01 | Comando naturale su selezione corrente | PARZIALE | Testo/stile e prime dinamiche read-only BOOL/testo scalare con dato locale esplicito, alias anonimo, revisione e Undo; soglie numeriche, logica avanzata, azioni operative e impact analysis generale restano da implementare |
| AI-EDIT-02 | Comando su pagina o gruppo di pagine | PARZIALE | Testi e restyling di nodi/pagine allegate con target validati e approvazione per file; nuove funzioni operative trasversali come la diagnostica motori restano da implementare |
| AI-EDIT-03 | Refactoring trasversale sicuro | DA FARE | Rinomina tag o aggiorna un faceplate mostrando l'impatto |
| AI-EDIT-04 | Generazione da screenshot/documento | DA FARE | Propone struttura e geometrie senza inventare comportamenti |
| AI-EDIT-05 | Diagnosi di errori e binding rotti | DA FARE | Spiega la causa e prepara una correzione selezionabile |
| AI-EDIT-06 | Suggerimenti non invasivi | DA FARE | Accessibilità, copertura lingue, performance e coerenza standard |
| AI-EDIT-07 | Spiegazione del progetto | DA FARE | Risponde usando dipendenze reali e link all'oggetto interessato |
| AI-EDIT-08 | Generazione e manutenzione test | DA FARE | Aggiorna i test insieme alla funzione proposta |
| AI-EDIT-09 | Chat con anteprima del diff | PARZIALE | Chat di sessione, contesto compatto di pagine reali, modello/ragionamento, consenso di sessione e approvazione per file; restano storico persistente, revisioni ramificate, rendering/dipendenze complete e transazioni multi-file |
| AI-EDIT-10 | Cronologia delle proposte AI | DA FARE | Autore, input, diff, esito e rollback leggibili |

## 6. Esperienza utente

| ID | Capacità | Stato | Regola UX |
|---|---|---|---|
| AI-UX-01 | Scelta iniziale Manuale / Con AI | DA FARE | Default chiaro e modificabile, senza pressione sull'utente |
| AI-UX-02 | Pannello AI richiudibile | DA FARE | Il canvas non dipende dalla sua presenza |
| AI-UX-03 | Contesto esplicito | PARZIALE | Allegati espliciti, payload ispezionabile, note fissate e budget locale prompt/schema; esclusioni e stima token visibili. Restano documenti/immagini completi e conteggio esatto provider |
| AI-UX-04 | Preview visuale e diff semantico | PARZIALE | Schema indicativo del singolo elemento e confronto base prima/dopo; preview reale di pagina/progetto e contesto Runtime ancora da implementare |
| AI-UX-05 | Accettazione parziale | PARZIALE | Scelta per proprietà sul selezionato, con dinamici non preselezionati; restano gruppi logici trasversali e dipendenze tra operazioni |
| AI-UX-06 | Domande quando manca un dato critico | PARZIALE | Campi di chiarimento, rinvio senza invenzioni, ripresa su obiettivo/allegati originali e nuova approvazione; validazione operativa dei dati e scelta tag locale nella chat restano da implementare |
| AI-UX-07 | Stato di esecuzione e annullamento | PARZIALE | Richiesta annullabile e stato esplicito; questionario desktop recuperabile localmente, senza consensi né mapping approvati; restano avanzamento dettagliato, transazioni AI multi-file e collaudo IPC nativo completo |
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
