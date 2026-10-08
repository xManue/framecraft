# Framecraft verso WinCC Unified e oltre

Aggiornato al 5 ottobre 2026. Baseline funzionale: documentazione ufficiale WinCC Unified V21.

Questo file è la checklist stabile del progetto. L'obiettivo non è copiare l'aspetto di TIA Portal,
ma coprire le capacità che servono a progettare e usare un HMI Unified, poi renderle più verificabili,
più veloci e più estendibili. L'inventario elenca le **famiglie funzionali**; le migliaia di singole
proprietà e metodi dell'object model verranno censite dentro la relativa famiglia quando la si affronta.

## Stato

**Destinazione aggiornata al 30 settembre 2026**: HMI React autonomi, collegati a CPU fisiche o
PLC virtuali tramite OPC UA/MQTT. Non sono progetti da distribuire in TIA/WinCC. Formati,
licenze e limiti vendor restano riferimenti comparativi, non condizioni per completare Framecraft.
La decisione stabile è in ARCHITETTURA-HMI.md.

- `FATTO`: comportamento reale presente e coperto da test.
- `PARZIALE`: esiste una parte utilizzabile, ma non c'è ancora parità WinCC.
- `DA FARE`: non implementato.
- `ESTERNO`: richiede TIA, Runtime, PLC o una licenza/opzione esterna; Framecraft deve comunque
  modellarlo, validarlo o integrarlo senza fingere di eseguirlo.
- `RIFERIMENTO`: capacità specifica di un IDE/Runtime vendor, fuori dal completamento del
  prodotto autonomo; resta censita per confronto o migrazione facoltativa.

Una card nella palette non basta per segnare una funzione come fatta: servono configurazione,
persistenza, comportamento in anteprima/runtime, diagnostica e test proporzionati alla funzione.

5 ottobre 2026: l'Inspector permette anche di disegnare col mouse una **zona da evidenziare**,
a rettangolo o contorno a punti, su foto/SVG/contenitori. Il collegamento e' persistito nel JSX
e funziona nel pannello React autonomo; guida, Esc, Invio/Fine, zoom e toggle sono collaudati.
E' un miglioramento di engineering Framecraft, non la chiusura di tutte le proprieta' o API
WinCC: `WCU-ENG-07` resta parziale. Limiti e verifiche sono nel punto 86 di `LAVORO.md` e
in `ARCHITETTURA-HMI.md`; nessun avanzamento artificiale dei gate industriali, Optix o AI.

## 1. Progetto, pagine e oggetti

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-ENG-01 | Creazione e apertura progetto HMI | FATTO | — | Progetto React leggibile e versionabile |
| WCU-ENG-02 | Configurazione dispositivo e Runtime | PARZIALE | Profili Unified Basic, Comfort e PC; limiti per dispositivo | Un solo modello con controllo automatico compatibilità target |
| WCU-ENG-03 | Pagine, gruppi e gerarchia ricorsiva | FATTO | — | Percorsi conservati per evitare collisioni di nomi |
| WCU-ENG-04 | Layout, screen window e navigazione | FATTO | Più screen window indipendenti | Router e destinazioni controllati prima dell'avvio |
| WCU-ENG-05 | Layout PC e mobile | PARZIALE | Profili e vincoli di tutti i pannelli | Due layout espliciti, senza breakpoint che falsano la pagina |
| WCU-ENG-06 | Oggetti base, forme, testi e controlli | PARZIALE | Tutti gli oggetti V21 e tutte le proprietà applicabili | Palette filtrata per target e proprietà realmente supportate |
| WCU-ENG-07 | Proprietà, geometria, stile e ordinamento | PARZIALE | Z-order tra contesti annidati, trasformazioni/allineamenti completi e proprietà non CSS | Editing AST conservativo; z-index e rotazione in gradi subito visibili, anche sui gruppi; drag/resize per frame senza easing, rilascio esatto, annullamento del gesto e riferimenti di gruppo aggiornati |
| WCU-ENG-08 | Grafiche SVG, immagini e media | PARZIALE | Import/export delle 225 grafiche del progetto reale | Libreria asset con dipendenze, anteprima e sostituzione guidata |
| WCU-ENG-09 | Stili Runtime e temi | PARZIALE | Style items e temi per dispositivo | Token di design verificati contro screenshot e JSON reali |
| WCU-ENG-10 | Testi multilingua e lingue Runtime | FATTO | — | Dizionario unico, binding dall'Inspector, cambio lingua globale live, fallback e copertura verificata |
| WCU-ENG-11 | Liste testi e liste grafiche | FATTO | — | Editor, regole Decimal/Bool/BitNumber e anteprima immediata con valori simulati |
| WCU-ENG-12 | Librerie, master copy e tipi versionati | PARZIALE | Libreria globale/master copy, pacchetti e aggiornamento istanze | Catalogo tipi faceplate con release immutabili, nuova versione e validazione dipendenze; restano diff e migrazione assistita |
| WCU-ENG-13 | Copia, ricerca, sostituzione e operazioni massive | PARZIALE | Operazioni massive su proprietà/tag/eventi | Ricerca per dipendenza PLC e anteprima dell'impatto |
| WCU-ENG-14 | Compilazione e validazione engineering | PARZIALE | Copertura di tutte le regole WinCC/device | Errori spiegati sul sorgente prima del deploy |
| WCU-ENG-15 | Import/export TIA Openness | RIFERIMENTO | Round-trip verso TIA non richiesto | JSON normalizzato e import ricorsivo disponibili come base di migrazione |
| WCU-ENG-16 | Engineering collaborativo e confronto versioni | DA FARE | Sincronizzazione e conflitti | Merge per pagina/oggetto/tag invece che per file intero |

