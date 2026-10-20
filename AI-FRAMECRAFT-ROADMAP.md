# AI facoltativa in Framecraft

Aggiornato al 20 ottobre 2026.

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
configurazioni dichiarate pronte. Dal punto 144 esiste un servizio dati ricette persistente
tipizzato con API protette; il punto 145 aggiunge l’editor manuale della configurazione iniziale
e il 146 la modifica del catalogo iniziale via chat con confronto/backup e contesto su richiesta.
Il punto 147 collega l’importazione del catalogo iniziale Framecraft al wizard, recupero e
generatore, con revisione locale esplicita e soli conteggi inviati all’AI. Il punto 150 aggiunge
creazione/modifica diretta degli schemi e delle ricette iniziali nel wizard, con lo stesso editor
manuale e applicazione esplicita al questionario. Il punto 151 collega il form archivio Runtime
alla pagina e alla palette, con conferme, conflitti ed esiti incerti; richiede identità server
reale e non applica ricette al PLC. Restano integrazione identità, adattatori CSV/vendor/DB e
collaudo industriale. La prova
reale Codex resta subordinata all’isolamento Windows autorizzato; queste verifiche usano provider sintetici.
Le pagine di
produzione, manutenzione e report hanno strutture
di pagina chiaramente incomplete. PDF/documenti e ricette non Framecraft non sono interpretati
dalle domande; ne viene raccolta la disponibilità. Dettagli testuali tecnici soltanto
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
Valori e curve leggono soltanto tag scelti dall’utente. La selezione verifica ora tipi scalari e
accesso con lo stesso contratto dei driver: curve numeriche senza testi/BOOL/array/UDT o tipi non
supportati; valori anche BOOL/testi scalari. Tag solo rilevati, ambigui o scrivibili senza lettura
non sono collegamenti validi. Il generatore controlla gli stessi vincoli; un tipo cambiato invalida
la proposta non più compatibile. Riepilogo locale per pagina/elemento/tag/tipo con ritorno alla
pagina per correggere, senza sostituzioni o collegamenti automatici. “Impostato” non significa
PLC collegato, qualità valida o commissioning concluso. Matrice operativa e driver avanzati restano
parziali; nessuna nuova informazione macchina viene inventata o inviata all’AI iniziale.
La pipeline iniziale offre anche la base **Grafico X/Y**: massimo nove curve con tag X e Y
numerici scalari scelti separatamente, controllo tipi e riepilogo per asse. Genera il controllo
Function Trend reale e applica campionamento/finestra temporale ai campioni, non alla scala X.
Bozza, reimport e delega delle etichette conservano o azzerano i collegamenti senza trasferirli
a una curva diversa. Contratto del template e soli flag X/Y collegati arrivano all’AI; catalogo
e indirizzi restano locali. Misure sincrone PLC, unità/scale/soglie, archivi e collaudo non sono
dedotti; una pagina generata non è una sorgente dati o una connessione già verificata.
Dal punto 139 anche i Data Log Framecraft reali possono essere importati nella pipeline:
configurazioni, non campioni precedenti o database esterni. Sorgente online/archivio selezionata
per curva e per asse X/Y; riferimenti, stato abilitato e tipi verificati prima della generazione.
Riepilogo di sorgenti, modalità, conservazione e limiti locali; nessuna selezione automatica.
Il generatore usa catalogo, collector e adattatore storico effettivi, con spazio locale nuovo
per non recuperare lo storico di un altro progetto. Bozza e catalogo restano locali; all’AI
solo conteggi e modalità, non nomi/ID/tag/indirizzi o valori. La raccolta dipende dal pannello
aperto: archiviazione server continua, quote, backup e collaudo non diventano pronti con l’import.
I pulsanti non configurati restano
disabilitati; per scritture singole il questionario raccoglie evento operatore, tag scrivibile,
valore compatibile, permesso e conferma esplicita del mapping. Usa la stessa IR/eventi
dell’Inspector; tag e valori restano locali, il modello non li inventa o modifica. Cambi di
valore/evento/permesso o reimport del catalogo revocano la conferma; rinominare/cancellare/riordinare
righe non sposta il mapping sul comando sbagliato. I gate utente restano fail-closed senza
permesso; gateway disabilitato, autorizzazioni server, interlock e collaudo sono passi separati.
Dal punto 141 i pulsanti della procedura possono anche aprire una pagina scelta nel piano,
con evento, permesso e conferma espliciti, senza tag o scritture. Destinazione mai preselezionata,
nessun URL/script libero. Rotta risolta dal generatore sull’ID stabile; rimozione o ambiguità
bloccano la generazione e revocano la conferma. Navigazione ammessa nel solo monitoraggio,
con desktop/mobile mantenuto. Recupero senza approvazione; scheda comandi v2 distinta dalla
v1 dei vecchi progetti. Permesso del pulsante non equivale a protezione della pagina.
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
Dal 16 ottobre **Modifiche al progetto** è l’ambito predefinito: i riferimenti sono il punto di
partenza per leggere sorgenti e componenti importati, non un vincolo alle sole proprietà Inspector.
La descrizione grafica limitata qui sotto resta disponibile disabilitando l’opzione; il cambio
ambito revoca il consenso. Dettagli e limiti del nuovo percorso nel paragrafo “Modifiche progetto”.
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
delle risposte tardive. Recupero locale dei testi ai refresh della finestra tramite sessionStorage:
bozza, note, messaggi e risposte, senza sorgenti, tag PLC, richieste attive, consenso o operazioni
applicabili. Verifica account prima del recupero; proposte recuperate in sola lettura e riferimenti
da riconfermare. Non è uno storico persistente dopo la chiusura dell’app; nessun invio automatico.
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

