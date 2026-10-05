# Licenze e gate di produzione

Aggiornamento: 5 ottobre 2026. Questa è una verifica tecnica e un registro dei punti da
chiudere, **non un'approvazione legale né un rilascio industriale approvato**.

## Inventario ripetibile

Il configuratore grafico delle connessioni del 5 ottobre non aggiunge dipendenze. Il ricontrollo
offline conferma inventario e gate aperti indicati sotto. Su scelta esplicita dell'utente, il
repository pubblico contiene solo codice: export JSON WinCC reali e foto di confronto rimangono
locali, esclusi da Git. Il push di un checkpoint non è un'approvazione al rilascio industriale.

`npm run check:licenses` legge `package-lock.json` senza rete e percorre dipendenze transitive,
peer e optional distinguendo editor, tooling e servizio MQTT. Interroga Cargo con
`metadata --offline --locked --filter-platform` per il target host: oggi Windows x64 MSVC.
Il report machine-readable è `.hmi-preview/license-audit.json` e non contiene credenziali.

Esito attuale: 255 pacchetti npm, di cui 44 nello scope MQTT; 266 pacchetti Rust nel grafo Windows.
Nessuna dipendenza npm obbligatoria mancante. I 44 pacchetti MQTT hanno metadati con licenze
riconosciute dalla lista permissiva conservativa; occorre comunque raccoglierne licenze e notice.
Il broker Aedes serve ai test e non viene installato nel servizio del pannello generato.

Ricontrolli offline del 2 ottobre 2026 dopo i dati strutturati negli script e dopo le protezioni
HMR/reload e deposito persistente delle bozze dell'editor: inventario invariato, nessuna nuova
dipendenza o asset. Rimangono
1 voce npm e 41 voci Cargo da esaminare, con
`releaseApproved: false` e codice di uscita 1 previsto dal gate; non è una nuova approvazione legale.

Il ricontrollo offline del 5 ottobre, dopo PropertyFlashing e la mappa delle risorse Tauri,
conferma lo stesso inventario e gli stessi punti aperti. Nessuna nuova dipendenza o asset:
la copia degli helper non costituisce un'approvazione al rilascio. Prima della distribuzione
serve verificare il plugin su una macchina senza checkout, Node e dipendenze Babel realmente
disponibili, poi censire nel gate gli eventuali nuovi file/dependency bundle distribuiti.

L'API Font del punto 83 non aggiunge font, dipendenze o download: usa famiglie disponibili nel
browser/dispositivo e i suoi fallback. Non conferisce diritti di redistribuzione a SiemensSans
o ad altri font citati negli export reali. L'eventuale bundling di font va autorizzato e censito
separatamente; il controllo offline e `releaseApproved: false` restano obbligatori.

Una decisione `review-required` non significa automaticamente uso commerciale vietato.
Significa che il controllo non ha eliminato la necessità di esaminare la licenza reale.
Le alternative OR riconosciute possono essere scelte; gli obblighi AND non vengono cancellati.
Eccezioni e sintassi legacy con `/` restano da leggere, non vengono interpretate arbitrariamente.
Il comando termina con codice 1 finché vi sono punti da rivedere e mantiene `releaseApproved: false`.

## Punti licenza ancora aperti

- `caniuse-lite@1.0.30001810`: CC-BY-4.0, attualmente nello scope tooling. Raccogliere attribuzione
  e notice se viene distribuito quel materiale; non etichettarlo come una licenza non commerciale.
- 41 voci Cargo richiedono verifica: comprendono MPL-2.0, Unicode-3.0, CC0-1.0, Zlib e dichiarazioni
  dual-license con sintassi legacy. L'elenco completo con versioni è nel report. Verificare quali
  file entrano nell'artefatto rilasciato e gli obblighi effettivi; non rimuovere le segnalazioni
  soltanto perché il nome della licenza è familiare.
- La licenza del codice Framecraft non è dichiarata dal titolare nel manifest. Non viene assegnata
  automaticamente MIT o una licenza proprietaria. Definire licenza/EULA e termini di distribuzione.
- Font, foto macchina, screenshot, icone aggiunte, export JSON e grafiche vendor richiedono diritti
  documentati separatamente. Il possesso di un export non dimostra il diritto a distribuirne gli asset.