## 2. Variabili, tipi dati e connessioni PLC

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-TAG-01 | Catalogo tag HMI e PLC | FATTO | — | Import XLSX e controllo nomi usati/non dichiarati |
| WCU-TAG-02 | Binding oggetto-tag | FATTO | — | Collegamento visibile nell'Inspector e nel sorgente |
| WCU-TAG-03 | Tag interni, esterni e di sistema | PARZIALE | Editor e comportamento distinto per origine | Provenienza e disponibilità dichiarate, mai valori inventati |
| WCU-TAG-04 | Tipi semplici, array, struct e UDT | PARZIALE | Editor tipi, array dinamici, nested UDT e BlockArray | Navigazione tipizzata dei membri e mapping automatico controllato |
| WCU-TAG-05 | Tag locali di pagina e faceplate | PARZIALE | Tag locali di pagina e uso nelle dinamizzazioni del faceplate | Definizione, start value e stato Runtime isolato per ogni istanza faceplate; collisioni d'interfaccia impedite |
| WCU-TAG-06 | Indirizzamento indiretto | DA FARE | Tag WString che seleziona un altro tag | Anteprima della risoluzione e protezione dai riferimenti ciclici |
| WCU-TAG-07 | Valore, qualità, timestamp ed errori | PARZIALE | Collegare QualityCode, TimeStamp, LastError ed ErrorDescription al driver Runtime reale | Simulazione guidata di qualità/data campione e lettura degli stati negli script |
| WCU-TAG-08 | Cicli di acquisizione e trigger | PARZIALE | Integrare i cicli col driver Runtime reale e con tutte le proprietà dei tag | Data Log ciclici, su variazione e su richiesta/trigger con minimo 500 ms, stima archivio e validazione |
| WCU-TAG-09 | Limiti, start value e soglie | PARZIALE | Proprietà di tag e quattro soglie V21 | Riutilizzo automatico su IO, bar, gauge e trend |
| WCU-TAG-10 | Formula, scala e conversione unità | PARZIALE | Conversioni WinCC complete | Formula sicura testabile con valori reali/simulati |
| WCU-TAG-11 | Lettura e scrittura singola | PARZIALE | Driver Runtime reale e gestione errori | Tracciamento di chi legge/scrive il tag |
| WCU-TAG-12 | Lettura/scrittura massiva TagSet | PARZIALE | Collegamento al driver Runtime reale | Add/Remove/Clear, ReadMaxAge, batch sync/async/QCD, messaggi operatore, esito parziale per tag e dipendenze visibili |
| WCU-TAG-13 | Connessioni S7 e altri driver | RIFERIMENTO | Driver proprietari non richiesti | OPC UA/MQTT secondo le capacità della CPU, anche virtuale |
| WCU-TAG-14 | Diagnostica connessione e riconnessione | PARZIALE | Collaudo CPU, audit/storage server e diagnosi avanzata | MQTT e OPC UA scalare nel gateway; qualità vera, timeout, rimedi, log sanificati e retry solo rete senza replay |

## 3. Dinamizzazioni

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-DYN-01 | Proprietà dinamica da tag | FATTO | — | Simulazione senza PLC e ripristino esatto del canvas |
| WCU-DYN-02 | Mapping diretto, range e singolo bit | FATTO | Importare le 1068 tabelle mancanti quando TIA è disponibile | Regole modificabili e testabili nell'Inspector |
| WCU-DYN-03 | Espressioni con più tag | FATTO | Ampliare progressivamente funzioni/conversioni WinCC | Parser sicuro, dipendenze automatiche, errori in linea e rivalutazione live |
| WCU-DYN-04 | Formula su tag e condizioni ordinate | FATTO | Funzioni WinCC non ancora coperte | Prima condizione vera, diagnostica delle righe non valutabili |
| WCU-DYN-05 | Resource list dynamization | FATTO | — | Lista + tag nell'Inspector, cambio lingua live, fallback e chiavi mancanti visibili subito |
| WCU-DYN-06 | Script dynamization | PARZIALE | Ampliare il sottoinsieme JavaScript e le API WinCC | IR senza eval, return value, trigger automatici/espliciti, ciclo, budget e dipendenze visibili |
| WCU-DYN-07 | Flashing dinamico | PARZIALE | Proprietà colore specifiche dei controlli oltre BackColor/ForeColor/BorderColor e object model completo | Dichiarativo Never/Always/Range violation e API script PropertyFlashing sui tre colori, lookup per nome Screen/Faceplate, RGB e frequenze 2 s/1 s/500 ms; anteprima e Runtime condivisi, colori base preservati e fallback per riduzione movimento |
| WCU-DYN-08 | Più proprietà dinamiche sullo stesso oggetto | FATTO | — | Conflitti tra dinamiche segnalati |
| WCU-DYN-09 | Rivalutazione al cambio di un tag | FATTO | Collegamento a valori PLC reali | Grafo dipendenze e aggiornamento delle sole proprietà coinvolte |
| WCU-DYN-10 | Diagnostica espressioni e tag mancanti | FATTO | Estendere alle funzioni WinCC future | Controllo progetto più feedback immediato nell'Inspector |