Modifiche progetto (2026-10-16): dopo autorizzazione esplicita alla condivisione del contesto,
chat e provider sono collegati alle primitive locali. Recupero mirato di componenti importati,
ricerca letterale nelle configurazioni, catalogo automatico dei soli nomi/tipi/accessi/descrizioni
(non indirizzi, connessioni, valori o extra). Massimo tre passaggi modello, 80 KB per passaggio e
180 KB complessivi UTF-8 incluso schema; fino a sei messaggi recenti abbreviati e 500 file nell’indice.
Richiesta corrente e note non vengono troncate. Nessun modello aggiuntivo per riassumere il contesto.
Chiarimenti progetto collegati ai campi della chat: obiettivo e risposte strutturate conservati
fra giri, una domanda ripetuta sostituisce solo la propria risposta, rinvio esplicito della parte
non definita e nessun invio del testo disattivato. Se non ci sono allegati, il seguito resta sulle
pagine iniziali anche dopo una navigazione. Sorgenti riletti, bozza separata conservata; cambio
allegati/ambito richiede nuova richiesta. Al refresh si recuperano soltanto domande e risposte
leggibili, non sorgenti, ancoraggi attivi, approvazioni o un invio riattivabile.
Schema con sostituzioni esatte di codice,
creazione di file sorgente verificati e nuove variabili scalari non mappate; parser/import e
controlli euristici delle chiamate note. Backend con confine progetto, precontrollo del testo
atteso, backup e ripristino anche di batch parziali, senza sovrascrivere modifiche esterne;
catalogo PLC in sola aggiunta, indirizzi/connessioni esistenti immutati. Non è una transazione
atomica né una sandbox JavaScript. Revisione UI con file, variabili e diff come testo, approvazione
non preselezionata; ripristino dell’intera proposta con conferma separata, disponibile anche dopo
refresh tramite ricevuta locale senza sorgenti né autorizzazioni recuperate. Bozza/file cambiati
bloccano la scrittura. Modello/ragionamento restano quelli scelti nella chat. Le variabili create
sono dichiarazioni da mappare e collaudare, non segnali macchina disponibili automaticamente.
Nuovi comandi nativi richiedono la build desktop aggiornata; il provider deve supportare la policy
di sola lettura confinata, senza fallback a un accesso più ampio per aggirare incompatibilità.
Dal punto 142 il gate non dipende più soltanto da `ReadOnlyAccess`: la CLI 0.163.0 espone profili
nominati con API sperimentale. L’adapter li seleziona esplicitamente per thread e turno sorgenti,
senza mescolarli ai campi sandbox legacy. Profilo esatto, consenso delle regole del computer e
provenienza della sessione sono verificati; letture limitate alla cartella proposta e ai percorsi
minimi di piattaforma, nessuna scrittura/rete degli strumenti, nessun fallback più ampio.
**Limite attuale verificato**: il sandbox Windows del profilo Framecraft segnala `updateRequired`.
Nuovi profili temporanei segnalano `notConfigured`; entrambi fermano la richiesta prima del thread
e del modello, con rimedio distinto dal login o dall’aggiornamento CLI. Nessun setup automatico:
servono autorizzazione esplicita per il setup Windows, build desktop aggiornata e nuovo collaudo
end-to-end. Il preflight nativo del punto 142 con CLI reale non usava account/inferenza;
configurazione e stato non provano l’enforcement del filesystem né una modifica AI completata.
Dal punto 143 il controllo e la configurazione sono nelle impostazioni AI: verifica soltanto
su richiesta, spiegazione degli effetti Windows, checkbox vuota e pulsante separato di avvio.
ACK distinto da completamento e nuova lettura della readiness; esito incerto non riavviato,
notifiche ricevute anche a impostazioni chiuse, nessuna inferenza dopo il setup. Backend rifiuta
avvii duplicati/senza consenso o concorrenti con richieste AI. Passati 21 test nativi di stato/
adapter, 86 test AI pertinenti, tipi/build pubblica e quattro larghezze Edge con provider finto.
Non è una prova UAC, provisioning Windows, setup su PC aziendali o modifica AI reale.
Nessuna versione preliminare installata o inferenza inviata per questi controlli. Ulteriore
gate di produzione: la documentazione ufficiale definisce App Server sperimentale/non supportato
per carichi production. L’adapter CLI è provvisorio: provider supportato, sicurezza/privacy e
collaudo Runtime restano necessari prima di dichiarare l’app pronta per la produzione.
Non equivale a completamento AI: restano generazione completa di funzioni operative, mapping
approvati di scrittura, ricette, PDF, ruoli server, modifiche multi-file atomiche, licensing,
privacy/eval e commissioning industriale. Il protocollo resta un requisito, non una connessione
pronta. Dal punto 140 la lingua operatore imposta il Runtime e il catalogo testi importato può
essere collegato esplicitamente a titoli e testi statici delle basi supportate. Solo chiavi che
contengono il testo originale sono selezionabili, nessuna traduzione o associazione automatica.
Riepilogo locale con testo effettivo, ripiego e ritorno alla pagina; collegamenti obsoleti bloccano
la generazione. Le voci del menu seguono i titoli tradotti senza modificare rotte o identificativi.
Bozza e catalogo restano locali; all’AI solo conteggi e flag, non chiavi, traduzioni o nome file.
Liste conservate, immagini riferite non importate. Lingua completa dei controlli, nomi curve,
allarmi e testi non collegati restano da completare/collaudare: non è traduzione completa dell’HMI.

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
| AI-IN-06 | Lista allarmi, ricette, utenti e permessi | PARZIALE | Ricette scalari Framecraft importate o create localmente nel wizard (147/150); utenti e permessi server da completare. Nessuna semantica viene dedotta soltanto dal nome di un tag |
| AI-IN-07 | Progetto HMI precedente o di riferimento | DA FARE | Importare, confrontare e dichiarare ciò che viene riusato |
| AI-IN-08 | Mapping macchina-PLC-HMI approvato | PARZIALE | Letture e scritture singole da tag importati con valore/evento/permesso e approvazione; sequenze, comandi a uomo presente, handshake PLC e mapping connessioni ancora da completare |

