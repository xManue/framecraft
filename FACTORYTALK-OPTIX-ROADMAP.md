# Framecraft verso FactoryTalk Optix e oltre

Aggiornato al 24 settembre 2026. Baseline funzionale: documentazione ufficiale FactoryTalk Optix
1.7.x e pagine `current` di Rockwell Automation.

Aggiornamento implementativo 20 ottobre 2026: schemi ricetta riletti nella guida `current`, che
ora si presenta come 1.8.0. L’inventario restante non è stato rivalutato integralmente per 1.8.0.

Aggiornamento mirato 21 ottobre 2026: nucleo comune di consultazione del registro attività
Framecraft (LAVORO 159). Non importa oggetti Optix e non completa l’Event Logger generico.

21 ottobre 2026: import/export ricette Framecraft JSON con confronto, capacità server dedicata,
ACL schema e commit atomico (LAVORO 160). Non è il CSV/NetLogic RecipeImportExport Optix.

21 ottobre 2026: storico allarmi Framecraft SQLite e controllo di sola lettura con capacità dedicata
(LAVORO 161), confrontati con Alarm Event Logger nella guida `current` (1.8.0), non parità completa.

22 ottobre 2026: confronti analogici e soglia variabile nel nucleo Framecraft (LAVORO 162).
Riletto Limit alarm 1.3.2: livelli esclusivi/non esclusivi e tipi Optix restano separati e aperti.

22 ottobre 2026: lettura/confronto dei parametri dalla cache MQTT/OPC UA e nuova bozza ricetta
(LAVORO 163), confrontati con Recipes editor `current` (1.8.0). Apply non implementato:
obbligatoria conferma del programma PLC correlata alla richiesta, mai ACK del driver.

Questa roadmap registra fin da ora tutto ciò che Framecraft dovrà coprire dopo la roadmap WinCC
Unified. I contratti Rockwell restano separati da quelli Siemens: il nucleo comune viene riusato
solo quando il comportamento è realmente equivalente. Un componente React simile a un oggetto
Optix non dimostra la parità; servono modello persistente, comportamento Runtime, diagnostica,
compatibilità del target e test.

## Stato

**Perimetro aggiornato al 30 settembre 2026**: il target è Framecraft autonomo con OPC UA/MQTT,
anche verso PLC virtuali; non Optix Runtime o Studio 5000. Si riproducono capacità funzionali e
information model utili, non formati, licenze o deployment proprietari obbligatori. Gli import
vendor restano migrazioni facoltative. Vedere ARCHITETTURA-HMI.md.

- `FATTO`: comportamento reale presente e coperto da test.
- `PARZIALE`: esiste una base Framecraft utilizzabile, ma non la semantica completa Optix.
- `DA FARE`: non implementato.
- `ESTERNO`: richiede Runtime, controller, infrastruttura o entitlement esterni; Framecraft deve
  comunque configurarlo e validarlo senza simulare risultati inventati.
- `RIFERIMENTO`: capacità vendor, non obbligatoria per l'HMI autonomo.

L'inventario è organizzato per famiglie funzionali. Proprietà, metodi ed eventi dei singoli tipi
verranno aggiunti al contratto della famiglia quando essa entra in implementazione.

