# MQTT, OPC UA e gateway del Runtime autonomo

MQTT.js gira nel servizio Node, non nel browser. Il driver usa un broker reale TCP/TLS/WebSocket,
sottoscrizioni, cache tipizzata, qualità e timestamp, timeout e riconnessione. Il gateway HTTP
trasferisce i campioni al browser e inoltra i comandi autorizzati. Non serve un Runtime Siemens
o Rockwell; il client OPC UA scalare è descritto nella sezione dedicata sotto.

Il collaudo `npm run test:gateway` nel repository usa Aedes su TCP/TLS, gateway HTTP, peer TCP
controllati per i rifiuti MQTT 5 e processi Node separati anche per i sorgenti generati. Certificati
CA/server/client effimeri verificano TLS e mTLS, trust rifiutato, scadenza e hostname errato;
non vengono installati nel trust del sistema. Serve OpenSSL (su Windows è usato quello di Git,
se presente). Queste prove locali non dimostrano compatibilità con CPU/broker/trust aziendali.

## Allarmi nel servizio condiviso

Nell'editor, **Pannello → Allarmi** configura `framecraft.alarms.json`.
Il catalogo nasce vuoto: nessun tag, testo macchina, soglia o comando viene inventato.
Per provare: aggiungi un allarme, scegli un tag dichiarato e leggibile, compila il
messaggio e applica un valore nella **Prova locale**. Bool usa bit 0; gli interi
supportano bit fino alla larghezza dichiarata. LWord/LInt usano stringhe decimali
esatte, mai numeri JavaScript già arrotondati. I tag analogici supportano sei confronti
e soglia fissa oppure letta da un altro segnale PLC; vedi la guida seguente.

Il servizio carica il catalogo all'avvio manuale. Salvare nell'editor non riavvia
gateway/PLC, non modifica connessioni né invia comandi. Il motore usa `onSample` dei
driver MQTT e OPC UA, anche quando nessun browser mostra la pagina Allarmi. Ogni
browser riceve lo stesso stato da `GET /_framecraft/plc/v1/snapshot`, campo `alarms`.
La qualità deve essere Good conosciuta e il valore compatibile. Bad, Uncertain,
errore o qualità mancante conservano l'ultima condizione e mostrano il problema;
non generano un rientro. Nessun campione iniziale significa stato sconosciuto, non Normale.

### Soglie analogiche: valore fisso o variabile PLC

In **Pannello → Allarmi**, scegli l’allarme e **Attivazione**: sopra (`>`), sotto (`<`),
maggiore o uguale (`≥`), minore o uguale (`≤`), uguale (`=`), diverso (`≠`).
**Origine della soglia → Variabile PLC** mostra solo segnali numerici dichiarati e leggibili.
Scegli il tag della soglia, l’isteresi e verifica che segnale e soglia usino le stesse unità:
Framecraft non converte automaticamente bar/kPa, °C/°F o altre unità.

La prova locale ha due campioni separati: **Applica segnale di prova** e **Applica soglia
di prova**, con qualità indipendenti. Finché entrambi non sono validi lo stato resta
sconosciuto o conserva l’ultima condizione, senza sostituire la soglia con zero. Anche
un cambiamento della sola soglia rivaluta l’allarme; un rientro deve essere verificabile
con entrambi i dati validi. Apri **Problema del segnale / della soglia** nella riga per
leggere causa e rimedio anche da tastiera o touch: non serve un tooltip.
Ricerca e zona sono in **Filtra allarmi**, richiudibile. La conferma compare quando la
lista contiene allarmi con quel modello; paginazione soltanto oltre 100 risultati.
Nei WebView/browser moderni la lista sotto 600 px diventa una sequenza di schede con
etichette dei campi; su viste larghe resta una tabella. Il cambio dipende dalla larghezza
del controllo, non forza la pagina HMI da mobile a desktop o viceversa.

Per `>` si rientra a `valore ≤ soglia − isteresi`; per `<` a `valore ≥ soglia + isteresi`.
Per `≥` il rientro richiede `valore < soglia − isteresi`; per `≤` richiede
`valore > soglia + isteresi`. La soglia dinamica usa il valore attuale anche per il rientro,
non congela quello dell’attivazione. `=` e `≠` richiedono isteresi zero: confronto numerico
esatto, nessun epsilon o tolleranza implicita. Real/LReal possono essere arrotondati
dal PLC/trasporto; per segnalare l’uscita da una fascia usa due allarmi sopra/sotto, non un’uguaglianza.

Il catalogo versione 1 mantiene le vecchie soglie numeriche; la nuova forma è ad esempio
`"trigger": { "kind": "high-equal", "limit": { "tag": "PressureLimit" }, "hysteresis": 2 }`.
È un esempio di struttura, non un tag macchina da creare automaticamente. Valori e soglie
devono essere SInt/USInt, Int/UInt, DInt/UDInt, Real/LReal (alias Float/Double): Bool,
String, Byte/Word come bitfield, struct e interi 64 bit non vengono convertiti in analogici.
Nessun fallback nascosto o scrittura PLC viene aggiunto.

Il servizio valuta gli ultimi campioni ricevuti: non garantisce letture simultanee o un
timestamp comune tra i due segnali, né tra due connessioni. Configura `staleAfterMs` su
entrambi i binding per rendere non valida una sorgente ferma; il motore non aggiunge un
orologio o un timeout autonomo. Nella simulazione editor una nuova mappa è applicata in
un solo gruppo, evitando eventi artificiali dovuti all’ordine delle chiavi. Il trasporto
reale continua a valutare ogni aggiornamento ricevuto, non una transazione PLC.

Nuovi pannelli includono motore e tipi aggiornati. I pannelli già esportati richiedono
aggiornamento esplicito di Runtime/servizio e riavvio manuale; salvare il catalogo non lo
esegue. Non sono implementati limiti multipli dentro una singola condizione, classificazione
ExclusiveLevel/NonExclusiveLevel Optix o confronti analogici esatti a 64 bit. Riferimenti:
[trigger Unified V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/configuring-alarms-rt-unified/configuring-analog-alarms-rt-unified/configure-trigger-rt-unified)
e [Limit alarm Optix 1.3.2](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-3-2/contents-ditamap/creating-projects/object-and-variable-reference/ftoptix-alarm/objecttypes/limitalarmcontroller.html).
La pagina Optix consultata descrive livelli esclusivi/non esclusivi: non è dichiarata
parità con quell’oggetto né una nuova rivalutazione dell’intera baseline `current`.

### Presa visione e rientro

Classi: `none` chiude al rientro, `single` richiede anche la presa visione,
`reset` richiede inoltre una conferma dopo rientro valido e presa visione.
La presa visione può precedere o seguire il rientro e **non scrive nel PLC**.
Una riattivazione pendente richiede una nuova presa visione; la nuova revisione
invalida i pulsanti selezionati prima del cambiamento. Il modello deriva da
[stati Unified](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/basics-rt-unified/alarm-states-rt-unified)
e [presa visione](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/basics-rt-unified/acknowledgment-model-rt-unified).

### Autorizzazione degli operatori: bloccata per impostazione iniziale

`start-gateway.mjs` integra gli account locali descritti sotto quando configurati esplicitamente;
senza identità server gli allarmi sono consultabili ma presa visione/conferma sono bloccate.
Un embedding con identità esterna può fornire `createPlcGateway(..., { alarmCatalog, authorizeAlarmAction, audit })`:
il callback riceve la richiesta HTTP e il comando, verifica sessione, ruolo,
allarme e azione e restituisce l'identificativo dell'operatore **verificato dal server**,
oppure rifiuta. Non autorizzare restituendo un nome fisso, accettando `actor` dal
browser o fidandosi del PIN locale. Il callback ha un timeout di 5 secondi.
Gli account locali possono limitare presa visione/conferma a ID allarme esatti e registrano
richieste/esiti nell’audit del servizio. Identità esterne, conformità e collaudo del target
restano da completare; il solo hook non è un prodotto di autenticazione completo.

`POST /_framecraft/plc/v1/alarm-action` accetta soltanto `alarmId`, `occurrence`,
`revision` e `action` (`acknowledge` o `confirm`), con JSON e le stesse protezioni
token/origine del gateway. Dopo l'autorizzazione ricontrolla lo stato: una revisione
vecchia o il replay vengono rifiutati (409); mancata autorizzazione dà 403. Un
timeout HTTP non dimostra che l'azione sia fallita: aggiorna la vista prima di
riprovare, senza retry automatico. Gli errori dell'identity provider non vengono
restituiti al browser. `onAlarmEvent` permette una futura integrazione di audit;
il buffer in memoria non offre integrità o durabilità industriale.

### Vista, Scheduler e limiti dello storico

I controlli Allarmi nei nuovi pannelli mostrano nome, stato, messaggio, zona e ora,
con ricerca, filtro zona, priorità e pagine da 100 righe. I filtri di classe dello
standard restano `AlarmClassName = 'Alarm_CTH'` e `AlarmClassName = 'Alarm_History'`:
la pagina Storico mostra solo gli eventi della classe configurata, non rimappa
implicitamente le classi macchina. Un filtro non supportato è segnalato e non ignorato.
Nessuna scrittura dei tag di selezione/troubleshooting viene introdotta dal nuovo motore.

Gli eventi alimentano i trigger Scheduler `Alarms`, senza duplicare gli stessi
eventi a ogni polling, riprodurre lo storico iniziale o rilanciare eventi dopo un
riavvio del servizio. Un buco nel buffer è diagnosticato, non recuperato inventando
operazioni.
Le revisioni monotone dello snapshot impediscono a risposte HTTP ritardate di
riportare indietro qualità/stato o duplicare i trigger. Lo Scheduler è **per client
browser**, non un esecutore unico sul server: due client possono eseguire ciascuno
la propria regola sullo stesso evento. Non usare questo percorso come garanzia di
comandi macchina exactly-once; ownership server e audit restano da implementare.
Lo storico espone operatore verificato, ora del servizio e contatore degli eventi
rimossi dal limite (`maxHistory`). È **solo storico di sessione**:
arresto/riavvio perde buffer e prese visione; un nuovo `instanceId`/occorrenza
impedisce di riutilizzare i vecchi comandi. Il primo segnale valido ricostruisce
la condizione, ma non ricrea i vecchi eventi. `Clear Alarm Log` resta disabilitato
con spiegazione finché non esiste un archivio con cancellazione/audit protetti.

Prima della produzione servono archivio e ripristino verificati, identità/permessi
server, audit, commissioning CPU, limiti/carico, traduzioni, shelving e operazioni
multiple. Gli allarmi di eventi OPC UA/controller non sono i trigger scalari qui
implementati. La prova locale è isolata e non certifica il funzionamento sulla macchina.

### Provare un faceplate sulla pagina nell'editor

Configura tipo/versione e interfaccia nell'Inspector → **PLC e dati → Istanza faceplate**,
poi passa a **Usa il pannello**. Il ponte disegna il contenuto del tipo dentro la pagina:
oggetti, proprietà configurate, istanze annidate e immagini relative al progetto. Per i
segnali di processo inserisci valori manuali in **PLC → Prova locale**. Non viene collegata
una CPU; il tooltip del controllo distingue la prova locale. Un tag mancante non riceve
valori PLC inventati: rimane la grafica statica progettata.