- Il report copre il lockfile attuale e il target Windows, non tutte le piattaforme o tutte le
  possibili distribuzioni. Ogni pannello generato e lockfile del servizio installato va ricontrollato.
- Preparare una raccolta `THIRD-PARTY-NOTICES` con testi integrali e attribuzioni effettive dell'artefatto,
  incluse eventuali condizioni di redistribuzione del WebView/browser e del runtime Node.

Riferimenti primari: [licenza MQTT.js 5.16.0](https://github.com/mqttjs/MQTT.js/blob/v5.16.0/LICENSE.md),
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) e
[testo MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/).

## Audit vulnerabilità autorizzato

Controllo online precedente, non ripetuto nel ricontrollo offline del 2 ottobre 2026.

Il controllo online è stato autorizzato dall'utente; npm ha inviato nomi/versioni delle dipendenze
a `registry.npmjs.org`, non sorgenti, tag PLC o credenziali. Non è stato eseguito `npm audit fix`.

- `npm audit --json`: due segnalazioni moderate (`vitest@3.2.7`, `@vitest/mocker`), riferite alla
  stessa vulnerabilità di lettura di file attraverso redirect mock; nessuna alta o critica.
- `npm audit --omit=dev --json`: zero vulnerabilità note nel sottoinsieme delle dipendenze npm
  di produzione dell'editor. Il controllo completo comprende anche MQTT installato per test/generazione.
- Correzione da implementare e collaudare: Vitest almeno 4.1.11 (3.x non riceve il fix), senza
  aggiornamenti major automatici dell'intero progetto. La proposta npm a 5.x non è stata applicata.
- Il problema riguarda il dev server del mocker esposto e le condizioni descritte nel
  [bollettino ufficiale Vitest GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9).
  Non è una prova che un PLC o il pannello siano stati compromessi. Mantenere i server di sviluppo
  sul loopback e non includere Vitest nel servizio MQTT.
- Nessuna scansione RustSec o verifica di vulnerabilità del WebView/OS è stata completata in questa
  tranche. Zero segnalazioni npm non significa assenza di vulnerabilità o approvazione al rilascio.

## Gate industriali

Prima di autorizzare una release:

1. Approvare catalogo PLC e mapping reali, distinguendo tag interni, simulazione e acquisizione reale.
2. Collaudare CPU fisica/virtuale, broker e TLS: credenziali errate/scadute, trust, disconnessioni,
   dati obsoleti, payload errati e recupero dopo riavvio.
3. Autenticazione e ruoli lato server, sessioni e audit persistente; il token di stazione e il PIN
   nel browser non equivalgono a permessi verificati sul backend.
4. Conferma applicativa/idempotenza per i comandi PLC. Broker ack non è PLC ack; timeout può voler
   dire esito incerto. Nessun retry/replay automatico di comandi incerti. Interlock e safety nel PLC.
5. Integrare il trasporto asincrono nell'interprete prima di abilitare scritture PLC da script
   legacy; oggi sono bloccate in modalità connessa. Confermare contratto e sequenze sulla macchina.
6. Storage industriale, backup, retention, rotazione, spazio, allarmi e recupero verificati.
7. HTTPS/reverse proxy protetto e servizio gestito, health check/restart, segreti fuori dal bundle,
   privilegi minimi e separazione di rete. Vite dev/preview non è il deployment industriale.
8. Runtime supportati e versioni bloccate: baseline Node 24 LTS, non Node 26 Current usato qui per
   test. La scelta segue le [release supportate di Node](https://nodejs.org/en/about/previous-releases).
   Non è stato modificato Node globale della macchina.
9. Audit vulnerabilità/npm/Rust/OS e licenze/notice/SBOM della distribuzione effettiva; chiudere o
   accettare formalmente i rischi residui, senza usare il report come autorizzazione legale.
10. Per AI opzionale: provider, termini/licenze, trattamento dei dati industriali, approvazioni,
    segreti e limiti di spesa verificati prima della connessione. L'editor resta autonomo senza AI.

Il codice ora presente è una base verificabile da completare. La parità Unified/Optix e l'AI
rimangono obiettivi attivi, non vengono dichiarati conclusi per una build o un audit verde.