## 4. Eventi, azioni e JavaScript

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-EVT-01 | Eventi oggetto, pagina e controlli | PARZIALE | Eventi rari e parametri specifici dei singoli controlli Siemens | Catalogo filtrato per tipo, script locale, prova e Runtime persistente per Activated/Deactivated, ContextTapped, Down/Up, KeyDown/KeyUp/HotKey, Tapped, Change, Gesture, Loaded/Unloaded, Initialized, InterfaceEvent e CommandFired |
| WCU-EVT-02 | Gestures e swipe | FATTO | — | Quattro direzioni touch, parametro gesture, nomi schermata tradotti in route e test Runtime |
| WCU-EVT-03 | Funzioni di sistema su pagine e popup | PARZIALE | Catalogo completo con firma parametri | Builder guidato senza stringhe fragili |
| WCU-EVT-04 | Lettura/scrittura tag da script | PARZIALE | Conferma PLC, OPC UA avanzato, QCD/audit e bit atomici reali, metodi restanti dell'object model | Simulatore deterministico; IR evento/moduli/timer/Scheduler collegata al gateway MQTT/OPC UA scalare; sospensione senza replay, campioni acquisiti separati dai comandi, errori per tag e batch parziali; nessun hmiWriteWait o lettura CPU forzata simulati |
| WCU-EVT-05 | Moduli JavaScript globali e locali | PARZIALE | JavaScript oltre il sottoinsieme IR, tipi di modulo di libreria e versionamento/master copy | Catalogo globale e locale, definizioni condivise persistenti per contesto, export pubblici live in sola lettura con alias e privati protetti, array/oggetti annidati per riferimento, 13 metodi Array, JSON e Object, inizializzazione singola, costanti, isolamento eventi/dinamizzazioni/Scheduler, dipendenze tag anche dopo mutazioni e indici dinamici, IR senza eval e Runtime esportato |
| WCU-EVT-06 | API asincrone e Promise | PARZIALE | Resto dell'object model, Promise/JavaScript completi, altri driver e conferme PLC | ReadAsync/WriteAsync MQTT/OPC UA scalare, then/catch e await/try-catch senza eval; coroutine unica con timeout/abort e budget CPU distinto dalla rete, anche nei moduli; QCD disponibile nella sola simulazione locale |
| WCU-EVT-07 | Timer e operazioni pianificate | PARZIALE | Closure e scoping JavaScript completi, funzioni come valori e collegamento del trigger Scheduler al futuro motore allarmi reale | Set/Clear Timeout/Interval in IR sicura, cattura per riferimento anche di array/oggetti nei callback inline, contesto condiviso Scheduler con dati strutturati e invalidazione dei timer scaduti; operazioni Time/Tags/Calendar/Alarms, prova manuale, tempo virtuale, limite anti-loop e Runtime esportato |
| WCU-EVT-08 | Debug, trace ed error handling | PARZIALE | Breakpoint, stack e diagnostica del Runtime/driver reale | TraceViewer filtrabile con origine, ricerca e correlazione evento-tag-navigazione |
| WCU-EVT-09 | Invio email da evento | DA FARE | Configurazione SMTP/system function | Template, anteprima e protezione da invii duplicati |
| WCU-EVT-10 | Object model grafico da script | PARZIALE | Proprietà/metodi specifici, Font di Caption/Title/assi e namespace delle enumerazioni da verificare, Margin e altri oggetti annidati, collezioni complete, bounding box/trasformazioni, contesti lifecycle e ProcessValue col driver tipizzato | Get/set comuni su riferimenti opachi Screen/Faceplate/item, Name readonly, geometrie e colori tipizzati, Text sicuro, Enabled anche da tastiera; Font annidato Name/Size/Weight/Italic/Underline/StrikeOut con firme Runtime e decorazioni del contenitore, anche nei moduli/timer/Promise; layer transitorio condiviso anteprima/Runtime e snapshot senza rimbalzi |

## 5. Faceplate, popup e riuso

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-FP-01 | Tipo faceplate riusabile | PARZIALE | Portare il mini-editor visuale alla parità dell'editor pagine: controlli avanzati, livelli, ordinamento e proprietà complete | Contenuto visuale persistente, sette oggetti base, geometria drag, stile e rendering React/DOM in anteprima e Runtime |
| WCU-FP-02 | Proprietà e tag di interfaccia | PARZIALE | Generazione/autocompletamento da UDT e tipi complessi | Editor tipizzato, mapping PLC, obbligatorietà e controllo compatibilità prima del Runtime |
| WCU-FP-03 | Eventi di interfaccia | PARZIALE | Mapping eventi fra faceplate annidati e firme complete degli oggetti avanzati | Il mini-editor collega i pulsanti a un evento; `Faceplate.RaiseEvent`, binding script, parametri, coda, trace, anteprima e Runtime sono operativi |
| WCU-FP-04 | Tag e script locali | PARZIALE | Timer e moduli con contesto locale persistente completo | Tag locali con start value, stato isolato per istanza e binding visuali rivalutati in anteprima e Runtime esportato |
| WCU-FP-05 | Faceplate annidati | PARZIALE | Eventi annidati e opzioni complete del Faceplate container | Composizione visuale ricorsiva con geometria e mapping di tag/proprietà, compatibilità, versioni rilasciate e rilevamento cicli indiretti |
| WCU-FP-06 | Istanze e sostituzione versione | PARZIALE | Diff, aggiornamento istanze e migrazione proprietà | Release immutabile e creazione della bozza di versione successiva senza sovrascrivere la precedente |
| WCU-FP-07 | Popup faceplate e screen window | PARZIALE | Contesto esatto di `Faceplate.Close`, screen window generiche e opzioni complete del container | Il contenuto del tipo viene renderizzato nel popup; `UI.OpenFaceplateInPopup`/`Faceplate.OpenFaceplateInPopup`, oggetto persistente, interfaccia, geometria, `Visible`, `WindowFlags`, chiusura e anteprima/Runtime sono reali |
| WCU-FP-08 | UDT PLC come interfaccia | DA FARE | Mapping struttura completo | Generazione del contratto dal tipo PLC |

## 6. Controlli Runtime

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-CTL-01 | IO field, symbolic IO, button, radio e slider | PARZIALE | Comportamento Runtime completo e proprietà per target | Simulazione tag e validazione accesso read/write |
| WCU-CTL-02 | Bar, gauge e indicatori | PARZIALE | Scale, segmenti, soglie e formati | Anteprima dati e controllo leggibilità |
| WCU-CTL-03 | Alarm control | PARZIALE | Dati live/storici, toolbar e operazioni | Vista testabile con eventi sintetici tracciati |
| WCU-CTL-04 | Alarm indicator e alarm line | DA FARE | Filtri, contatori e dettaglio | Collegamento immediato alla causa e alla pagina macchina |
| WCU-CTL-05 | Trend control | PARZIALE | Fusi orari, aggregazione per pixel, stampa, profili utente e object model completo | Nove curve online/storiche in quattro aree, zoom rettangolare tempo/valore, sorgenti Runtime dal catalogo, qualità visiva con interruzione dei campioni Bad, campi stabili, assi/soglie, start/stop, righello e CSV; anteprima iframe e Runtime standard |
| WCU-CTL-06 | Function trend control | PARZIALE | Stampa, profili utente, object model completo e limiti dei target Framecraft | Nove curve X/Y scalari o array online/storiche in quattro aree, sorgenti X/Y indipendenti selezionabili a Runtime, zoom rettangolare per area, zoom/pan separati, qualità, tolleranza timestamp, soglie, foreground, righello, intervallo e CSV; Inspector e Runtime standard |
| WCU-CTL-07 | Parameter set control | PARZIALE | Controllo generico e memoria ricette | Form generato dal tipo con validazione immediata |
| WCU-CTL-08 | Data grid/table control | PARZIALE | Binding, colonne, ordinamento e selezione | Colonne tipizzate e grandi dataset virtualizzati |
| WCU-CTL-09 | Web control, HTML e PDF | PARZIALE | iframe reale, policy URL e toolbar | Diagnostica CSP/X-Frame e fallback chiaro |
| WCU-CTL-10 | Custom web controls | PARZIALE | Manifest, proprietà, eventi e packaging | Componenti React installabili con sandbox e versioni |
| WCU-CTL-11 | Configurazioni controllo per utente | DA FARE | Preferenze personali e default globali | Profili esportabili e confrontabili |

