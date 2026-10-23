# Framecraft Recipe Apply v1 — contratto del programma PLC

Stato: nucleo del servizio e riferimento eseguibile implementati il 23 ottobre 2026.
Configurazione guidata disponibile in Pannello → Ricette → Applicazione al PLC;
comando operativo nel controllo HMI ancora da collegare. Nessuna abilitazione
automatica nei progetti. Non è un protocollo Siemens/Rockwell, un programma PLC certificato o
una garanzia di sicurezza funzionale. Richiede implementazione e collaudo sul controller scelto.

## Prima di attivarlo

L’utente ha richiesto conferma obbligatoria del programma PLC, senza alternativa a scritture
dirette. Questo contratto trasferisce una ricetta completa a un buffer di preparazione;
soltanto un successivo comando distinto può applicarla. Il PLC deve validare e copiare l’insieme
nel proprio punto di applicazione coerente, con interblocchi locali. Il servizio non può rendere
atomica una serie di assegnazioni che il programma macchina tratta separatamente.

Il primo adattatore usa due tag dichiarati `String`/`WString`, della stessa connessione:

- **Richiesta**, scrivibile dal servizio: una stringa contenente un messaggio JSON completo.
- **Risposta**, leggibile: una stringa contenente una risposta JSON completa e coerente.

Non usare tag separati per ID, esito e valori: campioni diversi potrebbero sembrare una conferma
che il PLC non ha prodotto. Non usare gli stessi buffer per altri comandi. Il PLC deve riservare
questo canale a un solo servizio Framecraft; più browser sono serializzati dal servizio.

Il buffer richiesta deve contenere almeno 512 caratteri ASCII e l’intero messaggio configurato,
compresi i metadati. Un normale `STRING[254]` non basta. Il limite configurabile è 512–131072 byte;
un profilo da 8192 richiede un buffer/parser effettivamente dimensionato per quel budget.
La risposta ha un limite di 4096 byte; dimensionare il buffer per l’intera risposta, non un
solo flag. Il servizio non spezza un messaggio troppo grande né tronca i valori.
Array/UDT binari, frammentazione e adattatori per buffer piccoli restano da implementare.

JSON è ASCII: i caratteri non ASCII dei valori sono rappresentati con escape `\uXXXX`, anche
per coppie surrogate. Nessun BOM. Il PLC deve supportare il parsing JSON, i tipi dello schema
e la rappresentazione dei numeri JSON; non deve interpretare il JSON come codice o espressione.
Unità/scaling, capacità dei testi e tipi numerici effettivi della CPU vanno verificati nel
programma; nessuna conversione implicita o saturazione silenziosa è ammessa per dichiarare
riuscita l’applicazione. Interi oltre la precisione del catalogo JS, array e UDT non sono coperti.

## Preparazione del progetto e del PLC

1. Configurare e salvare schemi/ricette e le variabili del canale. Il catalogo iniziale e
   l’archivio operativo non vengono modificati da questa funzione.
2. Aprire **Pannello → Ricette → Applicazione al PLC**, con il servizio fermo. Selezionare lo
   schema e abilitarne esplicitamente la configurazione. Inserire ID canale concordato, tag
   richiesta/risposta, capacità effettiva del buffer e tempi. Non vengono creati tag o consensi.
   Per condividere un’area tra schemi usare **Riprendi un canale già configurato**: tag e tempi
   restano gli stessi. Per cambiarli solo per uno schema occorre separarlo in un nuovo canale.
   **Verifica configurazione** mostra il riepilogo; la successiva dichiarazione di servizio
   fermo/protocollo concordato e **Conferma salvataggio interfaccia** salvano soltanto
   `framecraft.recipe-apply.json`. Il file generato è vuoto:

   ```json
   {"version":1,"schemas":[]}
   ```

   Ogni profilo abilitato richiede esattamente `schemaId`, `channelId`, `requestTag`,
   `responseTag`, `maxPayloadBytes`, `maxAgeMs`, `prepareTimeoutMs`, `applyTimeoutMs`,
   `stageLifetimeMs`. Non ci sono nomi tag o consensi predefiniti. `channelId` identifica
   stabilmente un’area di preparazione del PLC. Più schemi possono usare lo stesso canale
   soltanto con identici tag e budget; un tag non può appartenere a due canali.
   Errori o conflitti conservano la bozza. Il salvataggio nativo controlla sessione/progetto e
   contenuto di interfaccia, schema, tag, connessioni e accessi senza riscrivere gli altri file.
   Un archivio ricette operativo non impedisce questa prima configurazione; la presenza del
   registro `recipe-apply`, anche incompleto, rende invece la finestra in sola lettura.
   Non è ancora disponibile una migrazione guidata dei canali già messi in servizio: servono
   verifica delle richieste pendenti e backup/restore, senza cancellare il registro. Non avviare
   il servizio da un altro terminale durante il salvataggio: i controlli del progetto non sono
   un lock distribuito con un processo di deployment esterno o un amministratore locale.
