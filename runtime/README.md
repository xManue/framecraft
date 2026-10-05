# MQTT e gateway del Runtime autonomo

MQTT.js gira nel servizio Node, non nel browser. Il driver usa un broker reale TCP/TLS/WebSocket,
sottoscrizioni, cache tipizzata, qualità e timestamp, timeout e riconnessione. Il gateway HTTP
trasferisce i campioni al browser e inoltra i comandi autorizzati. Non serve un Runtime Siemens
o Rockwell; OPC UA è ancora da implementare.

Il collaudo `npm run test:gateway` nel repository avvia un broker Aedes locale, HTTP e processi
Node separati anche per i sorgenti generati. Non prova CPU fisiche/virtuali aziendali o TLS reale.

## Abilitazione in un pannello standard

La pipeline copia servizio, client, tipi, proxy e questa guida. Per impostazione iniziale:
`framecraft.connections.json` è vuoto, il gateway browser in `framecraft.runtime.json` è disabilitato
e nessun endpoint, topic, segreto o collegamento viene inventato. L'anteprima dell'editor continua
a usare la simulazione esplicita, non si collega automaticamente al servizio.

1. Dichiarare i tag e il loro accesso in `framecraft.plc.json`.
2. Aprire **Pannello → Connessioni PLC** nell'editor. Aggiungere il broker, scegliere i tag
   dichiarati e i topic reali, configurare valore/qualità/timestamp e i riferimenti ambiente/TLS.
   Le opzioni avanzate comprendono QoS, timeout e permessi di scrittura. OPC UA non è disponibile.
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
`npm --prefix runtime run mqtt` resta disponibile per sola diagnostica JSON su stdout.

## Acquisizione e qualità

Le connessioni richiedono `enabled` esplicito e tag dichiarati. Credenziali tramite riferimenti
ambiente; TLS verifica i certificati. `tls.caFile`, `certificateFile` e `privateKeyFile` consentono
trust personalizzato e certificati client. Insecure richiede `allowInsecure: true` esplicito e una
valutazione del rischio; non è il default di produzione.

Topic concreti, QoS 0/1/2 e JSON Pointer, senza codice eseguibile. Timestamp numerici con unità
`ms` o `s` dichiarata. Senza qualità nel payload il dato rimane di qualità sconosciuta, non Good
inventato; `receivedAt` è distinto dal timestamp sorgente. Errori conservano l'ultimo valore ma
lo marcano Bad; `staleAfterMs` opzionale va scelto sull'acquisizione reale. La cache non è uno
storico completo e il polling può perdere campioni intermedi veloci.

Tipi attuali: Bool, String/WString, interi 8/16/32 bit, Real/LReal/Float/Double.
Massimo 1000 connessioni e 5000 tag nel gateway, payload e richieste limitati. Array, strutture,
wildcard, mapping avanzati e Last Will sono ancora da aggiungere.

## Comandi senza false conferme

Servono contemporaneamente `gateway.allowWrites: true`, `connection.allowWrites: true`, accesso
PLC `write`/`read-write` e `writeTopic`. Il server verifica il tipo, non solo il browser.
Nel pannello generato usare l'API asincrona e attendere il risultato:

```ts
import { requestRuntimeTagWrite } from "./framecraftHmiRuntime";
const result = await requestRuntimeTagWrite("Motor.Speed", 30);
// result.delivery è una ricevuta di trasporto/broker, non l'esecuzione del PLC.
```

`setRuntimeTagValue` inoltra la richiesta senza attendere nel chiamante e mostra l'esito; non va
usata per sequenze che richiedono una conferma prima del passo successivo. In modalità connessa
le scritture PLC degli script IR legacy (`Tags.Write`, `TagSet.WriteAsync`, QCD ecc.) sono
**bloccate esplicitamente**, perché l'interprete non attende ancora il trasporto reale. Non vengono
simulate come riuscite. I tag locali dei faceplate restano locali. Questa integrazione è da finire.

I comandi non sono retained, non sono accodati offline e non sono ripubblicati automaticamente
dopo una perdita di connessione. L'esito mancante è **incerto**: il comando potrebbe essere stato
eseguito, quindi non va ritentato automaticamente. `plcConfirmed` resta `false` anche con broker
ack QoS 1/2. Solo una nuova lettura aggiorna il valore visualizzato, mai un aggiornamento ottimistico.

L'API deduplica per ID per cinque minuti, solo in memoria, con massimo 1000 richieste registrate;
non garantisce exactly-once o deduplica dopo un riavvio. Serve un protocollo di conferma/idempotenza
nel PLC per comandi industriali che lo richiedono. La notifica a schermo distingue ricevuta,
rifiuto ed esito incerto.

## Prima della produzione

Usare Node LTS supportato (baseline di deployment: Node 24), servizio gestito, segreti protetti,
certificati/trust verificati, HTTPS e autenticazione/permessi lato server, interlock nel PLC,
audit persistente, prove di guasto/recovery e conferme applicative adeguate ai comandi. Vite dev
e il proxy locale non sono un server di produzione; il PIN locale del pannello non è RBAC server.

Sono ancora da completare editor connessioni, driver OPC UA, scritture asincrone dall'interprete,
storage industriale, audit/RBAC e collaudo su macchina. Verificare lockfile, vulnerabilità,
licenze/notice e diritti degli asset della distribuzione effettiva. Le basi presenti non sono
un'approvazione al rilascio industriale.