## 7. Allarmi

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-ALM-01 | Allarmi discreti e trigger bit/tag | PARZIALE | Editor e runtime completo | Import massivo con collisioni trigger rilevate |
| WCU-ALM-02 | Allarmi analogici e limiti | DA FARE | Soglie, isteresi e stati | Riutilizzo delle soglie tag e simulazione |
| WCU-ALM-03 | Allarmi PLC e multi-instance | DA FARE | Ricezione/struttura dal controller | Collegamento automatico a gerarchia e faceplate |
| WCU-ALM-04 | Classi, priorità, aree e testi | PARZIALE | Editor multilingua e autorizzazioni | Copertura traduzioni e regole di naming |
| WCU-ALM-05 | Active, historical e logged alarms | PARZIALE | Motore runtime e archivio | Timeline unica con stato, ack e causa |
| WCU-ALM-06 | Acknowledge, confirm e shelving | DA FARE | Operazioni singole/multiple con permessi | Motivazione obbligatoria configurabile e audit |
| WCU-ALM-07 | Filtri, ordinamento e statistiche | DA FARE | Query e toolbar del controllo | Filtri salvabili e analisi ricorrenze |
| WCU-ALM-08 | Logging, import/export e CSV | DA FARE | Persistenza e scambio | Export riproducibile con metadati progetto |
| WCU-ALM-09 | Security events | DA FARE | Eventi sicurezza nel controllo allarmi | Correlazione con login, cambi e audit |
| WCU-ALM-10 | Notifica email allarme | DA FARE | Trigger, destinatari e stato invio | Deduplica, escalation e test della regola |

## 8. Parameter set, ricette e formati

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-PAR-01 | Tipi parameter set da tag o UDT | DA FARE | Definizione struttura e versioni | Generazione dal catalogo PLC con diff tipo |
| WCU-PAR-02 | Creazione/modifica/eliminazione ricette | PARZIALE | Memoria generica di parameter set | Validazione campo per campo e undo |
| WCU-PAR-03 | Trasferimento HMI-PLC | PARZIALE | Handshake, errori e trasferimento massivo | Anteprima delle differenze prima di scrivere |
| WCU-PAR-04 | Lettura ricetta dal PLC | DA FARE | Upload e salvataggio come nuovo set | Confronto live tra PLC, ricetta e modifiche operatore |
| WCU-PAR-05 | Import/export TSV | DA FARE | Formato compatibile e gestione versioni | Import con mapping colonne e report errori |
| WCU-PAR-06 | Array e strutture versionate | DA FARE | Migrazione UDT e valori | Migrazione assistita senza perdere campi |
| WCU-PAR-07 | Maschere personalizzate | PARZIALE | Collegamento a un tipo parameter set reale | Form automatico ma completamente personalizzabile |
| WCU-PAR-08 | Audit delle operazioni ricetta | DA FARE | Trail e firme secondo licenza | Diff esatto dei valori prima/dopo |

## 9. Logging, trend, report e audit

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-DAT-01 | Data log e logging tag | PARZIALE | Collegamento al driver/archivio industriale e semantica completa del target | Ciclico, on change e on demand reali nel Runtime locale, configurazione guidata e stima crescita archivio |
| WCU-DAT-02 | Smoothing, aggregation e limits | PARZIALE | Completare le opzioni Unified e l'anteprima visuale della pipeline | Media mobile, media/minimo/massimo a finestra e limiti applicati prima della persistenza |
| WCU-DAT-03 | Storage, segmenti e retention | PARZIALE | Percorsi target, supporti esterni, SQLite/MSSQL, rotazione file e backup | Persistenza locale/sessione, segmentazione temporale, retention e tetto campioni verificati |
| WCU-DAT-04 | Trend da valori correnti e archiviati | PARZIALE | Query avanzate, fusi orari e storico industriale | La stessa penna sceglie Online o Data Log anche a Runtime, con query temporale, qualità visiva e CSV; nessun valore precedente rietichettato dopo un cambio sorgente |
| WCU-DAT-05 | Statistiche trend ed export CSV | PARZIALE | Statistiche complete, deviazione e analisi salvate | Export CSV online/storico con sorgente e quality code; aggregazioni min/max/media disponibili nel Data Log |
| WCU-DAT-06 | Reporting e template Excel | DA FARE | Template, job, dati e generazione | Versionamento template e anteprima con dati di test |
| WCU-DAT-07 | Report pianificati e distribuzione | DA FARE | Scheduler, stampa/email e stato job | Retry controllato e storico consegne |
| WCU-DAT-08 | Audit Trail | DA FARE | Modifiche valori, login, operazioni e tamper indication | Ricerca unificata con oggetto/pagina/tag |
| WCU-DAT-09 | Audit Viewer | DA FARE | Controllo Runtime, filtri ed export | Vista causale prima/dopo invece di solo righe |
| WCU-DAT-10 | Firma elettronica singola/doppia | DA FARE | Flusso secondo licenza Basis/Enhanced | Policy dichiarativa riusabile e testabile |
| WCU-DAT-11 | Backup e restore Audit | DA FARE | Segmenti e integrità | Verifica automatica del ripristino |

