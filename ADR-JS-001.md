# ADR-JS-001: mantenere la IR finché il motore completo non supera il ponte asincrono

**Stato:** decisione accettata di rinviare QuickJS; il motore JavaScript completo rimane un requisito aperto.
**Data:** 4 novembre 2026.
**Responsabile:** manutenzione Framecraft, nell'ambito della chiusura della fase 3 Unified.

## Contesto

La IR limita tempo/operazioni e capacità dello script, con lo stesso interprete nel browser,
nei moduli persistenti e nel servizio Scheduler. La versione 9 aggiunge oggetti Error ma non
chiude classi, async/generator come funzioni valore e altre semantiche JavaScript.
Un sostituto deve eseguire una lettura sincrona vista dallo script sopra un trasporto host
asincrono, anche dopo await, senza rieseguire il codice o ripetere comandi. Deve mantenere
contesti/timer, dipendenze, controlli dei destinatari e autorizzazioni server.

## Decisione

Non integrare QuickJS Asyncify 0.32.0 nella pipeline di produzione in questa revisione.
Continuare le chiusure verificate della IR e mantenere aperta la valutazione del motore
completo. Il prototipo non introduce dipendenze nel package dell'editor o nei pannelli.
Un fallimento del prototipo non dimostra che ogni versione o integrazione QuickJS sia errata.

## Opzioni considerate

- **Estendere la IR esistente:** compatibile con servizio e browser, capacità già limitate e
  trasporto senza replay verificato; resta il costo di implementare semantiche JavaScript.
- **QuickJS in WASM con Asyncify:** linguaggio più ampio e isolamento dai valori host;
  richiede una nuova gestione di job, risorse, packaging e ciclo dei contesti. Per il contratto
  HMI serve anche la sospensione delle letture dentro i job Promise.
- **JavaScript host in Worker:** facilita le semantiche native, ma non risolve da solo i limiti
  di memoria nel browser né la compatibilità delle API sincrone del pannello. Non adottato
  senza verifiche equivalenti a quelle richieste al candidato WASM.

## Evidenza della prova

Pacchetti pubblici fissati: quickjs-emscripten-core 0.32.0,
@jitl/quickjs-wasmfile-release-asyncify 0.32.0, @jitl/quickjs-ffi-types 0.32.0.
Node 24.22.1 su Windows. Due processi separati, limite di memoria 8 MiB della VM,
stack 256 KiB, interrupt callback e timeout esterno 10 secondi. Solo una funzione sintetica
read che risponde 7 dopo 10 ms; nessun accesso PLC, rete, filesystem o credenziale esposto
al codice guest. Questi limiti non costituiscono un audit completo delle risorse del candidato.

1. Classe con campo privato e generatore che usa read: risultato 7, una chiamata, processo 0.
2. `(async()=>{await Promise.resolve();return read();})()` seguito dal metodo pubblico
   runtime.executePendingJobs: processo 1, errore QuickJSHostRefInvalid, nessun risultato
   completato valido. Il wrapper 0.32.0 espone executePendingJobs sincrono e le FFI separate
   QTS_ExecutePendingJob / QTS_ExecutePendingJob_MaybeAsync. Nessun accesso a FFI private
   o patch del pacchetto è stato introdotto per aggirare il risultato.

Il [sorgente ufficiale Asyncify](https://github.com/justjake/quickjs-emscripten/blob/main/packages/quickjs-emscripten-core/src/module-asyncify.ts)
documenta inoltre una sola sospensione concorrente per modulo WASM. La documentazione
[Runtime](https://github.com/justjake/quickjs-emscripten#runtime) espone limiti e interrupt;
la loro presenza non prova da sola il contratto completo richiesto da Framecraft.

## Riprodurre

Da un checkout con Node/npm, creare un progetto di prova in una directory ignorata:

```powershell
New-Item -ItemType Directory -Force .hmi-preview/javascript-engine-probe | Out-Null
'{"private":true,"type":"module","dependencies":{"quickjs-emscripten-core":"0.32.0","@jitl/quickjs-wasmfile-release-asyncify":"0.32.0"}}' | Set-Content .hmi-preview/javascript-engine-probe/package.json
npm install --prefix .hmi-preview/javascript-engine-probe --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node scripts/probes/quickjs-asyncify.mjs
```

L'ultimo comando produce JSON e conserva i log sotto .hmi-preview. Esce con codice 1
finché uno dei due scenari non termina con risultato 7 e una sola lettura. Il probe è
esplicitamente separato dalla suite normale; non installa dipendenze e non modifica l'app.
È possibile passare un percorso node_modules di prova come primo argomento.

## Conseguenze e criteri per riaprire l'integrazione

- [ ] Superare il caso Promise/lettura sospesa mediante API pubbliche mantenute, anche nel browser.
- [ ] Provare eccezioni, cancellazione, timeout, rientranza, dispose/timer e contesti paralleli
  senza replay o job attivi dopo il dispose.
- [ ] Dimostrare limiti CPU/memoria/stack e assenza di fuga host, inclusi guasti in callback.
- [ ] Mantenere la compatibilità IR 1–9 e i controlli server per operazione/risorsa.
- [ ] Integrare analisi delle dipendenze e librerie in versione, senza promesse di analisi statica
  esatta di JavaScript arbitrario.
- [ ] Decidere distribuzione WASM/browser/Node, asset offline, CSP, dimensioni e aggiornamento
  assistito. Il WASM scaricato misura 1.027.523 byte; non è stato aggiunto all'allowlist updater.
- [ ] Completare verifica licenze/notice del binario e delle componenti effettivamente distribuite.
  Le LICENSE dei pacchetti esaminati riportano MIT e includono notice QuickJS; nessun binario
  o sorgente del candidato viene distribuito da questa modifica.

La decisione non chiude la voce linguaggio completo nella roadmap e non autorizza una
migrazione silenziosa dei progetti esistenti.
