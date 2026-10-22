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

### 93. Connessioni MQTT più robuste, diagnostica con rimedi e mini guida nel pannello

- La mini guida è accanto alla configurazione: **Pannello → Connessioni PLC → Guida rapida**.
  Cinque passi brevi e approfondimenti su mapping, qualità, comandi, errori/log e produzione.
  Disponibile anche con catalogo illeggibile; aprirla non salva, non avvia rete e non manda comandi.
  UI/UX ha guidato aiuto contestuale, focus, dettagli espandibili e nuovi comandi da 44 px,
  conservando il tema scuro. Prova Edge headless isolata a 1254 px e 375 px tramite iframe:
  guida/focus, intestazione, scroll e footer visibili, zero salvataggi. Screenshot ispezionati.
  Non è una verifica della finestra desktop utente; profili, immagini e fixture restano ignorati.
- Driver MQTT: timeout di ogni tentativo, compresi lettura certificati, CONNECT e SUBACK dopo
  una riconnessione; recupero transitorio con client nuovo, arresto su credenziali/TLS/versione/
  client ID rifiutati o subscribe negata. Cause statiche comprensibili, conseguenze e rimedi;
  il testo grezzo del server e i percorsi privati non entrano nei messaggi. MQTT 5 session takeover
  esplicito non innesca contesa continua. Observer difettosi non interrompono il trasporto.
- Comandi separati: non inviato, rifiutato esplicitamente dal broker o esito incerto. Puback/
  Pubrec negativo non diventa consegnato; un'anomalia dopo Pubrec o risposta persa rimane incerta.
  Nessun replay, coda offline, aggiornamento ottimistico o falsa conferma PLC. Gateway/client
  validano tipo e permessi prima dell'invio; Real/Float fuori Float32 o underflow a zero rifiutati.
  Dati Bad/invalidi conservano l'ultimo valore valido; UTF-8, mapping, qualità e timestamp
  verificati, dati fuori ordine ignorati, scadenza anche per un tag mai ricevuto.
- Gateway HTTP: diagnostica strutturata bounded, errori token/origine/limiti distinti, attesa body
  limitata, avvio/arresto concorrenti serializzati. Cache e diagnostica consegnate ai callback
  come copie. Il timeout del client configurato nell'editor ora viene passato al Runtime standard.
  Stato PLC in alto espandibile: connessioni, ultimi dieci eventi, Come risolvere e guida compatta.
  Nessun HTML eseguibile da etichette/errori e nessun avviso ripetuto ad ogni polling.
- Registro locale asincrono in `.framecraft-runtime/logs/gateway` e `logs/mqtt`, tre file da
  1 MiB per servizio e coda limitata a 256 eventi. Errori ripetuti raggruppati; disco non disponibile
  o overflow segnalati senza bloccare il trasporto. Nessun segreto, endpoint/topic, payload o
  valore comando; nomi connessioni/tag possono essere aziendali e vanno protetti. Rotazione
  scarta il più vecchio: non è audit persistente/antimanomissione. CLI `--json` coerente anche
  disabilitata/in errore; campioni stdout solo con `--samples` esplicito, mai nel registro su disco.
- La pipeline **crea nuovo pannello standard** distribuisce moduli, tipi, logger e guida, client
  aggiornato e `.gitignore` per registri/segreti/chiavi. Niente retrofit di progetti macchina,
  endpoint inventati o modifiche ai JSON reali. Il Runtime connesso non si installa nell'anteprima.
  Documenti e roadmap Unified/Optix aggiornati: **OPC UA non implementato**, profili conservati
  senza conversioni; MQTT rimane parziale per conferme applicative, payload avanzati, RBAC/audit
  server, storage industriale e compatibilità con broker/CPU/trust effettivi della macchina.
- Test con MQTT.js reale, broker Aedes TCP/TLS, peer MQTT 5 controllati per ACK negativi, HTTP e
  processi dei sorgenti generati. CA e certificati server/client effimeri via OpenSSL (Git su
  Windows), scadenza/hostname/trust/mTLS verificati, senza installare certificati di sistema.
  Nessuna CPU fisica/virtuale aziendale o credenziale reale coinvolta; no agenti o riavvio app utente.
- Audit npm online autorizzato: patch mirata `source-map-js` 1.2.1 → 1.2.2 nel solo lockfile.
  Restano due pacchetti critici e uno moderato nel tooling Vitest/Tinypool/mocker; upgrade runner
  da collaudare, non aggirato con override o `audit fix --force`. Zero segnalazioni note nello
  scope `--omit=dev` dell'editor non equivale a certificare il servizio o una release industriale.
  Gate licenze/notice e collaudo macchina restano aperti; dettagli in LICENZE-E-PRODUZIONE.md.

### 94. Pagine/categorie, inserimento e guscio mobile (2026-10-07)

- Nuova finestra ampia Pagine con nome, percorso, categoria e catalogo filtrabile. Creazione
  categoria nella stessa finestra, poi scelta della prima pagina. Focus iniziale, Escape,
  ripristino focus, blocco doppio invio e campi conservati in caso di errore. Scorrimento del
  catalogo separato dai comandi di conferma; verificato anche in un viewport reale da 375 px.
- Le categorie sono quelle di `panelSections` del progetto, non un elenco globale finto.
  Modifica AST dei dati statici senza eseguire codice; rifiuto navigazione dinamica, numerazione
  duplicata e collisioni con file/binding già presenti. Sezioni standard invariate, nuove 10–99,
  9 riservata ai popup. La pagina nuova viene collegata anche a menu e `screenRoutes`; categoria
  appena creata vuota fino alla prima pagina. Lettura categorie ripristinata dopo il recupero HMR.
- Icone dedicate ai contenuti delle pagine; sei basi vuote Main raggruppate, senza eliminare
  varianti e relativi eventi dello standard. I componenti riusabili restano nella palette,
  gli export delle pagine no (anche gli export default con alias). Fine drag/cancel non lascia
  bloccato il click successivo. Click inserisce nella pagina attiva se il file aperto era rimasto
  sul guscio/SVG; preservazione bozza quando cambia file e rifiuto drop con riferimenti scaduti.
- I moduli `pages`, parser e trasformazione inserimento sono già caricati con lo store, non
  richiesti alla prima operazione. L'URL segnalato su localhost:1420 non era raggiungibile al
  controllo: causa esatta del precedente errore HTTP non riprodotta, niente riavvio della app.
- Pipeline desktop+mobile: avvio mobile su viewport stretto, guscio largo quanto lo schermo,
  sezioni scorrevoli, menu touch, diagnostica entro il viewport, comandi da almeno 44 px.
  Disegno a dimensioni reali con pan oppure adattato, coordinate macchina immutate. Nessuna
  riscrittura automatica del guscio/CSS dei progetti macchina esistenti: migrazione guidata da fare.
- Collaudi mirati: parser/numerazione, inserimento, creazione reale categoria+pagina su filesystem
  sintetico, focus/errori della finestra e sorgenti generati; controlli TypeScript. Browser Edge
  isolato: finestra 1120 px desktop e 359 px dentro viewport 375, nessun salvataggio; HMI mobile
  guscio 375, menu 440 scorrevole, disegno da 1280 a 375 con Adatta. Router della fixture visuale
  sintetico: prova layout, non certificazione del router o PLC reale. Screenshot/fixture locali
  ignorati. Non eseguita la suite generale, come richiesto dall'utente.

### 95. Colori leggibili dopo il raggruppamento pagine (2026-10-07)

- Regressione riprodotta dallo screenshot: i pulsanti dentro le nuove categorie non erano più
  figli diretti di `page-list`, quindi perdevano gli stili e usavano i colori nativi del browser.
  Classe dedicata per tutte le pagine, categoria o gruppo libero; selezione/focus riconoscibili,
  nomi e percorsi lunghi troncati senza allargare il pannello.
- Avvisi di caricamento/errore anteprima allineati al tema scuro dell'editor, con testo e pulsanti
  leggibili. Nessuna modifica ai colori dei progetti macchina o dell'iframe funzionante.
- Test mirato dello stile sulle pagine realmente raggruppate. Riproduzione del vero AppShell in
  Edge isolato con progetto sintetico: 23 pagine, righe contenute, avviso scuro e contrasto dei
  testi principali 8,9:1. Fixture/screenshot locali ignorati; nessun salvataggio del progetto utente.
- Il server dell'editor rispondeva. L'utente ha confermato che l'anteprima era tornata disponibile
  prima di ulteriori interventi: non riavviata, causa transitoria non attribuita senza log.

### 96. Nuovi HMI mobile: orientamento, navigazione e accesso (2026-10-07)

- Pipeline dei nuovi desktop+mobile: scelta Automatico/Desktop/Mobile. Automatico segue i
  cambiamenti del viewport sotto i 1280 px necessari al guscio desktop; scelta manuale mantenuta
  durante la navigazione. I pannelli solo desktop non attivano il mobile.
- Adatta disegno misura l'area contenuto e la larghezza reale della pagina, anche se modificata;
  ResizeObserver e fallback resize con cleanup. Nessun cambiamento alle coordinate macchina.
  L'adattamento riduce anche i comandi del disegno: dimensioni reali per usarli più grandi.
- Utente di nuovo visibile nell'header compatto, senza attivare login o inventare una sessione.
  L'azione Accesso utente già configurata apre una pagina responsive con account/PIN/tastierino,
  senza overflow su telefono. È ancora accesso locale browser, non autenticazione industriale.