## 10. Utenti, ruoli e sicurezza

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-SEC-01 | Login, logout e utente corrente | PARZIALE | Runtime reale e scadenza sessione | Simulazione ruolo/utente senza password reali |
| WCU-SEC-02 | Utenti e gruppi locali | PARZIALE | CRUD, policy password e import/export | Controllo permessi effettivi prima del deploy |
| WCU-SEC-03 | UMC/UMAC centralizzato | ESTERNO | Connessione e mapping gruppi | Diagnostica separata tra rete, identità e autorizzazione |
| WCU-SEC-04 | Ruoli e autorizzazioni oggetto | PARZIALE | Applicazione uniforme a eventi e proprietà | Matrice pagina-azione-ruolo generata automaticamente |
| WCU-SEC-05 | Sessioni e client multipli | PARZIALE | Runtime multi-client e limiti device | Stato sessioni leggibile e testabile |
| WCU-SEC-06 | Conferma operatore e commento | DA FARE | Dialoghi protetti e audit | Regole per rischio invece di flag sparsi |
| WCU-SEC-07 | Comunicazione protetta e certificati | DA FARE | HTTPS, trust e rinnovo | Stato certificati e scadenze nel progetto |
| WCU-SEC-08 | Hardening e security events | DA FARE | Configurazione e monitoraggio | Checklist automatica per target |

## 11. Connettività e architettura Runtime

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-CON-01 | Runtime browser HTML5/SVG/JavaScript | PARZIALE | Packaging e deploy industriale | Sorgente React nativo e anteprima immediata |
| WCU-CON-02 | OPC UA client | DA FARE | Browse, subscription, read/write e certificati | Mapping tipizzato importabile nel catalogo |
| WCU-CON-03 | OPC UA server | DA FARE | Esposizione tag e sicurezza | Contratto pubblicato e test automatico |
| WCU-CON-04 | OPC UA alarms e HistoryRead | DA FARE | Eventi/allarmi e storico | Query unificata live/storico |
| WCU-CON-05 | MQTT provider | PARZIALE | RBAC/audit server, conferma PLC, payload personalizzati, wildcard/array/struct, Last Will e collaudo CPU/broker/trust reale | Editor grafico e guida rapida, cataloghi CAS, driver Node e gateway HTTP/browser; trasporto IR asincrono senza replay/cache ottimistica; ogni tentativo e SUBACK con timeout, rifiuti MQTT 5 distinti da esiti incerti, qualità Bad/scadenze e recupero; diagnostica con rimedi nel pannello standard e log locali ruotati senza segreti/valori; collaudi TCP/HTTP/TLS/mTLS isolati, anteprima senza rete |
| WCU-CON-06 | GraphQL/API aperte | DA FARE | Schema, query, mutazioni e autorizzazioni | Client generato e schema versionato |
| WCU-CON-07 | Custom web control API | DA FARE | Comunicazione proprietà/eventi col Runtime | SDK React e sandbox dei componenti |
| WCU-CON-08 | Client operate/monitor | DA FARE | Accesso remoto e licenze | Sessioni osservabili e permessi espliciti |
| WCU-CON-09 | Redundancy | DA FARE | Nodo partner, failover e sincronizzazione | Prove automatiche di failover |
| WCU-CON-10 | Data Hub e integrazione IT/OT | DA FARE | Modello e connettori supportati | Lineage dal tag PLC al consumatore esterno |
| WCU-CON-11 | Unified Collaboration | DA FARE | Scambio dati tra stazioni | Contratti di condivisione versionati |

## 12. Diagnostica e opzioni avanzate

| ID | Capacità WinCC Unified | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| WCU-DIA-01 | Diagnostica sistema e connessioni | PARZIALE | Dati Runtime reali | Dal sintomo alla pagina/tag/connessione responsabile |
| WCU-DIA-02 | ProDiag | DA FARE | Supervisione PLC e criteri ProDiag | Navigazione automatica al componente coinvolto |
| WCU-DIA-03 | System diagnostics e PLC code viewer | DA FARE | Controlli e dati diagnostici | Contesto PLC/HMI affiancato |
| WCU-DIA-04 | Performance Insight | DA FARE | KPI, aggregazioni e dashboard | KPI come codice con test e versioni |
| WCU-DIA-05 | Plant hierarchy e plant objects | DA FARE | Gerarchia, tipi e istanze | Propagazione controllata di tag, allarmi e trend |
| WCU-DIA-06 | Object/technology-oriented engineering | DA FARE | Modelli tecnologia e controlli | Generazione coerente di pagina, faceplate e diagnostica |
| WCU-DIA-07 | PEA/MTP integration | DA FARE | Tipi e faceplate supportati | Adattatori dichiarativi e compatibilità verificata |
| WCU-DIA-08 | Simulazione HMI senza PLC | FATTO | Estendere ad allarmi, trend, ricette e driver reali | Valori per tag, script sicuri, eventi, errori espliciti e nessuna traccia nel progetto |
| WCU-DIA-09 | Runtime logs e trace | PARZIALE | Persistenza/esportazione, livelli configurabili e sorgenti Runtime/driver reali | Filtri HMI/problemi, ricerca, timestamp al secondo e correlazione evento-tag-navigazione |
| WCU-DIA-10 | Backup, restore e manutenzione Runtime | DA FARE | Progetto, dati, utenti e archivi | Prova di ripristino automatizzata |

## 13. Funzioni oltre WinCC

Queste non sono richieste per la parità: sono ciò che deve rendere Framecraft migliore.

