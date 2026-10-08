import { forwardRef } from "react";

export const PlcConnectionGuide = forwardRef<HTMLDetailsElement, { id: string }>(function PlcConnectionGuide({ id }, ref) {
  return <details ref={ref} id={id} className="connection-guide">
    <summary>Guida rapida · collegare il PLC e capire gli errori</summary>
    <div>
      <p>Qui prepari il collegamento del pannello. <strong>Salvare non collega la macchina e non invia comandi.</strong> MQTT e OPC UA scalare sono disponibili nel servizio Node.</p>
      <h3>Da dove cominciare</h3>
      <ol>
        <li>In <b>Pannello → Variabili PLC e simulazione</b> crea o importa i tag, scegli tipo e permessi, poi salva il catalogo. La simulazione è solo una prova offline.</li>
        <li>Chiedi al responsabile macchina il protocollo: per MQTT servono broker, topic e messaggio; per OPC UA servono endpoint, Namespace URI e identificatori dei nodi. Non usare nomi o indirizzi inventati.</li>
        <li>Preferisci <code>mqtts://</code> o <code>wss://</code>. Nei campi utente/password inserisci <b>solo i nomi delle variabili ambiente</b>. I valori e i file dei certificati devono essere sulla macchina che esegue il servizio Node.</li>
        <li>Abilita servizio gateway, connessione e collegamento del pannello, poi salva. Tieni le scritture disabilitate per il primo controllo dei dati.</li>
        <li>Il responsabile del servizio deve installarlo e avviarlo seguendo <code>runtime/README.md</code>, con token e proxy configurati. Dopo una modifica, va riavviato manualmente il servizio interessato. L’anteprima dell’editor non avvia collegamenti PLC.</li>
      </ol>
      <details><summary>Come associare un messaggio al tag</summary>
        <p>Se arriva il JSON <code>{'{"value":42,"qualityCode":192}'}</code>, imposta Valore nel JSON su <code>/value</code> e Qualità su <code>/qualityCode</code>. Se arriva solo <code>42</code>, lascia vuoto Valore nel JSON. Per testo scalare, scegli Testo scalare.</p>
        <p>Un topic è il canale del dato: quello di lettura riceve lo stato; quello comando invia una richiesta. Usa topic precisi, senza <code>+</code> o <code>#</code>. Il tipo deve corrispondere al catalogo PLC. Non inserire qualità o timestamp se il publisher non li fornisce.</p>
      </details>
      <details><summary>Cosa significano stato e qualità</summary>
        <p><b>Connesso:</b> il trasporto è disponibile, non prova che tutti i tag siano aggiornati. <b>Bad:</b> il dato è invalido, scaduto o non comunicante. <b>Qualità sconosciuta:</b> la sorgente non pubblica una qualità; Framecraft non inventa Good.</p>
        <p>Imposta Scadenza campione in base alla frequenza reale del publisher. Se non arriva mai un dato, il tag viene segnalato dopo quel limite. Dopo una disconnessione i valori precedenti restano visibili ma non validi.</p>
      </details>
      <details><summary>Comandi: non inviato, ricevuto o incerto?</summary>
        <p><b>Non inviato/rifiutato:</b> controlla connessione, tipo e permessi. Servono tag scrivibile e consensi nel gateway e nella connessione; per MQTT serve un topic comando, per OPC UA anche consenso del nodo e permesso del server.</p>
        <p><b>Ricevuta del servizio:</b> il broker MQTT o il servizio Write OPC UA hanno accettato il comando; non è conferma che la macchina lo abbia eseguito. Solo i dati acquisiti aggiornano il valore mostrato.</p>
        <p><b>Esito incerto:</b> il comando potrebbe essere arrivato prima della perdita della risposta. Verifica lo stato reale della macchina prima di un altro comando. <strong>Non ripeterlo alla cieca:</strong> Framecraft non lo reinvia e non mantiene code offline.</p>
      </details>
      <details><summary>Dove trovare gli errori e cosa controllare</summary>
        <p>Nel pannello autonomo apri lo <b>stato PLC in alto</b>: trovi eventi recenti, conseguenze e Come risolvere. Gli errori del gateway restano distinguibili da quelli del broker.</p>
        <p>Il servizio mostra gli stessi messaggi nella sua console e conserva fino a tre file da 1 MiB per servizio in <code>.framecraft-runtime/logs</code>, nella cartella del pannello. Il registro è locale: non contiene password, token o valori dei comandi, ma i nomi di connessioni/tag possono essere informazioni aziendali. Non pubblicarlo senza revisione.</p>
        <ul><li><b>Server non raggiungibile:</b> indirizzo, porta, servizio broker e firewall.</li><li><b>Accesso rifiutato:</b> variabili ambiente e permessi subscribe/publish sul broker.</li><li><b>Certificato:</b> CA, nome del server, scadenza e orologio. Non disattivare TLS per aggirare l’errore.</li><li><b>Dato non valido/non aggiornato:</b> topic, publisher, formato, percorsi JSON e frequenza di invio.</li><li><b>Client ID già in uso:</b> assegna un identificativo diverso a ogni servizio.</li></ul>
      </details>
      <details><summary>OPC UA e messa in produzione</summary>
        <p>OPC UA scalare: aggiungi OPC UA, scegli Firma e cifra e la policy prevista dal server. Prepara certificato client, chiave privata, Application URI e directory PKI sul servizio. L’URI deve coincidere con il certificato; il trust è reciproco e i certificati sconosciuti non vengono accettati automaticamente.</p>
        <p>Per ogni tag copia Namespace URI e identificatore nodo (per esempio <code>s=NomeReale</code>, senza <code>ns=</code>): l’indice del namespace viene risolto a ogni sessione. Tipo scalare e permessi vengono controllati sul server. Array, UDT, browser nodi, metodi e allarmi OPC UA non sono ancora implementati.</p>
        <p>Accesso rifiutato: controlla l’account OPC UA e i permessi del nodo. Certificato rifiutato: verifica trusted/issuers, CRL, scadenza, hostname e URI con il responsabile. Non passare a None per aggirare l’errore. None è soltanto per test isolati, con consenso esplicito e accesso anonimo.</p>
        <p>Per produzione servono HTTPS, ruoli e autenticazione sul server, interlock nel PLC, conferme applicative e collaudo sulla macchina reale. Il PIN del browser, il simulatore e un broker di prova non sostituiscono queste verifiche.</p>
      </details>
    </div>
  </details>;
});