- Sezione attiva riportata nella striscia visibile senza scroll dell'intera pagina. Menu con righe
  48 px (corretto il conflitto con l'altezza inline), chiusura touch/Escape, focus sul primo comando,
  ritorno all'apertura o alla pagina selezionata e chiusura quando si esce dal menu con tastiera.
  Conservato il bordo iniziale del menu desktop. Safe-area predisposte, senza dichiararle collaudate
  su dispositivi fisici. I 44 px dei comandi del guscio non si applicano al disegno rimpicciolito.
- Verifiche mirate: sei casi sul vero App generato, cinque controlli generatore/gusci/menu,
  tre casi serializzazione/login esistenti e TypeScript. Edge isolato a 320x640, 375x800,
  812x375 e 1024x768; desktop a 1414 px. Header, righe menu, focus, scorrimento, scala e login
  sintetico verificati. Ripetuto solo il caso orizzontale dopo l'ultimo aggiustamento del focus.
  Router della fixture sintetico: non collaudo del router reale, telefono fisico o PLC.
- L'utente eliminerà i vecchi progetti: migrazione guidata non più richiesta. Nessuna cancellazione
  effettuata, nessuna riscrittura dei loro gusci/CSS. Fixture e screenshot restano locali ignorati.

### 97. Cosa fa: reazioni, azioni guidate e regole utente (2026-10-07)

- Primo comando in Cosa fa: interruttore Abilita reazioni. Spegnerlo conserva gestori/azioni ma
  blocca eventi e gestori nativi sul nodo e sui suoi figli; gli elementi precedenti con azioni
  restano attivi finché non disabilitati esplicitamente. Accesso utente ed Evidenzia una parte
  compaiono soltanto quando le reazioni sono abilitate. Eventi e guida Unified sotto Cosa fa,
  non più sezione separata sempre visibile. Focus riconoscibile e campi guidati prima del codice.
- Ogni nuova azione ha Quando e Cosa succede: pagina del progetto, mostra/nascondi o
  abilita/disabilita un oggetto nominato, messaggio in diagnostica, script personalizzato.
  Script guidati compilati nella IR sicura esistente: nessun eval o nuova scrittura PLC implicita.
  DoubleTapped eseguito in anteprima e Runtime generato, con rimozione del listener al dispose;
  estensione Framecraft, non evento dichiarato come nativo WinCC. I click singoli precedono il
  doppio click se configurati insieme; doppio tocco subordinato al browser/dispositivo.
- Accesso ed evidenziazione scelgono click/doppio click/pressione/rilascio/click destro. Cambiare
  evento dell'evidenziazione ripristina il gestore originale precedente e conserva quello nuovo;
  non simula click, non sposta un comando PLC al nuovo evento. Rimuovere ripristina il sorgente.
- Permessi distinti data-fc-user-visible-requires e data-fc-user-requires; visibilità disponibile
  anche su elementi passivi. Regole sul nodo e antenati, mancanti negate, aggiornate al cambio
  utente e su elementi montati/navigazione. Modifica resta visibile/selezionabile. Rimozione della
  regola/dispose/HMR ripuliscono gli stati; interblocchi disabled originali non riabilitati.
  Sessioni esistenti riallineate ai permessi dell'account nel file, non a permessi vecchi salvati.
- Il guard portabile viene importato nell'ingresso React anche usando solo lo switch, senza
  account/PIN predefiniti. Conservati sorgente modificato, import e azioni; messaggi leggibili.
  Switch e installazione sono una sola modifica annullabile; annulla/ripeti del file di ingresso
  verificati. Importazioni asincrone rifiutate se ingresso/progetto cambiano durante la lettura.
  Runtime generato ricontrolla le regole prima delle azioni accodate e dei nuovi comandi asincroni.
- Verifiche mirate: azioni guidate, accessi/guard/entry, nuovo flusso Inspector, gestori originali
  evidenziazione, casi pertinenti Inspector/bridge/Runtime ed evidenziazione di zone. TypeScript;
  Edge isolato scheda reale a 320 e 240 px, switch e assenza di debordi. Dati sintetici soltanto,
  fixture e screenshot ignorati. Nessun riavvio dell'app dell'utente, nessun test generale.
- Limiti: account e PIN locali nel browser non sono una barriera di sicurezza industriale.
  Restano auth/RBAC/audit server-side, OPC UA, commissioning PLC/dispositivi fisici e parità
  completa Unified/Optix; non dichiarati risolti da questo lavoro.

### 98. Mobile mantenuto durante cambio pagina e ricaricamento (2026-10-07)

- Causa verificata: scegliere una pagina dall'editor cambia src dell'iframe e ricarica
  il documento. Il guscio ripartiva da Automatico; su una finestra larga diventava Desktop.
- Nuovi desktop+mobile: scelta validata in sessionStorage, mantenuta nella stessa scheda
  anche dopo ricaricamento. Mobile e Desktop restano manuali; Automatico segue il viewport.
  Nessuna attivazione del mobile nei pannelli solo desktop. Storage bloccato non rompe il selettore.
- Anteprima dei pannelli già creati: il ponte ripristina il selettore tramite evento change,
  aggiornando lo stato React effettivo, non solo il valore del campo. Chiave distinta per progetto,
  condivisa con il guscio generato. Nessuna riscrittura degli export precedenti.
- Indietro/Avanti con pagina conservata dal browser: riallineamento all'ultima scelta e al
  viewport; listener/observer ripuliti senza interrompere il ripristino dalla cache.
- Regressione del ricaricamento riprodotta prima del fix. Verifiche mirate: quattro casi sul
  vero App generato, cinque sul ponte (ripristino React, isolamento, storage e cleanup), TypeScript.
  Edge isolato: due flussi con tre ricaricamenti reali ciascuno, da 1440 a 375 px; Mobile mantenuto,
  Desktop mantenuto anche a 375 px, ritorno esplicito ad Automatico. Il caso cache della cronologia
  è simulato nei test, non dichiarato collaudato nel browser. Router e dati della fixture sintetici.
- Nessun riavvio dell'app dell'utente, nessun test generale; fixture e screenshot locali ignorati.
  Collaudo di progetti reali, touch fisico e PLC restano separati da queste verifiche browser.

### 99. Pagina iniziale HMI per scegliere Desktop o Mobile (2026-10-07)

- Inserita nella pipeline dei nuovi pannelli standard desktop+mobile: schermata del pannello
  HMI generato, non impostazione/modalità dell'editor. Senza una scelta valida nella scheda
  corrente, mostra nome macchina e due pulsanti Desktop/Mobile prima delle pagine operative.
- Scelta esplicita: Mobile anche su schermo largo, Desktop anche su telefono. Conservata
  la pagina richiesta da un collegamento diretto; nessun percorso o numero standard inventato.
  La scelta salvata evita di riproporre la schermata durante navigazione e ricaricamento.
  Dentro il pannello resta il selettore Desktop/Mobile/Automatico per modificarla.
- Guscio operativo separato dalla schermata iniziale: installFramecraftHmiRuntime si monta
  soltanto all'ingresso. La scelta layout non è autenticazione né interblocco PLC e non
  controlla il ciclo di vita dei servizi esterni. Pannelli solo desktop invariati nell'ingresso.
- Pulsanti nativi con descrizioni, SVG, focus visibile e passaggio del focus alla pagina aperta;
  griglia a due colonne o verticale su telefono, safe-area, scorrimento su finestre basse,
  nessun ridimensionamento dei disegni macchina. Storage non disponibile non blocca l'ingresso.
- Verifiche mirate: dodici casi sul vero App generato (ingresso, runtime differito, preferenze,
  navigazione, menu e resize), tre su generazione/JSX e riconoscimento pagine; TypeScript.
  Edge isolato a 375x800, 768x800, 812x375 e viewport largo 1414 px: ingresso, cambio manuale,
  memoria al rimontaggio, focus, target e assenza di debordi. Screenshot telefono/desktop
  ispezionati. Ripetuto il solo flusso nuovo guscio con tre ricaricamenti reali dopo l'ingresso.
- Nessuna riscrittura/cancellazione di progetti macchina esistenti, nessun riavvio dell'app
  dell'utente. Router/dati sintetici; fixture e screenshot ignorati. Nessun test generale,
  nessuna pretesa di collaudo touch fisico o PLC.

### 100. Aggiungi azione senza download tardivo di lineEndings (2026-10-08)

- Segnalazione su un select Desktop/Mobile con onChange nativo: caricamento dinamico
  di src/source-parser/lineEndings.ts fallito. File presente nel checkout; al controllo
  la porta editor 1420 non rispondeva, quindi causa del guasto originale del server non attribuita.
- Riprodotto lo stesso errore in Edge isolato sul codice precedente: risposta 503 soltanto
  al chunk lineEndings dopo l'avvio. Aggiungi azione falliva prima di scrivere; fonte invariata.
- Helper CRLF caricato con lo store, non al primo comando o durante annulla/ripeti e modifiche
  su altri file. Correzione minima: nessun nuovo retry/replay, nessuna rimozione dei guard di
  selezione, proprietà template, sintassi o progetto. I moduli parser già caricati restano riusati.
- Nuovi messaggi distinguono moduli editor e anteprima non caricati, conservano i dettagli
  originali e indicano di conservare la bozza prima di riavviare. Nessuna promessa di rollback
  generale o file necessariamente mancante; nessuna attribuzione al PLC per errori di import JS.
- Test pubblico del vero percorso Inspector → store → sorgente: helper non più scaricabile
  dopo avvio, aggiunta azione su select, onChange originale e CRLF preservati, una modifica
  annullabile e ripetibile. Ventisei casi messaggi, undici guard asincroni pertinenti, TypeScript.
- Browser prima/dopo: stesso blocco di rete, con fix zero richieste al helper durante azione,
  annulla e ripeti; tre scritture soltanto nel bridge sintetico in memoria. Fixture/screenshot
  ignorati, nessun riavvio dell'app utente e nessuna suite generale. Resta separato il collaudo
  dell'aggiornamento nella finestra desktop reale e dell'artefatto production.

### 101. Ritorno alla scelta Desktop/Mobile dal pannello HMI (2026-10-08)

- Nei nuovi pannelli standard desktop+mobile il cambio layout passa soltanto dalla
  pagina iniziale: comando “Cambia dispositivo” in alto a destra su Desktop e fisso
  accanto al navigatore Mobile, visibile anche scorrendo le categorie. Target 44 px
  minimo, SVG e focus visibile; non è un'impostazione dell'editor.
- Eliminato il selettore inferiore Desktop/Mobile/Automatico e il cambio automatico
  al ridimensionamento. Conservato separatamente Adatta disegno/Dimensioni reali:
  cambia lo zoom del disegno, non il layout del pannello.
- Il ritorno cancella soltanto la preferenza di questo progetto e riporta il focus
  alla scelta. Pagina corrente conservata; dopo una nuova scelta la preferenza resta
  durante navigazione e reload. Dopo il ritorno, anche un reload ripresenta la scelta.
  Storage non disponibile non blocca il percorso in memoria; cache indietro/avanti
  riallineata alla preferenza, anche quando cancellata o impostata al vecchio auto.
- Al ritorno il guscio operativo si smonta: menu, listener e observer liberati,
  runtime reinstallato soltanto dopo una nuova scelta. Non è logout né interblocco
  e non arresta i servizi/PLC esterni. Ingresso dei pannelli solo desktop invariato.
- Verifiche mirate: quindici casi sul vero App generato, due sul generatore/JSX
  e riconoscimento pagine; TypeScript. Edge isolato a 375x800, 768x800, 812x375 e
  viewport largo 1414 px: ritorno, cambio, focus, target e pulsante raggiungibile senza
  sovrapporre logo/navigatore. Screenshot telefono/desktop ispezionati. Tre ricaricamenti
  reali: Mobile conservato su schermo largo, Desktop su stretto e scelta ripresentata
  dopo il ritorno. Router/dati sintetici; fixture browser e screenshot ignorati,
  senza riavvio dell'app dell'utente, riscrittura di progetti macchina o suite generale.
  Collaudo touch fisico, pannelli reali e produzione restano separati.

### 102. Client OPC UA scalare, gateway e pipeline standard (2026-10-08)

- Servizio Node autonomo con MQTT e OPC UA nello stesso gateway. Client e certificate-manager
  fissati a 2.186.17, controllo logger SDK a 2.186.7; minimo Node 22.13.0, baseline Node 24.
  Server SDK soltanto nelle fixture, non nelle dipendenze del runtime generato. Lockfile:
  nessuna versione di pacchetti già presenti aggiornata incidentalmente.
- Connessioni PLC: nuovo profilo OPC UA separato, offline, endpoint vuoto e connessione/comandi
  disabilitati. Sicurezza iniziale SignAndEncrypt/Basic256Sha256; mode/policy e trust espliciti,
  policy SHA1 escluse. None richiede consenso per test isolati anonimi; niente downgrade.
  Credenziali solo tramite riferimenti ambiente, certificati/chiavi/PKI come percorsi sul servizio.
- Trust non automatico, controllo validità, coppia chiave/certificato, hostname/IP, URI client/server
  e certificato del canale effettivo. PKI caricata all'avvio senza watcher: aggiornamenti richiedono
  riavvio manuale. Diagnostica statica con rimedi e codici UA hex sanificati; dump SDK disabilitati
  nel processo PLC, senza disabilitare gli eventi/log Framecraft.
- Mapping tramite Namespace URI e identificatore senza ns=. Namespace risolto a ogni sessione;
  tipi built-in scalari, ValueRank e UserAccessLevel verificati prima di ready e delle scritture.
  Subscription e letture periodiche reali: valore invariato non significa campione scaduto.
  StatusCode uint32 originale e timestamp source/server separati da receivedAt; Good/Uncertain/Bad
  derivati dai bit di severità UA. Bad/Uncertain preservano l'ultimo valore valido, senza renderlo
  Good; perdita sessione/scadenza rendono Bad. Browser ReadMaxAge usa acquisizione reale OPC UA.
- Consensi distinti gateway/connessione/catalogo/binding e permessi UA correnti. Risposta Good
  Write è delivery opcua-service, mai plcConfirmed. Rifiuto esplicito separato da esito incerto;
  nessuna coda offline, replay o cache ottimistica. Browser e continuazioni IR riconoscono la
  ricevuta OPC UA senza inventare conferme o letture CPU forzate.
- Pipeline nuovo pannello: copia driver/tipi, gateway comune, dipendenze esatte, guida e diagnostica;
  resta vuota/disabilitata inizialmente. Dialogo con campi etichettati, mapping paginati, ricerca
  catalogo distinta e salto al campo errato anche dopo la prima pagina. Mini guida, README e
  roadmap Unified/Optix aggiornati a PARZIALE, non a parità o produzione completate.
- Verifiche mirate, 169 casi distinti: 71 configurazione, 55 dialogo/client/IR, 11 gateway MQTT/HTTP,
  10 OPC UA reali loopback, 1 confezionamento standard, 3 inventario licenze e 18 diagnostica sicura. Casi OPC UA:
  qualità/timestamp, tipi/nodi/namespace errati, Bad/Uncertain/Good con flag, scrittura rifiutata,
  server perso, timeout e stop durante Write senza replay, trust reciproco, hostname/URI/scadenza,
  credenziali negate senza segreti, deduplica HTTP e processo Node realmente copiato dalla pipeline
  con stdout JSON pulito. TypeScript passato; fixture/certificati/log esclusi da Git, nessun PLC
  reale o riavvio dell'app utente, nessuna suite generale. Collaudo CPU/touch/artefatto industriale separato.
- Licenze nuovo grafo runtime: 127 pacchetti, nessuno mancante. Due revisioni: precond 0.2.3
  senza license nel manifest (README indica MIT, notice completa da verificare/conservare),
  tweetnacl 0.14.5 Unlicense fuori dall'allowlist corrente. Nessuna approvazione legale automatica.
  npm audit autorizzato: nessuna segnalazione nel grafo OPC UA; restano 3 segnalazioni tooling
  Vitest/mocker/Tinypool (2 critical, 1 moderate), upgrade major da collaudare separatamente.
- Restano browsing/import nodi, array/UDT/subtype custom/64 bit/DateTime, metodi/eventi/allarmi UA,
  rinnovo PKI guidato, conferme applicative PLC, ruoli/audit/storage server e commissionamento CPU.

### 103. Migrazione tooling sicura e collaudo LTS (2026-10-08)

- Vitest/mocker bloccati a 5.0.3, Tinypool rimosso: nessun override incompatibile, Vite resta
  7.3.6. Requisiti Node dichiarati nel manifest; verifiche con Node 24.19.0 LTS, senza modificare
  Node globale né riavviare l'app utente. API test disabilitata e clearMocks falso espliciti;
  isolamento per file conservato, due worker al massimo (uno per integration/build).
- Cache moduli in .hmi-preview/vitest-cache ignorata. La fixture del runtime conserva solo
  sorgenti/compilazioni immutabili: exports, timer, cataloghi e contesti restano istanze nuove.
  Nessun aumento dei budget di esecuzione script o timeout per mascherare errori.
- Nuovo test:public esclude sempre gli export privati; test e test:standard conservano il
  comportamento precedente. Le modifiche normali richiedono solo i percorsi interessati.
- Collaudo eccezionale del cambio runner: 99 file pubblici / 1346 casi. Primo passaggio:
  96 file e 1327 casi passati, 19 errori in tre file. Fixture evidenziazione corretta per le
  reazioni esplicite e dicitura gateway aggiornata da MQTT a PLC. Ripetuti soltanto i tre file:
  8 evidenziazione, 33 oggetti grafici e 38 runtime generato passati; i timeout sotto carico
  non si ripetono nel controllo isolato e la cache riduce il costo del test runtime.
  Non dichiarato un secondo passaggio verde dell'intera suite. Il controllo mirato di
  ritorno Desktop/Mobile, standard e preview comprende 47 casi passati, già inclusi sopra.
- Integration: 58 gateway MQTT/OPC UA reali loopback, 16 recovery del vero store compilato,
  3 generazione/bundling/watcher immagini. Allineata la fixture compilata al gateway comune,
  mantenendo l'alias MQTT; verificato che il manifest runtime escluda server OPC UA e Vitest.
  TypeScript e build editor isolata passati; restano gli avvisi di chunk/import misti.
- Audit npm autorizzato sul grafo completo: codice 0, zero segnalazioni note. Inventario
  offline: 375 npm, 44 scope MQTT, 127 OPC UA, nessuna dipendenza mancante; 4 review npm
  e 41 Cargo/266 Windows. Dequeue è solo tooling, LICENSE installato BSD-2-Clause;
  precond e tweetnacl restano le review SDK. Gate releaseApproved falso, nessuna approvazione
  legale/industriale. Dati macchina, certificati, cache e artefatti restano esclusi da Git.

### 104. Confronto e migrazione guidata dei faceplate (2026-10-08)

- Da Modifica → PLC e dati → Istanza faceplate, scegliere un'altra versione rilasciata apre
  una finestra di confronto prima di cambiare il sorgente. Mostra aggiunte/rimozioni/modifiche
  di tag, proprietà, eventi, locali, oggetti visuali, annidamenti, dimensioni e sorgente;
  tipi, firme, default e geometrie sono descritti con prima/dopo, senza JSON grezzo.
- Stesso tipo/nome/contratto compatibile: mapping PLC, valori espliciti e script si conservano.
  Campi rinominati rimappabili esplicitamente; script conservabili solo con stessi nomi/tipi
  e ordine dei parametri. Un altro tipo non eredita automaticamente i collegamenti omonimi.
  Tag obbligatori e tipi incompatibili bloccano la conferma; configurazioni eliminate o
  sostituite elencate e scartabili solo con checkbox esplicito. Interi 64 bit preservati come
  stringhe esatte, numeri fuori range/non finiti e Boolean impropri rifiutati.
- Comando nello store comune, con ricontrollo di documento, progetto, selezione/copia,
  ambito, catalogo faceplate e PLC anche dopo gli await. Una migrazione equivale a un undo;
  posizione/dimensioni/rotazione del contenitore e CRLF invariati. Nessuna connessione,
  scrittura PLC, migrazione di valori live o conservazione dello stato locale Runtime.
- Solo questa aggiorna una copia identificata dentro Array.map; lettura limitata ai literal
  e guardie di indice generate dall'editor, senza eval. Inserire il parametro di indice
  non perde la selezione. Tutte possibile per template statico; con configurazioni separate
  o indice mancante il flusso impedisce sovrascritture implicite e spiega come continuare.
- Dialogo responsive con label, focus contenuto/restituito, Escape, blocco del doppio invio e
  della chiusura durante il salvataggio. Nessuna toolbar aggiunta al canvas. README e roadmap
  aggiornati; stessa base riusabile in futuro per Optix/AI, senza dichiararne la parità.
- Verifiche mirate: 76 casi in sei file passati, piano puro, vero ispettore/store, catalogo,
  serializzazione, annulla/ripeti, selezione asincrona, copie ripetute e incompatibilità.
  TypeScript e build editor isolata passati; restano gli avvisi preesistenti di chunk/import
  misti. Nessuna suite generale, nuovi pacchetti, dati macchina pubblicati o riavvio dell'app.
  Collaudo visivo desktop/touch e prove su macchina restano separati dalle verifiche automatiche.
- Restano aggiornamento massivo tra pagine e istanze annidate, contratti dinamici arbitrari,
  migrazione dell'information model Optix e AI facoltativa. WCU-FP-06/ENG-12 restano PARZIALE.

### 105. Indirizzamento indiretto delle proprietà PLC (2026-10-08)

- WCU-TAG-06: opzione «Il tag sceglie un altro segnale» in Modifica → PLC e dati →
  Dinamica PLC. Il selettore WSTRING contiene il nome della destinazione; lo stesso
  selettore resta leggibile direttamente da altri oggetti. Tipo atteso esplicito,
  risoluzione nome/valore e rimedi visibili, label e controlli tastiera/touch.
- Risolutore e conversioni condivisi fra prova locale e nuovi pannelli autonomi:
  catalogo obbligatorio, nomi unici/esatti, accesso in lettura e tipi compatibili.
  Una dereferenziazione, senza eval o catene; autoreferenze e destinazioni non
  dichiarate bloccate. Rilevamento e rinomina del selettore nelle dinamiche statiche.
- La prova locale offre il campo della destinazione valida. Il Runtime reagisce ai
  cambi di selettore, destinazione e qualità; con gateway reale entrambi i campioni
  devono avere qualità Good conosciuta e nessun errore. Bad/incerta/mancante non
  riprende valori obsoleti: testo «—» o input numerico vuoto, stili statici ripristinati,
  Visible/Enabled disattivati e spiegazione nel campo/log, senza ripetere lo stesso errore.
- Veri campi IO input aggiornati tramite value, non textContent, e in sola lettura
  indiretta; bozza/valore/modificabilità ripristinati alla fine della prova. Nessuna
  scrittura implicita, coda comandi, connessione automatica o nuovo permesso PLC.
  Proprietà non supportate e URL eseguibili da tag non vengono applicati dal nuovo percorso.
- Pipeline standard include i moduli di risoluzione/espressione e il relativo Runtime.
  Anche le conversioni Tag dirette, Range/Singlebit/Expression usano il percorso
  condiviso nel pannello esportato. Nessuna riscrittura automatica dei pannelli vecchi.
- README/roadmap aggiornati; riallineate anche le righe UA/lettura-stati rimaste anteriori
  al client scalare del punto 102. Riferimenti ufficiali Unified V20 per il contratto
  WString; le corrispondenti pagine V21 non erano accessibili tramite il browser di ricerca.
- Verifiche mirate: 153 casi in undici file passati, inclusi vero ispettore, ponte
  in-memory, catalogo/rinomina, qualità, conversioni, input IO e Runtime generato;
  gateway simulato con sole GET, nessuna CPU o servizio macchina contattato. TypeScript
  e build editor isolata passati; avvisi preesistenti di chunk/import misti invariati.
  Fixture del ponte nuova isolata per non duplicare listener; solo testo compilato
  preparato prima dei test Runtime, mai istanze/stato condivisi. Nessuna suite generale,
  nuovi pacchetti, dati macchina pubblicati o riavvio dell'app dell'utente.
- WCU-TAG-06 resta PARZIALE: screen object, parametri delle funzioni di sistema e
  trasferimenti in ingresso/scrittura indiretta restano da implementare. Autorizzazioni
  server, collaudo CPU/TLS, verifica visiva desktop/touch, licenze/release, Optix e AI
  facoltativa non sono dichiarati completati da questi test.

### 106. Allarmi operativi nel servizio condiviso (2026-10-08)

- Pannello → Allarmi: finestra di configurazione ampia, nomi/testi/zona/priorità,
  classi e tre modelli di chiusura, Bool/bit set-clear e soglie sopra/sotto con
  isteresi. Solo tag dichiarati e leggibili, validazione di tipo/bit/collisioni,
  prova locale senza rete e salvataggio esplicito del catalogo. Nessun dato macchina
  inventato. Focus contenuto/restituito, label, target da 44 px e scarto confermato.
- `framecraft.alarms.json` salvato con snapshot di sessione/progetto/catalogo PLC,
  file temporaneo e sostituzione atomica: conflitti e JSON errato non sovrascrivono
  il catalogo. Nuovi comandi nativi richiedono il desktop aggiornato; non è stato
  riavviato o ricompilato l'eseguibile aperto dall'utente durante il lavoro.
- Motore condiviso Node/offline: gli `onSample` MQTT e OPC UA aggiornano gli allarmi
  indipendentemente dalle pagine/browser aperti. Bit interi esatti fino a 64 bit;
  analogici scalari fino a 32 bit o Real/LReal. Primo segnale assente = sconosciuto;
  qualità Bad/Uncertain/mancante e valori incompatibili conservano il guasto, non
  inventano rientri. Presa visione distinta dal segnale, conferma dopo rientro valido.
- Endpoint `alarm-action` con autenticazione gateway/origine e autorizzatore server
  obbligatorio; default negato, nessun attore/PIN dal browser, timeout, errori privati
  non esposti e ricontrollo occorrenza/revisione dopo autorizzazione asincrona.
  Concorrenza/stati vecchi rifiutati; nessuna scrittura PLC o ritentativo automatico.
  L'hook non implementa già identità/RBAC industriali: serve un backend verificato.
- Vista live/storico di sessione, ricerca, zona/classe, priorità e pagine da 100 righe.
  Filtri standard `Alarm_CTH`/`Alarm_History` conservati, filtro ambiguo segnalato;
  nessuna scrittura implicita di tag troubleshooting. Controlli interni rispettano
  blocchi dell'oggetto e non rilanciano il click del contenitore. Bozza ripristinata.
- Revisioni monotone e `instanceId` impediscono rollback da risposte ritardate e
  riuso dei comandi dopo riavvio. Scheduler alimentato solo dai nuovi eventi, senza
  riprodurre lo storico iniziale/duplicati di polling; gap diagnosticati. È per
  browser, non un esecutore server exactly-once: ownership multi-client da completare.
- Pipeline «Nuovo pannello standard» include catalogo vuoto, motore, vista, tipi e
  gateway aggiornato. Nessuna migrazione automatica dei vecchi pannelli. README,
  guida Runtime e roadmap allineati alla documentazione ufficiale Siemens V21.
- Verifiche mirate: motore/stati/tipi/qualità, dialogo e menu reali, filtri/accesso,
  salvataggio nativo con conflitti/cambio progetto/sessione, Runtime esportato/Scheduler
  e moduli generati; cataloghi null/false/non-oggetto bloccati prima dell'acquisizione;
  broker MQTT/HTTP isolato con due client e server OPC UA locale. La prima nuova
  fixture UA era disabilitata: corretta la fixture, prova specifica passata; nessun
  falso successo o modifica al driver per aggirare il problema. TypeScript e build
  editor isolata passati; avvisi di chunk/import misti preesistenti. Nessuna suite
  generale, nuova dipendenza, contatto CPU o riavvio dell'app dell'utente.
- Storico solo in memoria e limitato: restart perde eventi/prese visione. Restano
  archivio/recovery/audit, identità/RBAC, batch/shelving, altri modelli/comparatori,
  limiti da tag, import/multilingua, eventi controller, statistiche e notifiche.
  Clear Alarm Log disabilitato con spiegazione. Nessuna dichiarazione di parità o
  idoneità alla produzione; collaudo visivo desktop/touch e CPU reali ancora richiesto.

### 107. Indicatori e righe allarme nel pannello autonomo (2026-10-12)

- Nuovi componenti **Indicatore allarmi** e **Riga allarmi** in Aggiungi → HMI e PLC.
  Misure/stile Framecraft, non attribuiti all'export macchina; nessun tag, valore,
  indirizzo o collegamento inventato e nessuna riscrittura dei template reali.
- Configurazione nell'Inspector → PLC e dati: titolo, classi/zone/priorità minima,
  pendenti/attivi/da prendere in visione, contenuto, colori, visibilità e lampeggio
  opzionale; riga con 1–3 messaggi, recenza/priorità globale e orario locale/UTC.
  Persistenza JSX, undo/redo e selezione dello stesso elemento verificati con store reale.
  JSON errato o configurazione calcolata nel codice richiedono sostituzione esplicita.
  Campi errati non corrompono il contratto precedente. Il controllo progetto legge
  anche gli attributi JSX con stringa in espressione, senza eseguire codice o commenti.
- Motore condiviso: contatori separati per guasto, presa visione e conferma, qualità
  sconosciuta/Bad e servizio perso espliciti. Nessun catalogo/filtro vuoto/segnale
  assente mostrato come stato normale. La scomparsa è ammessa solo con tutti i
  segnali validi e nessun pendente; perdita qualità conserva l'ultimo guasto.
- Dettaglio filtrato con focus contenuto/restituito ed Esc, route solo interne
  presenti, aggiornamenti live e presa visione sul percorso server già protetto.
  Nessun comando PLC all'apertura/navigazione, replay o click del contenitore.
  Cambio filtri, rimozione, blocchi dell'utente e CSS/script chiudono il popup;
  selezione nascosta dai filtri e oggetto non utilizzabile non autorizzano azioni.
- Pannello → Allarmi mostra i due riepiloghi nella prova locale, sullo stesso motore
  della tabella, senza rete. Pipeline standard copia i moduli, riscrive gli import
  e passa le route al Runtime; aggiornamenti DOM senza loop e ripristino bozza allo
  smontaggio. Non vengono migrati automaticamente pannelli esistenti.
- Verifiche mirate: 134 casi in sette file interessati passati nelle selezioni
  specifiche; prova separata del generatore dopo bundling, TypeScript e build editor
  isolata passati. Due aspettative della nuova fixture Inspector corrette per
  identità AST a intervalli variabili e salvataggio reale dello store: nessuna
  modifica al prodotto per aggirarle. Ultimo stato di errore controllato anche
  per colore/descrizione accessibile, che non conservano il precedente stato normale.
  Il blocco temporaneo delle approvazioni ha impedito una prima build, non eseguita;
  servizio successivamente ripristinato e controlli completati. Avvisi preesistenti
  di chunk/import misti restano. Nessuna suite generale, agente, nuova dipendenza,
  contatto CPU o riavvio dell'app dell'utente; export macchina e segreti restano locali.
- README e guida Runtime aggiornati secondo Siemens V21, distinguendo i miglioramenti
  Framecraft (priorità globale e dettaglio opzionale della riga) dal comportamento vendor.
  WCU-CTL-04 passa a PARZIALE, non FATTO: mancano object model/eventi/proprietà completi,
  profili, altri fusi/timestamp di modifica e verifica visiva/touch. Archivio/recovery,
  identità/RBAC/audit e commissioning restano aperti; Optix/AI e gate industriali non
  vengono dichiarati completati da questa tranche.

### 108. Suggerimento della modifica visuale solo al primo accesso (2026-10-12)

- Il riquadro “Clicca un elemento della pagina” non viene più riattivato a ogni
  pagina: compare una sola volta per il profilo locale dell'editor. La prima
  visualizzazione viene conservata anche senza premere la X e rispettata alla
  riapertura dell'app; non dipende dal progetto o dal formato desktop/mobile.
- Resta visibile sulla prima pagina finché l'utente lo chiude, usa uno dei suoi
  pulsanti o inizia un'altra attività. Non torna dopo aver selezionato/deselezionato
  elementi o alternato Modifica/Usa il pannello. I pulsanti aprono ancora i rispettivi
  pannelli. Anteprima assente, in avvio o in errore non consumano la prima apparizione.
- Memoria locale protetta da errori, con fallback per la sessione quando è negata.
  Nessun riavvio dell'app dell'utente, migrazione HMI o nuova dipendenza.
- Verifiche mirate: 19 casi passati nei soli test del suggerimento e del recupero
  canvas, inclusi StrictMode, cambio pagina/progetto/formato e memoria non disponibile.
  La prova di un nuovo avvio è simulata ricreando i moduli con la preferenza conservata;
  non sostituisce un collaudo manuale nella finestra desktop.
  Controllo TypeScript mirato del canvas e delle fixture passato con i tipi Vite del
  progetto; le fixture usano i formati effettivi del pannello, non valori di viewport inventati.

### 109. Allarmi inseriti nella pagina: prova locale tramite ponte (2026-10-12)

- Indicatore, riga e lista allarmi inseriti nel pannello rispondono ai valori di prova
  dell'editor in **Usa il pannello**. Un solo motore locale per il progetto, con stato,
  qualità e revisione; nessun driver o collegamento PLC. Segnale non compilato = sconosciuto,
  non Good/zero. La dicitura SIMULAZIONE distingue la prova dal Runtime autonomo.
- **Modifica** chiude popup e ripristina nodi/stile della bozza. **Ferma la prova locale**
  azzera storico/prese visione locali; catalogo o progetto nuovo invalida il motore vecchio.
  Dialogo Allarmi e cache leggono la coppia catalogo/variabili nativa validata, senza
  indirizzi PLC nel modello. JSON errato non diventa catalogo vuoto, `null` è il solo file
  assente; letture tardive/superate non installano dati. Le modifiche non salvate del dialogo
  restano separate. Lettura corretta e salvataggio aggiornano la prova del canvas.
- Confine cross-origin verificato: renderer nel ponte dell'iframe, non chiamate DOM
  dal parent. Handshake, origine esatta, finestra, pageId e instanceId; il token pagina
  cambia anche sulle transizioni React rilevate senza cambio URL. Il motore conserva
  lo stato tra pagine ma rifiuta comandi di token, istanza, occorrenza o revisione vecchi.
  Richieste limitate, timeout con rimedio e nessun retry; i click interni non propagano
  eventi HMI del contenitore. Stop/Modifica chiudono le attese, nessun replay.
- Controlli condivisi in helper ESM dichiarati e copiati dalla pipeline standard, inclusi
  nella mappa risorse desktop. Dipendenze esplicite per la generazione del ponte: il primo
  test integrato ha rilevato i riferimenti riscritti dal caricatore Vite, corretti nel
  prodotto senza sostituire il vero plugin nella fixture. Sessione del motore nello store,
  acquisita in effect per lo StrictMode reale dell'app: la vista Codice non perde la prova,
  Stop funziona anche senza canvas e il cambio catalogo/progetto rilascia la sottoscrizione.
  HMR sullo stesso nodo o su un nuovo host preserva la
  bozza aggiornata. Clear Alarm Log di prova disabilitato con spiegazione, aggiornamenti
  idempotenti senza loop. Etichette popup uniche senza richiedere randomUUID al browser.
- Esito presa visione/errori conservato durante aggiornamenti identici; nuova selezione,
  stato o istanza non conserva esiti vecchi. Accesso, reazioni, visibilità/CSS continuano
  a bloccare i dettagli e le azioni. Queste protezioni locali non sostituiscono RBAC/audit server.
- Verifiche mirate: modello/cache, dialogo/menu, pannello PLC, controlli/riepiloghi e
  pipeline; dieci casi Canvas con vero ponte e accesso DOM negato, inclusi StrictMode,
  origini/finestre/snapshot falsi, vecchie pagine/istanze, stop e timeout. Coperti anche
  metadati riletti e smontaggio per vista Codice senza perdita dello stato locale.
  Verificate simulazione/eventi e selezione senza ciclo; prova separata del generatore dopo bundling,
  test Rust delle sole risorse desktop, TypeScript e build editor isolata. I mock usano
  firme/API e formati reali; nessuna suite generale, agente, contatto CPU o riavvio dell'app.
  Restano gli avvisi di chunk/import misti già presenti.
- Guide e architettura aggiornate con flusso, contratto, alternative e limiti; riferimenti
  Siemens V21 ricontrollati. WCU-CTL-03/04 restano PARZIALE. Il rendering preview diretto
  precedente di faceplate/trend è protetto dall'accesso negato, non dichiarato cross-origin
  funzionante: il trasferimento al ponte è il prossimo lavoro pertinente. Nessun pannello
  vecchio migrato, nuova dipendenza, asset vendor o export reale nel repository. Licenze,
  packaging senza checkout, archivio/audit e collaudo visivo/touch/CPU restano aperti;
  Optix e AI non vengono dichiarati completati.

### 110. Faceplate reali nella prova della pagina cross-origin (2026-10-12)

- Il parent invia catalogo, valori manuali e tag locali tramite snapshot con origine
  esatta e token pagina; il ponte disegna tipi, proprietà, composizione e popup nel
  documento del progetto. Nessun accesso DOM cross-origin, rete o collegamento PLC.
  Le immagini relative risolvono sul progetto; tooltip di prova e ripristino della
  bozza in Modifica senza cambiare palette, geometria o font configurati.
- Renderer unico ESM con facciata/declarazioni TypeScript; i moduli Runtime della
  pipeline derivano dalla stessa implementazione e il pacchetto desktop include
  i due helper nuovi. Default delle proprietà parent propagati ai figli; contenuti
  HTML/SVG personalizzati non sovrascritti e scritture popup idempotenti.
- Eventi di interfaccia non duplicano il click del contenitore e scrivono solo nei
  tag locali dell'istanza. Il primo test dei timer ha rilevato che il wrapper eventi
  non inoltrava contesto/tag locali: corretto nel wrapper, senza rimuovere le prove.
  Timer con valori locali, cancellazione/isActive e scarto del contesto precedente;
  niente write di nomi locali nel namespace PLC o in altre istanze.
- Popup conservano l'host durante geometria/visibilità/interfaccia. In Modifica sono
  nascosti; quelli legati alla pagina precedente si chiudono con il token nuovo.
  Guardia su eventi prima della coda/dopo l'esecuzione e letture catalogo faceplate/
  Data Log all'apertura che non installano risultati di un progetto superato.
- Verifiche mirate: otto casi Canvas con vero ponte, DOM negato, due istanze, script,
  timer, popup, HMR, documenti/immagini e messaggi estranei; renderer/delegazione eventi,
  solo due regressioni selezione/flashing, simulazione, generatore dopo bundling e
  tipi controllati. Fixture del vecchio popup aggiornata a origine/token/mode reali;
  nessuna riduzione delle verifiche per far passare il prodotto. Nessuna suite generale,
  agente, CPU contattata o riavvio manuale dell'app.
- Esiti finali: 19 casi Canvas/eventi, 18 renderer/simulazione, due regressioni selezione,
  dieci casi del ponte allarmi e generazione Runtime dopo bundling superati. TypeScript,
  build editor in cartella locale separata e singolo test Rust della mappa risorse superati.
  Gli avvisi di import statico/dinamico della build restano; nessun installer creato e
  nessun collaudo su finestra desktop reale, touch o CPU implicito in questi esiti.
- Riferimenti Siemens V21 ricontrollati e guide/architettura aggiornate. WCU-FP-* resta
  PARZIALE: eventi annidati, API complete, UDT, migrazione massiva e collaudo reale
  non sono completati da questa tranche. Passaggio delle curve/storico al ponte ancora
  da completare, poi restanti capacità WinCC, Optix e AI facoltativa. Export reali,
  foto, credenziali e output di build non pubblicati; gate licenze/produzione aperti.

### 111. Impostazioni dell’editor e comandi rapidi personalizzabili (2026-10-12)

- File → Impostazioni dell’editor apre una pagina ampia con Area di lavoro e Scorciatoie
  e comandi. Disposizioni/pannelli personalizzati, dimensione interfaccia, griglia e guide
  usano le preferenze esistenti; non modificano il pannello HMI finale.
- Catalogo condiviso di 25 comandi: file, modifiche, viste, Modifica/Usa, strumenti, zoom e
  guide. Fino a tre combinazioni per comando, rimozione/disattivazione, ricerca, registrazione
  diretta dei tasti, controlli su conflitti e tasti riservati, ripristino predefiniti e salva.
  Le modifiche alle scorciatoie sono bozze fino al salvataggio; chiudere le scarta. Errore
  di persistenza non sostituisce le preferenze attive. Stato locale versionato, niente rete.
- Ctrl+K apre la ricerca dei comandi, con frecce/Invio, comandi non disponibili disabilitati,
  hint aggiornati nei menu, focus confinato e ripristinato alla chiusura. Gestore tastiera
  unico per la shell; nel canvas stesso matcher e snapshot con origine/token pagina.
  Cambiare combinazione disattiva quella vecchia senza riavviare; cambio pagina riallinea
  le preferenze. Il protocollo nuovo rifiuta messaggi legacy senza token, obsoleti o estranei.
- Campo di testo mantiene undo/eliminazione nativi; niente comandi distruttivi in Usa,
  dietro dialoghi o durante caricamento/recupero/esportazione. Modificatori solo premuti,
  composizione e ripetizioni dei comandi ignorati, ma repeat delle frecce di movimento
  conservato. Cancellazione resta legata alla copia selezionata e al contesto corrente.
- Predefiniti senza Ctrl+Alt per evitare dipendenze dalla distinzione con AltGr; zoom con
  entrambe le varianti del tasto +. AltGr non è registrato come scorciatoia; avviso chiaro
  se il browser interpreta così la combinazione. Riferimento verificato: [MDN getModifierState](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState).
- Il primo test UI ha trovato l'avviso di conflitto riferito al comando modificato invece
  del proprietario precedente: corretto nel prodotto. Test nuovi e regressioni mirate di
  barra, canvas, selezione e risorse; nessuna suite generale, agente o riavvio manuale.
  Le prove automatiche non certificano finestra desktop/tastiera fisica o pacchetto finale.
- Esiti: 61 casi frontend distinti verificati nel blocco (25 tastiera/impostazioni/canvas,
  23 barra, 12 protocollo selezione, una cancellazione obsoleta), incluso repeat delle
  frecce; singolo test Rust risorse, TypeScript e build finale separata superati.
  Restano i precedenti avvisi di import statico/dinamico della build; nessun installer.
- Nessuna dipendenza nuova, codice o export Siemens copiato, JSON macchina, foto o segreti
  pubblicati. Macro/sequenze e comandi del Runtime HMI non sono inclusi in questa tranche;
  restano curve/storico nel ponte, WinCC restante, Optix, AI facoltativa e gate produzione.

### 112. Curve e storico nella prova locale cross-origin (2026-10-12)

- Il test con Canvas/ponte reali e contentDocument negato riproduceva l’assenza del
  grafico. Rimosso l’accesso DOM dal parent: disegno nel documento del progetto con
  la stessa implementazione ESM del Runtime generato, facciate e dichiarazioni TS.
  Risorse incluse nel pacchetto desktop, nessuna dipendenza aggiunta.
- Valori/qualità manuali e sorgenti via snapshot; Data Log interrogato nel parent solo
  per gli intervalli richiesti. Cache/revisioni, lease/catalogo/progetto/pagina/origine
  verificati, richieste vecchie scartate. Batch e timeout limitati; mancata risposta
  spiegata nel controllo, Vista originale per retry esplicito, niente campioni inventati.
- Tempo e X/Y conservano toolbar, zoom/pan/area, righello, pausa, visibilità, sorgenti,
  intervalli, qualità e CSV. Modifica ripristina nodi/attributi della bozza; HMR conserva
  la nuova bozza. Raccolta idempotente dei controlli evita il ciclo delle mutazioni SVG.
  Clear/ripristino XY non duplica listener; selettori mostrano le sorgenti di sessione.
- Comandi interni non duplicano gli eventi del contenitore e rispettano il blocco
  d’interazione nella prova. Filtro coerente anche nel Runtime standard, comprese le
  azioni dei pulsanti interfaccia faceplate già marcate dal renderer condiviso.
- CSV preparato dal parent, senza estendere il sandbox. Celle quotate e prefissi formula
  trattati come testo, numeri negativi preservati; messaggi distinguono preparazione
  e salvataggio. Il download reale desktop deve ancora essere collaudato.
- Test mirati con dati sintetici e ponte reale: grafici, storico aggiornato, pausa,
  Modifica/Usa, HMR, contenuti SVG personalizzati, permessi, origini, pagina/catalogo,
  sorgenti temporanee, timeout/retry e CSV. Renderer/modello, generazione dopo bundling
  e risorse desktop verificati. Nessuna suite generale, agente, CPU o riavvio manuale.
- Esiti: 40 casi curve/modello/renderer, 13 regressioni del ponte allarmi/scorciatoie,
  singola generazione Runtime dopo bundling e singolo test Rust risorse superati.
  TypeScript e build editor separata superati; avvisi import statico/dinamico preesistenti.
  Fixture HMR corretta per eseguire requestAnimationFrame e valore verificato nel righello,
  non attribuito impropriamente alla legenda che mostra solo il nome della curva.
- Documentazione Siemens V21 ricontrollata e guide/architettura aggiornate. WCU-CTL-05/06
  resta PARZIALE: fusi orari, aggregazione per pixel, stampa/profili, object model e
  collaudo reale restano. Poi restanti capacità WinCC, Optix e AI facoltativa; gate
  industriali/licenze aperti. Export reali, foto, segreti e output di build esclusi dal push.

### 113. Aiuti e preferenze raccolti nelle Impostazioni (2026-10-12)

- File → Impostazioni dell’editor raccoglie Area di lavoro, Scorciatoie e comandi,
  e Aiuto e suggerimenti. Preferenze dell’app condivise tra progetti: non sono una
  pagina HMI e non modificano i sorgenti o inviano comandi al PLC.
- Controllo persistente del suggerimento iniziale: disattivazione immediata,
  prima apparizione ancora unica, Rivedi il suggerimento esplicito una sola volta.
  La richiesta aspetta una pagina pronta in Modifica. Memoria locale negata:
  comportamento conservato nella sessione e avviso comprensibile nelle Impostazioni.
  Avvisi di errore e sicurezza non disattivabili tramite questa preferenza.
- Guida unica condivisa tra Aiuto e Impostazioni, ora con mini guida MQTT/OPC UA
  esistente, diagnosi degli errori e limiti di sicurezza. Focus confinato, dettagli
  accessibili da tastiera, Esc e ripristino focus; corpo scorribile e layout stretto.
  Nessun tema, font, dipendenza o asset nuovo. La skill UI ha guidato accessibilità
  e continuità dello stile; revisione e documentazione mantengono espliciti i limiti.
- Bozza scorciatoie conservata passando tra sezioni, salvataggio disponibile anche
  fuori dalla sezione Scorciatoie; apertura guida sospesa finché la bozza non è salvata.
  Griglia Libero (0 px) correttamente conservata dopo la riapertura dell’editor.
- Verifiche mirate: 58 casi tra impostazioni, guida, preferenze, prima apparizione e barra;
  TypeScript e build editor separata superati. Avvisi di import statico/dinamico
  preesistenti. Nessuna suite generale, agente o riavvio
  manuale dell’app. Non costituiscono collaudo visivo/desktop o messa in produzione.
  Roadmap WinCC/Optix/AI e gate industriali restano aperti; export reali, foto,
  segreti e output di build esclusi dal commit.

### 114. Fusi orari e aggregazione delle curve per pixel (2026-10-12)

- Inspector e toolbar Runtime del Trend Control temporale: ora del dispositivo, UTC,
  fusi IANA comuni/personalizzati; timestamp con offset per distinguere le ore ripetute
  nel cambio d’ora. Fuso non valido segnalato con rimedio e ripiego esplicito UTC.
  CSV sempre ISO UTC; cambio fuso non modifica timestamp, dati, sorgenti o progetto.
- Configurazioni precedenti compatibili: local e media temporale a gradini predefiniti.
  Aggregazione quando i campioni superano i pixel CSS disponibili, massimo 4096 bucket;
  media pesata sulla durata del valore mantenuto e modalità min/max (primo/ultimo/min/max).
  Nessuna media aritmetica spacciata per TimeAverageStepped, nessun valore inventato prima
  del primo campione noto. Riduzione della sola geometria: assi, righello e CSV originali.
- Qualità peggiore per bucket; Bad rende invalido tutto il pixel per evitare continuità
  apparente. Min/max non espone picchi validi dentro un pixel che contiene Bad; i campioni
  restano disponibili nel righello e nel CSV. Qualità assente dichiarata, non convertita
  in Good. Contatori/descrizione rendono distinguibili dati originali e punti aggregati.
- Query Data Log opzionale con un solo predecessore, clonato come gli altri risultati.
  Query ordinarie immutate; ponte/cache della prova e Runtime standard usano lo stesso
  predecessore per la media al bordo sinistro. Pausa conserva anche quel campione;
  cambio Modifica/Usa conserva preferenze di sessione, Vista originale torna al progetto.
- La regressione mirata ha riprodotto un click sui nuovi selettori che attivava l’azione
  del contenitore: corretti i filtri di anteprima e Runtime standard, senza inviare
  eventi/azioni HMI quando si cambia soltanto il fuso o l’aggregazione del grafico.
- Implementazione ESM condivisa tra anteprima e progetto generato, senza dipendenze,
  font, database timezone o codice vendor aggiunti. Intl del browser fornisce i fusi:
  aggiornamento dati timezone e target desktop richiedono collaudo. Nessuna CPU collegata,
  agente, suite generale o riavvio manuale dell’app; export/foto/segreti/build esclusi.
- Test mirati: ora legale/invernale e ora ripetuta Roma, media a gradini vs aritmetica,
  predecessore e copertura parziale, ordinamento/duplicati, limiti frazionari e centomila
  campioni, picchi/qualità, CSV/righello originali, campi Inspector, ponte/cache reali e
  mantenimento sessione. Singola generazione dopo bundling prova gli stessi helper.
  Esiti: 65 casi frontend pertinenti, generazione Runtime dopo bundling, TypeScript
  e build editor separata superati; avvisi di import statico/dinamico preesistenti.
  La skill UI guida etichette/rimedi senza cambiare tema; revisione e documentazione
  mantengono espliciti i limiti. Non è un collaudo fisico, visivo o di carico desktop.
- Fonti Siemens V21 ricontrollate: [aggregazione valori](https://docs.tia.siemens.cloud/r/en-us/v21/operating-unified-pc-rt-unified/controls-rt-unified/displaying-tags-in-runtime-rt-unified/trend-control-rt-unified/value-aggregation-rt-unified),
  [fusi dei controlli](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/overview-of-the-time-zones-rt-unified).
  Framecraft usa una griglia deterministica di pixel CSS e IANA, non replica i codici
  numerici né l’algoritmo interno di caricamento del vendor. WCU-CTL-05 resta PARZIALE:
  stampa, profili, object model e collaudo reale aperti; WinCC restante, poi Optix e AI
  facoltativa, con gate industriali/licenze, restano l’obiettivo completo.

### 115. Prova pannello — schermo intero reale e ritorno sicuro (2026-10-13)

- `Pannello → Prova pannello` attiva lo schermo intero della finestra desktop,
  non soltanto un iframe esteso sull’editor. Nel browser la richiesta parte dal click;
  nessun salvataggio, collegamento PLC o riavvio viene eseguito per aprire la prova.
- Esc e il comando superiore `Torna all’editor` chiudono la prova e ripristinano
  lo stato fullscreen precedente. Ingresso/uscita serializzati: chiusura durante
  l’avvio e riapertura rapida non lasciano una richiesta vecchia attivare la finestra.
  Uno schermo intero già attivo prima della prova non viene disattivato dal comando.
- Esc funziona anche con focus nell’iframe grazie a un canale limitato alla chiusura,
  con verifica origine, finestra e token. Il nome del frame mantiene la modalità
  prova nei cambi pagina, senza riattivare selezione/trascinamento dell’editor.
  Le scorciatoie di modifica restano sospese durante la prova; focus confinato
  nella finestra di prova e restituito al comando originale quando disponibile.
- Rifiuto/assenza fullscreen: pannello ancora disponibile, avviso leggibile,
  dettagli in diagnostica e pulsante `Schermo intero` per riprovare senza ricaricare
  il pannello. Comandi superiori leggibili e raggiungibili anche al tocco;
  nessun cambio di tema/font né toolbar nuova in basso. Guida rapida aggiornata.
- Permesso aggiunto: solo `core:window:allow-set-fullscreen` alla finestra locale
  main. Nessun permesso remoto, dipendenza o codice vendor aggiunto.
  [API finestra Tauri](https://v2.tauri.app/reference/javascript/api/namespacewindow/#setfullscreen)
  verificata insieme al manifest locale: isFullscreen già incluso, setFullscreen
  richiede il permesso esplicito. Nuovo permesso disponibile nella nuova build/avvio
  desktop; non è stato riavviato manualmente il processo usato dall’utente.
- Collaudo della finestra desktop reale/WebView, touch e installer ancora necessario.
  I test sintetici verificano ciclo finestra, iframe e fallback, non attestano
  un collaudo fisico. Profili trend in lavorazione esclusi da questo commit;
  roadmap WinCC → Optix → AI facoltativa e gate industriali restano aperti.
- Esiti sul codice esatto da pubblicare, in copia isolata senza i profili trend:
  32 controlli mirati (30 ciclo/iframe/scorciatoie, 2 menu/guida), TypeScript e build
  editor superati. Solo avvisi static/dynamic import già presenti. Nessuna suite
  generale, nuovo agente, collegamento macchina o riavvio manuale dell’app.

### 116. Pipeline AI facoltativa e creazione tramite domande mirate (2026-10-14)

- Priorità dell’utente: AI + app prima delle funzionalità WinCC/Optix residue. Codex CLI con
  account ChatGPT individuale per adesso, adapter separato per passare ad API in futuro.
- Nuovo pannello ora chiede Con AI/Senza AI. Percorso AI a passi adattivi: macchina/processo,
  desktop/mobile, numero e piano esatto delle pagine, tag, lista allarmi quando serve,
  contenuti/immagini di ciascuna pagina, protocollo previsto, lingua e necessità dei ruoli.
  Nessuna richiesta iniziale libera. Domande aggiuntive del modello hanno campi separati.
- Immagini richieste/facoltative/non desiderate, screen specifico per il sinottico e targhette
  separate editabili. Input mancanti si rimandano esplicitamente. Tag JSON/CSV (2 MB/5000 tag)
  e allarmi Framecraft JSON validati contro tag leggibili/trigger. Nessun dato operativo inventato.
- Piano esplicito nello stesso standardProjectFiles: numero esatto di pagine, categorie,
  router e manifesto coerenti, asset distinti per pagina, cataloghi reali locali e requisiti
  in framecraft.requirements.json. Valori/curve legati solo ai tag scelti; comandi disabilitati
  da configurare e collaudare. Gateway spento; protocollo/ruoli/inglese sono requisiti residui.
- Account e modello al momento dell’invio, consenso revocato quando cambiano le risposte;
  nessun login/inferenza implicita. Profilo Codex locale separato, canale JSON App Server,
  richieste correlate, output tipizzato/bounded, annullamento, timeout, errori con rimedio.
  Shell, agenti, web search e approvazioni strumenti non concessi. Foto, file, tag, indirizzi,
  token e percorsi non passano al provider: solo risposte e conteggi approvati.
- AI in editor ancora limitata a testo/stile del selezionato: revisione parziale, guardie su
  sorgente/selection/bozza/istanze condivise e un Annulla/Ripeti. Corretto il testo JSX
  statico per non trasformare input come {alert(...)} in codice eseguibile.
- Verifiche mirate: interviste e generatore, UI a passi/Indietro, provider sintetico,
  guardie/applicazione/undo, test native Codex; tipi e build isolata del codice pubblicabile.
  Protocollo confrontato con CLI locale 0.159.2, NON login o inferenza reali. Occorre nuova
  build/avvio desktop per i comandi nativi e collaudo con account scelto dall’utente.
- Restano: questionario persistente dopo riavvio, altri formati allarmi/PDF, comandi operativi
  da mapping approvati, ricette, traduzioni, ruoli server, undo multi-file atomico, licensing,
  privacy/eval e prove hardware/guasti. Profili trend avviati prima della nuova priorità restano
  separati/incompleti, non pubblicati in questo commit. Nessuna dichiarazione di pipeline totale conclusa.

### 117. Account ChatGPT e modello nelle Impostazioni (2026-10-14)

- Tutti i controlli account/modello spostati in Impostazioni → AI e account: collegamento,
  verifica dell’accesso completato/account salvato, scollegamento e modello. Impostazioni
  accessibili anche dalla schermata iniziale, prima di aprire un progetto.
- Nella schermata AI resta l’avviso di collegare ChatGPT nelle Impostazioni, con accesso
  diretto alla sezione. Dopo il ritorno risposte, pagina del questionario e richiesta di
  modifica restano conservate. Durante Impostazioni/guida l’AI è nascosta e il suo focus trap
  sospeso: Esc chiude il dialogo visibile senza chiudere quello AI sottostante.
- Osservazione notifiche account al livello app, non nel dialogo: fine login recepita anche
  dopo aver chiuso le Impostazioni. Nessuna verifica account/login/inferenza all’apertura;
  richieste solo da clic esplicito o notifiche del flusso già avviato dall’utente.
- Errori account separati dagli errori delle proposte; stato di verifica, guardie sui pulsanti
  e correlazione delle risposte per non ripristinare account vecchi dopo lo scollegamento.
- Test mirati su impostazioni, UI AI, provider sintetico, notifiche tardive, ritorno/focus,
  bozza preservata e nessuna inferenza implicita; tipi e build del solo codice pubblicabile.
  Non ripetuti test native/PLC/standard non modificati. Login/inferenza reali restano da
  collaudare nella nuova build desktop, come al punto 116.

### 118. Mapping operativo dei comandi nel questionario AI (2026-10-14)

- Comandi manuali: per ogni pulsante si può rimandare (disabilitato) oppure configurare una
  scrittura singola con evento operatore, tag importato/scrivibile, valore scalare compatibile,
  permesso e conferma esplicita del mapping. Il modello non riceve nomi tag/indirizzi/valori
  e non può sostituirli: la generazione usa il piano locale approvato.
- Stessa SetTagValue/IR, serializzazione eventi e Runtime dell’Inspector, senza eval o un
  secondo percorso PLC. Eventi del generatore: click, doppio click, click destro/tocco lungo;
  nessuna scrittura su Loaded/Initialized. Gate utente bloccato senza grant; ruoli richiesti
  non possono diventare implicitamente Tutti. La regola UI non sostituisce RBAC server/PLC.
- Conferma revocata cambiando valore/evento/permesso/tag o reimportando il catalogo. Label
  rinominate e righe cancellate/riordinate/duplicate non ereditano l’azione del nome sbagliato.
  Riepilogo locale visibile prima di creare. Cataloghi duplicati/rilevati/sola lettura,
  tipi/valori incompatibili, script aggiuntivi e permessi inventati vengono rifiutati.
- Verifiche mirate su UI, generatore, escaping, privacy, IR asincrona e Runtime autonomo:
  niente azioni al caricamento; permesso richiesto, doppio click, sospensione/cleanup, una
  sola scrittura, ricevuta non PLC e nessun replay. Tipi/build isolati dal lavoro trend.
- Confronto con documentazione Siemens V21 eventi e Rockwell Button (URL nel README).
  Nessuna dipendenza aggiunta o asset vendor distribuito; gate licenze/notice e commissioning
  restano quelli della roadmap production. Connessioni inizialmente spente e nessuna CPU reale
  o account AI coinvolti nei test: trasporto mock e simulazione locale non provano la macchina.
- Restano comandi a uomo presente con lease/watchdog/interlock PLC, altri script/azioni,
  ruoli server, collaudo login/inferenza reale e recupero persistente del questionario.
  Da rimuovere anche i valori macchina campione dal guscio dei progetti guidati: non vanno
  presentati come dati reali quando tag e connessione sono mancanti. Obiettivo globale ancora aperto.

### 119. Raccolta estesa dei requisiti nella pipeline AI

- Dodici aree con oltre sessanta domande mirate: dispositivo/grafica, navigazione/oggetti
  riutilizzabili, PLC/qualità/unità, comandi/sequenze, allarmi, trend/archivi, ricette,
  produzione/manutenzione, utenti/audit, lingue/accessibilità, report/documenti/integrazioni
  e pubblicazione/backup/collaudo. Forme condizionali; non serve / da completare espliciti.
- Le funzioni richieste aprono i dettagli senza aggiungere pagine di nascosto. Le pagine
  dedicate richiedono le proprie domande; ricette/produzione/manutenzione/report sono strutture
  dichiaratamente incomplete, non controlli operativi finti. I dettagli condizionali nascosti
  rimangono locali per riprendere il lavoro, ma non sono nel contesto AI attivo.
- Nuovo catalogo requisiti tipizzato e validato. Riepilogo con modifica per area; conservazione
  in framecraft.requirements.json tramite lo stesso generatore standard. Nessun segreto richiesto.
  Dettagli tecnici testuali locali, modello limitato a scelte validate e disponibilità.
- Applicazione reale della pagina iniziale e della finestra/campionamento dei trend online.
  Risoluzione standard letta da hmiStandard (1280x800), non assunta dall’interfaccia dell’editor.
  Rifiuto di piano solo monitoraggio con comandi di scrittura e ruoli senza accesso previsto.
- Verifiche mirate su domande condizionali, privacy, conservazione/rinvii, riepilogo, vecchi
  piani, route/layout, config trend, AST JSX e persistenza. Nessun login AI o PLC reale nei test.
- Restano interpretazione/import di documenti e ricette, generazione operativa delle funzioni
  non supportate, server auth/audit/storage, stile/risoluzioni automatiche, publish/exe/installer,
  recupero del questionario dopo riavvio e commissioning. Raccolta non equivale a implementazione
  né approvazione industriale. Modifiche trend/profile rinviate conservate e non pubblicate.

### 120. Funzionamento dichiarato dei template per l’AI

- Tutti i template del catalogo standard e tutte le basi guidate hanno una scheda versionata:
  scopo, comportamenti noti, input macchina, stato di implementazione, limiti e default. Le basi
  vuote non diventano funzioni operative per una verifica visiva; le pagine web dipendono da
  servizi esterni e non inventano KPI, diagnostica o ricette.
- Catalogo pagine e intervista mostrano le stesse schede, con dettagli progressivi. La richiesta
  AI include solo i contratti selezionati una volta e le pagine li referenziano per ID/versione.
  Istruzioni contro domande ridondanti su comportamento già noto; tag, foto, consensi e permessi
  reali sono ancora ingressi da fornire/rimandare, mai dedotti dal template o dal nome del motore.
- Risoluzione/stile/menu e default trend online/storico sessione sono ereditati dai generatori
  effettivi. Personalizza apre il controllo; Usa impostazione del template ripristina l’eredità.
  Risposte e rinvii espliciti prevalgono; il questionario non viene mutato dal calcolo del piano.
- Salvataggio dei contratti in framecraft.templates.json e marcatori sulle nuove pagine. Anche
  l’assistente sugli elementi conosce la base dal genitore; non legge/invia il sorgente o percorsi.
  ID/versioni sconosciuti e vecchie pagine rimangono senza scheda, senza inferenze inventate.
- Verifiche mirate su catalogo, deduplicazione, eredità/rinvii, privacy, generazione, contesto edit
  e UI. Nessun login/inferenza o PLC reale avviato dai test; scelta automatica tra tutto il catalogo,
  analisi della semantica dopo modifiche e commissioning restano lavori separati. Il collegamento
  account riuscito è stato riferito dall’utente; ciò non verifica la generazione di un pannello.
- Nessun agente o riavvio manuale dell’app; lavoro trend/profile locale conservato e non pubblicato.

### 121. Domande delegabili nella pipeline AI (2026-10-14)

- “Lascia scegliere all’AI / Rispondo io” per le domande iniziali, piano pagine, contenuti,
  uso, requisiti e domande aggiuntive. Stato esplicito distinto da campo vuoto/rinvio;
  risposta precedente conservata ma esclusa dal contesto quando la domanda è delegata.
- Decisioni del provider con sole chiavi riconosciute e valori validati. Scelte non delegate
  vincolanti; numero/piano delegato può aggiungere pagine ma non sostituire quelle scelte.
  Risposte mancanti/duplicate, opzioni sconosciute e dati operativi inventati rifiutati prima
  di scrivere. Segnaposto di prevalidazione non possono diventare un progetto approvato.
- Riepilogo delle scelte AI, piano effettivo e parti residue prima della scelta cartella;
  nessuna inferenza implicita sul salto e nessuna creazione prima di approvazione. Correzioni
  alle risposte invalidano proposta e piano risolto senza cancellare le risposte originali.
- Input reali già forniti conservati localmente. Tag, endpoint/protocollo macchina, condizioni
  allarmi, foto reali, interblocchi e permessi non dedotti. Etichette proposte scollegate;
  comandi non configurati disabilitati. Accesso saltato resta “da definire”: nessun nuovo
  permesso; mapping senza autorizzazione reale non inseriti nella proposta eseguibile.
- Verifiche mirate con provider finto su delega/recupero, privacy, guardie, generazione,
  riepilogo/approvazione, immagini/elementi incompatibili e ID pagina. Inferenza reale e
  commissioning PLC restano da collaudare; i test non consumano richieste ChatGPT.
- Nessun agente o riavvio manuale dell’app; modifiche trend/profile rinviate conservate.

### 122. Collaudo della pipeline su disco e browser reale (2026-10-14)

- Nuovo check mirato `scripts/check-generated-panel.mjs`: proposta AI sintetica validata con
  deleghe, generatore effettivo, comando nativo `create_vite_project`, copia SVG di prova,
  dipendenze del progetto generate/installate da cache e build TypeScript/Vite del pannello.
  Router e browser reali, nessuno stub del router. Percorso dati senza account o PLC reale.
- Trovati e corretti errori TypeScript nel Runtime esportato (callback, dipendenze dei tag,
  valori di scrittura e contesti opzionali), senza disattivare la modalità strict del progetto.
  Scritture controllate come lotto prima dell’applicazione; nessun valore o segreto nei messaggi.
- HTML dei nuovi progetti completo di doctype, UTF-8, viewport mobile e favicon incorporata:
  browser mobile prima misurava 981 px su dispositivo da 375; dopo misura 375. Non disabilitato
  lo zoom. Corretta la favicon 404, senza nascondere gli errori della console nel check.
- Ritorno alla scelta dispositivo accessibile anche scegliendo Desktop su schermo piccolo:
  spazio separato dal pannello, nessun passaggio automatico a Mobile. Verificati click normali,
  navigazione persistente, Desktop → scelta → Mobile e modifica sorgente/HMR senza perdere layout.
- Check completo riuscito; 15 regressioni Runtime mirate, 2 nuovi test sui contratti scrittura,
  due test nativi di creazione e tipi del codice pubblicabile. Nessuna suite generale, agente,
  richiesta ChatGPT, connessione PLC o riavvio manuale della finestra utente.
- Limiti: risposta AI simulata, funzione nativa chiamata dal test (non dialogo cartella/IPC/UI
  desktop), browser touch emulato e trasformazione sorgente (non Inspector nella finestra reale).
  Inferenza Codex reale, handoff completo nell’app, commissioning e gate di produzione ancora aperti.
  Modifiche trend/profile rinviate conservate e non pubblicate.

### 123. Barra del pannello generato senza dati macchina inventati (2026-10-14)

- Il generatore standard e la pipeline AI usano la stessa barra: orologio locale del
  dispositivo, identità dal servizio accessi già configurato (nessun account creato),
  riga allarmi dal motore/catalogo reale. Eliminati orario, emergenza, DefaultUser,
  linee/formati aggiuntivi, Production/Aborted e velocità 40 fissi.
- Con tag importati il questionario propone un passo facoltativo per linea, formato,
  stato, modalità e velocità. Solo tag scalari leggibili dichiarati; unità e limiti
  reali non vengono indovinati. Riepilogo locale prima dell’approvazione. Il contesto
  AI contiene soltanto disponibilità dei collegamenti, non nomi tag, unità o limiti.
- Configurazione locale versionata in `framecraft.header.json`, con validazione:
  un contratto errato mostra “Barra da configurare” e dati assenti, non valori demo.
  Lo stato numerico rimane un codice grezzo: nessuna semantica PackML dedotta.
- Corretto il resolver diretto dei tag, che prima ignorava qualità/stato. Bad,
  Uncertain, qualità ignota richiesta o errore non mantengono il vecchio valore;
  la prova manuale offline senza stato resta disponibile. La barra richiede sempre
  qualità valida, si aggiorna anche su campioni di sola qualità e azzera il meter
  indisponibile. Scala non fornita esplicitamente resta “da configurare”.
  Un valore di prova locale non eredita la qualità di una precedente lettura PLC;
  un nuovo campione reale rimuove il marcatore locale. Prova manuale offline invariata.
- Indicatori allarmi: totale sconosciuto non diventa zero; eventuali guasti conservati
  restano visibili come stato parziale/ultimo noto, senza dichiarare la macchina sicura.
- Riferimento primario: [Siemens, Quality codes of HMI tags V21](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/reference-rt-unified/quality-codes-of-hmi-tags-rt-unified?contentId=aus7OTFCo~JQoXJTNeE~hA).
  Framecraft usa qualità normalizzata 16 bit, non lo StatusCode OPC UA UInt32 grezzo.
- Verificati 102 test mirati di barra/intervista/privacy/allarmi/tag, 4 regressioni del
  Runtime generato, tipi e build del codice pubblicabile, strict build e browser reale
  del nuovo pannello (viewport 375, navigazione, Good → Bad solo qualità → Good, meter,
  modifica sorgente/HMR, nessun errore o traffico PLC). Le modifiche trend/profile
  rinviate sono rimaste fuori dalla copia di verifica e dal commit.

### 124. Prova autorizzata con Codex reale nella pipeline (2026-10-14)

- Dopo il consenso esplicito dell’utente eseguita una sola richiesta reale tramite il
  profilo ChatGPT già collegato di Framecraft. Modello predefinito del catalogo nativo:
  `gpt-6.1-sol`; account/email/token non stampati e nessuna credenziale copiata.
- Il test riusa `start_profile` e `propose`, gli stessi percorsi del comando Tauri:
  callback eventi separata dal trasporto, non un provider AI imitato. Sei regressioni
  native pertinenti passate. La richiesta reale è completata, non solo “avviata”.
- Invio dell’intervista sintetica effettiva e dello schema della UI; nome macchina
  delegato, tre pagine esplicite, immagine fittizia locale. Risposta accettata dal parser
  strict, decisions risolte e progetto confrontato con tutte le risposte locali.
  Nessun tag macchina, immagine reale o collegamento PLC inviato/eseguito.
- `--real-ai` nel check è opt-in: test Rust normalmente ignorato, consenso dedicato,
  registro locale `ai-attempt.json` creato atomicamente e nessun reinvio automatico.
  Artefatti/risposta solo in `.hmi-preview`, esclusi dal repository pubblico.
  Regressioni successive possono riusare soltanto la risposta completata e correlata,
  con identità richiesta, prompt e schema invariati: nessuna nuova inferenza automatica.
- Con la risposta reale: creazione nativa su disco, copia immagine, dipendenze cached,
  build TypeScript strict/Vite, browser/router reali, persistenza mobile/desktop e
  ritorno alla scelta, qualità della barra, trasformazione sorgente/HMR: tutto passato.
- Limiti ancora aperti: non automatizzati i click del questionario, dialogo cartella,
  Tauri IPC ed Inspector nella finestra reale; nessuna CPU/commissioning industriale.
  Il risultato prova la catena motore/provider/generatore/pannello, non ogni gesto UI.
- Gate commerciale: la [documentazione ufficiale App Server](https://learn.chatgpt.com/docs/app-server#authentication-endpoints)
  permette di continuare l’integrazione locale/open-source, ma esclude l’autenticazione
  App Server per servizi commerciali/hosted. Prima di una distribuzione commerciale
  verificare l’idoneità del caso d’uso e migrare ad API o Sign in with ChatGPT autorizzato.
  Per adesso rimane Codex CLI, come richiesto dall’utente; nessuna migrazione automatica.


### 125. Correzioni emerse dalla pipeline AI reale (2026-10-15)

- Creazione transazionale: controlli preliminari su percorsi e immagini, preparazione in
  directory temporanea sorella e validazione prima della rinomina finale. Immagini assenti,
  bloccate da Windows, file generati in conflitto o entrypoint mancante non lasciano progetti
  parziali nella destinazione; la stessa cartella vuota può essere riutilizzata. File esistenti
  e collegamenti non vengono sovrascritti. Serve accesso alla cartella superiore e supporto
  del filesystem alla rinomina; gli errori indicano anche di provare un disco locale.
- Nome package npm normalizzato separatamente dal nome umano della cartella: accenti,
  parentesi e altri caratteri non producono un package.json invalido.
- Dopo un errore è possibile sostituire un’immagine già disponibile o un mapping locale
  valido mantenendo il piano: confronto dell’intero prompt validato, nuova risoluzione delle
  deleghe e nuova validazione locale. Nessun invio aggiuntivo se il contesto è identico;
  modifiche a pagine/scopo/risposte pubbliche invalidano la proposta. La UI segnala i dati
  aggiornati e mantiene le risposte aggiuntive pertinenti. Approvazione finale sempre esplicita.
- Annullare il dialogo cartella non ripresenta un errore vecchio e non cambia il progetto aperto.
- Template Vite condiviso per nuovi pannelli: chunk applicazione/Runtime/vendor separati,
  senza alzare o nascondere la soglia; notice delle dipendenze client in
  `dist/THIRD_PARTY_NOTICES.md`. Non equivale all’approvazione licenze dell’intero prodotto.
- Verificati 66 test mirati intervista/UI/store/build e 9 test nativi della creazione,
  compresi retry, immagine bloccata e protezione dei file già presenti. Nessuna suite generale.
- Riusata la risposta reale già completata, con identità/prompt/schema confrontati: nessuna
  nuova inferenza. Sulla copia del codice pubblicabile: tipi e build editor, creazione nativa,
  dipendenze offline, strict build del pannello, browser dev/HMR e browser produzione passati.
  Tre chunk da 19 246, 239 457 e 260 354 byte; nessun errore browser o traffico PLC.
  Artefatti locali: `.hmi-preview/pipeline-fixes-public-1792051435848/.hmi-preview/generated-smoke-vobyKf/result.json`.
- Le regressioni UI usano bridge simulati; la prova browser usa il pannello reale generato.
  Restano da collaudare dialoghi/IPC/Inspector nella finestra desktop, persistenza dell’intervista
  dopo riavvio, dispositivi fisici e commissioning. Nessun riavvio della sessione utente,
  nessun dato macchina reale pubblicato, modifiche trend/profile rinviate non incluse.

### 126. Ripresa locale del questionario AI dopo riavvio (2026-10-15)

- Una bozza per profilo desktop in `ai-interview/questionnaire.json`, separata da progetti,
  backup delle pagine e profilo account Codex. Formato versionato, limite 8 MiB, whitelist e
  controlli di forma prima del rendering; risposte incomplete restano recuperabili.
- Conserva risposte, deleghe, requisiti, cataloghi e percorsi delle immagini scelti localmente.
  Non conserva account, proposte AI o consenso all’invio. Le conferme dei mapping di scrittura
  vengono rimosse dalla copia e revocate di nuovo al recupero; riconferma esplicita obbligatoria.
  Le immagini devono restare disponibili; il normale preflight di creazione le ricontrolla.
- Stato del salvataggio visibile, **Riprendi il questionario**, **Ricomincia da zero** con seconda
  conferma e opzione per continuare solo nella sessione senza cancellare una vecchia copia.
  Riprendere sostituisce eventuali risposte già aperte; nessun ripristino o invio AI implicito.
  Stile e font esistenti conservati; messaggi e conferme guidati dalla skill UI/UX.
- Scritture serializzate con debounce, flush su pagehide/visibilità/cleanup, sostituzione atomica
  e CAS sul contenuto; lock fra istanze prima del controllo/salvataggio. La chiusura forzata
  può perdere gli ultimi caratteri non ancora confermati: non si promette persistenza assoluta.
  File corrotto/vuoto, troppo grande, bloccato o aggiornato altrove non è sovrascritto silenziosamente.
  Riferimento del lock: [Rust std::fs::File::try_lock](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock).
  Rust minimo dichiarato 1.89, verifica eseguita con 1.96; nessuna nuova dipendenza/licenza.
- Verificati 35 test mirati React/store/formato e 5 nativi su restart, scritture obsolete,
  cancellazioni obsolete, corruzione, dimensioni e lock. Tipi e build del codice pubblicabile
  passati; browser reale con bridge di test a 375/768/1024/1440 px: ripresa solo al click,
  annullamento della cancellazione senza perdita, nessun overflow del dialogo, errore JS o
  richiesta AI/PLC. Corretta anche la favicon mancante dell’editor, riusando l’icona esistente,
  e dichiarata la lingua italiana dell’interfaccia per gli strumenti assistivi.
- Artefatti locali: `.hmi-preview/ai-draft-public-1792054166708/.hmi-preview/ai-draft-ui/result.json`.
  Il browser usa il vero editor React ma un bridge simulato; il deposito è provato su file nativi
  temporanei. Restano il collaudo completo del riavvio/IPC nella finestra desktop installata,
  recovery dopo arresto di sistema, storage cifrato/retention multipla e commissioning macchina.
  Il deposito è locale in chiaro: non inserire segreti; nessun file macchina inviato o pubblicato.

### 127. Revisione prima/dopo per le modifiche AI (2026-10-15)

- Proprietà con nomi italiani, base precedente e valore proposto, valori ereditati da CSS
  distinti da valori letterali e dinamici. Nessuna lettura PLC o stile calcolato inventato.
  Modifiche senza variazione escluse, una sola operazione per campo; proposte ambigue rifiutate.
- Sostituzioni di espressioni con valori fissi deselezionate all’inizio e spiegate; le basi
  pilotate da dinamizzazioni HMI hanno un avviso specifico e restano deselezionate. Il binding
  non viene rimosso. Espressioni, script e tag non entrano nel contesto approvato: solo flag e
  nomi delle proprietà dinamiche/Runtime. Il testo fisso accanto a icone/espressioni le preserva.
- Schema prima/dopo aggiornato dalle sole scelte accettate, scala comune e dimensioni limitate.
  Non monta JSX, carica immagini, esegue eventi o legge valori PLC. Colori/dimensioni non noti
  sono indicativi; CSS esterni, posizione, livello, immagini e Runtime richiedono prova nel
  pannello reale. Non è una preview live o un diff semantico completo multi-pagina.
- Trasformazione condivisa con l’editor: riprodotti e corretti gli override persi dopo spread,
  chiavi calcolate o duplicate. Stili restanti e valutazione singola dell’espressione originale
  preservati. Corrette anche aggiunte con commenti e virgole finali, prima invalide o ignorate.
  Le proprietà accettate vengono applicate insieme, senza riparsare il file per ogni proprietà.
- Identità di istanza/ambito nel riferimento locale della proposta; cambio copia o ambito
  revoca il consenso e blocca l’applicazione, anche se il nodo JSX non cambia. Ricontrollo dopo
  la lettura asincrona del file. Sorgente non valido mostra un avviso senza chiudere l’assistente.
- Verificati 78 test mirati di revisione/UI/pipeline/stili. Tipi e build della copia pubblicabile
  passati. Browser reale a 375/768/1024/1440 px: selezione parziale, scala comune, veri comandi
  store Applica/Annulla/Ripeti, dinamici non preselezionati, nessun overflow, errore JS, esecuzione
  del codice sorgente o richiesta AI/PLC/immagine del progetto.
- Artefatti locali: `.hmi-preview/ai-review-public-1792056188654/.hmi-preview/ai-review-ui/result.json`.
  La prova browser usa letture sintetiche e applicazione in memoria, non IPC nativo o macchina.
  I test store coprono scrittura singola e rollback tramite bridge simulato. Restano collaudo
  desktop completo, CSS/layout reali, transazioni multi-file/CAS nativo e commissioning industriale.
  Skill UI/UX usata per leggibilità e conferme, debug per riprodurre i difetti; revisione manuale
  e documentazione mantengono espliciti i limiti. Nessuna nuova dipendenza o chiamata AI.

### 128. Chat AI laterale del progetto (2026-10-15)

- Accesso unico nella barra attività e in Pannello → Chat AI: conversazione non modale nella
  colonna destra ridimensionabile, invece della finestra di richiesta singola. Il canvas resta
  utilizzabile, senza bloccare Tab/scorciatoie globali. Creazione iniziale ancora guidata.
- Tasto destro su pagina o elemento → Aggiungi alla chat; pulsanti equivalenti nel compositore.
  Il bridge seleziona la copia cliccata e non intercetta gli eventi ContextTapped del Runtime.
  Menu accessibile con tastiera; messaggi accettati solo dall’iframe corrente e dalla sua origine.
- Allegati espliciti rimovibili: fino a cinque riferimenti pagina (nome/percorso/file, non sorgente)
  e un elemento destinazione. Il cambio selezione non sostituisce gli allegati di nascosto.
  Senza destinazione, solo risposte/domande e nessuna operazione applicabile. Non sono ancora
  disponibili lettura completa delle pagine, creazione libera di funzioni o piani multi-file.
- Bozza e messaggi conservati alla chiusura/riapertura della chat nella sessione; isolamento per
  progetto e account, annullamento con rifiuto delle risposte tardive. Nuova chat con conferma.
  Non persistiti su disco; limite 40 messaggi, ultimi dodici completati nel contesto, testi storici
  abbreviati a 4.000 caratteri e massimo 32 KiB UTF-8 di cronologia. Contesti eccessivi rifiutati.
- Ogni invio richiede consenso anche per la cronologia; sorgenti completi, script, mapping tag e
  credenziali non sono raccolti automaticamente. Quanto scritto esplicitamente e i testi letterali
  allegati possono essere inviati: non inserire segreti. Account/modello restano nelle impostazioni.
- Ultima proposta soltanto, confronto prima/dopo e accettazione per campo, unico Annulla/Ripeti.
  Sorgente/selezione/istanza/ambito e lettura del file ricontrollati dalle stesse primitive esistenti.
  Dopo l’applicazione si aggiorna soltanto il riferimento della stessa destinazione allegata.
- Verificati 97 test mirati di chat, pipeline AI, wizard, selezione e scorciatoie; tipi e build
  della copia contenente soltanto il codice pubblicabile passati. Browser reale a 375/768/1024/1440 px:
  menu sul destinatario esatto, allegati pagina, conversazione a più messaggi, consenso, vera
  applicazione store con Annulla/Ripeti e bozza alla riapertura; nessun overflow o errore JavaScript.
  La tastiera nella chat/menu non lancia cancellazioni o comandi sul canvas; fuori resta operativa.
- Artefatti locali: `.hmi-preview/ai-chat-public-1792058749367/.hmi-preview/ai-chat-ui/result.json`.
  Bridge di anteprima reale, provider e letture file sintetici, applicazione in memoria: non è
  collaudo IPC desktop/macchina né una nuova inferenza. Restano storico persistente, pagine complete,
  transazioni multi-file e commissioning. Nessuna nuova dipendenza o dato macchina pubblicato.

### 129. Contesto chat compatto e verificabile (2026-10-15)

- Compilatore locale unico per anteprima e invio: JSON senza rientri, regole stabili e più brevi,
  destinazione una sola volta invece che duplicata negli allegati, riferimenti pagina deduplicati.
  Scheda template ridotta a riferimento ID/versione/scopo per sola grafica; contratto completo se
  richiesta, indicazioni fissate o ultimo scambio coinvolgono funzionamento, dinamici o permessi.
  Capacità modificabili, flag dinamici e proprietà Runtime restano sempre nel contesto.
- Fino a tre scambi recenti mantenuti insieme, massimo 9.000 byte; fino a due estratti utente vecchi
  pertinenti per sovrapposizione di parole, massimo 1.800 byte. Nessun riassunto AI o embedding:
  nessuna inferenza nascosta. Estratti e testi abbreviati sono marcati, messaggi originali conservati.
  Il recupero lessicale non garantisce memoria perfetta: i vincoli importanti vanno fissati.
- “Indicazioni da ricordare” facoltative fino a 2.000 caratteri: sempre inviate integre con consenso,
  conservate con Nuova chat, eliminate al cambio progetto/account e non persistite su disco.
  Anteprima leggibile con scambi/richiami/esclusioni e richiesta tecnica effettiva espandibile.
- Budget rigido di 24.000 byte UTF-8 per prompt più schema; richiesta, indicazioni e destinazione
  non sono troncate per farle entrare. Se troppo grandi, invio bloccato prima dell’inferenza e bozza
  conservata. Token mostrati come stima euristica locale byte/3, non quota o misura esatta Codex;
  framing, istruzioni interne, ragionamento e risposta provider non sono misurati da questo valore.
- Cronologia delle proposte distinta dalle applicazioni: solo gli ID accettati entrano nei dettagli
  delle operazioni applicate, con stato storico esplicito (Annulla può aver cambiato il file).
- Riferimenti ufficiali consultati: gestione per scambi e conteggio token OpenAI (link nel README).
  Nessun cambio provider, nuova dipendenza, chiamata AI reale o dato macchina pubblicato.

### 130. Pagine allegate modificabili, modello/ragionamento e consenso di sessione (2026-10-15)

- La pagina allegata non è più un riferimento di navigazione: invia gerarchia, testi letterali,
  stili supportati e flag modificabili/dinamici da sorgente. Un contenitore comprende i figli;
  l’elemento già incluso nella pagina non viene duplicato. Target locali espliciti, controllo di
  componenti/stato pagina e schede template deduplicate. Nessun corpo handler/script, valore PLC,
  percorso assoluto o credenziale raccolto automaticamente. Componenti importati opachi, nessuna
  lettura inventata del CSS o del rendering Runtime; testi pagina molto lunghi marcati come ridotti.
- Restyling su più nodi: testi, geometria, spaziature, flex/grid e allineamento con valori validati.
  Gli eventi e binding restano presenti. Confronto prima/dopo e scelta parziale; conferma e un solo
  Annulla per file, anche per pagina allegata non aperta senza cambiare il canvas. Non è una
  transazione multi-file atomica. Sorgente cambiato, bozza, target sconosciuti/duplicati e progetto
  diverso bloccano la scrittura. Il CAS nativo contro scritture esterne concorrenti resta da fare.
- Selettori Modello e Ragionamento visibili in chat e nelle impostazioni: solo catalogo Codex,
  livelli supportati/default reali, override opzionale `effort` in `turn/start` verificato anche
  nel backend. Fonte: https://learn.chatgpt.com/docs/app-server. Il catalogo non garantisce il piano
  account; serve nuova compilazione desktop per il cambiamento dell’adapter nativo.
- Consenso all’invio una volta nella sessione progetto/account, conservato cambiando testo,
  note/allegati, chiudendo la chat e con Nuova chat. Revoca annulla l’invio in corso e ignora la
  risposta tardiva; cambio progetto/account lo elimina. Nessuna persistenza o applicazione AI
  automatica: confermare una proposta resta un’operazione distinta.
- Verifiche sulla copia isolata di solo codice: 168 test mirati (8 file AI/parser), tipi TypeScript
  e build Vite riusciti. Adapter nativo: 7 test passati, unica prova AI reale ignorata. Browser
  separato a 375/768/1024/1440 px: menu sul target esatto, pagina reale, modello/ragionamento,
  due invii con un solo consenso, riapertura/bozza, approvazione e Annulla/Ripeti; nessun overflow
  o errore console. Provider/letture sintetici, nessun IPC o inferenza reale dichiarati.
  Artefatti locali: `.hmi-preview/ai-pages-public-1792070209582/.hmi-preview/ai-context-ui/result.json`.
  Nessuna nuova dipendenza, chiamata AI reale o dato macchina pubblicato; roadmap ancora aperta.

### 131. Ripresa guidata dei chiarimenti nella chat AI (2026-10-15)

- Domande dell’assistente con campi distinti, etichette accessibili e invio delle risposte senza
  ricopiare richiesta o domande nel compositore. Rinvio esplicito: il dato non disponibile non
  autorizza a inventare tag, soglie o permessi; quella parte va conservata e il limite dichiarato.
  Il testo locale di una risposta rinviata non entra nel payload, ma si recupera togliendo il rinvio.
- Obiettivo originale e risposte esplicite precedenti nella stessa catena conservati nel contesto
  obbligatorio; una nuova risposta alla stessa domanda sostituisce quella precedente. Stesso
  compilatore/budget locale, richiesta tecnica ispezionabile. Allegati diversi bloccano la ripresa
  per non trasferire i chiarimenti su altri oggetti. Nessun cambio del provider o del protocollo.
- La bozza separata non viene sovrascritta; risposte recuperabili dopo chiusura, errore o annullamento.
  Nuova chat e cambio progetto/account le eliminano. Il consenso resta di sessione; non partono
  richieste mentre si compilano i campi. Rispondere non applica né salva: nuova revisione esplicita.
  Compositore principale compattato durante i chiarimenti e riapribile con un comando esplicito;
  nessun invio implicito della bozza nascosta. Nuove domande aperte dall’inizio, niente scroll
  della conversazione durante la digitazione; checkbox sullo stesso rigo della spiegazione.
- Corretto un errore tardivo del provider che dopo annullamento poteva riapparire nello stato AI:
  solo la richiesta ancora pubblicata può aggiornare l’errore; fallimenti di preflight restano visibili.
- Verifiche sulla copia di solo codice: 148 test mirati in 7 file AI riusciti; dopo i soli ritocchi
  UI ricontrollati i 2 file chat, 46 test passati incluse le nuove regressioni di scroll/compositore.
  Tipi e build Vite riusciti. Browser separato a 375/768/1024/1440 px: domanda, risposta, rinvio,
  contesto/bozza conservati, tre invii con un consenso, nuova proposta, approvazione e Annulla/Ripeti;
  nessun overflow o errore console. Provider e letture sintetici, nessun collaudo IPC/PLC dichiarato.
  Artefatti: `.hmi-preview/ai-questions-public-1792071117342/.hmi-preview/ai-questions-ui/result.json`.
  Nessuna chiamata AI reale, nuova dipendenza o dato macchina pubblicato. Pipeline completa e
  commissioning restano aperti.

### 132. Prime dinamiche di lettura proposte dalla chat AI (2026-10-15)

- Dati da usare facoltativi: selezione dal catalogo locale di massimo otto tag scalari dichiarati,
  univoci e leggibili, con nomi AI distinti. Inviati solo ID anonimo, nome scelto esplicitamente e
  tipo; nomi tag, indirizzi, descrizioni, connessioni e valori non raccolti per il provider.
  Riferimenti eliminati con Nuova chat/cambio progetto/account, senza scollegare regole salvate.
- Operazioni binding tipizzate, mai codice: Text, ForeColor, BackColor, BorderColor, Visible;
  lettura scalare per testo, visibilità BOOL e mapping BOOL falso/vero. Niente ProcessValue
  scrivibile, Enabled, script, soglie inventate, nuovi tag, configurazione trasporti o permessi.
  Formato HMI e risolutori già usati dall’Inspector, quindi utilizzabili anche senza AI.
- Confronto locale con tag reale, tipo e stato prima/dopo; ogni regola dati non preselezionata.
  Conservati altri binding ed eventi; una scrittura e un Annulla per file. Catalogo rivalidato
  anche dopo lettura del sorgente; modifica/rimozione dei riferimenti invalida le proposte binding.
  Spread, configurazioni dinamiche/ambigue, contenitori di testo e markup in callback/cicli
  ripetuti bloccati per evitare di collegare tutte le copie a un solo segnale. I dati del pannello
  non vengono inseriti in definizioni esterne al progetto. Analisi interfile
  delle istanze e CAS nativo restano da completare, nessuna garanzia di commissioning da questi check.
- Un dato mancante può essere aggiunto durante i chiarimenti senza perdere obiettivo/risposte;
  non si possono riassegnare i riferimenti precedenti. La scelta dati non fa richieste AI, non
  avvia il PLC e non sostituisce l’approvazione della proposta. Visibilità solo grafica, non sicurezza.
- Verificate le fonti ufficiali Unified V21 (dinamizzazione tag/read-only) e Optix (link direzionali
  e convertitore condizionale), link nel README. Nessuna nuova dipendenza o asset vendor distribuito.
- Revisione aperta dall’inizio e compositore compattato anche per proposte in attesa: subito
  visibili destinazione e regola da selezionare, senza saltare in fondo ai disegni. Eventi/script
  esistenti possono reagire ai cambiamenti: avviso esplicito, impatto da collaudare sulla macchina.
- Copia isolata di solo codice: 167 test mirati in 7 file AI riusciti; dopo le ultime guardie/UI
  ricontrollati 3 file chat/binding, 88 test passati (42 dedicati ai binding). Tipi e build Vite
  riusciti. Browser 375/768/1024/1440 px: scelta locale senza inferenza, contesto anonimo, regola
  non preselezionata, approvazione, stato falso/vero col vero risolutore offline, un Annulla/Ripeti,
  bozza conservata; nessun overflow o errore console. Provider/letture sintetici, nessun IPC/PLC
  fisico o nuova inferenza reale dichiarati. Artefatti locali:
  `.hmi-preview/ai-bindings-public-1792074551961/.hmi-preview/ai-bindings-ui/result.json`.
  Pipeline completa, restanti funzioni WinCC/Optix e gate di produzione ancora aperti.

### 133. Chat conservata ai refresh dell’editor (2026-10-15)

- Causa: store chat ricreato ai reload, mentre il recupero editor conservava solo pagina/bozza.
  Store mantenuto in HMR con metodi aggiornati e checkpoint dei soli testi in sessionStorage.
- Conservati richiesta non inviata, note, messaggi, risposte ai chiarimenti (anche testo rinviato)
  e nomi dei riferimenti. Flush su prima del reload, uscita pagina e cleanup; scrittura ordinaria
  accorpata a 150 ms. Il solo refresh dell’iframe HMI non tocca la chat del genitore.
- Ripresa dopo verifica locale dell’account CLI e progetto corretto, anche se il recupero editor
  è ancora in corso. Errori temporanei di verifica account non cancellano una chat viva.
  Logout/cambio account e chiusura/cambio progetto eliminano la copia; Nuova chat con conferma.
- Copia locale in chiaro della sola finestra, non archivio dopo chiusura app. Nessun sorgente/AST,
  catalogo o indirizzo PLC, prompt preparato, consenso, richiesta attiva o proposta applicabile
  ripristinato. Vecchie proposte consultabili, risposte recuperate leggibili, allegati/dati da
  riconfermare. Nessuna inference, login, applicazione o reinvio automatici.
- Storage pieno/corrotto: testo vivo conservato e avviso di copiare prima del refresh; nessuna
  troncatura silenziosa o sovrascrittura della copia corrotta. Guard prima del reload quando
  possibile; chiusure forzate del processo restano fuori garanzia del browser.
- Verificati 66 test mirati su recupero/chat/chiarimenti nella copia del solo indice Git,
  senza JSON macchina o modifiche trend preesistenti. Browser Edge a 375/768/1024/1440 px:
  refresh iframe, reload completo e aggiornamento modulo Vite, bozza/note/risposte non inviate
  conservate, nessun reinvio/approvazione ripresa, nessun errore o overflow. Provider/account
  sintetici: nessuna inference reale o richiesta PLC. Tipi e build Vite della copia isolata
  verificati. Artefatti locali: `.hmi-preview/ai-chat-recovery-public-1792076362654/.hmi-preview/ai-chat-recovery-ui/`.

### 134. Primitive locali per modifiche AI di progetto, integrazione ancora da completare (2026-10-16)

- Richiesta: la chat deve seguire componenti/configurazioni e creare le variabili mancanti,
  non fermarsi alle sole proprietà dell’Inspector (caso HeaderValue/HeaderGauge).
- Implementato e testato il piano locale: sostituzioni before/after esatte e uniche nei frammenti
  disponibili, sintassi/import, file sorgente nuovi dopo verifica d’assenza, nuova dichiarazione
  scalare read-only senza indirizzo/connessione. Preservati catalogo esistente, mapping e campi extra.
- Tre comandi nativi interni di lettura/applicazione/ripristino: solo progetto aperto, percorsi
  ammessi, niente symlink/junction o nomi Windows riservati, nessuna cancellazione diretta.
  Precontrollo delle versioni, backup locale prima di scrivere, rollback best-effort in errore,
  ripristino di batch parziali senza sovrascrivere modifiche esterne. Non è CAS atomico fra
  processi esterni né transazione multi-file. I backup contengono codice locale in chiaro.
- Il guard sorgente riconosce errori sintattici/import e forme note di chiamate operative o
  credenziali: è euristico, non sandbox JS né garanzia su segreti, comportamento o sicurezza macchina.
- **Non ancora collegato a chat/provider**. Verifica automatica ha fermato la preparazione del
  nuovo payload sorgenti/metadati verso Codex/OpenAI per mancanza di consenso sufficientemente
  esplicito. Nessun aggiramento né invio eseguito; vecchio provider e comportamento chat invariati.
  Interruzione successiva per crediti del revisore, risolta alla ripresa per le sole operazioni locali.
- Restano autorizzazione alla condivisione, recupero mirato del contesto/componenti importati,
  integrazione nella chat con budget e cancellazione, confronto e approvazione/ripristino UI,
  prove end-to-end e aggiornamento della build desktop prima dell’uso dei nuovi comandi.
- Verificati 32 test unitari TS su dati sintetici e 7 test Rust mirati alle primitive locali.
  Ripetuti nella copia del solo indice Git, insieme a controllo tipi e build Vite superati:
  `.hmi-preview/ai-project-local-public-1792131020023/`, senza JSON macchina o modifiche trend.
  Nessuna inference, lettura PLC, modifica al progetto macchina aperto o riavvio dell’app.
  La prova symlink dipende dai permessi OS; non equivale a un audit generale del filesystem.

### 135. Chat AI con contesto sorgente, variabili e revisione di progetto (2026-10-16)

- L’utente ha esplicitamente autorizzato la condivisione del contesto necessario dell’impianto
  tramite il proprio account. Superato il blocco di consenso del punto 134, senza aggiramenti.
- Ambito “Modifiche al progetto” predefinito: pagine/elementi allegati avviano il recupero mirato
  di sorgenti, componenti importati e configurazioni. HeaderValue/HeaderGauge non dipendono più
  dalle sole proprietà esposte nell’Inspector. Modalità grafica precedente ancora disponibile.
- Catalogo automatico di nomi/tipi/accessi/descrizioni; indirizzi, connessioni, valori ed extra
  non inviati. Variabili scalari mancanti dichiarabili read-only, senza mapping inventato.
  Massimo tre passaggi, 80 KB input per passaggio e 180 KB totali UTF-8 incluso schema, sei
  messaggi recenti abbreviati, indice massimo 500 file. Nessun riassuntore AI aggiuntivo.
- Modifiche su codice vero con sintassi/import e sostituzioni uniche verificate; preview solo
  testuale, niente esecuzione del JSX ricevuto. Approvazione separata dall’invio e non preselezionata.
  Rilettura disco/bozza prima dell’applicazione; backup nativo e ripristino dell’insieme con
  conferma distinta. Ricevuta whitelisted conservata al refresh, mai sorgenti o approvazioni.
- Durante scritture/ripristino: blocco UI/comandi, guard prima del reload, refresh dei file e
  del catalogo senza cambiare progetto o avviare l’anteprima. Chiusure forzate e atomicità
  multi-file restano fuori garanzia; le euristiche non sostituiscono build o collaudo macchina.
- Verificati nella copia del solo indice Git **202 test mirati in otto file**, controllo tipi
  e build Vite. Backend: 9 test Codex e 7 primitive progetto passati; prova reale ignorata nella
  selezione ordinaria. Edge a 375/768/1024/1440 px: approvazione distinta dall’invio, ripristino
  dopo reload, bozza conservata, nessun reinvio, errore browser o overflow. Screenshot verificato.
  Copia pubblicabile: `.hmi-preview/ai-project-chat-public-1792133462896/`, senza dati macchina
  o modifiche trend preesistenti; artefatti browser nella sua sottocartella `.hmi-preview/`.
  Prima prova Codex reale fermata dal provider, senza modifiche ai file. Nessun reinvio automatico.
  CLI 0.159.2 con protocollo diverso dalla documentazione corrente: l’utente ha autorizzato
  l’aggiornamento. Vietato allargare l’accesso ai file come fallback.
- Aggiornamento npm globale ufficiale a **0.163.0** eseguito e versione verificata. npm segnala
  residui temporanei della vecchia installazione occupati da processi attivi: non eliminati né
  processi terminati. Schema locale 0.163.0 ancora senza `ReadOnlyAccess`: aggiunto controllo
  fail-closed prima dell’inferenza di progetto. Account/modelli e percorso grafico precedente
  non richiedono questo gate aggiuntivo. Nessuna seconda richiesta AI reale eseguita.
- Build desktop debug aggiornata verificata (`src-tauri/target/debug/framecraft.exe`), senza
  avviare o interrompere l’app. Per utilizzare i nuovi comandi aprire questa build dopo aver
  salvato il lavoro; non implica installer/artefatto production o collaudo macchina.
- **Non dichiarare completata la pipeline reale di modifica progetto**: servono CLI/provider
  compatibili con il confine di lettura e nuova prova end-to-end. I test UI usano provider
  sintetico; preservare questo limite nelle comunicazioni e nella roadmap.

### 136. Chiarimenti progetto e continuità del contesto (2026-10-16)

- Ripresa dal punto 135: verificato anche lo schema completo `--experimental` di Codex CLI
  0.163.0, ancora senza `ReadOnlyAccess`. Nessuna versione preliminare installata, nessuna
  nuova richiesta reale e nessun allargamento del confine di lettura. Il blocco resta esplicito.
- Sistemato un limite concreto della nuova chat: le domande del piano progetto ora hanno
  gli stessi campi accessibili del percorso grafico. Obiettivo iniziale e risposte strutturate
  conservati nella catena; risposte ripetute aggiornano solo quella domanda, rinvii espliciti
  prevalgono sulla cronologia e non inviano il testo locale disattivato. Non si applicano file.
- Seguito ancorato alle pagine da cui era partita la richiesta, anche quando l’utente naviga
  altrove senza allegati espliciti. Rilettura del codice attuale, non di una vecchia copia.
  Cambio allegati/ambito richiede nuova richiesta; account, consenso, bozza e budget restano
  verificati. Le risposte non assorbono né cancellano la bozza separata del compositore.
- Recupero refresh dei soli testi di domande/risposte progetto, anche dei campi rinviati:
  nessun sorgente, selezione/ancoraggio attivo, approvazione o invio riavviato. Vecchia proposta
  di sola consultazione; serve nuova revisione per tornare a modificarla.
- Documentato il gate production del provider: App Server ufficialmente sperimentale e non
  supportato per carichi production. L’AI resta opzionale; adapter provvisorio non equivale a
  certificazione/collaudo del pannello. Fonte: https://learn.chatgpt.com/docs/app-server .
- Verificati **85 test mirati in quattro file**, controllo tipi e build Vite nella copia del solo
  indice Git `.hmi-preview/ai-project-questions-public-1792135261995/`, senza JSON macchina o
  modifiche trend preesistenti. Edge a 375/768/1024/1440 px: domande compilabili, rinvio escluso
  dal payload, bozza distinta, ancoraggio pagina iniziale, applicazione/ripristino separati e
  recupero dopo reload; nessun errore o overflow. Provider/account sintetici, nessuna inferenza
  reale o lettura PLC. Nessuna modifica nativa: non ripetuti test backend non interessati.

### 137. Collegamenti guidati tipizzati e revisione delle letture (2026-10-16)

- Corretto un errore concreto della pipeline iniziale: un trend accettava qualunque tag leggibile,
  anche STRING/BOOL o strutture che il grafico numerico non interpreta. Scelte ora compatibili
  con il contratto scalare condiviso MQTT/OPC UA: numeri supportati per curve, anche BOOL/testi
  per valori; niente tag solo scrivibili, rilevati senza dichiarazione o nomi ambigui.
- Validazione comune fra interfaccia, questionario e generatore, anche chiamato direttamente.
  Un tipo divenuto incompatibile invalida una proposta AI pronta. Collegamento vecchio visibile
  con motivo e alternative, mai cancellato/rimpiazzato automaticamente; vuoto resta da collegare.
- Riepilogo letture per pagina/elemento/tag/tipo prima e dopo il piano, senza duplicarlo nella
  stessa revisione. Comando Rivedi torna alla pagina interessata. “Impostato” indica il mapping
  locale, non connessione avviata, qualità valida o collaudo. Catalogo/indirizzi restano locali
  nella pipeline iniziale; nessun dato macchina, valore, scala, soglia o comando nuovo inventato.
- Verificati **127 test mirati complessivi in cinque file** nella copia del solo indice Git
  `.hmi-preview/guided-read-public-1792136922527/`. Browser Edge 375/768/1024/1440 px: errore e
  correzione, opzioni tipizzate, valori BOOL, revisione, consenso e approvazione espliciti,
  generatore reale con due pagine e gateway disabilitato. Provider, cartella e handoff simulati;
  nessun invio AI reale o richiesta PLC, errore browser o overflow. Nessun test nativo ripetuto:
  backend non modificato. Ultima rifinitura verificata solo sul nuovo file (34 casi): i messaggi
  per tipi anomali restano brevi senza riscrivere il catalogo. Controllo tipi e build Vite della
  stessa copia isolata superati.
- Non modificati o inclusi nel commit i lavori trend preesistenti. Nessuna dipendenza o asset
  vendor nuovo. Riferimenti concettuali: sorgente per curva/penna, non una dichiarazione di
  parità dei tipi o funzionalità complete:
  https://docs.tia.siemens.cloud/r/en-us/v21/configuring-tags-rt-unified/displaying-tags-rt-unified/basics-rt-unified/outputting-the-tag-values-rt-unified
  https://www.rockwellautomation.com/en-gb/docs/factorytalk-optix/1-2-0/contents-ditamap/creating-projects/graphic-objects/predefined-objects/data-controls-objects/trends/add-a-trend-object.html
- Rimane il blocco del punto 135 sulla nuova modifica sorgenti tramite CLI; nessuna versione
  preliminare installata né restrizione aggirata. Restano connessioni, autorizzazioni server,
  licenze/distribuzione e commissioning da completare prima di dichiarare il prodotto production.

### 138. Grafici X/Y nella pipeline guidata iniziale (2026-10-16)

- Aggiunta la base `function-trend`, distinta dai grafici nel tempo e disponibile anche ai
  piani pagina delegati. Massimo nove curve, ognuna con nome e due tag reali X/Y scelti
  separatamente. Stesso controllo numerico scalare delle letture: nessun testo, BOOL, array,
  UDT, tag solo rilevato/scrivibile o nome ambiguo convertito in una misura.
- Il generatore emette `HmiFunctionTrendControl` e usa il Runtime già distribuito; niente
  disegno statico o dati fittizi. Applica campionamento e finestra dei campioni, preserva gli
  assi automatici e i default del controllo. La tolleranza di abbinamento resta quella
  dichiarata nella scheda, modificabile nell’Inspector, non una garanzia di sincronismo PLC.
  Unità, limiti, qualità, acquisizione/abbinamento e sorgenti reali vanno configurati/collaudati.
- Campi accessibili per asse, errore accanto al lato non valido, revisione con due righe per
  curva e ritorno alla pagina. Rinvio dei dati azzera entrambi gli assi; reimport conserva solo
  mapping ancora presenti/leggibili, tipo incompatibile blocca piano e generazione. Bozza
  recuperata conserva X e Y; riordino mantiene i tag sulla stessa etichetta, nuove etichette
  non ereditano sorgenti. Nessuna scrittura PLC o nuova connessione dal questionario.
- Contratto di funzionamento condiviso fra catalogo, domande e AI; al provider arrivano solo
  i flag X/Y collegati, non nomi tag/indirizzi. La nuova base partecipa alle domande trend
  ereditando soltanto default reali; l’AI non deve chiedere nuovamente come funziona il controllo.
- Verifiche nella copia pubblica `.hmi-preview/guided-xy-public-1792140020398/`, senza JSON
  reali né modifiche trend preesistenti: 87 test mirati in cinque file; dopo tre nuovi casi di
  importazione/rinvio, 61 in tre file (sovrapposti: 131 casi unici in sette file). Controllo tipi
  e build Vite superati. Ultima ottimizzazione del calcolo errori ricontrollata sui soli campi
  lettura/X-Y: 54 test, controllo tipi e build. Eseguito anche il modulo Runtime realmente
  generato: coppie X/Y e CSV.
  Edge 375/768/1024/1440 px: validazione/correzione, tastiera, revisione/consenso/approvazione,
  annullamento cartella senza perdere risposte, pagina e Runtime generati con due coppie e CSV;
  nessun errore console o overflow del dialogo. Account/provider e filesystem/handoff nativi
  simulati; nessuna chiamata Codex reale, connessione PLC o prova touch fisica.
- Non modificati i moduli trend/Runtime o `standardProject.ts` già sporchi. Nessuna dipendenza,
  asset o codice vendor copiato. Riferimenti concettuali, non attestazione di parità completa:
  https://docs.tia.siemens.cloud/r/en-us/v20/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/function-trend-control-rt-unified
  https://www.rockwellautomation.com/en-be/docs/factorytalk-optix/1-4-4/contents-ditamap/creating-projects/graphic-objects/predefined-objects/data-controls-objects/xy-chart.html
- Resta il gate CLI sulle modifiche ai sorgenti del punto 135; non allargato alcun permesso.
  Restano AI operativa completa, capacità Unified/Optix residue, licenze/distribuzione,
  autorizzazioni server e commissioning: l’obiettivo generale non è concluso.

### 139. Data Log importati e sorgenti archiviate nella pipeline iniziale (2026-10-16)

- Import facoltativo di `framecraft.logs.json` dopo il catalogo tag: configurazioni, non
  campioni storici o database esterni. Contratto stretto: 2 MB, 32 log, 5000 variabili archiviate,
  massimo 100000 campioni/log e un anno di conservazione. Campi/tipi di storage sconosciuti,
  ID duplicati, impostazioni mancanti, trigger/tag assenti o non leggibili vengono rifiutati,
  senza normalizzazioni dei limiti fuori contratto. Confronto di trigger `equals` senza
  operando esplicito rifiutato: non deve diventare il default 1 del Runtime.
- Ogni curva temporale e ciascun asse X/Y possono scegliere Online o Archivio. Nessun tag
  preselezionato dal cambio sorgente; solo Data Log abilitati e tag numerici compatibili.
  Nome/ID/tag cambiati, archivio disabilitato o riferimenti malformati bloccano piano e
  generatore, anche chiamato direttamente. Tornare Online elimina il riferimento; niente
  binding trasferiti implicitamente a un’altra variabile. I comandi non usano dati storici.
- Import e revisione mostrano configurazione effettiva, modalità, limiti e tempi leggibili,
  fonti per curva/asse e nomi completi anche su mobile. Le risposte generali su sorgente e
  conservazione restano requisiti, non sovrascrivono le impostazioni importate. Memoria/browser
  locali, raccolta solo a pannello aperto, quote/cancellazione/backup e limiti industriali espliciti.
- Generazione con collector e adattatore storico già distribuiti; nuovo spazio archivio per
  ogni pannello, senza aprire campioni locali di un progetto precedente dal solo catalogo.
  Recupero bozza conserva configurazioni e riferimenti, non consensi/proposte/account.
  All’AI soltanto conteggi e modalità; nessun nome log, ID, tag, indirizzo o campione aggiunto
  al payload. Nessuna nuova rete, scrittura PLC o servizio attivato dall’import/generazione.
- Verifiche nella copia pubblica `.hmi-preview/guided-logs-public-1792161428739/`, esclusi
  export reali e lavori trend preesistenti: 157 test mirati in otto file; ultime due regressioni
  del trigger verificate nel solo nuovo file (28 casi; 159 casi unici complessivi). Tipi e build
  Vite superati. Edge 375/768/1024/1440 px: import valido/invalido, nessuna sorgente scelta da
  sola, assi misti online/archivio, revisione/consenso/approvazione e moduli realmente generati:
  collector, adattatore numerico storico, grafico temporale, X/Y, due coppie e CSV. Nessun errore
  console, overflow del dialogo, upload dei tag o chiamata AI/PLC reale. Provider/account e
  filesystem/handoff nativi simulati; nessuna modifica backend o prova touch fisica.
- Il primo test browser usava direttamente stringhe del Data Log nel grafico temporale:
  fixture corretta caricando l’adattatore effettivo del Runtime generato. Test rafforzato sul
  tracciato non vuoto, non solo sulla presenza del controllo; Runtime originale non modificato.
- Tre soli agganci al generatore `standardProject.ts` (catalogo, riferimenti e import); nel
  commit devono restare esclusi tutti i precedenti lavori profili/Runtime. Nessuna dipendenza,
  asset o codice vendor nuovo. Riferimenti concettuali su sorgenti online/archiviate:
  https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/overview-of-screen-objects-rt-unified/controls-rt-unified/trend-control-rt-unified
  https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-7-0/contents-ditamap/creating-projects/graphic-objects/predefined-objects/data-controls-objects/trends/add-a-trend-object.html
- Restano archivio server continuo/industriale, commissioning reale, capacità Unified/Optix
  residue e pipeline AI completa. Il gate CLI sui sorgenti del punto 135 non è aggirato;
  licenze, autorizzazioni server e distribuzione restano criteri di rilascio aperti.

### 140. Lingua Runtime e dizionario testi nella creazione guidata (2026-10-16)

- La scelta della lingua operatore imposta ora davvero il catalogo Runtime generato, anche
  senza traduzioni importate. Preferita una lingua già dichiarata della stessa famiglia,
  preservando la lingua di ripiego. Non equivale a tradurre ogni scritta dell’HMI.
- Import facoltativo di `framecraft.resources.json`: 2 MB, 32 lingue BCP 47, 5000 testi,
  200 liste testo e 200 grafiche, massimo 20000 voci complessive. Contratto stretto senza
  campi sconosciuti o coercizioni dei numeri, errori leggibili e vecchio catalogo conservato.
  Liste mantenute, segnaposto grafici vuoti ammessi; immagini riferite non importate.
- Chiave scelta esplicitamente per titolo di ogni pagina e testi statici di overview,
  sinottico, valori e comandi. Proposte soltanto voci contenenti esattamente il testo originale:
  nessuna associazione/chiave/traduzione inventata. Chiave cambiata, mancante o incompatibile
  blocca pipeline e generatore diretto; titolo delegato cambiato perde il vecchio collegamento.
- Campi accessibili, errore vicino alla scelta, anteprima della lingua effettiva e ripiego;
  riepilogo prima/dopo piano senza duplicati, Rivedi torna anche ai titoli allarmi/storico.
  Gli originali restano disponibili; nomi curve, allarmi e controlli di sistema non sono
  dichiarati tradotti. Da verificare copertura e ingombri prima dell’uso reale.
- Titoli e voci visibili del menu usano il dizionario senza cambiare rotte, numeri pagina,
  tag/valori PLC, permessi o eventi dei comandi. Metadati testo conservati anche aggiungendo
  categorie. Chiavi codificate come espressioni JSX sicure; traduzioni trattate come testo.
  Recupero bozza conserva catalogo/chiavi, non consenso/account/proposte. All’AI solo conteggi
  e flag di collegamento; nessuna nuova chiave, traduzione o nome file nel payload.
- Verificati **122 casi mirati unici in otto file**, controllo tipi e build Vite nella copia
  pubblica `.hmi-preview/guided-texts-public-1792163591089/`, senza export reali o lavori trend
  preesistenti. Edge 375/768/1024/1440 px: import valido/invalido, selezione esplicita, lingua,
  revisione/consenso/approvazione, App e pagine realmente generate, menu tradotto, navigazione
  che conserva la lingua e cambio lingua Runtime. Nessun errore console o overflow del dialogo.
  Provider/account, router, header e filesystem/handoff nativi sintetici; nessuna inferenza AI,
  chiamata PLC, prova touch fisica o collaudo IPC. Non ripetuti test backend: nessuna modifica nativa.
- Sei sole righe del generatore `standardProject.ts` interessate; i lavori profili/trend
  precedenti restano esclusi. Nessuna nuova dipendenza, asset o codice vendor. Riferimento
  concettuale ai dizionari e alla lingua Runtime, non attestazione di parità completa:
  https://www.rockwellautomation.com/en-ua/docs/factorytalk-optix/1-4-4/contents-ditamap/creating-projects/translations.html
- Ricontrollati CLI installata e registro npm ufficiale: entrambi **0.163.0**. Anche lo schema
  `--experimental` rigenerato non espone `ReadOnlyAccess`; nessuna reinstallazione inutile,
  versione preliminare o ampliamento dei permessi. Resta il gate del punto 135 sulla pipeline
  reale dei sorgenti. Obiettivo generale, traduzioni complete, capacità Unified/Optix residue,
  licenze, autorizzazioni server, distribuzione e commissioning non conclusi.

### 141. Pulsanti di navigazione nella creazione guidata (2026-10-19)

- Ripresa dal commit `527c925`: il turno precedente ha prodotto codice/test/documentazione
  e push verificato, quindi progresso effettivo. Proseguita la priorità AI + app senza agenti;
  non modificati i precedenti lavori profili/trend, ancora locali e fuori dal commit.
- I pulsanti guidati possono aprire una pagina del piano oltre a scrivere un valore PLC.
  Scelta distinta, destinazione non preselezionata, evento operatore, permesso e conferma;
  campi PLC nascosti per navigazione, errori vicini al campo e riepilogo con Rivedi pulsante.
  Cambio azione elimina il vecchio mapping preservando gli altri metadati dell’elemento.
- Collegamento sull’ID pagina stabile, rotta interna risolta dal piano effettivamente generato.
  Riordino/categoria non spostano la destinazione; pagina assente/duplicata, URL, rotta anomala,
  evento automatico, script extra o mapping misto vengono rifiutati anche nel generatore diretto.
  Rimozione revoca la conferma senza cancellare il riferimento: ricreare lo stesso ID non
  ripristina l’approvazione. Nessuna nuova scrittura PLC, richiesta rete o dipendenza.
- Navigazione consentita nei progetti di solo monitoraggio; le scritture restano bloccate.
  Stessa IR e Runtime dell’Inspector; desktop/mobile mantenuto dalla scelta del guscio HMI,
  non da un prefisso diverso della rotta: i due layout condividono gli stessi indirizzi.
  Il permesso riguarda il pulsante, non protegge la pagina da altre navigazioni/accessi.
  Import/reimport tag non revocano una navigazione indipendente; bozza conserva destinazione
  ed evento ma revoca l’approvazione. All’AI tipo azione e ID pagina del piano già approvato,
  non rotta generata/tag/indirizzi/valori. Contratto comandi v2; v1 conservato per vecchie pagine,
  versioni sconosciute non interpretate come la base nuova. Nessuna migrazione automatica.
- Verificati **127 test mirati in sette file**, tipi e build Vite nella copia pubblica
  `.hmi-preview/guided-navigation-public-1792391084726/`. La prima copia non aveva ricevuto
  l’unico aggancio del generatore: corretta la preparazione della copia, quindi ripetuto il
  solo nuovo file (23 casi), non l’intera suite. Nessuna modifica backend/test nativo.
- Edge a 375/768/1024/1440 px: scelta esplicita, revoca dopo cambio evento, revisione e
  approvazione della creazione; App, pagine e Runtime realmente generati. Click singolo non
  esegue il doppio click scelto; pulsante con permesso non concesso bloccato; navigazione
  conserva layout e non riapre la scelta dispositivo. Nessun errore console o overflow del
  dialogo, richiesta AI/PLC reale o upload tag. Provider/account, router, header e filesystem/
  handoff sintetici: non è collaudo nativo, login reale, touch fisico o commissioning PLC.
  Fixture corretta per includere i moduli runtime e il contenitore di apertura/chiusura;
  verificato il blocco effettivo senza pretendere un attributo disabled o prefisso /mobile
  non previsti dal contratto. Nessuna modifica al prodotto per adattarlo alle fixture.
- Riferimento funzionale sul cambio schermata, non codice/asset vendor né parità completa:
  https://docs.tia.siemens.cloud/r/en-us/v20/using-system-functions-rt-unified/system-functions-rt-unified/changescreen-rt-unified
- Restano pipeline AI reale sui sorgenti (gate CLI del punto 135), ricette/report operativi,
  autorizzazioni server/pagine, licensing/distribuzione e commissioning reale. Obiettivo
  generale Unified/Optix/AI non concluso, nessun ampliamento dei permessi del provider.

### 142. Compatibilità CLI e diagnosi sandbox Windows per le modifiche AI (2026-10-19)

- Segnalazione: la chat non permette più di modificare il pannello. Il vecchio gate verificava
  soltanto `ReadOnlyAccess`, assente anche nella CLI 0.163.0: non riconosceva i profili nominati
  effettivamente disponibili. Nessuna reinstallazione/pre-release o inferenza come tentativo.
- Adapter nativo aggiornato: opt-in API sperimentale e rilevamento delle capacità dei parametri
  di thread e turno; profilo `framecraft-proposal` esplicito per i sorgenti, mai combinato con
  `sandbox`/`sandboxPolicy` legacy. Resta il ramo confinato legacy se dichiarato dalla CLI;
  nessuna rimozione del gate e nessun fallback ad accesso più ampio. Il percorso grafico conserva
  i suoi parametri precedenti; default generale in sola lettura, non accesso completo.
- Profilo con sola lettura della cartella proposta e `:minimal`, rete strumenti disabilitata e
  nessuna scrittura. Prima di ogni richiesta sorgenti si verificano configurazione effettiva
  esatta (ignorando soltanto i campi null), disponibilità/allowlist e readiness Windows.
  Prima del contesto al modello si controllano ID del profilo attivo e approvazioni `never`.
  Permessi aggiuntivi/ereditarietà, dati mancanti o modalità sconosciute vengono rifiutati.
- Il profilo Framecraft reale segnala **`updateRequired`**; i profili sintetici nuovi senza
  configurazione Windows segnalano **`notConfigured`**. Errore ora distinto da login e versione
  CLI: account conservato, nessuna richiesta inviata, setup Windows da autorizzare. Non chiamato
  `windowsSandbox/setupStart`, non modificati utenti/firewall/criteri OS, non copiati segreti.
  L’autorizzazione al setup chiesta all’utente non è stata ancora ricevuta.
- **16 test nativi mirati passati**, due test opt-in esclusi dal normale lancio. Eseguito poi
  soltanto il preflight locale opt-in: profilo temporaneo, CLI reale, schema/configurazione/
  allowlist/stato, nessun account, thread o inferenza. Il primo preflight ha trovato l’obbligo
  CLI di impostare `default_permissions` quando si definiscono profili: corretto con il preset
  `:read-only`, poi ripetuti solo questi test e il preflight con successo. Diagnostica senza
  contenuti/sorgenti/token e con rimedio Windows separato. Nessun test globale o frontend.
- Configurazione riconfermata con CLI 0.163.0 anche sul profilo Framecraft reale, senza leggere
  credenziali. Le sonde locali non provano ancora lettura consentita/negata e scrittura negata
  dal sandbox: restano setup esplicitamente autorizzato, nuova build desktop e prova end-to-end.
  Non riavviata/rimpiazzata l’app in uso, né applicata una proposta a progetti dell’utente.
- Riferimenti: https://learn.chatgpt.com/docs/app-server,
  https://learn.chatgpt.com/docs/permissions,
  https://learn.chatgpt.com/docs/windows/windows-sandbox.
  Documentazione aggiornata, codice/test soltanto nel commit; lavori trend/profili preesistenti
  preservati e dati macchina esclusi. Obiettivo generale e pipeline AI reale non completati.

### 143. Isolamento e setup Windows guidati nelle impostazioni AI (2026-10-19)

- Il turno precedente è progresso: commit `02eb815`, correzione del protocollo CLI, test e push
  verificato. Nessuna risposta umana di autorizzazione al setup Windows: la continuazione
  automatica dell’obiettivo non è consenso. Proseguito sul flusso prodotto, senza agenti,
  senza eseguire setup, riaprire l’app o inviare richieste AI reali.
- In Impostazioni → AI e account aggiunta Protezione dei file: verifica locale solo su click
  dopo il controllo account; stati da configurare/aggiornare/pronto, nessuna verifica o login
  all’apertura. “Configura Windows…” espone effetti su utenti, firewall e criteri di accesso,
  eventuale UAC/IT, checkbox inizialmente vuota e pulsante separato. Rinvio/chiusura/cambio
  account revocano il consenso; niente memorizzazione o avvio implicito. Stile dell’editor
  mantenuto, target da 44 px, focus gestito dopo rinvio/avvio, link ufficiale accessibile.
- Comandi nativi di stato/setup, guardia di consenso anche nel backend, profilo Framecraft
  separato e cwd limitata alla cartella proposta. Setup solo `elevated` su Windows e su
  richiesta esplicita; nessun ampliamento del profilo file/rete del modello o installazione CLI.
  Stato condiviso fra riconnessioni nella stessa app: esclusione con nuove richieste AI,
  logout/annullamenti che interromperebbero il setup, duplicati e nuovo tentativo su esito
  incerto. Un fallimento definitivo permette solo un nuovo tentativo esplicitamente autorizzato.
- ACK `started` non è completamento: ascolto di `windowsSandbox/setupCompleted`, poi verifica
  readiness, anche a impostazioni chiuse. Eventi con modo inatteso ignorati; errore grezzo non
  propagato. RPC/processo interrotto non significa fallimento certo: stato incerto, nessun retry
  o reset basato su timeout. Stato in memoria, non garanzia di recovery del provisioning dopo
  chiusura forzata dell’app; in quel caso verificare Windows/IT prima di avviare altro setup.
  Non cambiano progetto, MQTT/OPC UA, consensi delle proposte o bozza della chat.
- **21 test nativi mirati**, **86 test AI in quattro file**, tipi e build Vite passati. I test
  nativi coprono transizioni pure e adapter, non invocano setup/inferenza; quelli UI usano
  soltanto provider sintetici. Primo controllo nativo corretto per il tipo Arc del client;
  test UI ha trovato focus su un bottone ancora disabilitato: ripristino spostato dopo il render,
  poi ripetuto solo il nuovo file e il gruppo interessato nella copia pubblica.
- Copia pubblica isolata `.hmi-preview/ai-sandbox-public-pj1OZ1/`, senza export standard,
  foto, lavori trend/profili non committati; dipendenze locali collegate, non installazione
  pulita. Build con avvisi già noti su import statici/dinamici. Revisione ha tolto un lock
  durante logout RPC e collegato gli errori nativi al percorso esatto nelle impostazioni.
  Coperta anche una notifica di completamento arrivata durante una verifica: una sola rilettura
  locale accodata, non una ripetizione del setup o dell’inferenza; niente stato “in corso” obsoleto.
- Edge headless 375/768/1024/1440 px: checkbox non preselezionata, consenso nuovo dopo rinvio,
  focus ripristinato, nessun overflow, stato aggiornato dopo chiusura/riapertura, nessuna chiamata
  esterna/AI/account e nessun errore console. Fixture iniziale priva delle trasformazioni HTML
  React e dei define Babel dell’app: corretta la fixture per usare la vera configurazione Vite,
  non il prodotto per adattarlo ai test. Ispezionati screenshot mobile/desktop. Nessuna nuova
  dipendenza, fonte/asset vendor o licenza; le skill UI/UX hanno guidato accessibilità e consenso.
- Fonti ufficiali, lette prima dell’implementazione: https://learn.chatgpt.com/docs/app-server
  e https://learn.chatgpt.com/docs/windows/windows-sandbox. Restano setup Windows autorizzato
  e reale, UAC/IT, enforcement filesystem, nuova build desktop in uso e prova modifica AI
  end-to-end. Obiettivo completo Unified/Optix/AI e gate di produzione ancora aperti.

### 144. Servizio dati ricette persistente nel pannello esportato (2026-10-19)

- Ripresa dal punto 143: il turno precedente ha prodotto evidenza nuova sul blocco AI.
  CLI locale 0.163.0 e profilo confinato verificati, readiness Windows `updateRequired`;
  spiegati all’utente gli effetti del setup. Nessuna autorizzazione umana al provisioning:
  niente setup, UAC, richieste AI reali, agenti, riavvio o sostituzione dell’app in uso.
- Revisione del codice e dei riferimenti Unified/Optix: le pagine ricette erano strutture,
  non un motore di parameter set. Corrette le roadmap: controllo Runtime, apply/upload PLC,
  confronto controller e schema object-aware non sono già implementati. Iniziato il servizio
  dati reale, senza presentare un archivio scalare come parità completa o prodotto collaudato.
- Catalogo Framecraft v1 rigoroso: schemi/campi/ricette con ID e nomi unici, booleani, interi
  sicuri, numeri finiti e testi; limiti espliciti e validazione di tutti i valori. Nessuna
  conversione, campo predefinito, indirizzo PLC o ricetta dimostrativa inventata. Nessun UDT
  o mapping automatico ai tipi macchina; catalogo vuoto nel nuovo pannello standard.
- Archivio su filesystem locale, CRUD/copia/rinomina, revisione SHA-256 del contenuto,
  lock esclusivo senza retry e ultime 256 ricevute persistenti vincolate a comando e soggetto.
  Marker e schema hash impediscono reinizializzazioni silenziose dopo perdita dei file o
  cambio configurazione. Temporaneo esclusivo e flush prima della pubblicazione; esito
  incerto dopo un errore di pubblicazione. Junction/symlink/hard link rifiutati; lock residui
  conservati, mai dichiarati abbandonati per età o presenza di un PID. Le ACL del servizio,
  backup coerente e recovery verificata restano requisiti di deployment, non garanzie implicite.
- API HTTP reale sotto `/recipes`, protetta dal token/origine del gateway e da autorizzazione
  applicativa separata per lettura e ogni azione. Soggetto restituito solo dal callback server;
  niente privilegi/actor nel JSON, token di trasporto o PIN browser usati come identità.
  Il launcher standard non simula un identity provider: nega le operazioni finché manca
  l’integrazione applicativa. Guardia su arresto/disconnessione dopo l’autorizzazione;
  le mutazioni già accettate sono attese durante lo stop. Diagnostica con codice e rimedio,
  senza valori, segreti, percorsi o errori grezzi. Nessuna ricetta esposta nello snapshot PLC.
- Il generatore distribuisce catalogo vuoto, parser/store JS e dichiarazioni TypeScript.
  Avvio del servizio realmente esportato provato in sottoprocessi propri con dati sintetici:
  persistenza presente, accesso negato senza autorizzazione, catalogo/archivio corrotti isolati
  senza fermare il monitoraggio PLC o cancellare i dati. Ogni esito distingue salvataggio da
  effetto macchina (`recipe-storage-only`, `plcConfirmed: false`); nessuna chiamata MQTT/OPC UA
  dal servizio ricette. I test HTTP usano loopback; non costituiscono collaudo su un impianto.
- Copia pubblica isolata `.hmi-preview/public-check-wriXNU/`: senza export standard, foto o
  lavori trend/profili preesistenti; dipendenze locali collegate, non installazione pulita.
  **42 test ricette/contratti** e **11 test gateway** passati. Aggiunta e verificata separatamente
  una regressione su marker mancante e cartella non vuota. Coperti concorrenza tra istanze,
  CAS, idempotenza dopo riapertura, guasti prima/dopo rename, corruzione, alias filesystem,
  valori Unicode oltre 128 KiB, permessi e stop con salvataggio già accettato. Tipi e build
  Vite passati nella copia pubblica, con avvisi già noti sugli import statici/dinamici.
  Due precedenti deadline di avvio dei test in parallelo non si sono riprodotte nelle suite
  eseguite separatamente; nessuna soglia ampliata o asserzione rimossa. Causa non accertata.
- Nessuna UI ricette nuova: wizard/AI e form Runtime sono il prossimo collegamento da fare,
  non pronti. Restano identità applicativa effettiva, database/backup industriale, migrazioni,
  UDT/array, import/export vendor, audit regolamentato e handshake PLC. Le ricevute tecniche
  non sono un audit immutabile né Undo. Skill di progettazione/revisione/documentazione usate
  per esplicitare questi confini. Nessuna nuova dipendenza, codice/asset vendor o licenza;
  gate di produzione e obiettivo generale Unified/Optix/AI ancora aperti.
- Fonti ufficiali lette: parameter set Unified V21
  https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-rt-unified/controlling-with-parameter-sets-rt-unified,
  ricette Optix correnti
  https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes.html,
  flush Node 24 https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlesync.

### 145. Editor manuale della configurazione iniziale ricette (2026-10-19)

- Turno precedente di progresso: `c1d583c`, archivio/API ricette persistenti, prove mirate e
  push verificato. Questo turno collega il lavoro all’editor; nessun provisioning Windows
  autorizzato o eseguito, nessuna richiesta AI reale, nessun agente o riavvio dell’app.
- Nuova finestra ampia **Pannello → Ricette**, nello stile esistente. Schemi scalari, campi
  booleani/interi/decimali/testo, unità e limiti, ricette iniziali, copia e rimozione con
  conferma. Nessun valore macchina presunto: una nuova ricetta deve essere compilata, anche
  per `false` e `0`; cambio tipo o campo nuovo non convertono/completano i valori esistenti.
- Import locale JSON Framecraft v1 entro 2 MB: parser condiviso, riepilogo e approvazione della
  sostituzione della sola bozza, poi salvataggio separato. Non è import TSV Unified/CSV Optix.
  Errori riferiti a schema/ricetta/campo, nessuna esposizione del file corrotto, nessun reset a
  catalogo vuoto. Bozza mantenuta dopo conflitto; Escape/chiusura chiedono prima di scartarla.
  Focus confinato e ripristinato, target da 44 px, intestazione/chiusura e salvataggio visibili
  durante lo scroll. Numeri negativi e decimali inseribili senza riscrivere il testo a metà.
- Due comandi nativi dedicati al solo `framecraft.recipes.json`: progetto corrente e generation
  verificati, confronto del contenuto atteso prima della sostituzione con temporaneo/flush.
  Riutilizzati gli helper di file regolare e dimensione delle configurazioni esistenti.
  Il backend controlla involucro JSON v1/sessione/file; il parser condiviso JS UI/servizio
  valida integralmente campi e valori. Nessuna duplicazione incompleta dei tipi PLC in Rust.
- Se compare `.framecraft-runtime/recipes`, anche senza marker o dati validi, salvataggio
  iniziale negato e configurazione in sola lettura: serve migrazione con backup, non cancellare
  l’archivio. Verifica ripetuta al salvataggio; il check non è una transazione distribuita con
  avvii di altri processi. Preparare la configurazione a servizio fermo e coordinare gli avvii.
  Nessun accesso/modifica ai valori operativi o ai lock, nessun riavvio o comando MQTT/OPC UA.
- Errori stringa restituiti dal nativo conservano il rimedio; build desktop senza i nuovi
  comandi spiegata all’utente, senza riavvio automatico. Per usare i nuovi RPC serve una build
  desktop aggiornata: l’eseguibile attuale non è stato ricompilato o sostituito, hash invariato
  prima/dopo i soli test della libreria Rust. Nessuna apertura forzata dell’app per il collaudo.
- Copia pubblica `.hmi-preview/public-check-Z9fdKb/`, priva di JSON standard/foto/modifiche
  trend-profili non committate, dipendenze locali collegate e non installazione pulita.
  Passati 20 test iniziali su ricette/menu/allarmi; dopo le rifiniture ripetuti soltanto i due
  file ricette, aggiungendo la regressione sugli errori nativi. Passati 15 test Rust dei moduli
  configurazione, non tutta la suite. Tipi e build Vite nella copia isolata; avvisi già noti
  sugli import statici/dinamici, nessuna nuova dipendenza o asset/font scaricato.
- Edge headless a 375/768/1024/1440 px: nessun overflow, inserimento di negativi/decimali,
  valori obbligatori, salvataggio esplicito, bozza protetta e focus restituito. Soli adattatori
  sintetici, zero richieste esterne e zero errori console. Screenshot mobile/desktop ispezionati;
  questa prova non è un test IPC Tauri nell’app aperta, né collaudo touch/PLC o industriale.
- Skill UI/UX adattata all’interfaccia scura esistente per focus, contrasto, target e scroll;
  progettazione/revisione/documentazione hanno distinto configurazione iniziale da gestione
  operativa. Restano form operatore Runtime, wizard/AI, identità applicativa, migrazioni,
  UDT/array, DB/audit industriale e apply/upload PLC. Obiettivo generale e gate produzione aperti.
- Riferimento funzionale Optix letto prima delle verifiche:
  https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes/recipex-schemas.html.
  Il designer scalare non implementa TargetNode/Item/DataItem né un formato vendor.

### 146. Ricette iniziali nella chat AI, contesto su richiesta e revisione leggibile (2026-10-19)

- Turno precedente di progresso: `dd226de`, editor iniziale ricette, verifiche mirate e push
  confermato. Proseguito sul collegamento reale alla chat di modifica progetto, non su un altro
  template statico. Nessun agente, inferenza reale, provisioning Windows o riavvio dell’app.
- La sola eccezione nuova alla lista file AI è `framecraft.recipes.json`. Connessioni, segreti,
  file del servizio, `.framecraft-runtime` e archivi operativi restano esclusi. Il catalogo
  compare nell’indice, ma contenuto e contratto ricette sono letti solo se richiesti dal modello.
  Prima si verifica presenza/assenza; non si creano file alla cieca. Nessun accesso filesystem
  o rete del CLI ampliato: provider, modello/ragionamento e preflight confinato restano invariati.
- Contesto con numero schemi e indice massimo di 12, conteggi campi/ricette e limitazione
  dichiarata, non tutti i valori operativi. Stato iniziale scrivibile/in sola lettura preso
  dal nativo; senza metadata non viene presunta la disponibilità. Contratto scalare e regole
  complete aggiunti solo dopo la lettura. Restano 300 kB per file AI, 30 kB di estratti per file,
  80 kB a passaggio, 180 kB totali e massimo tre passaggi. Richiesta non troncata per rientrare.
- Un JSON ricette attraversa il parser condiviso, non il parser JSX. Tipi reali, valori richiesti,
  limiti, ID/nomi unici, assenza di proprietà operative extra e sorgente iniziale valida vengono
  ricontrollati quando si prepara e rivalida il confronto. Le modifiche restano limitate a parti
  lette e sostituzioni uniche. Nuovo schema senza valori espliciti può avere `records` vuoto;
  nessuna unità, soglia, connessione o valore macchina presunto dalle istruzioni.
- La chat usa il normale confronto/approvazione/backup. Prima di applicare e ripristinare legge
  nuovamente il catalogo/stato operativo; controlla file atteso e progetto ancora corrente.
  Il nativo ripete il blocco se esiste un archivio operativo, anche incompleto, nel preflight e
  prima di scrivere ogni file, inclusi rollback e ripristini. JSON v1/involucro e dimensione
  condivisi col dialogo manuale; validazione completa dei campi sempre nel parser UI/servizio,
  non promessa come nuova validazione completa Rust. Nessun file operativo o lock cancellato.
  Batch non atomico multi-file: backup e recovery restano da verificare in caso di guasto/race.
- Riepilogo ricette con schemi, campi e valori prima/dopo, inclusi `0`/`false`, ricavato dai JSON
  convalidati e non dal testo del modello. Massimo 16 righe e valori lunghi abbreviati dichiarati;
  confronto tecnico completo ancora consultabile. Conferma non preselezionata e nessuna scrittura
  al render. La skill UI/UX ha guidato testo mobile 16 px, wrapping, dettagli da 44 px e stile
  coerente; nessun tema/font o asset esterno introdotto.
- Consenso chat esplicito anche per schemi/valori iniziali richiesti, non dati operativi.
  Versione dello scope cambiata: vecchio consenso non esteso implicitamente, bozza conservata,
  nessuna conferma ripetuta a ogni messaggio. La revoca/annullamento impedisce letture e invii
  successivi; recupero della chat non ripristina un’autorizzazione a inviare o applicare.
- Revisione ha individuato una risalita `../` oltre la radice che poteva coincidere con un
  nome interno noto: risoluzione condivisa per estrazione automatica e nuovi import, uscita
  rifiutata prima di associare un file. I JSON ricette non vengono interpretati come moduli
  con import JS. Regole sugli import esistenti e protezioni per i sorgenti restano conservative,
  non una sandbox JavaScript o una garanzia generale di sicurezza macchina.
- Copia pubblica `.hmi-preview/public-check-dPKLRi/`, dipendenze locali collegate, non installazione
  pulita, dati macchina e lavori trend/profili non committati esclusi. **121 test in cinque file**
  AI/ricette/recupero passati; dopo la correzione import ripetuti solo contesto/edits, **51 test**
  con due regressioni nuove. **11 test Rust mirati** fra AI project e configurazione ricette.
  Tipi/build Vite passati, avvisi import statici/dinamici già noti; nessuna suite globale PLC.
- Edge headless 375/768/1024/1440 px: valori leggibili, nessun overflow, approvazione esplicita,
  nessuna scrittura nativa, zero richieste esterne e zero errori console. Screenshot controllati.
  Test chat con provider sintetico; test nativi su filesystem temporaneo. Non è collaudo IPC
  completo dell’app aperta o richiesta reale Codex. Hash dell’eseguibile invariato; serve build
  desktop aggiornata e isolamento Windows autorizzato per verificare il percorso reale.
- Skill OpenAI Docs: letto il contratto `outputSchema` per turno in
  https://learn.chatgpt.com/docs/app-server prima dell’implementazione; nessun cambio al protocollo
  o installazione/login automatici. Progettazione/revisione/documentazione hanno distinto
  configurazione iniziale, archivio operativo e comandi PLC. Nessuna nuova dipendenza/licenza.
  Restano wizard iniziale ricette, form operatore Runtime, identità applicativa, UDT/migrazioni,
  audit/DB industriali e apply/upload PLC. Obiettivo Unified/Optix/AI e gate produzione aperti.

### 147. Catalogo ricette iniziale nel wizard AI e nel progetto generato (2026-10-19)

- Progresso precedente `ae6cccb`: chat del progetto collegata alle ricette iniziali. La domanda
  successiva sulla configurazione Windows è stata chiarita confrontando documentazione ufficiale
  e profilo separato Framecraft; nessun provisioning autorizzato o eseguito. Ripresa la pipeline,
  senza agenti, inferenza reale o modifiche al confinamento Codex.
- Il passo dati di Nuovo pannello → Con AI accetta facoltativamente `framecraft.recipes.json`.
  Parser scalare condiviso con editor e servizio: massimo 2 MB, identificativi/nomi unici,
  tipi, limiti e tutti i valori obbligatori. Archivi operativi con revisioni/ricevute, campi
  extra, versioni o valori non validi sono rifiutati; il catalogo già scelto resta intatto.
- Separati selezione file, controllo e pulsante Usa questo catalogo. Prima del pulsante il file
  non è incluso nel piano. Ogni schema espone campi, tipi, unità e limiti; la selezione della
  ricetta consente di controllare tutti i valori senza riempire la pagina con centinaia di righe.
  `0`, `false`, decimali negativi e stringa vuota rimangono distinguibili e non vengono convertiti.
  Annullare mantiene la scelta precedente; rimuovere chiede conferma e cambia solo il questionario.
  Letture terminate dopo chiusura o sostituzione del catalogo vengono ignorate.
- Catalogo validato e nome del file conservati nella bozza locale recuperabile. Le bozze precedenti
  senza ricette continuano a essere accettate. Consensi e operazioni macchina non vengono recuperati
  implicitamente. La validazione blocca configurazione e generazione se il catalogo non è valido.
- Il generatore copia il catalogo approvato nel file iniziale, senza reinterpretazione AI,
  modifiche alle ricette in base ai requisiti testuali, creazione di un archivio operativo o
  avvio di connessioni/servizi. Senza scelta resta il catalogo vuoto, non ricette dimostrative.
  La prova del servizio distribuito usa adesso il file prodotto realmente dall’intervista.
- All’AI di creazione arrivano solo conteggi di schemi/campi/ricette e limiti espliciti:
  niente nomi, valori, filename, tag o percorsi. Cambiare soli valori locali aggiorna il piano
  e la revisione senza altra richiesta quando il contesto rimane identico; nuovi conteggi o
  dati non validi invalidano il piano. Prima della creazione l’utente rivede il catalogo locale.
- Copia pubblica iniziale `.hmi-preview/public-check-4oZsku/`: **74 test mirati in cinque file**
  (intervista, deleghe, recupero, ricette e servizio generato), tipi e build passati. Copia finale
  `.hmi-preview/public-check-SRGxyH/`: ripetuto solo il file cambiato, **27 test** incluse due
  regressioni nuove; nella copia finale `.hmi-preview/public-check-lhmXLa/` passata la sola
  regressione sul blocco del ritorno alla modifica durante la creazione (una passata, 27
  saltate), per **77 test unici**. Tipi/build e browser ricontrollati sul codice finale.
  Dipendenze locali collegate, non installazione pulita;
  dati macchina e lavori trend/profili non committati esclusi. Nessuna suite globale o test Rust
  ripetuto: nessun codice nativo è cambiato.
- Edge headless 375/768/1024/1440 px: importazione esplicita, valori leggibili, nessun overflow,
  chiamata AI, scrittura nativa, richiesta esterna o errore console. Screenshot mobile/desktop
  ispezionati; skill UI/UX applicata a wrapping, target da 44 px, focus e testo mobile da 16 px,
  senza introdurre temi, font o asset esterni. Non è un collaudo IPC Tauri, touch fisico o PLC.
- Riferimento funzionale Optix letto:
  https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes/recipex-schemas.html.
  Il catalogo Framecraft non implementa TargetNode/Item/DataItem, un formato vendor o una licenza
  Runtime vendor. Nessuna dipendenza/licenza nuova e nessun asset/documento vendor distribuito.
- Restano creazione diretta degli schemi nel wizard, adattatori CSV/vendor/DB, form operatore
  Runtime e collegamento alla pagina Ricette, identità/autorizzazione server, confronto e
  trasferimento/handshake PLC, UDT/migrazioni, audit e collaudo industriale. La pagina guidata
  Ricette resta esplicitamente struttura. Il percorso reale Codex richiede ancora preflight
  Windows pronto/autorizzato; l’eseguibile dell’app non è stato sostituito o riavviato.
  Roadmap aggiornate senza dichiarare la parità Unified/Optix o la pipeline completa raggiunte.

### 148. Avvio dell’app senza attendere tutto l’editor sulla home (2026-10-19)

- Segnalazione: con `npm run dev` la finestra appare ma resta bianca per uno/due minuti.
  Intervento autorizzato mantenendo il comando, senza eliminare cartelle, progetti o bozze.
  Distinto il caricamento frontend dalla compilazione Rust: nessuna modifica nativa.
- Riprodotto un costo del watcher Vite: circa 5.400 directory/42.900 file temporanei sotto
  `.hmi-preview` erano sorvegliati nonostante `.gitignore`. Confronto ripetuto con cache nuove
  equivalenti: home in 70,5 s con vecchie esclusioni, 11,2 s escludendo il temporaneo. Il vecchio
  scanner dipendenze non attraversava già le directory nascoste: non era quella la causa.
- Esclusione assoluta e circoscritta alla `.hmi-preview` del checkout; i sorgenti restano
  sorvegliati anche in una copia di verifica annidata in un temporaneo. Entry dipendenze esplicita
  `index.html`. Nessuna cancellazione o modifica alle cartelle dei pannelli.
- AppShell, finestre impostazioni/aiuto/account/comandi/AI e procedura Nuovo pannello differiti
  con `lazy`/`Suspense` a livello modulo. Scelte e conteggi standard separati dal generatore,
  preservandone anche le vecchie esportazioni; sezioni, pagine e procedura manuale/AI invariate.
  Home: 186 → 87 moduli sorgente e 36 → 0 moduli `?raw`; circa 250 → 120 richieste.
- Stato iniziale direttamente nell’HTML: tema scuro esistente, annuncio accessibile e movimento
  ridotto. Errori del modulo iniziale mostrano una spiegazione, senza reload o pulizie automatiche;
  gli errori successivi non sostituiscono il progetto già montato. Skill debug e UI/UX applicate
  all’isolamento del ritardo e al feedback iniziale, senza nuovi font, asset o dipendenze.
- Copia pubblica `.hmi-preview/public-check-XZ6b6y`: 70 test mirati in sei file passati (avvio,
  wizard, eventi desktop/recupero, account, intervista e pipeline AI). Dopo la sola correzione
  di compatibilità TypeScript del config, otto test avvio ripetuti nella copia `public-check-4ZFfBl`;
  tipi e build produzione passati. Restano gli avvisi di import statici/dinamici condivisi in
  altri moduli: il bundle iniziale è ancora ottimizzabile, non è stato riscritto lo store globale.
  Dipendenze locali collegate, non installazione pulita; export macchina e lavori trend/profili
  preesistenti esclusi dallo snapshot e dal commit. Nessuna suite globale, inferenza o test Rust.
- Edge headless sul codice pubblico: home 8,5 s nella prova isolata, 17 s durante tipi/test in
  parallelo, zero errori JS, finestre impostazioni apri/chiudi/riapri, nessun generatore caricato
  sulla home. Screenshot iniziale a 375/1440 px ispezionati: niente overflow, tema corretto,
  reduced motion e fallimento del modulo spiegato. Nessuna richiesta esterna o scrittura IPC.
  Anche il frontend compilato apre home e impostazioni senza errori, caricando i chunk delle
  finestre solo su richiesta. Build, browser e test usano codice pubblico senza i lavori trend.
  Questi tempi misurano il frontend locale, non l’intero avvio della finestra Windows.
- Per applicare il config serve rilanciare `npm run dev`. Da confermare il tempo nel WebView
  dell’utente e nell’installer finale; compilazione Rust a freddo e gate produzione restano
  separati. L’eseguibile esistente non è stato sostituito o riavviato da queste verifiche.

### 149. Compilazione desktop e preparazione frontend in parallelo (2026-10-20)

- Priorità dell’utente: risolvere anche la compilazione, non solo la finestra bianca del punto 148.
  L’utente ha salvato e chiuso l’app per evitare riavvii durante il lavoro. Un’interruzione della
  verifica automatica per crediti esauriti ha fermato temporaneamente i comandi; ripresa il 20/10
  dopo nuova verifica autorizzata, senza aggirare il controllo. Nessun agente utilizzato.
- Ricompilazione iniziale di riferimento: 24,1 s con dipendenze già in cache. Il manifest produceva
  anche una libreria statica da 779 MB e un DLL non usati dall’host desktop. Ora produce `rlib` e
  l’eseguibile; i vecchi artefatti non sono stati eliminati. I layout HMI mobile restano web e
  invariati; un eventuale host nativo Android/iOS richiederebbe una configurazione dedicata.
- Profilo dev: stack trace con file/riga, niente simboli delle dipendenze. Controlli di debug,
  overflow e unwind non disabilitati; release invariata. Profilo `debugging` esplicito con simboli
  completi anche delle dipendenze. La prima ricostruzione di cache col nuovo profilo ha richiesto
  315 s su questa macchina; eseguita qui, non presentata come un miglioramento a freddo verificato.
- Selezione di sviluppo dal normale `npm run dev` tramite `tauri.dev.conf.json`, che annulla solo
  `bundle.resources`. Il backend usa già il plugin dal checkout quando presente: le modifiche ai
  runtime JS non devono più invalidare la compilazione Rust. Il manifest di distribuzione conserva
  tutti i 15 percorsi risorsa; niente rimozione di file, autorizzazioni, driver o controllo PLC.
- Warmup Vite del solo entry `src/main.tsx` in parallelo alla compilazione: nessuna compilazione
  produzione forzata o attesa artificiale per mostrare la finestra. Colore nativo iniziale allineato
  al tema HTML già presente. Dialoghi/generatori rimangono differiti come al punto 148.
- Nove test mirati avvio/configurazione e tipi del config passati sullo snapshot pubblico
  `.hmi-preview/public-check-WvFnSu`, senza dati macchina o lavori trend/profili preesistenti.
  Dipendenze locali collegate, non installazione pulita; nessuna suite generale o inferenza AI.
- Profilo finale: ricompilazioni equivalenti da circa 24 s iniziali a 6–14 s nelle prove successive,
  con variabilità del carico locale; non una garanzia su altre macchine o sulla prima build pulita.
  Build invariata in 1,05 s; dopo aggiornamento della data di `framecraft-snap.mjs`, 1,2 s e artefatti
  ancora `fresh`. JSON Cargo conferma `opt_level=0`, debug assertions e overflow checks attivi.
  I file JS non compaiono più nel depfile dell’eseguibile di sviluppo.
- Confronto frontend/compilatore con cache Vite nuove e ordine invertito: verificato che il main
  sia realmente pretrasformato solo con warmup. Pipeline controllata con warmup 8,4–13,6 s, e dalla
  navigazione browser alla home 1–2,4 s, senza errori JS o generatori caricati sulla home. Questi
  numeri includono il compilatore reale ma usano Edge headless, non misurano il WebView nativo.
- Singolo test Rust `bundled_preview_resources_match_the_backend_lookup_path` passato (110
  filtrati): tutti i 15 percorsi della distribuzione ancora corretti. Nessun test macchina eseguito.
  Prova finale del vero `npm run dev`: Vite pronto in 2,23 s, Cargo senza ricompilare in 2,43 s,
  eseguibile avviato e lasciato aperto per la verifica utente. Nessun progetto aperto/modificato
  durante la prova e nessuna interazione con account, driver o PLC. Il tempo visivo del WebView
  resta da confermare dall’utente; native binary ricostruito, nessun installer prodotto.
- Riferimenti primari verificati: Cargo build performance/profiles, Vite server warmup e Tauri
  preparing-for-mobile/configuration. Nessuna nuova dipendenza, licenza o risorsa vendor.
  La riduzione dei simboli cambia l’esperienza del debugger, non i permessi dell’app o del PLC.

### 150. Creazione degli schemi ricetta nella procedura iniziale (2026-10-20)

- Ripresa la priorità AI + app dopo gli interventi di avvio. Il passo dati ora permette di creare
  e modificare schemi e ricette iniziali senza preparare JSON, oppure importare o rimandare come
  prima. Non serve collegare l’account per compilare questi dati locali; il percorso manuale
  Pannello → Ricette resta indipendente dall’AI e dal questionario.
- Estratto l’editor scalare in `RecipeCatalogEditor`: stessi tipi, limiti, campi, valori, copia e
  rimozioni confermate per progetto e wizard. Nessuna scelta automatica di valori; zero e false
  vanno inseriti esplicitamente. Il testo vuoto ha un pulsante esplicito, distinto da dato mancante.
- La nuova finestra conserva una bozza separata; Usa queste ricette nel progetto applica soltanto
  un catalogo valido al questionario. Annulla/Escape chiedono conferma quando serve e non cambiano
  il catalogo approvato. Un aggiornamento esterno del catalogo lascia la bozza visibile ma blocca
  la sovrascrittura obsoleta. Modificare un import non continua ad attribuire i dati al vecchio
  filename. Recupero persistente solo dopo Usa; il guard beforeunload non è un backup della bozza
  ancora invalida/non approvata e il comportamento alla chiusura nativa resta da collaudare.
- Focus, Tab/Escape e ritorno al controllo precedente condivisi con il dialogo manuale. L’assistente
  lascia gli eventi alla finestra figlia: Escape non chiude l’intera procedura. Etichette esplicite
  dei select. Skill UI/UX applicata a conferme, focus, target da 44 px, leggibilità mobile e tema
  esistente; nessun font, asset, dipendenza o licenza nuova. Nessun agente utilizzato.
- Il catalogo approvato usa i percorsi già esistenti: recupero dell’intervista, riepilogo, validazione
  e `framecraft.recipes.json` generato. L’AI riceve ancora solo i conteggi: nomi, limiti, valori e file
  restano locali. Nessuna inferenza, scrittura nativa, connessione PLC o richiesta esterna implicita.
- Snapshot pubblico iniziale `.hmi-preview/public-check-24N97L`: 49 test mirati in quattro file
  passati (bozza, dialogo manuale, pipeline guidata e configurazione), tipi e build passati.
  Snapshot finale `.hmi-preview/public-check-A4kcEw`: 18 test dei due dialoghi, inclusa una nuova
  regressione sulla provenienza dell’import, per 50 test unici. Tipi/build e browser ricontrollati
  sul codice finale; nessuna suite generale o test Rust. Corretto anche il ritorno del focus al
  pulsante apri-ricette, perso quando il fieldset sottostante viene disabilitato.
  Export privati e lavori trend/profili preesistenti esclusi; dipendenze locali collegate, non
  installazione pulita. Il codice nativo e l’eseguibile non sono cambiati.
- Edge headless sulla procedura reale con dati sintetici, a 375/768/1024/1440 px: creazione campi,
  limiti, zero/false/testo vuoto, rifiuto fuori limite senza perdere input, conferma/annullamento,
  tastiera nella finestra figlia e catalogo generato identico. Zero errori JS, inferenze o scritture
  native/richieste esterne; screenshot mobile e desktop ispezionati. Non è un collaudo IPC Tauri,
  touch fisico o impianto. Prova con account Codex reale ancora subordinata al preflight Windows.
- Consultata la guida ufficiale Optix current 1.8.0 sugli schemi: configurazione intermedia e Apply
  tenuti distinti dalla gestione Runtime. Framecraft usa il proprio catalogo scalare, non implementa
  ancora TargetNode/Item/DataItem, UDT o un formato vendor. Riferimento:
  https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes/recipex-schemas.html.
- Restano form operatore e collegamento alla pagina Ricette, identità e permessi server, mapping e
  confronto/handshake PLC, migrazioni e backup industriali, adattatori CSV/vendor/DB e audit.
  La pagina guidata Ricette resta esplicitamente struttura. Nessuna parità Unified/Optix o prontezza
  produzione dichiarata; roadmap AI e Optix aggiornate senza cancellare l’obiettivo complessivo.

### 151. Form archivio ricette nel pannello generato (2026-10-20)

- Proseguita la pipeline app + AI sul form operatore: la pagina guidata Ricette e formati v2
  contiene `HmiRecipeControl`, non più il solo avviso di struttura incompleta. Lo stesso
  controllo è in Aggiungi → HMI e PLC → Archivio ricette, indipendentemente dall’AI.
  I vecchi progetti richiedono un aggiornamento esplicito del Runtime. Nessuna migrazione
  automatica dei pannelli o dei loro archivi; immagini eventualmente scelte restano presenti.
- Lettura solo su Rileggi archivio; form da schemi scalari del servizio, campi obbligatori,
  limiti, zero/falso/testo vuoto espliciti, decimali con punto o virgola senza separatori
  delle migliaia. Nuova/modifica/copia/rinomina/elimina con confronto e conferma separata.
  Dati inseriti con textContent, mai HTML eseguito; nessun nome, tag o valore macchina inventato.
- Revisioni attese e bozze conservate sui conflitti. Rileggere non aggiorna automaticamente
  la base: serve confronto e consenso. Il confronto dopo rebase usa la sorgente corrente,
  anche per una copia; non mostra valori vecchi mentre il servizio copierebbe quelli nuovi.
- Client HTTP stessa origine, timeout/abort, risposta limitata e validata, nessun token browser
  e nessuna coda/ripetizione automatica. Un POST con risposta persa/non valida resta incerto:
  blocca nuove operazioni e conserva solo l’ID in sessionStorage, separato per progetto/percorso.
  Ripetizione esatta ID/corpo solo in memoria e con conferma esplicita; dopo reload soltanto
  rilettura/confronto e chiusura manuale dell’avviso. Storage non disponibile blocca il POST.
  Diagnostica con codice e ID, senza payload, nomi, credenziali o dettagli grezzi del trasporto.
- Identità e permessi restano del server, verificati a ogni richiesta; il launcher standard
  continua a negare l’accesso senza integrazione reale. PIN e permessi visivi non sono identità.
  Nessun apply/upload/download, mapping o handshake PLC: salvare nell’archivio non comanda
  la macchina. Namespace client invalido disabilita solo le ricette, non gli altri controlli.
- In Modifica il controllo è segnaposto, senza richieste al servizio. Menu e cambio dispositivo
  avvisano della bozza e non lasciano la pagina durante una richiesta; beforeunload è soltanto
  un avviso. Bozze non persistenti, Back/history SPA, crash, chiusura nativa, multi-tab e sessione
  browser terminata restano gate di recovery. Dispose cancella listener/guard e interrompe le
  richieste locali senza fingere l’annullamento di un salvataggio già accettato dal server.
- Skill UI/UX applicata a etichette, focus, conferme e layout mobile della pagina guidata:
  controlli da 48 px (45 px dopo scala desktop), senza overflow orizzontale. Il widget aggiunto
  a una pagina personalizzata non ne riscrive il layout. Skill documentazione applicata alla
  procedura operatore e agli esiti incerti in runtime/README.md; aggiornati README e roadmap.
- Snapshot pubblico iniziale `.hmi-preview/public-check-aA0py0`: 74 test mirati in sei file,
  tipi e build editor passati. `.hmi-preview/public-check-l1xxzB`: 29 test dei tre moduli cambiati
  e due controlli mirati palette passati; tipi/build ricontrollati. Ultima correzione copia/rebase
  nella copia `.hmi-preview/public-check-15Ec3g`: 10 test form, tipi dei moduli/test interessati
  e build editor passati. Totale 81 test unici, senza suite generale o test Rust. Restano gli
  avvisi preesistenti di import statici/dinamici. Dati privati e lavori trend/profili esclusi.
- Edge headless sul progetto realmente generato: accesso negato e poi autorizzato dal callback
  sintetico server, salvataggio su file, risposta POST persa e reload senza replay, Modifica senza
  chiamate ricette, namespace invalido isolato e bundle generato senza token. Form a
  375/768/1024/1440 px, target effettivi >=44 px, screenshot ispezionati, zero errori JS e nessun
  PLC. Build produzione del pannello passata; non è un collaudo completo del tsconfig/scaffold
  nativo, dell’IPC o dell’installer. Fixture in `public-check-l1xxzB/.hmi-preview/recipe-browser-tDzdCd`;
  l’ultima variazione al rebase è verificata dai test mirati del form. Dipendenze editor locali
  collegate; router della fixture da cache npm offline, senza script d’installazione o audit.
- Consultata la guida ufficiale Optix current 1.8.0: editor archivio e trasferimento controller
  restano capacità distinte. Nessun codice/asset vendor, nuova dipendenza o licenza aggiunta:
  https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/recipes.html.
  Restano identità/ACL server integrate, recupero industriale, UDT/array, DB e backup, audit,
  confronto/handshake PLC e collaudo reale. Nessuna parità Unified/Optix o prontezza produzione
  dichiarata, nessuna inferenza AI, provisioning Windows o riapertura dell’app utente.

### 152. Account operatore locali verificati dal server (2026-10-20)

- Scelta esplicita dell’utente: account locali del pannello, con username/password e permessi
  assegnati dal responsabile. Separati da ChatGPT/Codex, dai PIN del browser e dal token proxy.
  Nessun utente, amministratore, password o concessione predefinita; nessuna conversione dei PIN.
- Archivio privato `.framecraft-runtime/security/operators.json`, escluso da Git/public/dist.
  Schema stretto, limite account/file, hash scrypt N=131072/r=8/p=1 con salt casuale; verifica
  asincrona e confronto costante, massimo due derivazioni contemporanee. Node crypto, nessuna
  nuova dipendenza. CAS, lock esclusivo e pubblicazione atomica; errori/lock/corruzione non
  provocano reset, riparazioni o cancellazioni automatiche. ACL e backup del servizio da collaudare.
- CLI esplicito nel runtime generato: operators add/list/password/permissions/disable/enable,
  password nascosta due volte e conferma SALVA. Nessuna password in argomenti/env/log, nessun
  provisioning automatico dall’editor o dall’AI. Ruolo solo descrittivo, capacità server e
  permessi grafici distinti. GUI amministrativa e policy avanzate ancora da implementare.
- Login/logout/stato HTTP dietro token proxy e origine verificata. Sessione opaca server in
  memoria, cookie HttpOnly/SameSite Strict e Secure per HTTPS; CSRF in memoria browser per le
  mutazioni. HTTP ammesso solo su loopback esplicitamente configurato. Idle e durata assoluta,
  letture/polling senza rinnovo; cambio archivio/password/permessi, disabilitazione e riavvio
  revocano le sessioni. Rate limit per username e globale, sessioni/derivazioni limitate.
- Launcher standard integra gli account reali configurati, non richiede più callback esterni
  per ricette/allarmi/tag. Capacità verificate prima di ogni comando e ricevuta duplicata;
  token gateway da solo non autorizza più le write. Dedupe delle write legato anche al soggetto.
  Consensi gateway/connessione/mapping e interlock PLC restano necessari. Nessun comando
  automatico, inferenza di identità, replay offline o conferma PLC presunta.
- Pulsante utente standard accessibile anche da tastiera, form username/password e gestione
  sessione desktop/mobile; PIN locale mai usato come fallback quando il provider server è presente,
  neppure dopo errore/scadenza/dispose. Regole grafiche leggono il profilo server. CSRF aggiunto
  a ricette, allarmi e write; errori noti con rimedi, senza testo grezzo o credenziali. Uscita
  senza risposta resta non confermata. Cambio account rispetta la guardia delle bozze ricetta.
- La pipeline nuovi pannelli include moduli e framecraft.auth.json disabilitato con namespace
  proprio; nessuna credenziale nel progetto pubblico. Preview editor senza installazione della
  sessione o rete. Aggiornamento dei vecchi progetti solo esplicito. Vite generato nega accesso
  HTTP alla cartella privata e conserva i deny per env/certificati/config di registro. Non
  copiare segreti in public o esporli tramite alias/symlink/loader; produzione con web root dist.
- Skill system-design applicata ai confini account/sessioni/trasporto/capacità; UI/UX a etichette,
  focus nativo dialog, controlli >=48 px e assenza di overflow mobile; documentazione a setup,
  errori e limiti nel README runtime. Consultati riferimenti primari OWASP password/session/CSRF,
  Node crypto e Vite fs.deny. Nessun codice o asset vendor/nuova licenza incorporati.
- Snapshot pubblico `.hmi-preview/public-check-NByxSm`, senza export WinCC privati: 116 test
  mirati in 12 file, tsc -b e build editor passati. Altri 11 test del solo bridge HTTP/MQTT
  modificato passati con broker locale isolato, non PLC. Ultimo test launcher aggiunto nella
  copia `.hmi-preview/public-check-cSn33e`: tutti e 6 i test generazione ricette passati, incluso
  login/logout con archivio locale e salvataggio ricetta nel processo distribuito. Totale 128
  test unici; tipi stretti dei moduli/test account, gateway e client passati. Nessuna suite
  generale o test Rust; restano gli avvisi preesistenti di import statici/dinamici.
- Edge headless sul pannello realmente generato: login/logout con password/hash sintetici e
  cookie/CSRF reali, ricette su file, risposta persa/reload senza replay, preview editor senza
  chiamate ricette, namespace ricette invalido isolato. Viewport 375/768/1024/1440, zero errori
  JS, nessun overflow, target login >=48 px; screenshot login 375/1440 ispezionati. Richieste
  dirette /@fs e ?raw/?import a credenziali/archivio negate, bundle produzione senza token,
  password, salt o hash. Build pannello passata, non collaudo completo scaffold/IPC/installer.
  Fixture: `public-check-NByxSm/.hmi-preview/recipe-browser-1lskUz`. Creazione CLI interattiva
  provata separatamente in `operator-cli-F713PQ`: password mai mostrata, hash verificato e soli
  permessi scelti; nessun account dell’utente creato o modificato.
- Restano ACL per singolo tag/ricetta/allarme/pagina, gruppi/SSO/MFA, amministrazione grafica,
  audit immutabile, policy password avanzate, revoca distribuita e collaudo carico/HTTPS/ACL
  Windows/backup/recovery sul target. Snapshot PLC non segregato per utente; logout non annulla
  un comando già accettato e non è arresto macchina. Roadmap Unified/Optix ancora PARZIALE;
  nessuna equivalenza vendor o prontezza industriale dichiarata. Lavori trend/profili e dati
  privati preservati, niente agenti, riapertura nativa o richieste AI reali.

### 153. Gestione grafica degli account locali e sessioni (2026-10-20)

- Proseguita la capacità utenti Unified/Optix: Pannello → Account del pannello apre la gestione
  locale nell’editor, anche dagli accessi dell’ispettore. Creazione esplicita, dati/permessi,
  cambio password e disabilitazione/riattivazione; nessun utente/capacità preselezionata,
  recupero password o cancellazione automatica. Username/ID stabili. Ruolo descrittivo,
  capacità server e ID dei permessi grafici separati. Riepilogo e conferma prima di scrivere.
- Finestra ampia, etichette, focus/Tab/Esc e ritorno al trigger, comandi >=44 px, layout
  verticale sotto 700 px. Percorso locale effettivo visibile anche in conferma: una copia
  Framecraft non è l’archivio dell’originale o del server remoto. Nessun dialogo di password
  esposto via HTTP dal Runtime; nessuna promessa di amministrare un servizio remoto.
- Servizio e sessioni salva soltanto framecraft.auth.json con CAS e generazione progetto:
  abilitazione, idle/assoluta ed eventuale HTTP loopback. Serve riavvio manuale del servizio,
  oltre a origini/proxy/TLS corretti; lo stato del file non certifica il servizio attivo.
  Configurazioni assenti/non compatibili non vengono inventate o sostituite. Vecchi progetti
  richiedono aggiornamento esplicito del Runtime. Nessun restart/connessione/comando PLC.
- PIN e regole grafiche precedenti sono una pagina di compatibilità distinta, con ritorno
  agli account server e conferma prima di scartare la bozza. Non convertono o promuovono PIN.
  Aprire la gestione server non legge più in parallelo il runtime PIN: evita I/O inutile e
  la competizione sul progetto durante la lettura nativa. Caricamento PIN solo su scelta
  esplicita; risposta di un progetto precedente non aggiorna quello nuovo.
- Nuovo modulo operator-admin riusa schema/scrypt/lock/CAS del servizio. Lettura senza
  provisioning; credenziali private, metadati senza hash/password. Account modificati solo
  dopo confronto della revisione. Percorsi non regolari/symlink, campi extra e concessioni
  ignote rifiutati; store corrotto mai rimpiazzato con utenti vuoti o predefiniti.
- Tre IPC nativi limitati alla finestra principale, root autorizzata e generazione corrente.
  Worker Node con codice incorporato nell’app (import data URL), non moduli del progetto,
  Node di sistema risolto fuori dal progetto, NODE_OPTIONS/NODE_PATH rimossi, stdin per le
  password, stdout tipizzato con soli metadati, stderr grezzo non esposto. Input/output
  limitati, timeout e lavoro fuori dal thread UI; lock progetto durante l’operazione.
  Node >=22.13 richiesto, raccomandato LTS 24; AUTH_NODE distinto e nessuna installazione
  automatica. Nessuna dipendenza Cargo/npm o licenza aggiunta; binario Node non distribuito qui.
- Password solo nello stato locale del modulo e nel canale del processo, rimosse dal modulo
  dopo ogni invio; mai in argomenti/env/URL, checkpoint, sorgenti o contesto AI. Marker
  sessionStorage con solo pending, indicizzato per namespace e percorso locale codificato;
  distingue originale/copia anche con namespace uguale e normalizza il caso dei path Windows.
  Memoria bloccata impedisce l’invio. Risposta incerta non viene ritentata: rilettura/confronto,
  verifica login per password e consenso per chiudere l’avviso, non certificazione di esito.
- Verificata esclusione delle credenziali dall’esportazione del codice: copia/esporta non è
  un backup utenti. Il deployment deve predisporre esplicitamente gli account sul target;
  GUI locale e CLI disponibili, non copia automatica dei segreti nel pacchetto pubblico.
- Skill system-design applicata a confini editor/progetto/servizio/worker e scelta di riusare
  la logica Node senza duplicare crypto; UI/UX a conferme, focus e target; documentazione a
  procedura, errori, differenza copia/target e limiti in runtime/README. Consultate capacità
  IPC Tauri e codice della versione installata: nessuna capability remota aggiunta; i limiti
  iframe/piattaforma restano da collaudare, non aggirati con permessi più larghi.
- Snapshot pubblico `.hmi-preview/public-check-KN3h6z`, senza export WinCC privati o modifiche
  trend/profili: 64 test mirati JS in sei file, 7 test Rust del solo modulo nuovo, tsc -b e
  build editor passati. Ultimi controlli su isolamento marker e apertura PIN su richiesta
  nella copia `.hmi-preview/public-check-g5pzf8`: 45 test dei soli tre file coinvolti e nuova
  build/tipi passati. Totale 66 test JS unici + 7 nativi, non suite generale. Avvisi preesistenti
  di import statici/dinamici ancora presenti; dipendenze locali collegate, non clean install.
- Test nativi: worker realmente eseguito, hash privati senza segreti nelle risposte, CAS,
  progetto diverso e sessione stale rifiutati, config validata, finestra diversa negata,
  moduli del progetto non eseguiti, export senza archivio privato. Nessuna app/finestra aperta.
- Edge headless sulla finestra reale, con IPC di prova collegato al modello e a file sintetici:
  creazione/permessi, hash/password verificati, disabilitazione, configurazione servizio,
  mutazione applicata con risposta persa e reload senza replay, nessun segreto nei metadati.
  Viewport 375/768/1024/1440, zero errori JS e overflow, pulsanti >=44 px; screenshot 375/1440
  ispezionati. Fixture finale `public-check-g5pzf8/.hmi-preview/operator-ui-usoiAX`. API simulate
  soltanto account/config e letture sessione/lista sorgenti per il recovery dell’editor; nessuna
  chiamata AI, avvio servizio, preview, PLC o account reale. Non è collaudo IPC/WebView2 nativo.
- Restano amministrazione remota/centralizzata, gruppi e ACL per risorsa, audit/firme, policy
  password avanzate, backup/restore/ACL Windows, packaging/provisioning sul target, guasti e
  collaudo produzione. Stato roadmap ancora PARZIALE: GUI locale non equivale a parità vendor
  o rilascio industriale. Obiettivo complessivo invariato e attivo; dati privati e 18 modifiche
  trend/profili preservati, niente agenti o inferenze AI reali.

### 154. Limiti server per risorsa degli account locali (2026-10-20)

- Account locali, non ChatGPT: capacità generali più limiti esatti per scritture tag,
  azioni allarmi e modifiche agli schemi ricetta. Check prima di driver/archivio/deduplica;
  errore AUTH_RESOURCE con rimedio, niente reinvii automatici, log senza valori/risorse.
- Archivio v2 chiuso: una regola per account, nessun jolly/ereditarietà/fallback permissivo.
  Lettura/login v1 invariati; migrazione solo su conferma Risorse consentite/resources,
  backup privato v1 prima di pubblicare con lock/CAS. Nessuna modifica a hash/password/UUID.
  Altri account mantengono i limiti precedenti; nuovi account v2 partono da nessuna risorsa.
- GUI con cataloghi locali tag/allarmi/schemi e ID manuali, riepilogo, avviso compatibilità,
  stessi fence di progetto/recupero senza replay. Bridge nativo tipizzato e worker incorporato:
  programma fidato e input via stdin limitato, non argv Windows né moduli del progetto.
  CLI e pipeline standard generano gli stessi file e applicano gli stessi controlli.
- Verifiche mirate: 48 test pubblici account/sessioni/gateway/GUI/generazione/ricette superati
  in sequenza (8 file); 7 test Rust del solo modulo operator_admin, inclusa migrazione reale
  del worker, superati. TypeScript pubblico e build Vite riusciti, con avvisi chunk già noti.
  Il primo giro parallelo aveva scadenze di test crypto/avvio sotto carico: rieseguito senza
  alzare timeout né indebolire i controlli. Nessuna intera suite rieseguita.
- Browser con GUI React reale e archivio privato sintetico: creazione, selezione tag da catalogo,
  migrazione con hash invariato, disabilitazione, configurazione, risposta persa/reload senza
  replay. IPC browser simulato; worker nativo verificato separatamente, non una prova WebView2.
  Viewport 375/768/1024/1440 senza errori JS/overflow e pulsanti >=44 px. Screenshot ispezionati:
  footer mobile corretto dopo verifica visiva, messaggio di salvataggio precedente non riutilizzato.
  Sorgenti finali pubbliche: public-check-W2UWhD, fixture operator-ui-SXeHBq; nessun dato privato
  tracciato, dipendenze tramite junction locale (non installazione pulita). Le 18 modifiche
  preesistenti a trend/profili restano fuori dall’indice di questo intervento.
- Non equivale a sicurezza completa: restano ACL di lettura/per-record, gruppi, audit persistente,
  policy password, ACL Windows/restore collaudato, provisioning e test sul target reale.
  Nessuna connessione/comando PLC reale, avvio app o inferenza AI effettuati per questa fase.

### 155. Audit persistente dei comandi e accessi Runtime (2026-10-20)

- Documentazione primaria Unified Audit V21 / Optix Event logger ricontrollata: richiesta,
  identità ed esito non equivalgono a firma elettronica, conformità GMP o conferma PLC.
- Registro privato SQLite incorporato in Node; nessuna dipendenza npm. Due fasi per comandi,
  identità server, risorse esatte (anche record/destinazione ricetta), tracce e deduplica.
  Niente valori PLC/ricette, password, token o cookie. Accessi/uscite e rifiuti instradati;
  polling/letture, amministrazione locale e tutti i rifiuti a monte restano fuori da questa fase.
- Prima del comando: log guasto/occupato/pieno blocca l’effetto. Dopo: esito incerto mantenuto
  anche dal browser/cliente ricette, senza replay o cancellazione del checkpoint. Logout
  sempre revocato. Arresto del gateway attende effetti/audit avviati, non autorizzazioni tardive,
  prima della chiusura del registro. Regressione di arresto individuata e corretta senza alzare timeout.
- Transazioni FULL/WAL, catena SHA-256, identità legata al namespace, controlli percorsi/file
  e sidecar, nessuna riparazione/reset/rotazione distruttiva. Limiti 64 MiB/100.000 eventi:
  archiviazione/restore, ACL Windows, firma/ancora esterna e carico/power-loss restano gate.
- CLI di lettura/verifica/pagine e contatori separati pendenti/incerti; ID account nella lista
  amministrativa per interpretare l’attore. File inclusi nella pipeline Nuovo pannello standard
  e servizio esportato; lettore non inizializza archivi e non comanda PLC (SQLite può creare
  sidecar di coordinamento). Viewer grafico ancora da fare.
- Review concorrenza: lettore con snapshot aperto non blocca il writer. Controllo versione
  SQLite effettiva contro WAL-reset, senza aggiornare/installare software globali; qui
  Node 24.19 / SQLite 3.53.3. Checkpoint e limiti DB/WAL, nessun fallback insicuro, niente UNC.
- Evidenza pubblica: 104 test mirati in 11 file più 11 integrazioni gateway TCP/MQTT su broker
  Aedes locale superati. Ultima guardia ID risorsa malformato: aggiunto un caso e rieseguiti
  gateway HTTP (11) e integrazioni (11); 116 casi distinti verificati, non l’intera suite.
  Verificati anche i 13 test audit sul Node di sistema 26.1 / SQLite 3.53.0 senza installazioni.
- TypeScript e build Vite superati sulla sorgente pubblica finale public-check-0itQiv; soli avvisi
  static/dynamic import già noti. Servizio realmente esportato con login, mutazione ricetta,
  logout, lettore CLI eseguibile e riservatezza; fault injection prima/dopo effetto, duplicati,
  errore sincrono driver, shutdown e reader/writer WAL. Fake driver per fault HTTP; broker locale
  reale per trasporto, nessun PLC reale o AI esterna. Nessuna compilazione/riapertura nativa
  dell’app in uso; 18 modifiche trend/profili preesistenti escluse dall’indice.
- Snapshot pubblico con dipendenze locali tramite junction, non installazione pulita. Restano
  Viewer HMI, firme, audit amministrativo/trasporto completo, archiviazione e restore, policy
  operative, validazione ACL/clock/guasti/carico sul target. Obiettivo complessivo ancora attivo.

### 156. Revisione dell’editor e impostazioni stabili (2026-10-21)

- Scelta utente: scuro neutro con poco blu, testi più discreti, colonna sinistra stretta e
  richiudibile, canvas ampio e proprietà a richiesta. Ultima scelta pagine: miniature reali,
  non solo icone; la cattura locale è il prossimo intervento, non è ancora inclusa qui.
- Palette e superfici condivise più uniformi; dimensione Normale da 125% a 110%, Grande 130%,
  Compatta 100%. Non cambia la grafica dei pannelli HMI o i dati dei progetti.
- Impostazioni con contenitore a dimensioni definite, contenuto scorrevole e footer fermo:
  schede lunghe, brevi o ricerca vuota non ridimensionano la finestra. Schede da tastiera,
  focus delimitato, bozza scorciatoie conservata e nessuna richiesta AI implicita.
- Colonna proprietà nascosta senza selezione e in Usa pannello; compare selezionando un
  elemento, si richiude e riapre dal titolo della pagina senza perdere selezione o bozza.
  Non riapre per il solo cambio degli offset AST; nuova selezione o richiesta esplicita sì.
- Divisori visibili, drag in pixel dell’editor, doppio clic/Home per ripristinare la larghezza.
  Riduzione proporzionale quando manca spazio senza sovrascrivere le larghezze memorizzate.
  Rimossa la regola responsive che ignorava le dimensioni scelte per i pannelli.
- Verifiche mirate: impostazioni, account/isolamento AI, pagine, preferenze, dimensionamento e
  apertura/chiusura delle proprietà. QA browser con progetto sintetico, nessun PLC o AI reale;
  finestra e footer invariati tra quattro schede su 375/768/1024/1440 px e finestra bassa.
  Trascinamento e ripristino divisori controllati anche con larghezze richieste eccessive.
- Le modifiche trend/profili già presenti restano escluse. Questa revisione UI non chiude
  le roadmap Unified/Optix/AI né costituisce un collaudo industriale o dell’eseguibile nativo.

### 157. Miniature reali locali delle pagine (2026-10-21)

- Ultima scelta design dell’utente: miniature vere con il nome, non soltanto simboli. La lista
  usa il PNG della vista già aperta; le pagine non visitate hanno un segnaposto. Nessuna
  navigazione automatica, iframe aggiuntivo, istanza HMI, connessione PLC o richiesta AI.
- Cattura limitata alla modalità Modifica e all’origine locale dell’editor, già fissata dal
  ponte. Handshake con documento e nonce; controllo finestra/origine/percorso/schermata di
  stato. Risultati tardivi ignorati dopo cambi di pagina, progetto, viewport o versione.
- Snapshot DOM rasterizzato in PNG al massimo 240x160: niente script, eventi, iframe, URL
  esterni o nuovi fetch di risorse. Password e campi token/chiave riconoscibili mascherati.
  Immagini/canvas già caricati sono copiati solo se leggibili; video, shadow DOM, pseudo-elementi,
  font esterni e sfondi protetti/esterni possono essere omessi. Non è una cattura pixel-perfect
  né una vista live: il titolo lo esplicita e un errore non interrompe l’editor.
- Limiti per nodi, testo, attributi, immagini e SVG temporaneo; cattura esclusiva e rate limit.
  Cache per progetto solo in RAM, massimo 64 immagini/4 milioni di caratteri base64, niente
  salvataggio o export dei PNG. Cattura rinviata all’idle e budget temporale per la clonazione.
  Accettati solo piccoli PNG statici verificati strutturalmente, non SVG/URL o animazioni.
- Verifiche mirate del protocollo, sanitizzazione, race di navigazione, cache e lista pagine.
  Snapshot pubblico: 46 casi in 6 file, inclusi layout e protocollo di selezione del ponte;
  non l’intera suite. Revisione principale UI al punto 156 verificata con 62 test in 7 file.
  QA Edge con plugin realmente serializzato e progetto sintetico: immagine 240x150 con
  contenuto reale, una sola iframe HMI, nessuna richiesta esterna, password mascherata.
  TypeScript e build Vite superati sullo snapshot pubblico finale public-check-5XOD4o,
  con i soli avvisi static/dynamic import già noti. Dipendenze locali tramite junction,
  non installazione pulita; nessun riavvio forzato o compilazione del backend nativo.
- Nessuna dipendenza aggiunta o modifica a licenze, driver o backend nativo. Da verificare sul
  dispositivo finale WebView2 e sui progetti reali; i materiali macchina restano locali.

### 158. Recupero del caricamento dell’editor e cache Vite separata (2026-10-21)

- Segnalazione: apertura progetti bloccata da `Failed to fetch dynamically imported module`
  su `src/editor/AppShell.tsx`. Alla verifica il server originale sulla porta 1420 non era
  attivo: il suo errore HTTP iniziale non e' stato recuperato. Il modulo corrente risponde
  200 ed entra nell’editor in un server di prova isolato, senza errori di compilazione.
- Trovati metadati in `node_modules/.vite` con riferimenti a dipendenze inesistenti,
  relativi alle copie QA con `node_modules` condiviso. Cache ora nella `.hmi-preview`
  di ogni checkout, con segmento `node_modules` per escludere i bundle dal pass Babel.
  Nessuna cache, bozza o cartella progetto eliminata. Nuova configurazione al prossimo
  `npm run dev`; la prima preparazione ricrea solo la cache separata.
- Componenti lazy creati per istanza dell’app; `Riprova caricamento` li ricrea senza
  chiudere il progetto o riavviare l’anteprima. In sviluppo usa URL sorgente nuovi:
  la prova Edge ha dimostrato che il solo reset React lascia l’import fallito nella cache
  del browser. Nessun ciclo automatico, valutazione di URL dal messaggio di errore o reload.
  In produzione restano gli import staticamente risolvibili del bundle; il bypass degli
  URL sorgente e' solo di sviluppo, non una promessa di recupero di ogni errore di chunk.
- `Torna ai progetti` non nasconde più l’errore se l’utente annulla l’uscita con una bozza
  modificata. Dettagli tecnici conservati; messaggio con controllo del terminale e comando
  di recupero, pulsante accessibile da tastiera con altezza minima 44 px.
- Test mirati: 49 casi in 4 file su import, lifecycle desktop, avvio e messaggi.
  QA Edge ripetibile con `node tests/browser/editor-module-recovery.mjs`, Playwright
  disponibile come pacchetto o tramite `FRAMECRAFT_PLAYWRIGHT_MODULE`: blocco iniziale,
  secondo fallimento e terzo tentativo riuscito; stessa bozza, undo e sessione, nessun
  reload o traffico esterno, verifiche a 375/768/1024/1440 px. Cache QA dedicata.
  Ripetuti test e QA sullo snapshot pubblico `public-check-oOcyfU`, senza export macchina:
  TypeScript e build Vite superati, soli avvisi static/dynamic import gia' noti;
  nessun URL sorgente di recupero nel bundle produzione. Dipendenze tramite junction
  locale, non installazione pulita. Progetto sintetico e nessuna chiamata AI/PLC.
  Resta da confermare sul WebView2 reale; nessun riavvio forzato del desktop.

### 159. Registro attività consultabile dal pannello HMI (2026-10-21)

- Priorità aggiornata dall’utente: lasciare temporaneamente l’AI e proseguire Unified/Optix.
  Il riepilogo AI locale ancora in lavorazione resta separato e non viene pubblicato in questo
  passaggio. Nessuna inferenza o modifica alla pipeline AI richiesta per usare il registro.
- Capacità comune confrontata con Audit Viewer Unified V21 ed Event Logger Optix: nuovo controllo
  **Registro attività** nella palette HMI e PLC e nel Runtime di ogni nuovo pannello standard,
  senza inventare una pagina dell’export macchina. La guida è in `runtime/README.md`.
- API GET protetta dal token del proxy e dalla capacità server esplicita `audit.read`; account
  precedenti non ricevono il permesso automaticamente. Non basta il nome del ruolo, né il PIN
  grafico. Letture senza rinnovo idle, scritture o eventi audit aggiuntivi; limite alle letture
  ravvicinate e alle risposte/query. Nessun token nel browser o nuovo comando PLC.
- Filtri server per operazione/esito/ID operatore/intervallo UTC, applicati prima del limite;
  cursore con ID archivio e sequenza iniziale. Archivi cambiati o sequenze ripristinate fermano
  la paginazione. Contatori globali distinti dalle righe filtrate, catena verificata non firma.
- Controllo manuale a pagine di 50 righe, leggibile e con target da almeno 48 px, stato di lettura,
  rimedi chiari, focus/scroll conservati, filtri in modifica distinti da quelli applicati. Attori
  come ID stabili, mai nomi storici ricostruiti. Dati rimossi a cambio utente/logout/scadenza;
  risposte tardive ignorate, nessun polling o deposito nei browser storage. In Modifica è un
  segnaposto e il ponte dell’editor non apre connessioni come rimedio.
- Prima verifica: test mirati di query/SQLite/API/permessi/sessioni e controllo/generazione,
  più prova Edge su pannello generato, account locali, cookie e database veri; nessuna CPU o
  connessione PLC. Login, lettura e filtro manuali, logout con rimozione dei dati e quattro
  viewport (375/768/1024/1440). Test browser ripetibile:
  `node tests/browser/audit-viewer.mjs` con Playwright o `FRAMECRAFT_PLAYWRIGHT_MODULE`.
- Verifica pubblicabile `public-check-DaFnXj`: 76 casi mirati in 10 file, TypeScript e build
  editor superati (avvisi static/dynamic import gia' noti). Ripetuta la prova Edge del pannello
  generato senza JSON macchina: tipi del Runtime e bundle production dell’entry QA superati,
  due letture esplicite, zero comandi e richieste esterne; credenziali sintetiche assenti dal
  bundle client. La prova non invoca lo scaffolding Tauri né certifica installazione pulita
  o build dell’intera applicazione HMI; dipendenze locali tramite junction.
- Restano firme/commenti, export e query salvate/offline, risoluzione dei nomi storici, eventi
  generici, audit amministrazione/trasporto, conservazione e prove native/industriali/carico.
  Nessuna nuova dipendenza o licenza vendor. Le roadmaps restano parziali, non parità dichiarata.

### 160. Scambio ricette dal pannello con importazione atomica (2026-10-21)

- Prosegue il blocco comune Unified/Optix, mantenendo ferma l’AI. Riferimento funzionale:
  import/export dei Parameter Set Unified V21 e RecipeImportExport Optix. Formato autonomo
  Framecraft JSON v1, non compatibilità TSV/CSV vendor o copia di codice NetLogic.
- Nel controllo Archivio ricette: export dello schema selezionato dalla copia letta, file
  UTF-8 massimo 2 MB, confronto locale prima/dopo e riepilogo nuove/sostituite/identiche/conservate.
  Dettagli richiudibili caricati a richiesta, controlli touch da 48 px e testo sicuro senza HTML.
- Una conferma invia il gruppo in una sola mutazione server: merge per ID, nessuna eliminazione,
  schema/campi e limiti verificati, nomi unici, revisione attesa, ID richiesta/ricevuta persistenti.
  Un errore o catalogo risultante oltre limite non pubblica modifiche parziali. La revisione
  esportata non diventa la revisione destinazione e non certifica la provenienza del file.
- Nuova capacità esplicita `recipes.import`, senza concessione agli account esistenti. Restano
  sessione server, CSRF e limite `recipeChanges` sullo schema. Audit richiesta/esito del batch,
  senza dati ricetta/credenziali. Nessun comando, connessione o falsa conferma PLC aggiunti.
- Cambio utente pulisce copia letta/confronto e corpo ripetibile (resta solo l’ID da verificare),
  invalida risposte tardive e revoca URL temporanei;
  esito incerto conserva il marker ID e il confronto, con recupero soltanto della stessa richiesta.
  Generatore standard include codec, tipi, form e servizi aggiornati; pannelli vecchi e helper
  nativo richiedono aggiornamento/riavvio esplicito. Nessuna nuova dipendenza o licenza aggiunta.
- Verifiche sulla copia pubblicabile senza JSON/foto privati: 146 test mirati su 13 file passati;
  dopo l’ultima protezione al cambio utente, 39 casi sui quattro file interessati passati
  (comprendono il nuovo caso e cinque casi sessione, non si sommano come test tutti distinti).
  TypeScript/build editor e controllo tipi/bundle dell’entry QA del Runtime generato passati.
  Browser Edge: download effettivo, file scelto, confronto e conferma da tastiera; account locali,
  archivio su disco e audit SQLite reali. Una lettura, una importazione, zero altri comandi e
  zero richieste esterne/connessioni PLC; logout pulisce la vista. Nessun overflow e controlli
  da almeno 48 px a 375/768/1024/1440 px, schermate mobile/desktop ispezionate. Nessun segreto
  di test nel bundle client. Dipendenze locali condivise, non installazione pulita; restano
  IPC/scaffolding Tauri, target/CPU, HTTPS/proxy di produzione e touch fisico da collaudare.
- Restano CSV/TSV con mapping, firma/provenienza, migrazioni UDT, backup/restore operativo,
  storico valori completo e trasferimenti ricetta HMI–PLC. Le modifiche AI/trend già presenti
  nella worktree restano separate da questa tranche.

### 161. Archivio allarmi persistente e consultazione dal pannello (2026-10-21)

- Richiesta Unified/Optix proseguita senza AI. In Pannello → Allarmi si abilita esplicitamente
  la registrazione su disco, con limite eventi; nessuna connessione o scrittura PLC avviata dal
  salvataggio. Nuovo controllo “Storico allarmi su disco” in Aggiungi → HMI e PLC e nel Runtime
  generato; vecchio storico di sessione separato. Nessun dato macchina precompilato.
- SQLite locale, batch atomico per valutazione, writer esclusivo, namespace/identità e percorsi
  controllati, limiti senza eliminazione automatica. Avvii/occorrenze e testo/classe dell’epoca
  restano distinti. Dopo stop o riavvio niente restore degli allarmi attivi: occorrono campioni
  validi. Lettura possibile anche con registrazione disabilitata, senza creare archivi mancanti.
- Nuova capacità globale `alarms.history.read`, non assegnata agli account esistenti. Separata
  dalle ACL di presa visione/conferma; identità server obbligatoria, token/ruolo/PIN non bastano.
  Filtri esatti e date sul server, pagine ancorate ad archivio/sequenza, niente SQL libero,
  polling, rinnovo idle, cache eventi nel browser, replay o comandi dalla vista storica.
- Spazio/limite, corruzione, identità diversa e writer concorrente non azzerano dati. In caso di
  guasto l’acquisizione continua ma diagnostica PLC e vista avvertono di registrazione non
  disponibile. Il contatore indica esiti su disco non confermati, non perdite certe. Avvii
  interrotti o con errori restano segnalati; lacune durante stop/qualità persa non ricostruite.
- Riferimenti primari: Basics of alarm logging Unified V21 e Configure an alarm event logger
  Optix `current` 1.8.0. Nessuna copia di codice vendor e nessuna nuova dipendenza npm.
- Verifiche concluse il 22 ottobre sulla copia pubblicabile senza JSON/foto privati: 115 casi
  mirati su 11 file, con sola ripetizione del test di generazione inizialmente oltre il budget
  standard di 5 secondi (20 secondi per quel caso con filesystem e processo). TypeScript e build
  editor passati; tipi e bundle dell’entry QA del Runtime generato verificati. Browser Edge:
  launcher realmente emesso, account/SQLite e broker MQTT locale reali, consultazione da un avvio
  precedente con testo del vecchio catalogo, nuovo evento acquisito, filtri e logout; tre letture
  esplicite, zero comandi/scritture PLC o richieste esterne. Layout 375/768/1024/1440 px senza
  overflow e controlli da 48 px, schermate mobile/desktop ispezionate, nessun segreto di test
  nei bundle client. La vista indica lo stato del servizio all’ultima lettura, senza polling.
  Dipendenze locali condivise, non installazione pulita. Restano throughput/I/O sincrono,
  CPU/TLS, touch fisico e Runtime nativo/IPC da validare; nessuna parità completa, firma o
  conformità industriale dichiarata. L’AI e le modifiche trend preesistenti restano separate.
- Nuovi pannelli includono i moduli; pannelli esistenti richiedono aggiornamento esplicito del
  Runtime/servizio e riavvio dell’helper account. Manutenzione/backup/restore verificati,
  retention/export, multilingua storica e import Alarm & Conditions UA restano da completare.
  Modifiche AI e trend già presenti nella worktree lasciate separate.

## Da fare, dopo

- **Azioni/utenti — produzione**: estendere ACL di lettura/per-record, gruppi e audit completo/firme/archiviazione server.
  I permessi/PIN nel browser non sostituiscono un confine sicuro né interblocchi PLC.
- **Mobile**: collaudo su dispositivi touch fisici e sui nuovi progetti reali; nessuna migrazione
  dei vecchi pannelli richiesta dall'utente. Le verifiche browser non sostituiscono il collaudo macchina.

- **Sicurezza tooling**: migrazione e controlli del punto 103 completati per le segnalazioni
  npm del punto 93. Ripetere audit/SBOM sull'artefatto realmente distribuito; restano Rust/OS
  e i gate industriali. Conservare test mirati nel lavoro ordinario, senza suite generali a ogni edit.

- **Affidabilità editor durante gli aggiornamenti**: HMR/reload coperti al punto 77 e deposito
  locale persistente al punto 78. Collaudare incidente e recovery nella finestra desktop reale
  e nel pacchetto production; verificare flush alla chiusura, gestione/retention di più copie,
  autorizzazione guidata dei file esterni e CAS dei salvataggi. Nessun avvio dell'anteprima,
  apertura/autorizzazione di cartelle o replay PLC automatico come rimedio alla perdita di stato.

- **Roadmap WinCC, fase 3 da completare**: eventi specifici dei controlli, object model restante,
  JavaScript oltre il sottoinsieme IR, analisi di flusso intermodulo completa, closure/scoping
  completi, moduli di libreria/versionati, ownership server degli eventi allarmi, conferme PLC e altri metodi/driver
  (`WCU-DYN-06`, `WCU-EVT-01/04/05/06/07/10`).
- **Roadmap WinCC, fase 4 da completare**: altre proprietà colore specifiche oltre la prima API
  `PropertyFlashing` del punto 79, audit accessibilità generale e dimensioni minime dei target
  touch (`WCU-DYN-07`, `FC-MORE-12`).
- **Roadmap WinCC, fase 5 da completare**: parità completa del mini-editor faceplate con l'editor
  pagine, eventi annidati, opzioni container, contesto esatto di `Faceplate.Close`, screen window
  generiche, UDT e migrazione massiva/nidata delle versioni; confronto e migrazione della singola
  istanza al punto 104 (`WCU-FP-*`, `WCU-ENG-12`, `WCU-TAG-05`).
- **Roadmap WinCC, fase 6 da completare**: stampa, profili, codici fuso vendor/object model
  dei trend e collaudo reale; fusi IANA e aggregazione per pixel aggiunti al punto 114
  (`WCU-CTL-05/06`, `WCU-DAT-04/05`).
- **Roadmap WinCC, fase 7 da completare**: collegare i Data Log a driver e storage industriali,
  supporti esterni, rotazione, backup e diagnostica spazio (`WCU-TAG-08`, `WCU-DAT-01/02/03`).
- **Interfaccia**: estendere le categorie superiori quando entrano nuove funzioni WinCC, Optix e AI,
  senza reintrodurre toolbar permanenti nel canvas o nel bordo inferiore.
- **Connettività trasversale**: trasporto asincrono MQTT nella IR integrato al punto 91;
  completare conferme PLC/payload avanzati, command layer restante e OPC UA avanzato; RBAC/audit/storage
  server e collaudo TLS/CPU fisiche o virtuali. Mai segreti nel browser o replay di comandi incerti.
- **Produzione**: chiudere licenze/notice e diritti asset, audit distribuzione/Rust/OS,
  definire e verificare la CSP del contenitore desktop (attualmente `app.security.csp: null`),
  packaging su runtime LTS e guasti/recovery nella finestra desktop e su progetti reali;
  collaudare il plugin senza checkout e distribuire/risolvere le sue dipendenze bare, oltre
  alla mappa delle risorse corretta al punto 81;
  completare identita' HTTP dell'anteprima e rilevamento del server vivo ma bloccato.
- **Dopo WinCC**: capacità funzionali di `FACTORYTALK-OPTIX-ROADMAP.md` a partire dall'information
  model Framecraft, non dal round-trip verso un formato proprietario.
- **Priorità attuale Unified/Optix** (richiesta del 21 ottobre): proseguire le capacità funzionali
  residue, mantenendo separati i contratti vendor e il Runtime autonomo OPC UA/MQTT. La pipeline
  AI facoltativa del punto 116 e di `AI-FRAMECRAFT-ROADMAP.md` resta nell’obiettivo, temporaneamente
  rinviata; restano command layer, diff semantico e verifiche operative senza dati inventati.
- **Editor — inserimento componenti con dati locali**: props letterali e dati importati viaggiano
  già col componente; per props nate da stato/calcoli locali l'editor oggi rifiuta l'inserimento e
  spiega quali mancano. Serve una configurazione guidata se si vuole crearne valori iniziali sicuri.
- **Fuori portata da qui**: esportare le 225 grafiche da TIA, raccogliere utenti e permessi UMC/UMAC,
  e le 1068 soglie dei `Range` (`fill.cmd`, con TIA aperto).