| ID | Funzione Framecraft | Stato |
|---|---|---|
| FC-MORE-01 | Sorgente React/TypeScript leggibile e versionabile | FATTO |
| FC-MORE-02 | Modifica AST conservativa, senza riscrivere espressioni non comprese | FATTO |
| FC-MORE-03 | Copertura automatica delle schermate del progetto standard reale | FATTO |
| FC-MORE-04 | Validazione route, numeri pagina, tag e dinamiche prima dell'avvio | FATTO |
| FC-MORE-05 | Simulatore PLC locale con grafo dipendenze espressioni | PARZIALE |
| FC-MORE-06 | Diff semantico import WinCC JSON -> progetto Framecraft | DA FARE |
| FC-MORE-07 | Impact analysis: tag -> oggetti -> pagine -> comandi/allarmi | DA FARE |
| FC-MORE-08 | Generazione automatica di test dalle regole HMI | DA FARE |
| FC-MORE-09 | Playback sincronizzato di tag, allarmi, audit e navigazione | DA FARE |
| FC-MORE-10 | Libreria componenti installabile con versioni e migrazioni | DA FARE |
| FC-MORE-11 | Sandbox sicura per script e custom control | PARZIALE: script locali e dinamici sicuri; custom control da fare |
| FC-MORE-12 | Controllo accessibilità industriale: contrasto, colore, flashing e target touch | PARZIALE: contrasto del lampeggio, fallback statico e riduzione movimento fatti; audit generale e target touch da fare |
| FC-MORE-13 | Contratto tipizzato PLC/HMI generato da UDT e verificato in CI | DA FARE |
| FC-MORE-14 | Matrice autorizzazioni e interlock generata e revisionabile | DA FARE |
| FC-MORE-15 | Stima prestazioni: tag, cicli, trend, archivi e peso pagina | DA FARE |

## Ordine di implementazione

L'ordine chiude prima le fondamenta condivise; ogni fase aggiorna le righe sopra e `LAVORO.md`.

1. **Espressioni dinamiche reali** — `WCU-DYN-03`, `WCU-DYN-04`, `WCU-DYN-09`, `WCU-DYN-10`. Fatto.
2. **Liste risorse e multilingua live** — `WCU-ENG-10`, `WCU-ENG-11` e `WCU-DYN-05`. Fatto.
3. **Script ed eventi in sandbox** — tranche TagSet, catalogo eventi, moduli globali/locali, `HMIRuntime.Timers` e Scheduler Time/Tags/Calendar/Alarms fatta: IR sicura, Inspector filtrato per tipo, prova locale, ciclo pagina/controlli, tastiera, eventi interfaccia, GestureDetected, Promise/await, QCD, messaggi operatore, qualità simulata, coda eventi, funzioni `Modules`/`Local`, tempo virtuale e Runtime generato. Aggiunti definizioni globali persistenti isolate per pagina/contesto, Scheduler condiviso, cattura inline dei timer, export pubblici live in sola lettura con alias, array/oggetti annidati per riferimento, metodi Array/JSON/Object e dipendenze tag automatiche anche fra inizializzatori di moduli e dopo mutazioni dei dati. Il punto 82 aggiunge get/set grafici comuni, Name readonly, testo senza cancellare icone, layer transitorio composto con dinamiche/lingue e blocco effettivo delle interazioni. Questa tranche non equivale al trasporto di struct/UDT PLC (`WCU-TAG-04`). Restano eventi rari per singolo controllo, object model completo, driver reale, JavaScript oltre il sottoinsieme IR, closure/scoping completi, collegamento al futuro motore allarmi reale e moduli di libreria versionati (`WCU-DYN-06`, `WCU-EVT-01`, `WCU-EVT-04`, `WCU-EVT-05`, `WCU-EVT-06/07/10`).
4. **Flashing accessibile** — dichiarativo e prima tranche script fatti: `item`/`Screen`/`Screen.Items`/`UI.ActiveScreen.Items`/`Faceplate.Items`, `PropertyFlashing` su BackColor/ForeColor/BorderColor, RGB, tre frequenze, colori configurati opzionali e stop per proprietà. Il ponte dell'anteprima e il Runtime generato usano gli stessi helper, anche negli eventi, nelle dinamizzazioni, nei moduli e nei timer; lookup esatto per nome, istanze faceplate isolate e contesti invalidati al cambio pagina. Restano altre proprietà colore specifiche, object model completo, audit generale e target touch (`WCU-DYN-07`, `FC-MORE-12`).
5. **Faceplate veri** — catalogo/versioni, interfacce, mini-editor visuale, istanze standard, binding dinamici, eventi Runtime, tag locali isolati, composizione annidata e contenuto dei popup sono operativi; restano parità completa con l'editor pagine, eventi annidati, opzioni container, contesto esatto di `Faceplate.Close`, UDT e diff/migrazione (`WCU-FP-*`, `WCU-ENG-12`).
6. **Trend control reale** — tempo online/storico e Function Trend X/Y con nove curve, quattro aree, query Data Log, qualità visiva, zoom rettangolare, sorgenti Runtime, assi/soglie e CSV. Restano profili, stampa e object model; nel temporale anche fusi orari e aggregazione per pixel (`WCU-CTL-05/06`).
7. **Logging e archivi** — tranche locale fatta per `WCU-TAG-08` e `WCU-DAT-01/02/03`: restano driver reale, storage industriale/esterno, rotazione, backup e diagnostica spazio.
8. **Allarmi completi** — blocco `WCU-ALM-*`.
9. **Parameter set/ricette** — blocco `WCU-PAR-*`.
10. **Utenti, ruoli e sicurezza** — blocco `WCU-SEC-*`.
11. **Reporting e Audit** — `WCU-DAT-06` fino a `WCU-DAT-11`.
12. **Connettività** — OPC UA, MQTT, GraphQL e custom controls del blocco `WCU-CON-*`.
13. **Diagnostica e opzioni avanzate** — blocco `WCU-DIA-*`.
14. **Strumenti oltre WinCC** — completamento progressivo `FC-MORE-*` durante tutte le fasi.

## Dopo WinCC Unified

