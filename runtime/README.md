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
esatte, mai numeri JavaScript già arrotondati. I tag analogici supportati hanno una
soglia fissa sopra/sotto e isteresi di rientro; gli altri confronti Unified sono aperti.

Il servizio carica il catalogo all'avvio manuale. Salvare nell'editor non riavvia
gateway/PLC, non modifica connessioni né invia comandi. Il motore usa `onSample` dei
driver MQTT e OPC UA, anche quando nessun browser mostra la pagina Allarmi. Ogni
browser riceve lo stesso stato da `GET /_framecraft/plc/v1/snapshot`, campo `alarms`.
La qualità deve essere Good conosciuta e il valore compatibile. Bad, Uncertain,
errore o qualità mancante conservano l'ultima condizione e mostrano il problema;
non generano un rientro. Nessun campione iniziale significa stato sconosciuto, non Normale.

Classi: `none` chiude al rientro, `single` richiede anche la presa visione,
`reset` richiede inoltre una conferma dopo rientro valido e presa visione.
La presa visione può precedere o seguire il rientro e **non scrive nel PLC**.
Una riattivazione pendente richiede una nuova presa visione; la nuova revisione
invalida i pulsanti selezionati prima del cambiamento. Il modello deriva da
[stati Unified](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/basics-rt-unified/alarm-states-rt-unified)
e [presa visione](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/basics-rt-unified/acknowledgment-model-rt-unified).

### Autorizzazione degli operatori: bloccata per impostazione iniziale

`start-gateway.mjs` non dichiara identità o permessi dell'operatore: gli allarmi
sono consultabili, ma presa visione/conferma sono bloccate. L'integrazione server
deve fornire `createPlcGateway(..., { alarmCatalog, authorizeAlarmAction })`:
il callback riceve la richiesta HTTP e il comando, verifica sessione, ruolo,
allarme e azione e restituisce l'identificativo dell'operatore **verificato dal server**,
oppure rifiuta. Non autorizzare restituendo un nome fisso, accettando `actor` dal
browser o fidandosi del PIN locale. Il callback ha un timeout di 5 secondi.
Autenticazione/RBAC e audit persistente dell'integrazione restano da implementare
e collaudare; questo hook non è un prodotto di autenticazione completo.

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

## Prima della produzione

Usare Node LTS supportato (baseline di deployment: Node 24), servizio gestito, segreti protetti,
certificati/trust verificati, HTTPS e autenticazione/permessi lato server, interlock nel PLC,
audit persistente, prove di guasto/recovery e conferme applicative adeguate ai comandi. Vite dev
e il proxy locale non sono un server di produzione; il PIN locale del pannello non è RBAC server.

Sono ancora da completare browsing, array/UDT, metodi/allarmi OPC UA, conferme PLC e payload avanzati,
storage industriale, audit/RBAC e collaudo su macchina. Verificare lockfile, vulnerabilità,
licenze/notice e diritti degli asset della distribuzione effettiva. Le basi presenti non sono
un'approvazione al rilascio industriale.
