# Lavoro in corso — allineamento allo standard HMI

Diario di quello che viene fatto, in ordine. Serve a riprendere da dove si è arrivati senza rileggere
la conversazione. La descrizione dello standard sta in [STANDARD-HMI.md](STANDARD-HMI.md); qui c'è
solo cosa è stato cambiato e cosa resta.

Piano di riferimento: STANDARD-HMI.md §10.

---

## Fatto

### 1. Il modello dello standard, come dato — `src/core/hmiStandard.ts` (piano §10.3)

Prima lo standard esisteva solo come prosa in STANDARD-HMI.md. Ora è un modulo TypeScript, unico
posto in cui stanno numeri e regole, usabile sia dall'editor sia dai template:

- **geometria del guscio**: `panelSize`, `desktopShell` (TopBar 1280x151 / Lateral Bar 80x649 /
  contenuto 1200x649 a 80,151 / sottomenu 1280x800), `mobileShell`, `pageCanvas` (1280x694),
  `lateralBar` (icona 60x60 a x=14, prima a y=7, **passo 94**, etichetta 61x18 a +61, opacità 0.5 per
  la voce spenta), `submenuPanel` (210x290 a x=131, voci 158x34 a x=189 passo 40, triangolino 30x43),
  `mobileNavigator`, `settingsRow` (403x75 a x=20, passo 78, 7 righe), `pageFrame`;
- **tavolozza e font**: `palette` in `#AARRGGBB` (accento `#FF00A1D1`), `cssColor()` che la traduce in
  CSS, `typography` (SiemensSans, corpo 14, titoli 16/18);
- **le sette sezioni** (`sections`), con icona, sottomenu desktop e navigatore mobile di ciascuna;
- **la regola di numerazione**: `menuSlotNumber`, `menuSlotNumbers`, `pageNumber`, `pageNumberParts`,
  `isValidPageNumber`, `nextPageNumber`, `nextMenuSlot`;
- **il contratto tag**: `shellTags`, `pageLoadedScript(n)` (le tre righe obbligatorie dell'`onLoaded`),
  `menuEntryScript()` (le due `ChangeScreen`, desktop + mobile);
- **cosa si può disegnare e animare**: `itemTypes` (i 20 tipi `Hmi*` realmente usati),
  `dynamizedProperties` (le 19 proprietà animate, con le frequenze), il tipo `Dynamization`;
- **i testi**: `languages`, `plainText()` che estrae il testo dal frammento XHTML di Openness,
  `textIn()` che sceglie la lingua.

### 2. Il modello è verificato contro il progetto vero — `tests/hmi-standard.test.ts`

14 test, tutti verdi. Tre non sono test di unità ma di realtà: leggono `standard/index.json` e
controllano che **tutte** le pagine di contenuto del progetto (121 numeri, esclusi `0000_Layout_*` e
`0001_Choice`) rispettino la regola, e che le sezioni usate siano esattamente le sette della barra
laterale più i popup 9xxx. Se un domani lo standard cambia numerazione, questo test lo dice.

```bash
npx vitest run --config vitest.config.ts --configLoader runner tests/hmi-standard.test.ts
```

---

### 3. `operator-shell` riallineato allo standard (piano §10.4 e §10.5, parte desktop)

Com'era: geometria inventata (`--top-bar-height: 176px`, `--side-bar-width: 110px`, icone 76x76,
breakpoint a 1400/760/520 px), font `Segoe UI`, e il componente pieno di
`translate: "3.6px -1.7px"` e `__framecraftIndex === 2 ? {…}` accumulati dalle trascinate
nell'editor. Dentro lo slot `children` c'era anche un `SpecialFunctionsTemplate` inchiodato in
posizione assoluta — inserito dalla palette dell'editor senza props, che è il difetto noto.

Cos'è cambiato (`../templateHmi/`):

| file | cosa |
|------|------|
| `templates/_standard/hmiStandard.js` | **nuovo.** Il gemello JS di `src/core/hmiStandard.ts`, per i template. I due progetti non si importano a vicenda: se cambia una misura va cambiata in tutti e due (il file con i test è quello dell'editor). |
| `templates/operator-shell/src/styles.css` | riscritto sulle misure vere: 1280x800 fisso, TopBar 151, barra laterale 80, contenuto 1200x649. Niente breakpoint — nello standard il "mobile" non è lo stesso schermo più stretto, è un secondo layout. Font SiemensSans, tavolozza dello standard (accento `#00A1D1`). |
| `templates/operator-shell/src/OperatorShellTemplate.jsx` | ripulito dai `translate` accumulati e dal template inchiodato nello slot; le misure arrivano da `hmiStandard.js` come custom properties. Le sette icone sono posizionate a passo 94, e la sezione attiva si distingue per **opacità** (0.5 → 1), come nello standard, non per colore. |
| `templates/operator-shell/linked/section-menu-popup/` | **nuovo.** Un solo sottomenu per tutte e sette le sezioni, con le misure dello standard: pannello 210x290, voci alte 34 a passo 40, separatore, triangolino che punta all'icona. Prima erano quattro componenti clonati e **Settings, Statistics e Formats non avevano nessun menu**. |
| `…/section-menu-popup/src/templateData.js` | i sottomenu veri di tutte e sette le sezioni, presi da `standard/index.json`: ogni voce porta il **numero di pagina** dello standard (1001, 1041, 2041, …) e il nome della schermata WinCC che apre. |
| `templates/operator-shell/template.json`, `templates/index.json` | contratto aggiornato (`menus` + `onMenuItemSelect` al posto delle otto props per sezione), versione 2.0.0. |
| `panels/can-line-operator/src/App.jsx` | adattato al nuovo contratto, tenendo le sue voci di menu: un pannello vero ha le pagine della sua macchina, non quelle dello standard. |

I quattro popup vecchi (`linked/{main,alarms,manuals,diagnostic}-menu-popup/`) restano dove sono:
il pannello usa ancora i loro dati, e sono ancora nel catalogo. Il guscio però non li usa più.

**Verificato**: i sei file toccati passano il parser Babel e tutti gli import relativi risolvono; il
posizionamento verticale dei sette sottomenu è stato calcolato e sta dentro lo schermo in tutti i
casi. **Non verificato a schermo**: `pnpm build` in `templateHmi` non parte perché i symlink di
`node_modules` puntano ancora al vecchio percorso `Desktop\templateHmi` (la cartella è stata spostata
in `Desktop\hmiPanels\templateHmi`). Serve un `pnpm install`, che però cancella e rifà
`node_modules`: non l'ho lanciato di mia iniziativa. Per la stessa ragione
`reference/operator-shell.png` è ancora la vecchia geometria.

### 4. I pezzi dello standard nella palette dell'editor

`src/components/registry.ts` offriva una categoria "HMI e PLC" fatta di `div` generici con colori
estranei al pannello (`#22c55e`, `#4f46e5`, bordi `#cbd5e1`): roba da pagina web, non da HMI.

Aggiunta la categoria **"Standard HMI"**, per prima nella palette, con dieci pezzi presi dalle misure
vere: cornice pagina 1214x681, intestazione 1192x37, riga impostazione 403x75 (etichetta 213x43,
campo 70x33), riga con interruttore (pulsante 101x50), lista di sette righe a passo 78, lastra destra
784x618, schede 63x31 legate a `Folder_Vis`, campo I/O, testo SiemensSans 14, pulsante standard.
Tavolozza dello standard (`#48494E`, `#333333`, `#404D53`, bordi `#64646A`/`#7D7D85`, testo
`#F2F4FF`, accento `#00A1D1`).

Ogni pezzo dichiara `data-hmi-type="Hmi…"`: è il filo che collega quello che si disegna qui
all'oggetto WinCC che dovrà diventare. La categoria "HMI e PLC" resta com'era, e si potrà togliere
quando lo standard coprirà tutto.

Test (`tests/component-registry.test.ts`): 67 verdi, fra cui i tre nuovi che controllano che i pezzi
dello standard ci siano, che dichiarino tutti il proprio `data-hmi-type`, e che usino le misure e i
colori veri. `npx tsc -b` pulito, e l'intera suite dell'editor è verde (289 test).

### 5. Il navigatore mobile e il secondo layout (piano §10.5, completato)

Lo standard ha due layout e **una sola pagina**: `0000_Layout_PC` con barra laterale e sottomenu, e
`0000_Layout_Mobile` dove la stessa pagina è raggiunta da una striscia di tab. Mancava tutto il lato
mobile.

- `linked/section-navigator/` — **nuovo**: la striscia 1280x64 con le tab 157x43 e la barretta 158x5
  sotto quella attiva. Il tab acceso lo decide `Actual_Page_Number` (prop `currentPage`), non un
  click: è come funziona nel pannello. Le voci sono le stesse del sottomenu desktop — un solo elenco
  per due navigazioni, che è il punto.
- `OperatorShellTemplate` ha ora `layout="desktop" | "mobile"`. In mobile disegna `TopBar_Light`
  (fascia 52 dentro i 70 dichiarati), il navigatore a y=47 alto 64 e la pagina 1280x694 da y=105 —
  le sovrapposizioni sono quelle del progetto, non sviste. Le sette sezioni, che in mobile non hanno
  una barra dove stare, scendono dalla TopBar come fa `TopBar_Big`.
- L'anteprima del template (`src/App.jsx`) ha un pulsante per passare da PC a Mobile.

**Una deviazione consapevole**: nel progetto vero le sette tab del navigatore sono tutte disegnate
sopra la stessa posizione (`Left 1, Top 0`) — quella schermata è rimasta a metà. Qui sono affiancate
a passo 158, che è la larghezza della barretta, cioè quello che il disegno voleva dire. È scritto
anche nel `template.json` del navigatore.

### 6. Il contratto vecchio resta valido, e il pannello di prova non si tocca

Avevo cambiato `panels/can-line-operator/src/App.jsx` per adattarlo al nuovo `menus`. Sbagliato: il
pannello è il banco di prova dell'utente, e i template devono essere riutilizzabili **senza** che chi
li usa debba riscriversi. Il file è stato rimesso esattamente com'era (verificato con `git diff`:
restano solo le modifiche dell'utente).

Il guscio ora accetta **tutti e due** i contratti: `mainMenuItems`/`onMainMenuItemSelect` e compagnia
continuano a funzionare come prima, e `menus`/`onMenuItemSelect` è la strada nuova che copre sette
sezioni invece di quattro. Se una sezione è dichiarata in tutti e due i modi vince `menus`, sezione
per sezione.

### 7. Il template della sezione Settings — `templates/settings-page/` (piano §10.6)

La sezione Settings da sola vale **73 delle 160 schermate** dello standard, e sono quasi tutte la
stessa pagina: cornice, titolo, e una o due colonne di righe "etichetta a sinistra, controllo a
destra". Quindi un template solo, e le pagine cambiano solo l'elenco che gli passi.

Misure vere, prese da `hmiStandard`: tela 1280x694, cornice 1214x681 a (9,8), intestazione 1192x37,
righe **403x75 a passo 78** (75 di altezza + 3 di stacco), sette per colonna, campo I/O 70x33,
interruttore 101x50, lastra destra 784x618, schede 63x31 legate a `Folder_Vis`. Quando c'è la lastra
la colonna di righe è una sola, altrimenti due: è così che sono fatte le pagine vere.

Due cose lo rendono **riutilizzabile dall'editor**, che è il punto:

- l'elenco `settings` ha **la stessa forma** (`id, label, control, tag, value, unit`) che l'affordance
  `settings-list` del `panel.json` già sa leggere e scrivere — la stessa che `can-line-operator` usa
  per `specialFunctions`. Chi mette questa pagina in un pannello copia il blocco
  `suggestedAffordance` dal `template.json` e l'editor gli dà subito aggiungi/togli/rinomina;
- `pageNumber` viaggia sull'elemento come `data-page-number`, e i controlli portano
  `data-hmi-type="HmiIOField" | "HmiButton"` e `data-plc-variable`. È il filo che tiene insieme
  quello che si disegna qui e l'oggetto WinCC che dovrà diventare.

`control` accetta `number` (`HmiIOField`), `toggle` (l'`HmiButton` a due immagini On/Off dello
standard), `button` (comando) e `text` (sola lettura). I dati d'esempio sono una pagina vera,
`2042_Encoders_Lifter_1`, con i nomi di variabile veri del progetto; le etichette invece sono
ricostruite, perché i testi delle schermate nell'export non ci sono.

Registrato in `templates/index.json` e negli script di `templateHmi/package.json`
(`dev:settings-page`, `build:settings-page`). **Verificato**: i quattro sorgenti passano il parser
Babel e tutti gli import relativi risolvono. **Non verificato a schermo**, per il `pnpm install`
mancante detto al punto 3.

### 8. La numerazione automatica delle pagine (editor)

Nel progetto vero il numero di una pagina non e' un'etichetta: e' la sua posizione nel menu. La
regola `N000 + 1 + 40k` dice a quale sezione appartiene, quale voce del sottomenu si accende, e quale
numero finisce in `Actual_Page_Number` e nel PLC. Una pagina numerata a caso esiste ma il menu non la
illumina.

- **`src/core/hmiPages.ts`** (nuovo): `collectPageNumbers()` rilegge i numeri gia' presi dai sorgenti
  (`data-page-number={2041}`, `"2041"`, e il `pageNumber:` dei dati di un template), scartando quelli
  che non rispettano la regola; `planPageNumber(sezione, presi)` da' il numero della prossima pagina —
  senza `slot` apre una **voce di menu nuova**, con `slot` mette la pagina **sotto** quella voce, come
  nascono 2042, 2043…; `describePageNumber()` lo dice a parole; `standardPageSource()` genera la
  pagina gia' fatta: tela 1280x694, cornice 1214x681, intestazione 1192x37, `data-page-number` e
  `data-hmi-tag="Actual_Page_Number"` sull'elemento, e nel commento **le tre righe dell'`onLoaded`**
  che la schermata WinCC dovra' eseguire.
- **`panel.json`**: `ManifestPage` ha ora `pageNumber` e `section` (facoltativi — un manifesto che non
  li dichiara si comporta come prima), `manifestPageNumbers()` li raccoglie e
  `manifestWithPageNumber()` scrive il numero **senza toccare nient'altro** del file. Serve perche' i
  numeri stanno in due posti: nel sorgente della pagina e nel manifesto, che puo' dichiarare una
  pagina anche prima che esista.
- **Pannello Pagine**: la form "Nuova pagina" ha un menu a tendina con le sette sezioni. Scelta una
  sezione, la pagina nasce numerata, con cornice e intestazione, e il numero viene scritto anche nel
  `panel.json` se il pannello ne ha uno. Lasciando "Nessuna — pagina libera" l'editor si comporta
  esattamente come prima: e' un'aggiunta, non un obbligo.

Test: `tests/hmi-pages.test.ts`, 19 verdi (fra cui che il sorgente generato **si rilegge da solo**, e
che riscrivere lo stesso numero nel manifesto non tocca il file). Suite intera dell'editor: **320
verdi**, `npx tsc -b` pulito.

---

### 9. Copertura completa delle schermate standard nell'editor

`src/core/hmiTemplateCoverage.ts` classifica tutte le **160 schermate** di `standard/index.json`:
una schermata di contenuto punta alla sua famiglia pagina, mentre layout, barre, menu, navigatori e
popup puntano a un blocco riutilizzabile della palette. In questo modo non vengono create 160 card
quasi uguali e, soprattutto, un popup 9xxx non viene spacciato per una pagina normale.

Il catalogo contiene ora 21 famiglie pagina, comprese griglia comandi, contenuto web, allarmi per
zona, storico allarmi, diagnostica per zona e selezione pallet. Il pannello Nuova pagina ha filtri per
sezione e ricerca per nome o schermata sorgente.

La palette contiene anche guscio desktop/mobile, top bar, barra laterale, menu di sezione, navigatore
mobile e i popup 9001-9010. `tests/hmi-template-coverage.test.ts` controlla che la copertura resti
160/160 e che ogni riferimento punti a un template o componente realmente disponibile.

### 10. Dynamization come proprietà di prima classe nell'Inspector

Ogni elemento selezionato ha ora la sezione **Dinamica PLC**. Si possono aggiungere più proprietà
indipendenti fra le 19 usate dallo standard (`ProcessValue`, `BackColor`, `Visible`, `Graphic`,
geometria, colori, ecc.), scegliere una variabile del catalogo PLC e configurare:

- valore diretto;
- intervalli/soglie con `from`, `to` e valore risultante;
- bit o condizione singola;
- condizione personalizzata;
- in modalità completa, lista risorse, espressione o funzione.

Le regole sono salvate nel JSX nell'attributo `data-hmi-dynamizations` come dato strutturato e non
si confondono con il semplice `data-plc-variable`. Il modello tollera configurazioni vecchie o rotte
senza bloccare l'Inspector ed è coperto da `tests/hmi-dynamizations.test.ts`.

### 11. Palette HMI completa e neutra rispetto alla macchina

La palette offre ora almeno un blocco per tutti i **20 tipi Hmi*** realmente presenti nello standard:
forme, linea, poligono, area touch, faceplate, campo simbolico, widget SVG, web control, data grid,
barra, gauge, radio group e alarm control, oltre ai controlli già presenti.

I componenti della vecchia categoria "HMI e PLC" sono stati riallineati a SiemensSans, misure e
colori dello standard. Rimossi i colori web e i tag finti `Machine.*`, `Motor.*`, `Commands.*`:
nascono con `data-plc-variable=""` e aspettano che l'utente scelga una variabile reale del proprio
catalogo PLC.

**Verificato**: suite completa dell'editor, 32 file e **366 test verdi**; `npm run build` completata.
Vite segnala solo il warning non bloccante sul chunk principale grande.

### 12. Nuovo pannello standard in un solo flusso

La pagina iniziale ha ora **Nuovo pannello standard**. Il wizard chiede soltanto il nome della
macchina, il layout desktop oppure desktop + mobile e le sezioni da preparare. Dopo la scelta di una
cartella vuota, Framecraft crea un progetto Vite/React realmente apribile con:

- guscio operatore 1280x800, navigazione e router gia' collegati;
- una pagina standard numerata per ogni sezione scelta;
- `panel.json` coerente con route, sezione e numero pagina;
- `framecraft.plc.json` vuoto, pronto per importare i tag reali senza inventare variabili;
- stile desktop e, se richiesto, navigatore e low bar mobile.

La creazione passa dal comando desktop Rust e accetta solo percorsi relativi interni alla cartella
scelta. Nei preset non vengono lasciate le pagine demo Home/About del progetto vuoto. Appena creato,
il progetto viene aperto nella normale copia di lavoro protetta dell'editor.

**Verificato**: suite completa dell'editor, 33 file e **371 test verdi**; 18 test Rust verdi;
`npx tsc -b` e `npm run build` completati. Vite segnala soltanto i warning non bloccanti gia' noti
sul chunk principale e sugli import sia statici sia dinamici.

### 13. Riallineamento dei template alle foto reali (in corso)

E' stata aggiunta `FotoStandardManu`, con 279 screenshot 1282x795 di desktop, mobile, popup e
faceplate. Il primo confronto ha mostrato che i template attuali non sono abbastanza fedeli: sono
famiglie costruite soprattutto da nomi e dati esportati e usano erroneamente la tavolozza scura del
guscio anche dentro pagine che nelle foto sono bianche e grigio chiaro.

Creato `FOTO-STANDARD.md` come riferimento persistente: contiene inventario, regole del guscio,
tavolozza della pagina, famiglie visive realmente osservate, limiti delle foto e checklist. Va
aggiornato durante ogni giro di correzione, cosi' non serve riclassificare tutte le immagini.

**Da fare nel giro corrente**: correggere prima le primitive condivise e il guscio; poi sostituire
le famiglie generiche, a partire da Program Modification, encoder, mappa manuale, OMAC e allarmi;
infine renderizzare e confrontare a schermo. Nessun template e' da considerare visivamente validato
finche' questo passaggio non e' completato.

Primo avanzamento: aggiunta una tavolozza separata per il contenuto chiaro, riscritte le 21 basi
esistenti, collegati metadati `referenceImage` e `visualStatus`, corretta la generazione della tabella
allarmi e aggiunto il file immagine segnaposto nei nuovi progetti. I template senza foto utile sono
ora dichiarati `missing`, quindi non vengono confusi con ricostruzioni approvate. La fase successiva
e' dividere Program Modification, encoder e le funzioni 2081-2241 nelle famiglie realmente visibili.

Secondo avanzamento, quello che chiude il giro: i template non ridisegnano piu' i pezzi a modo loro.
`src/core/hmiPrimitives.ts` tiene il sistema visivo misurato sulle foto (scheda, intestazione 34,
riga 108 con etichetta sopra, riga compatta 59 con etichetta a fianco, campo, select col bottone
grigio, switch, radio, comando, tabella a righe alterne con le colonne divise, piastrella, linguette)
e `src/core/hmiPageTemplates.ts` ci costruisce sopra **28 famiglie**, una per forma di pagina vista
davvero: striscia programma + quota illustrata + colonna impostazioni (2001, che copre 21 schermate),
indice a piastrelle sul fondo scuro (2041), taratura encoder a righe compatte (2042, 18 coppie),
funzioni robot, lubrificazione, comando dispositivo con la barra di navigazione e la fila di stati
(2201-2203), allarmi, mappe, sinottici, formati. La barra del titolo non e' piu' sempre uguale: la
mette la famiglia dove la mette la schermata vera, e la 2001 infatti comincia con la striscia del
programma. Le linguette a destra le genera la pagina, in numero e colore della sezione.

Il confronto non e' piu' a memoria: `node scripts/hmi-page-preview.mjs` genera le pagine con le
stesse funzioni dell'editor, le rende dentro il guscio (1280x800, pagina rimpicciolita di 0.9375) e
le serve su `http://localhost:4173`, una per famiglia, da mettere accanto alla foto.

La memoria tecnica generale del prodotto e del flusso dati e' in `ARCHITETTURA-HMI.md`; le regole
puramente visive e la classificazione delle foto restano in `FOTO-STANDARD.md`.

### 14. Il pannello che nasce dal flusso "crea pannello standard" e' quello vero

Le famiglie di pagina erano state rifatte, ma il progetto generato dal wizard partiva ancora da un
guscio inventato: barra alta con la scritta "PANNELLO OPERATORE", una fila di link testuali e una
tavolozza scura scelta a occhio (`#202126`, `#48494E`, accento `#00A1D1`). Chi creava un pannello
nuovo si trovava davanti qualcosa che non somiglia allo standard, e le sezioni avevano nomi tradotti
("Produzione", "Parametri") che nel pannello vero non esistono.

`src/core/standardProject.ts` ora genera il guscio **misurato sulle foto**:

- barra alta 151 sul nero, con due file di schede `#333333`: orologio e data, First Fault (icona,
  numero, testo, zona), PLC Connection con la barretta verde `#339966`, logo; sotto: utente, la
  scheda Line / Nr. / Format Running a tre righe, OMAC con Status e Mode, velocita' con barra e scala;
- barra laterale 80x649 con le sette tessere 60x60 a `x=14`, passo 94 ed etichetta 61x18 sotto; ogni
  tessera prende la sfumatura della sua sezione da `hmiStandard.sections` e sta a meta' opacita'
  quando non e' la pagina aperta, esattamente come lo `Opacity <= Actual_Page_Number` dello standard;
- la finestra della pagina a (80,151) 1200x649, con la pagina rimpicciolita di 0.9375;
- il layout mobile: barra compatta fino a y=47, navigatore a linguette alto 58 con la voce attiva nel
  colore della sezione e la barretta sotto, contenuto da y=105 a grandezza naturale.

Le sette sezioni hanno di nuovo il nome dello standard (Main, Settings, Alarms, Statistics, Manuals,
Diagnostic, Formats) e ognuna apre la **sua** pagina vera: 1001 Upstair, 2001 Program Modification,
3001 Alarm, 4001 Statistics, 5001 Manual General, 6001 Synoptic, 7001 Formats. Le rotte seguono lo
stesso vocabolario (`/settings`, `/alarms`, ...) invece della traduzione italiana.

I pittogrammi delle tessere sono disegni SVG equivalenti alle grafiche TIA (`Icon_MachineControl`,
`Icon_Settings_1`, ...): servono a far vedere subito la barra giusta e restano sostituibili quando le
225 grafiche saranno esportate.

Per guardarlo invece di fidarsi del codice: `node scripts/hmi-panel-preview.mjs` genera il progetto
con le stesse funzioni dell'editor, impacchetta `src/App.tsx` con il suo `styles.css` e lo serve su
`http://localhost:4174/panel-desktop.html`. Il pannello e' vivo: si clicca la sezione, si apre il
suo sottomenu e le voci cambiano pagina (il `react-router-dom` del progetto e' sostituito da un
router finto di venti righe, perche' e' una dipendenza del pannello generato, non dell'editor).

**Verificato**: `npx tsc -b` pulito e 379 test verdi, fra cui due nuovi che bloccano il guscio sulle
misure rilevate e sulle pagine di partenza delle sezioni.

### 15. Il menu Main: l'icona apre il sottomenu, le voci portano alle pagine

Nello standard l'icona della barra laterale **non** naviga: apre il pannello bianco
`Nxxxx_<Sezione>_Template` con le voci della sezione, e sono le voci a cambiare pagina. Il pannello
e' sempre lo stesso, quindi le sue misure stanno in `src/core/hmiStandard.ts` una volta sola
(`submenuPanel`: 210x290 a x=131, voci 158x34 a passo 40 con la prima 8 sotto il bordo, triangolino
30x43 a x=102, massimo sette voci) e `submenuPlacement` in `src/core/hmiSectionMenu.ts` le fa
scendere con l'icona della sezione, tenendole dentro lo schermo.

`src/core/hmiSectionMenu.ts` porta anche la **pianta della sezione**: quali voci ha, con che
pittogramma, e quali pagine sta sotto ognuna col numero che vuole la numerazione (`N000 + 1 + 40k`).
La Main e' completa, sulle foto `0001_Menu_1xxxx_Main_Template` e seguenti — sette voci, nove pagine:

| Voce | Pagine |
| --- | --- |
| Machine View | 1001 Upstair, 1002 Downstair (due linguette) |
| Counter Machine | 1041 Counters, 1042 Robot Ex Popup (dieci linguette) |
| Special Function | 1081 Machine Special Functions |
| Collector Counters | 1121 |
| Free | 1161 |
| PackML | 1201 OMAC - Machine |
| Maintenance | 1241 |

La 1281 Chat Bot esiste nel progetto vero ma nel menu non c'e' (il pannello ne mostra al massimo
sette): resta una famiglia disponibile, non una voce inventata. Le pagine 1002, 1041, 1121, 1161 e 1241
nella foto sono la sola lastra vuota: il template le fa cosi', invece di riempirle di dati finti.

Da qui il flusso "crea pannello standard" genera **quindici** pagine invece di sette: le nove della
Main piu' la prima pagina delle altre sei sezioni, tutte registrate in `panel.json` col loro numero.
(Con la Settings di §17 e le altre cinque di §18 sono diventate quarantaquattro.)
Le famiglie nuove disegnate per la Main:

- `machine-render` (1001): il rendering della linea sulla pagina grigia, con i tre funghi di
  emergenza, le due barriere e le cinque zone che si toccano, alle coordinate dell'export.
- `machine-downstair`, `main-counters`, `main-collector-counters`, `main-free` e
  `main-maintenance`: cinque basi vuote distinte, con la sola area touch e gli swipe del proprio JSON.
- `special-function` (1081): sette righe bianche a sinistra e la scheda con l'immagine a destra.
- `production-overview` (1201): il diagramma PackML, diciassette caselle piu' le transizioni, con lo
  stato in corso in verde.
- `command-grid` (1042): pagina vuota con dieci linguette, che e' esattamente quello che c'e'.

Nel pannello generato la barra laterale e' fatta di bottoni: quello di una sezione con sottomenu lo
apre, quello di una sezione senza sottomenu salta alla sua pagina. Mentre il menu e' aperto lo
schermo va in penombra e le tessere restano tutte accese, come nella foto.

**Verificato**: `npx tsc -b` pulito, 380 test verdi, e il pannello reso nel browser confrontato con
`0001_Menu_1xxxx_Main_Template.png` — sottomenu a 131,160, sette voci, e PackML che apre la 1201.

### 16. La foto della macchina si sceglie una volta sola, all'inizio

La stessa immagine della macchina serve su quattro pagine diverse (1001, 1081, 4001 e 5001):
chiederla quattro volte nell'Inspector sarebbe stato un lavoro ripetuto. Ora la procedura "Nuovo
pannello standard" ha un campo facoltativo **Immagine della macchina**: si sceglie il file col
selettore di sistema (`desktopBridge.chooseImage`), e il progetto nasce con quella foto gia' al suo
posto.

Perche' non finisca anche nelle schede di dettaglio (il motore, il gruppo di lubrificazione, la
quota del programma), le immagini dei template sono etichettate: `machineImage(..., role)` in
`src/core/hmiPrimitives.ts` emette `data-image-role="machine"` oppure `"detail"`, e
`standardProject.ts` sostituisce il segnaposto solo dove il ruolo e' `machine`. Le altre restano
sul segnaposto "Sostituisci immagine nell'Inspector", che e' la verita': quelle dipendono dalla
macchina, non dalla linea.

Il file viene **copiato**, non scritto: `GeneratedProjectFile` ora ha un campo `source` e il comando
Rust `create_vite_project` fa `fs::copy` quando c'e', invece di scrivere `content` come testo — una
PNG passata come stringa si romperebbe. Finisce in `public/framecraft-assets/<nome>.<ext>`, la
stessa convenzione che l'editor usa gia' per le immagini aggiunte a mano, quindi da li' in poi si
cambia dall'Inspector come qualsiasi altra.

### 17. Il menu Settings: sette voci, undici pagine (poi cinquantaquattro, §19)

Stessa struttura della Main (§15), stesso file: `settingsSection` in `src/core/hmiSectionMenu.ts`.
Le voci sono quelle della foto `0012_Menu_2xxxx_Settings_Template`, con i pittogrammi nuovi
(programma, encoder, motore, robot, olio, guida, sistema):

| Voce | Pagine |
| --- | --- |
| Program Settings | 2001 Program Modification |
| Encoders | 2041 indice a piastrelle, 2042 e 2043 ENCODER - Lifter (due linguette) |
| Motor Speed | 2081 |
| Robot Function | 2121 |
| Lubrication | 2161 Lubrification |
| Infeed Guide | 2201 MMC - Guide, 2202 MMC - Motor Box, 2203 MMC - Motor (tre linguette) |
| System Function | 2241 |

Sono undici pagine e non le ottantacinque dell'export: le venti sagome di Program Modification e le
diciotto coppie di encoder sembravano essere **di questa macchina**, non dello standard. Sbagliato, e
il §19 rimette le cose a posto: le linguette numerate a destra erano gia' li' a dire che le pagine
sorelle esistono. Il pannello nasce con
una di ognuna, gia' numerata e collegata; le altre si aggiungono dal pannello Pagine, che sa
riusare la stessa famiglia col numero giusto. Le piastrelle della 2041 non sono decorative: ognuna
apre `/settings/encoders/<nome>`, e il doppio click sulla prima porta davvero alla 2042.

La regola di posizionamento del sottomenu non e' piu' scritta a mano sezione per sezione. Misurando
tutti e sette gli `standard/screens/Template Desktop/*.json` viene fuori una sola regola — il
pannello scende con l'icona (circa 38px piu' in alto), resta dentro lo schermo, e la sua altezza la
fa il numero di voci — che riproduce esatte la Main (160) e la Diagnostic (500, che sbatte sul
fondo) e le altre entro una quindicina di pixel. Cosi' anche le sezioni ancora da fare avranno il
menu al posto giusto senza altre misure.

**Verificato**: `npx tsc -b` pulito, 382 test verdi, e nel browser il sottomenu Settings mostra le
sette voci con il triangolino sulla sua icona; Encoders apre la 2041 con le sue diciotto
piastrelle, e il doppio click su Lifter arriva alla pagina con `data-page-number` 2042.