## 1. Progetto, sorgente e distribuzione

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-PRJ-01 | Creazione, apertura e salvataggio progetto | FATTO | Importare un progetto Optix reale | Un progetto leggibile anche fuori dall'IDE |
| FTX-PRJ-02 | Formato sorgente `.optix`/YAML, cartelle `Nodes` e `ProjectFiles` | RIFERIMENTO | Import vendor facoltativo, round-trip non richiesto | Formato Framecraft leggibile e diff semantico per nodo |
| FTX-PRJ-03 | Archivio progetto e pacchetto trasferibile | DA FARE | Pacchetto autonomo Framecraft, non archivio Optix Studio | Manifest, checksum e configurazione Runtime senza segreti |
| FTX-PRJ-04 | Version control e collaborazione Git | PARZIALE | Strategie di merge per YAML e identificatori Optix | Conflitti spiegati come proprietà, link o figli concorrenti |
| FTX-PRJ-05 | Compilazione, deploy, avvio e arresto applicazione | PARZIALE | Pipeline Optix/Application Update reale | Preflight unico per target, dipendenze e incompatibilità |
| FTX-PRJ-06 | Target Windows, Linux e dispositivi OptixPanel | DA FARE | Profili, capacità e limiti per target | Matrice di compatibilità aggiornata prima del deploy |
| FTX-PRJ-07 | Entitlement a feature token e capacità Runtime | RIFERIMENTO | Token Optix non richiesti per Framecraft | Capacità e limiti reali del proprio Runtime dichiarati |
| FTX-PRJ-08 | Moduli NuGet, dipendenze .NET e assembly | RIFERIMENTO | Infrastruttura .NET Optix non richiesta | SBOM, versioni e diagnostica delle dipendenze Framecraft |
| FTX-PRJ-09 | File di progetto, certificati e PKI | DA FARE | Cartelle e riferimenti coerenti col formato Optix | Scadenze e dipendenze certificate visibili nel progetto |
| FTX-PRJ-10 | Firma e verifica dei file applicativi | DA FARE | Configurazione e verifica Runtime | Report di integrità ripetibile in CI |

## 2. Information Model e nodi

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-MDL-01 | Albero dei nodi di progetto | PARZIALE | Tipi, istanze, proprietà, variabili e metodi Optix | Esploratore con dipendenze e riferimenti entranti/uscenti |
| FTX-MDL-02 | ObjectType, VariableType e istanziazione | DA FARE | Ereditarietà, override e valori predefiniti | Diff tra tipo e istanza con migrazione guidata |
| FTX-MDL-03 | NodeId, BrowseName e BrowsePath | DA FARE | Identità persistenti e risoluzione compatibile | Rilevamento collisioni e rinomina sicura dei riferimenti |
| FTX-MDL-04 | ObjectPointer e NodePointer | DA FARE | Riferimenti tipizzati a oggetti e nodi | Anteprima della destinazione e controllo dei riferimenti rotti |
| FTX-MDL-05 | Alias e alias relativi | DA FARE | Contesto, risoluzione e ciclo di vita | Percorso visuale e rilevamento automatico dei cicli |
| FTX-MDL-06 | Extended properties e metadati | DA FARE | Persistenza e accesso Runtime | Schema dichiarato e validazione centralizzata |
| FTX-MDL-07 | Metodi esposti dai nodi | PARZIALE | Firma, argomenti, risultato e invocazione Optix | Builder tipizzato e test del metodo senza stringhe fragili |
| FTX-MDL-08 | Eventi e EventHandler | PARZIALE | Eventi Optix, filtri e catene di metodi | Traccia visuale emittente -> handler -> effetto |
| FTX-MDL-09 | Cartelle, organizzazione e ricerca nodi | PARZIALE | Query e navigazione dell'intero information model | Ricerca per tipo, dipendenza, sicurezza e origine dati |

## 3. Interfaccia, grafica e navigazione

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-UI-01 | Oggetti grafici base, contenitori e layout | PARZIALE | Proprietà e comportamenti di tutti i tipi UI Optix | Inspector filtrato per proprietà realmente applicabili |
| FTX-UI-02 | Pannelli, finestre e navigazione | PARZIALE | PanelLoader, NavigationPanel e finestre Optix | Destinazioni controllate e cronologia navigazione ispezionabile |
| FTX-UI-03 | Responsive layout, ancoraggi e allineamenti | PARZIALE | Layout engine nativo e web | Avvisi su overflow, touch target e risoluzioni target |
| FTX-UI-04 | Stili, stylesheet e temi | PARZIALE | Modello StyleSheet Optix e selezione per engine | Token condivisi con controllo contrasto automatico |
| FTX-UI-05 | Immagini, SVG, video, PDF e WebBrowser | PARZIALE | Proprietà media e policy Runtime | Dipendenze asset, CSP e fallback controllati |
| FTX-UI-06 | DataGrid, ListBox, ComboBox e controlli dati | PARZIALE | Binding a store/query e interazioni Optix | Colonne tipizzate, virtualizzazione e carico stimato |
| FTX-UI-07 | Trend real-time, storico e da database | DA FARE | Penne, assi, soglie, query, Normal/Trace/Range | Playback sincronizzato con allarmi, eventi e audit |
| FTX-UI-08 | Widget e librerie riusabili | PARZIALE | Packaging, dipendenze e semantica delle istanze/widget Optix | Base Framecraft: catalogo faceplate versionato, diff e migrazione assistita di tag/proprietà/eventi con undo (LAVORO 104); non equivale ancora a ObjectType/ereditarietà Optix |
| FTX-UI-09 | Finestre modali e popup parametrizzati | PARZIALE | Alias di contesto, ciclo vita e risultati | Anteprima nello stesso editor con istanze reali |
| FTX-UI-10 | Localizzazione e Localization Dictionary | PARZIALE | Import/export e semantica delle LocalizedText Optix | Copertura, fallback e cambio lingua live già centrali |
| FTX-UI-11 | Traduzione Runtime per sessione | PARZIALE | Locale indipendente per ogni sessione | Simulazione multi-sessione affiancata |
| FTX-UI-12 | AutomationId per test end-to-end | DA FARE | Generazione stabile e propagazione al DOM | Test generati dal progetto con selettori resistenti alle rinomine |