3. I due tag devono essere associati alla stessa connessione attiva. Per scrivere servono i
   consensi del gateway, della connessione e del binding. La risposta richiede qualità buona
   conosciuta e aggiornamento reale, non valori di fallback o retained MQTT iniziali.
4. Nel Runtime generato eseguire `npm run recipe-interface -- --json` dalla cartella `runtime`.
   È una lettura locale, non avvia connessioni e non scrive al PLC. Produce namespace, profili,
   campi/tipi/limiti e hash di schema; mai valori o nomi delle singole ricette, password o token.
5. Configurare nel programma PLC esattamente namespace, canale, schema ID e hash dichiarati.
   Il namespace è quello di `framecraft.auth.json`, non l’account ChatGPT o il nome utente.
   Non accettare un namespace diverso automaticamente. Lo `schemaHash` è SHA-256 della sorgente
   canonica prodotta da `recipeApplySchemaSource`: ID schema e campi normalizzati ordinati per
   ID ASCII. Il PLC può confrontare l’hash preconfigurato, senza implementare SHA-256 a Runtime.
6. Assegnare esplicitamente `recipes.apply` e gli schemi consentiti in `recipeChanges` agli
   account locali. Non richiede il generico `tags.write` e non lo concede. Formato account 1:
   la capacità vale per tutti gli schemi. Formato 2: anche il limite per schema è obbligatorio.
   Nessun account esistente riceve la nuova capacità. HTTPS, origine, cookie HttpOnly/CSRF e
   token del proxy rimangono necessari; il PIN browser non concede accesso server.

Tempi: `maxAgeMs` 250–10000; timeout preparazione e applicazione 1000–20000 ciascuno;
`stageLifetimeMs` almeno `prepareTimeoutMs + 1000`, massimo 120000. Dimensionare la durata
della preparazione anche per autenticazione/rilettura archivio e latenza reali. La scadenza è
misurata dal PLC con il suo tempo monotono, non con l’orologio del browser.

### Trasporto

OPC UA: nodo richiesta scalare `String`, `writeEnabled: true`; nodo risposta scalare `String`
letto dal driver. Il nodo deve accettare il messaggio completo. La risposta UA `Write Good`
conferma soltanto il servizio di scrittura, non il programma macchina.

MQTT: richiesta con `writeEncoding: "text"` su un topic dedicato; il payload è il JSON ASCII.
Il PLC/bridge pubblica la risposta periodicamente e dopo gli eventi, senza retained. Per dare
qualità esplicita al driver Framecraft può usare un involucro JSON con `value` contenente la
stringa risposta e `quality: 192`, configurando `valuePath: "/value"`, `qualityPath: "/quality"`.
L’involucro MQTT non è il messaggio del protocollo interno. ACK broker e QoS non sono conferma
PLC. Usare TLS, identità/ACL broker e un unico writer autorizzato sul topic di comando.
Dimensionare anche `maxPayloadBytes` della connessione MQTT per richiesta e risposta con il
suo involucro: il driver usa 65536 byte se omesso. Il budget del protocollo non aumenta quello
del trasporto, del broker o del buffer/parser PLC; vale sempre il limite effettivo più basso.

Il gateway protegge i tag richiesta/risposta e gli alias riconoscibili degli stessi topic/nodi
dal normale endpoint `/write`, anche se l’operatore ha `tags.write`. Include i riferimenti delle
connessioni disabilitate. Configurazione applicativa corrotta o riferimenti non interpretabili
bloccano le scritture generiche per non aggirare la protezione, senza fermare il monitoraggio.
Alias DNS, endpoint diversi dello stesso dispositivo, altri client o modifiche privilegiate
dei file di deployment non sono un confine gestibile da questo controllo: servono ACL e revisione
dell’intera configurazione. Non rimuovere la configurazione per sbloccare un canale incerto.

## Messaggi

Tutti i messaggi hanno `version: 1`, `namespace` (UUID v4), `channelId`, `sequence` (1–4294967295),
`id` (32 cifre esadecimali), `fingerprint` (64 cifre esadecimali) e `phase`.
`id` identifica la richiesta; la sequenza del servizio è persistente e crescente, anche quando
cambia schema. Per un canale sono ammessi salti, mai ritorni indietro o rollover.
Il fingerprint è un identificatore di correlazione del contenuto deciso dal servizio, non una
firma/autorizzazione crittografica del PLC. Il PLC lo conserva ed ecoa senza alterarlo, insieme
alla copia immutabile dei valori e all’identità. TLS e le autorizzazioni restano indispensabili.