### 18. Le altre cinque sezioni: il pannello nasce completo

Alarms, Statistics, Manuals, Diagnostic e Formats hanno adesso il loro sottomenu e le loro pagine,
sempre in `src/core/hmiSectionMenu.ts` e sempre lette dalla foto del `Nxxxx_<Sezione>_Template`:

| Sezione | Voci | Pagine |
| --- | --- | --- |
| Alarms | Alarms, Alarms By Zone, History, Media Mngmnt + 3 Free | 3001, 3041, 3081, 3121 |
| Statistics | Statistics, Production, Availability + 4 Free | 4001, 4041, 4081 |
| Manuals | General e le sei stazioni + 1 Free | 5001, 5041, 5081, 5121, 5161, 5201, 5241 |
| Diagnostic | Synoptic, Robot, Diagnostic Zone, Diagnostic Device, Prev. Maintenance, Profinet, Free | 6001, 6041, 6081, 6121, 6161, 6201, 6241 |
| Formats | Format Selection, Formats Copy, Pallet Store Select + 4 Free | 7001, 7041, 7081 |

Cosi' il flusso "crea pannello standard" genera **quarantaquattro** pagine: tutte quelle che nel
progetto vero hanno una schermata, nessuna inventata.

Tre cose imparate leggendo l'export, che valeva la pena tenere invece di appianare:

- **Le voci "Free" non sono un errore.** Nelle foto quasi ogni menu ne ha qualcuna: e' il posto che
  lo standard tiene libero. Dove la schermata esiste davvero (1161 della Main, 6241 della
  Diagnostic) la voce porta alla sua pagina; dove non esiste — le tre di Alarms, le quattro di
  Statistics e di Formats, quella di Manuals — la voce resta nel menu **spenta**, e non genera una
  pagina finta. Chi domani ci mette la pagina si ritrova gia' il numero giusto.
- **Manuals ha otto voci, non sette.** E' l'unica: il pannello del sottomenu si allunga da solo,
  perche' l'altezza la fa il numero di voci.
- **Robot, Prev. Maintenance, Profinet, la 6241, Production e Availability sono vuote per davvero.**
  Le prime quattro nell'export sono cornice e lastra bianca e basta; le due di Statistics hanno un
  `WebControl` che riempie la lastra, quindi il contenuto arriva dal server e non dalla schermata.
  Tutte e sei nascono come `data-board`, che e' esattamente quello che sono.

Le tre pagine dei formati non avevano una foto e infatti erano tre disegni a occhio, per giunta con
le scritte in italiano. Ora vengono dai JSON dell'export, che per coordinate, tipi e conteggi
valgono quanto una foto: la 7001 ha la colonna del formato in uso (gruppo, scheda Format e scheda
Pallet con numero, nome, freccia e bottone di diagnostica), il comando grosso che carica, e a destra
la lista di tredici righe con la barra di scorrimento e le due frecce del wizard; la 7041 le due
schede sfalsate origine/destinazione con la grafica della freccia; la 7081 la grafica del magazzino
con le due schede e i poligoni che le legano al punto giusto. I testi restano segnaposto in inglese,
perche' nell'export sono riferimenti multilingua e la lingua del pannello e' l'inglese.

**Verificato**: `npx tsc -b` pulito, 383 test verdi, e nel browser tutti e cinque i menu aperti uno
per uno — voci giuste, "Free" spente dove devono, il pannello di Manuals piu' alto degli altri e
quello di Diagnostic appoggiato al fondo esattamente come nell'export (500). Le voci navigano:
Pallet Conveyor apre la 5241, Format Selection la 7001, History la 3081, Diagnostic Device la 6121.

### 19. Le linguette numerate sono pagine sorelle, e i pacchi si muovono davvero

Due cose viste guardando il pannello generato, e tutte e due erano gia' scritte nell'export.

**Le linguette numerate a destra non sono decorazione: sono altre pagine.** Nei JSON ogni linguetta
e' un `Button` a Left 1208, 63x31, passo 36, e il suo script e' `ChangeScreen("<schermata>", ".")`.
Quindi una pagina con dieci numeri in colonna non nasconde dieci pannelli: e' una pagina di dieci, e
le foto delle altre nove ci sono, nello standard, dal principio. Fino a ieri quelle linguette non
portavano da nessuna parte.

Adesso ci portano. In `hmiSectionMenu.ts` un gruppo di sorelle comincia dove `folderTab` torna a 0 e
finisce dove ricomincia (`folderGroupRoutes`), cosi' una voce sola puo' tenerne tanti indipendenti —
Encoders e' l'indice piu' diciotto coppie — e le pagine senza `folderTab` restano fuori: la 1042 ha
dieci linguette e una schermata sola, e quelle restano ferme com'erano. Il resto e' un
`folderRoutes` che scende da `standardProject.ts` fino a `folderTabs`, che su ogni linguetta diversa
da quella aperta mette `onClick={() => openPage("<sorella>")}`.

Il pannello generato passa cosi' da **quarantaquattro a ottantasette** pagine: Program Settings
2001-2010, Encoders 2041 piu' le trentasei dei suoi diciotto (2042-2077). Non e' gonfiare il
progetto, e' smettere di generare un moncone: erano gia' tutte nel menu dell'export.

Le dieci di Program Settings sono **sette forme** (la settima e la decima si somigliano, come
l'ottava e la nona), tutte disegnate sulle coordinate dei JSON e confrontate con la foto:

| Pagina | Famiglia | Cos'e' |
| --- | --- | --- |
| 2001 | `program-modification` | quote del pacco |
| 2002 | `program-layer` | composizione dello strato, con l'area grafica |
| 2003 | `program-pallet` | pallet e strati |
| 2004 | `program-callouts` | velocita' di preformazione, quote sul disegno |
| 2005 | `program-infeed` | griglia di parametri dell'ingresso |
| 2006 | `program-robot` | parametri col disegno del robot al centro |
| 2007, 2010 | `program-quotes` | quote attorno alla macchina |
| 2008, 2009 | `program-squaring` | matrici di pusher con i toggle |

Tutte e dieci portano in testa la stessa striscia alta 72 — numero programma, descrizione, il
comando che salva (`ProgModR.PV.Save_Program`) e le due spie — perche' nell'export ce l'hanno
davvero tutte, uguale.

**I pulsanti funzionano, e si vede.** Era la seconda domanda: la logica sta nei JSON? Si', ma non
come script — sta nei tag. I pulsanti a passo hanno `IncreaseTag`/`DecreaseTag` col loro passo, i
toggle `InvertBitInTag`, il salva `SetBitInTag`; e i trenta pacchi dell'area grafica sono trenta
faceplate `Pack_1..30`, ognuno con la sua `TagDynamization` su Left/Top/Width/Height legata a
`ProgModR.PV.PatternDisplay_Pack[i].Pos_X/Pos_Y/Size_X/Size_Y`. Non c'e' codice che li disponga: li
dispone il PLC, e la pagina fa da specchio.

Nella pagina generata quindi:

- i quattro passo-passo scrivono i tag veri col passo dell'export — `GroupN` +1 (max 6),
  `DATA_PackInGroup` +1 (max 5), `DATA_DistanceBeetweenPack` +10 (max 120),
  `DATA_GroupInfo.PositionY` +10 (max 200) — con `data-plc-write` e `data-plc-step` nuovi in
  `hmiPrimitives.ts`, che valgono per qualunque pagina, non solo per questa;
- i trenta pacchi sono trenta elementi **statici**, non un `.map()`, e ognuno porta scritta la sua
  `data-hmi-dynamizations`. Doveva essere cosi': l'Inspector legge quell'attributo dall'AST, e una
  stringa costruita a runtime gli si presenterebbe come lista vuota. Statici, si selezionano e si
  modificano uno per uno come qualsiasi altro elemento;
- e perche' la cosa si veda anche senza PLC, la pagina tiene i quattro valori in `useState` e calcola
  il posto di ogni pacco dagli stessi quattro numeri. Premi `+` su Group e nell'area grafica compare
  un'altra fila; premi `+` su Distance e le file si allontanano; premi `+` su Pos Group e scendono
  tutte insieme. E' il primo template che ha un preambolo prima del `return` (`templateImports` e
  `templatePreamble`), e per questo lo script d'anteprima compila ora in `tsx` invece che in `jsx`.

I diciannove `Layer 1..19` impilati della 2003 non sono disegnati — nella foto il pallet e' vuoto — e
un commento nel codice dice dove stanno e a che passo, per chi domani li vorra'.

Due difetti visti solo guardando le pagine renderizzate, e sistemati: le etichette lunghe uscivano
dalla scheda (`label` non manda mai a capo, ora c'e' `wrapLabel`), e nei comandi con icona **e**
testo l'icona finiva sopra la scritta (ora il testo e' spostato di 44).

**Verificato**: `npx tsc -b` pulito, 384 test verdi, le sette famiglie nuove confrontate una per una
con la loro foto, e nel browser il pannello vivo: dalla 2001 la linguetta "2" porta alla 2002; li'
ci sono trenta elementi `Pack`, sei visibili; `+` su Group ne mostra nove su tre file (top 165/239/313),
`+` su Distance allarga il passo a 84 (165/249/333), `+` su Pos Group li abbassa tutti di 10
(175/259/343). E l'ultimo encoder: la piastrella "Pad Store Back Guide" apre la 2076 e la sua seconda
linguetta la 2077.

### 20. Settings completate come sessioni alternative dello standard reale

Il precedente conteggio trattava `Program Modification` come una sola sessione Robot. Nei JSON
WinCC ci sono invece cinque sessioni alternative, che non possono essere sommate nello stesso
progetto: Robot usa 2001-2010, Classic/Palletizer usa 2021-2030, mentre i file Nemo 2011-2013,
Sweep Off 2021-2022 e Pouches 2031-2033 scrivono di nuovo 2001-2003 negli eventi `Loaded`.

Sono stati aggiunti diciotto template dedicati per tutte le schermate non Robot, con controlli,
tag e azioni presi dai rispettivi JSON. Nel wizard del nuovo pannello, quando Settings e' attiva,
si sceglie Robot, Classic/Palletizer, Nemo, Sweep Off oppure Pouches. Il generatore crea una sola
sessione, collega le linguette alle sue pagine e registra `settingsProgram` in `panel.json` e nel
README. Encoder 2041-2077, Motor Speed 2081, Robot Function 2121, Lubrification 2161, Infeed Guide
2201-2203 e System Function 2241 restano comuni a tutte le scelte. Le CLV 2281-2293 non sono nel
sottomenu Settings e quindi restano fuori dal flusso normale.

Anche `standardScreenCoverage` ora associa una per una tutte le ventotto schermate Program
Modification al template corretto: lo standard non le presenta piu' come semplici varianti del
solo `program-modification`. Un test d'integrazione attraversa il percorso reale
`createStandardProject` dello store e controlla i file consegnati al bridge desktop.

La verifica non si limita ai nomi: un test genera ogni nuovo template, raccoglie tutti gli attributi
`data-plc-variable` e controlla che ciascun tag esista nel JSON della schermata dichiarata. Questo
ha anche eliminato tag inizialmente generalizzati ma non presenti in quella specifica sessione.

**Verificato**: `npx tsc -b` pulito, build Vite completata, 388 test verdi e rendering HTML di
tutti i diciotto template nuovi completato con `scripts/hmi-page-preview.mjs --no-serve`.

### 21. Alarms rifatte sui JSON e inserite nel nuovo pannello standard

Le quattro pagine 3001-3121 non condividono piu' una tabella dimostrativa. La 3001 usa il filtro
`AlarmClassName = 'Alarm_CTH'`, le sette colonne e le misure dell'`HmiAlarmControl` esportato;
quando si seleziona una riga espone `AlarmTextTroubleshooting` e `AlarmID`. Il pulsante di
troubleshooting scrive `Trigger_Open_Troubleshooting` e dichiara il popup
`9003_PDF_Troubleshooting_NodeRed`; il refresh scrive `Start_Copy` e azzera `Done_Copy` e
`ID_Req_HMI`.

La 3041 ha la sua configurazione a sei colonne, con `Alarm class` larga 709 e senza `EM - Name`.
La 3081 legge la sorgente storico con filtro `Alarm_History` e il comando `Clear Alarm Log` porta
il contratto `clear-alarm-log` sul log `Alarm_History_Log`. La 3121 non mostra piu' una finta
bacheca documenti: e' il vero `HmiWebControl` 1199x681 configurato su
`https://10.14.1.228:1880/dashboard/filebrowser`; nel preview resta correttamente una lastra vuota,
perche' il contenuto e' fornito da Node-RED a runtime.

Gli stessi quattro template vengono attraversati da `standardProjectFiles`: scegliendo Alarms nel
wizard **Nuovo pannello standard** nascono `AlarmsPage`, `AlarmsByZonePage`,
`AlarmsHistoryPage` e `MediaManagementPage` con questi contratti, non copie semplificate. Il test
d'integrazione legge direttamente i quattro file generati e controlla filtri, tag, cancellazione
del log e URL del WebControl.

**Verificato**: 388 test verdi, `npx tsc -b` pulito, build Vite completata e confronto nel browser
dei quattro preview 3001/3041/3081/3121 senza errori console. Il test completo va eseguito da solo:
lanciarlo contemporaneamente a TypeScript e build puo' far scattare il timeout di 5 secondi del
test lifecycle, che isolato resta verde (14/14).

### 22. Avvio Vite corretto nei progetti creati fuori dal workspace

Aprendo il pannello generato in `Desktop/Nuova cartella`, il caricatore predefinito della config
Vite risaliva fino al profilo Windows e terminava su `Cannot read directory ../..: Accesso negato`.
Framecraft mostrava soltanto che `vite.cmd` si era chiuso, perche' costruiva il messaggio prima che
i thread di stdout e stderr avessero consegnato le righe dell'errore.

Per Vite 6 e successivi la preview usa ora `--configLoader runner` e importa direttamente la config
originale nel wrapper dell'editor, senza richiamare il bundler con `loadConfigFromFile`. Vite 5 non
riceve l'opzione che non conosce. In caso di arresto, Framecraft aspetta la chiusura dei lettori e
mostra finalmente la causa reale. Il wrapper continua a mettere il plugin Framecraft prima dei
plugin del progetto e conserva alias, `server.fs.allow` e radice dichiarata.

**Verificato**: il comando che prima falliva avvia Vite 7 in circa cinque secondi; 21 test Rust
verdi, compresi i nuovi casi Vite moderno, Vite precedente e composizione della config originale.

Il percorso passato a `--config` attraversa inoltre `path_string`: `canonicalize` su Windows puo'
restituire `\\?\C:\...`, valido per le API native ma interpretato da Vite come un URL contenente
`?`. Il launcher ora rimuove il prefisso verbatim anche dalla config dell'editor; un test usa
esattamente `\\?\C:\Users\m.negrini\Desktop\pippo\.framecraft\vite.editor.config.mjs` per impedire
che questa regressione ritorni.

### 23. Il pannello si controlla da solo, e il primo controllo ha trovato diciotto pulsanti rotti

`src/core/hmiValidation.ts` legge tutto il progetto e dice quattro cose, quelle che nel pannello si
scoprono solo aprendo la pagina giusta al momento sbagliato:

| Cosa | Gravita' | Come lo trova |
| --- | --- | --- |
| Campo senza tag | avviso | `data-plc-variable=""`: lo standard disegna il campo e lascia il tag alla macchina |
| Tag che nessuno ha dichiarato | avviso | il nome non sta nel catalogo `framecraft.plc.json` |
| Dinamica lasciata a meta' | errore | `Tag` senza tag, `Script`/`Expression` senza sorgente, `Range` senza estremi, JSON illeggibile |
| Numero di pagina doppio | errore | due `data-page-number` uguali: il menu si accende in due posti |
| Pulsante che non porta da nessuna parte | errore | `openPage("…")` verso una route che il router non ha |

Le due gravita' non sono un dettaglio. Un pannello appena generato ha **settecentodieci** campi senza
tag: sono gli spazi che lo standard lascia alla macchina, non difetti, e se fossero errori
seppellirebbero i cinque veri. Cosi' invece sono la lista di cosa resta da collegare — l'unico posto
dove qualcuno la vede tutta insieme.

Due cose il controllo si rifiuta di dire: senza catalogo PLC non accusa nessun tag, e senza router
letto non accusa nessuna navigazione. Meglio tacere che dare del rotto a un progetto di cui non si e'
letta la meta'.

Si lancia dalla scheda PLC (`Controlla il pannello`) o dai comandi rapidi, e parte da solo **prima di
ogni esportazione**: gli errori finiscono in diagnostica uno per uno, l'elenco completo nella scheda,
e ogni riga apre il suo file.

**Il primo controllo sul pannello standard ha trovato diciotto pulsanti che non portavano da nessuna
parte**, e non erano un caso: erano quattro famiglie con la destinazione scritta a segnaposto
(`/pagina-destinazione`, `/diagnostica-zona`, `/diagnostica-dettaglio`). I JSON dicevano da un pezzo
cosa devono fare:

- **5001 Manual General**: ogni zona fa `ChangeScreen` verso il manuale della sua stazione. Adesso la
  zona infeed apre la 5041, la centrale la 5081, quella del layer la 5121, l'uscita la 5161, il
  pallet conveyor la 5241.
- **6081 Diagnostic By Zone**: tutte e quattro le zone vanno alla 6121. Adesso ci vanno.
- **6001 Synoptic**: i punti sulla macchina **non cambiano pagina**. Nel riferimento fanno
  `UI.OpenFaceplateInPopup("Tracking_V_0_0_8", ...)`; nel pannello nuovo si aggiungono dopo aver
  scelto lo screen reale, cosi' non eredita M2380 e gli altri motori della macchina campione.
- **6121 Diagnostic By Device**: i punti del riferimento aprono `9002_Popup_Diag_By_Device` accanto
  al punto toccato; nel template nuovo l'utente aggiunge soltanto i dispositivi presenti davvero.

Detto altrimenti: il controllo non e' servito a fare bella figura sul progetto di qualcun altro, e'
servito subito su questo. Adesso il pannello standard esce con zero errori — solo i settecentodieci
campi che aspettano il tag della macchina.

**Verificato**: il doppio click sulla zona infeed della 5001 apre la 5041 e quello sulla zona della
6081 apre la 6121. Per 6001 e 6121 i test controllano ora il contratto dello slot macchina e che non
escano tag o motori della linea campione.

### 24. Le tredici CLV: l'ultima famiglia che si spacciava per un'altra

Il blocco `2281_CLV_User` era l'ultimo pezzo dello standard senza una forma sua. La mappa di
copertura lo faceva finire nel catch-all delle impostazioni: la 2281 diventava l'indice degli
encoder, la 2289 diventava la pagina di sistema, e le altre undici diventavano tutte
`encoder-settings`. Tredici schermate diverse che dall'editor si vedevano come una sola.

Adesso sono tredici template veri, in `src/core/hmiClvSettings.ts`, uno per schermata:

| Schermata | Template | Che cosa e' |
| --- | --- | --- |
| 2281 Main | `clv-index` | dodici piastrelle 4x3 sul fondo scuro, ognuna con il suo `ChangeScreen` |
| 2282 FIFO | `clv-fifo` | il layout della linea con, su ogni nastro, la posizione del pacco davanti e dietro |
| 2283 Layer Centering | `clv-centering` | il disegno dello strato con quattro quote attorno |
| 2284 Spacers | `clv-spacers` | le dieci posizioni dei distanziali e il disegno numerato da 1 a 10 |
| 2285 Doser | `clv-doser` | due colonne simmetriche, sei misure per dosatore |
| 2286 Grip | `clv-grip` | due schede di pinza e il disegno quotato |
| 2287 Extra Function | `clv-extra` | diciassette interruttori, un gruppo di scelte, un menu e due campi |
| 2288 Preforming | `clv-preforming` | sei schede di nastro con sovrapposizione e lunghezza |
| 2289 Languages | `clv-languages` | cinque bandiere, cinque interruttori, cinque pannelli |
| 2290 MMC | `clv-mmc` | due meta' simmetriche, un comando e due spie per lato |
| 2291 PadStore Centering | `clv-padstore` | la stessa forma della 2283 con un altro disegno |
| 2292 Pallet Store Mode | `clv-pallet-store` | la grafica del magazzino con due schede di modo |
| 2293 Lines Names | `clv-lines` | i sei nomi di linea, accesi da quante linee sono attive |

**Di questo blocco non esiste nessuna foto.** E' la prima famiglia ricostruita solo dai JSON, e per
questo il suo `visualStatus` dice `missing` invece di `verified`: chi la sceglie dalla palette legge
che la geometria e' quella vera ma che nessuno l'ha confrontata con un'immagine. Anche i testi non
ci sono: ogni `Text box` dell'export e' un `MultilingualText`, cioe' un rimando al dizionario del
progetto. Le etichette qui sono ricavate dal nome del tag che sta accanto —
`INPUT_Doser_Module_Lenght` diventa "Doser Module Lenght" — che e' meno bello di una frase inventata
e molto piu' onesto.

I tag, quelli, sono veri e **verificati uno per uno**: un test rilegge il JSON di ogni schermata e
pretende di trovarci ogni `data-plc-variable` che il template scrive. E' cosi' che si sono viste due
cose che nell'export sono scritte proprio cosi', e che si riportano com'erano invece di
raddrizzarle: nella 2286 tutte e otto le righe leggono il **primo** robot (la seconda scheda ripete
i tag della prima) e nella 2290 tutti e due i comandi fanno `SetBitInTag` su
`MMC_Write_Read.Read_Start_PB`, anche quello di scrittura.

Tre dettagli che si vedono solo guardando le coordinate: la 2282 e la 2292 **non hanno la barra del
titolo** (le schede stanno direttamente sul layout), la 2293 ha per titolo l'intestazione della sua
scheda, e l'indice 2281 non ha linguette perche' ha le piastrelle — le altre dodici ne portano
tredici a testa, una per ogni sorella, l'indice compreso.

Nel menu Settings queste pagine non ci sono, e non ce le mettiamo: nell'export al blocco si arriva
dal logo `CLV_White` della barra in alto, che e' un pulsante verso la 2281. Restano template che si
aggiungono quando servono, e per questo il pannello standard generato continua a uscire con zero
errori dal controllo.

**Verificato**: `npx tsc -b` pulito, 397 test verdi, e tutte e tredici le pagine guardate una per
una nell'anteprima — l'indice con le sue dodici piastrelle sul nero, le righe dei dosatori allineate
etichetta-campo come nel JSON, i diciassette interruttori della 2287 nelle loro quattro colonne, le
schede del FIFO appoggiate sul layout.

### 25. I cinque popup: le finestre piu' inventate della palette, rifatte sui JSON

Nella palette i cinque popup erano il pezzo meno vero di tutti: cinque finestre tutte uguali,
760x520, sul grigio scuro, con dentro sei pulsanti "Avanti / Indietro / Apri / Chiudi / Reset /
Abilita" che nel pannello non esistono. Le schermate `9000_Various` invece dicono tutto — misura,
oggetti, coordinate, script — e adesso i popup vengono da li'.

| Popup | Misura vera | Che cos'e' |
| --- | --- | --- |
| `hmi-control-popup` | 343x500 | la 9001: il menu della zona, Start/Stop/Reset tondi, il selettore, avanti e indietro |
| `hmi-device-diagnostic-popup` | 670x250 | la 9002: sei righe etichetta-valore e la X in alto a destra |
| `hmi-document-viewer-popup` | 1062x637 | la 9003: un solo web control legato a `PDF_Name` |
| `hmi-manual-popup` | 426x300 | la 9004: il disegno del nastro con le frecce e i due pulsanti di scelta |
| `hmi-alarm-loading-popup` | 1280x800 | la 9010: non un velo, la schermata d'attesa intera |

Le misure non sono piu' una scelta: un test rilegge `Width` e `Height` dal JSON della schermata e
pretende che il componente sia largo esattamente cosi'. Lo stesso test controlla che ogni
`data-plc-variable` scritta dal componente compaia davvero nel JSON, e in piu' che il popup dei
comandi porti tutti e sei i tag del suo script.

Tre cose sono venute fuori guardando gli oggetti invece che le foto:

- **I pulsanti tondi non hanno scritte.** Nella 9001 i `btnWizard*` 82x82 contengono un cerchio e un
  rettangolino disegnati, e la parola sta nel `Text box` sopra. Il primo disegno scriveva la parola
  in tutti e due i posti; adesso il cerchio resta vuoto, con il nome solo nell'`aria-label`.
- **Le frecce della 9004 esistono.** Sono due `Line` e due `Polygon`, e i diciassette punti della
  punta sono ricopiati dal JSON uno per uno: il nastro adesso mostra da che parte gira.
- **La 9010 non e' un velo scuro.** Sotto c'e' un rettangolo con la sfumatura a tre colori, sopra la
  trama `PatternBN` al 40%, il logo al centro (527,373), l'icona con la riga da 30 punti in alto a
  sinistra e un solo pulsante in basso a destra, che rilancia la copia degli allarmi.

Dove l'export tiene i testi nel dizionario multilingua restano segnaposto dichiarati, e la lista
`Panel_Control_Selection` e' esportata vuota, quindi le zone del menu sono quattro voci finte:
meglio un segnaposto che si vede, che una scritta inventata che sembra vera. Anche `SetTagValue` —
quello che usano la 9004 e la 9010 — non e' fra le quattro scritture che l'editor sa fare
(`increase`, `decrease`, `invert`, `set`): il tag si dichiara e un commento dice quale valore ci
andrebbe.

**Verificato**: `npx tsc -b` pulito, 398 test verdi, e i cinque popup guardati uno per uno
nell'anteprima — i cerchi puliti sotto le loro tre parole, la griglia della 9002 con le sue sei
righe, il nastro con le due frecce, la schermata d'attesa intera col pulsante nell'angolo.

### 26. Gli undici pezzi del guscio: misure a occhio sostituite con quelle dell'export

Dopo i popup restava l'altro mucchio di codice inventato: gli undici componenti del guscio, scritti
a mano dentro `registry.ts` con numeri e colori decisi a occhio. La barra laterale era grigia con la
prima voce petrol, il sottomenu era 240x290, le tab del navigatore erano alte 48, e il "punto
informativo" era un cerchio con dentro una **i**. Adesso stanno in `src/core/hmiShells.ts` e vengono
dai JSON dell'export e dalle costanti gia' misurate in `hmiStandard` — le stesse che usa il
generatore, cosi' quello che si trascina dalla palette e quello che esce dal flusso "crea pannello
standard" non possono piu' discordare.

| Componente | Schermata | Misura |
| --- | --- | --- |
| `hmi-layout-choice` | `0001_Choice` | 1280x800 |
| `hmi-desktop-shell` | `0000_Layout_PC` | 1280x800 |
| `hmi-mobile-shell` | `0000_Layout_Mobile` | 1280x800 |
| `hmi-top-bar` | `TopBar` | 1280x151 |
| `hmi-lateral-bar` | `Lateral Bar` | 80x649 |
| `hmi-mobile-top-bar` | `TopBar_Light` | 1280x70 |
| `hmi-mobile-bottom-bar` | `LowBar` | 1280x50 |
| `hmi-info-point` | `Info_Point` | 65x70 |
| `hmi-section-menu` | `2xxxx_Settings_Template` | 1280x800 |
| `hmi-mobile-section-menu` | `2xxxx_Settings_Template_1` | 1280x800 |
| `hmi-mobile-navigator` | `2xxxx_Settings_Template_Navigator` | 1280x64 |

Quattro cose che il codice a occhio aveva sbagliato:

- **Il punto informativo non e' un punto informativo.** L'`Info_Point` e' 65x70 e dentro ha un solo
  pulsante 45x48 che fa `OpenScreenInPopup("PanelControl", "9001_Popup_Control_Panel", ..., 870,
  250)`: e' la linguetta che apre i comandi della zona. Il cerchietto con la **i** non voleva dire
  niente.
- **Il menu di sezione mobile non e' un elenco.** Nel `..._Template_1` le sezioni sono nove quadrati
  80x80 in mezzo allo schermo (451/600/749 per 216/366/511) e accanto si apre lo **stesso** pannello
  210x290 del desktop. Delle due caselle che avanzano, solo l'ultima fa qualcosa: torna alla scelta
  della sessione.
- **La barra laterale ha i colori delle sezioni.** Non e' grigia: ogni tessera 60x60 ha la sua
  sfumatura (Main verde, Settings arancio, Alarms rosso, ...), gia' misurata in `sections`, e quella
  non attiva sta a meta' opacita'. E l'icona non cambia pagina: apre il sottomenu e accende
  `SW_PopUp_Visibility`.
- **Il sottomenu ha un velo.** Prima del pannello c'e' un pulsante trasparente grande quanto lo
  schermo che, toccato, spegne `SW_PopUp_Visibility`: e' cosi' che il menu si chiude.

Una cosa da sapere quando si legge l'export: **i gruppi sono stati appiattiti**. I pezzi che stavano
dentro un gruppo hanno tenuto le coordinate locali, e quindi nel navigatore tutte e nove le tab
risultano a Left 1, una sopra l'altra. Dove succede la posizione e' ricostruita dal passo, e nel
navigatore il conto torna al pixel: 71 del pulsante della casa piu' sette tab da 158 piu' l'ultima
da 103 fanno esattamente 1280. Nella barra in alto, allo stesso modo, le quattro righe del programma
sono rimesse dentro la loro fascia con gli scarti interni (0, 148, 227) e le larghezze (130, 46,
449) che l'export conserva.

I tag sono quelli veri e un test li ricontrolla: rilegge il JSON della schermata e pretende di
trovarci ogni `data-plc-variable` (`@UserName`, `Alarms_History_Message`,
`PV_Config.TopBar_Interface.Machine_Mode`, `Prog_In_Use_L1_Description`, `Actual_Page_Number`,
`SW_PopUp_Visibility`, ...), controlla che la misura sia quella della schermata e che ogni
destinazione scritta sui pulsanti sia una schermata che esiste davvero. Le destinazioni restano in
`data-hmi-change-screen` e non diventano `onClick`: un componente puo' finire in una pagina
qualunque, e la `openPage` la' dentro potrebbe non esserci.

**Verificato**: `npx tsc -b` pulito, 399 test verdi, e gli undici pezzi guardati nell'anteprima —
la barra laterale coi sette colori, la barra in alto con le quattro linee e l'ultimo allarme, il
sottomenu col suo velo, il navigatore che finisce esatto a 1280.

### 27. Gli oggetti sciolti della palette: erano scuri, e le pagine sono chiare

Restava l'ultimo mucchio di codice scritto a occhio dentro `registry.ts`: i ventiquattro pezzi
sciolti della categoria "Standard HMI" — quattordici oggetti WinCC (linea, poligono, cerchio,
ellisse, area touch, faceplate, campo simbolico, widget, contenuto web, griglia, barra, gauge,
scelta, lista allarmi) e dieci pezzi di pagina (cornice, intestazione, riga, riga con interruttore,
lista, lastra destra, linguette, campo, testo, pulsante). Avevano tutti lo stesso difetto, ed era
grosso: erano **scuri**. Il guscio del pannello e' scuro, le pagine no — sono bianche sul grigio.
Chi trascinava "Riga impostazione" dentro una pagina Settings si ritrovava una riga nera in mezzo a
sei righe bianche, e non era un dettaglio di gusto: era il pezzo sbagliato.

Adesso stanno in `src/core/hmiObjects.ts`, disegnati con le stesse funzioni di `hmiPrimitives` che
usano i template, e con le misure contate sulle 160 schermate:

| Oggetto | Misura vera | Dove |
| --- | --- | --- |
| `HmiSymbolicIOField` | 187x45 | 2001 |
| `HmiTouchArea` | 1215x689 | 1002 (89 volte: e' la pagina intera) |
| `HmiLine` | larga 197, alta 0 | 1201 |
| `HmiPolygon` | 203x89 | 2003 (i "Pad") |
| `HmiCustomWidgetContainer` | 151x47 | 2001 (`DynamicSVG_1`) |
| `HmiCircle` | raggio 5 | 2043 (106 volte) |
| `HmiEllipse` | raggi 159 e 45 | 2042 |
| `HmiFaceplateContainer` | 80x80 | 2002 (i trenta pacchi) |
| `HmiWebControl` | 1187x681 | 4041 |
| `HmiBar` | 171x58 | TopBar |
| `HmiGauge` | 130x184 | TopBar_Big |
| `HmiRadioButtonGroup` | 154x69 | 2001 |
| `HmiAlarmControl` | 1197x624 a (16,55) | 3001, 3041, 3081 |

Tre cose che il codice a occhio aveva sbagliato, oltre al colore:

- **Il cerchio dello standard non e' una spia grande.** Nel JSON non ha lati ma un `Radius`, e quel
  raggio e' 5: e' il puntino che segna i riferimenti nei disegni degli encoder. Lo stesso per
  l'ellisse, che ha `RadiusX` 159 e `RadiusY` 45.
- **L'area touch e' un tappeto, non un francobollo.** Nelle 89 volte in cui compare e' 1215x689,
  cioe' tutta la pagina: prende il tocco dove non c'e' nient'altro.
- **`HmiDataGridViewPart` da solo non esiste.** Le uniche griglie dell'export stanno dentro i tre
  controlli allarmi, e ognuno ne ha due: quella degli allarmi (sei colonne accese: 45, 50, 600, 85,
  160, 200) e quella delle statistiche (otto: 40, 120, 100, 130, 160, 160, 200, 100, che sommate
  fanno 1010). La "Tabella HMI" con tre colonne inventate non era una semplificazione, era un
  oggetto che nello standard non c'e'. Al suo posto ora c'e' la griglia delle statistiche, con le
  sue colonne vere.

Una trappola trovata rimettendo a posto le righe: `settingsRow.field.left` (348) e
`settingsRow.toggle.left` (297) sono misurati **sulla pagina**, dove la riga comincia a x=20. Dentro
la riga vanno riportati all'origine, se no il campo esce dal bianco di venti pixel — e nell'anteprima
si vedeva.

Il test rilegge il JSON della schermata dichiarata e pretende che un oggetto di quel tipo con quella
misura ci sia davvero (per cerchio ed ellisse confronta i raggi, per la linea l'altezza zero), e un
secondo test ricava dal controllo allarmi le colonne accese e le confronta con quelle che finiscono
nelle due griglie. Il test che pretendeva il grigio scuro `#48494E` nella riga di impostazione e'
stato girato: adesso pretende il bianco e vieta il grigio del guscio.

**Verificato**: `npx tsc -b` pulito, 401 test verdi, e i ventiquattro pezzi guardati uno per uno
nell'anteprima — la riga bianca col campo dentro il bordo, il gauge con l'arco, la griglia con le
otto colonne, le linguette che cadono gia' all'estremo destro della pagina.

### 28. Statistics 4001/4041/4081: i tre WebControl veri entrano nella pipeline

Le tre pagine Statistics non usano piu' il generico pannello bianco. Ora hanno tre template
distinti, selezionabili anche dal sottomenu e prodotti dal flusso "crea pannello standard":

- `statistics` riproduce la 4001: lastra grigia, immagine macchina a (41,143), operatore, le due
  ombre ellittiche e i due `HmiWebControl`. Gli URL sono quelli esportati (`/dashboard/statisticbase`
  e `/ui/#!/1?...`) e la dynamization dell'immagine conserva `Alarms_Trigger[65]`.
- `statistics-production` riproduce la 4041 con il `HmiWebControl` 1187x681 a (21,8), collegato a
  `/dashboard/pageN`.
- `statistics-availability` riproduce la 4081 con la stessa geometria e l'URL originale
  `/dashboard/Availabilty`, compresa la grafia dell'impianto.

I contenuti remoti non vengono sostituiti da grafici o valori dimostrativi: nel sorgente generato
restano superfici trasparenti con `data-hmi-type="HmiWebControl"` e `data-hmi-url`, quindi il runtime
conosce il collegamento mentre l'anteprima offline resta vuota come le foto. Le aree touch
conservano anche le destinazioni swipe dell'export (4001 -> 4041 -> 4081 e ritorno), mentre il menu
mobile continua a offrire le tre rotte esplicite.

La copertura JSON associa ora esattamente 4001, 4041 e 4081 ai tre template e i test della pipeline
controllano file generati, URL, misure, tag e destinazioni. Il confronto browser conferma la 4001
con macchina/operatore e le altre due lastre vuote, senza errori console.

**Verificato**: 34 file di test e 403 test verdi; `npm run build` completata. Vite segnala soltanto
gli avvisi gia' noti sugli import misti e sul chunk principale.

### 29. I template condivisi di Framecraft: erano cinque pagine con cinque tavolozze

I template in `templateHmi/templates/` sono quelli che il pannello `can-line-operator` monta davvero,
e sono nati prima che le pagine dello standard fossero misurate. Si vedeva: `settings-page` era
scuro come il guscio, e gli altri quattro erano Arial su fondo nero, con misure a `clamp()` e `vw` e
colori scelti a occhio (`#eceff1`, `#46cfff`, `#4caf50`, `#e53935`). Una pagina HMI pero' non e'
responsive: e' 1280x694, sempre, e la tavolozza e' una sola.

Tutti e cinque adesso stanno sulla stessa griglia, e nessuna proprieta' e' cambiata: il pannello
continua a montarli con le stesse props di prima.

- **`settings-page`** ripitturato sulla tavolozza chiara: righe bianche, 3 px di grigio in mezzo,
  scheda aperta arancione `#FA6400` come vuole la sezione Settings.
- **`alarm-list`** rifatto su `3001_Alarms` e `3081_Alarms_History`: barra del titolo 1195x37 a
  (18,18) col titolo da 32, controllo 1197x624 a (16,55), intestazione 30 e righe 28, ventuno righe.
  Le sette colonne sono 57/45/50/600/85/160/200 — le sei del JSON piu' quella dei numeri di riga,
  che e' l'intestazione di riga del controllo. Il reticolo e' **solo verticale**: fra una riga e
  l'altra non c'e' una linea, c'e' il grigio alternato. In `alarms` compaiono "Troubleshooting:" a
  (1038,25) e il bottone lampadina 49x38 a (1164,18); in `history` al loro posto c'e' il comando
  largo 168x35 a (1043,19), come nella 3081.
- **`special-functions`** rifatto su `1081_Special`: righe 403x75 a (20,60) con passo 78, campo a
  348, interruttore 101x50 a 297, comando 225x48 centrato, lastra destra 784x618 a (428,60) col
  disegno 784x436 a (428,135). Le zone accese sono `#00E832`, il verde `selection` dello standard.
- **`machine-counters`** e **`consumption`** non hanno una schermata da copiare: nell'export
  `1041_Counters` e `1121_Collector_Counters` sono vuote e una pagina dei consumi non c'e'. Stanno
  quindi sulla grammatica generale della pagina a due colonne, misurata su
  `2285_CLV_User_Doser_Config`: intestazione 1188x37 a (20,19) col titolo da 34, colonne larghe 590
  a 20 e a 618, testata 37 e corpo 577 staccato di 3 px, righe con campo 88x33 a 263 e passo 59.

Due cose che sembravano dettagli e non lo erano:

- **La cornice 1214x681 non e' bianca, e' grigia.** Nella foto della 1041, che e' vuota, si vede
  benissimo: la cornice e' la pagina stessa, arrotondata, e il bianco sono le lastre appoggiate
  sopra. I template la disegnavano bianca e poi non si capiva dove finisse una scheda.
- **Le linguette a destra stanno a 1208 e sono larghe 63, ma se ne vede solo il moncone.** Nel JSON
  i bottoni vengono prima del rettangolo della cornice, quindi la cornice ci passa sopra e ne
  scopre solo la parte da 1223 a 1271. In `alarm-list` questo e' riprodotto per davvero: le
  linguette stanno sotto, la cornice opaca sopra, e il taglio viene da solo.

Un solo scostamento dichiarato: le dodici cause di scarto di `machine-counters` col passo 59 non
entrerebbero nel corpo alto 577, quindi il passo si stringe quel tanto che basta. Meglio stringere
che nascondere — una causa che non si vede e' un conteggio che nessuno controlla.

Le misure nuove sono finite in `_standard/hmiStandard.js` e nel suo gemello `src/core/hmiStandard.ts`
come `alarmControl`, `alarmTags` e `twoColumnPage`, cosi' l'editor le conosce quanto i template.
Tre test nuovi le rileggono dal JSON esportato invece di fidarsi del codice: il controllo allarmi
con le sue colonne, la barra del titolo con i due comandi (compreso quello dello storico), e le due
colonne della 2285 coi sei campi a passo 59.

**Verificato**: `npx tsc --noEmit` pulito, 403 test verdi piu' i tre nuovi (17 in
`hmi-standard.test.ts`), e i cinque template resi in SSR e misurati nel browser: cornice (9,8)
1214x681, intestazioni a 18 e a 19, colonne a 20 e 618, campi a 283 e 348, righe a passo 78 e 58 —
tutte uguali al JSON, al pixel.

### 30. Manuals 5001-5241: sei stazioni vere al posto di un solo template finto

Le sei pagine di stazione usavano tutte `manual-station`: stessa immagine generica, quattro
comandi M2010/M2020/M2030/M2040 inventati e nessuna differenza fra Infeed, Lifter o Pallet
Conveyors. Il menu aveva le rotte giuste, ma il contenuto generato non era quello delle schermate.

Ora `src/core/hmiManuals.ts` contiene sette template distinti, tutti inseriti nel flusso "crea
pannello standard": `machine-map`, `manual-infeed`, `manual-preforming`,
`manual-layer-pusher`, `manual-lifter`, `manual-tie-sheet` e `manual-pallet-conveyor`.

Dal JSON di ogni schermata vengono mantenuti nome e geometria della `HmiGraphicView`, ellisse di
appoggio e swipe esatti fra 5001, 5041, 5081, 5121, 5161, 5201 e 5241. I richiami, i motori, le
valvole, le schede posizione e i popup dell'impianto di riferimento non vengono piu' messi in un
pannello nuovo: dipendono dalla macchina che l'utente sta costruendo.

Ogni stazione nasce quindi con uno slot riconoscibile per lo screen della parte macchina. Il
pannello Pagine spiega subito i due passi successivi e la palette Standard HMI offre `Targhetta
motore` 148x52 e `Linea richiamo` 156x55, misurate sulla 2081. La targhetta parte neutra come
`M0000`, senza azione e senza tag PLC: nome, comando, popup e variabile si compilano nell'Inspector.

La 5001 conserva la `Manual_TopView` 1132x658, `Alarms_Trigger[65]`, le sei aree rettangolari, il
poligono del Pallet Conveyor e tutti e sette i pulsanti informativi: questa e' una mappa strutturale
dello standard, non la targhettatura di un dettaglio macchina.

Un test dedicato rilegge i sette JSON e confronta con il JSX generato grafica, coordinate, ellissi e
destinazioni degli swipe; controlla inoltre che nessun Mxxxx/YVxx campione finisca nelle sei basi. L'alias storico
`manual-station` resta accettato dai progetti salvati, ma viene risolto sulla 5041 e non compare piu'
fra i template selezionabili.

**Verificato**: 35 file di test e 415 test verdi; `npm run build` completata. Generate le sette
anteprime SSR e aperta la 5041 nel pannello browser; in questa sessione il controllo automatico
della webview non era disponibile, quindi non viene dichiarato un nuovo confronto screenshot.

### 31. Diagnostic 6001-6241: sette basi collegate alla pipeline

La sezione Diagnostic non usa piu' tre sagome generiche e quattro `data-board`. Il nuovo
`src/core/hmiDiagnostics.ts` contiene sette template distinti e il menu del nuovo pannello standard
li assegna direttamente alle pagine 6001, 6041, 6081, 6121, 6161, 6201 e 6241.

- **6001 Synoptic**: grafica `Synoptic` a (316,118) 643x513 e due ellissi. I cinque trasportatori
  M2400, M2390, M2380, M2020 e M2890 appartengono alla macchina di riferimento e non sono inseriti
  in una base nuova; l'utente aggiunge le proprie targhette, i tag Tracking e il faceplate.
- **6081 Diagnostic By Zone**: grafica `Main_1` a (60,64) 1102x534 col tag
  `Alarms_Trigger[65]`; tre poligoni con i punti dell'export, visibilita' su
  `Alarms_EM[1|3|9].NumEvents`, lampeggio `Clock_1Hz` e tre pulsanti Info verso la 6121.
- **6121 Diagnostic By Device**: grafica `Motor_Speed` ed ellisse alle coordinate dell'export. Le
  sette linee e i sette dispositivi della macchina campione non sono precompilati: si aggiungono
  dopo lo screen reale e si collegano ai propri `Diagnostic_By_Device_DB_O_Data[n]` e al popup
  `9002_Popup_Diag_By_Device`.
- **6041, 6161, 6201 e 6241**: restano intenzionalmente grigie e vuote, come foto e JSON. Hanno
  template separati per non perdere numero, foto e swipe. La 6201 conserva il solo swipe attivo
  verso 6161 (quello verso 5081 e' commentato nell'export); la 6241 conserva invece gli strani
  collegamenti attivi verso 5001/5081 e la linguetta arancione visibile nella foto 0109.

Il test `hmi-diagnostics.test.ts` rilegge direttamente i sette JSON e confronta grafica, geometrie,
punti dei poligoni e destinazioni col JSX prodotto; sulle pagine macchina verifica anche l'assenza
dei dispositivi campione. Un test della pipeline genera
la sola sezione Diagnostic e controlla che escano tutte e sette le pagine con la loro base reale.

**Verificato**: 36 file di test e 423 test verdi; `npm run build` completata. Generate le sette
anteprime SSR; il browser laterale e' stato aperto sul sinottico, ma in questa sessione non era
disponibile il controllo automatico della webview, quindi non viene dichiarato un confronto
screenshot automatizzato.

### 32. I quattro sottomenu di navigazione: erano quattro copie della stessa cosa

In `templateHmi/templates/operator-shell/linked/` c'erano sei template. Due — `section-menu-popup` e
`section-navigator` — erano gia' sullo standard. Gli altri quattro — `main-menu-popup`,
`alarms-menu-popup`, `manuals-menu-popup`, `diagnostic-menu-popup` — erano quattro copie fatte a
mano dello stesso pannello, ognuna col suo grigio (`#d7d7d7`, `#cccccc`, `#cfcfcf`), il suo azzurro
(`#007ca8`) e le sue misure (larghezza 262, 264, 274, 210; voci alte 51, 55, 44, 44). Nessuna delle
quattro importava `_standard/hmiStandard.js`, e nessuna delle quattro era piu' montata da nessuno:
il guscio disegna tutti e sette i sottomenu con `SectionMenuPopupTemplate`, e del quartetto
restavano vive solo le quattro liste in `templateData.js`, che il pannello importa.

Le misure vere stavano nell'export e nessuno le aveva lette: `standard/screens/Template Desktop`
contiene le sette schermate `Nxxxx_<Sezione>_Template`, che sono la **stessa** schermata spostata
piu' in basso.

- pannello 210x290 a x=131, angoli da 10;
- prima voce a +8, voci 158x34 con passo 40 (nell'export slitta di un pixel ogni tre: 40, 40, 41);
- un filo 200x2 sotto ogni voce tranne l'ultima;
- l'icona della voce **non sta dentro** il pulsante: e' un `Graphic view` ~24x20 a 15 px dal bordo
  del pannello, mentre il pulsante comincia a 58. Il testo parte dal bordo del pulsante;
- triangolino `Polygon` 30x43 a x=102, che punta all'icona della sezione;
- un `HmiButton` trasparente **1280x800** sotto tutto: e' il velo. Il suo script fa
  `ResetBitInTag("SW_PopUp_Visibility", 0)`, cioe' si chiude cliccando fuori. Ogni voce fa lo stesso
  reset piu' `ChangeScreen("<schermata>", "../SW_Screen")`.

I colori non stanno nel JSON, perche' vengono dalla classe di stile. Stanno pero' nelle foto, e le
tre foto dei sottomenu (`0001_Menu_1xxxx_Main_Template`, `0085_Menu_3xxxx_Alarms_Template`,
`0102_Menu_6xxxx_Diagnostic_Template`) danno gli stessi tre valori con un lettore di pixel: pannello
**#C8C8C8**, filo **#C0C0C0**, scritta **#323232**. Non bianco, che e' quello che diceva la nota
scritta a occhio, e non `#d7d7d7`. Con il pannello aperto il bianco della pagina sotto scende a ~100:
un velo nero al **61 %**. La barra in alto e le tessere laterali, invece, restano accese: nell'export
sono disegnate **dopo** il velo, e nelle foto non si scuriscono.

La prova era anche in casa: i quattro `reference/*.png` dei sottomenu sono ritagli di quelle stesse
foto, e danno gli stessi `(200,200,200)` e `(192,192,192)`. I quattro template avevano il colore
giusto nella loro cartella e ne usavano un altro nel loro CSS.

Cosa e' cambiato:

- `submenuPanel` nei due gemelli (`templateHmi/templates/_standard/hmiStandard.js` e
  `src/core/hmiStandard.ts`) ha adesso anche `entry.first`, `iconLead`, `pointerLead`,
  `pointerOffset`, `topMargin`, `bottomMargin` e `backdrop`; accanto c'e' `submenuPalette` coi tre
  colori e il velo. `hmiSectionMenu.ts` usa le costanti invece dei numeri scritti a mano.
- `submenuPlacement` esiste adesso anche dal lato template, con la stessa regola del lato editor: il
  pannello sta 38 sopra l'icona, non sale sopra la pagina e non esce dal fondo. Main e Diagnostic
  tornano al pixel (160 e 500); gli altri restano vicini, perche' nelle schermate del sottomenu la
  fila di icone e' ridisegnata 5 px piu' in basso e quattro pannelli su sette sono stati piazzati a
  mano in TIA.
- `section-menu-popup` e' stato ridisegnato con quelle misure e quei colori: voci e fili in
  posizione assoluta invece che a `flex` con margini, icona fuori dal pulsante, e il velo, che c'e'
  quando gli si passa `onDismiss`. Il guscio adesso glielo passa, cosi' il sottomenu si chiude
  cliccando fuori come nello standard; `.top-bar` e `.side-bar` salgono sopra il velo.
- i quattro sottomenu sono diventati quattro involucri di quattro righe: dicono a quale sezione
  appartengono e passano tutto a `section-menu-popup`. Le props sono le stesse di prima — `id`,
  `items`, `open`, `anchorY`, `onSelect` — con in piu' `onDismiss`; `templateData.js` non e' stato
  toccato, quindi `can-line-operator` continua a montarli con le stesse liste.
- il progetto generato dall'editor (`standardProject.ts`) e la sorgente del guscio
  (`hmiShells.ts`) disegnavano il pannello **bianco** su fondo scuro col velo al 35 %: adesso
  usano `submenuPalette`.
- `templates/index.json` era rimasto indietro sulle versioni di sei template su undici: risincronizzato
  dai `template.json`.

Una cosa che sembrava un errore e non lo e': la schermata dei Manuals ha **otto** pulsanti invece di
sette e il pannello alto 336 invece di 290. L'ottavo (`btn_Topic_0010_Button_16`) e' stato aggiunto
dopo, in cima, ed e' l'ultimo elemento della lista; l'ultima voce in basso e' vuota. Le voci vere
restano sette, come in tutte le altre sezioni.

**Verificato**: `npx tsc --noEmit` pulito, 36 file di test e 428 test verdi (due nuovi rileggono i
sette `Template Desktop` e confrontano pannello, voci, passo, triangolino e fili con `submenuPanel`,
piu' il posizionamento). I quattro sottomenu resi via SSR e misurati nel browser: pannello
(131,160,210,290), triangolino (102,162,30,43), voci a 189 con tops 168/208/248/288/328/368/408,
fili (132,202,200,2) e seguenti, icone a 146, colori `rgb(200,200,200)`, `rgb(192,192,192)`,
`rgb(50,50,50)`, velo `rgba(0,0,0,.61)` su 1280x800. Il pannello `can-line-operator` continua a
compilarsi e a rendersi senza toccarne un file.

### 33. La navigazione mobile: la striscia di tab e i nove quadrati

Il layout mobile dello standard (`0000_Layout_Mobile`) non ha la barra laterale. Al suo posto ci sono
due cose, e nessuna delle due era sullo standard: il **navigatore** in alto
(`Nxxxx_<Sezione>_Template_Navigator`), che e' la lista del sottomenu diventata tab, e il **menu
delle sezioni** (`Nxxxx_<Sezione>_Template_1`), che e' come si cambia sezione.

**Il navigatore.** Nell'export le sette tab di quella schermata sono tutte disegnate sopra la stessa
posizione (Left 1, Top 0): la schermata e' rimasta a meta', e a occhio non si capisce dove vadano.
Lo dice pero' la sezione Settings, l'unica con otto voci: le sue tab sono sette da 158 piu' una da
103, e `71 + 7*158 + 103` fa esattamente 1280. Quindi le tab partono a 71 — subito dopo il
distintivo, che e' largo 71 — e valgono 158 l'una; l'ultima si prende quello che resta.

- la striscia e' 1280x64, con lo sfondo a grafica `PatternBN`;
- il distintivo e' un `HmiButton` 71x60 a (-6, 3) — sborda a sinistra — con dentro l'icona 46x42
  della sezione, e riporta a `Main_Mobile`, cioe' alla scelta della sezione. Non c'era proprio,
  anche se sta in tutte e sette le schermate;
- la barretta della tab attiva non sta **sotto** la tab: sta sugli **ultimi 5 px** della tab
  (Top 38 di 43), e larga 158 sborda di un pixel per lato. Prima era una riga sotto il bordo.

**Il menu delle sezioni.** Nove quadrati 80x80 in mezzo allo schermo, tre per riga: colonne a
451/600/749, righe a 216/366/511, identiche in tutte e sette le schermate. I nove sono le sette
sezioni piu' l'utente e il cambio layout (`User_White`, `Layout`, che nell'export porta a
`0001_Choice`). Quello che c'era prima era una striscia inventata a sette colonne che scendeva dalla
TopBar.

Il pannello che si apre toccando un quadrato e' **lo stesso** del sottomenu desktop — 210x290, voci a
+58, stessi colori — e cambia solo dove si mette: 40 px di fianco al quadrato, a sinistra se il
quadrato sta nella prima colonna (altrimenti coprirebbe la griglia) e a destra negli altri due casi,
col triangolino girato dalla parte del quadrato. Il triangolino sta 17 px sotto il bordo alto del
quadrato.

Cosa e' cambiato:

- `mobileNavigator` e il nuovo `mobileSectionMenu` stanno nei due gemelli
  (`templateHmi/templates/_standard/hmiStandard.js` e `src/core/hmiStandard.ts`), con
  `submenuPlacementNear` a dire dove si apre il pannello — lato template in `hmiStandard.js`, lato
  editor in `hmiSectionMenu.ts`, stessa regola;
- `section-navigator` e' stato riscritto su quelle costanti (distintivo, tab, barretta) e prende
  `sectionId` e `onHome`;
- `section-menu-popup` accetta `anchor` e `anchorSide`: con `anchor` si apre di fianco a un quadrato
  invece che all'icona della barra laterale, e il triangolino si gira (`.points-right`);
- il guscio disegna il menu mobile vero, con il velo al 61 % e la barra in alto e il navigatore che
  restano accesi sopra il velo, come nel desktop. Due props nuove e facoltative — `onUserClick` e
  `onLayoutChange` — per i due quadrati che non sono sezioni: senza, i quadrati ci sono lo stesso,
  perche' ci sono nell'export;
- lato editor, `hmiShells.ts` genera il guscio `hmi-mobile-section-menu` con le stesse costanti e la
  stessa funzione invece dei numeri scritti a mano, e `submenuAt` sa disegnare il triangolino da
  tutte e due le parti.

**Verificato**: `npx tsc --noEmit` pulito, 36 file di test e 430 test verdi (due nuovi: i nove
quadrati riletti dalle sette schermate `Template Mobile`, e `submenuPlacementNear` confrontato con
pannello e triangolino misurati). Nel browser, guscio vivo in mobile: i nove quadrati cadono su
451/600/749 x 216/366/511 al pixel; il pannello di ogni sezione a (201|720|869, 191|341|486) con le
voci a +58 e passo 40, fili 200x2, `rgb(200,200,200)`, velo `rgba(0,0,0,.61)`, triangolo girato a
destra per la prima colonna e a sinistra per le altre; barra in alto (0,0,1280,52) e navigatore
(0,47,1280,64) sopra il velo. Il confronto con l'export: il triangolino cade entro quattro pixel in
tutte e sette le schermate, il pannello in cinque su sette — in Diagnostic e Formats e' stato tirato
su a mano in TIA lasciando il triangolino sul quadrato.

### 34. La simulazione degli stati PLC: scrivere un valore e guardare la pagina

Nello standard un oggetto non si anima da solo: ha una `Dynamization` che lega una sua proprieta' a
un tag, e in mezzo c'e' un `ValueConverter` con una tabella — «da 0 a 9 rosso, da 10 a 99 verde».
L'editor sapeva **scrivere** quelle dinamizzazioni (le mostra l'ispettore) ma non sapeva leggerle:
sul canvas restava tutto fermo, e per vedere se una soglia era giusta bisognava collegare un PLC.

Adesso si accende la simulazione dal pannello Variabili PLC, si scrive un valore di prova e la
pagina si anima. Il giro e' in tre passaggi, e ognuno sta dove sa fare il suo mestiere:

1. l'anteprima elenca gli oggetti che portano addosso `data-hmi-dynamizations` — e' l'unica a vedere
   la pagina resa;
2. l'editor legge le dinamizzazioni e calcola cosa diventa ognuna, con le regole dello standard
   (`src/core/plcSimulation.ts`);
3. l'anteprima mette addosso agli oggetti quello che l'editor ha detto, tenendosi da parte com'erano
   prima.

Quel «tenendosi da parte com'erano prima» e' la parte che conta: sul canvas c'e' il progetto vero, e
una simulazione che lascia tracce lo falsifica. Spegnendola — o anche solo cancellando un valore di
prova — l'oggetto torna com'era, stile e testo.

Cosa si risolve e cosa no, detto invece che finto:

- `conditionType: "None"` prende il valore del tag cosi' com'e'. E' il caso delle pagine che genera
  l'editor: i trenta pacchi di `ProgramLayerPage` hanno `Left`, `Top`, `Width` e `Height` legati ai
  loro tag, centoventi in tutto, e si muovono davvero;
- `Range` e `Singlebit` si risolvono **se** la tabella ha delle righe. Nell'export non ne ha
  nessuna: le 1068 soglie stanno in `fill.cmd` e si leggono solo con TIA aperto. Chi le scrive
  nell'ispettore le vede funzionare; chi non le ha legge il motivo invece di un colore inventato;
- `Script` ed `Expression` sono codice, non tabelle: non si risolvono e lo dicono;
- `Graphic`, `Url`, `IsSelected`, `AngleRange` e `AlternateBackColor` si risolvono ma non si vedono
  sul canvas — la grafica sarebbe un'immagine TIA, e le 225 non sono state esportate. Anche questi
  finiscono nella lista dei motivi, sotto i valori.

Il testo si tocca solo dove dentro non c'e' altro che testo: sostituirlo dove ci sono figli vorrebbe
dire cancellarli.

Con la simulazione accesa la pagina cambia sotto i piedi a ogni salvataggio, perche' l'HMR la rimette
in piedi senza ricaricarla e quindi nessuno dice «pronto». Il ponte se ne accorge da solo: guarda le
modifiche al DOM e, se la lista degli oggetti dinamizzati e' diventata un'altra, la rimanda. Il
confronto e' sulla lista, non sul fatto che qualcosa sia cambiato — altrimenti gli stili che mette la
simulazione stessa la farebbero ripartire, e editor e anteprima si rimbalzerebbero all'infinito.

**Verificato**: `npx tsc --noEmit` pulito, 38 file di test e 442 test verdi. Dodici nuovi: otto sul
calcolo (`Range` con gli estremi aperti, `Singlebit` letto come numero di bit, opacita' in
percentuale, colori ARGB, i motivi scritti al posto delle risposte inventate) e quattro sul ponte,
che girano il ciclo intero sul bridge vero in jsdom — raccolta, animazione, ritorno esatto allo stato
di prima, testo lasciato stare dove ci sono figli, e la pagina cambiata che si fa risentire mentre
gli stili della simulazione no.

### 35. Screen macchina guidati e Formats 7001-7081 operativi

Le pagine che dipendono dalla macchina non nascono piu' con le targhette della linea usata come
riferimento. `motor-speed`, `synoptic`, `device-diagnostic` e le sei stazioni Manuals conservano la
geometria dello standard ma espongono uno slot `machine-part-screen`: prima si sostituisce lo screen,
poi si trascinano `Targhetta motore` e `Linea richiamo` dalla palette. Il pannello Pagine mostra
l'istruzione subito sotto la base selezionata. La targhetta e' il vero pulsante 148x52 della 2081,
ma parte da `M0000`, azione vuota e variabile PLC vuota.

Il blocco successivo, Formats, e' stato riallineato ai cinque JSON Normal/Robot:

- **7001**: tredici righe 579x40 a passo 41, selezione tramite `Program_Selection_Session`, offset
  su `Program_List_Pointers`, scelta linea su `Line Selection`, caricamento su
  `Confirm_Change_Pressed`, stati Done/Error e wizard limitato 0..87;
- **7041**: origine `Program_Copy_Source`, destinazione `Program_Copy_Destination`, descrizioni
  dinamiche, impulso `Program_Copy_Start_Copy`, stato in corso e risultati
  `Program_Copy_Succesfully`/`Program_Copy_Error`;
- **7081**: grafica `Pallet_Store_Type`, ellisse, i due poligoni coi punti dell'export e i select
  `Pallet_Type_Store_N1`/`Pallet_Type_Store_N2` legati alla resource list `Pallet Type`.

Tutte e tre sono gia' nella pipeline "Nuovo pannello standard" e mantengono gli swipe
7001 -> 7041 -> 7081. `hmi-formats.test.ts` rilegge i JSON reali e confronta geometrie, tag, azioni e
destinazioni; un test separato genera la sola sezione Formats e controlla i tre file finali.

**Verificato**: 39 file di test e 446 test verdi; `npm run build` completata. Le anteprime SSR di
Motor Speed, Sinottico, Diagnostic Device, sei stazioni manuali e tre pagine Formats sono state
rigenerate. Nel browser il Sinottico mostra soltanto screen e geometria di base, senza Mxxxx; 7001
mostra tredici formati e i due wizard, 7041 origine/destinazione e stato copia, 7081 i due select e
i poligoni sulla grafica pallet.

### 36. Main vuote: niente dashboard inventate

La pipeline Main trattava ancora `1002_Downstair` come una seconda copia della vista macchina e
riempiva `1041_Counters`, `1121_Collector_Counters`, `1161_` e `1241_Maintenace` con la lastra
bianca generica `data-board`. I cinque JSON e le cinque foto mostrano invece una pagina grigia vuota:
l'unico oggetto di contenuto e' la `HmiTouchArea` 1215x689 a (8,8).

Ora ognuna ha un template dedicato — `machine-downstair`, `main-counters`,
`main-collector-counters`, `main-free` e `main-maintenance` — collegato direttamente al proprio
numero nella procedura "Nuovo pannello standard". Restano attivi soltanto gli swipe reali: Downstair
torna a Upstair verso il basso; Counters collega Upstair e Special; Collector collega Special e
PackML; Free collega Counters e PackML; Maintenance torna a PackML. L'immagine globale della
macchina non viene piu' copiata nella 1002.

**Verificato**: 40 file di test e 453 test verdi; `npm run build` completata. Le cinque anteprime SSR
sono state rigenerate e contengono la `HmiTouchArea`, senza `HmiGraphicView` e senza lastra bianca.

### 37. Infeed Guide 2201-2203 e System Function 2241

Le quattro pagine finali della sezione Settings non usano piu' basi generiche. La pipeline "Nuovo
pannello standard" genera ora quattro template distinti direttamente dai JSON WinCC:

- **2201 Guide**: selettore home/indietro/avanti, switch `MMC_Guide.InUse`, cinque stati, target,
  codice allarme e quattordici hotspot collegati a `MMC_HMI_Selection_Guide_Motor`; le due grafiche
  `Guide` sono screen configurabili e dichiarano chiaramente i motori 1-7 e 8-14;
- **2202 Motor Box**: scelta porta seriale, navigazione del box, tre stati e otto connettori con la
  disposizione reale 7-5-3-1 / 8-6-4-2; la grafica `Ciabatta Infeed Guide` resta sostituibile;
- **2203 Motor**: screen motore configurabile, otto stati reali, Stop/Reset dinamici e i sei campi
  Guide, Offset, Mode, Target e limiti di corrente avanti/indietro con i tag dell'export;
- **2241 System Function**: cinque lingue con i codici runtime reali, arresto runtime, cambio layout,
  Control Panel, logoff e import/export utenti con percorsi e autorizzazioni del JSON.

Le immagini specifiche della macchina non vengono fissate nel template: la geometria e gli hotspot
restano quelli dello standard, mentre l'utente sostituisce lo screen con quello della propria parte
macchina. Gli swipe mobile e le tre linguette della famiglia 2201-2203 sono conservati.

**Verificato**: 42 file di test e 467 test verdi in esecuzione seriale; `npm run build` e TypeScript
completati. Le quattro anteprime SSR sono state rigenerate e controllate nel browser integrato
contro le foto 0081-0084: layout, controlli, testi e aree configurabili risultano visibili.

### 38. Robot Function 2121 e Lubrification 2161

Le due pagine che precedono l'Infeed Guide non usano piu' le composizioni generiche:

- **2121 Robot Function** mantiene le due sezioni Robot 1/Robot 2, i quattro pulsanti 307x82 e le
  grafiche `Home_SVG`/`Graphic_36`. L'export non assegna eventi o tag a questi pulsanti: il template
  li lascia quindi vuoti e li marca come comandi da configurare, invece di inventare variabili PLC.
  Lo screen robot e' sostituibile e riporta le quattro grafiche realmente presenti nel JSON:
  `Fanuc`, `Manipolatore`, `Kuka`, `IRB_5720_9`;
- **2161 Lubrification** mantiene i sette campi coi tag `DB_Lubrication_*`, le geometrie reali e il
  pulsante Test Lubrication. Quest'ultimo riproduce il comportamento momentaneo dell'export:
  `SetBitInTag` alla pressione e `ResetBitInTag` al rilascio. La grafica `Pump_1` resta uno screen
  configurabile per il gruppo realmente montato sulla macchina.

Entrambe sono gia' nella pipeline "Nuovo pannello standard" e conservano gli swipe 2081 -> 2121 ->
2161 -> 2201. Le anteprime SSR sono state confrontate nel browser con le foto 0079 e 0080.

**Verificato**: 43 file di test e 473 test verdi; TypeScript e `npm run build` completati. I test di
creazione completa del pannello hanno un timeout piu' ampio perche' la pipeline genera ormai tutte
le pagine reali, ma continuano a verificare i file finali e la sessione Settings selezionata.

### 39. Motor Speed 2081 e Special Function 1081 neutrali rispetto alla macchina

Le due pagine che nelle foto mostrano esempi della linea reale sono ora basi riutilizzabili senza
perdere la geometria dello standard:

- **2081 Motor Speed** mantiene la barra 1189x37, la lastra 1189x617, l'ellisse, lo screen
  `Motor_Speed` a (421,131) 559x447 e gli swipe verso 2041 e 2121. Non copia le sei linee, i motori
  `M2380`, `M2410`, `M2400`, `M2390`, `M2020`, `M2890` o il faceplate
  `Setting Motor_V_0_0_12`: lo screen e' uno slot sostituibile e indica di aggiungere dalla palette
  targhette motore e linee di richiamo;
- **1081 Special Function** mantiene le sette righe a x=20, passo 78, la lastra destra 784x618, lo
  screen `PBP1 - Main` a (428,135) 784x436 e gli swipe verso 1041 e 1121. Le righe sono sette slot
  configurabili; `AAAAAAA`, `M3031`, il tag dimostrativo `Bool` e i due poligoni verdi non vengono
  copiati dalla macchina campione.

Entrambe sono generate dalla pipeline "Nuovo pannello standard". Il nuovo test
`hmi-machine-configuration.test.ts` rilegge i due JSON WinCC e confronta geometrie, grafiche e
destinazioni degli swipe, oltre a impedire il ritorno dei contenuti specifici del campione. Gli slot
usano una guida testuale e un pittogramma SVG, senza icone emoji o stili estranei alla tavolozza HMI.

**Verificato**: 44 file di test e 479 test verdi; TypeScript e build Vite completati. Le anteprime
SSR 1081 e 2081 sono state rigenerate e controllate nel browser integrato, senza errori console.

### 40. Roadmap WinCC Unified e dinamiche da espressione eseguibili

`WINCC-UNIFIED-ROADMAP.md` e' ora l'inventario stabile delle capacita' da raggiungere: progetto e
pagine, tag, dinamizzazioni, eventi/JavaScript, faceplate, controlli Runtime, allarmi, parameter set,
logging/report/audit, sicurezza, connettivita' e diagnostica. Ogni famiglia ha un ID, lo stato reale
di Framecraft, cio' che manca per la parita' WinCC e il miglioramento da costruire oltre WinCC. La
roadmap si basa sulla documentazione ufficiale V21 e tiene FactoryTalk Optix come fase separata da
aprire soltanto dopo WinCC, senza mescolare semantiche Siemens e Rockwell.

La prima capacita' chiusa e' `WCU-DYN-03/04/09/10`. Prima l'Inspector salvava le sorgenti
`Expression`, ma `plcSimulation.ts` le dichiarava sempre non risolvibili. Ora:

- `hmiExpression.ts` analizza le espressioni senza `eval`: operatori logici WinCC
  (`AND`/`OR`/`NOT`/`XOR` e forme simboliche), confronti, calcoli, bit, parentesi, conversioni e
  `tag("Nome con spazi")`;
- tutte le variabili dipendenti entrano automaticamente nel simulatore; al cambio di un valore la
  proprieta' viene rivalutata e il canvas cambia davvero;
- le conversioni `conditionType: Expression` applicano dall'alto la prima condizione vera, con
  `value` come valore del tag principale e accesso agli altri tag;
- Inspector e controllo progetto segnalano sintassi, funzioni non supportate, valori di prova
  mancanti e tag non dichiarati. Gli script liberi restano fuori: non vengono eseguiti fingendo che
  siano sicuri.

**Verificato**: 21 test mirati verdi su parser, simulazione e validazione, piu' il rendering DOM
dell'Inspector con dipendenze e guida sintassi visibili; suite completa con 45 file e **486 test
verdi**; TypeScript e build Vite completati. Restano soltanto i warning gia' noti sugli import sia
statici sia dinamici e sul chunk principale oltre 500 kB.

### 41. Liste risorse WinCC e multilingua live

`WCU-ENG-11` e `WCU-DYN-05` non sono piu' semplici metadati nell'Inspector. La documentazione
ufficiale V21 e i JSON reali dello standard confermano il contratto: una dinamizzazione ResourceList
ha sempre il nome della lista e il tag che seleziona la voce; il progetto usa la strategia
`ExactMatch` e sei lingue Runtime con italiano all'ordine zero. Il file reale `text-lists.json`
fornisce i 26 nomi ma non le voci, quindi i testi e i valori non sono stati inventati.

Ora ogni progetto puo' avere `framecraft.resources.json`, con:

- liste testi e grafiche, voci `SingleValue`, `Range`, `From` e `To`, tipi `Decimal`, `Bool` e
  `BitNumber`, voce predefinita e strategia bit esatta/primo bit attivo;
- lingue configurabili, lingua predefinita e lingua simulata; ogni voce testo ha una traduzione per
  lingua e un fallback esplicito;
- un pannello **Risorse** per creare, modificare ed eliminare liste e voci, importare grafiche nel
  progetto e cambiare lingua live;
- Inspector corretto con i due campi distinti **Lista risorse** e **Variabile che sceglie la voce**;
- simulazione reale di testo e grafica nel canvas, compreso il ripristino esatto di `src` e stile;
- controllo progetto per lista assente, tipo testo/grafica incompatibile, tag mancante/non
  dichiarato e traduzioni incomplete;
- pipeline **Nuovo pannello standard** aggiornata: il catalogo vuoto ma gia' configurato con le sei
  lingue e `ExactMatch` viene generato insieme a `framecraft.plc.json`.

Anche `WCU-ENG-10` e' ora chiuso: lo stesso catalogo contiene i testi statici multilingua; ogni
titolo, etichetta o pulsante puo' scegliere la propria chiave dall'Inspector. Il ponte dell'anteprima
e il Runtime del progetto generato applicano la lingua all'intera pagina, conservano il testo JSX
come fallback e reagiscono anche alle pagine cambiate via HMR/router. La pagina reale
`2241_SystemFunction` invia ora i locale `en-US`, `it-IT`, `de-DE`, `fr-FR` ed `es-ES` al Runtime;
parte dall'italiano, coerentemente con `runtime-settings.json`, invece dal precedente stato locale
inglese che non traduceva il resto del pannello.

**Verificato**: test mirati verdi su modello, simulazione, ponte DOM, validazione e generatore;
suite completa con 46 file e **496 test verdi**; TypeScript e build Vite completati. Restano solo i
warning gia' noti sugli import sia statici sia dinamici, sul chunk principale e su `localStorage`
nei test Node.

### 42. Inventario FactoryTalk Optix e AI facoltativa

`FACTORYTALK-OPTIX-ROADMAP.md` registra ora la seconda piattaforma senza confonderla con WinCC.
L'inventario usa la documentazione ufficiale Rockwell e copre formato sorgente YAML e information
model, dynamic link e converter, driver e tag, NetLogic C#, sessioni e presentation engine, UI e
widget, allarmi, ricette, logger, database, trend, report, utenti e autenticazione, audit, OPC UA,
MQTT, FTP/IoT, entitlement a feature token, deploy, diagnostica e test tramite AutomationId. Ogni
famiglia ha un ID `FTX-*`, lo stato reale di Framecraft, la parita' mancante e il miglioramento da
costruire. Le funzioni specifiche Optix inizieranno dopo le fasi WinCC; il nucleo comune verra'
riusato solo quando la semantica e' verificata.

E' stata anche fissata l'architettura finale dell'AI in `AI-FRAMECRAFT-ROADMAP.md` e
`ARCHITETTURA-HMI.md`. L'editor dovra' restare completo senza modello AI e supportare tre percorsi
equivalenti: tutto manuale, generazione iniziale assistita e assistenza facoltativa durante le
modifiche. L'AI usera' lo stesso command layer di canvas e Inspector, produrra' proposte con diff,
validazione, accettazione parziale e undo, e non potra' inventare tag, allarmi, interlock, soglie,
ricette o permessi. La generazione operativa richiedera' input e mapping macchina-PLC-HMI approvati.

Questa fase e' una definizione verificabile dell'obiettivo e della sequenza, non dichiara ancora
implementate le funzioni Optix o l'assistente AI.

**Verificato**: dopo l'aggiornamento delle tre roadmap, suite completa con 46 file e **496 test
verdi**; `npm run build` completata. Restano i warning gia' noti sugli import misti, sul chunk
principale oltre 500 kB e su `localStorage` nei test Node.

### 43. Prima tranche Runtime scripting ed eventi WinCC

`WCU-DYN-06` e `WCU-EVT-01/04/05/08` hanno ora un primo flusso completo, dall'Inspector al pannello
generato. Non viene eseguito JavaScript arbitrario: `hmiScript.ts` compila un sottoinsieme esplicito
in una IR e il Runtime interpreta soltanto quella. Sono ammessi variabili locali, `if`, `switch`,
`return`, letture `Tags(...).Read()`, scritture, operazioni sui bit, `HMIRuntime.Trace` e cambio
pagina. Rete, DOM, `eval`, funzioni dinamiche e loop vengono rifiutati; ogni esecuzione ha inoltre
un limite di 500 operazioni e 100 ms.

L'Inspector permette ora di configurare:

- una dinamizzazione **Script** con codice reale, tag trigger espliciti o automatici dai tag letti
  e ciclo opzionale;
- eventi locali `Loaded`, `Down`, `Up`, `Tapped`, `Change` e `GestureDetected`, con controllo sintassi
  e conteggio dei tag letti/scritti;
- errori prima del Runtime: script non valido, `return` mancante, tag non dichiarato e scrittura sul
  proprio trigger, che puo' creare un ciclo.

In modalita' **Usa pannello** gli eventi passano all'editor, scrivono i valori della simulazione,
producono trace/errori e cambiano pagina. Nel progetto creato da **Nuovo pannello standard** vengono
generati `framecraftScriptRuntime.ts` e `framecraftHmiRuntime.ts`: gli attributi contengono gia' il
programma compilato, quindi il pannello non porta Babel e non usa `eval`. Le dinamiche Script sono
rivalutate sui tag dipendenti e sui cicli dichiarati; un limite di otto passaggi interrompe eventuali
cicli fra trigger e scritture. Un segnale dell'anteprima impedisce che editor e Runtime generato
eseguano lo stesso evento due volte.

La parita' resta correttamente **parziale**: mancano il catalogo completo degli eventi per ogni tipo
di oggetto, TagSet/Promise e qualita' dei driver, moduli JavaScript globali, breakpoint, stack e
TraceViewer. Queste parti non sono simulate o dichiarate complete.

**Verificato**: 49 file e **512 test verdi**; test dedicati per compilatore/interprete, eventi,
Inspector, validazione, ponte DOM e Runtime generato eseguito davvero (evento -> tag -> dinamica ->
navigazione); TypeScript e `npm run build` completati.
La build conserva soltanto i warning gia' noti sugli import misti e sul chunk principale; i test
Node conservano il warning non bloccante di `localStorage`.

### 44. GestureDetected e swipe dello standard realmente eseguibili

Gli attributi `data-hmi-swipe-left/right/up/down` erano fedeli ai JSON WinCC ma descrittivi: nessun
Runtime li interpretava. Ora il ponte dell'anteprima e `framecraftHmiRuntime.ts` riconoscono uno
swipe primario touch di almeno 40 px, distinguono le quattro direzioni ufficiali e:

- eseguono l'evento locale `GestureDetected` passando allo script la variabile `gesture`;
- supportano i confronti WinCC `UI.Enums.HmiGesture.SwipeLeft`, `SwipeRight`, `SwipeUp`, `SwipeDown`
  e `Unknown` nella sandbox;
- accettano la firma reale `ChangeScreen("NomeSchermata", ".")`, ignorando soltanto il contenitore
  perche' il pannello React usa un router unico;
- rendono operative tutte le destinazioni `data-hmi-swipe-*` gia' presenti nei template;
- traducono il prefisso numerico del nome WinCC, per esempio `1041_Counters`, nella route React
  corrispondente del pannello generato;
- espongono la stessa risoluzione di pagina al ponte Framecraft, cosi' la navigazione funziona anche
  quando il Runtime standalone e' giustamente disattivato dentro l'editor per evitare doppioni.

La soglia e' una scelta Runtime Framecraft esplicita; Siemens documenta le quattro direzioni e il
parametro `gesture`, ma non fornisce nei JSON esportati una soglia in pixel da copiare. Mouse e drag
dell'editor non attivano lo swipe: viene accettato soltanto `pointerType=touch`, coerentemente con
l'Area tattile WinCC.

**Verificato**: suite completa con 49 file e **516 test verdi**; test DOM sia nel ponte anteprima
sia nel Runtime standalone, inclusi parametro `gesture`, enum WinCC, scrittura tag e destinazione
legacy; TypeScript e `npm run build` completati.

### 45. TagSet WinCC sincrono nella sandbox e nel pannello generato

La prima parte di `WCU-TAG-12` e' ora operativa secondo le firme documentate da Siemens, non una
simulazione separata dall'editor. Gli script locali e le dinamizzazioni possono usare:

- `Tags.CreateTagSet(["Tag1", "Tag2"])`, `tagSet.Read()` e
  `tagSet("Tag1").Value` per una lettura multipla;
- assegnazioni `tagSet("Tag1").Value = valore` seguite da `tagSet.Write()`;
- la forma compatta `Tags.CreateTagSet([["Tag1", valore1], ["Tag2", valore2]]).Write()`.

Il compilatore salva queste operazioni nella stessa IR sicura gia' usata dagli altri script. Il
controllo progetto ricava tutti i tag letti e scritti; il simulatore applica il batch, rivaluta le
sole dinamizzazioni dipendenti e il progetto generato esegue lo stesso contratto senza Babel o
`eval`. Nomi mancanti dal TagSet e valori di prova assenti producono un errore esplicito.

La parita' rimane **parziale** e dichiarata come tale: non sono ancora supportati `Add`, `Remove`,
`Clear`, `ReadAsync`/`WriteAsync`, risultati per singolo tag, `QualityCode`, `LastError` e
`ErrorDescription`. Le forme non implementate vengono rifiutate invece di essere ignorate.

**Verificato**: test dedicati sul compilatore/interprete e test end-to-end nel Runtime del pannello
generato; suite completa con 49 file e **521 test verdi**; TypeScript e `npm run build` completati.

### 46. TraceViewer HMI nell'editor

La console tecnica dell'editor e' stata resa utilizzabile anche come primo TraceViewer di
`WCU-EVT-08` e `WCU-DIA-09`. I messaggi ora conservano l'origine `EDITOR`, `PREVIEW` o `HMI` e la
diagnostica permette di vedere tutto, soltanto il Runtime HMI oppure soltanto warning/errori, oltre
a cercare nel testo e pulire la sessione senza chiudere il pannello.

Durante **Usa pannello**, ogni evento locale registra in ordine:

- i messaggi prodotti da `HMIRuntime.Trace`;
- gli errori della sandbox con il tipo di evento che li ha originati;
- le scritture PLC, compresi i batch TagSet, nel formato `Tag=valore`;
- le destinazioni di navigazione richieste dallo script.

In questo modo una prova mostra la catena evento -> tag -> pagina invece di mescolare tutto con i
log di Vite. Il numero dei messaggi visibili e totali resta esplicito e ogni riga ha un timestamp al
secondo. La parita' e' ancora **parziale**: breakpoint, stack, persistenza/esportazione dei log e
diagnostica di un driver PLC reale non sono stati dichiarati implementati.

**Verificato**: test DOM sui filtri, la ricerca e la pulizia, piu' test sulle origini dei messaggi;
suite completa con 50 file e **523 test verdi**; TypeScript e `npm run build` completati.

### 47. TagSet asincrono, qualità e timestamp WinCC

La sandbox sicura copre ora anche il contratto asincrono documentato da Siemens. Gli eventi locali
e il Runtime generato accettano `ReadAsync()` e `WriteAsync()` sia con `then/catch` sia con
`await` e `try/catch`. Le operazioni restano nella IR controllata: non vengono introdotti `eval` o
un parser JavaScript nel pannello esportato.

Il comportamento degli errori segue la distinzione reale del TagSet: un batch con almeno un tag
riuscito completa la Promise e conserva `LastError`/`ErrorDescription` sui singoli elementi; la
Promise viene rifiutata soltanto quando falliscono tutti i tag. `Count`, `QualityCode`, `TimeStamp`,
`LastError` ed `ErrorDescription` sono leggibili dagli script. Gli enum
`hmiReadDirect`, `hmiWriteNoWait` e `hmiWriteWait` usano i nomi Siemens.

Gli eventi dell'anteprima e del pannello generato passano ora da una coda Promise, quindi click
rapidi non riordinano scritture, trace e navigazione. Durante questo lavoro è stato corretto anche
un ciclo del Runtime generato: la dinamizzazione del testo non riscrive più lo stesso
`textContent`, evitando che il `MutationObserver` rivaluti la pagina senza fine.

Nel pannello PLC, la simulazione elenca sia i tag delle dinamizzazioni sia quelli letti o scritti
dagli eventi. Ogni riga mostra subito soltanto il valore; **Qualità e timestamp** è un dettaglio
espandibile con etichette italiane e nomi WinCC, così una funzione diagnostica avanzata non affolla
il flusso normale. Questi stati sono simulati e verificabili, non ancora provenienti da un driver
PLC reale.

**Verificato**: 51 file e **532 test verdi**; TypeScript e `npm run build` completati. La build
segnala soltanto gli avvisi già noti sui chunk grandi e sugli import sia statici sia dinamici.

### 48. Ciclo di vita TagSet e ReadMaxAge

La parte restante di gestione della lista TagSet è entrata nella stessa sandbox e quindi anche nel
Runtime standard generato:

- `Add()` accetta un nome, un array di nomi o le coppie `[nome, valore]` documentate;
- `Remove()` elimina uno o più nomi dalla lista e dai valori preparati;
- `Clear()` azzera lista, valori preparati ed ultimo stato del TagSet;
- `ReadMaxAge(maxAge)` usa il pattern Promise Siemens o `await`, accetta soltanto un UInt32 in
  millisecondi e mantiene la regola di rifiuto solo quando falliscono tutti i tag.

Il controllo statico aggiorna l'insieme dei tag dopo Add/Remove/Clear, quindi Inspector,
validazione e dipendenze non continuano a mostrare il contenuto iniziale. Nel simulatore
`ReadMaxAge(0)` e `ReadMaxAge(n)` leggono gli stati di prova disponibili: la scelta tra AS e
process image verrà effettuata dal driver reale, che non è ancora dichiarato presente.

È stato aggiunto un test che costruisce ed esegue il **modulo JavaScript standalone prodotto dal
generatore**, includendo Add e ReadMaxAge. Questo verifica che il comportamento non dipenda da
Babel o da funzioni disponibili soltanto nell'editor.

**Verificato**: 51 file e **535 test verdi**; TypeScript e `npm run build` completati. La build
segnala soltanto gli avvisi già noti sui chunk grandi e sugli import sia statici sia dinamici.

### 49. Barra unica e area di lavoro pulita

I comandi permanenti sparsi sopra il canvas e nel bordo inferiore sono stati raccolti nei menu
della barra superiore. La barra mostra ora soltanto il progetto e le categorie **File**,
**Modifica**, **Visualizza**, **Pannello** e **Aiuto**. Anche `Prova pannello` è disponibile soltanto
nella tendina Pannello, senza un secondo pulsante fisso.

- File contiene apertura, salvataggio, esportazione e chiusura;
- Modifica contiene annulla/ripristina, eliminazione, modalità uso/modifica, guide, griglia e gli
  allineamenti che compaiono quando sono selezionati più elementi;
- Visualizza contiene disegno/codice, disposizioni di lavoro, dimensione dell'interfaccia, modalità
  semplice/completa, zoom, adattamento, aggiornamento e formato pannello;
- Pannello contiene prova Runtime, controllo progetto, PLC/simulazione, risorse e diagnostica HMI;
- Aiuto contiene la guida e le scorciatoie.

Il canvas non ha più una toolbar sempre aperta e la barra di stato inferiore non viene più montata.
Lo zoom automatico è stato spostato nello stato condiviso, così la voce della tendina comanda lo
stesso calcolo usato realmente dal canvas. Restano visibili soltanto gli avvisi contestuali che
richiedono un'azione immediata, per esempio la scelta di una zona o un errore dell'anteprima.

**Verificato**: tre test DOM dedicati controllano menu, chiusura con Escape e assenza dei comandi
fissi; TypeScript e `npm run build` completati. Gli avvisi di build restano quelli già noti.

### 50. Scritture QCD e messaggi operatore WinCC

Il blocco TagSet della sandbox copre ora anche le scritture documentate per qualità e audit:

- `TagSet.WriteQCD()` e `TagSet.WriteAsyncQCD()` scrivono valore, `QualityCode` e `TimeStamp`;
- `Tag.WriteQCD(value, writeType, TimeStamp, QualityCode)` è disponibile per il singolo tag;
- `TagSet.Item("Tag")` è supportato insieme alla forma abbreviata `tagSet("Tag")`;
- `Tag.WriteWithOperatorMessage(value, reason)` e
  `TagSet.WriteWithOperatorMessage(reason)` generano una voce per ogni scrittura riuscita.

La qualità viene controllata come UInt32 e il timestamp come data ISO o valore temporale numerico.
Gli stati aggiornati tornano alla simulazione PLC e vengono conservati anche tra eventi diversi nel
Runtime standard generato. Il messaggio operatore registra tag, motivo, vecchio e nuovo valore; il
simulatore può aggiungere utente, host e unità quando quel contesto è disponibile. Editor e Runtime
mostrano questi messaggi nella diagnostica con origine `HMI OPERATORE`.

Il comportamento resta dichiaratamente simulato finché non sarà presente un driver PLC reale: per
tag esterni sarà quel driver, non Framecraft, ad applicare il QualityCode e il timestamp imposti dal
sistema come previsto da Siemens.

**Verificato**: test dedicati per TagSet e singolo tag, Promise/await, validazione QCD, audit e
persistenza fra eventi del Runtime generato; suite completa con 51 file e **541 test verdi**;
TypeScript e `npm run build` completati. Gli avvisi di build restano quelli già noti.

### 51. Catalogo eventi WinCC per famiglia di oggetto

L'Inspector non mostra più la stessa lista generica a qualunque elemento. Il catalogo usa la
famiglia dell'oggetto e propone soltanto gli eventi sensati documentati da Siemens:

- pulsanti: focus, click contestuale, pressione/rilascio, tastiera, click e gesture;
- campi e selettori: eventi comuni più `Change`;
- schermate: `Loaded`, `Unloaded`, `HotKey`, click contestuale, click e gesture;
- controlli: inizializzazione, focus, `CommandFired` e `InterfaceEvent`;
- custom web control e faceplate: focus ed evento di interfaccia.

Il ponte dell'anteprima e il Runtime standard generato eseguono ora `Activated`, `Deactivated`,
`ContextTapped`, `KeyDown`, `KeyUp`, `HotKey`, `Initialized`, `Loaded`, `Unloaded`,
`InterfaceEvent` e `CommandFired` oltre agli eventi già presenti. Gli script ricevono variabili
locali controllate (`key`, `command`, `interfaceEvent`) e il ciclo DOM emette una sola volta
inizializzazione/caricamento, più lo scaricamento quando la pagina o il controllo viene rimosso.

La parità resta **parziale**: saranno aggiunti gli eventi rari e i parametri specifici dei singoli
controlli quando entreranno i rispettivi controlli Runtime completi. Quelli non supportati non
vengono inventati o mostrati come operativi.

**Verificato**: test di catalogo, Inspector, ponte anteprima e Runtime standalone generato; suite
completa con 51 file e **545 test verdi**; TypeScript e `npm run build` completati. Gli avvisi di
build restano quelli già noti.

### 52. Moduli JavaScript globali e definizioni locali

Il progetto HMI può ora raccogliere logica riutilizzabile in `framecraft.scripts.json`, senza
duplicare lo stesso corpo JavaScript dentro ogni evento o dinamizzazione. Il pannello **Moduli
JavaScript** si apre dalla barra laterale o dal menu a comparsa **Pannello** e permette di creare:

- moduli globali richiamabili come `Modules.Alias.Funzione(...)` in tutte le pagine;
- definizioni locali richiamabili come `Local.Funzione(...)`, limitate alla route scelta;
- contesti locali separati per eventi e dinamizzazioni, come richiesto dal modello WinCC.

Ogni funzione dichiara nome, parametri e corpo. Al salvataggio viene compilata nella stessa IR
sandbox degli script HMI: niente `eval`, niente parser nel pannello esportato. Firma, nomi,
duplicati, chiamate mancanti, ricorsione e dipendenze tag transitive vengono controllati prima del
salvataggio e nel controllo progetto. L'Inspector usa lo stesso catalogo quando prova uno script.

Anche **Crea nuovo pannello standard** include automaticamente il catalogo, il piccolo resolver
Runtime e il collegamento per eventi e dinamizzazioni. Le funzioni globali e locali funzionano
quindi nel pannello standalone generato, non soltanto dentro l'editor.

La parità resta **parziale**: mancano ancora i tipi di modulo conservati in libreria, le relative
versioni/master copy, i contesti globali persistenti del Runtime e le API che dipendono dal task o
dal dispositivo reale. Queste parti non vengono simulate come se fossero già WinCC.

**Verificato**: suite completa con 51 file verdi e 1 test scratch esterno saltato, **554 test
verdi** e 1 saltato; il blocco moduli copre compilazione, firma, ricorsione, scope, dipendenze,
validazione progetto, simulazione ed esecuzione nel Runtime standard generato. TypeScript e
`npm run build` completati; restano soltanto gli avvisi di suddivisione bundle già noti.

### 53. Scheduler WinCC con tempo virtuale

Dentro **Moduli JavaScript** si possono ora creare anche operazioni pianificate. Ogni voce ha nome,
ID stabile, stato attivo/disattivato, script `Update` compilato e uno dei trigger già operativi:

- intervallo ciclico in millisecondi, con ritardo iniziale separato;
- una sola esecuzione a data e ora stabilite;
- modifica di un tag, fronte di salita, fronte di discesa oppure uguaglianza a un valore.

L'editor permette **Prova ora** e fa avanzare l'orologio virtuale di un secondo o un minuto. Le
esecuzioni usano i valori PLC simulati, applicano scritture e qualità allo stesso stato della prova
pagina e mostrano l'ultima operazione eseguita. Il motore puro ordina correttamente scadenze
contemporanee, propaga le scritture ai trigger su tag e si ferma con un errore leggibile se una
catena supera il limite anti-loop.

Il catalogo `framecraft.scripts.json` e **Crea nuovo pannello standard** includono le operazioni.
Nel Runtime standalone i timer reali e i cambi tag entrano nella stessa coda seriale degli eventi;
trace, messaggi operatore, navigazione, stato tag e dinamizzazioni vengono aggiornati normalmente.
Il controllo progetto verifica trigger, date, intervalli, ID, nomi, script, moduli richiamati e tag
PLC usati direttamente o tramite funzioni globali.

Le ricorrenze calendario e il trigger sugli allarmi, ancora mancanti in questa tranche, sono stati
aggiunti nella sezione 55. L'esecuzione su dispositivo reale dovrà poi rispettare i limiti e il
ciclo del Runtime Siemens.

**Verificato**: suite completa con 52 file verdi e 1 test scratch esterno saltato, **560 test
verdi** e 1 saltato; test dedicati per tempo virtuale, ordine, fronte tag, cascata, prova manuale,
validazione, salvataggio e Runtime standalone. TypeScript e build di produzione completati.

### 54. `HMIRuntime.Timers` negli script

La sandbox riconosce ora i quattro metodi dell'oggetto timer WinCC:

- `HMIRuntime.Timers.SetTimeout(callback, delay)` restituisce un ID ed esegue una volta;
- `HMIRuntime.Timers.SetInterval(callback, delay)` restituisce un ID ed esegue ciclicamente;
- `ClearTimeout(id)` e `ClearInterval(id)` eliminano il timer del tipo corrispondente.

La callback può essere un blocco inline senza parametri oppure una funzione globale/locale già
compilata, per esempio `Modules.Clock.Tick`. Il ritardo viene controllato come UInt32, l'ID come
intero positivo e una firma di funzione incompatibile viene fermata prima del Runtime. Letture e
scritture tag contenute nella callback entrano nelle dipendenze dello script.

Il gestore è persistente durante la prova pagina e non viene ricreato quando cambiano selezione,
zoom o pannello laterale. Le callback passano nella stessa coda seriale degli eventi e possono
scrivere tag, cambiare pagina, produrre trace, messaggi operatore o creare altri timer. Alla chiusura
della prova tutti i timer rimasti vengono eliminati. Il nuovo pannello standard riceve anche
`framecraftHmiTimers.ts`: quindi lo stesso programma compilato funziona nell'esportazione, senza
parser JavaScript o `eval` nel browser.

Restano fuori, dichiaratamente, la cattura completa delle variabili locali tramite closure e le
variabili globali persistenti definite come nel Global definition Siemens. Per conservare un ID fra
due eventi si può già scriverlo in un tag interno; il contesto globale JavaScript completo verrà
aggiunto con il restante lavoro sui moduli.

**Verificato**: callback inline e di modulo, ID, cancellazione, intervallo, timeout, dipendenze,
firma errata, limiti UInt32, pulizia e Runtime standard generato; suite completa con 53 file verdi e
1 scratch esterno saltato, **564 test verdi** e 1 saltato. TypeScript e build di produzione completati.

### 55. Scheduler a calendario e su cambio allarme

Il catalogo delle operazioni pianificate copre ora tutti i gruppi di trigger elencati dal manuale
WinCC Unified V21. Oltre a ciclo, singola data e cambio tag, l'utente può configurare:

- ricorrenza giornaliera a un'ora locale del pannello;
- ricorrenza settimanale con giorno della settimana;
- ricorrenza mensile con giorno del mese;
- ricorrenza annuale con mese e giorno;
- cambio allarme filtrato per classe, stato o priorità.

Le date inesistenti non vengono corrette silenziosamente: per esempio il giorno 31 salta aprile e
la ricorrenza 29 febbraio aspetta un anno bisestile. Il calcolo usa il fuso locale del Runtime e
considera anche i cambi di ora legale. Nell'editor ci sono selettori guidati, avanzamento del tempo
virtuale fino a un giorno e un simulatore allarme con classe, stato e priorità.

Per gli allarmi sono disponibili `=`, `<>`, `>`, `>=`, `<` e `<=`, coerenti con gli operatori
relazionali dei filtri Unified. La priorità è validata nell'intervallo ufficiale 0-16. Lo script
`Update` riceve anche `trigger`, `alarmClass`, `alarmState`, `alarmPriority`, `alarmName` e
`alarmText`, così non deve rileggere informazioni già presenti nella notifica.

**Crea nuovo pannello standard** genera `framecraftHmiSchedule.ts` e il Runtime installa realmente
le ricorrenze. `notifyRuntimeAlarm(...)` e l'evento `framecraft:alarm-state` collegano il futuro
motore allarmi allo Scheduler; i task entrano nella stessa coda seriale di eventi, timer e scritture
tag. Timer molto lontani vengono riarmati a tratte, evitando il limite dei timeout JavaScript.

La parità dello Scheduler resta dichiarata **parziale** soltanto dove dipende da funzioni non ancora
presenti: closure/globali JavaScript persistenti e collegamento a un motore allarmi completo con
stati reali, acknowledge e storico. Il bridge e il simulatore non fingono quel motore.

**Verificato**: calcolo daily/weekly/monthly/yearly, date mancanti, anno bisestile, filtri classe/
stato/priorità, contesto script, editor, serializzazione e Runtime generato. Suite completa con
54 file verdi e 1 scratch esterno saltato, **572 test verdi** e 1 saltato. TypeScript e build di
produzione completati.

### 56. Lampeggio WinCC dichiarativo e accessibile

Le proprietà colore **sfondo**, **testo** e **bordo** possono ora usare la sorgente **Lampeggio
WinCC** direttamente dall'Inspector. La configurazione segue le opzioni documentate da Unified:

- due colori senza modificare il valore base della proprietà;
- condizione **Mai**, **Sempre** oppure **Fuori dai limiti** di una variabile PLC;
- velocità **Lenta** (2 s), **Media** (1 s) e **Veloce** (500 ms).

L'editor mostra il rapporto di contrasto fra i colori e il controllo progetto segnala colori
uguali, contrasto inferiore a 3:1, tag mancanti e intervalli incompleti o invertiti. La prova pagina
usa gli stessi valori PLC simulati delle altre dinamizzazioni e rimuove completamente animazione e
variabili CSS quando il valore rientra nei limiti o si spegne la simulazione.

Il lampeggio non è soltanto un effetto dell'editor: **Crea nuovo pannello standard** genera
`framecraftHmiFlashing.ts`, il Runtime standalone rivaluta i limiti a ogni cambio tag e ripristina
lo stile originale allo smontaggio. Se il sistema richiede **Riduci movimento**, l'animazione viene
sostituita da colore alternativo, righe statiche e doppio bordo, così il segnale resta distinguibile
senza movimento.

Resta ancora da implementare l'API JavaScript `PropertyFlashing` dei singoli controlli Unified e
l'audit accessibilità generale su target touch e pagine complete; per questo `WCU-DYN-07` e
`FC-MORE-12` restano correttamente **parziali**.

**Verificato**: risoluzione Always/Never/Range violation, frequenze ufficiali, ARGB, composizione di
più proprietà, Inspector, validazione, anteprima, pulizia stato e Runtime standard generato. Suite
completa con **55 file verdi** e 1 scratch esterno saltato, **583 test verdi** e 1 saltato;
TypeScript e build di produzione completati, con soli avvisi bundle già noti.

### 57. Tipi faceplate, eventi, stato locale e annidamento Unified

Il nuovo pannello standard genera ora `framecraft.faceplates.json`. Il catalogo iniziale non usa
nomi inventati: contiene le tre famiglie realmente trovate nelle istanze JSON dello standard,
**Pack V0.0.8**, **Slider V1 V0.0.28** e **Slider V2 V0.0.5**, con dimensioni e nomi delle
interfacce esportate. I tipi sono accessibili soltanto da **Pannello → Tipi faceplate**, mantenendo
pulita la barra; anche **Prova pannello** resta esclusivamente nel menu a comparsa **Pannello**.

L'editor distingue tipo e versione, rende immutabile una release e crea una nuova bozza incrementale
senza sovrascrivere quella già usata dalle istanze. Il contratto comprende tag, proprietà, eventi con
parametri, tag locali e istanze annidate. L'Inspector assegna soltanto versioni rilasciate, collega i
tag PLC, configura le proprietà e controlla obbligatorietà e compatibilità dei tipi. Le trenta
istanze Pack della pagina reale nella pipeline standard portano già il mapping esportato.

Gli eventi non sono solo metadati: la sandbox riconosce `Faceplate.RaiseEvent(nome, parametri)`, il
bridge individua l'istanza proprietaria e lo script collegato riceve `interfaceEvent` e ogni parametro
col proprio nome. Scritture, trace, navigazione, QCD, messaggi operatore e moduli passano nella stessa
coda degli altri eventi sia in **Usa pannello** sia nel Runtime esportato.

I tag locali hanno start value e stato separato per elemento DOM: due istanze dello stesso tipo
possono usare `LocalCounter` senza pubblicarlo nel catalogo PLC e senza contaminarsi. La composizione
annidata collega tag/proprietà dell'interfaccia interna a quella esterna; il validatore blocca nomi
duplicati, target non rilasciati, mapping mancanti o incompatibili e cicli indiretti fra più tipi.

La parità faceplate resta **parziale** in modo esplicito: mancano ancora editor visuale del contenuto
del tipo, rendering automatico della composizione annidata, UDT come interfaccia, diff/migrazione
delle istanze e l'oggetto popup persistente completo di `Left`, `Top`, `Visible`, `WindowFlags` e
`Close`. La firma V21 di `UI.OpenFaceplateInPopup` è stata verificata nella documentazione Siemens e
non viene sostituita con una semplice navigazione. Questa parte viene completata nella sezione 58.

**Verificato**: parser/serializzazione, release e nuova versione, mapping PLC, parametri evento,
`Faceplate.RaiseEvent`, prova pannello, Runtime generato, isolamento dei tag locali, annidamento e
cicli. Suite completa con **57 file verdi** e 1 scratch esterno saltato, **597 test verdi** e 1
saltato; TypeScript e build di produzione completati, con soli avvisi bundle già noti.

### 58. Popup faceplate persistenti Unified

La sandbox riconosce ora le firme V21 `UI.OpenFaceplateInPopup(...)`,
`HMIRuntime.UI.OpenFaceplateInPopup(...)` e `Faceplate.OpenFaceplateInPopup(...)`. Il valore restituito
non è una navigazione mascherata: è un riferimento a una finestra persistente, sul quale gli script
leggono e scrivono `Left`, `Top`, `Width`, `Height`, `Visible` e `WindowFlags`, e invocano `Close()`.
Sono disponibili gli otto flag ufficiali `HmiWindowFlag`, compreso `AlwaysInParent`.

L'oggetto interfaccia conserva sia valori sia collegamenti `{ Tag: "NomeTag" }`; i binding entrano
nell'analisi dipendenze dello script. Il gestore impedisce nomi finestra duplicati, mantiene stato e
ordine delle finestre, chiude quelle legate alla pagina durante una navigazione e supporta anche
`Faceplate.Close()`. In quest'ultimo caso la prima tranche chiude la finestra attiva più recente:
il contesto esatto del faceplate contenuto verrà collegato quando sarà disponibile il rendering
visuale interno del tipo.

In **Usa pannello** e nel Runtime generato compare una vera finestra accessibile con titolo,
posizione, dimensioni, visibilità, bordo, resize, trascinamento, pulsante chiudi e z-order coerenti
con i flag. L'interfaccia passata è visibile e distingue i valori dai binding PLC. La pipeline
**Crea nuovo pannello standard** genera `framecraftHmiPopups.ts` e lo collega a eventi, timer,
operazioni pianificate, dinamizzazioni e navigazione.

La parità `WCU-FP-07` resta **parziale** soltanto per contenuto visuale automatico del tipo,
screen window generiche e contesto esatto di `Faceplate.Close`; finestra, proprietà e ciclo di vita
non sono più elementi fittizi.

**Verificato**: parser e dipendenze, proprietà e flag, nomi univoci, chiusura per contesto,
anteprima, chiusura utente, Runtime generato e pipeline standard. Suite completa con **58 file
verdi** e 1 scratch esterno saltato, **604 test verdi** e 1 saltato; TypeScript e build di produzione
completati, con soli avvisi bundle già noti.

### 59. Visualizzazione interna e composizione dei faceplate

I tipi faceplate hanno ora un contenuto visuale persistente, non soltanto il contratto di
interfaccia. Da **Pannello → Tipi faceplate** si apre un mini-editor con canvas, trascinamento e
proprietà per rettangolo, ellisse, testo, campo IO, pulsante, barra e grafica. Ogni oggetto può
collegare testo, valore, colori, visibilità, abilitazione e geometria a un tag di interfaccia, una
proprietà oppure un tag locale; un pulsante può emettere un evento di interfaccia con parametri.

Le istanze annidate hanno posizione e dimensioni proprie e vengono composte ricorsivamente. Il
renderer risolve i mapping fra interfaccia esterna e interna, aggiorna i valori simulati e conserva
lo stato locale distinto per istanza. I cicli fra tipi restano bloccati dal validatore. Se un
progetto contiene già un'implementazione DOM interna del faceplate, Framecraft non la cancella:
il renderer automatico riempie soltanto contenitori vuoti o già gestiti da lui.

La funzione è operativa sia in **Usa pannello** sia nel progetto esportato. I popup aperti con
`OpenFaceplateInPopup` mostrano automaticamente la visualizzazione del tipo e ricevono valori o
binding `{ Tag: "..." }` dall'oggetto interfaccia. **Crea nuovo pannello standard** include le
visualizzazioni iniziali di Pack e Slider nel catalogo reale e genera
`framecraftHmiFaceplateVisuals.ts`, collegato al Runtime senza `eval`.

La parità resta correttamente **parziale**: il mini-editor non ha ancora tutti i controlli, livelli,
ordinamento e proprietà dell'editor pagine Unified; mancano eventi fra annidamenti, opzioni complete
del Faceplate container, UDT di interfaccia, diff/migrazione versioni, screen window generiche e il
contesto esatto di `Faceplate.Close`. Le visualizzazioni iniziali dello standard sono derivate dalle
interfacce esportate: i JSON delle istanze non contengono il sorgente grafico interno originale e
quindi non vengono presentate come copie esatte di TIA.

**Verificato**: schema e validazione, editor, binding visuali, eventi, rendering ricorsivo, popup,
compatibilità con contenuto esistente, anteprima e Runtime generato. Suite completa con **59 file
verdi** e 1 scratch esterno saltato, **609 test verdi** e 1 saltato; TypeScript e build di produzione
completati, con soli avvisi di chunk già noti.

### 60. Trend Control Unified online

La palette **HMI e PLC** contiene ora un **Trend Control Unified** reale, non il vecchio SVG
segnaposto della categoria Dati. Dall'Inspector si configurano fino a nove curve con nome, tag PLC,
colore, asse sinistro/destro, visibilità iniziale, soglia bassa/alta e modalità **Punti**,
**Interpolata**, **A gradini** o **Valori**. Gli assi possono avere estremi automatici o fissi,
unità e scala lineare, logaritmica positiva o logaritmica negativa.

In **Usa pannello** i campioni arrivano esclusivamente dai valori PLC simulati: se un tag non è
collegato, il grafico lo dichiara invece di inventare una curva. Il Runtime conserva una finestra di
campioni in memoria e disegna griglia, assi, unità, soglie, legenda e fino a nove penne. Start/stop
congela la vista ma continua a bufferizzare i nuovi campioni, come Unified; sono operativi zoom,
periodo precedente/successivo, vista originale, selezione dell'intervallo, righello, visibilità delle
curve ed export CSV dei campioni raccolti.

Il validatore controlla JSON, intervallo, campionamento, limite di nove curve, identificatori, tag,
soglie, estremi e vincoli delle scale logaritmiche. **Crea nuovo pannello standard** genera
`framecraftHmiTrend.ts` e il Runtime lo installa con pulizia del timer allo smontaggio. Anche in
questo caso un controllo già implementato dal progetto viene conservato invece di essere sostituito.

La parità `WCU-CTL-05` resta **parziale**: mancano aree multiple, sorgenti da log/archivio, fusi
orari, aggregazione in base ai pixel, qualità incerta, stampa, profili utente e object model completo.
Il **Function Trend Control** X/Y è ancora separatamente da fare; non viene simulato usando l'asse
temporale.

**Verificato**: modello, serializzazione, validazione, palette, Inspector, quattro modalità, assi,
soglie, campionamento, buffer stop/start, comandi Runtime, righello, selezione curve, CSV, anteprima
e Runtime standard generato. Suite completa con **60 file verdi** e 1 scratch esterno saltato,
**617 test verdi** e 1 saltato; TypeScript e build di produzione completati, con soli avvisi di
chunk già noti.

### 61. Data Log, storico e aree multiple Unified

Il pannello **Pannello → Data Log e storico** configura archivi e variabili senza aggiungere una
toolbar permanente al canvas. Ogni Data Log dichiara nome, stato, persistenza locale oppure di
sessione, conservazione, massimo campioni e durata dei segmenti. Per ogni variabile sono disponibili
le tre modalità documentate da Unified: **Su variazione**, **Su richiesta/trigger** e **Ciclica**, con
ciclo minimo di 500 ms. Il trigger può reagire a cambio, fronte di salita, fronte di discesa oppure
uguaglianza; gli script possono richiedere esplicitamente il campione.

Il Runtime conserva valore, timestamp, quality code e inizio segmento. Applica limiti, media mobile
e aggregazione media/minimo/massimo prima di scrivere; allo stop scarica anche l'ultima finestra
parziale, quindi non perde i campioni rimasti nel buffer. Retention e tetto complessivo vengono
applicati realmente, mentre la persistenza browser ricarica soltanto i Data Log dichiarati locali.
Il pannello mostra inoltre una stima della memoria massima e valida identificatori, tag PLC,
frequenze, trigger e finestre.

Il **Trend Control Unified** può ora mischiare curve **Online** e **Data Log**, interrogando lo
storico nello stesso intervallo temporale mostrato. Fino a quattro aree verticali hanno peso e assi
propri; ogni curva sceglie area, sorgente, Data Log e variabile archiviata. Il CSV include sorgente e
quality code. Editor, simulazione e Runtime esportato usano lo stesso catalogo
`framecraft.logs.json`; **Crea nuovo pannello standard** genera anche
`framecraftHmiDataLogs.ts` e collega automaticamente acquisizione, query storiche e Trend.

La parità resta **parziale** in modo esplicito: lo storage corrente è locale al browser/Runtime di
prova, non SQLite/MSSQL o memoria del pannello; mancano supporti esterni, rotazione file, backup,
allarme spazio residuo, fusi orari, aggregazione grafica per pixel, stampa e profili utente. La
qualità è conservata ed esportata, ma non ha ancora una resa grafica dedicata. Il Function Trend
Control X/Y rimane un controllo separato e viene implementato nella tranche successiva.

**Verificato**: modello, parser e serializzazione, configuratore UI, tre modalità di acquisizione,
trigger, quality/timestamp, smoothing, limiti, aggregazione e flush parziale, persistenza locale,
retention, query, più aree, curve archiviate, CSV, validazione, anteprima e Runtime standard
generato. Suite completa con **62 file verdi** e 1 scratch esterno saltato, **625 test verdi** e 1
saltato; TypeScript e build di produzione completati, con soli avvisi di chunk già noti.

---

### 62. Function Trend X/Y e generazione Runtime verificata dopo il bundling

La palette **HMI e PLC → Function Trend X/Y** inserisce un controllo separato dal Trend temporale.
L'Inspector configura indipendentemente le sorgenti X e Y, online oppure da Data Log, fino a nove
curve e quattro aree con assi valore e unità proprie. Sono disponibili valori scalari e snapshot
array JSON: gli array devono avere forma e lunghezza coerenti, senza inventare punti mancanti.
Ogni campione Y usa il campione X più vicino entro la tolleranza temporale scelta; la query di X
include la tolleranza anche ai bordi dell'intervallo storico. I campioni non abbinabili sono segnalati.

Il controllo offre soglie Y, quattro modalità di disegno, intervallo mobile/fisso o numero di punti,
start/stop della vista con acquisizione che continua nel buffer, zoom e spostamento separati X/Y,
vista originale, scelta della curva in primo piano, righello e CSV con sorgenti e quality code.
La qualità usa i bit 7/6 del byte basso: Good 128 e Good Cascade 192 sono entrambi buoni; Bad e
Uncertain hanno marcatori distinguibili e dettaglio testuale. I campi, il focus e il pannello
intervallo non vengono ricreati a ogni campione, e i controlli hanno focus visibile e target da 44 px.

Il catalogo PLC rileva e rinomina i tag online dei due tipi di Trend, senza modificare titoli,
nomi curva o mapping degli archivi. Il pannello di simulazione propone anche i tag X/Y, quelli del
Trend temporale e i tag/trigger dei Data Log abilitati; spiega esplicitamente come inserire un array.
**Crea nuovo pannello standard** include `framecraftHmiFunctionTrend.ts` e collega il controllo a
valori, qualità e query storiche nel Runtime. Non viene aggiunta una toolbar permanente all'editor.

La verifica del generatore compilato ha riprodotto un difetto distinto da quello dei test di
sviluppo: la minificazione rinominava i riferimenti nelle funzioni serializzate, producendo moduli
Runtime non autonomi. La build dell'editor mantiene ora i nomi con `minify: false`. Un test dedicato
compila in memoria il generatore con la configurazione Vite di produzione, valuta tutti i moduli
autonomi generati e disegna davvero una curva X/Y dal modulo risultante. Si esegue separatamente
con `npm run test:production`, così il bundling non compete con i timeout degli script dei test
funzionali; i limiti Runtime non sono stati allargati. La build resta più grande;
un futuro passaggio a sorgenti Runtime precompilate potrà recuperare la minificazione in sicurezza.

Riferimenti verificati: [Function Trend Control V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/displaying-tags-rt-unified/configuring-the-function-trend-control-rt-unified)
e [Quality Codes V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/reference-rt-unified/quality-codes-of-hmi-tags-rt-unified).
Le scale logaritmiche sono un'opzione Framecraft, non una dichiarazione di parità per tutti i target.
La parità resta **parziale**: mancano zoom rettangolare, selezione sorgenti a Runtime, stampa,
profili personali, object model completo e verifica dei limiti dei singoli dispositivi. Non è
stata eseguita una prova su PLC o pannello fisico; i Data Log restano nello storage browser.

**Verifica corrente**: test dedicati a modello, abbinamento temporale, array incompatibili,
stop/resume, qualità, CSV, aree, focus, Inspector, catalogo/simulazione PLC e moduli generati.
Verifica browser con soli dati di prova inseriti manualmente; nessun segnale macchina fittizio.
Suite funzionale completa (`npm test -- --maxWorkers=2`): **64 file verdi**, **638 test verdi** e
1 scratch esterno saltato. Collaudo separato (`npm run test:production`): **1 file e 1 test verdi**.
`npm run build` completa TypeScript e build di produzione. Restano gli avvisi sugli import
statici/dinamici condivisi; la minificazione è deliberatamente disattivata come spiegato sopra.

### 63. Comandi Runtime dei trend — 30 settembre 2026

Trend temporale e Function Trend X/Y hanno ora selezione sorgenti dalla lista di tag/archivi del
progetto e zoom rettangolare. La scelta delle sorgenti è atomica, resta nella sessione Runtime e
non riscrive gli attributi del progetto; il ripristino torna ai mapping progettati. Al cambio di
sorgente non vengono rietichettati i campioni della precedente.

Il rettangolo viene limitato all'area scelta; nel temporale seleziona tempo e assi sinistro/destro,
nel Function Trend solo gli assi dell'area interessata. Esc, pointercancel e disattivazione annullano
il gesto; altri puntatori e click troppo piccoli non applicano zoom. L'acquisizione continua durante
il trascinamento senza cancellare il rettangolo.

Il temporale conserva qualità online/storica nel CSV, marca i campioni incerti e interrompe la
linea sui campioni Bad, con una legenda leggibile. I campi restano stabili durante l'acquisizione,
anche nell'iframe dell'editor; non vengono sostituiti i controlli custom del progetto. Pulsanti,
selettori e focus sono stati adeguati all'uso touch/tastiera secondo la verifica UI/UX.

Canvas e Runtime generato passano il catalogo PLC/Data Log e la qualità ai due controlli.
La pipeline **Crea nuovo pannello standard** emette i moduli autonomi completi; nessuna toolbar
permanente aggiunta all'editor.

Verifica: suite completa **65 file e 649 test verdi**, 1 scratch saltato; collaudo del generatore
compilato **1 test verde**, esteso a entrambi i trend, scelta sorgenti e qualità; **build verde**.
Nel browser sono stati inseriti manualmente array di prova, cambiata Y e trascinato un rettangolo:
grafico aggiornato e nessun errore console. Nessuna prova su CPU reale.

Riferimenti: documentazione ufficiale V21 dei controlli
[Trend](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/trend-control-rt-unified) e
[Function Trend](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/function-trend-control-rt-unified).
Restano stampa, profili, object model e, nel temporale, fusi orari e aggregazione per pixel.

### 64. Destinazione del prodotto chiarita

L'obiettivo è un HMI React autonomo, collegato con OPC UA/MQTT a CPU fisiche o PLC virtuali,
non un progetto da distribuire in TIA Portal/Rockwell. ARCHITETTURA-HMI.md e le roadmap
WinCC/Optix/AI registrano il vincolo; formati e licenze vendor sono riferimenti, non dipendenze.
Il collegamento industriale resta parziale (sezioni 65–66); simulazione e API locali non sono
una sessione PLC.

### 65. Primo driver MQTT reale del Runtime autonomo

runtime/mqtt-driver.mjs usa MQTT.js in Node: connection lifecycle, sottoscrizioni, mapping di
tag dichiarati, tipi scalari PLC, cache, JSON Pointer, qualità/timestamp espliciti, limite payload,
freshness opzionale, timeout e riconnessione. Non viene assunto Good quando il payload non porta
qualità. Gli errori conservano l'ultimo valore e lo rendono Bad; un dato sorgente più vecchio
viene ignorato. Credenziali via riferimenti ambiente, TLS verificato e scelta insecure esplicita.

Le scritture richiedono accesso al tag, allowWrites e writeTopic. Non sono retained, non aggiornano
la cache ottimisticamente e non vengono accodate offline. Dopo una perdita di connessione si crea
un client pulito, senza replay automatico di comandi dall'esito incerto. Il risultato distingue
broker ack da conferma PLC; quest'ultima non è implementata.

Otto test separati in npm run test:gateway avviano un vero broker Aedes sul loopback e verificano
anche il driver generato, eseguito in un processo Node separato. Coprono letture, tipizzazione,
qualità/timestamp, payload errati, autorizzazioni, ricezione dei comandi, staleness, riconnessione,
assenza di replay e avvii falliti. Nessun server/PLC aziendale coinvolto; TLS e CPU reale non collaudati.

**Crea nuovo pannello standard** copia driver, tipi, README e avvio diagnostico Node, con
runtime/package.json e framecraft.connections.json inizialmente vuoto. Il codice server viene
copiato come sorgente raw, non eseguito nel browser. L'avvio diagnostico emette campioni JSON.
Il bridge browser è stato aggiunto nella sezione 66; editor connessioni e OPC UA restano da
implementare. Il modulo non è presentato come connettività industriale completa.

Verifica complessiva: 649 test funzionali passati, 8 test MQTT passati e build TypeScript/Vite
riuscita. La suite di generazione production verifica separatamente i moduli Runtime distribuiti.

Riferimenti di implementazione: [MQTT.js](https://github.com/mqttjs/MQTT.js) e
[Aedes](https://github.com/moscajs/aedes/blob/main/docs/Aedes.md), verificati contro le versioni
installate MQTT.js 5.16.0 e Aedes 1.2.0.

### 66. Gateway MQTT/HTTP e browser dello standard

`runtime/gateway.mjs` avvia driver reali e serve campioni/metadati su HTTP loopback. Il client
browser usa lo stesso origin del pannello attraverso un proxy server: token via ambiente,
mai nel bundle. Controlli di Host, origine esatta, autorizzazione, accesso e tipo PLC, limiti su
body/concorrenza/cataloghi e nessuna risposta cacheabile. Credenziali/token con nomi ambiente
`VITE_*` vengono rifiutati perché pubblici nel frontend. Il client limita le risposte a 4 MiB.

L'acquisizione conserva valore, qualità sconosciuta o codice QC a 16 bit, timestamp sorgente e
ricezione separati. Il Runtime aggiorna dinamiche, Data Log e trend con un evento di lettura,
non simulando una scrittura. La barra PLC indica il trasporto reale, non una connessione inventata.

`requestRuntimeTagWrite` attende il servizio, senza cache ottimistica o coda offline. La notifica
distingue ricevuta broker, rifiuto ed esito incerto; nessuna conferma di esecuzione PLC inventata.
La deduplica HTTP è limitata a cinque minuti in memoria, non exactly-once o sopravvivenza a restart.
In modalità connessa le scritture PLC da script IR legacy restano bloccate esplicitamente fino
all'integrazione del trasporto asincrono. I tag interni dei faceplate restano locali.

**Crea nuovo pannello standard** copia gateway, client, tipi, launcher, proxy Vite e guida operativa.
`framecraft.connections.json` resta vuoto e `framecraft.runtime.json` disabilitato; nessun
endpoint/credenziale/topic viene inventato. Servizio Node minimo 22, deployment previsto su LTS.

Verifica: **14 test MQTT/HTTP verdi** su broker TCP locale, anche con servizio e driver generati
in processi Node separati; test del client e del Runtime generato verdi. Nessuna prova CPU/TLS
reale. Restano editor connessioni, OPC UA, interpreter transport, RBAC/audit server e storage
industriale: il token protegge la stazione/proxy, non è un'identità operatore.

### 67. Licenze e gate di produzione

`npm run check:licenses` produce un inventario offline: **255 pacchetti npm**, **44 nello scope
MQTT**, **266 pacchetti Cargo del target Windows x64**. Il filtro target evita di richiedere
pacchetti Android non presenti in cache; non viene scaricato codice per questo controllo.
Sono segnalati `caniuse-lite` CC-BY-4.0 nel tooling e 41 voci Cargo da rivedere (MPL, Unicode,
CC0/Zlib e dichiarazioni legacy). Questo non significa divieto commerciale automatico.

La scansione npm online è stata autorizzata dall'utente: due segnalazioni moderate nel tooling
Vitest, nessuna alta/critica; audit `--omit=dev` senza segnalazioni note. Nessun `npm audit fix`
o aggiornamento major forzato. Il fix Vitest va applicato e collaudato separatamente.

`LICENZE-E-PRODUZIONE.md` registra esiti, fonti, notice/diritti asset, licenza prodotto da definire,
TLS/CPU, conferme PLC, RBAC/audit, deployment LTS e limiti dell'AI futura. Il report lascia
sempre `releaseApproved: false`; build e metadati SPDX non approvano un rilascio industriale.

### 68. Recupero Vite senza riaprire il progetto

Visualizza contiene **Aggiorna anteprima**, **Riavvia Vite**, **Ricostruisci cache Vite** e
**Log di avvio**, anche quando manca l'URL. Aggiorna ricarica solo la pagina conservando query,
route e stato dell'editor; senza server disponibile tenta l'avvio. Il riavvio conserva documento,
buffer non salvato, selezione e undo. Le richieste ripetute sono bloccate e apri/chiudi aspettano
il riavvio in corso, evitando invocazioni di avvio sovrapposte.

La ricostruzione usa `--force` del Vite del progetto, non una cancellazione manuale di cartelle.
Il backend mantiene la normalizzazione Windows dei percorsi `\\?\`, il loader compatibile con
la versione Vite, HTTP readiness, timeout e arresto del solo processo gestito. L'errore mostra
azioni di recupero temporanee fuori dallo zoom del canvas: restano leggibili e con target touch
anche in finestre strette, senza toolbar permanente. Prova pannello resta
solo nel menu a comparsa.

Verifica: suite completa **68 file e 672 test verdi**, 1 scratch saltato; **22 test Rust verdi**,
inclusi percorsi Windows e flag force. Collaudo separato del generatore compilato: **1 test
production verde**. **Build TypeScript/Vite verde**. Verifica visiva con
scenario d'errore dichiarato nel browser: menu e log accessibili senza anteprima. Non equivale
a una prova end-to-end della finestra desktop. Il monitor dell'uscita di Vite dopo readiness
e' stato aggiunto al punto 70; le prove prolungate su progetti reali restano da completare.

### 69. Selezione stabile di targhette e pulsanti

Correzione del 1 ottobre 2026 nella cartella `Desktop/ModificaSitiReact`, confermata dall'utente
dopo lo spostamento del progetto. La riproduzione controllata del difetto aveva prodotto 39
messaggi di selezione e 25 letture native da due clic, con ritardi imposti alle letture e alle
risposte: le conferme dell'anteprima venivano interpretate come nuovi clic e riavviavano il ciclo.

Il ponte ora distingue clic e conferme con protocollo 2, `requestId` e `selectionVersion`.
Il canvas accetta soltanto la conferma corrente e non chiama `selectSource` dalle conferme.
Le letture vecchie e i loro errori non sostituiscono il componente scelto dopo; le copie dello
stesso JSX mantengono indice, stile e geometria della copia corretta.

Stile, testo, attributi, duplicazione, cancellazione e inserimento verificano documento e
selezione prima delle scritture. Un salvataggio gia' iniziato non pulisce la selezione o un nuovo
buffer dirty; annulla/ripristina non trasferiscono la vecchia cronologia in un altro progetto.
I comandi di gruppo interrompono il ciclo dopo un nuovo clic senza ripristinare metadati obsoleti.
Il buffer non salvato viene validato e salvato prima del cambio file; errori o codice non valido
lo conservano. Una rilettura per offset obsoleti non puo' sovrascriverlo.

Il debounce delle frecce viene annullato con rollback quando cambia componente, anche dai
Livelli, o si entra in Naviga. Il canvas ignora movimenti tardivi di un'altra sorgente, istanza
o versione. L'accesso utente conserva import Runtime e attributi anche quando il pulsante e'
nel file entry React. Grafica e posizione dei comandi non sono state modificate.

Verifica aggiornata: **72 file e 726 test verdi**, 1 scratch saltato; **build TypeScript/Vite
verde** e **1 test production del generatore standard verde**. Sono inclusi 15 test delle
letture/buffer, 19 delle mutazioni e dei gruppi, 12 del ponte reale e 7 del canvas con il ponte
reale e ritardi controllati. Il collaudo automatico non equivale a una prova end-to-end della
finestra desktop o di un HMI collegato alla macchina.

Lo spostamento ha fatto emergere una cache Cargo con permessi Tauri riferiti al vecchio percorso.
Sono stati rimossi solo gli artefatti rigenerabili di `tauri`, `tauri-plugin-dialog` e
`tauri-plugin-fs` (circa 324 MiB), senza modificare sorgenti o dati HMI. Il collaudo Rust offline
sul nuovo percorso e' completato: **22 test verdi**. La roadmap Unified/Optix/AI e i limiti di produzione
restano quelli elencati sotto, non vengono considerati completati da questa correzione.

### 70. Ciclo Vite sorvegliato e avvio interrompibile

Implementato il 1 ottobre 2026 nella cartella confermata `Desktop/ModificaSitiReact`, senza
delegare ad agenti. Ogni avvio possiede un `sessionId`; il canale Tauri per l'uscita e' pronto
prima del comando nativo. Se Vite muore dopo la readiness, anche prima della risposta di avvio,
l'editor rimuove l'iframe morto e mostra l'errore senza perdere documento, modifiche non salvate,
selezione, cronologia o route. Notifiche duplicate, log di sessioni vecchie e messaggi tardivi
di pagina pronta non cambiano il risultato. Il riavvio resta un'azione esplicita.

Il launcher usa Node con l'entry point Vite installato quando disponibile, conserva il fallback
del package manager e controlla il processo reale ogni 250 ms. Stop e sostituzione volontari
non generano un falso crash. L'avvio viene eseguito su un worker Tauri, senza occupare il thread
della finestra. I comandi Windows non richiedono una finestra console visibile.

**Interrompi avvio di Vite** compare nella schermata di caricamento; **Interrompi avvio** compare
solo durante l'operazione nel menu Visualizza. Nessuna toolbar permanente nuova. L'annullamento
restituisce il progetto gia' analizzato senza aspettare una risposta obsoleta. Una generazione
nativa invalida anche avvii non ancora pronti: non possono fermare il server successivo,
installarsi dopo la chiusura o concedere accessi tardivi ai sorgenti. La rianalisi della stessa
root conserva i permessi dei template collegati.

Nota successiva: i due comandi di interruzione sono stati rimossi dall'interfaccia su feedback
dell'utente; il punto 72 descrive la schermata attuale. Le protezioni interne rimangono.

Preparazione delle dipendenze cancellabile, probe del package manager limitato a 10 secondi e
scarico output limitato a 500 ms. App rilascia sottoscrizioni e timer anche dopo registrazioni
tardive o parzialmente fallite. Nessuna dipendenza o lockfile modificato in questa tranche.

Verifica finale: **75 file e 752 test verdi**, 1 file/test scratch saltato;
**build TypeScript/Vite verde**, **38 test Rust offline verdi** e
**1 test production del generatore standard verde**. I test includono sessioni obsolete,
cancellazione, uscita prima della risposta, callback del vero Channel Tauri e caricamento/menu.
Il test nativo avvia il **Vite installato realmente**, attende HTTP, forza la chiusura del
processo posseduto e verifica un nuovo avvio; gli altri test coprono stop volontario, sostituzione,
processi di preparazione cancellati e tutela dei permessi dopo chiusura. Nessun install di rete
o PLC reale usato per queste prove.

Limiti: il probe HTTP iniziale non certifica l'identita' del server su una porta contesa e non
esiste ancora un health check continuo del processo vivo ma bloccato. Non sono stati collaudati
la finestra desktop, il pacchetto installabile o CPU/TLS reali. Per caricare le modifiche native
avviare dalla cartella corrente con `npm run dev`; il solo reload del frontend o una vecchia
build installata non aggiorna il backend Rust. La parita' Unified/Optix/AI resta da completare.

### 71. Variabili condivise e contesti script persistenti

Implementato il 1 ottobre 2026 nella cartella confermata `Desktop/ModificaSitiReact`, senza
agenti. Il catalogo script mantiene la versione 1 e aggiunge definizioni globali opzionali:
`globalDefinition` per moduli e contesti locali, `schedulerDefinition` per le operazioni
pianificate. Il pannello Moduli JavaScript consente di modificarle in sezioni espandibili,
con etichette, spiegazione della durata, errori vicini al campo e salvataggio bloccato quando
la definizione non e' valida. Nessuna nuova toolbar permanente o dipendenza dall'AI.

Ogni pagina possiede due contesti indipendenti, eventi e dinamizzazioni; i moduli globali hanno
copie separate in ciascun contesto. Tutte le operazioni dello Scheduler condividono invece
un contesto distinto. Le definizioni sono inizializzate una volta al caricamento del contesto,
anche leggendo i tag correnti. I valori persistono fra le chiamate, non fra caricamenti della
pagina o riavvii del Runtime. Parametri e variabili locali non sovrascrivono omonimi globali;
`const` non e' riassegnabile. Un errore di inizializzazione rimane visibile e impedisce le
azioni dipendenti, senza tentativi operativi automatici.

Le definizioni accettano soltanto dichiarazioni supportate dall'IR: non comandi PLC, timer o
chiamate operative. Il salvataggio ricompila il sorgente e non si fida dell'IR fornita nel JSON.
Lo stato in memoria non viene salvato nel progetto. Le funzioni `Modules` e `Local` conservano
il contesto della propria definizione, non ereditano le variabili private del chiamante.

I callback inline dei timer catturano per riferimento le variabili della chiamata che li crea;
le dichiarazioni interne al callback sono nuove a ogni esecuzione. Cambio pagina, sostituzione
del catalogo e stop invalidano i contesti scaduti e i relativi timer. Nel Runtime generato,
`Unloaded` usa ancora il vecchio contesto durante il cambio pagina: il rilascio differito non
puo' invalidare un nuovo caricamento della stessa route. Dopo lo stop non vengono applicate
azioni rimaste in coda.

Editor, simulazione e pipeline **Crea nuovo pannello standard** usano lo stesso gestore.
Il Runtime autonomo include definizioni e interprete IR, non parser o `eval`. In assenza di
trigger manuali le dinamizzazioni ricavano le dipendenze dai tag anche attraverso definizioni
globali e funzioni dei moduli; l'analisi include entrambi i rami di un `if`, anche con `return`.

Verifica finale: **76 file e 778 test verdi**, 1 file/test scratch saltato;
**build TypeScript/Vite verde** e **1 test production del generatore standard verde**.
Sono inclusi 19 test dedicati ai contesti, prove dei campi/salvataggi e del vero Runtime
generato: isolamento, inizializzazione, costanti, cattura dei timer, dipendenze automatiche,
cambio pagina e stop. Il generatore compilato in produzione verifica anche persistenza e
separazione degli scope. Nessuna dipendenza o lockfile modificato; il backend Rust non e'
stato modificato o ricollaudato in questa tranche.

`WCU-EVT-05/07` restano **PARZIALE**: mancano inizializzatori complessi, variabili pubbliche
esportate dai namespace, closure JavaScript generiche, scoping di blocco/hoisting completo,
moduli di libreria/versionati e il collegamento al motore allarmi reale. Restano separati i
contesti faceplate per istanza e l'integrazione asincrona con driver reali. Queste prove non
certificano finestra desktop, pacchetto installabile, PLC/TLS o rilascio industriale.

### 72. Avvio dell'anteprima semplificato

Modifica del 1 ottobre 2026 richiesta dall'utente, senza agenti. Rimossi **Interrompi avvio di
Vite** dalla schermata di caricamento e **Interrompi avvio** dal menu Visualizza. Il caricamento
mostra **Avvio dell'anteprima...**, avanzamento e output reale, senza pulsanti tecnici superflui.
Log di avvio e recupero dell'anteprima restano disponibili nei menu esistenti.

Cambiano soltanto interfaccia e relativi test: le routine dello store e del backend per
annullamento, stop, chiusura/cambio progetto, timeout e isolamento delle sessioni non sono state
rimosse o modificate. Nessuna dipendenza, lockfile, toolbar nuova o modifica del Runtime HMI.

Verifica: **4 file e 32 test mirati verdi**, comprendenti schermata di caricamento, menu nei
tre stati pronto/apertura/riavvio, log accessibili e ciclo dell'anteprima; **build TypeScript/Vite
verde**. La suite completa, il generatore production e Rust non sono stati ripetuti per questa
modifica limitata al frontend; i risultati dei punti 70 e 71 restano verifiche storiche.
La documentazione dell'architettura e' aggiornata alla nuova interfaccia. Non e' stato eseguito
un collaudo manuale della finestra desktop.

### 73. Editor unico senza selettore semplice/completa

Modifica del 1 ottobre 2026 richiesta dall'utente, senza agenti. Rimossi dal menu Visualizza
il selettore **Modalità semplice / Modalità completa**, i blocchi delle viste Codice/Affiancati
e il ritorno automatico da Codice a Disegno associato alla vecchia preferenza semplice.
I comandi globali, incluso **Prova pannello**, restano nelle tendine della barra superiore;
non sono state aggiunte toolbar permanenti.

La scheda dell'elemento e' unica: posizione/dimensioni e aspetto sono aperti, mentre attributi,
posizione CSS, vincoli dimensionali, effetti, layout, font e informazioni sono espandibili.
I campi comuni duplicati sono stati accorpati. Restano accessibili il codice dell'elemento,
le sorgenti delle dinamizzazioni non cromatiche, i dettagli tecnici delle azioni e il tracciato
SVG preciso. La selezione multipla offre font e proprieta' avanzate senza cambio di profilo.
Blocchi per sorgenti non modificabili e limiti delle capacita' dell'elemento restano invariati.

La preferenza legacy `inspectorMode` e' conservata nello store per compatibilita', ma nessun
componente dell'interfaccia la consulta: non limita piu' le funzioni. Lo store, il backend,
la gestione del progetto e il Runtime HMI non sono stati modificati. Nessuna dipendenza o
lockfile cambiato e nessun riavvio dell'anteprima richiesto da questa tranche.

Verifica: i **4 nuovi casi di regressione** fallivano prima della modifica; dopo la modifica
**2 file e 22 test mirati verdi**, **76 file e 783 test della suite completa verdi**, con
1 file/test scratch saltato, e **build TypeScript/Vite verde**. Le prove coprono anche le
vecchie preferenze semplice/completa, la conservazione della vista Codice, l'accesso alle
viste e alle sezioni tecniche, senza alterare documento, selezione o modifiche non salvate.
Il generatore production, Rust e la finestra desktop non sono stati ricollaudati per questa
modifica dell'interfaccia. Gli avvisi preesistenti di import misti della build restano.

La skill UI/UX ha guidato la separazione tra controlli comuni immediati e dettagli espandibili;
la documentazione dell'architettura e' aggiornata. Il ritorno alla schermata iniziale segnalato
durante gli aggiornamenti resta un problema distinto: questa modifica non lo riproduce o risolve.

### 74. Variabili pubbliche dei moduli JavaScript

Tranche del 1 ottobre 2026 sulla roadmap WinCC, senza agenti. I moduli globali ammettono
`export let/const/var` ed export nominati con alias. Gli script leggono i binding live con
`Modules.Alias.nome`; le scritture al namespace importato sono rifiutate e le variabili
senza export restano private. Una funzione proprietaria puo' aggiornare le proprie variabili
mutabili; le costanti restano protette. La sola lettura riguarda il binding, non congela le
API di un Tag/TagSet esportato e non sostituisce le autorizzazioni del driver.

Il catalogo versione 1 salva la mappa opzionale degli export nella IR ricompilata dal sorgente,
non i valori Runtime. Compatibilita' dei cataloghi precedenti mantenuta. Moduli senza funzioni,
inizializzazioni tra moduli, errori permanenti di inizializzazione e cicli sono gestiti dal
medesimo interprete dell'editor e del Runtime esportato, senza eval o parser nel pannello.
Contesti di pagina, eventi e dinamizzazioni restano separati; lo Scheduler conserva il proprio
contesto condiviso. Rilascio della pagina e cambio catalogo invalidano i contesti scaduti.

Collegato l'intero percorso: pannello Moduli JavaScript, validazione, Inspector di eventi e
dinamizzazioni, prova locale, timer, Scheduler e pipeline Crea nuovo pannello standard.
Le dipendenze tag sono ricavate anche da riferimenti pubblici, alias privati e inizializzatori
fra moduli, comprese le funzioni e i callback dei timer: il Runtime si aggiorna senza dover
aggiungere trigger manuali quando i tag possono essere identificati staticamente.

Completato anche l'elenco dei valori di prova PLC: la stessa ispezione collegata al catalogo
trova letture e scritture di eventi/dinamizzazioni, inizializzatori della pagina e Scheduler
abilitato, senza inventare segnali per variabili private o task disabilitati. La validazione
del catalogo ricontrolla tag di inizializzazione e funzioni che leggono export di altri moduli,
non soltanto i metadati locali di prima della risoluzione delle dipendenze. I tre nuovi casi
di regressione di questo percorso fallivano prima del completamento.

La skill UI/UX ha guidato l'elenco derivato dei soli export effettivi, le indicazioni
costante/variabile e nome interno degli alias, la guida in sola lettura e le etichette accessibili
nel dettaglio espandibile. Nessun selettore semplice/completa o toolbar permanente reintrodotto.
La skill di documentazione ha mantenuto allineate architettura e checklist WinCC alle capacita'
effettive. Riferimenti: moduli/contesti Unified V21 e Tips Scripting Siemens, collegati in
`ARCHITETTURA-HMI.md`. Nessuna dipendenza, lockfile, store o backend nativo modificato in questa
tranche; nessun riavvio dell'anteprima eseguito.

Verifiche: i primi casi export/lettura e il caso di dipendenze attraverso inizializzatori di
moduli fallivano prima dell'implementazione. Dopo la modifica: **20 test dedicati agli export**,
**77 file e 811 test della suite frontend verdi**, con
1 file/test scratch saltato; **1 test separato del generatore production verde**, che esegue
gli helper generati dal generatore compilato; **build TypeScript/Vite verde**. Coperti persistenza,
alias, privacy, costanti, letture live, isolamento, reset, errori, eventi sync/async, anteprima,
tag trigger nel Runtime DOM e serializzazione degli helper dopo bundling. Restano gli avvisi
preesistenti della build sugli import misti e l'avviso Node su localStorage dei test.

Una esecuzione con build/generatore concorrenti ha superato il limite di 5 secondi nel test
che genera tutte le 87 pagine standard. La suite completa ripetuta senza build concorrenti
ha passato anche quel test: nessun timeout o controllo dei test e' stato allargato o rimosso.

Ripetuto il gate licenze **offline**: 255 pacchetti npm (44 nello scope MQTT Runtime), nessuna
dipendenza mancante, inventario Cargo host completato con 266 pacchetti. Richiedono revisione
1 licenza npm e 41 voci Cargo; il comando termina con exit 1 e `releaseApproved: false`, come
previsto dalla politica prudenziale. Non e' una nuova scansione vulnerabilita' o un via libera
legale. Nessun collaudo manuale della finestra desktop o collegamento OPC UA/MQTT a PLC reale
eseguito, e nessuna nuova suite Rust eseguita per questa modifica JavaScript.

`WCU-EVT-05` rimane **PARZIALE**: restano inizializzatori/valori complessi, closure/scoping
JavaScript completi e moduli di libreria/versionati. Restano anche i contesti faceplate per
istanza e lo Scheduler/trasporto industriale; l'AI facoltativa e Optix seguono le rispettive
roadmap. Il ritorno spontaneo alla schermata iniziale durante gli aggiornamenti resta distinto,
non risolto da questa tranche.

### 75. Rimozione definitiva delle vecchie modalità dell'editor

Modifica del 1 ottobre 2026 richiesta dall'utente, senza agenti. Completata la rimozione
del selettore semplice/completa del punto 73: eliminati anche `InspectorMode`, lo stato
`inspectorMode`, il comando `setInspectorMode` e gli stili inutilizzati del selettore.
Le disposizioni Disegno/PLC/Sviluppo cambiano soltanto larghezze e pannello laterale, senza
profili di funzioni. Tutte le viste e le proprietà restano disponibili nell'editor unico.

Le preferenze salvate dalle versioni precedenti vengono lette ignorando il vecchio campo;
il successivo salvataggio delle preferenze lo elimina senza perdere le altre impostazioni.
La skill UI/UX ha guidato la conservazione dei dettagli espandibili e dei comandi nelle
tendine esistenti; la skill di documentazione mantiene allineata l'architettura.

Verifica: i 5 nuovi casi di migrazione/disposizione fallivano prima della rimozione;
dopo la modifica **7 file e 74 test mirati verdi**, inclusi barra, Inspector, preferenze,
cronologia e ciclo di progetto/anteprima. Nessun riferimento alle vecchie modalità rimane
nel codice applicativo. La build completa, eseguita prima e dopo, resta bloccata dagli stessi
3 errori TypeScript preesistenti nella tranche sui dati strutturati degli script:
`hmiScript.ts` (argomenti strutturati/parametri scalari) e `hmi-script-data.test.ts`
(uso non corretto dell'API timer). Non modificati da questa richiesta.

Nessuna nuova dipendenza, modifica del backend o riavvio di Vite; suite completa,
generatore production e finestra desktop non ricollaudati per questa pulizia.
Il ritorno alla schermata iniziale durante gli aggiornamenti resta un problema distinto.

### 76. Array, oggetti e JSON negli script HMI

Tranche completata il 2 ottobre 2026, senza agenti. La IR e il Runtime supportano dati annidati,
membri con chiavi calcolate, modifica per riferimento, identità degli oggetti e copie superficiali.
Gli stessi dati funzionano nelle definizioni globali, nelle funzioni, nello Scheduler e nei timer
inline. `const` protegge il binding; un oggetto esportato mantiene membri modificabili nel suo
contesto, senza esporre variabili private o condividere automaticamente stato fra pagine.

Disponibili 13 metodi Array (`push`, `pop`, `shift`, `unshift`, `indexOf`, `lastIndexOf`, `includes`,
`slice`, `join`, `toString`, `reverse`, `sort`, `splice`), `JSON.parse`/`JSON.stringify` e
`Object.keys`/`Object.values`/`Object.entries`. Il risultato verso una proprietà o un tag PLC
resta scalare: selezionare un membro oppure serializzare dati puri. I riferimenti Runtime non
vengono convertiti in JSON. Moduli JavaScript conserva la guida contestuale nei dettagli
espandibili esistenti; non sono stati aggiunti selettori di modalità o toolbar permanenti.

I controlli impediscono cicli, numeri non finiti nei dati, prototipi, getter/setter e API host.
Raccolte fino a 1024 elementi/proprietà, chiavi fino a 128 caratteri, scansioni e conversioni
fino a 32 livelli e testo/JSON fino a 20000 caratteri; restano budget operazioni/tempo. Anche
chiavi calcolate e JSON vengono controllati. Gli inizializzatori restano dichiarativi:
mutazioni e azioni operative vanno nei corpi funzione o nello script Update.

Riprodotti e corretti **16 casi di dipendenze mancanti**: aggiunte/riordino degli array,
alias, copie, array condizionali e Add a TagSet selezionati tramite indice dinamico. L'ispezione
usa copie simboliche e include conservativamente i tag candidati senza alterare la IR originale
o inventare tag dai normali testi di configurazione. La prima ispezione e quelle successive sono
verificate. Liste variabili, controllo del pannello e dinamizzazioni leggono lo stesso modello.
Allineato anche `splice()` senza argomenti, che restituisce una raccolta vuota senza modificare
l'array. Riferimenti: [array nei Tips Scripting Siemens](https://support.industry.siemens.com/cs/attachments/109758536/109758536_Unified_TipsScripting_V30_en.pdf)
e [semantica splice MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice).
Per Siemens sono state verificate le sezioni indicizzate sugli array; l'apertura diretta del PDF
non ha restituito contenuti, quindi non viene presentato come rilettura integrale del manuale.

Verifica sullo stato finale:

- `npm test -- --maxWorkers=2 --reporter=dot`: **79 file, 878 test verdi**, più il caso scratch
  già disabilitato. Include dati strutturati, isolamento moduli, timer, salvataggio/guida,
  dipendenze nella lista PLC, diagnostica dei tag mancanti e aggiornamento DOM delle dinamiche.
- `npm run test:production -- --maxWorkers=1 --reporter=dot`: **1 test verde**. Compila realmente
  il generatore dello standard e carica i moduli che produce; verifica oggetti/JSON, parametri e
  risultati per riferimento, contesti isolati, array modificati e TagSet con selezione dinamica.
- `npm run build`: **riuscita**, TypeScript e Vite. Risolti gli errori temporanei della tranche
  sui tipi degli argomenti strutturati e sull'API timer ricordati al punto 75; rimangono gli
  avvisi di import statici/dinamici, non errori di compilazione.
- `npm run check:licenses`: inventario offline aggiornato, **255 npm** (44 nello scope MQTT),
  **266 Cargo**, nessuna dipendenza npm mancante, 1 voce npm e 41 Cargo da esaminare.
  Codice 1 previsto dal gate e `releaseApproved: false`, non approvazione legale.

Nessuna nuova dipendenza, modifica del driver/backend, asset aggiunto o riavvio di Vite. Non
collaudati in questa tranche finestra desktop, CPU reali/TLS o packaging industriale; gli
aggiornamenti sorgente possono comunque attivare HMR. Il ritorno alla schermata iniziale
durante gli aggiornamenti dell'editor resta distinto e non è dichiarato risolto.

`WCU-EVT-05/07` e la fase script rimangono **PARZIALE**: JavaScript completo, funzioni come
valori, classi/spread, closure/scoping, analisi di flusso intermodulo completa e librerie
versionate richiedono altro lavoro. Undefined/sparse array conservano il limite della IR
precedente (slot estesi con null); i nomi derivati da JSON/PLC richiedono trigger espliciti.
Questi dati non implementano array/struct/UDT sul trasporto PLC (`WCU-TAG-04`). La roadmap
Optix e l'AI facoltativa restano nello stesso obiettivo, senza cambiare la destinazione React
autonoma o richiedere un Runtime vendor.

### 77. Conservazione del progetto durante gli aggiornamenti dell'editor

Tranche del 2 ottobre 2026, senza agenti. Riprodotta la perdita dello store alla rivalutazione
del modulo realmente compilato: non serve una chiusura esplicita del progetto per mostrare
Welcome, basta perdere `project`. I primi test fallivano prima della conservazione dello store.
L'incidente nella finestra dell'utente non è stato riprodotto manualmente; il risultato copre
HMR e reload del frontend durante lo sviluppo, non ogni possibile ritorno alla schermata iniziale.

Lo store Zustand e i contatori delle operazioni restano in `import.meta.hot.data`; le azioni
vengono aggiornate senza perdere progetto, buffer, cronologia o sottoscrizioni. Non si usa
self-accept per nascondere aggiornamenti degli import. Le letture tardive dei cataloghi e dei
file esterni non sovrascrivono un progetto/documento successivo.

Prima di un full reload viene conservato in `sessionStorage` un checkpoint esplicito: copia
di lavoro, testo/versione del documento, dirty, cronologia, pagine, route e vista. Non contiene
AST, azioni, URL/sessione dell'anteprima, permessi nativi, valori simulati o configurazione
delle credenziali. La validità automatica è limitata a 10 minuti; una bozza scaduta resta
consultabile, ma non viene riaperta automaticamente.

Il nuovo comando nativo `get_editor_session` legge la sessione effettiva su worker: progetto,
root già autorizzate, generazione e processo posseduto ancora vivo. Non apre cartelle, concede
permessi, avvia watcher o riavvia Vite. Il recupero verifica due volte sessione e percorsi,
riparsa il sorgente dirty e rilegge quello pulito da disco; una bozza non parsabile resta in
vista codice. Il frontend riparte in Modifica, con simulazione disattivata, senza salvare file
o ripetere comandi PLC. Le notifiche globali `preview-exit` mantengono il monitor anche dopo
il reload; uscite tardive/duplicate e l'uscita durante la query non ripristinano URL terminate.

Una schermata temporanea mostra lo stato e la bozza in sola lettura, con Riprova e ritorno
esplicito ai progetti. Quest'ultimo può annullare anche una query lenta; la risposta successiva
non ripristina il progetto e lo scarto dirty richiede conferma. La skill UI/UX ha guidato
etichette accessibili, dettagli espandibili, testo copiabile e pulsanti da almeno 44 px:
nessun selettore semplice/completa o toolbar permanente reintrodotto.

Se il checkpoint non può essere scritto, il listener sincrono ferma il full reload del client
Vite **7.3.6 installato**, verificato eseguendone il notifier reale nel test; il fallback
beforeunload richiede conferma. Le guardie restano durante una sostituzione di modulo fallita
e vengono rilasciate al nuovo caricamento/prune. Il prompt della finestra desktop non è stato
collaudato manualmente. Corretto anche l'ultimo errore di configurazione utenti che suggeriva
la vecchia modalità Completa: ora indica il vero file di ingresso React mancante.

Verifica sullo stato finale:

- Suite frontend: **80 file, 895 test verdi**, più il file/test scratch già disabilitato.
- `npm run test:recovery -- --reporter=dot`: **15 test verdi** sullo store realmente compilato,
  rivalutato con HMR/reload; inclusi sessione chiusa/cambiata, permessi, quote storage,
  listener, bozza invalida, uscita dell'anteprima e annullamento di una query pendente.
- Cargo offline: **41 test nativi verdi**, inclusi 3 casi nuovi della query in sola lettura
  e la fixture che avvia il Vite realmente installato in un progetto temporaneo di test.
- Generatore production separato: **1 test verde**; build TypeScript/Vite **riuscita**.
  Restano gli avvisi sugli import misti, non errori di compilazione.
- Gate licenze offline: **255 npm**, 44 nello scope MQTT, **266 Cargo**, nessuna dipendenza npm
  mancante; 1 voce npm e 41 Cargo da esaminare. Exit 1 e `releaseApproved: false` previsti,
  senza nuova scansione vulnerabilità o approvazione legale.

Riferimenti: [API HMR Vite](https://vite.dev/guide/api-hmr) e
[durata di sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).
Le guardie di checkpoint sono attive nel contesto di sviluppo Vite (`import.meta.hot`): non
sono un backup persistente di produzione. Serve il backend aggiornato per la nuova query;
un backend precedente mostra l'errore conservando la bozza, senza riaprire o autorizzare cartelle.
Il riavvio completo del processo/finestra desktop, possibile anche durante modifiche Rust in
sviluppo, può perdere sessionStorage e resta da coprire con un recupero persistente.

Nessuna nuova dipendenza o asset; nessun riavvio esplicito dell'app/anteprima dell'utente o
scrittura ai suoi progetti eseguito. Le modifiche sorgente possono comunque attivare i watcher.
Non collaudati finestra desktop reale, CPU/TLS o packaging industriale. La parità WinCC/Optix
e l'AI facoltativa restano obiettivi attivi, non conclusi da questa tranche di affidabilità.

### 78. Backup locale delle bozze e recupero dopo riavvio/crash

Tranche del 2 ottobre 2026, senza agenti. Aggiunto un deposito nativo locale separato dai sorgenti,
attivo anche senza HMR e senza sessionStorage. Il controller osserva documento, dirty,
cronologia, pagine e route: accorpa le modifiche con debounce di 500 ms e avvia il backup
entro 3 secondi anche durante digitazione continua. Le richieste sono serializzate e una
revisione nuova segue quella già in corso, senza riordinare le risposte.

Le copie si trovano in `app_local_data_dir()/editor-drafts`, su Windows normalmente
`%LOCALAPPDATA%/com.framecraft.editor/editor-drafts`. Ogni esecuzione nativa usa un identificativo
distinto: altre copie non vengono sovrascritte da una nuova esecuzione. La scrittura usa un
file temporaneo, sync dei dati e sostituzione atomica. La prima copia di un documento conserva
anche il testo su disco da confrontare al recupero; mentre rimane dirty quella base non viene
aggiornata silenziosamente. La lettura iniziale non apre cartelle, avvia watcher/server o concede
permessi. Offre la copia più recente e conserva le altre; la gestione grafica di più copie
e la retention restano da completare.

I comandi `read_editor_draft`, `write_editor_draft` e `clear_editor_draft` lavorano su worker.
Il backend valida schema, versione, progetto aperto e percorsi già autorizzati; rigetta campi
sconosciuti, nomi arbitrari per lo scarto, revisioni obsolete e copie oltre 16 MiB. Limiti:
1000 snapshot totali di cronologia/ripristino, 5000 pagine e 200 file di bozza in lettura.
Una copia corrotta o un aggiornamento troppo grande non sovrascrivono quella precedente.
Il controllo root/generazione e il lock dello scarto impediscono pubblicazioni tardive della
sessione chiusa. Lo scarto di una copia selezionata richiede la stessa revisione letta.

Al riavvio, **Riapri questa copia e recupera** è una scelta esplicita con percorso e data visibili.
Riapre la root salvata tramite l'analisi ordinaria, non crea copie nuove o avvia l'anteprima.
Il recupero continua a verificare la sessione e i percorsi sul backend; permessi e URL non
arrivano dal checkpoint. Un file esterno non più autorizzato resta consultabile nella bozza,
ma non viene letto, concesso o recuperato forzatamente. Il pannello riparte in Modifica con
simulazione spenta, senza scritture di sorgenti o replay di comandi PLC.

Se il file dirty su disco differisce dalla base conservata, la schermata mostra entrambe le
versioni in textarea di sola lettura: **Usa la bozza nell'editor** oppure **Usa il file da disco**.
Una nuova modifica rilevata durante la scelta richiede un altro confronto. La scelta del
disco lascia dirty spento e scarta la vecchia cronologia; nessun pulsante salva automaticamente
i sorgenti. Dopo il recupero viene prima conservata la nuova copia, poi consumata la vecchia;
se il deposito fallisce, la copia precedente resta disponibile. Un record della stessa
esecuzione non viene cancellato dopo essere stato appena aggiornato.

La skill UI/UX ha guidato la schermata temporanea, i percorsi leggibili, il confronto accessibile,
le azioni touch e l'avviso di errore del backup con retry, presente solo durante l'errore.
Nessun selettore di modalità, nuova toolbar permanente o passaggio AI obbligatorio. La skill
di documentazione mantiene separati i contratti implementati dalle prove ancora da eseguire.

Verifiche sullo stato finale:

- **81 file, 912 test frontend verdi**, più il file/test scratch preesistente disabilitato;
  include 15 nuovi casi del deposito e 2 casi dell'interfaccia, StrictMode, richieste lente,
  digitazione continua, scarto fallito, permessi, conflitti e riapertura successiva.
- **16 test di recupero del bundle compilato verdi**, incluso il codice senza `import.meta.hot`,
  con memoria della finestra svuotata e sessione nativa nuova; nessuna chiamata di avvio/stop
  anteprima, scrittura sorgente o nuova copia di lavoro nel recupero.
- **50 test nativi offline verdi**. La nuova prova multiprocesso termina davvero il processo
  scrittore dopo un backup completo, avvia un processo lettore distinto e verifica testo della
  bozza e sorgente originale invariato. Non equivale a un collaudo del WebView desktop.
- **Build TypeScript/Vite riuscita** e **1 test del generatore production verde**, eseguito
  separatamente. Rimangono gli avvisi sugli import misti e quello Node di localStorage nei test.
- Gate licenze offline invariato: **255 npm**, 44 nello scope MQTT, **266 Cargo**, nessuna
  dipendenza npm mancante; 1 voce npm e 41 Cargo da rivedere, exit 1 previsto e
  `releaseApproved: false`. Nessuna nuova dipendenza/asset o scansione vulnerabilità online.

Nell'app realmente in esecuzione, una verifica in sola lettura ha trovato nel deposito locale
**1 file, 149604 byte**, aggiornato il 2 ottobre alle 15:31. Letti solo metadati, non il contenuto
dei sorgenti. Questo conferma la presenza del deposito, non riproduce l'incidente originale né
prova l'intero recupero nella finestra. Nessun comando esplicito di riavvio dell'app/anteprima o
scrittura dei progetti dell'utente eseguito; i watcher di sviluppo possono comunque riavviare
il processo nativo quando cambia Rust.

Limiti dichiarati: il backup periodico non garantisce gli ultimi caratteri prima di un crash;
lo scarico beforeunload è best-effort. Non protegge da guasti disco, perdita del profilo utente
o interruzione di alimentazione, e non implementa un CAS generale dei salvataggi sorgente.
Le copie sono testo locale non cifrato: pur escludendo AST, valori PLC, autorizzazioni e
configurazione account, i sorgenti stessi possono contenere segreti inseriti dall'autore.
Servono collaudo GUI/packaging, flush verificato alla chiusura desktop, gestione/retention delle
copie e autorizzazione guidata dei file esterni. Non è ancora un rilascio industriale approvato.

Riferimenti primari: [directory locali Tauri](https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html#method.app_local_data_dir)
e [persist atomico tempfile](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html#method.persist).
WinCC, Optix, OPC UA/MQTT e AI facoltativa mantengono l'intera roadmap, senza cambiare la
destinazione HMI React autonoma.

### 79. PropertyFlashing Unified negli script — verifiche chiuse il 5 ottobre 2026

Il lampeggio dichiarativo del punto 56 ora ha anche una prima API script reale:
`item`/`Screen`, `Screen.Items(nome)`, `UI.ActiveScreen.Items(nome)`,
`HMIRuntime.UI.ActiveScreen.Items(nome)` e `Faceplate.Items(nome)` restituiscono riferimenti
opachi, non oggetti DOM. `PropertyFlashing` opera su **BackColor, ForeColor e BorderColor**,
con due colori RGB/ARGB e rate Slow/Medium/Fast. Se omessi, i colori vengono dalla
configurazione o dall'ultimo comando; il rate predefinito è Medium. Se non ci sono due colori,
la chiamata restituisce false e mostra una diagnosi: non viene inventata una coppia.

Gli helper condivisi in `scripts/hmi-property-flashing.mjs` sono usati dal ponte dell'anteprima
e dal Runtime inserito nella pipeline **Crea nuovo pannello standard**. La stessa IR funziona
negli eventi, nelle dinamizzazioni, nelle funzioni di modulo e nei callback dei timer. Fermare
una proprietà prevale sulla sua regola dichiarativa, senza fermare le altre. Colori base,
animazioni preesistenti e fallback CSS per riduzione movimento restano conservati.

L'Inspector permette di salvare **Nome oggetto per gli script** in `data-hmi-name`, distinto da
id HTML, testo e tag PLC, e offre un aiuto espandibile con esempi di avvio/stop. Lookup esatto
per nome, diagnosi per duplicati/oggetti assenti, isolamento fra istanze faceplate e invalidazione
dei contesti al reset impediscono di colpire un altro oggetto. Gli eventi del ponte inviano
l'elenco aggiornato anche per faceplate aggiunti dopo ready; il contesto viene catturato prima
di accodare l'evento. La nuova prova di questo caso era rossa prima della correzione.

Nuovi casi: 16 sul nucleo PropertyFlashing, 2 sul ponte reale/Canvas, 1 sul Runtime generato e
1 sulla persistenza AST del nome. Il test separato del generatore production esegue l'API dopo
il bundling, non controlla soltanto che il testo sia presente. Nessun eval, accesso host o
nuova scrittura PLC. `WCU-DYN-07` resta **PARZIALE**: mancano altre proprietà colore specifiche
dei controlli e l'object model completo; l'audit generale di accessibilità è ancora aperto.

Riferimenti: [IOField.PropertyFlashing V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/iofield-rt-unified/iofield.propertyflashing-rt-unified?contentId=eQl1SYc_5BFyg4RZkiutzQ)
e [Button.PropertyFlashing V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.propertyflashing-rt-unified?contentId=qA9rT7zn1t4O5z3dQMlv3Q).

### 80. Ritorno evidente dal codice alla grafica

In **Codice** e **Affiancati**, la barra superiore ora mostra **Torna alla grafica**. È un
comando contestuale fuori dalla tendina e scompare in Disegno; Prova pannello resta soltanto
nel menu a comparsa. La skill UI ha guidato testo esplicito, area minima di 44 px, focus visibile
e riuso dello stile esistente, senza aggiungere una toolbar al canvas.

Un click chiude il menu e cambia soltanto `viewMode`: nessun salvataggio, chiusura progetto o
riavvio di Vite. Quattro nuovi casi verificano le due viste, assenza nella grafica e nessun
documento aperto, conservando buffer dirty, documento, selezione, cronologia e ripristino.
Il codice non salvato rimane nell'editor; l'anteprima da disco non promette di mostrarlo prima
del salvataggio. Il collaudo visuale nella finestra desktop reale resta da eseguire.

### 81. Percorsi delle risorse del plugin nel pacchetto desktop

Il resolver reale di Tauri ha riprodotto una discrepanza: l'elenco `../scripts/...` produce
destinazioni `_up_/scripts/...`, mentre il backend cerca `scripts/framecraft-vite-plugin.mjs`.
Ora una mappa esplicita conserva plugin, snap, picking e helper PropertyFlashing nella stessa
cartella `scripts`. Il percorso condiviso dal backend e dal test evita due contratti divergenti.
La skill di debugging ha guidato riproduzione rossa, correzione e regressione con
`tauri::utils::resources::ResourcePaths`, senza reimplementare il resolver.

`tauri-build` ha copiato davvero i quattro file in `target/debug/scripts`: le quattro SHA256
corrispondono ai sorgenti. Questo prova percorsi e contenuto, **non l'installer production
completo**. Serve collaudo su macchina senza repository, inclusa la disponibilità di Node e la
risoluzione/distribuzione delle dipendenze bare del plugin (`@babel/core`, `@babel/types`).
Il fallback development usa ancora il checkout quando esiste e non certifica quel caso.

Verifiche finali del 5 ottobre 2026 per i punti 79-81:

- **82 file, 936 test frontend verdi**, più il file/test scratch preesistente disabilitato.
- **16 test di recupero del bundle compilato verdi** e **51 test nativi offline verdi**,
  inclusa la nuova regressione dei percorsi delle risorse.
- **Build TypeScript/Vite riuscita**; **1 test del generatore production verde**, eseguito
  separatamente. Restano gli avvisi preesistenti su import misti e localStorage Node nei test.
- Gate licenze offline: **255 npm**, 44 nello scope MQTT, **266 Cargo**, nessuna dipendenza
  npm obbligatoria mancante; 1 voce npm e 41 Cargo da rivedere. Exit 1 previsto,
  `releaseApproved: false`. Nessuna nuova dipendenza/asset o scansione vulnerabilità online.
- `git diff --check` pulito. Nessun riavvio esplicito dell'app/anteprima dell'utente; le modifiche
  Rust/config possono provocare una ricarica tramite i watcher di sviluppo.

Riferimento packaging: [risorse e mappa destinazioni Tauri](https://v2.tauri.app/develop/resources/).
Optix, collegamento OPC UA/MQTT, AI facoltativa e gate industriali mantengono l'intero perimetro:
queste tranche non equivalgono alla parità delle piattaforme o a una release approvata.

### 82. Proprietà grafiche leggibili e scrivibili negli script Unified

Tranche del 5 ottobre 2026, senza agenti. Il modello oggetti condiviso ora esegue davvero
get/set dalla IR: `item`, `Screen`, `Screen.Items(nome)`, `UI.ActiveScreen.Items(nome)`,
`HMIRuntime.UI.ActiveScreen.Items(nome)` e `Faceplate.Items(nome)`, anche tramite alias,
funzioni di modulo e callback timer. Lookup per nome esatto e istanza faceplate, riferimenti
rimossi/contesti scaduti rifiutati; nessun oggetto DOM viene esposto agli script.

Proprietà comuni:

- `Name`: stringa in sola lettura nel Runtime; il nome si cambia nell'Inspector.
- `Left`/`Top`: Int32; `Width`/`Height`: UInt32 nel contratto Framecraft, coordinate locali
  non moltiplicate per lo zoom dell'editor. Gli oggetti statici diventano posizionabili.
- `Visible`/`Enabled`: Boolean reali, non stringhe o 0/1. Disabilitazione effettiva per mouse,
  tastiera, discendenti ed eventi custom, anche per lo stato dichiarativo. In modifica non
  viene bloccata la selezione del designer.
- `BackColor`/`ForeColor`/`BorderColor`: UInt32 ARGB, utilizzabili con `HMIRuntime.Math.RGB`.
  Il colore CSS di sistema non risolvibile genera una diagnostica in lettura, non un colore
  inventato; è comunque possibile assegnare un colore RGB esplicito.
- `Text`: stringa fino a 20000 caratteri quando il testo è univoco. Aggiorna nodi testuali,
  anche nella label annidata, senza sostituire icone/nodi/listener né interpretare HTML.
  Contenuti ambigui e campi input non espongono questa scorciatoia.

Gli override grafici sono temporanei, con lettura immediata delle proprie scritture anche
prima della risposta del ponte. La sospensione/ripresa annidabile preserva la nuova base
prodotta da dinamiche e traduzioni, le priorità CSS e gli stili estranei; lo stop della prova,
il cambio pagina e la disposal ripristinano proprietà, attributi e testo. Il lampeggio resta
un layer separato. Nessuna scrittura PLC viene introdotta; `ProcessValue` non è simulato
come assegnazione grafica. Catture/letture HMI non sono ammesse negli inizializzatori globali.

La regressione preesistente della simulazione ha riprodotto il doppio aggiornamento causato
dagli snapshot estesi: i valori grafici entravano nella firma della configurazione e
riattivavano le dinamiche. Ora `framecraft:screen-items` aggiorna solo gli snapshot; un cambio
di proprietà non richiede un nuovo calcolo degli script. Il test col ponte e Canvas reali
verifica uno script che incrementa la geometria e una mutazione DOM successiva senza replay.

La skill UI ha guidato un aiuto espandibile nella sezione Eventi, inizialmente chiuso e
verificato nei tre layout. La skill di debugging ha guidato riproduzione e correzione del
rimbalzo; quella di documentazione mantiene distinta l'API comune dall'object model completo.

Verifiche finali del 5 ottobre 2026:

- `npm test -- --maxWorkers=2 --reporter=dot`: **83 file e 972 test frontend verdi**, più
  il file/test scratch preesistente disabilitato. Sono 36 regressioni nuove rispetto al punto 81.
- `npm run build`: **TypeScript/Vite riusciti**. Il contratto `PreviewMessage` include il
  nuovo messaggio snapshot; il test Inspector apre davvero la sezione Eventi nei tre layout.
- `npm run test:production -- --maxWorkers=1 --reporter=dot`: **1 test verde**, generatore
  caricato dal bundle production e nuove API grafiche eseguite sul DOM del pannello generato.
- `npm run test:recovery -- --reporter=dot`: **16 test verdi** sul bundle compilato.
- `cargo test --offline --locked --lib`: **51 test nativi verdi**. Le quattro SHA256 dei file
  copiati in `target/debug/scripts` coincidono coi sorgenti, inclusi ponte e helper aggiornati.
- Gate licenze offline: **255 npm**, 44 nello scope MQTT, **266 Cargo**, nessuna dipendenza
  npm obbligatoria mancante; 1 voce npm e 41 Cargo da rivedere. Exit 1 previsto,
  `releaseApproved: false`. Nessuna nuova dipendenza/asset o scansione vulnerabilità online.
- `git diff --check` pulito. Nessun riavvio esplicito dell'app o dell'anteprima dell'utente,
  nessun commit/push. Restano gli avvisi preesistenti su import misti e localStorage Node.

I test delle pipeline non sostituiscono il collaudo manuale WebView/desktop, l'installer su
macchina senza checkout o la prova con una CPU reale. Il packaging Node/Babel del punto 81
e i gate industriali restano aperti; le copie delle risorse non provano l'installer completo.

Fonti Siemens consultate: [BackColor UInt32 e RGB](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.backcolor-rt-unified?contentId=dPaJR4uyE6hEb0DefV11RA),
[Enabled Boolean](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.enabled-rt-unified?contentId=q1Wj6jISVKh3QC9aKAlbJw),
[Text String](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.text-rt-unified?contentId=HTkEFlq0GmXPM0l4n5iS5g),
[Name readonly nel modello Runtime V20](https://docs.tia.siemens.cloud/r/de-de/v20/wincc-unified-javascript-objektmodell-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.name-rt-unified?contentId=7LxrMvHrUW7RWQkvq5kw4g).
Le pagine Runtime Width/Height non sono state recuperabili in questa verifica: il contratto
Framecraft UInt32 resta esplicito, non viene presentato come una nuova certificazione Siemens.

Restano `WCU-EVT-10`: proprietà/metodi specifici dei controlli, oggetti annidati Font/Margin,
collezioni complete, bounding box/trasformazioni, contesti lifecycle e `ProcessValue` con
trasporto tipizzato. WinCC, Optix, OPC UA/MQTT, AI facoltativa e gate industriali restano
nel perimetro completo del lavoro; questa tranche non approva una release.

### 83. Oggetto Font annidato negli script, condiviso con i pannelli standard

Tranche del 5 ottobre 2026, senza agenti. `item.Font` e il Font degli oggetti trovati con
`Screen.Items`/`Faceplate.Items` sono riferimenti opachi con ID e percorso autorizzato,
non oggetti DOM né record da sostituire. Usano le espressioni ricorsive della IR esistente,
anche attraverso alias, moduli, dati annidati, ritorni di funzione, timer e Promise/await.
Riferimenti rimossi o contesti scaduti, percorsi non autorizzati, prototipi e uso diretto
come valore PLC sono rifiutati; le catture negli inizializzatori globali restano vietate.

Proprietà eseguite:

- `Font.Name`: stringa scrivibile, distinta dal nome readonly del componente; famiglia CSS
  singola con escaping, generiche ammesse, nessun download o inclusione di file font.
- `Font.Size`: Float finito non negativo, decimali conservati e DIU mappate a CSS px;
  la notazione esponenziale viene convertita in una lunghezza CSS valida prima dell'applicazione.
- `Font.Weight`: valori HmiFontWeight 0/300/400/600/700; None=0 usa CSS normal nel mapping web.
- `Font.Italic`/`Font.Underline`: Boolean reali.
- `Font.StrikeOut`: HmiFontStrikeOut None=0/Single=1, non true/false.

Applicazione al testo univoco della targhetta/pulsante, anche nella label annidata con stili
propri, e a input/textarea/select senza cambiare valori, opzioni o binding PLC. Immagini, SVG
e testi ambigui non ricevono una scorciatoia Font. Font base non risolvibili sono diagnosticati,
senza inventare nome o dimensione; una scrittura esplicita rimane disponibile. La famiglia letta
è la prima configurata, non una garanzia di disponibilità del font o dei glifi sul dispositivo.

Il layer transitorio conserva nodi/listener/icone e lettura immediata delle proprie scritture;
compone font, testo, lingue, dinamiche e lampeggio, con sospensione annidabile e ripristino
della base aggiornata. Il registro degli stili conserva anche la label destinataria, priorità
e shorthand. I test hanno riprodotto l'escaping delle virgolette e le decorazioni sul contenitore:
ora togliere sottolineatura/barratura non lascia la linea attiva nel percorso label-contenitore.
Altre decorazioni e stili estranei sono conservati; non si modificano antenati fuori dall'oggetto.
Il test anti-rimbalzo con Canvas e ponte reali ora incrementa anche Font.Size e verifica che
una mutazione successiva aggiorni solo gli snapshot, senza rieseguire la dinamizzazione.

La skill UI ha guidato l'aiuto Font chiuso di default nella sezione Eventi, testato nei tre
layout; la skill di debugging ha guidato riproduzione e correzione dei casi CSS, e quella di
documentazione mantiene distinti mapping web, firme Runtime, licenze dei font e parità completa.

Verifiche finali del 5 ottobre 2026:

- `npm test -- --maxWorkers=2 --reporter=dot`: **84 file e 1014 test frontend verdi**,
  42 regressioni Font nuove e verifiche Canvas/Runtime/Inspector potenziate. Il file/test
  scratch preesistente resta disabilitato. Nessun timeout o test è stato allentato.
- `npm run build`: **TypeScript/Vite riusciti** sul codice finale.
- `npm run test:production -- --maxWorkers=1 --reporter=dot`: **1 test verde**; generatore
  caricato dal bundle production e sei proprietà Font eseguite nei moduli realmente esportati.
- `npm run test:recovery -- --reporter=dot`: **16 test verdi** sul bundle aggiornato.
- `cargo test --offline --locked --lib`: **51 test nativi verdi**; nessuna modifica Rust.
  Le quattro SHA256 delle risorse in `target/debug/scripts` coincidono coi sorgenti,
  incluso l'helper Font aggiornato. Questo non collauda ancora un installer senza checkout.
- Gate licenze offline: **255 npm**, 44 nello scope MQTT e **266 Cargo**; nessuna dipendenza
  npm obbligatoria mancante, 1 voce npm e 41 Cargo da esaminare, exit 1 previsto e
  `releaseApproved: false`. Nessuna nuova dipendenza, font/asset o scansione vulnerabilità online.
- `node --check` sui due helper e `git diff --check` puliti. Restano gli avvisi preesistenti
  su import misti e localStorage Node. Nessun avvio/riavvio manuale dell'app o dell'anteprima
  dell'utente, commit o push; i processi Vite dei test usano fixture isolate.

Restano da verificare grafica reale WebView, font installati, installer e CPU reale:
i test automatici non certificano questi aspetti né l'approvazione industriale.

Fonti primarie recuperate: [Size Float/DIU V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/bar-rt-unified/bar.title-rt-unified/text.font-rt-unified/font.size-rt-unified?contentId=ofQUZnlPqkgkp_c73jG01Q),
[Name String V20](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/functiontrendcontrol-rt-unified/functiontrendcontrol.functiontrendareas-rt-unified/hmifunctiontrendareacollection-rt-unified/functiontrendarea-rt-unified/functiontrendarea.bottomvalueaxes-rt-unified/hmixvalueaxiscollection-rt-unified/xvalueaxis-rt-unified/xvalueaxis.labelfont-rt-unified/font.name-rt-unified?contentId=z_GEyRf89VGAypjdzBulJA),
[Weight Int32/HmiFontWeight V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/alarmcontrol-rt-unified/alarmcontrol.toolbar-rt-unified/toolbar.font-rt-unified/font.weight-rt-unified?contentId=6gCJ53cK7e9gnzrVFq7kwA),
[Underline Bool V20](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/checkboxgroup-rt-unified/checkboxgroup.font-rt-unified/font.underline-rt-unified?contentId=NCSfYyQfE6qMqSglVhmo4g),
[StrikeOut Int32/HmiFontStrikeOut V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/clock-rt-unified/clock.diallabelfont-rt-unified/font.strikeout-rt-unified?contentId=hw1DRHEdKVoVvgKlFHgnbg).
Italic Bool è confermato dall'[indice primario Siemens V21](https://docs.tia.siemens.cloud/r/de-de/v21/wincc-unified-javascript-objektmodell-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/alarmcontrol-rt-unified/alarmcontrol.alarmview-rt-unified/datagridview-rt-unified/datagridview.headersettings-rt-unified/datagridheadersettings.font-rt-unified/font.italic-rt-unified?contentId=tfYO4S~i5FS5_tXas9KDuw) e dai Font del JSON standard;
la pagina completa non è stata recuperabile. Gli esempi TIA Openness non vengono usati al posto
del contratto Runtime, specialmente per StrikeOut. Non sono stati inventati namespace o alias
delle enumerazioni Font: per ora si usano i valori numerici documentati.

Restano Font di Caption/Title/assi, enumerazioni e altri oggetti annidati come Margin, metodi
specifici, collezioni, bounding box/trasformazioni, lifecycle e ProcessValue col driver reale.
WinCC, Optix, OPC UA/MQTT, AI facoltativa, installer senza checkout e gate industriali restano
nel perimetro completo del lavoro. Questa tranche non dichiara parità completa o release approvata.

### 84. Livelli, rotazione e trascinamento reattivo nell'editor (5 ottobre 2026)

Richiesta: rendere accessibile lo z-index, aggiungere la rotazione e correggere il ritardo del drag
di targhette, pulsanti e altri elementi. I campi CSS esistevano, ma erano poco visibili e la
rotazione richiedeva di scrivere a mano le unità.

- Nuova sezione **Livelli e rotazione**, aperta subito nell'Inspector singolo e di gruppo:
  z-index intero, avanti/indietro di un livello, ripristino Auto, angolo in gradi, ±90° e 0°.
  Escape annulla il valore in corso; input frazionari/non finiti dello z-index vengono rifiutati.
  I valori CSS deg/rad/grad/turn sono letti in gradi; le rotazioni 3D non vengono reinterpretate
  come angoli 2D e restano modificabili dal campo tecnico Rotazione CSS.
- Uno z-index numerico su un elemento statico aggiunge `position: relative`, mai absolute:
  non viene cambiata la posizione del box nel flusso. Le targhette inline diventano inline-block
  quando si applicano spostamento, scala o rotazione, così la trasformazione è effettiva.
  Translate, scale, transform e origine esistenti restano conservati. Il livello vale nel
  contesto CSS del contenitore, non attraversa arbitrariamente contesti di impilamento annidati.
- Movimento diretto e maniglie del canvas conservano l'ultima posizione del puntatore e
  applicano al massimo un aggiornamento per frame. Il rilascio scarica anche la posizione
  finale non ancora disegnata; il sorgente viene modificato soltanto alla fine del gesto.
  Durante il gesto le transizioni vengono sospese e will-change è temporaneo: entrambi vengono
  ripristinati, incluse le priorità CSS originali, e non vengono scritti nel JSX.
- Le proprietà complete dei membri del gruppo vengono misurate all'inizio, non a ogni movimento.
  Snap con Shift per bloccare un asse e Alt per sospenderlo mantenuti; ricerca dei vicini per
  spaziatura uguale ora lineare, senza ordinare tutte le liste a ogni evento. Le mutazioni di
  soli stili non rilanciano la scansione delle traduzioni; gli snapshot Runtime vengono differiti
  durante il gesto e raccolti di nuovo al termine.
- Escape, pointercancel, perdita della cattura, blur e cambio modalità ripristinano il drag senza
  salvare. Le maniglie vengono annullate anche al cambio selezione/progetto/pagina; frame e
  listener pendenti vengono rimossi. Restano protette le targhette click-through e le pagine
  guidate: nessun aggiramento delle autorizzazioni di modifica.
- Corretto anche il gruppo dopo modifiche consecutive: i riferimenti AST vengono rimappati
  soltanto dal documento accettato alle nostre riscritture di stile, conservando le istanze
  ripetute. Un comando nello stesso file resta un solo Undo; i gruppi multifile mantengono
  gli snapshot per file del modello esistente.
- Si tratta dei controlli generici dell'editor: valgono anche per i pannelli creati dalla pipeline
  standard. Gli stili salvati sono CSS del progetto React, senza dipendere dall'editor a Runtime.
  Non sono state inventate nuove API Siemens/Optix di z-order o trasformazione da script.

La regressione è stata prima riprodotta sul ponte reale: 97 pointermove producevano 97 messaggi
e letture geometriche; il rilascio poteva mantenere coordinate arretrate e pointercancel salvava
il gesto. Ora la stessa raffica produce un aggiornamento con l'ultima posizione nel frame e
nessuna scansione completa per ogni movimento del gruppo. Questi sono conteggi automatici,
non una misura degli FPS nella finestra WebView dell'utente.

Nuove prove in `preview-drag.test.ts`, `canvas-transform.test.ts` e `element-transforms.test.ts`
coprono ponte e Canvas reali, transizioni/priorità, ultimo rilascio, cancellazione, selezione,
zoom 50%, resize, gradi e unità CSS, gruppi misti/ripetuti, salvataggio e annulla/ripeti.
Aggiornato anche il test delle tre disposizioni dell'Inspector per i controlli subito visibili.

Verifiche del 5 ottobre 2026:

- Suite frontend: **87 file e 1057 test passati**, un file/test scratch già saltato in precedenza
  (88 file, 1058 test totali). Avvio 12:06:00, durata 88,08 s.
- Dopo la rifinitura dello step nativo per gli angoli decimali: tutte le **43 nuove regressioni**
  nei tre file sono state rieseguite e passano (12:12:06, 12,80 s).
- `npm run build`: TypeScript e Vite 7.3.6 riusciti, 2098 moduli; restano i warning noti su
  import statici/dinamici misti, non nuovi errori.
- Fixture pannello generato production: **1 test passato** (12:13:37, 7,71 s).
  Fixture recovery editor: **16 test passati** (12:13:41, 8,71 s).
- `cargo test --offline --locked --lib`: **51 test passati**. I quattro script nel pacchetto
  debug hanno SHA-256 identico ai sorgenti, compresi ponte e snap aggiornati.
- `node --check` su ponte e snap e `git diff --check`: riusciti. Nessuna nuova dipendenza,
  asset o scansione online, nessun riavvio manuale dell'app/anteprima dell'utente, commit o push.

Restano il collaudo del gesto nella WebView reale, progetti pesanti e contenitori con
trasformazioni annidate: i test non certificano FPS hardware o parità completa dei trasformatori
geometrici WinCC. Restano aperti gli stessi gate industriali/licenze documentati nelle roadmap.

### 85. Switch Modifica / Usa il pannello sempre visibile (5 ottobre 2026)

Richiesta: rendere immediata la scelta dell'interazione, fuori dai menu a tendina. Eccezione
esplicitamente richiesta alla barra pulita dei punti precedenti: **Prova pannello** continua
a essere soltanto nel menu Pannello, non è la modalità Usa del canvas.

- Nella parte destra della barra superiore sono sempre visibili **Modifica** e **Usa il pannello**,
  con icone, etichette complete, bordo e spunta della scelta attiva. Le vecchie due voci sono
  rimosse dalla tendina Modifica; lì restano Annulla/Ripristina, eliminazione, guide e allineamento.
- Lo switch riusa `interactionMode` dello store, senza uno stato locale duplicato. Chiude un
  eventuale menu aperto e cambia solo l'interazione: non salva, riavvia Vite, apre il Runtime
  separato o modifica pagina, progetto e cronologia. Passando a Usa viene rimossa la selezione
  singola come già previsto; gli annullamenti dei gesti del canvas restano quelli del punto 84.
  Non si abilita la simulazione PLC né una connessione cambiando soltanto la modalità.
- Disponibile anche in Codice e Affiancati, indipendente dalle tre disposizioni dei pannelli
  e dalla disponibilità di Vite. Il ritorno contestuale **Torna alla grafica** è conservato.
  Lo switch non cambia automaticamente la vista né ripristina i profili semplice/completa.
- Pulsanti nativi con `aria-pressed`, gruppo nominato, focus visibile e target minimo di 44 px.
  La spunta distingue lo stato anche senza il colore. Transizioni rispettano reduced-motion.
  La barra può andare a capo e la prima riga della griglia cresce col contenuto: niente etichette
  nascoste, controlli sovrapposti o toolbar aggiuntive sul canvas. Guida rapida aggiornata.

La skill UI/UX ha guidato stato esplicito, tastiera, target e controllo responsive conservando
palette e tipografia esistenti. La skill di documentazione ha guidato l'allineamento di diario
e architettura alla nuova scelta dell'utente.

Verifiche del 5 ottobre 2026:

- Test mirati di barra, viste, trasformazioni canvas e scorciatoie: **4 file, 39 test passati**
  (12:28:00, 12,09 s). Sette nuove regressioni della barra, oltre alle asserzioni aggiornate.
- Suite frontend completa: **87 file, 1064 test passati**, un file/test scratch già saltato
  (88 file, 1065 test totali; 12:33:19, 102,87 s).
- `npm run build`: TypeScript e Vite riusciti, 2098 moduli; soli warning noti di import misti.
- Fixture isolata con TopBar e CSS reali in Edge headless: **36 combinazioni** di larghezze
  375/768/1024/1440 px, densità compatta/normale/grande e viste Disegno/Affiancati/Codice.
  Controllati confini dei pulsanti, assenza di sovrapposizioni, canvas sotto la barra e target.
  Tab, Spazio e Invio attivano i pulsanti nativi; spunta e stato ARIA si aggiornano insieme.
  Verificato reduced-motion e ispezionato lo screenshot della barra. Fixture e immagine
  restano nella cartella locale `.hmi-preview/mode-switch`, già ignorata da Git.
- Nessuna nuova dipendenza, asset Runtime o chiamata online; nessun agente, commit, push o
  riavvio manuale dell'app/anteprima dell'utente. Il browser usa un profilo temporaneo proprio,
  rimosso al termine; non interagisce con le finestre già aperte.

Il controllo headless non equivale al collaudo manuale nella WebView desktop con il progetto
e la CPU dell'utente. Roadmap WinCC/Optix/AI e gate industriali/licenze restano aperti.

### 86. Evidenziare una zona scelta col mouse (5 ottobre 2026)

Richiesta: in **Evidenzia una parte**, permettere di indicare liberamente la zona della macchina,
senza limitarsi a scegliere un elemento gia' esistente sulla pagina.

- Nell'Inspector del pulsante: **Forma zona** (Rettangolo / Contorno a punti) e **Disegna zona**.
  Il rettangolo si trascina col mouse; il contorno si costruisce cliccando gli angoli e si chiude
  con Invio o **Fine**. Backspace/Delete rimuove l'ultimo punto; Esc annulla. Durante il gesto
  una guida sul canvas spiega come finirlo, il cursore cambia e il contorno e' visibile subito.
  **Scegli la parte** / **Cambia parte** conserva il collegamento all'elemento intero precedente.
- Il ponte della preview sceglie foto, SVG o contenitore sorgente; coordinate relative per
  foto/contenitori e native per SVG. I movimenti sono coalescenti per frame, con rilascio esatto;
  vengono bloccati selezione, drag e click HMI sugli oggetti sotto il disegno. Le maniglie
  della selezione non intercettano il mouse mentre si disegna.
- La scelta ha un requestId e una pagina di origine. Risposte vecchie/estranee sono ignorate;
  Esc, perdita di cattura, pointercancel, blur, cambio pagina/modalita' o reload la annullano.
  La lettura asincrona gia' iniziata non puo' completare una scelta annullata. Una zona nulla
  consente di riprovare; contorni con meno di tre punti/non validi e copie da liste sono rifiutati.
- Il collegamento viene salvato come `data-fc-highlight-region` sul pulsante e identificatore
  sulla foto/SVG/contenitore. Ridisegnare sostituisce il vecchio handler, senza eseguire due
  volte il click originale; cambiare colore/spessore conserva il contorno, rimuovere ripristina
  l'onClick iniziale. Un identificatore gia' assegnato alla foto viene riusato; la targhetta
  modificata resta selezionata anche se altri pulsanti condividono lo stesso riferimento.
- Nel pannello autonomo l'handler JSX contiene tutto il codice necessario. In **Usa il pannello**
  il click accende/spegne un overlay con bordo e riempimento trasparente, non interattivo e senza
  modificare lo stile della foto; segue scroll, posizione e dimensioni del riferimento, si pulisce
  quando questo viene rimosso o la pagina termina. Nessun modulo editor, driver o simulazione
  PLC va aggiunto al progetto generato per questo comportamento.
  Ogni foto/SVG mantiene una zona attiva: cliccando una targhetta con contorno diverso si passa
  subito al suo motore; ripremendo la stessa si spegne. Nel controllo visivo e' stata riprodotta
  e corretta l'interferenza di CSS generali `svg`/`path`: sfondo, margini, fill/stroke e visibilita'
  dell'overlay sono impostati esplicitamente senza cambiare le grafiche della macchina.
- Cartelle autorizzate e contratti dei template restano protetti. Se il buffer non salvato
  differisce dal file su disco viene conservato e il disegno e' rifiutato con istruzione di salvare.
  Stesso file: un passo Annulla/Ripristina. Due file: due passi nella cronologia, con verifica
  della revisione del file target prima della scrittura; non e' una transazione atomica multifile.

Limiti dichiarati: una zona per collegamento, massimo 128 punti, nessun riconoscimento automatico
dei motori. Foto/contenitori sono ancorati al rettangolo visualizzato, non al pixel originale
in caso di crop/letterboxing o rotazioni CSS annidate; fissare il layout prima del disegno.
SVG usa la matrice effettiva. Restano aperti CAS generale, command layer e collaudo manuale
nella WebView desktop sul progetto reale; non e' una certificazione industriale.

La skill UI/UX ha guidato istruzioni, scelta esplicita della forma, focus, tasti e controlli
principali da 44 px mantenendo lo stile esistente. La skill di documentazione ha guidato
istruzioni d'uso, limiti e allineamento dei documenti senza segnare la parita' vendor come completa.

Verifiche del 5 ottobre 2026:

- Nuove regressioni: **3 file, 48 test passati** per dati/handler/store, ponte serializzato,
  e integrazione reale Canvas + Inspector, con cancellazioni, zoom, cronologia e buffer dirty.
  Ultimo controllo mirato include i 3 test precedenti del collegamento all'elemento intero:
  **4 file, 50 test passati** (14:35:32, 10,87 s). Coperti anche gli stili SVG generali,
  il cambio tra due zone della stessa foto e la selezione della seconda targhetta dopo il disegno.
  La suite finale copre anche la convivenza Runtime tra zona e vecchio highlight dell'elemento:
  stati separati, stile originale conservato e click non duplicati.
- Suite frontend completa finale: **90 file, 1112 test passati**, un file/test scratch gia' saltato
  (91 file, 1113 test totali; 14:41:31, 109,41 s dal report JSON, zero fallimenti).
  Report locale generato in `.hmi-preview/highlight-region/results.json`.
- Collaudo produzione separato: **2 file, 2 test passati**, compreso il generatore di handler
  zona dopo bundling con gli stessi target e opzioni di produzione; handler eseguito senza
  import editor, click originale una volta e toggle verificati (14:41:30, 23,61 s).
- `npm run build`: TypeScript e Vite riusciti, 2099 moduli; soli warning gia' noti di import misti.
- Test nativi `cargo test --offline --locked --lib`: **51 passati**; SHA256 delle quattro
  risorse del ponte/snap/picking/flashing uguale tra sorgenti e copie debug aggiornate.
- Fixture isolata con Canvas, Inspector, CSS e ponte reali in Edge headless: rettangolo con
  mouse nativo a zoom 35/50/85%; contorno concluso sia con **Fine** sia con Invio; Esc,
  coordinate SVG viewBox, accensione/spegnimento e click originale senza duplicati. Zona foto
  segue ridimensionamento e spostamento; fixture locale in `.hmi-preview/highlight-region`,
  gia' ignorata da Git. Il salvataggio usa un ponte filesystem in memoria, non il progetto aperto.
  Asserzioni CSS native e screenshot di disegno/Runtime verificano sfondo trasparente, margine
  nullo, contorno visibile e immagine caricata anche con regole generali per SVG e path.
- Nessun agente, dipendenza nuova, chiamata online, commit/push o riavvio manuale dell'app
  o dell'anteprima dell'utente. Il collaudo headless usa soltanto un profilo temporaneo proprio,
  rimosso al termine. Roadmap WinCC/Optix/AI e gate licenze/produzione restano aperti.


### 87. Connessioni PLC grafiche e configurazione MQTT realmente eseguibile

- **Pannello → Connessioni PLC** apre una finestra dedicata: servizio/client del gateway,
  broker MQTT, tag del catalogo salvato, topic concreti, formati JSON/testo, JSON Pointer del
  valore/qualità/timestamp, scadenza, QoS e topic comando. Autenticazione, TLS, versioni MQTT,
  timeout e permessi sono nelle opzioni avanzate. Target nuovi almeno 44 px, focus/Tab/Escape,
  Ctrl S locale, errori sui campi, navigazione agli errori e scarto esplicito del draft.
- Mapping paginati (10 per pagina) e ricerca dei tag (100 risultati più il tag già associato),
  senza migliaia di dropdown completi. Non vengono inventati broker, topic o indirizzi PLC;
  tipi e accessi sono quelli del catalogo. UDT/array non vengono spacciati per supportati.
- Driver, gateway e GUI usano lo stesso modulo puro `runtime/connection-config.mjs`, senza
  dipendenze aggiunte. Il flusso **Crea nuovo pannello standard** distribuisce modulo e tipi
  insieme al servizio. Configurazione iniziale ancora disabilitata; OPC UA resta da implementare.
- Salvataggio nativo limitato ai due cataloghi nella root del progetto: confronto con la base
  dei JSON e dei tag, generazione della sessione, rifiuto di link/file non regolari, limite 4 MiB,
  preparazione prima delle sostituzioni e rollback su errore I/O. Nessun salvataggio tardivo
  dopo cambio progetto o riapertura della stessa root. Sostituzioni atomiche per file, non
  transazione crash-atomica multifile né lock contro editor esterni. Il catalogo tag non viene scritto.
- Nessun segreto inline, chiave/certificato incorporato o credenziale nell’URL; i draft non
  entrano nella recovery, nei checkpoint o nella cronologia JSX. Gateway, connessione e tag
  richiedono permessi separati prima delle scritture. Salvare non avvia rete/servizi, non riavvia
  l’anteprima, non conferma credenziali/CPU/TLS e non equivale a conferma del PLC.
- Verifica: 56 regressioni del contratto e della finestra React; 15 collaudi su broker TCP/HTTP
  reale locale, incluso il mapping serializzato dalla GUI e i sorgenti del pannello generato;
  62 test nativi offline. Edge headless isolato: input/mouse nativi, wildcard rifiutata, JSON
  salvato, conflitto senza perdita del draft, ricarica con scarto esplicito; 1280×900 e 390×844,
  nessun overflow orizzontale e target di almeno 44 px. Screenshot ispezionati nella fixture
  ignorata `.hmi-preview/connections`; filesystem in memoria, nessuna azione sul progetto aperto.
- **Proposta futura dell’utente**: “Pubblica pannello” con domande su protocollo, destinazione e
  consegna come progetto/eseguibile/installer. Annotata in `ARCHITETTURA-HMI.md`; packaging e
  automatismi vanno discussi prima, non sono implementati o promessi come industrialmente pronti.
- Richiesta operativa: dopo ogni modifica importante verificata fare commit e push sul repository
  `https://github.com/xManue/framecraft.git`. Segreti, cache, file temporanei e foto di confronto
  restano esclusi; la pubblicazione del codice non è il deployment industriale del pannello.
- L'utente ha scelto **solo codice, JSON reali locali** per il repository pubblico: `standard/`
  e foto esclusi da Git. README distingue test pubblici e test contro l'export reale; senza
  export i dieci file di riferimento vengono esclusi con avviso, mentre `test:standard`
  richiede i dati autorizzati e fallisce chiaramente quando mancano. Non vengono creati dati finti.
- Suite completa locale del blocco: 1168 passati e uno scratch preesistente saltato; build
  TypeScript/Vite e due collaudi del generatore production riusciti. Audit offline invariato:
  255 pacchetti npm (44 MQTT), 266 Rust, 1/41 voci da esaminare; `releaseApproved: false`.
- Verificata anche una copia dei soli file staged, senza JSON reali o foto: 1085 test pubblici
  passati e build TypeScript/Vite riuscita; `test:standard` rifiuta l'assenza degli export con
  errore esplicito. La copia usa le dipendenze già installate, non è un'installazione su OS nuovo.

### 88. Recupero della bozza e messaggi comprensibili senza conoscere il codice

- La richiesta nasce dal comando “Mostra la bozza conservata”, che apriva soltanto il testo
  sorgente. Ora è **Codice della bozza (per assistenza)**, in sola lettura e chiuso inizialmente:
  ne spiega il motivo e chiarisce che non è un'immagine/anteprima del pannello.
- Riepilogo di progetto, pagina, data e modifiche non salvate; **Recupera bozza e riprendi il
  lavoro** è l'azione principale. La scelta che elimina il record si chiama **Scarta bozza e
  torna ai progetti**, con conferma esplicita quando dirty. I file salvati non vengono cambiati
  dal recupero o dallo scarto. Nel conflitto sono spiegati gli effetti di entrambe le versioni,
  inclusa la cronologia non ripresa scegliendo la pagina su disco.
- Nessuna finta grafica della bozza: il codice non viene eseguito nei dettagli; l'anteprima
  reale legge i file salvati, non il buffer dirty. La schermata indica quando serve Salva.
  Contratti backend, controlli su root/generazione, persistenza e recupero restano invariati.
- Strato puro di presentazione per errori comuni di anteprima, percorsi Windows, file/permessi,
  dipendenze, sintassi, spazio, recovery e backup. Prima spiegazione e prossimo passo, poi
  dettagli tecnici espandibili. Avviso non significa automaticamente pannello guasto; per
  cause sconosciute non vengono inventate diagnosi. I dettagli non sono una pulizia dei segreti.
- Diagnostica con messaggi interi a capo, ricerca su spiegazione e originale, origini distinte
  e ripetizioni consecutive raggruppate senza cancellare i record. Classificazione su testo
  senza colori ANSI; nomi tag come `Motor.Error=0` non diventano falsi errori. Il limite esistente
  di 300 log dell'anteprima resta uguale. Pulisci diagnostica non elimina file o bozze.
- Toast di errore non scompare a tempo e offre **Apri diagnostica**. Avvisi di backup spiegano
  che le ultime modifiche potrebbero non essere recuperabili: nessuna promessa di salvataggio
  riuscito. Comandi **Riprova anteprima** e **Ricompila anteprima**, con limiti espliciti; non
  viene suggerita la ricostruzione cache come correzione automatica di codice non valido.
- Target nuovi almeno 44 px, focus, dettagli da tastiera e layout stretti: corretti anche
  sovrapposizione header/log e larghezza del testo rilevati negli screenshot di collaudo.
  Fixture locale `.hmi-preview/messages`, esclusa da Git, mouse/Invio e screenshot in browser
  headless con profilo proprio: scelta di recupero/conflitto, codice nascosto inizialmente,
  log originali conservati e nessun overflow orizzontale a 1280×900 e 390×844.
- Test mirati di UI/log/recovery e 16 prove del vero store compilato dopo HMR/full reload;
  nessun agente, dipendenza nuova, sorgente della macchina modificato o riavvio manuale
  dell'app/anteprima dell'utente. JSON WinCC reali, foto e dati temporanei restano locali.
  Parità WinCC/Optix/AI, driver OPC UA e gate industriali/licenze non vengono dichiarati chiusi.
- Suite completa: **1193 test passati in 94 file**, con quattro worker e timeout invariati.
  La prima esecuzione insieme alle build aveva due timeout da 5 s; i due file riprovati con
  carico ridotto passano (46 test), poi passa la suite intera. Build TypeScript/Vite verificata;
  nessun aumento dei timeout per mascherare una regressione o modifica ai test funzionali PLC.

### 89. Immagini senza crash EBUSY, proprietà stabili e strumenti di lavoro più chiari

- Segnalazione reale: sostituendo un'immagine, Vite termina con `EBUSY: resource busy or locked,
  watch` su `public/framecraft-assets/*.png`. Verificato il percorso del watcher nella versione
  installata di Vite: su Windows l'acquisizione dell'handle `fs.watch` può fallire durante una
  copia. Non viene attribuito il blocco a un programma specifico senza evidenza.
- Il plugin dell'anteprima editor usa **polling solo su Windows e solo in serve**: intervalli
  predefiniti 100 ms per sorgenti e 300 ms per binari, intervalli già configurati preservati.
  `watch: null`, altri sistemi operativi, esclusioni Vite e build production restano invariati.
  Non cambia la configurazione salvata del pannello; polling può aumentare il carico su progetti
  grandi. Il plugin viene riletto al prossimo avvio: **Visualizza → Riprova anteprima**, senza
  riavviare l'app né salvare automaticamente la bozza.
- Errore EBUSY spiegato come file temporaneamente occupato, con attesa della copia, riprova e
  diagnostica del file coinvolto. L'output originale resta nei dettagli tecnici; nessuna diagnosi
  inventata di file corrotto o perdita della bozza.
- Test con **Vite reale, filesystem e HTTP**: iniezione di EBUSY su qualunque chiamata nativa
  `fs.watch`, importazione e riscrittura di PNG in `public/framecraft-assets`, risposta immagine
  esatta e server ancora attivo. Con la correzione il percorso nativo fallibile non viene usato.
  Fixture sintetiche isolate e poi rimosse; nessuna prova modifica il progetto della macchina.
- Il reset dell'Inspector seguiva l'id AST, che include la fine del nodo e cambia anche con una
  sua proprietà. Ora distingue l'oggetto selezionato dalla sua modifica: lo scroll resta fermo
  durante gli aggiornamenti, ma torna all'inizio cambiando oggetto o copia renderizzata.
  Una vecchia richiesta di focus del testo non viene rieseguita a ogni modifica dell'id.
  Coperti due aggiornamenti AST reali, nuova richiesta di focus e cambio elemento/copia.
- **File del progetto**: ricerca gerarchica; JS/JSX/TS/TSX aprono davvero il codice affiancato
  alla grafica, rispettando il flush della bozza e senza abbandonarla se non è salvabile. CSS,
  JSON, Markdown e altri testi si consultano in **sola lettura**, senza sostituire né salvare la
  pagina aperta. Immagini dalla vera anteprima locale; formati non supportati, file vuoti e
  problemi di lettura espliciti, con Riprova lettura. I file lunghi sono limitati in visualizzazione,
  non nella lettura nativa. Non viene promesso un editor CSS/JSON o l'apertura di qualunque binario.
- Consultazione con dialogo nativo fuori dal contenitore zoomato, focus ripristinato al file,
  Escape, Tab/Shift+Tab mantenuti nella finestra. Gli shortcut globali non salvano o modificano
  il pannello sotto un dialogo aperto. Collaudo browser ha rilevato l'uscita del focus con Tab:
  corretta e coperta con test, senza indebolire l'asserzione.
- **Disposizione dei pannelli**: scelte descritte Grafica e componenti, Variabili e dinamiche,
  File e codice, stato Personalizzata se si cambiano divisori/pannelli. Cambiano solo pannelli e
  larghezze; grafica, codice e tutte le funzioni restano disponibili. Nessuna modalità semplice/
  avanzata reintrodotta. Guida alla prova locale visibile anche prima dell'attivazione:
  **Valori di prova · locale**, non un simulatore del programma PLC o una connessione macchina.
- Collaudo con Edge headless e profilo isolato: scroll a 500 px conservato, JSON letto davvero
  tramite il bridge di test e nessun salvataggio, Tab/Shift+Tab/Escape e focus di ritorno, SVG
  locale caricato via Vite, disposizioni, spiegazione della prova locale, sorgente affiancato e
  ritorno alla grafica. Screenshot ispezionati a 1280×900, 980×680 e 390×844; il dialogo resta
  nel viewport. Fixture `.hmi-preview/workspace` ignorata, non un collaudo desktop/CPU reale.
- Nessun agente, nuova dipendenza, sorgente macchina modificato o riavvio dell'anteprima
  dell'utente. Questo checkpoint è separato dal trasporto asincrono PLC ancora in lavorazione;
  parità WinCC/Optix/AI e gate industriali/licenze non sono dichiarati chiusi. JSON reali e foto
  restano locali.
- Verificata una copia dell'esatto indice Git senza export reali o foto: **1141 test pubblici
  passati in 87 file**, build TypeScript/Vite riuscita, **3 collaudi production/Vite** e **16 test
  di recovery sul vero store compilato** passati. I dieci file di riferimento sono esclusi con
  avviso in assenza degli export: non è una prova di fedeltà WinCC. La copia usa le dipendenze
  già installate, non è una nuova installazione o un collaudo del pacchetto desktop distribuito.
- La suite della cartella locale, che include anche il blocco PLC asincrono non staged, ha
  1239 test passati e due timeout da 5 s in `standard-runtime.test.ts`; quel file riprovato da
  solo passa tutti i 32 test. Non sono aumentati timeout o indebolite asserzioni. Il checkpoint
  pubblicato non contiene le modifiche di quel blocco e la sua suite pubblica è interamente verde.

### 90. Modifica elementi organizzata per attività, testo delle targhette e annullamento coerente

- Segnalazione dell'utente: editor poco intuitivo, soprattutto modificando gli elementi.
  La scheda del singolo elemento ora parte da **Aspetto**: contenuto, immagine, voce della
  lista, posizione/dimensioni, colori, livelli e rotazione. **Azioni** contiene interazioni,
  evidenziazioni, accesso ed eventi; **PLC e dati** contiene variabili, dinamiche, importazione
  della lista, faceplate e trend; **Altro** raccoglie attributi, CSS e codice. Nessuna funzione
  HMI rimossa e nessuna modalità semplice/avanzata reintrodotta. Avvisi su pagine guidate,
  copie ripetute, elementi bloccati e file condivisi restano fuori dalle schede.
- Intestazione riconoscibile con tipo e scritta dell'elemento; schede sempre disponibili durante
  lo scroll. Navigazione con frecce, Home/End e focus visibile. Campi grafici e schede da 44 px;
  etichette di misure, peso e allineamento comprensibili, senza abbreviazioni tagliate nei campi
  affiancati. Traduzioni richiudibili se non usate, aperte per elementi realmente multilingua.
  Non è un audit touch completo di tutti i controlli HMI.
- Il campo **Testo** della targhetta modifica la proprietà reale della voce selezionata nel file
  dati, senza duplicare un secondo campo o scollegare l'espressione JSX. Quando il doppio clic
  richiede la scheda, apre e seleziona il campo appropriato, anche se i dati arrivano dopo la
  richiesta; non espande tutti i dettagli tecnici e non ripete vecchie richieste di focus a ogni
  aggiornamento AST, neanche passando da un testo breve al campo su più righe.
- Scheda e scroll conservati cambiando una proprietà dello stesso oggetto; reset ad Aspetto
  quando cambia elemento/copia. Identità di selezione distinta dall'id AST con offset finale.
  Importazione delle righe PLC spostata in **PLC e dati → Dati della lista**, non cancellata.
- **Esc annulla davvero** i campi comuni di testo, geometria, stile, bordo e voce della lista,
  gli attributi e i campi di collegamento/mapping: il blur non applica più la bozza cancellata.
  Invio o uscita dal campo applicano; testo su più righe anche con Ctrl+Invio. Colori e scelte
  rimangono immediati. Gli editor di script e gli altri controlli specialistici non sono stati
  uniformati tutti a questo comportamento.
- Unità già presenti conservate (`%`, `rem`, ecc.) invece di sostituirle implicitamente con px.
  Opacità decimale non arrotondata durante la lettura; campo X vuoto non significa zero;
  coordinate visualizzate arrotondate ma non modificate non producono una traslazione.
- Regressioni sul vero Inspector e store: schede visibili, tastiera, scritture AST, scroll/focus,
  testo multilinea, Esc, unità e file dati delle targhette con modifica di una sola voce.
  I test preesistenti di eventi, espressioni, lampeggio, faceplate, trend e disegno zona usano
  le nuove schede visibili, mantenendo le asserzioni funzionali.
- Collaudo Edge headless con profilo e Vite isolati: quattro schede, tastiera, Esc nel testo,
  nuova richiesta di focus, scroll a 500 px conservato e campi entro il pannello da 240 px.
  Screenshot della vera interfaccia con fixture sintetiche, non un collaudo desktop o PLC reale.
  Schede gruppi/elementi esterni e mini-editor dei tipi faceplate conservano il layout precedente.
- Verificata la copia esatta dell'indice Git senza export privati o foto: **1167 test pubblici
  passati in 88 file**, incluse **25 nuove regressioni** dell'Inspector, build TypeScript/Vite,
  **3 collaudi production/Vite** e **16 test di recovery sul vero store compilato** passati.
  I dieci file di riferimento richiedono gli export locali e sono esclusi con avviso; le
  dipendenze sono quelle già installate tramite junction, non una nuova installazione.
  Non è una prova di fedeltà WinCC, del pacchetto desktop distribuito o di una CPU reale.
- Nessun agente, nuova dipendenza, riavvio dell'app/anteprima dell'utente o sorgente macchina
  modificato. Export WinCC e foto restano locali. Checkpoint separato dal trasporto asincrono
  PLC già in lavorazione; parità WinCC/Optix/AI e gate industriali/licenze restano aperti.

### 91. Script asincroni collegati al trasporto MQTT reale e standard generato

- Ripreso e completato il checkpoint locale del trasporto IR. L'interprete usa un'unica
  coroutine: sospende/riprende l'operazione, senza rieseguire effetti precedenti, inizializzatori
  di moduli, array, switch o chiamate annidate. Mantiene coda eventi, budget operazioni e
  timeout CPU; l'attesa di rete ha timeout separato e supporta annullamento.
- Eventi, funzioni/inizializzatori dei moduli, timer e Scheduler del pannello autonomo usano
  il gateway HTTP e il driver MQTT. La pipeline standard distribuisce interprete e adapter,
  non richiede Siemens/Rockwell Runtime; configurazione e connessioni restano inizialmente
  disabilitate. Il runtime connesso non si installa nell'anteprima dell'editor.
- Risultati distinti: `commands` con ricevute delivered/rejected/uncertain, `reads` da campioni
  realmente acquisiti, `writes` per modifiche locali. Nessun comando modifica la cache PLC
  ottimisticamente; qualità sconosciuta non diventa Good. I tag locali dei faceplate restano
  locali anche nelle closure dei timer. Le dinamizzazioni sincrone non inviano scritture di rete.
- Verificati contratti ufficiali Siemens `TagSet.ReadAsync` e `WriteAsync`: batch parziale
  prosegue con errori per tag, rifiuto se nessun tag riesce. Nel trasporto Framecraft l'esito
  delivered significa consegna MQTT, **non** scrittura PLC. `WriteAsync(1)`/hmiWriteWait viene
  respinto prima dell'invio finché non esiste un protocollo di conferma PLC. Lettura CPU forzata,
  QCD, audit operatore e bit atomici non disponibili non vengono simulati come riusciti.
- `ReadMaxAge` verifica cache e timestamp sorgente; non inventa una lettura CPU per recuperare
  campioni vecchi. Stop/contesto non più attivo impediscono comandi successivi; risultati
  accumulati di elementi rimossi non navigano un'altra pagina dopo una risposta tardiva.
  Un invio interrotto o senza risposta resta incerto, senza retry/replay automatico.
- **19 test TCP/HTTP passati** con broker Aedes su loopback e porte casuali. Quattro nuovi
  test eseguono l'interprete effettivamente generato: ack trattenuto, batch reale parziale,
  qualità sconosciuta/letture cache e annullamento HTTP senza ripubblicazione alla riapertura.
  Nessuna CPU fisica/virtuale, macchina aziendale, servizio permanente o segreto coinvolto.
- **61 regressioni mirate passate** su gateway, interprete e runtime generato. Incluse
  propagazione moduli/timer/Scheduler, faceplate locali, navigazione obsoleta e anteprima
  senza rete. Aggiunta continuazione asincrona al collaudo del generatore bundled production.
  Build TypeScript/Vite passata; warning preesistenti sugli import misti statici/dinamici.
- Audit licenze offline rieseguito: inventari 255 pacchetti npm (44 MQTT runtime) e 266 Cargo
  del target Windows. Nessuna nuova dipendenza. Il gate resta **non approvato** per review/notice,
  non bypassato; questo checkpoint non autorizza il rilascio industriale.
- Collaudata la copia dell'esatto indice Git `1caf28f941baa702220b9c8d8318ca61a645b8d1`,
  senza export privati, foto o segreti: **1189 test pubblici passati in 89 file**, build
  TypeScript/Vite, **3 test production/Vite**, **19 collaudi TCP/HTTP** e **16 test recovery**
  passati. Dipendenze già installate tramite junction, non nuova installazione. I dieci file
  di riferimento che richiedono export WinCC locali sono esclusi con avviso. Le aggiunte
  documentali finali non cambiano il codice verificato. Nessun riavvio dell'app/preview utente.
- Roadmap Unified/Optix, architettura e guida runtime aggiornate senza dichiarare parità
  completa: restano conferme PLC, OPC UA, payload avanzati, RBAC/audit/storage server,
  TLS/CPU reali e packaging/LTS/licenze. AI facoltativa ancora secondo la propria roadmap.

### 92. Scritta in primo piano, conferma visibile e testo vuoto ancora modificabile

- Ulteriore semplificazione della modifica elementi, concentrata su pulsanti e targhette.
  Il campo **Testo** ha **Applica testo**, **Annulla** ed esito visibile: pronto, applicazione
  in corso, applicato o errore. Invio/Ctrl+Invio, Esc e applicazione uscendo dal campo restano
  disponibili; passare con Tab ad Annulla non applica prima la scritta da scartare. Click
  ripetuti non generano due scritture mentre la prima è in corso.
- La scritta della targhetta è il primo campo della voce, anche se `id` precede `label` nei
  dati. Gli altri valori sono raccolti in **Altri dati dell’elemento**, espandibile. La voce
  continua a vivere nel suo file dati, senza duplicare il campo Testo né scollegare il JSX.
  Spiegata la differenza fra ambito dello stile/Canc e testo/dati della voce: questi ultimi
  modificano la voce selezionata anche con Tutte, rispettando l'avviso sul file condiviso.
- `updateText` e `updateListItemProperty` restituiscono un esito reale. Niente falso successo
  se una scrittura è rifiutata: per la pagina si distingue la scritta rimasta nella bozza non
  salvata; per il file dati si conserva il testo da riprovare. Un errore non avvia tentativi
  automatici. La rilettura del file dati rifiuta una versione cambiata prima della scrittura;
  non è una sostituzione del CAS atomico del backend. Aggiunta la guardia di selezione ai
  valori della voce, così una lettura tardiva non modifica un elemento appena selezionato.
- Riprodotto e corretto il caso svuota/riscrivi: il parser non perde la capacità di testo dei
  contenitori testuali vuoti e legge le stringhe letterali inserite dal trasformatore, invece
  di mostrare una scritta vecchia dell'anteprima. L'intervallo totalmente vuoto usa inserimento
  invece di overwrite. Nessun campo testo inventato per immagini/input, forme SVG senza testo,
  componenti esterni vuoti o genitori il cui testo appartiene ai figli.
- Intestazione aggiornata dalla scritta nel sorgente/dati; spiegazioni duplicate tolte dalla
  targhetta. Il campo mantiene il valore confermato dall'operazione AST anche per copie
  senza dati risolvibili e con anteprima ancora vecchia, senza riabilitare Applica sul vecchio
  valore. Annulla ripristina la scritta applicata, non quella precedente dell'anteprima.
- Regressioni mirate di Inspector e parser: **70 test passati** su testo, applica/annulla,
  click ripetuti, errori disco/file dati, file cambiati, selezione tardiva, composizione da
  tastiera, svuota/riscrivi, undo e conferma senza anteprima aggiornata. Prova grafica Edge
  headless con build e profili isolati: pulsante a 320 px e targhetta a 240 px, una sola
  scrittura, annullamento senza salvataggi, campi entro la colonna e nuovi comandi testo da
  almeno 44 px. Le immagini sono state ispezionate; non è un collaudo della finestra desktop
  dell'utente né una prova su PLC reale.
- Verificata la copia dell'indice Git `e591c769abde27a1ce1ba4ede4d475768b02492b`, senza
  export privati, foto o segreti: **1218 test pubblici passati in 89 file**, incluse **29 nuove
  regressioni**; build TypeScript/Vite, **3 collaudi production/Vite** e **16 test recovery**
  del vero store compilato passati. I dieci file di riferimento dipendono dagli export locali
  e sono esclusi con avviso. Dipendenze già installate tramite junction, non installazione
  pulita. Le ultime aggiunte documentali non cambiano il codice verificato. Restano i warning
  di bundling preesistenti sugli import statici/dinamici e il collaudo desktop su progetti reali.
- Nessun agente, nuova dipendenza, progetto macchina modificato o riavvio manuale della
  finestra/anteprima dell'utente. Fixture sintetiche e immagini del collaudo restano ignorate;
  export WinCC, foto e segreti non entrano nel repository pubblico. Roadmap HMI/AI e gate
  industriali restano aperti. UI/UX ha guidato priorità della scritta, conferme esplicite,
  feedback vicino al campo, focus e comandi da 44 px, conservando lo stile dell'editor.

## Da fare, dopo

- **Affidabilità editor durante gli aggiornamenti**: HMR/reload coperti al punto 77 e deposito
  locale persistente al punto 78. Collaudare incidente e recovery nella finestra desktop reale
  e nel pacchetto production; verificare flush alla chiusura, gestione/retention di più copie,
  autorizzazione guidata dei file esterni e CAS dei salvataggi. Nessun avvio dell'anteprima,
  apertura/autorizzazione di cartelle o replay PLC automatico come rimedio alla perdita di stato.

- **Roadmap WinCC, fase 3 da completare**: eventi specifici dei controlli, object model restante,
  JavaScript oltre il sottoinsieme IR, analisi di flusso intermodulo completa, closure/scoping
  completi, moduli di libreria/versionati, motore allarmi reale, conferme PLC e altri metodi/driver
  (`WCU-DYN-06`, `WCU-EVT-01/04/05/06/07/10`).
- **Roadmap WinCC, fase 4 da completare**: altre proprietà colore specifiche oltre la prima API
  `PropertyFlashing` del punto 79, audit accessibilità generale e dimensioni minime dei target
  touch (`WCU-DYN-07`, `FC-MORE-12`).
- **Roadmap WinCC, fase 5 da completare**: parità completa del mini-editor faceplate con l'editor
  pagine, eventi annidati, opzioni container, contesto esatto di `Faceplate.Close`, screen window
  generiche, UDT, diff e migrazione versioni (`WCU-FP-*`, `WCU-ENG-12`, `WCU-TAG-05`).
- **Roadmap WinCC, fase 6 da completare**: stampa, profili e object model dei trend; sul temporale
  restano anche fusi orari e aggregazione per pixel
  (`WCU-CTL-05/06`, `WCU-DAT-04/05`).
- **Roadmap WinCC, fase 7 da completare**: collegare i Data Log a driver e storage industriali,
  supporti esterni, rotazione, backup e diagnostica spazio (`WCU-TAG-08`, `WCU-DAT-01/02/03`).
- **Interfaccia**: estendere le categorie superiori quando entrano nuove funzioni WinCC, Optix e AI,
  senza reintrodurre toolbar permanenti nel canvas o nel bordo inferiore.
- **Connettività trasversale**: trasporto asincrono MQTT nella IR integrato al punto 91;
  completare conferme PLC/payload avanzati, command layer restante e driver OPC UA; RBAC/audit/storage
  server e collaudo TLS/CPU fisiche o virtuali. Mai segreti nel browser o replay di comandi incerti.
- **Produzione**: chiudere licenze/notice e diritti asset, collaudare upgrade Vitest, audit Rust/OS,
  packaging su runtime LTS e guasti/recovery nella finestra desktop e su progetti reali;
  collaudare il plugin senza checkout e distribuire/risolvere le sue dipendenze bare, oltre
  alla mappa delle risorse corretta al punto 81;
  completare identita' HTTP dell'anteprima e rilevamento del server vivo ma bloccato.
- **Dopo WinCC**: capacità funzionali di `FACTORYTALK-OPTIX-ROADMAP.md` a partire dall'information
  model Framecraft, non dal round-trip verso un formato proprietario.
- **Dopo la parita' WinCC/Optix**: command layer completo, diff semantico e AI facoltativa secondo
  `AI-FRAMECRAFT-ROADMAP.md`.
- **Editor — inserimento componenti con dati locali**: props letterali e dati importati viaggiano
  già col componente; per props nate da stato/calcoli locali l'editor oggi rifiuta l'inserimento e
  spiega quali mancano. Serve una configurazione guidata se si vuole crearne valori iniziali sicuri.
- **Fuori portata da qui**: esportare le 225 grafiche da TIA, raccogliere utenti e permessi UMC/UMAC,
  e le 1068 soglie dei `Range` (`fill.cmd`, con TIA aperto).