## 4. Dynamic Link, converter ed espressioni

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-LNK-01 | Dynamic Link Read, Write e ReadWrite | PARZIALE | Direzione, modalità e comportamento Optix | Flusso dati mostrato graficamente e scritture tracciate |
| FTX-LNK-02 | Link a variabili, proprietà e array | PARZIALE | Array, membri e riferimenti Optix completi | Binding tipizzato e incompatibilità impedite prima del Runtime |
| FTX-LNK-03 | Link complessi tramite converter | PARZIALE | Albero converter compatibile | Preview istantanea per ogni valore di prova |
| FTX-LNK-04 | ExpressionEvaluator | PARZIALE | Sintassi, tipi e funzioni Optix | Parser sicuro, grafo dipendenze ed errori in linea |
| FTX-LNK-05 | StringFormatter | DA FARE | Placeholder e formattazione localizzata | Esempi live con locale, unità e valori limite |
| FTX-LNK-06 | ValueMap/KeyValueConverter | PARZIALE | Regole, default e direzione inversa | Ambiguità e intervalli sovrapposti segnalati |
| FTX-LNK-07 | EngineeringUnitConverter | DA FARE | Scala, unità e formati | Conversioni verificate e unità propagate ai controlli |
| FTX-LNK-08 | ConditionalConverter e converter concatenati | PARZIALE | Composizione e precedenza Optix | Pipeline visuale con test automatici delle diramazioni |
| FTX-LNK-09 | Aggiornamento e ottimizzazione link/tag visibili | DA FARE | Politica active-view e frequenze | Stima carico e sospensione trasparente delle dipendenze inutilizzate |
| FTX-LNK-10 | Diagnostica dei link non risolti | PARZIALE | BrowsePath, alias e errori Optix | Dal link rotto direttamente alla causa e alla correzione |

## 5. Variabili, driver e dati del controller

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-TAG-01 | Variabili interne e controller tags | PARZIALE | Tipi e origine secondo information model | Provenienza, qualità e permesso read/write sempre visibili |
| FTX-TAG-02 | Driver di comunicazione e Station | ESTERNO | Configurazione dei driver Rockwell e terzi supportati | Contratto verificabile anche senza controller collegato |
| FTX-TAG-03 | Import tag e tipi online/offline | PARZIALE | Import dai controller e file supportati da Optix | Diff del controller e aggiornamento selettivo dei binding |
| FTX-TAG-04 | Sincronizzazione read/write e polling time | DA FARE | Cicli, errori e timeout del driver | Budget prestazioni e raggruppamento automatico delle letture |
| FTX-TAG-05 | Array, strutture e tipi controller | PARZIALE | Mapping completo e aggiornamento schema | Contratto PLC/HMI generato e verificato in CI |
| FTX-TAG-06 | Qualità, timestamp e stato connessione | DA FARE | Stati Runtime reali | Zero distinto da stale/bad e timeline delle disconnessioni |
| FTX-TAG-07 | Retentivity di nodi e variabili | DA FARE | Store, avvio, arresto e policy supportate | Anteprima dei dati conservati e migrazione di versione |
| FTX-TAG-08 | Limiti, unità ingegneristiche e range | PARZIALE | Metadati Optix e propagazione | Una sola definizione riusata da IO, trend, allarmi e ricette |
| FTX-TAG-09 | Scritture massive e transazioni logiche | DA FARE | Metodi Runtime e gestione risultati | Diff e conferma prima della scrittura al controller |