L'inventario separato per **FactoryTalk Optix** è già registrato in
[`FACTORYTALK-OPTIX-ROADMAP.md`](FACTORYTALK-OPTIX-ROADMAP.md): usa fonti ufficiali Rockwell,
una matrice di copertura Framecraft e una sequenza progressiva. L'implementazione specifica Optix
inizierà dopo le fasi WinCC; nel frattempo le fondamenta realmente comuni potranno essere riusate.
I contratti Siemens e Rockwell resteranno separati e confluiranno nel nucleo Framecraft soltanto
quando la semantica è equivalente e verificata.

Completate entrambe le piattaforme, l'AI facoltativa descritta in
[`AI-FRAMECRAFT-ROADMAP.md`](AI-FRAMECRAFT-ROADMAP.md) potrà generare la prima versione del pannello
e assistere le modifiche usando le stesse funzioni dell'editor manuale. La parità WinCC non dipende
dalla presenza dell'AI.

Il punto 83 aggiunge Font annidato tipizzato per testo univoco e campi input, anche nei contesti
modulo/timer/Promise, con proprietà e decorazioni reversibili nel ponte e nel Runtime standard.
Restano i Font di Caption/Title/assi, gli altri oggetti annidati e il resto di `WCU-EVT-10`;
non vengono attribuiti namespace alle enumerazioni senza verifica delle firme primarie.

## Fonti ufficiali di riferimento