`phase: "prepare"` aggiunge `schemaId`, `recordId`, `schemaHash`, `ttlMs` e `values`, con tutti
e soli i campi tipizzati della ricetta. `phase: "apply"` e `phase: "status"` non contengono valori
o altri campi. Parametri aggiuntivi, JSON invalido, messaggi incompleti o oltre budget vanno
rifiutati senza applicare valori. La preparazione non modifica i parametri macchina attivi.

La risposta contiene esattamente:

```text
version, namespace, channelId, sequence, id, fingerprint, state, code
```

`state` è `idle`, `prepared`, `applied`, `rejected` oppure `uncertain`.
`idle` è valido soltanto alla prima messa in servizio: sequenza 0, ID/fingerprint null e codice 0.
`prepared`/`applied` richiedono codice 0. `rejected`/`uncertain` richiedono un codice numerico
1–65535. Non includere valori, credenziali o messaggi liberi nella risposta. Una risposta deve
essere aggiornata come un unico valore coerente, non assemblata da variabili indipendenti.

## Sequenza e responsabilità del programma PLC

1. Il servizio legge lo stato del canale: deve essere fresco, buono, non retained, nel namespace
   e canale attesi e coerente con il registro persistente. Una preparazione estranea o un esito
   incerto impediscono una nuova richiesta. Non si riallineano contatori automaticamente.
2. Il servizio registra l’intenzione su disco prima di inviare `prepare`. Il PLC controlla
   namespace, sequenza e identità. Per un nuovo `prepare` deve conservare ritentivamente il
   nuovo massimo di sequenza **prima** di rispondere o proseguire. Rifiuti di schema, valori,
   interlock o canale occupato non consentono di riusare quella sequenza in seguito.
3. Il PLC valida tutti i valori contro il proprio schema/hash e gli interblocchi, poi salva
   una copia immutabile in preparazione, identità/fingerprint e scadenza. Solo allora risponde
   `prepared`. Duplicati esatti possono restituire lo stato; non preparano né applicano di nuovo.
4. Il servizio ricontrolla autorizzazioni e revisione dell’archivio, e verifica che la stessa
   preparazione sia ancora attiva. Registra su disco il confine di invio prima di inviare `apply`.
5. Il PLC accetta `apply` soltanto per la preparazione attiva con gli stessi namespace, canale,
   sequenza, ID e fingerprint, non scaduta. Ricontrolla gli interblocchi. Registra ritentivamente
   che sta per applicare **prima** degli effetti, esegue la copia coerente nel programma macchina,
   poi conserva il risultato e risponde `applied`. Non aggiornare i parametri dalla sola ricezione
   di `prepare`. Un vecchio `apply` o una sequenza sconosciuta non possono attivare una ricetta.
6. Solo una risposta buona, fresca e correlata dopo il proprio confine di commit permette al
   servizio `plcConfirmed: true`. `applied` ricevuto prima del proprio commit è un errore di
   protocollo, non un successo. La conferma riguarda quell’operazione storica, non certifica
   che la macchina stia ancora usando gli stessi valori dopo altre operazioni.

L’area di preparazione è esclusiva. Rispondere BUSY a un’altra richiesta non deve sovrascrivere
i dati o l’identità della preparazione esistente. Più servizi indipendenti sullo stesso canale
non sono supportati; gli operatori devono passare dallo stesso servizio proprietario.

## Timeout, riavvio e verifica manuale

Il servizio non ripete `prepare`/`apply` per rimediare a timeout, perdita HTTP, arresto o restart.
Una richiesta non conclusa blocca il canale. `status` è una verifica esplicita e non contiene
valori da applicare. Deve restituire il risultato già conservato per la stessa identità o la
preparazione ancora attiva; non esegue `apply` e non rinnova la scadenza della preparazione.

Se `status` riguarda una sequenza **mai vista** e maggiore del massimo conservato, il PLC deve
prima conservare quella sequenza come rifiutata/non vista, poi rispondere `rejected / NOT_SEEN`.
Questa barriera rende innocui eventuali `prepare`/`apply` originali che arrivassero in ritardo.
Non basta rispondere “non trovato” lasciando la sequenza riutilizzabile. Una sequenza vecchia
di cui non si conserva il risultato certo restituisce `uncertain`, mai un successo inventato.