## 6. NetLogic, metodi ed estensibilità

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-LOG-01 | Runtime NetLogic C# | DA FARE | File, lifecycle, API e collegamento al nodo | Sandbox, analyzer e dipendenze dichiarate |
| FTX-LOG-02 | Design-time NetLogic C# | DA FARE | Esecuzione nell'IDE e modifica progetto | Dry-run, diff delle modifiche e undo unico |
| FTX-LOG-03 | Metodi NetLogic esposti al progetto | DA FARE | Attributi, argomenti e invocazione | Contratto tipizzato generato per editor e test |
| FTX-LOG-04 | PeriodicTask, DelayedTask e LongRunningTask | DA FARE | Scheduler e cancellazione | Tempo virtuale, timeout e stato ispezionabile |
| FTX-LOG-05 | Runtime UI logic e session context | DA FARE | Owner, sessione e thread UI | Separazione esplicita tra stato globale e stato sessione |
| FTX-LOG-06 | Librerie C# e servizi personalizzati | DA FARE | Packaging e caricamento sicuro | Scansione sicurezza, compatibilità e consumo risorse |
| FTX-LOG-07 | Diagnostica, log e gestione eccezioni | DA FARE | Log Runtime e stack reali | Stack collegato al nodo, evento e valore coinvolti |

## 7. Sessioni e Presentation Engine

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-SES-01 | Sessione indipendente per client | DA FARE | User, locale, stato e lifecycle per sessione | Simulatore multi-client nello stesso editor |
| FTX-SES-02 | Native Presentation Engine | DA FARE | Start window, login, stylesheet e polling | Profilo panel riproducibile e confronto target |
| FTX-SES-03 | Web Presentation Engine | PARZIALE | HTTPS, certificati, fonti remote/locali e limiti client | Test CSP/TLS, carico concorrente e accessibilità web |
| FTX-SES-04 | Login window e cambio utente | PARZIALE | Metodi e stato sessione Optix | Matrice permessi verificabile con utenti simulati |
| FTX-SES-05 | Locale, timezone e unit system per sessione | PARZIALE | Proprietà e persistenza Optix | Preview simultanea di lingua, fuso e formato |
| FTX-SES-06 | Numero massimo client e politiche di connessione | DA FARE | Limiti Runtime/entitlement | Stima risorse e test di concorrenza prima del deploy |

## 8. Allarmi ed eventi

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-ALM-01 | Digital, ExclusiveLevel e NonExclusiveLevel Alarm | PARZIALE | Tipi/stati Optix e livelli multipli esclusivi/non esclusivi, deadband specifica del tipo | Motore scalare Framecraft con bit e sei confronti, soglia fissa/PLC, isteresi, qualità delle dipendenze e prova; non importa né emula l’oggetto Optix (106/162) |
| FTX-ALM-02 | Tipi allarme personalizzati | DA FARE | Ereditarietà e proprietà estese | Diff del tipo e migrazione delle istanze |
| FTX-ALM-03 | Stato active, acknowledged e confirmed | PARZIALE | Tipi/condizioni/metodi Optix completi e ack al PLC | Motore scalare Framecraft e metodi singoli con identità server; transizioni storiche salvate, stato attuale separato (106/161) |
| FTX-ALM-04 | AlarmGrid, AlarmWidget e filtri | PARZIALE | Query, toolbar, selezione e operazioni | Filtri salvabili e collegamento alla causa macchina |
| FTX-ALM-05 | Storico allarmi e Event Logger | PARZIALE | Logger e tipi Optix generici, multilingua, correlazione e manutenzione industriali | Eventi persistenti con avvii/occorrenze e consultazione protetta (161); CSV multi-pagina dei risultati filtrati, ancorato ad archivio/sequenza con riepilogo e annullamento, senza SQL libero o replay (167) |
| FTX-ALM-06 | Import allarmi OPC UA | DA FARE | Tipi, condizioni e mapping OPC UA | Anteprima collisioni e normalizzazione controllata |
| FTX-ALM-07 | Polling e aggiornamento allarmi | DA FARE | Frequenze e prestazioni Runtime | Carico stimato e diagnostica dei ritardi |
| FTX-ALM-08 | Eventi progetto nel logger | DA FARE | Selezione eventi e campi | Schema evento esplicito e query generate |

