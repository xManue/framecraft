# Prova desktop delle migrazioni script

Questa prova verifica il flusso su **Windows con WebView2 e IPC Tauri reali**.
Non sostituisce il collaudo del pannello su macchina. I dati sono sintetici e il test
non avvia gateway, MQTT, driver OPC UA o connessioni al PLC.

## Requisiti

- Dipendenze del repository e toolchain Rust già installate; Cargo deve poter compilare offline.
- WebView2 e Playwright disponibili nell’ambiente di sviluppo. Playwright è un requisito
  della prova, non una nuova dipendenza dell’applicazione.
- Framecraft chiuso e prova eseguita da sola, senza un’altra compilazione desktop concorrente.
- Una copia pulita del codice è consigliata per rendere riproducibile il risultato.

Dalla cartella del repository, in PowerShell:

```powershell
node tests/desktop/script-library-migration.mjs
```

Il test compila offline una finestra QA nascosta e crea progetto, log, immagini e profilo
WebView2 sotto `.hmi-preview/script-desktop-*`. Usa per default una cartella Cargo dedicata
`.hmi-preview/script-desktop-target`. Una prima compilazione senza cache può richiedere tempo.

Se Playwright è disponibile tramite un modulo esterno, impostarne l’URL prima del comando:

```powershell
$env:FRAMECRAFT_PLAYWRIGHT_MODULE = 'file:///C:/percorso/node_modules/playwright/index.mjs'
node tests/desktop/script-library-migration.mjs
```

Per riutilizzare la cache di una build desktop esistente, con Framecraft chiuso:

```powershell
$env:FRAMECRAFT_CARGO_TARGET = Join-Path (Get-Location) 'src-tauri/target'
node tests/desktop/script-library-migration.mjs
```

In questo caso deve già esistere `debug/framecraft.exe`: la prova ne conserva una copia,
compila la variante QA, la copia nei propri artefatti e ripristina il binario originale
verificandone l’impronta prima di avviare la variante. Le impronte Cargo possono cambiare;
la successiva build ordinaria ricontrolla la configurazione. Non eseguire compilazioni
concorrenti sulla stessa cache. Per compilare da un’altra copia pulita del codice si può
impostare `FRAMECRAFT_DESKTOP_SOURCE` al suo percorso assoluto.

## Cosa verifica

1. Apre il progetto sintetico con `analyze_project`, senza sostituire il bridge desktop.
2. Collega una nuova funzione e un parametro fisso dalla finestra Librerie.
3. Cambia un file dopo il confronto e verifica il rifiuto senza alcuna scrittura proposta.
4. Rilegge il progetto, applica la transazione reale e controlla catalogo e pagina su disco.
5. Controlla lo stato nativo `completed` e apre un ulteriore aggiornamento compatibile.
6. Verifica le nuove dipendenze dai tag e il parsing del sorgente modificato.
7. Recupera il backup dalla finestra reale e confronta i byte originali di pagina/catalogo.
8. Attende il catalogo riletto, controlla i file estranei conservati e lo stato `restored` tramite IPC.

L’output finale contiene `passed:true`, `realIpc:true`, `external:0`, `plcWrites:0` e il percorso
degli artefatti. In caso di errore consultare `cargo.log`, `desktop.log` e `failure.png` nella
cartella indicata. Un fallimento non autorizza a usare la macchina o a considerare completata
la verifica industriale.

La connessione di Playwright al controllo WebView2 segue la
[documentazione ufficiale Playwright](https://playwright.dev/docs/webview2).
Il debugging e il profilo dedicato vengono impostati soltanto sul processo QA, senza modificare
registro, configurazione di Framecraft o impostazioni globali del sistema.