Gli eventi di interfaccia usano i tag locali della propria istanza, anche nei timer.
Le altre istanze e il namespace PLC non vengono modificati. Cambiare pagina/progetto
invalida i vecchi eventi; i timer ricevono il controllo di contesto già previsto dalla IR.
**Modifica** ripristina nodi e stile della bozza. Il tipo non sovrascrive contenuti interni
personalizzati, mentre HMR di un host gestito conserva la nuova bozza.

I popup conservano lo stesso contenitore quando cambiano posizione, visibilità o
interfaccia. Quelli legati alla pagina precedente si chiudono al cambio pagina. Restano
da completare eventi annidati, screen window generiche, opzioni/object model completo,
stampa/profili delle curve e collaudo visivo/touch/CPU. La prova non certifica produzione,
autorizzazioni o sicurezza del PLC.

### Provare curve e storico sulla pagina nell’editor

Configura il controllo in **PLC e dati** e scegli **Usa il pannello**. Inserisci valori
manuali in **PLC → Prova locale**: il controllo mostra la dicitura PROVA LOCALE e non
avvia connessioni PLC. Curve temporali e X/Y, pausa, zoom/pan, righello, selettore delle
sorgenti e intervalli restano quelli del Runtime condiviso. Tornare a Modifica ripristina
la bozza; la vista e le sorgenti temporanee dello stesso host si conservano in Usa.

Le sorgenti storiche interrogano il Data Log locale dell’editor, non un archivio della CPU.
Sono richiesti solo gli intervalli necessari, con cache per sorgente e revisione. Timestamp
e qualità restano quelli dei campioni; il temporale ignora valori non numerici, X/Y
mantiene anche gli array supportati. Query estranee o vecchie non installano risultati.
Se lo storico non risponde, il controllo spiega come usare **Vista originale** per riprovare,
senza una serie infinita di richieste automatiche. Controlla Data Log/variabile e diagnostica
se la sorgente manca. Non viene inventato un campione per riempire il grafico.

**CSV** prepara i dati della vista nella finestra dell’editor: il sandbox dell’iframe non
riceve permessi di download aggiuntivi. Le celle testuali sono quotate e i prefissi formula
trattati come testo; i numeri negativi restano numeri. Preparazione non equivale a conferma
del salvataggio nativo. Restano collaudo desktop/touch, export sul pacchetto distribuito,
profili/stampa, fusi orari, aggregazione per pixel e archivi industriali con RBAC/audit.

### Provare gli allarmi sulla pagina nell'editor

Salva il catalogo da **Pannello → Allarmi**, inserisci i controlli nella pagina e apri
**PLC → Prova locale**. Premi **Attiva valori di prova**, compila il valore del segnale
usato dall'allarme e passa a **Usa il pannello** nella barra superiore. Indicatore, riga
e lista usano un motore locale condiviso, senza driver, connessioni o comandi PLC.
La dicitura **SIMULAZIONE · nessun PLC collegato** distingue questa prova dal Runtime.

Un valore mai compilato resta sconosciuto, non Good/zero. La qualità di prova esplicita
resta valida anche per gli allarmi; Bad conserva l'ultimo guasto. Presa visione e conferma
agiscono soltanto sullo stato locale, ricontrollando gli ultimi valori e la revisione.
Un timeout non ritenta l'azione; il messaggio indica come riaprire la prova. Gli esiti
restano leggibili durante aggiornamenti identici, finché cambia stato o selezione.

**Modifica** chiude il dettaglio e ripristina nodi e stile della bozza, mantenendo lo
stato della prova finché è attiva; il solo cambio alla vista Codice non perde lo stato
degli allarmi. **Ferma la prova locale** azzera storico e prese visione locali anche senza
canvas; una nuova sessione non accetta i comandi precedenti. Cambio progetto o catalogo
invalida lo stato vecchio. Le modifiche non salvate nella finestra Allarmi restano una
prova separata; il canvas legge soltanto la coppia catalogo/variabili validata su disco.
File assente e JSON invalido non sono equivalenti. Correggi i file e usa **Riprova lettura** nella
finestra Allarmi: la lettura aggiornata ripristina la configurazione della prova.

Il rendering avviene nel ponte della pagina, senza accesso al DOM cross-origin da parte
dell'editor. Origine, finestra, pagina e istanza della prova sono controllate; questi
controlli non costituiscono autenticazione/RBAC del servizio industriale. Il servizio
reale resta separato e non viene avviato o collegato automaticamente all'anteprima.

### Indicatori e righe allarme

Da **Aggiungi → HMI e PLC** inserisci **Indicatore allarmi** o **Riga allarmi**.
Nell'Inspector, **PLC e dati** configura titolo, classi, zone, priorità minima,
pendenti/attivi/da prendere in visione, colori e visibilità. Classi e zone usano
nomi esatti separati da virgole; vuoto include tutte. La configurazione vive
in `data-hmi-alarm-summary`, versione 1, non in un nuovo tag PLC.
La prova locale di **Pannello → Allarmi** mostra i due riepiloghi sullo stesso
motore della lista; **PLC → Prova locale → Usa il pannello** descritto sopra prova invece
i controlli inseriti nella pagina. Nel canvas di modifica resta la bozza selezionabile; il
servizio reale non viene collegato automaticamente all'anteprima dell'editor.

L'indicatore distingue guasti attivi, presa visione mancante e conferma di rientro.
Il conteggio può mostrare anche i rientrati ancora da gestire. **Mostra anche senza
allarmi** disattivato nasconde il contenuto solo quando tutti i segnali filtrati
sono validi e non ci sono pendenti. Un catalogo vuoto, un filtro senza risultati,
segnali sconosciuti/Bad o la perdita del servizio non diventano una spunta verde.
L'ultimo guasto rimane visibile con lo stato di qualità; senza servizio il
contatore corrente mostra `—`. Il lampeggio è opzionale, limitato all'icona e
disattivato quando il dispositivo richiede la riduzione del movimento.

La riga mostra 1–3 messaggi, classe, ID, stato e **ora di attivazione**, locale o UTC.
Non prende in visione gli allarmi dalla riga. Per una zona critica si può scegliere
la priorità più alta sull'intero insieme filtrato: è una scelta Framecraft, non una
replica esatta dell'ordinamento Siemens delle sole righe già visualizzate.
Riferimenti: [Alarm indicator V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/displaying-and-using-alarms-rt-unified/alarm-indicator-rt-unified)
e [Alarm line V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/displaying-and-using-alarms-rt-unified/alarm-line-rt-unified).

**Apri dettaglio filtrato** è opzionale (spento per la riga). Il popup conserva
classe/zona/priorità/modalità, ricerca e selezione revisionata della lista; apertura
e navigazione non prendono in visione né scrivono segnali PLC. Una destinazione
esterna o assente non viene aperta. Presa visione/conferma restano negate senza
l'autorizzazione server descritta sopra. Il popup si chiude al cambio dei filtri,
rimozione dell'oggetto o blocco di visibilità/interazione, anche via CSS/script.
Esc chiude e restituisce il focus; i click interni non eseguono quelli del contenitore.

JSON errato = messaggio esplicito, nessun fallback che ignori i filtri. La sostituzione
in Inspector richiede conferma; configurazioni calcolate nel codice restano intatte.
**Nuovo pannello standard** copia i moduli e passa al Runtime le route disponibili,
senza inserire automaticamente gli oggetti nelle schermate macchina o migrare pannelli
vecchi. Misure e stile dei due nuovi controlli sono Framecraft, non dati di export reali.
Restano object model/eventi/proprietà completi, profili, altri fusi e timestamp di
modifica, oltre ai gate di archivio, identità/audit e collaudo visivo/touch/CPU.

## Storico allarmi su disco

**Attivazione:** Pannello → Allarmi → Archivio su disco del servizio. Spunta **Conserva gli eventi
anche dopo il riavvio**, scegli il limite (1000–500000, iniziale 100000), salva e riavvia manualmente
il servizio. Il catalogo `framecraft.alarms.json` conserva `archive: { enabled, maxRecords }`.
Niente archivio viene creato dalla prova locale o quando l’opzione è assente/disabilitata.
Il namespace del progetto viene da `framecraft.auth.json`, anche se l’accesso account è disabilitato.
Non modificarlo per aggirare un errore di identità dell’archivio.

Inserisci **Aggiungi → HMI e PLC → Storico allarmi su disco**, poi accedi nel pannello con un account
che abbia `alarms.history.read`. È una capacità globale di consultazione di **tutto** l’archivio,
non un filtro ACL: scegliere una zona o un ID non è una barriera di sicurezza. I limiti per allarme
restano separati e proteggono presa visione/conferma. Ruolo, PIN browser, token del gateway e permesso
di presa visione non concedono la nuova lettura. Gli account esistenti non ricevono questo permesso
automaticamente. Riavvia Framecraft dopo l’aggiornamento per aggiornare anche l’helper account.
Vecchi pannelli richiedono l’aggiornamento esplicito di Runtime e servizio prima di usare il nuovo
controllo o il catalogo con `archive`; aggiungere il solo div non aggiorna il codice.

**Uso:** premi **Carica storico**; non c’è polling né lettura automatica del controllo. I filtri
richiudibili usano ID allarme/classe/zona esatti, tipo evento e intervallo date. Le date dei filtri
sono nell’ora del dispositivo; nei dettagli ci sono UTC e identificativi. Carica la prima pagina
dopo ogni variazione dei filtri. Le pagine più vecchie restano ancorate all’identità dell’archivio
e alla sequenza iniziale: nuovi eventi non vi si mescolano. Il cambio utente rimuove i dati letti
e invalida le risposte in ritardo. Nessun evento viene scritto in localStorage/sessionStorage.

### Esportazione CSV dello storico

Dopo **Carica storico**, applica i filtri desiderati e premi **Prepara CSV dei risultati
filtrati**. Vengono lette tutte le pagine filtrate, comprese quelle più recenti se stavi
consultando una pagina vecchia. Il limite è la sequenza fissata all’ultima prima pagina letta:
nuovi eventi non si aggiungono durante la preparazione. Per includerli, aggiorna dalla prima
pagina prima di preparare il file. La preparazione è annullabile e non avvia download da sola.

Al termine scegli **Scarica CSV** e **Scarica dettagli dell’esportazione**. Il JSON conserva
identità archivio/progetto, limite di sequenza, filtri, conteggio, formato, avvisi e stati della
registrazione osservati. Anche un risultato vuoto ha intestazioni e dettagli espliciti.
Il browser gestisce nome/cartella e disponibilità dei download; nessun percorso del PC server
viene esposto o scritto. **Scarta file preparati** libera i file temporanei in memoria, non
cancella quelli già scaricati. Cambio utente, modifica filtri, nuova lettura o uscita dal
controllo invalidano i link. Gli eventi non sono salvati in storage persistente del browser.

Il CSV Framecraft v1 usa UTF-8 con BOM, separatore `;`, campi fra virgolette e CRLF. Contiene
archivio, namespace, sequenza limite/globale/per-avvio, avvio/occorrenza/allarme, testo e nome
storici, classe, priorità, zona, stato, date UTC di evento/registrazione e ID operatore se
presente. I testi che iniziano con una possibile formula, anche dopo spazi, ricevono un
apostrofo protettivo. Non è un formato di round-trip, una firma o un backup del database.
Conserva il JSON insieme al CSV; gli orari evento sono valutazioni nel servizio, non tempi PLC.