## 9. Ricette e parameter set

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-RCP-01 | Recipe schema object-aware | DA FARE | Catalogo scalare Framecraft v1 al punto 144, non TargetNode/Item/DataItem o UDT | Generazione dal tipo con diff tra revisioni |
| FTX-RCP-02 | Configurator e anteprima schema | PARZIALE | Editor iniziale scalare condiviso tra progetto e wizard (145/150), con bozza e approvazione; non selezione TargetNode/Item/DataItem Optix | Impatto visibile prima di cambiare lo schema |
| FTX-RCP-03 | Store, edit, delete e rename ricetta | PARZIALE | Servizio e configurazione iniziale (144–150), form Runtime scalare (151) con conferme, conflitti e marker; account locali server (152), ACL per ricetta e collaudo produzione restano gate | Undo e validazione campo per campo |
| FTX-RCP-04 | Load/apply da e verso controller | PARZIALE | Migrazione/restore, adapter CPU, confronto target coordinato, UDT/array e collaudo industriale | Lettura scalare (163), backend confermato (164), configurazione grafica (165), comando HMI con revisione/conferma e recupero vincolato al ledger senza replay (166) |
| FTX-RCP-05 | Recipe editor e Recipe application example | PARZIALE | Widget archivio dagli schemi, pagina guidata e palette (151), login server locale nel launcher (152); nessun TargetNode/Item/DataItem o trasferimento PLC | Form generato ma completamente personalizzabile |
| FTX-RCP-06 | Ricette concorrenti e metadati | PARZIALE | Revisione contenuto, lock esclusivo e ultime 256 ricevute persistenti con soggetto/data al punto 144 | Merge guidato e storico delle revisioni completo |
| FTX-RCP-07 | Tabelle database delle ricette | DA FARE | Schema store e query | Migrazione dati testata insieme al progetto |
| FTX-RCP-08 | Import/export delle ricette | PARZIALE | CSV, mapping colonne, UDT e migrazione fra schemi; nessuna compatibilità Optix dichiarata | File Framecraft JSON v1, anteprima ID/valori, merge atomico senza eliminazioni, revisione/permessi/ACL e audit di gruppo (160) |

## 10. Logger, database, trend e report

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-DAT-01 | Data Logger periodico e on-demand | DA FARE | Sampling, deadband, store e lifecycle | Stima crescita e perdita dati prima del deploy |
| FTX-DAT-02 | Event Logger | PARZIALE | Tipi evento/campi/sorgenti generici, store e correlazione completa | Registro Runtime SQLite e vista HMI protetta con filtri/pagine per le operazioni Framecraft supportate, non Event Logger Optix generico (155/159) |
| FTX-DAT-03 | Embedded Database SQLite | PARZIALE | Store/tabelle/query generici, migrazioni, retention e backup/restore verificati | Store applicativi fissi per audit e allarmi; nessuna query SQL arbitraria esposta nel pannello (155/161) |
| FTX-DAT-04 | Database ODBC | ESTERNO | Connessione, credenziali, schema e query | Test di compatibilità e segreti mai salvati nel progetto |
| FTX-DAT-05 | InfluxDB | ESTERNO | Connessione e mapping time-series | Stima cardinalità, retention e costi di storage |
| FTX-DAT-06 | SQL query e binding ai controlli | DA FARE | SelectQuery e comportamento Runtime | Builder parametrico e protezione da query fragili |
| FTX-DAT-07 | Trend real-time e storico | DA FARE | Penne, assi, modalità e interazione | Playback sincronizzato e confronto periodi |
| FTX-DAT-08 | Trend da query database | DA FARE | Modello SQL e refresh | Costo query e volume dati visualizzati prima dell'esecuzione |
| FTX-DAT-09 | Report PDF localizzati | DA FARE | Header, section, footer, GeneratePdf ed evento | Preview fedele, test visuale e accessibilità PDF |
| FTX-DAT-10 | Export dati e report pianificati | PARZIALE | Export generici, metodi/file system server, scheduler, checksum e retention | Export manuale dello storico allarmi in CSV e dettagli JSON, download esplicito e nessun file parziale (167); non un Generic Table Exporter Optix |
| FTX-DAT-11 | Manutenzione store e retention | DA FARE | Rotazione, purge e limiti | Allarme predittivo su spazio e prova di restore |