- [Dinamizzazione delle proprietà](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-dynamization-rt-unified/basics-of-the-dynamization-of-properties-rt-unified)
- [Espressioni dinamiche](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-dynamization-rt-unified/dynamizing-object-properties-rt-unified/dynamizing-an-object-property-via-an-expression-rt-unified/dynamizing-an-object-property-using-an-expression-rt-unified/dynamizing-an-object-property-via-an-expression-rt-unified)
- [Dinamizzazione tramite lista risorse](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-dynamization-rt-unified/dynamizing-object-properties-rt-unified/dynamizing-an-object-property-via-a-resource-list-rt-unified)
- [Dinamizzazione tramite script](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-dynamization-rt-unified/dynamizing-object-properties-rt-unified/dynamizing-an-object-property-via-a-script-rt-unified)
- [Dinamizzazione tramite lampeggio](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-dynamization-rt-unified/dynamizing-object-properties-rt-unified/dynamizing-object-property-via-flashing-rt-unified)
- [Editor dei tipi faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/faceplate-types-editor-rt-unified)
- [Visualizzazione del tipo faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/editing-the-visualization-of-a-faceplate-type-rt-unified)
- [Dinamizzazione del tipo faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/dynamizing-a-faceplate-type-rt-unified)
- [Faceplate container](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/faceplate-container-rt-unified)
- [Tag di interfaccia faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/configuring-tags-in-the-faceplate-type-rt-unified/overview-rt-unified)
- [Proprietà di interfaccia faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/interface-properties-in-faceplates-rt-unified/overview-rt-unified)
- [Eventi di interfaccia faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/interface-events-in-faceplates-rt-unified/configuring-an-interface-event-in-the-faceplate-type-rt-unified)
- [Tag locali faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/editing-faceplates-rt-unified/configuring-tags-in-the-faceplate-type-rt-unified/configuring-local-tags-in-the-faceplate-type-rt-unified)
- [Faceplate annidati](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/using-faceplates-rt-unified/using-a-faceplate-type-in-another-faceplate-type-rt-unified)
- [`UI.OpenFaceplateInPopup`](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/ui.openfaceplateinpopup-rt-unified)
- [Proprietà di Openness per il lampeggio](https://docs.tia.siemens.cloud/r/en-us/v21/functions-for-accessing-the-data-of-an-hmi-unified-device/hmisoftware/screens/dynamization/accessing-flashing-dynamization-properties?contentId=yx7JFxORSyqw7fDcgWsNqw)
- [PropertyFlashing e frequenze Slow/Medium/Fast](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/iofield-rt-unified/iofield.propertyflashing-rt-unified?contentId=eQl1SYc_5BFyg4RZkiutzQ)
- [Button.PropertyFlashing](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.propertyflashing-rt-unified?contentId=qA9rT7zn1t4O5z3dQMlv3Q)
- [Lampeggio in Runtime](https://docs.tia.siemens.cloud/r/en-us/v21/operating-unified-pc-rt-unified/runtime-operation-rt-unified/flashing-rt-unified)
- [Script collegato a un evento](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/scripts-editor-rt-unified/configuring-a-script-to-an-event-rt-unified)
- [Introduzione al Runtime scripting](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/introduction-to-runtime-scripting-rt-unified)
- [Moduli globali](https://docs.tia.siemens.cloud/r/it-it/v21/runtime-scripting-rt-unified/note-sulla-creazione-di-script-rt-unified/moduli-globali-rt-unified)
- [Script locali](https://docs.tia.siemens.cloud/r/es-es/v21/runtime-scripting-rt-unified/notas-sobre-la-creacion-de-scripts-rt-unified/scripts-locales-rt-unified?contentId=p1WZHvJQFZsVBG33O4loTw)
- [Definizioni globali nei contesti locali V21](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/scripts-editor-rt-unified/creating-a-global-definition-in-a-local-script-rt-unified)
- [Script e contesti di esecuzione V21](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/scripts-editor-rt-unified/script-and-execution-context-rt-unified)
- [Oggetto Timers](https://docs.tia.siemens.cloud/r/it-it/v21/modello-a-oggetti-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/timers-rt-unified/descrizione-timers-rt-unified?contentId=rY_Ix2_G818veS7anDuLBQ)
- [Timers.SetInterval](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/timers-rt-unified/timers.setinterval-rt-unified?contentId=eksyB2US2H4zNer_bdNb0g)
- [Timers.SetTimeout](https://docs.tia.siemens.cloud/r/it-it/v21/modello-a-oggetti-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/timers-rt-unified/timers.settimeout-rt-unified?contentId=Jmvr_a5cWX4H~ox6gXsRYw)
- [Timers.ClearInterval](https://docs.tia.siemens.cloud/r/it-it/v21/modello-a-oggetti-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/timers-rt-unified/timers.clearinterval-rt-unified?contentId=oNpaFqFBigTAIoWYk55WtQ)
- [Timers.ClearTimeout](https://docs.tia.siemens.cloud/r/es-es/v21/modelo-de-objetos-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/timers-rt-unified/timers.cleartimeout-rt-unified?contentId=mjQyNOfnUOCIt7n_49XjVQ)
- [Scheduler e operazioni pianificate](https://docs.tia.siemens.cloud/r/en-us/v21/planning-tasks-rt-unified)
- [Fondamenti dello Scheduler V21](https://docs.tia.siemens.cloud/r/en-us/v21/planning-tasks-rt-unified/basics-rt-unified/basic-of-the-scheduler-rt-unified?contentId=FJl637uM5rqYGPLuAO3v2Q)
- [Operazioni con trigger Time](https://docs.tia.siemens.cloud/r/en-us/v21/planning-tasks-rt-unified/creating-tasks-with-the-time-trigger-rt-unified?contentId=K~VMbs4EEMwZYE6Edr8jjQ)
- [Operazioni con trigger Tag](https://docs.tia.siemens.cloud/r/en-us/v20/planning-tasks-rt-unified/creating-tasks-with-the-tags-trigger-rt-unified)
- [Operazioni con trigger Alarms](https://docs.tia.siemens.cloud/r/en-us/v21/planning-tasks-rt-unified/creating-tasks-with-the-alarms-trigger-rt-unified?contentId=~NOGv5KMTN4YGHBmpL34gg)
- [Priorità degli allarmi 0-16](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/configuring-alarms-rt-unified/configuring-analog-alarms-rt-unified/configuring-analog-alarms-rt-unified)
- [Eventi del Button](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/description-button-rt-unified)
- [Eventi della Screen](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/ui.activescreen-rt-unified/screen-rt-unified/description-screen-rt-unified)
- [Eventi del CustomWebControlContainer](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/customwebcontrolcontainer-rt-unified/description-customwebcontrolcontainer-rt-unified)
- [Evento GestureDetected e quattro swipe](https://docs.tia.siemens.cloud/r/it-it/v21/progettazione-di-pagine-rt-unified/generazione-di-eventi-rt-unified/generazione-dell-evento-il-gesto-e-stato-definito-rt-unified)
- [Liste di testi](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-text-lists-and-graphics-lists-rt-unified/configuring-text-lists-rt-unified/basics-of-text-lists-rt-unified)
- [Lingue Runtime](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-rt-unified/configuring-in-multiple-languages-rt-unified/languages-in-wincc-rt-unified)
- [Trend control](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/trend-control-rt-unified)
- [Valori tag come trend e limite di nove curve](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/displaying-tags-rt-unified/basics-rt-unified/outputting-tag-values-as-trends-rt-unified)
- [Modalità punti, interpolata, gradini e valori](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/displaying-tags-rt-unified/basics-rt-unified/representing-trend-directions-rt-unified)
- [Proprietà del Trend Control](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/reference-of-the-screen-objects-rt-unified/controls-rt-unified/trend-control-rt-unified)
- [Aggregazione dei valori](https://docs.tia.siemens.cloud/r/en-us/v21/operating-unified-pc-rt-unified/controls-rt-unified/displaying-tags-in-runtime-rt-unified/trend-control-rt-unified/value-aggregation-rt-unified)
- [Parameter control](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-parameter-sets-rt-unified/basics-rt-unified/basics-of-parameter-control-rt-unified)
- [Allarmi](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified)
- [Faceplate](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-faceplates-rt-unified/example-creating-and-using-faceplates-rt-unified/example-configuring-faceplates-rt-unified)
- [TagSet](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/description-tagset-rt-unified)
- [Creazione di un TagSet](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tags.createtagset-rt-unified)
- [Lettura sincrona TagSet](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.read-rt-unified)
- [Scrittura sincrona TagSet](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.write-rt-unified)
- [Lettura asincrona TagSet](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.readasync-rt-unified)
- [Scrittura asincrona TagSet](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.writeasync-rt-unified)
- [Aggiunta di tag a un TagSet](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.add-rt-unified)
- [Rimozione di tag da un TagSet](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.remove-rt-unified)
- [Svuotamento di un TagSet](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.clear-rt-unified)
- [ReadMaxAge](https://docs.tia.siemens.cloud/r/it-it/v21/modello-a-oggetti-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.readmaxage-rt-unified)
- [WriteQCD di un TagSet](https://docs.tia.siemens.cloud/r/es-es/v20/modelo-de-objetos-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.writeqcd-rt-unified)
- [WriteAsyncQCD di un TagSet](https://docs.tia.siemens.cloud/r/it-it/v21/modello-a-oggetti-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.writeasyncqcd-rt-unified)
- [WriteQCD di un tag](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tag-rt-unified/tag.writeqcd-rt-unified)
- [Messaggio operatore TagSet](https://docs.tia.siemens.cloud/r/it-it/v21/modello-a-oggetti-javascript-wincc-unified-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.writewithoperatormessage-rt-unified)
- [Messaggio operatore singolo tag](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tag-rt-unified/tag.writewithoperatormessage-rt-unified)
- [QualityCode di un tag](https://docs.tia.siemens.cloud/r/de-de/v21/wincc-unified-javascript-objektmodell-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tag-rt-unified/tag.qualitycode-rt-unified)
- [TimeStamp di un tag](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tag-rt-unified/tag.timestamp-rt-unified)
- [Note Siemens su hmiReadType e hmiWriteType](https://docs.tia.siemens.cloud/r/en-us/v20-updates/tia-portal-updates-readme/improvements-in-wincc-unified/important-notes)
- [Logging tag](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/logging-tags-rt-unified/basics-rt-unified/logging-modes-and-logging-process-rt-unified)
- [Custom web controls](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/my-controls-rt-unified/using-custom-web-controls-rt-unified)
- [Connettività V21](https://docs.tia.siemens.cloud/r/en-us/v21/what-s-new-in-tia-portal/what-s-new-in-v21/simatic-wincc-unified/connectivity)
- [Audit](https://docs.tia.siemens.cloud/r/en-us/v21/installation/licensing/licensing-of-wincc-unified-options/audit)