## 3. Pianificazione AI del pannello

| ID | Capacità | Stato | Risultato richiesto |
|---|---|---|---|
| AI-PLAN-01 | Valutazione della completezza degli input | PARZIALE | Validazione del questionario, rinvii e conflitti monitoraggio/comandi e ruoli/accesso; completezza industriale da verificare |
| AI-PLAN-02 | Scelta motivata di template e famiglie pagina | PARZIALE | Famiglie scelte dall’utente con funzionamento noto nel contesto AI; scelta automatica motivata tra tutti i template da implementare |
| AI-PLAN-03 | Piano pagine, navigazione e popup | PARZIALE | Pagine/categorie esplicite e pagina iniziale applicata; popup e oggetti ripetuti raccolti come requisiti da configurare |
| AI-PLAN-04 | Piano binding e interazioni | PARZIALE | Letture, scritture singole e destinazioni pagina con evento, permessi e conferma espliciti; matrice operativa completa ancora da fare |
| AI-PLAN-05 | Piano allarmi, trend, ricette e diagnostica | PARZIALE | Catalogo allarmi locale, trend temporali/X-Y e Data Log importati, catalogo ricette iniziale (147/150) e pagina form archivio (151); identità server, mapping/handshake PLC e archivio industriale da completare |
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
| AI-GEN-05 | Eventi, script e navigazione | PARZIALE | Scritture singole e cambio pagina del piano con conferma, stessa IR/Runtime dell’editor e gate di interazione; altri script/azioni/handshake ancora da fare |
| AI-GEN-06 | Allarmi, trend, ricette e report | PARZIALE | Catalogo allarmi, trend temporali/X-Y, Data Log e ricette iniziali importati; form archivio ricette collegato alla pagina e palette (151), senza identità server presunta o trasferimenti PLC. Report e archivio industriale continuo ancora da completare |
| AI-GEN-07 | Testi e traduzioni | PARZIALE | Lingua Runtime, catalogo locale importato, chiavi esplicite per titoli/menu/testi statici supportati e revisione di originali/ripieghi; restano controlli, allarmi, nomi curve e copertura completa |
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