## 11. Utenti, sicurezza e audit

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-SEC-01 | Utenti, gruppi e ruoli | PARZIALE | Modello Optix, membership e riferimenti | Matrice persona -> ruolo -> nodo -> operazione |
| FTX-SEC-02 | Permessi read, write e browse | PARZIALE | ACL read/browse/per-record e modello informativo completo | Limiti server per comandi su tag/allarmi/schemi, GUI/CLI con conferma e backup (154); capacità generali sempre necessarie |
| FTX-SEC-03 | Visibilità e abilitazione per gruppo/ruolo | PARZIALE | Gruppi e modello Optix, ACL per oggetto | Permessi grafici dal profilo server, separati dalle capacità dei comandi (152) |
| FTX-SEC-04 | Model authentication locale | PARZIALE | Modello Optix, amministrazione remota, audit e collaudo target | Account locali Framecraft espliciti, CLI/GUI locale, scrypt, cookie/CSRF, scadenza e revoca senza PIN browser (152–153) |
| FTX-SEC-05 | Domain authentication AD/LDAP | ESTERNO | Provider, mapping gruppi e target supportati | Verifica configurazione senza conservare credenziali |
| FTX-SEC-06 | OAuth2 con PKCE | ESTERNO | Provider e flusso supportato | Checklist redirect, scope e scadenze token |
| FTX-SEC-07 | Audit signing e firme operatore | DA FARE | Workflow, motivo e entitlement | Diff esatto prima/dopo e prova non ripudiabile |
| FTX-SEC-08 | Document signature e file verification | DA FARE | Certificati, firme e Runtime | Catena di fiducia e scadenze visibili |
| FTX-SEC-09 | Security events e tentativi accesso | PARZIALE | Copertura amministrazione/trasporto, firme, export/offline e conservazione target | Audit SQLite, CLI e vista HMI con audit.read, identità server, risorsa/traccia/esito e filtri; rifiuto prima del comando se il log non è disponibile (155/159) |
| FTX-SEC-10 | Segreti e certificati | DA FARE | Store sicuro e deploy | Nessun segreto nel repository, rotazione guidata |

## 12. OPC UA, MQTT, FTP e IoT

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-CON-01 | OPC UA Client | PARZIALE | Selettore/import grafico, array/UDT, metodi, eventi/allarmi e collaudo CPU | Driver scalare e gateway senza replay; browse/CLI read-only con pagine revisionate, Namespace URI/NodeId, tipo/rank/accesso e trust invariato, senza importazioni o comandi impliciti (168) |
| FTX-CON-02 | OPC UA Server | ESTERNO | Endpoint, nodi pubblicati, sampling e array | Superficie esposta revisionabile e test interoperabilità |
| FTX-CON-03 | OPC UA security mode, policy e X509 | PARZIALE | Gestione guidata PKI/rinnovo, trust aziendali e collaudo CPU | Mode/policy espliciti, policy SHA1 escluse, trust reciproco non automatico, hostname/URI/validità/chiave e accesso verificati, errori con rimedi |
| FTX-CON-04 | Configurazione dinamica OPC UA | DA FARE | Nodi e metodi Runtime previsti | Validazione transazionale e rollback |
| FTX-CON-05 | MQTT Client publisher/subscriber | PARZIALE | Payload avanzati, Last Will, array/wildcard, parità MQTT 5 completa, conferme PLC, RBAC/audit server e collaudo CPU/broker/trust reale | Editor connessioni e mini guida, servizio Node/gateway HTTP, trasporto asincrono IR evento/moduli/timer/Scheduler; timeout a ogni tentativo/SUBACK, rifiuti e incertezza distinti, diagnostica con rimedi e log locali ruotati; collaudi TCP/HTTP/TLS/mTLS isolati; nessun replay, aggiornamento ottimistico o falsa conferma PLC |
| FTX-CON-06 | Payload MQTT JSON o testo personalizzato | DA FARE | Formatter e mapping variabili | Schema JSON, esempio live e compatibilità versioni |
| FTX-CON-07 | MQTT Azure connector | ESTERNO | Autenticazione, certificati e proprietà Azure | Diagnostica connessione e scadenza credenziali |
| FTX-CON-08 | FTP client/server e trasferimento file | ESTERNO | Configurazione, permessi e lifecycle | Allowlist percorsi, checksum e audit trasferimenti |
| FTX-CON-09 | IoT e servizi cloud supportati | ESTERNO | Connettori e contratti ufficiali per target | Adapter isolati e test con endpoint simulati |
| FTX-CON-10 | Remote data e fonti web | ESTERNO | Policy rete e Presentation Engine | Inventario dipendenze esterne e modalità offline |