Limiti browser: 64 MiB di CSV, 500.000 righe, cinque minuti totali e timeout per pagina del
controllo. Le pagine sono sequenziali, massimo 500 eventi e intervallo minimo 250 ms per
rispettare la protezione del servizio; altri lettori possono comunque causare un rifiuto.
Permesso `alarms.history.read` verificato dal server a ogni GET, senza nuove capacità o grant.
Errore di rete/permesso/identità, timeout o limite superato non offrono un file troncato:
controlla la causa, restringi i filtri e riprova manualmente. Nessun retry o comando PLC.
L’export completo dei risultati registrati **non certifica** che la registrazione non abbia
lacune. Restano da collaudare carico, grandi archivi, target nativi/touch e backup/restore.

Riferimenti funzionali: [Unified V21 — export allarmi](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/configuring-the-alarm-control-rt-unified/configuring-the-export-of-alarms-rt-unified)
e [Optix — esportazione tabella CSV](https://help.optix.cloud.rockwellautomation.com/1.4.1.7/en/creating-projects/database/Export-a-table-to-a-CSV-file.html).
Implementazione Framecraft originale: nessun NetLogic o sorgente vendor copiato, nessun SQL
libero nel browser e nessuna dichiarazione di compatibilità con il loro formato file.

Il servizio registra Incoming/Outgoing/Acknowledged/Confirmed dal motore Framecraft, indipendente
dalla pagina aperta, in `.framecraft-runtime/alarm-history/alarms.sqlite` con `identity.json`.
Ogni valutazione del segnale salva insieme i propri eventi, con sequenze globali e per avvio,
occorrenza, testo/classe/priorità/zona dell’epoca ed eventuale ID operatore qualificato. Non vengono
inventati nomi storici degli account. La data evento è l’ora di valutazione del segnale nel servizio,
**non** un timestamp evento ricevuto dal PLC; l’ora di registrazione è distinta. Le transizioni
supportate sono condivise fra MQTT e OPC UA scalare, non un import di eventi/Alarm & Conditions UA.

Lo stato attivo al riavvio resta sconosciuto fino a nuovi campioni validi. Leggere un vecchio evento
non riattiva, chiude, prende visione o conferma un allarme. Un campione Bad/Uncertain o invalido non
produce un rientro. Il vecchio controllo allarmi conserva ancora il proprio storico di sessione:
questa nuova vista riguarda il servizio su disco. Disabilitando la registrazione, l’archivio
esistente resta consultabile in sola lettura e non viene cancellato.

**Guasti:** pieno/occupato/corrotto/identità errata non azzerano file e non generano retry automatici.
L’acquisizione degli allarmi attivi prosegue; lo stato PLC in alto avvisa del guasto di archivio.
La vista mostra il numero di eventi **senza conferma** di registrazione in questo avvio: alcuni
potrebbero essere arrivati su disco prima di un errore, quindi non è un conteggio certo di perdite.
Gli avvii lasciati aperti dopo un arresto anomalo, o chiusi con errori di registrazione, restano
segnalati. I periodi a servizio fermo o senza qualità possono avere lacune non quantificabili,
anche quando quel contatore vale zero. Non vengono ricostruiti né reinviati eventi storici.

SQLite usa transazioni WAL/FULL e un writer esclusivo del servizio; la chiusura o terminazione
del processo rilascia il lock SQLite, senza cancellare lock in base all’età. Le query passano dal
servizio: non aprire programmi di manutenzione sul database mentre gira. Usare solo disco locale,
ACL/permessi minimi e una versione Node LTS con SQLite corretto come indicato dall’errore.
Il database ha limite 256 MiB, oltre ai file WAL/temporanei; riservare margine disco. Il limite
eventi non è una retention con cancellazione: richiede manutenzione/backup verificati prima di
riempirsi. Backup coerente dell’intera cartella a servizio fermo, non del solo `.sqlite` mentre è
aperto. Nessuna copia automatica o procedura di restore certificata è inclusa.

API `GET /_framecraft/plc/v1/alarm-history`: stessa origine/token privato del gateway più sessione
server e capacità dedicata, senza rinnovo idle. Query: `limit` (1–500), `before`, `through`,
`archiveId`, `alarmId`, `alarmClass`, `area`, `state`, `from`, `to` (UTC ISO). Niente SQL libero,
campi sconosciuti o duplicati; massimo una lettura ogni 200 ms per servizio. La vista chiede 50
eventi. La consultazione non modifica macchina o archivio e non produce una firma elettronica.

Non equivale ancora a multilingua storica, logger generico, export/retention/restore industriali,
firma o archivio antimanomissione. Le scritture a batch sono sincrone nel servizio: throughput,
latenze, supporti, perdita alimentazione e limiti di carico vanno collaudati sul target reale.
Riferimenti funzionali, senza copia di codice o formati proprietari:
[allarmi registrati Unified V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/logging-alarms-rt-unified/basics-of-alarm-logging-rt-unified),
[Alarm Event Logger Optix](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/getting-started/quick-start/configure-alarms/configure-an-alarm-event-logger.html).

## Abilitazione in un pannello standard

La pipeline copia servizio, client, tipi, proxy e questa guida. Per impostazione iniziale:
`framecraft.connections.json` è vuoto, il gateway browser in `framecraft.runtime.json` è disabilitato
e nessun endpoint, topic, nodo o segreto o collegamento viene inventato. L'anteprima dell'editor continua
a usare la simulazione esplicita, non si collega automaticamente al servizio.

1. Dichiarare i tag e il loro accesso in `framecraft.plc.json`.
2. Aprire **Pannello → Connessioni PLC** nell'editor. Aggiungere broker MQTT o server OPC UA, scegliere i tag
   dichiarati e i topic reali, configurare valore/qualità/timestamp e i riferimenti ambiente/TLS.
   **Guida rapida** apre cinque passi e approfondimenti nello stesso dialogo, anche se il
   catalogo non è leggibile; non salva né avvia rete. Le opzioni avanzate comprendono QoS,
   timeout e permessi di scrittura. Per OPC UA configurare Namespace URI, nodi e PKI come descritto sotto.
3. Abilitare esplicitamente servizio, connessione e client del pannello, poi **Salva configurazione**.
   Questo salva `framecraft.connections.json` e `framecraft.runtime.json`, non avvia alcun servizio,
   non verifica credenziali/CPU/certificati e non scrive tag PLC. Il client mantiene il percorso
   `/_framecraft/plc/v1` e un `pollMs` di almeno 100 ms. È ancora possibile configurare i JSON a mano.
4. Installare il servizio con `npm --prefix runtime install`. Conservare il lockfile risultante.
5. Configurare token e credenziali nell'ambiente del servizio e del proxy server, mai in variabili
   `VITE_*`, JSON pubblico o bundle browser. Il token deve essere casuale e lungo almeno 32 caratteri.
6. Avviare `npm --prefix runtime run gateway` e il pannello. Il proxy locale in `vite.config.ts`
   legge il token solo nel processo server. In produzione serve un reverse proxy protetto.

Esempio di struttura: nomi tag, indirizzo, topic e origini sono segnaposto da sostituire con
mapping approvati della macchina. Partire con le scritture disabilitate.

```json
{
  "version": 1,
  "gateway": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 18884,
    "tokenEnv": "FRAMECRAFT_GATEWAY_TOKEN",
    "allowedOrigins": ["http://127.0.0.1:5173"],
    "allowWrites": false
  },
  "connections": [{
    "id": "linea-mqtt",
    "protocol": "mqtt",
    "enabled": true,
    "url": "mqtts://broker-macchina.example:8883",
    "usernameEnv": "PLC_MQTT_USER",
    "passwordEnv": "PLC_MQTT_PASSWORD",
    "allowWrites": false,
    "bindings": [{
      "tag": "Motor.Speed",
      "topic": "macchina/motor/speed",
      "qos": 1,
      "encoding": "json",
      "valuePath": "/value",
      "qualityPath": "/quality",
      "timestampPath": "/timestamp",
      "timestampUnit": "ms",
      "writeTopic": "macchina/motor/command",
      "writeQos": 1
    }]
  }]
}
```

L'origine comprende schema, host e porta esatti del pannello. Per test con una porta diversa
aggiornare l'allowlist. Nessun CORS indiscriminato. Il gateway ascolta solo sul loopback; il token
identifica il proxy/stazione, **non sostituisce l'autenticazione dell'operatore e i ruoli server**.
`npm --prefix runtime run mqtt` resta disponibile per diagnostica: messaggi leggibili nella
console e stati strutturati. `-- --json` rende le righe stdout/stderr JSON; `-- --samples`
abilita esplicitamente i campioni su stdout, che possono contenere dati aziendali. I valori
non entrano nel registro su disco. Non avviare due servizi con lo stesso client ID.
Anche `npm --prefix runtime run gateway -- --json` supporta diagnostica JSON; per raccogliere
solo JSON senza il preambolo npm, eseguire direttamente `node runtime/start-gateway.mjs --json`.

## Acquisizione e qualità

Le connessioni richiedono `enabled` esplicito e tag dichiarati. Credenziali tramite riferimenti
ambiente; TLS verifica i certificati. `tls.caFile`, `certificateFile` e `privateKeyFile` consentono
trust personalizzato e certificati client. MQTT/WS senza TLS richiede `allowInsecure: true`
esplicito e genera un avviso. Questo flag **non disabilita la verifica dei certificati** di
MQTTS/WSS; non usare trasporto in chiaro per aggirare trust o autenticazione.

Topic concreti, QoS 0/1/2 e JSON Pointer, senza codice eseguibile. Timestamp numerici con unità
`ms` o `s` dichiarata. Senza qualità nel payload il dato rimane di qualità sconosciuta, non Good
inventato; `receivedAt` è distinto dal timestamp sorgente. Errori conservano l'ultimo valore ma
lo marcano Bad; qualità Bad dalla sorgente conserva l'ultimo valore valido. UTF-8 invalido,
mapping/qualità/timestamp errati e overflow/underflow Real/Float sono rifiutati. `staleAfterMs`
opzionale va scelto sull'acquisizione reale e segnala anche un tag mai ricevuto. La cache non è uno
storico completo e il polling può perdere campioni intermedi veloci.

Tipi attuali: Bool, String/WString, interi 8/16/32 bit, Real/LReal/Float/Double.
Massimo 1000 connessioni e 5000 tag nel gateway, payload e richieste limitati. Array, strutture,
wildcard, mapping avanzati e Last Will sono ancora da aggiungere.

Ogni tentativo, iniziale o successivo, limita l'attesa di certificati, CONNECT e SUBACK.
Dopo una perdita transitoria il servizio crea una connessione e una sottoscrizione nuove:
non riutilizza i comandi pendenti. Primo avvio fallito, credenziali/TLS/versione/client ID
rifiutati o sottoscrizione negata terminano il collegamento: correggere la causa e riavviare
manualmente. Il conflitto di client ID è riconoscibile esplicitamente con MQTT 5 reason 142;
una semplice chiusura MQTT 3 non dimostra da sola quel conflitto.

## Diagnostica e registro locale

Nel pannello autonomo aprire **lo stato PLC in alto**: stato delle singole connessioni, ultimi
eventi, conseguenze e **Come risolvere**. La guida compatta è nello stesso riquadro. Gli errori
del gateway (servizio/proxy/token/origine) sono distinti da quelli del broker
(rete/autenticazione/subscribe/certificati) e dei tag (mapping/tipo/qualità/scadenza).

Il servizio Node mostra gli stessi rimedi in console e conserva JSONL locali nella cartella
del pannello, separati per servizio:

- Gateway: `.framecraft-runtime/logs/gateway/connections-0.jsonl`.
- Diagnostica MQTT: `.framecraft-runtime/logs/mqtt/connections-0.jsonl`.

Ogni servizio ruota tre file da massimo 1 MiB: `0` corrente, `1` e `2` precedenti. La rotazione
elimina il file più vecchio; non è uno storico permanente. La coda disco è limitata a 256 eventi;
errori ripetuti per codice/tag vengono raggruppati per cinque secondi con conteggio. Disco
bloccato/pieno o sovraccarico producono un avviso in console e non interrompono il trasporto;
il registro può essere incompleto. Il gateway conserva al massimo 100 eventi in memoria;
il riquadro ne mostra gli ultimi dieci, non ripete un evento a ogni polling.

Non vengono conservati URL/topic, password, token, percorsi di certificati, messaggi grezzi
del server, payload o valori dei comandi. Restano nomi di tag/connessioni, codice, ora, gravità,
conseguenza e rimedio: possono essere informazioni aziendali. La directory è esclusa da Git
nei nuovi pannelli standard, insieme a file ambiente/chiavi. Proteggere cartella e accessi
con ACL Windows o permessi Unix; non pubblicare log senza revisione. Usare una sola istanza
per directory di log. Non è audit industriale, storage durevole o garanzia antimanomissione.

Rimedi tipici: `NETWORK_*` → broker/indirizzo/porta/DNS/firewall; `AUTH_DENIED` o
`SUBSCRIPTION_DENIED` → variabili ambiente e ACL broker; `TLS_*` → CA/nome/scadenza/orologio,
mai disabilitare la verifica; `BAD_*` o `STALE_SAMPLE` → publisher/topic/tipo/percorsi JSON/frequenza;
`GATEWAY_AUTH` → stesso token privato nel servizio e proxy, mai nel browser. Un problema di
configurazione può impedire l'avvio: controllare la console del servizio, non solo il pannello.

## Comandi senza false conferme

Servono contemporaneamente `gateway.allowWrites: true`, `connection.allowWrites: true`, accesso
PLC `write`/`read-write` e mapping comando: `writeTopic` per MQTT oppure `writeEnabled`
e permesso corrente del nodo OPC UA. Il servizio verifica il tipo, non solo il browser.
Nel pannello generato usare l'API asincrona e attendere il risultato:

```ts
import { requestRuntimeTagWrite } from "./framecraftHmiRuntime";
const result = await requestRuntimeTagWrite("Motor.Speed", 30);
// result.delivery è una ricevuta di trasporto/broker/servizio UA, non l'esecuzione del PLC.
```

`setRuntimeTagValue` inoltra la richiesta senza attendere nel chiamante e mostra l'esito; non va
usata per sequenze che richiedono una conferma prima del passo successivo. Gli eventi compilati
IR, i moduli, i timer e lo Scheduler del pannello generato ora attendono il trasporto reale:

```js
const tags = Tags.CreateTagSet([["Motor.Speed", 30]]);
await tags.WriteAsync(); // ricevuta MQTT, NON conferma PLC
await tags.ReadAsync();  // campione acquisito, non il valore appena comandato
HMIRuntime.Trace(String(tags("Motor.Speed").Value));
```

Anche `Tags("Motor.Speed").Write(30)` sospende la sequenza dell'evento in modalità connessa.
La continuazione riparte una sola volta: effetti precedenti e inizializzatori dei moduli non
vengono rigiocati. `then/catch`, `await/try-catch` e batch parziali mantengono gli errori per tag;
se almeno un tag viene consegnato il batch prosegue, ma `LastError` segnala quelli falliti.
Il risultato dell'interprete separa `commands`, `reads` e scritture locali `writes`.
I tag dei faceplate e le loro closure timer rimangono locali, senza comandi MQTT.

Valore/tipo/permessi o collegamento non pronto: **non inviato**. Un rifiuto esplicito PUBLISH
MQTT 5 (PUBACK/PUBREC negativo) è **rifiutato**, con il rimedio broker; timeout/perdita della
risposta o ACK anomalo dopo PUBREC sono **incerti**. Il rifiuto non viene trasformato in
consegna. Reason 16 segnala assenza di destinatari, non esecuzione PLC. Anche QoS 2 non
giustifica un replay automatico del comando applicativo dopo un errore.

La lettura è dalla cache dei campioni ricevuti. `ReadMaxAge` verifica età dell'acquisizione
e per MQTT anche timestamp sorgente; `ReadAsync(1)` e `ReadMaxAge(0)` non fingono una lettura forzata CPU. **`WriteAsync(1)`
non è disponibile**: `hmiWriteWait` richiede conferma di scrittura nel PLC, non l'ack del broker.
Le operazioni QCD, messaggi operatore con audit server e bit atomici non supportati vengono
respinti prima dell'invio. Le dinamizzazioni sincrone non possono inviare scritture di rete.
Questi limiti non si applicano alla simulazione esplicita offline.

Contratti di riferimento: [TagSet.ReadAsync Siemens](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.readasync-rt-unified?contentId=sQDeQFvaOaZghUnNypiVBw),
[TagSet.WriteAsync Siemens](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/tags-rt-unified/tagset-rt-unified/tagset.writeasync-rt-unified?contentId=OYBeGQ4Z7oS6n7wN8jeOKQ)
e [ricevute QoS MQTT OASIS, sezioni 4.3.2/4.3.3](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html).
Framecraft usa il proprio runtime: sintassi simile non significa identiche garanzie PLC.

Stop del runtime e pagina/elemento non più attivi impediscono ulteriori effetti nel vecchio
contesto. Un timeout termina l'attesa e passa l'errore allo script, senza reinvii automatici.
L'attesa di rete ha un timeout separato e non consuma il budget CPU della IR.
L'annullamento non ritira un comando già inviato: l'esito può restare incerto. Nell'anteprima
Framecraft l'installazione del runtime connesso è bloccata anche se la configurazione è abilitata.

I comandi non sono retained, non sono accodati offline e non sono ripubblicati automaticamente
dopo una perdita di connessione. L'esito mancante è **incerto**: il comando potrebbe essere stato
eseguito, quindi non va ritentato automaticamente. `plcConfirmed` resta `false` anche con broker
ack QoS 1/2 o risposta Good del servizio Write OPC UA. Solo una nuova lettura aggiorna il valore visualizzato, mai un aggiornamento ottimistico.

L'API deduplica per ID per cinque minuti, solo in memoria, con massimo 1000 richieste registrate;
non garantisce exactly-once o deduplica dopo un riavvio. Serve un protocollo di conferma/idempotenza
nel PLC per comandi industriali che lo richiedono. La notifica a schermo distingue ricevuta,
rifiuto ed esito incerto.

## OPC UA scalare

Il gateway comune usa `node-opcua-client` 2.186.17 nel servizio Node (minimo 22.13.0,
baseline di deployment Node 24). Non viene distribuito un server OPC UA. L'editor salva
profili distinti MQTT/OPC UA; un tag non può avere due sorgenti attive.

1. Ottenere endpoint `opc.tcp://host:porta/percorso`, Namespace URI e identificatori reali
   dal responsabile macchina. Un binding contiene `tag`, `namespaceUri`, `nodeId`,
   `writeEnabled` (inizialmente false) e `staleAfterMs`. L'identificatore è `i=numero`,
   `s=testo`, `g=GUID` o `b=base64`, **senza ns=**. L'indice viene risolto a ogni sessione.
2. Selezionare modalità e policy offerte dal server: preferire `SignAndEncrypt` e
   `Basic256Sha256`, oppure le policy AES SHA256 supportate. Non vengono provate policy
   alternative o deprecate. `None/None` richiede consenso `allowInsecure: true` ed è
   soltanto per test isolati anonimi; utente/password in chiaro vengono rifiutati.
3. Preparare fuori dal bundle client `certificateFile` (PEM o DER), `privateKeyFile`
   (chiave PEM), `applicationUri` e `pkiDirectory`. URI, coppia chiave/certificato e
   validità devono corrispondere. Dare alla chiave permessi minimi per l'account servizio.
4. Verificare fuori banda il certificato del server con il responsabile e inserirlo nel
   trust store PKI del servizio (`trusted/certs`); configurare `issuers/certs` e CRL se
   richieste dalla catena. Il server deve a sua volta autorizzare il certificato client.
   Certificati sconosciuti restano rifiutati: non accettarli per il solo fatto che
   compaiono in `rejected`. Hostname/IP e URI server devono corrispondere al certificato
   del canale effettivo. Non disattivare le verifiche per aggirare un errore.
5. Per accesso nominale impostare **solo** `usernameEnv` e `passwordEnv`, entrambi,
   e i valori privati nell'ambiente Node. Il server decide i permessi; l'anonimo non
   implica diritto di scrittura. Abilitare gateway, connessione e client con le
   scritture disabilitate, salvare e avviare manualmente il servizio come sopra.

Il trust store viene caricato all'avvio, senza watcher: dopo modifiche a PKI o profili,
riavviare manualmente il servizio. Errori di trust/accesso/mapping fermano la connessione,
non generano tentativi ripetuti; i guasti di rete possono ricreare una sessione.
La diagnostica sanificata Framecraft sostituisce nel processo PLC i dump grezzi dell'SDK.

Tipi iniziali: Bool, interi 8/16/32 bit con segno o senza, Real/Float, LReal/Double,
String/WString. Tipo built-in, ValueRank scalare e UserAccessLevel vengono verificati
prima di dichiarare il collegamento pronto e prima di ogni comando. Array, UDT, subtype
custom, 64 bit, DateTime, browsing/import, metodi, eventi e allarmi OPC UA restano fuori
dal driver iniziale: un mapping incompatibile è un errore, non un dato convertito a caso.

Subscription e letture periodiche reali mantengono la cache. `receivedAt` misura una
vera acquisizione, non un keepalive; source/server timestamp e StatusCode uint32 restano
distinti. La severità UA è mappata a Good=192, Uncertain=64, Bad=0 conservando il codice
originale. Il timestamp sorgente può restare invariato se il valore non cambia: la
freschezza OPC UA per ReadMaxAge usa l'acquisizione reale. In caso di dati non validi si
conserva l'ultimo valore, senza renderlo Good. Perdita sessione e scadenza rendono Bad.

Un comando richiede tutti i consensi: gateway, connessione, catalogo scrivibile,
`writeEnabled` del binding e permesso corrente OPC UA. `delivery: "opcua-service"`
significa risposta Good del servizio Write, **non esecuzione fisica del PLC**:
`plcConfirmed` resta false. Bad esplicito è rifiuto; risposta persa/timeout dopo l'invio
è incerta. Nessuna coda offline, reinvio automatico o aggiornamento ottimistico della cache.

Fonti ufficiali: [client Unified V21](https://docs.tia.siemens.cloud/r/en-us/v21/opc-ua-open-platform-communications-rt-unified/wincc-unified-opc-ua-client-rt-unified/using-the-wincc-unified-opc-ua-client-rt-unified),
[certificati Optix](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-00/contents-ditamap/using-the-software/opc-ua/opc-ua-communications-security/certificates-and-keys.html),
[API Node OPC UA](https://node-opcua.github.io/api_doc/latest/interfaces/node-opcua-client.index.OPCUAClientOptions.html).
L'implementazione è Framecraft autonoma, non un adapter per i Runtime proprietari.
Le prove sintetiche loopback non sostituiscono il collaudo CPU, trust e rete aziendali.

Inventario licenze OPC UA dal lockfile editor: 127 pacchetti, nessuna dipendenza mancante.
Restano due revisioni esplicite: `precond@0.2.3` non dichiara license nel manifest/lockfile
(il README installato indica MIT, ma occorre conservare la notice completa verificata);
`tweetnacl@0.14.5` dichiara Unlicense, da valutare secondo la policy della distribuzione.
Client, certificate-manager e debug dichiarano MIT, ma questo non approva automaticamente
l'intero grafo né sostituisce le notice. Il server SDK è soltanto una dipendenza di test.

## Ricette: archivio dati server, non trasferimento PLC

Il pannello esportato include `framecraft.recipes.json`, inizialmente `{ "version": 1,
"schemas": [] }`, e i moduli `recipe-catalog.mjs` / `recipe-store.mjs` con i rispettivi tipi.
Non sono inserite ricette dimostrative o parametri macchina. In Framecraft, **Pannello → Ricette**
configura schemi scalari e ricette iniziali senza AI: campi tipizzati, limiti, valori espliciti,
copia/rimozione e import JSON Framecraft con approvazione della bozza prima del salvataggio.
La chat progetto può proporre modifiche al solo catalogo iniziale, dopo una lettura richiesta
e con confronto dei valori, approvazione e backup. Non accede ai file operativi del servizio.
I form operatore Runtime e la pagina del wizard iniziale non sono ancora cablati al servizio.
Non confondere l’archivio con l’applicazione della ricetta al PLC.

Il dialogo salva solo il catalogo iniziale, con snapshot della sessione e confronto del file
su disco. Se esiste `.framecraft-runtime/recipes`, anche incompleta, resta in sola lettura:
non elimina file o lock e non riscrive i valori operativi. Il controllo nativo verifica
sessione, file regolare, dimensione e involucro JSON v1; la validazione completa dei campi è
nel parser condiviso UI/servizio, non duplicata nel codice Rust. Una configurazione errata non
viene mostrata grezza o sostituita con un catalogo vuoto. Il salvataggio non riavvia servizi.
Fermare il servizio prima di preparare la configurazione e coordinare avvii esterni: il check
dei file non è una transazione distribuita con un altro processo che inizializza l’archivio.

La pipeline AI mantiene i limiti propri: file fino a 300 kB, estratti fino a 30 kB per file,
80 kB per passaggio e 180 kB complessivi. Il contratto ricette e un indice limitato degli schemi
compaiono solo dopo una lettura del catalogo; non vengono aggiunti tutti i valori a ogni messaggio.
La verifica dello stato operativo è ripetuta prima di applicare/ripristinare, anche nel nativo.
Il backup della proposta non autorizza a riscrivere la configurazione dopo l’inizializzazione
del servizio. Proposte multi-file non sono transazioni atomiche; eventuale recovery va verificata.
Consenso della chat aggiornato per rendere espliciti schemi e valori iniziali condivisibili;
autorizzazioni della sessione precedente non ampliate implicitamente. Nessuna chiamata AI reale
o configurazione Windows è avviata dall’apertura dell’editor ricette.

Il formato Framecraft v1 contiene fino a 32 schemi `{ id, name, fields, records }`. Ogni campo
ha `id`, `name` e `type` (`boolean`, `integer`, `number`, `string`), più `unit`, `minimum`,
`maximum` o `maxLength` quando applicabili. Ogni ricetta è `{ id, name, values }`: tutti i
campi devono essere presenti, senza extra, conversioni o valori iniziali presunti. Interi
JavaScript sicuri, numeri finiti, massimo 64 campi e 500 ricette per schema; stringhe fino a
1024 unità UTF-16 e catalogo fino a 2 MB. Nomi unici nello schema anche ignorando maiuscole
e normalizzando Unicode. Questi tipi non sono mapping automatici a tipi/tag PLC o UDT.

`openRecipeStore({ directory, catalog, onChange? })` apre un archivio dedicato su disco locale.
La directory deve avere un genitore esistente e canonico; symlink/junction e hard link sono
rifiutati. Il servizio standard usa `.framecraft-runtime/recipes/` solo se il gateway è
abilitato e il catalogo contiene schemi. Un catalogo mancante resta vuoto. Catalogo o archivio
guasti disabilitano le ricette con diagnostica, senza fermare il monitoraggio PLC.

`store.id` identifica l’archivio; `recipes.json` contiene dati e ultime 256 ricevute operative.
Il lock esclusivo `recipes.lock` riporta PID, istanza e data, ma non è una prova di liveness:
non viene rimosso per età, timeout o semplice presenza di un PID. File mancanti dopo la prima
inizializzazione, contenuto corrotto o schema cambiato richiedono recovery/migrazione esplicita;
non vengono sostituiti con i valori iniziali. Fare backup coerente di entrambi i file a servizio
fermo e verificare il ripristino. I temporanei di un’operazione fallita non sono backup.

Il salvataggio usa file temporaneo esclusivo, flush, confronto della revisione e pubblicazione
locale; dove supportato sincronizza anche la directory. Un solo writer, senza coda o retry
automatici. La revisione SHA-256 identifica il contenuto, non firma né cifra i dati. Un errore
dopo il tentativo di pubblicazione è incerto: rileggere stato e ricevuta, non reinviare con un
nuovo ID. Un lock rimasto richiede verifica del processo/istanza e recovery da parte dell’IT.
Limite archivio 4 MiB; nessun troncamento. Non è un database HA, storage condiviso/NFS, audit
regolamentato o garanzia contro ogni perdita di alimentazione. Su Windows configurare ACL
minime per l’account servizio: i mode Unix non sostituiscono le ACL. Anche su altri sistemi
directory e backup devono essere protetti da modifiche esterne durante il servizio.

API sotto `/_framecraft/plc/v1/recipes`, sempre con token/origine del gateway e ulteriore
sessione/capacità locale server, oppure `authorizeRecipeAction(request, command)` nell’embedding.
Il callback deve verificare una vera
sessione/identità e il permesso dell’azione, poi restituire l’ID del soggetto, mai il token,
il valore di un header non verificato o il PIN browser. Il launcher standard integra soltanto
account locali configurati esplicitamente; senza identità nega l’accesso.

- `GET`: snapshot con revisione, sequenza, schemi e ricette. Richiede azione `read` autorizzata.
- `POST`: `id` univoco, `expectedRevision`, `action`, `schemaId`, `recordId`; `create`/`update`
  richiedono `name` e tutti i `values`, `rename` solo `name`, `copy` `name` e `targetId`, `delete`
  nessun campo extra. `import` richiede `recordId: "batch"`, `fields` e `records` completi:
  unisce per ID senza eliminazioni e salva il gruppo in una sola mutazione. Serve capacità
  `recipes.import` e il limite `recipeChanges` sullo schema. Corpo massimo 2.100.000 byte;
  il catalogo risultante deve restare entro 2 MB. Un actor nel JSON non è accettato.
- ID ripetuto con identico contenuto e soggetto, fra le ultime 256 mutazioni, restituisce la
  ricevuta senza applicare ancora; contenuto/soggetto differente o revisione obsoleta è conflitto.
  La deduplicazione persiste alla riapertura. Una vecchia ricevuta può uscire dalla finestra:
  la revisione obsoleta resta rifiutata. Non è un invito al reinvio automatico.

Gli esiti dicono `effect: recipe-storage-only` e `plcConfirmed: false`. `gateway.allowWrites`
regola i comandi PLC, non concede permessi sulle ricette. Arrestare il gateway attende le
mutazioni già accettate; autorizzazioni arrivate dopo l’arresto non avviano nuove operazioni.
Diagnostica distinta con codice, conseguenza e rimedio, senza errori grezzi, percorsi, credenziali
o valori ricetta. `onChange` notifica solo metadati tecnici; il registro locale delle ricevute
contiene soggetto e data, non un audit immutabile con firme e valori prima/dopo.

Il wizard e l’editor iniziale preparano il catalogo; il form operatore è descritto sotto.
Restano autorizzazioni applicative effettive, UDT/array, import/export
CSV/TSV vendor, migrazione, database industriale, confronto PLC e handshake di apply/upload.
Nessun metodo del servizio invia comandi MQTT/OPC UA. I riferimenti funzionali sono le
[ricette Optix](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes.html)
e i [parameter set Unified](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-rt-unified/controlling-with-parameter-sets-rt-unified),
non una promessa di round-trip o parità vendor. Le garanzie di flush restano quelle di
[Node e del dispositivo](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlesync).

## Importare ed esportare ricette dal pannello

Nel controllo **Archivio ricette**, dopo **Rileggi archivio**, trovi **Scambio ricette con file**.
Questa funzione non legge né scrive tag PLC e non cambia lo schema del progetto.

1. Seleziona lo schema e premi **Esporta schema JSON**. Il browser scarica tutte le sue ricette
   dalla copia già letta, con ID, tipi, unità, limiti, revisione, sequenza e data UTC di export.
   Per una copia più recente premi prima Rileggi archivio. Il file contiene valori macchina:
   proteggilo come gli altri documenti dell’impianto. Non contiene account, password, token o
   mapping PLC. Il download locale non è certificato né registrato come evento server.
2. Per importare scegli un file JSON Framecraft v1, UTF-8, massimo 2.000.000 byte. Il file è
   letto localmente; non è inviato finché non confermi. Schema ID e campi (ordine, tipi, unità
   e limiti compresi) devono coincidere con la destinazione. Nessuna conversione di tipi,
   sostituzione con default o creazione automatica di uno schema.
3. Controlla il riepilogo nuove/sostituite/identiche/conservate e apri i dettagli prima/dopo.
   Si abbina per ID, non per nome: un ID esistente sostituisce nome e valori, uno nuovo crea
   una ricetta. Le ricette non presenti nel file restano intatte. Nomi duplicati o un singolo
   campo invalido bloccano l’intero gruppo, senza salvare prima le righe valide.
4. **Conferma importazione nell’archivio** richiede esplicitamente `recipes.import` sul server;
   creare/modificare singole ricette non basta. I limiti per schema configurati continuano ad
   applicarsi. Negli archivi account ancora al formato 1, questa capacità vale per tutti gli
   schemi: per restringerla configura **Risorse consentite**, con migrazione esplicita al formato 2.
   Gli account esistenti non ricevono la nuova capacità automaticamente. Dopo l’aggiornamento
   riavvia Framecraft per aggiornare anche l’helper locale di amministrazione degli account.
5. Se il servizio rifiuta la revisione, rileggi l’archivio e scegli **Rigenera confronto sulla
   copia riletta**; ricontrolla i nuovi valori prima di confermare. Non si usa come destinazione
   la revisione dichiarata nel file. Risposte perse usano la stessa protezione/ID descritta sotto,
   senza replay automatico. Il cambio utente rimuove copia letta, confronto e corpo ripetibile
   della richiesta precedente (resta solo l’ID da verificare); il download già
   salvato sul dispositivo resta responsabilità dell’operatore.

Il formato è `{"format":"framecraft.recipes","version":1,"source":{...},"schema":{...}}`;
`schema` contiene lo stesso contratto scalare del catalogo, incluse le ricette. È un formato
Framecraft, **non** il CSV del RecipeImportExport Optix né il TSV del Parameter Set Unified.
Non è un backup completo di `store.id`, ricevute, audit o progetto, e non ne ripristina le identità.
Il registro server annota richiesta/esito, soggetto e schema (`recordId: "batch"`), non i valori.
CSV/TSV con mapping, firma/verifica di provenienza e migrazione fra schemi restano da implementare.
Vecchi pannelli richiedono un aggiornamento esplicito del Runtime, non solo l’inserimento del div.
Un Runtime precedente che non conosce l’azione `import` non va riutilizzato dopo nuove importazioni:
aggiornare insieme servizio e interfaccia; provare backup/restore e aggiornamento sul target finale.

## Form operatore ricette

Nei nuovi progetti, la pagina guidata **Ricette e formati** contiene `HmiRecipeControl`.
Lo stesso elemento è in Aggiungi → HMI e PLC → Archivio ricette. I vecchi progetti richiedono
un aggiornamento esplicito del Runtime; inserire il div da solo non aggiorna il servizio.
In Modifica resta un segnaposto, senza letture o scritture. In Prova pannello/Runtime:

1. Configura catalogo, gateway/proxy e gli account locali server descritti sotto, poi accedi
   dal pulsante utente del pannello. Senza questa configurazione il launcher nega l’accesso;
   non togliere il controllo e non usare token, header browser o PIN locali come identità.
2. Premi **Rileggi archivio**. Ogni richiesta usa la stessa origine e le credenziali di sessione;
   il segreto del gateway resta nel proxy. Non esistono lettura automatica o polling delle ricette.
3. Seleziona schema e ricetta, poi Nuova/Modifica/Copia/Rinomina/Elimina. Compila tutti i campi:
   zero e falso sono scelte esplicite; Usa testo vuoto è distinto da campo mai compilato.
   Decimali con punto o virgola, senza separatori delle migliaia; tipi e limiti restano quelli
   dello schema. **Verifica operazione** mostra prima/dopo; **Conferma salvataggio** invia una
   sola richiesta all’archivio. Non è un apply, download/upload o consenso macchina.
4. Se un altro operatore cambia l’archivio, la bozza resta visibile. Rileggi, confronta i valori
   attuali e scegli esplicitamente se usare la nuova revisione per la bozza. Nessun merge o
   sovrascrittura automatica, anche se due controlli sono sulla stessa pagina.
5. Se manca una risposta dopo POST, non creare un altro ID: il form blocca nuove modifiche.
   **Verifica ripetendo la stessa richiesta** usa lo stesso ID/corpo ed è disponibile soltanto
   finché quel corpo resta in memoria; la conferma avvisa che, se non era arrivato, potrebbe
   essere salvato adesso. Dopo un reload resta soltanto l’ID: rileggi e confronta l’archivio,
   poi **Ho confrontato l’archivio: continua** chiude l’avviso senza certificare un esito.

Il marker in sessionStorage è separato per progetto (`framecraft.recipes-ui.json`) e percorso.
Contiene solo l’ID, mai valori/nomi/credenziali; i payload non sono registrati nella diagnostica.
Storage assente/quota/bloccato impedisce un nuovo POST, senza togliere la lettura. Marker non
leggibile resta da verificare, non viene riparato/cancellato automaticamente. Il marker non è
una ricevuta server né un backup: non chiudere la sessione browser o cancellarne i dati prima
della verifica; per assistenza conserva l’ID riportato nel messaggio/registro.

Le bozze non sono persistenti. Menu e cambio dispositivo chiedono conferma prima di scartarle,
e durante la richiesta il cambio pagina è bloccato. Beforeunload è solo un avviso quando il
browser lo consente: crash, Back/history SPA, chiusura nativa, multi-tab, touch fisico e proxy
HTTPS/SSO reali restano da collaudare. La pagina guidata ha form mobile fluido, senza ridurre
i comandi; un widget inserito in una pagina personalizzata non riscrive il layout circostante.
Permessi visivi/disabilitazione sono rispettati dal controllo ma non sostituiscono il server.

## Account operatore locali sul server

Nei nuovi progetti l’accesso è nel pulsante utente della barra del pannello, anche da tastiera.
Non è il login ChatGPT/Codex dell’AI né il vecchio PIN grafico: non vengono importati PIN,
utenti o permessi dal browser. I progetti precedenti richiedono aggiornamento esplicito del
Runtime e della configurazione Vite, non una sostituzione automatica degli account.

Flusso e confini:

```text
Pulsante utente → POST stessa origine → proxy (token solo server) → gateway
  → archivio privato operators.json → verifica password → cookie HttpOnly + CSRF in memoria
Comando ricetta/allarme/tag → sessione + origine + CSRF + capacità → archivio/driver
```

Preparazione da parte del responsabile, nella cartella `runtime` del progetto generato:

1. Esegui `npm run operators -- add` in un terminale interattivo. Scegli username, nome,
   etichetta ruolo, capacità server e permessi grafici. Password di almeno 12 caratteri,
   nascosta e richiesta due volte; conferma con SALVA. Nessuna password da argomenti,
   variabili d’ambiente o chat. Non esistono amministratore, password o concessioni predefinite.
2. Le capacità ricette sono `recipes.read/capture/create/update/copy/rename/delete/import`;
   sono disponibili anche `alarms.acknowledge`, `alarms.confirm`, `alarms.history.read`,
   `tags.write` e `audit.read`. Inserisci gli ID completi separati da virgola oppure
   `nessuno`. Il ruolo è solo un’etichetta. I permessi grafici (`comandi`, `parametri`,
   `manutenzione` o ID personalizzati) controllano visibilità/reazione, non concedono capacità
   server. Tutti i consensi gateway/connessione/mapping restano necessari per scrivere tag.
3. In `framecraft.auth.json` conserva namespace/versione generati, imposta `enabled: true`
   e scegli timeout: `idleMinutes` 1–60, `absoluteMinutes` da idle fino a 480. In produzione
   `allowHttpLoopback: false`, origine HTTPS esatta in `gateway.allowedOrigins` e reverse
   proxy stessa origine. Per una prova **solo locale** puoi impostare `allowHttpLoopback: true`
   con origini esclusivamente HTTP localhost/127.0.0.1/[::1]. Non abilitarlo per LAN/Internet.
4. Configura gateway e proxy come sopra; avvia il servizio. Nel pannello apri il pulsante
   utente, inserisci username/password e Accedi al pannello. Verifica accesso rilegge la
   sessione; Esci/cambia utente la revoca sul server. Login/logout sono espliciti, mai ritentati
   automaticamente. Bozze ricetta e richieste pendenti vengono verificate prima del cambio.

Altri comandi: `npm run operators -- list`, `password`, `permissions`, `disable`, `enable`.
Ogni modifica valida confronta la revisione su disco, usa lock esclusivo e pubblicazione atomica;
un conflitto non sovrascrive. Non cancellare lock o file corrotti per sbloccare il servizio:
verifica processo proprietario/backup con il responsabile. Non ci sono reset, riparazioni,
migrazioni, cancellazione utenti o recupero password automatici. Puoi usare il terminale sul
server oppure la gestione locale nell’app Framecraft descritta sotto. Nessuna API amministrativa
è esposta dal browser del pannello; il vecchio editor PIN è una funzione di compatibilità distinta.

File privato: `.framecraft-runtime/security/operators.json`, fuori da Git, public e dist.
Contiene hash scrypt con salt casuale, mai password in chiaro: N=131072/r=8/p=1, 128 MiB per
derivazione, massimo due derivazioni contemporanee. Scelta senza nuove dipendenze Node e con
[profilo scrypt OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt);
restano da misurare latenza/RAM sul target minimo. Limite 64 account e 128 sessioni, 8 per account;
massimo 5 tentativi/minuto per username e 30/minuto per processo, senza coda. Non è un limite
distribuito o un blocco permanente dell’account. File assente/non regolare/corrotto nega l’accesso,
non genera nuovi account. Proteggi cartella e backup con ACL dell’account servizio: mode POSIX
non configura ACL Windows. Solo dist deve essere web root in produzione; nessun alias/symlink
pubblico verso i file privati. La configurazione Vite generata nega `.framecraft-runtime`,
segreti e certificati tramite [fs.deny](https://vite.dev/config/server-options#server-fs-deny),
che non filtra public né loader personalizzati: non spostare lì questi file.

Sessioni opache solo in memoria server, cookie HttpOnly/SameSite=Strict e Secure su HTTPS,
CSRF non persistito nel browser, origine esatta obbligatoria per login/logout e mutazioni.
Polling dello stato e letture non rinnovano l’inattività; un comando autorizzato sì, mai oltre
la durata assoluta. Riavvio, modifica password/permessi, disabilitazione o cambio archivio
revocano tutte le sessioni. GET sessione non concede permessi. Il gateway verifica ogni azione,
anche richieste duplicate: il token proxy da solo non abilita più la scrittura dei tag.
Gli embedding personalizzati possono usare callback server espliciti, mai attori dal browser;
con account locali configurati, i callback non possono aggirarli. Un comando già accettato
può terminare dopo logout/revoca: non è un arresto di sicurezza della macchina.

API riservata al proxy: GET `/_framecraft/plc/v1/session`, POST `/session/login` con soli
`username/password`, POST `/session/logout` con `{}`. Risposta con profilo/capacità, CSRF e
durata residua, mai hash o password. Mutazioni con cookie e `X-Framecraft-CSRF`. Errori
`AUTH_CONFIG/STORE` (503), `AUTH_CREDENTIALS/REQUIRED` (401), `AUTH_PERMISSION/CSRF/ORIGIN`
(403), `AUTH_THROTTLED/BUSY` (429) hanno messaggio e rimedio italiani; non mostrano input,
percorsi, stack o credenziali. Logout senza risposta non significa logout riuscito: Verifica
accesso e ripeti solo l’uscita confermata. Eventi AUTH_LOGIN/LOGOUT/CREDENTIALS/PERMISSION/
THROTTLED contengono solo codice, attore server quando noto e timestamp, non password/cookie/
CSRF o valori PLC. Per ora sono output del servizio, non un audit persistente e immutabile.

Questo è controllo per capacità dell’intero pannello, non ancora ACL per singolo tag, pagina,
ricetta o gruppo allarmi. Lettura snapshot PLC resta del proxy/gateway, non segregata per utente.
Niente UMC/SSO/MFA, amministrazione remota, revoca distribuita o replica sessioni. Da verificare
proxy HTTPS/cookie reali, browser/device multipli, ACL/backup/recovery e carico sul target.
Salvare ricette non trasferisce valori al PLC; consegna driver non significa conferma PLC.

### Registro persistente delle operazioni Runtime

Il servizio distribuito attiva il registro quando configuri e abiliti gli account locali.
Scrive in `.framecraft-runtime/audit/audit.sqlite`, con `identity.json` associato al namespace
di `framecraft.auth.json`. Non registra password, cookie, CSRF, token gateway, valori PLC o
valori delle ricette. Conserva ID dell’operatore verificato, risorsa, ID comando, traccia,
ora UTC del server, fase ed esito. Un’identità non verificata resta anonima, non viene
dedotta da username dichiarati o header del browser.

Registra accessi/uscite, richieste di modifica valide instradate dal gateway e rifiuti di
autorizzazione su quelle operazioni. Tag: nome esatto; allarmi: ID; ricette: schema, record e
destinazione della copia. Non registra polling, letture, tutti i tentativi scartati dal
trasporto prima dell’instradamento o modifiche amministrative locali agli account.

```text
Comando validato → identità e autorizzazione server → richiesta registrata e sincronizzata
  → effetto → esito registrato e sincronizzato → risposta HTTP
```

- `applied` conferma una modifica all’archivio ricette o allo stato locale degli allarmi.
  Non è una scrittura PLC.
- `delivered` distingue broker ACK, servizio OPC UA e solo trasporto tramite il codice.
  Non conferma l’applicazione nel programma macchina: `plcConfirmed` non viene inventato.
- `duplicate` è una consultazione dell’esito già noto, non un nuovo invio. Anche un esito
  duplicato può essere incerto; leggi il codice, non dedurre successo dal solo duplicato.
- `uncertain` o una richiesta senza esito terminale richiedono verifica sullo stato reale.
  Un arresto tra le due registrazioni non è prova di mancato invio. Il registro non è una
  coda di comandi: nessun replay all’avvio, al ripristino del disco o alla riapertura del lettore.

Se il registro manca dove era già inizializzato, è incoerente, bloccato o pieno, il servizio
non avvia nuovi comandi. `AUTH_AUDIT`, `AUTH_AUDIT_BUSY` e `AUTH_AUDIT_LIMIT` hanno rimedi statici,
senza errori grezzi del filesystem. Dopo un effetto non registrabile, `AUTH_AUDIT_UNCERTAIN`
resta incerto anche nei client browser/ricette; il checkpoint non viene cancellato come se
fosse un rifiuto. Il logout revoca la sessione anche se non riesce a registrare l’uscita.
Il monitoraggio resta disponibile. Gli embedder del gateway devono fornire `audit.append`;
assenza/errore non diventano consenso e nessun callback viene ritentato automaticamente.

Per il responsabile, dal progetto sul PC del servizio:

```powershell
npm --prefix runtime run audit -- --limit=100
npm --prefix runtime run audit -- --limit=100 --before=250
npm --prefix runtime run audit -- --json
npm --prefix runtime run operators -- list
```

Il lettore verifica la catena completa, mostra gli ultimi eventi con paginazione e conta
separatamente richieste senza esito ed eventi incerti. È di sola lettura: non inizializza,
tronca o ripara file, non contatta PLC o AI. La lista operatori espone ID archivio/account per
interpretare `local:<ID archivio>:<ID account>`; non restituisce hash o password. La lettura
è riservata ai permessi del sistema operativo, non è un endpoint HTTP né un Viewer HMI pubblico.

Architettura: SQLite incorporato in Node, nessuna nuova dipendenza npm. Transazioni
`BEGIN IMMEDIATE`/`COMMIT`, `synchronous=FULL`, WAL, estensioni disabilitate e query
parametrizzate. Sequenza e catena SHA-256 legate all’ID del registro; verifica completa
all’apertura/lettura e quando cambia un altro writer, ancora in memoria per il writer corrente.
Percorsi canonici, file regolari, nessun hard link/symlink accettato; database/sidecar sotto
cartella privata. Il servizio aspetta effetti/audit già avviati prima di chiudere il registro,
non autorizzazioni esterne tardive: dopo l’arresto non possono avviare operazioni né usare il writer chiuso.
WAL evita che il lettore del registro trattenga i comandi; checkpoint automatico a 1000 pagine
e journal-size target 8 MiB. Anche un lettore read-only può usare/creare i sidecar di coordinamento
SQLite: non modifica eventi e non inizializza un nuovo archivio. I sidecar fanno parte dello
stato persistente: non separarli dal database per una copia a caldo. Solo filesystem locale,
nessun percorso UNC; unità mappate/NFS e cartelle sincronizzate richiedono verifica sul target.

Limiti: 64 MiB e 100.000 eventi, senza cancellazione o rotazione distruttiva automatica.
L’embedder può abbassare `recordLimit`, non superare il massimo. Al raggiungimento serve
archiviazione/manutenzione verificata dal responsabile, a servizio fermo; questa versione
non offre ancora una procedura automatica di archiviazione/restore. Non eliminare database,
identity o journal; non cambiare namespace per sbloccare il servizio. Backup coerenti e ACL
Windows devono coprire l’intera cartella privata. Se entrambi i file vengono rimossi da chi
può modificare il filesystem, non esiste un’ancora esterna per provare la perdita della storia.

La catena rileva incoerenze, **non è una firma digitale né una certificazione antimanomissione**.
Un amministratore OS può riscrivere file e checksum. Restano firme/motivi, conservazione
immutabile/remota, audit amministrazione/trasporto, firma/commento dei record e archiviazione,
clock/NTP, guasti reali e prove di carico/power-loss sul target. L’API Node SQLite è disponibile
da Node 22.13 senza flag ma ancora sperimentale in quella linea; in Node 24.15+ è Release
Candidate. I collaudi qui usano Node 24.19, non certificano altre versioni o un impianto.
È verificata anche la versione SQLite effettiva, prima di toccare i file: almeno 3.51.3,
oppure i rami corretti 3.50.7+ / 3.44.6+. Versioni vulnerabili al WAL-reset sono rifiutate
con `AUTH_AUDIT_NODE`, senza fallback o disattivazione dell’audit. Il database ha limite 64 MiB;
un WAL trattenuto da lettori prolungati è sorvegliato separatamente (65 MiB), non cresce senza
controllo. Target e archiviazione devono considerare anche i file accessori.

Riferimenti primari: [WinCC Unified Audit V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-audit-rt-unified/basics-rt-unified/audit-option-rt-unified?contentId=tjOBGUNlLkF_l5CRmzhULQ),
[Optix Event logger](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/logger/event-logger.html),
[Node SQLite 22.13.1](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html),
[Node SQLite LTS 24](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).
[SQLite WAL, backup e WAL-reset](https://sqlite.org/wal.html).
Firme e conformità dei vendor non sono equivalenze già ottenute da Framecraft.

### Consultare il registro dal pannello HMI

Nei pannelli generati con il Runtime aggiornato puoi inserire **Aggiungi componenti → HMI e PLC →
Registro attività** in qualsiasi pagina. In Modifica rimane un segnaposto: la consultazione reale
avviene nel pannello in esecuzione, non nel ponte dell’editor.

1. Configura e abilita gli account locali e il gateway come descritto sopra, sul PC del servizio.
   Nei nuovi progetti restano disabilitati; non vengono creati utenti predefiniti.
2. Assegna esplicitamente la capacità **Consultare il registro attività del servizio** (`audit.read`)
   all’account autorizzato, tramite GUI o CLI account. Il nome del ruolo non la concede.
   Questa capacità permette di leggere tutto il registro del servizio: i filtri non sono ACL.
3. Inserisci il componente, apri il pannello e accedi con quell’account. Premi **Carica registro**.
   Non parte alcuna lettura del registro prima del comando e non esiste aggiornamento periodico.
4. Scegli operazione, esito, ID operatore esatto o intervallo di date, poi aggiorna dalla prima
   pagina. Le date dei filtri seguono il fuso del dispositivo; l’ora UTC originale resta nei dettagli
   di ogni evento. **Eventi precedenti** conserva filtri, identità dell’archivio e sequenza iniziale.
   Modificare i filtri non cambia i risultati già mostrati finché non li applichi.

Il servizio espone `GET /_framecraft/plc/v1/audit` soltanto a una sessione con `audit.read`, oltre
al consueto token del proxy server. Non esiste una chiave nel browser. Le letture non rinnovano
il timeout per inattività, non aggiungono eventi al registro e non eseguono comandi PLC. Il cambio
utente o la scadenza dell’accesso rimuovono i risultati dal controllo; nessun evento viene conservato
in localStorage/sessionStorage. Altri client possono registrare nuovi eventi durante la paginazione:
ritorna alla prima pagina per includerli. Un archivio diverso o una sequenza ripristinata vengono
segnalati, non mescolati. Le richieste ravvicinate possono essere respinte come servizio occupato:
attendi e riprova manualmente, senza cicli di richieste.

Mostra al massimo 50 eventi per pagina, con filtri applicati prima del limite sul server. I contatori
di esiti incerti e richieste senza esito terminale riguardano il registro completo, non solo il filtro.
L’operatore è l’ID stabile registrato dal servizio: non viene ricostruito un nome storico. Le righe
distinguono richiesta, esito e consegna al trasporto; **consegnato non significa confermato dal PLC**.
La catena verificata dal servizio non è una firma digitale né una certificazione normativa.

Questa prima vista non aggiunge commenti, firme, esportazione CSV, query salvate o apertura di
archivi offline. Per la verifica da terminale resta `npm run audit -- --json`. Sono ancora necessari
collaudi sul target, clock/NTP, guasti reali e carico; non dichiarare il progetto pronto per produzione
soltanto perché il registro è consultabile.

Riferimenti funzionali, non dipendenze o formati importati:
[Audit Viewer Unified V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-audit-rt-unified/basics-rt-unified/audit-viewer-rt-unified?contentId=_Gg68rYFKeU2yUIBYRS7kQ) e
[Event Logger Optix](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-03/contents-ditamap/using-the-software/logger/event-logger.html).

### Risorse consentite per account

Apri **Pannello → Account del pannello**, seleziona un account e premi **Risorse consentite**.
Per ogni gruppo scegli nessuna, solo gli ID indicati, oppure tutte (comprese le future).
Puoi aggiungere dal catalogo locale del progetto o scrivere un ID esatto per riga.
La configurazione non si collega a PLC/server remoti e non prova l’esistenza della risorsa
sul target. Cataloghi non leggibili non concedono permessi né cancellano gli ID già assegnati.

- Scritture tag: nome esatto della variabile, fino a 200 caratteri.
- Azioni allarmi: ID dell’allarme; vale per presa visione e conferma.
- Modifiche ricette: ID dello **schema**, vale per capture/create/update/copy/rename/delete/import.
    Include la lettura PLC dedicata `recipes.capture`. Non distingue singoli record e non
    filtra la lettura dell’archivio ricette o il monitoraggio PLC generale.

Sono limiti aggiuntivi: la capacità generale resta necessaria, così come tutti i consensi
di scrittura PLC. Permessi grafici, ruolo descrittivo e account ChatGPT non concedono accesso.
Confronto case-sensitive, nessun jolly o prefisso; massimo 256 ID univoci per gruppo e limite
complessivo di 128 KiB dell’archivio. Nessuna regola valida mancante può diventare “tutte”.

```text
Comando validato → sessione server + CSRF → capacità generale → risorsa esatta
  → deduplicazione → archivio ricette / stato allarme / driver PLC
```

`AUTH_RESOURCE` (403) significa risorsa non consentita. Il comando è rifiutato, nessun invio
automatico. Il log accessi registra codice/attore/ora, non password, valore o nome risorsa.
Il server deriva la risorsa dal comando validato, non da header o permessi dichiarati dal client.
Anche una ripetizione con lo stesso ID viene autorizzata di nuovo prima della deduplicazione.

Il primo salvataggio risorse su un archivio v1 richiede conferma esplicita e passa a v2:
mantiene UUID archivio/account, hash/password, disabilitazioni, capacità e permessi grafici;
gli altri account mantengono tutte le risorse già consentite dalle loro capacità. Gli account
aggiunti dopo partono senza risorse utilizzabili: assegnarle separatamente non crea una finestra
di accesso globale. La sola lettura/login non migra nulla. Ogni cambio revoca tutte le sessioni.

Prima del passaggio viene creata nella stessa cartella privata una copia v1
`operators-v1-<revisione-sha256>.json`, esclusiva e sincronizzata prima della pubblicazione.
Un file preesistente diverso/non regolare blocca la migrazione; non viene sovrascritto.
Conserva il backup come una credenziale, fuori da public/dist/Git/AI. In Windows il mode POSIX
non sostituisce ACL dell’account servizio: proteggi esplicitamente tutta la cartella security.
Serve il Runtime aggiornato: quello precedente rifiuta v2, senza concedere accessi. Non esiste
downgrade automatico. Per un rollback arresta il servizio e fai verificare archivio e backup
dal responsabile: non ripristinare alla cieca il v1, che non contiene i nuovi limiti.

Alternativa sul PC del servizio: `npm run operators -- resources`, con scelta interattiva
e conferma SALVA. La CLI generata include il medesimo modello amministrativo e validatore.
Questa fase non realizza gruppi/ereditarietà, ACL di lettura/per-record o amministrazione remota.

### Gestione grafica locale degli account

Nell’app desktop apri **Pannello → Account del pannello**. La stessa finestra si apre
dall’ispettore degli accessi. È amministrazione della cartella del progetto attualmente
aperto, non login al Runtime e non amministrazione di un server remoto. Il dettaglio
**Cartella degli account su questo PC** mostra il percorso preciso: se lavori su una copia
Framecraft, non stai modificando l’archivio dell’originale o del server in esecuzione altrove.

1. Rileggi account, poi Nuovo account: username univoco, nome, ruolo descrittivo, capacità
   server esplicite e ID dei permessi grafici separati. Nessuna capacità preselezionata.
   Password almeno 12 caratteri, ripetuta due volte. Rivedi modifica mostra il riepilogo,
   mai la password; Conferma salvataggio è l’unico passaggio che scrive l’archivio privato.
2. Per un account selezionato puoi modificare dati/permessi, cambiare password o
   disabilitare/riattivare, sempre con conferma. Username e ID non vengono rinominati,
   nessuna cancellazione o recupero automatico. Ogni cambiamento di contenuto revoca le
   sessioni; un comando già accettato non viene annullato.
3. In Servizio e sessioni abiliti l’accesso, scegli idle/durata massima ed eventualmente HTTP
   di prova sul loopback. La configurazione pubblica usa confronto del file e della sessione
   progetto. Si applica al prossimo avvio **manuale** del servizio: niente restart o comandi PLC
   automatici. Configura separatamente proxy/origini/TLS in Connessioni PLC. Un progetto senza
   framecraft.auth.json v1 compatibile richiede aggiornamento esplicito, non un reset degli archivi.
4. Bozze e password restano nella memoria della finestra, non nei checkpoint o nel contesto AI.
   Dopo ogni invio la password viene rimossa dal modulo. Prima di una mutazione viene conservato
   in sessionStorage soltanto `pending`, indicizzato con namespace e percorso locale codificato
   del progetto: una copia non può chiudere l’avviso dell’originale. Risposta persa,
   timeout o errore non vengono ritentati: rileggi e confronta; per una password verifica
   l’accesso al pannello, poi Ho verificato: continua chiude l’avviso. Non certifica un esito.
   Il marker sopravvive al reload della finestra, non alla fine della sessione browser; non
   cancellare i dati dell’app per risolvere un’incertezza. Storage bloccato impedisce l’invio.
5. Permessi grafici e PIN precedenti apre l’editor di compatibilità, con ritorno agli account
   server. I suoi PIN/timeout/etichette non cambiano password, sessioni o capacità del servizio.
   Nessun account PIN viene convertito o promosso automaticamente.

Implementazione: finestra → IPC della sola finestra principale → progetto autorizzato e
generazione corrente → worker Node incorporato nell’app → archivio privato. Il worker riusa
validazione/scrypt/lock/CAS del Runtime, non esegue moduli o binari Node del progetto. Richiede
Node LTS installato nel PATH di sistema; nessuna nuova dipendenza o provider di credenziali.
Password solo via stdin del processo, mai in argomenti/env/URL/output. Risposte IPC tipizzate
con soli metadati; stderr grezzo non esposto. Il lavoro viene eseguito fuori dal thread UI,
con soglie di input/output e timeout del processo. L’archivio non è accessibile da endpoint HTTP.
L’accesso remoto IPC resta disabilitato nella configurazione Tauri; le relative
[limitazioni di piattaforma](https://v2.tauri.app/security/capabilities/#remote-api-access)
e il collaudo WebView2/nativo sul target sono gate di rilascio, non risolti dal solo test del worker.

Copia di lavoro ed Esporta copia escludono `.framecraft-runtime`, compresi account, log e archivi:
non è un backup degli utenti o una pubblicazione delle credenziali. Preparali esplicitamente sul
target, con CLI o Framecraft aperto sulla cartella corretta. Firma/audit amministrativo,
policy password avanzate, autorizzazione amministrativa centralizzata, provisioning nel futuro
wizard Pubblica e backup/restore/ACL Windows verificati restano da completare.

## Lettura e confronto dei valori ricetta dal PLC

Questa funzione legge soltanto: non applica ricette e non esegue scritture singole, batch o comandi
di attivazione. Decisione del 22 ottobre 2026: l’applicazione richiede **sempre una conferma
del programma PLC**, correlata alla singola richiesta. ACK MQTT e risposta OPC UA Write Good
non sono una conferma di applicazione. Il backend opt-in del 23 ottobre implementa preparazione,
handshake, timeout, rifiuto, concorrenza e recupero esplicito senza replay. L’utente ha scelto
un’interfaccia Framecraft da implementare nel PLC: il [contratto v1](RECIPE-APPLY-PROTOCOL.md)
descrive canali, buffer, ritenzione, interlock e messa in servizio. La configurazione è disponibile
in **Pannello → Ricette → Applicazione al PLC**: revisione e conferma salvano solo l’interfaccia,
senza avviare connessioni. La presenza del registro trasferimenti rende la configurazione in sola
lettura, per non perdere il recupero degli esiti incerti; migrazione guidata ancora da implementare.
Il controllo HMI offre ora **Applicazione al PLC** con revisione, dichiarazione e conferma;
gli esiti incerti hanno verifica senza replay e chiusura protetta per richieste mai avviate.
Vedi la [procedura operatore](RECIPE-APPLY-PROTOCOL.md#uso-nel-pannello-hmi). Restano programma
della CPU reale, confronto target coordinato, migrazione/backup e collaudo industriale.
Questa lettura resta indipendente dall’applicazione.

Preparazione nell’editor, senza AI:

1. Salva schema e campi in **Pannello → Ricette**. Dichiara i tag in **Variabili PLC**, poi
   collega i segnali reali in **Connessioni PLC**. Dichiarare un tag non avvia una connessione.
2. Apri **Ricette → Collegamenti PLC**. Abilita esplicitamente ogni schema necessario e scegli
   un tag leggibile e compatibile per **ciascun** campo, senza duplicati. Imposta età massima
   e distanza massima tra campioni secondo il ciclo reale. Non aumentare i tempi per nascondere
   problemi di aggiornamento. Unità e fattori di scala non vengono convertiti automaticamente.
3. **Salva collegamenti** scrive solo `framecraft.recipe-plc.json`. Confronta contemporaneamente
   mapping, schema e catalogo tag letti dal disco; un conflitto conserva la bozza. Funziona anche
   con archivio operativo esistente, senza reseeding, migrazione o modifica dei dati salvati.
4. Riavvia manualmente il servizio per caricare i collegamenti. Assegna esplicitamente
   `recipes.read` e `recipes.capture` all’operatore. Negli account formato 2 limita gli schemi
   in **Schemi ricetta: lettura PLC e modifiche** (`recipeChanges`); nel formato 1 il permesso vale per tutti gli schemi.
   Nessun account esistente riceve automaticamente la nuova capacità. Usa `recipes.create`
   solo se deve poter salvare una nuova ricetta dai valori letti.

Nel controllo **Archivio ricette** del pannello:

1. Accedi, premi **Rileggi archivio** e scegli schema e ricetta da confrontare.
2. Premi **Leggi valori PLC**. Il servizio restituisce gli ultimi campioni già ricevuti dai
   driver, **non** forza una lettura simultanea del PLC né garantisce lo stesso ciclo macchina.
   Mostra data di acquisizione/ricezione, tag, tipo, valori e differenze. Non c’è polling:
   quanto mostrato è una fotografia della cache e non si aggiorna da solo.
3. Ogni campo richiede connessione attiva, campione presente, qualità buona conosciuta, nessun
   errore driver, tipo/limiti validi, ricezione non futura e non troppo vecchia. I retained MQTT
   iniziali vengono rifiutati. Se un campo fallisce, oppure i campioni sono ricevuti troppo
   distanti, puoi leggere le cause ma non copiare un insieme parziale con valori sostitutivi.
4. Solo un’acquisizione completa abilita **Crea bozza dai valori letti**. Inserisci un nuovo nome,
   controlla i valori e usa **Verifica operazione → Conferma salvataggio**. È una normale creazione
   nell’archivio con revisione attesa, ACL e audit del salvataggio: nessuna sovrascrittura o
   applicazione automatica. La data della lettura è mostrata nella bozza, ma non è una provenienza
   certificata o uno storico regolamentato dei valori. Logout e cambio schema/revisione rimuovono
   il confronto; le risposte tardive non ripristinano dati dell’utente precedente.

API: `GET /_framecraft/plc/v1/recipe-plc?schemaId=<id>&expectedRevision=<sha256>`.
Richiede token/origine del gateway e sessione server con `recipes.capture` e ACL sullo schema,
ricontrollata dopo la lettura asincrona dell’archivio. Non accetta tag arbitrari o callback legacy
come identità. Al massimo una richiesta ogni 200 ms per servizio e 32 richieste HTTP attive;
letture/autorizzazioni hanno un limite di 5 s. Una revisione diversa richiede rilettura manuale.
La risposta dichiara `effect: "plc-read-only"`, `simultaneous: false`, `plcConfirmed: false`;
solo `complete: true` contiene l’insieme `values`. Errori e log non contengono valori o credenziali.
Le letture non sono registrate come operazioni ricetta applicate nell’audit.

Il file è separato dall’import/export ricette, versione 1, vuoto per default:

```json
{"version":1,"schemas":[]}
```

Ogni schema abilitato contiene `schemaId`, `maxAgeMs` (250–600000), `maxSkewMs` (0–maxAgeMs)
e `fields: [{"fieldId":"<campo>","tag":"<tag dichiarato>"}]`. Massimo 32 schemi, 64 campi/schema,
1 MB. Interi fino a 32 bit, numeri reali, booleani e testo; nessuna approssimazione di interi 64 bit,
array/UDT, conversione unità o binding dedotto. Configurazione corrotta blocca la lettura ricette
senza azzerare il file, fermare il monitoraggio indipendente o riseminare l’archivio.

Riferimenti funzionali, non formati o contratti di trasferimento compatibili:
[Unified V21 Parameter control](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-parameter-sets-rt-unified/basics-rt-unified/basics-of-parameter-control-rt-unified)
e [Optix 1.8 Recipes editor](https://www.rockwellautomation.com/en-pr/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes/recipesx-editor.html).
Entrambi distinguono gestione dei set, lettura dal controller e applicazione; Framecraft implementa
qui soltanto la lettura scalare dalla cache e il salvataggio esplicito nell’archivio.

## Prima della produzione

Usare Node LTS supportato (baseline di deployment: Node 24), servizio gestito, segreti protetti,
certificati/trust verificati, HTTPS e autenticazione/permessi lato server, interlock nel PLC,
audit persistente, prove di guasto/recovery e conferme applicative adeguate ai comandi. Vite dev
e il proxy locale non sono un server di produzione; il PIN locale del pannello non è RBAC server.

Sono ancora da completare browsing, array/UDT, metodi/allarmi OPC UA, conferme PLC e payload avanzati,
storage industriale, audit/RBAC e collaudo su macchina. Verificare lockfile, vulnerabilità,
licenze/notice e diritti degli asset della distribuzione effettiva. Le basi presenti non sono
un'approvazione al rilascio industriale.