Il PLC deve conservare namespace/canale commissionati, massimo sequenza, preparazione e risultato
del lavoro corrente. Al riavvio una preparazione non in applicazione viene rifiutata, non ripresa.
Se il riavvio avviene dopo il confine di applicazione ma prima della ricevuta persistente, l’esito
è `uncertain`: la copia potrebbe essere già avvenuta e non va rieseguita. Anche perdita di dati
ritentivi, guasto di persistenza o tempo monotono incoerente richiedono blocco e manutenzione;
**non** ripartire in `idle / 0` con lo stesso namespace. Dopo verifica macchina, l’eventuale
ricommissionamento con nuova identità deve essere coordinato a servizio fermo, non automatico.

Il riferimento `recipe-plc-reference.mjs` implementa il contratto in JavaScript per PLC virtuali
e test di integrazione. Richiede esplicitamente adattatori `persist`, `canApply` e `apply`, stato
ritentivo e inizializzazione; non è installato automaticamente dal gateway. `persist` deve essere
sincrono e durevole; `apply` sincrono e coerente sul modello macchina. Non usare promesse o un
callback vuoto come presunta applicazione industriale. Il PLC deve valutare la scadenza nel
proprio ciclo e pubblicare lo stato periodicamente. Il riferimento non traduce il contratto in
SCL/Ladder e non prova i tempi di ciclo, l’atomicità o la ritenzione di una CPU reale.

Codici del riferimento: 1 interlock, 2 schema/hash, 3 valori, 4 occupato, 5 scaduto,
6 riavvio, 7 richiesta mai vista e ora esclusa, 8 sequenza vecchia senza risultato conservato,
9 errore di esecuzione, 10 persistenza non affidabile. Un programma reale può aggiungere codici
documentati entro 65535; non modificare il significato degli stati per nascondere un errore.

## API del servizio e registro

- `POST /_framecraft/plc/v1/recipe-apply`: esattamente `id`, `expectedRevision`, `schemaId`,
  `recordId`. I valori sono letti dall’archivio server, mai forniti liberamente dal browser.
- `GET /_framecraft/plc/v1/recipe-apply?id=...&schemaId=...`: solo la ricevuta del servizio,
  non una nuova lettura PLC e non un nuovo comando.
- `GET /_framecraft/plc/v1/recipe-apply/current?schemaId=...`: recupera l’ultima ricevuta del
  canale per lo schema autorizzato, anche senza il marker del browser. Non espone richieste
  pendenti di altri schemi; segnala canale occupato senza i loro dettagli.
- `POST /_framecraft/plc/v1/recipe-apply/check`: esattamente `id`, `schemaId`. Può inviare solo
  `status`, mai preparazione/applicazione. Le richieste già concluse restituiscono la ricevuta.

Tutti richiedono sessione server, `recipes.apply` e ACL schema; i POST richiedono CSRF. Token e
origine del gateway sono verificati prima. Audit obbligatorio prima degli effetti; archivio o
audit guasto non vengono aggirati. Se il salvataggio dell’esito fallisce dopo possibili effetti,
la risposta è incerta anche se il trasporto era riuscito. Non cancellare ricevute o creare un
nuovo ID per riprovare. Il registro attività non contiene valori o credenziali.

Il ledger privato è `.framecraft-runtime/recipe-apply/requests.sqlite`, separato da ricette e
audit. Usa SQLite locale, commit FULL e writer esclusivo. Conserva ID, soggetto, revisioni,
fingerprint e confini di invio, non i valori. Apertura senza replay; namespace/identità, hash
dei record e controlli dei file bloccano corruzioni evidenti, link e sostituzioni. Non è firma
o protezione da un amministratore locale ostile. Valgono i requisiti Node/SQLite dell’audit.
Default 10000 ricevute, massimo 100000 per l’API interna e 64 MiB di database; nessuna espulsione
automatica. Limiti, backup/restore verificato, ACL Windows, archiviazione, UPS e manutenzione
sono responsabilità di rilascio sul target. Copiare soltanto il progetto non è un backup del ledger.

## Riferimenti e limiti di parità

Le funzioni di gestione/trasferimento sono confrontate con
[Unified V21 — Transferring parameter sets](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-parameter-sets-rt-unified/using-parameter-sets-in-runtime-rt-unified/transferring-parameter-sets-rt-unified)
e [Optix 1.8 — Recipes editor](https://www.rockwellautomation.com/en-pr/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes/recipesx-editor.html).
La separazione preparazione/applicazione con conferma obbligatoria è il contratto Framecraft
richiesto dall’utente, non una dichiarazione di identità con i protocolli vendor.
La GUI configura l’interfaccia ma non completa ancora comando operativo HMI, migrazione dei
canali commissionati, adapter CPU, collaudo hardware/TLS/carico,
backup/restore industriale, firme o sicurezza funzionale della macchina.