## 13. Diagnostica, test e manutenzione

| ID | Capacità FactoryTalk Optix | Stato Framecraft | Parità da completare | Miglioramento Framecraft |
|---|---|---|---|---|
| FTX-DIA-01 | Application log e diagnostica Runtime | PARZIALE | Sorgenti e livelli Optix | Dal messaggio al nodo, link, evento e valore responsabile |
| FTX-DIA-02 | Diagnostica driver e connessioni | DA FARE | Stato Station, errori e retry | Timeline della connessione e causa leggibile |
| FTX-DIA-03 | Validazione progetto prima del deploy | PARZIALE | Regole complete Optix e target | Errori riproducibili in CI senza aprire l'IDE |
| FTX-DIA-04 | Test E2E tramite AutomationId | DA FARE | Selettori e sessione web | Test generati da navigazione, permessi e flussi configurati |
| FTX-DIA-05 | Simulazione senza controller | PARZIALE | Link, sessioni, allarmi, ricette e logger Optix | Scenari deterministici versionati nel progetto |
| FTX-DIA-06 | Backup, restore e aggiornamento applicazione | DA FARE | Progetto, dati persistenti, certificati e utenti | Prova di ripristino automatizzata |
| FTX-DIA-07 | Analisi prestazioni | DA FARE | Link, polling, query, client, logger e grafica | Budget live e regressioni bloccate in CI |
| FTX-DIA-08 | Matrice compatibilità versione/target | DA FARE | Optix Studio, Runtime, OS e moduli | Upgrade assistant con diff delle incompatibilità |

## 14. Funzioni oltre FactoryTalk Optix

Queste capacità non sono semplice parità: rendono Framecraft più verificabile e più rapido.

| ID | Funzione Framecraft | Stato |
|---|---|---|
| FC-OPT-MORE-01 | Un solo grafo tipizzato per nodi, link, alias, eventi e sicurezza | DA FARE |
| FC-OPT-MORE-02 | Diff semantico dei sorgenti Optix e migrazione assistita | DA FARE |
| FC-OPT-MORE-03 | Simulazione affiancata di più sessioni, ruoli, lingue e target | DA FARE |
| FC-OPT-MORE-04 | Budget live di feature token e compatibilità target | DA FARE |
| FC-OPT-MORE-05 | Impact analysis controller tag -> link -> UI/logger/allarme/ricetta | DA FARE |
| FC-OPT-MORE-06 | Test automatici generati con AutomationId stabili | DA FARE |
| FC-OPT-MORE-07 | Static analysis e sandbox per Runtime/Design-time NetLogic | DA FARE |
| FC-OPT-MORE-08 | Diff ricetta-controller prima di ogni apply | PARZIALE: confronto cache PLC/archivio al punto 163; apply e riconferma valori target restano aperti |
| FC-OPT-MORE-09 | Playback sincronizzato di tag, allarmi, audit e sessioni | DA FARE |
| FC-OPT-MORE-10 | Stima query, storage, retention e carico client | DA FARE |
| FC-OPT-MORE-11 | Scadenza e trust di tutti i certificati in una sola vista | DA FARE |
| FC-OPT-MORE-12 | Import WinCC e Optix separati ma normalizzati nel nucleo comune | DA FARE |

## Ordine di implementazione

L'inventario Optix è già aperto, ma le funzioni specifiche Rockwell iniziano dopo il completamento
della roadmap WinCC. Le fondamenta davvero comuni migliorano entrambi i percorsi mentre vengono
costruite; nessun contratto viene dichiarato equivalente solo perché ha un nome simile.

1. **Information model Framecraft** — `FTX-MDL-01/02/03/04/05`; import `FTX-PRJ-02` facoltativo, non un prerequisito.
2. **Dynamic Link e converter** — blocco `FTX-LNK-*`.
3. **Sessioni e Presentation Engine** — blocco `FTX-SES-*` e localizzazione `FTX-UI-10/11`.
4. **Driver, controller tag e retentivity** — blocco `FTX-TAG-*`.
5. **NetLogic C#** — blocco `FTX-LOG-*`.
6. **Widget, librerie e UI avanzata** — `FTX-UI-01` fino a `FTX-UI-09`.
7. **Allarmi** — blocco `FTX-ALM-*`.
8. **Ricette** — blocco `FTX-RCP-*`.
9. **Logger, database, trend e report** — blocco `FTX-DAT-*`.
10. **Utenti, autenticazione, audit e firme** — blocco `FTX-SEC-*`.
11. **OPC UA, MQTT, FTP e IoT** — blocco `FTX-CON-*`.
12. **Deploy autonomo, diagnostica e manutenzione** — `FTX-PRJ-05/06` e `FTX-DIA-*`; gli entitlement Optix non si applicano.
13. **Funzioni oltre Optix** — completamento progressivo `FC-OPT-MORE-*`.

Dopo la parità delle due piattaforme, l'AI facoltativa descritta in
[`AI-FRAMECRAFT-ROADMAP.md`](AI-FRAMECRAFT-ROADMAP.md) potrà generare la prima versione del pannello
e assistere le modifiche. Userà lo stesso modello Optix tipizzato e lo stesso command layer del
percorso manuale; l'editor resterà completo anche senza un provider AI.

## Fonti ufficiali di riferimento

- [FactoryTalk Optix: indice delle capacità di progetto](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects.html)
- [Formato sorgente dei progetti](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-5-4/contents-ditamap/creating-projects/projects/projects-source-format.html)
- [Dynamic links](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/dynamic-links.html)
- [Ottimizzazione di dynamic links e tag](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/projects/optimize_dynamic_links.html)
- [Localization editor](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-00/contents-ditamap/using-the-software/manage-the-translations/localization-editor.html)
- [Communication drivers](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-2-0/contents-ditamap/creating-projects/communication-driver.html)
- [NetLogic C#](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-4-2/contents-ditamap/extending-projects/netlogic/manage-netlogics/create-a-netlogic.html)
- [Sessioni](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/sessions-and-locales/sessions.html)
- [Presentation engines](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/graphic-objects/predefined-objects/presentation-engines/create-a-presentation-engine.html)
- [Automation IDs](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/graphic-objects/predefined-objects/presentation-engines/create-a-presentation-engine/automation-ids.html)
- [Allarmi](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/alarms.html)
- [Ricette](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/recipes.html)
- [Recipe schema](https://www.rockwellautomation.com/en-mde/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes/recipex-schemas.html)
- [Logger](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-3-0/contents-ditamap/creating-projects/logger.html)
- [Database](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-5-7/contents-ditamap/creating-projects/database.html)
- [Trend](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/graphic-objects/predefined-objects/data-controls-objects/trends/add-a-trend-object.html)
- [Report PDF](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-3-1/contents-ditamap/creating-projects/object-and-variable-reference/ftoptix-report/objecttypes/report.html)
- [Autenticazione](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/authentication.html)
- [Ruoli](https://www.rockwellautomation.com/en-id/docs/factorytalk-optix/current/contents-ditamap/creating-projects/users-and-groups/roles.html)
- [OPC UA Server](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/opc-ua/opcua-server/add-an-opc-ua-server.html)
- [MQTT custom payload](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/mqtt/mqtt-client/add-mqtt-client/add-mqtt-publisher/custom_payload.html)
- [Feature token supportati](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/technical-content/optix-at001/web_optix-at001-ditamap/supported-feature-tokens.html)
