# Riferimento visivo dello standard HMI

Questo file e' la memoria operativa delle immagini in `FotoStandardManu`. Le foto sono la fonte
visiva primaria dei template React; i JSON in `standard/` restano la fonte per nomi, coordinate,
tipi HMI, numerazione e dynamization. Un template e' approvato solo quando le due fonti concordano.

## Inventario

Tutte le immagini misurano **1282x795 px**. Sono 279:

- Desktop: 109 immagini (Main 11, Settings 73, Alarms 4, Statistics 4, Manuals 8,
  Diagnostic 8, Formats 1).
- Mobile: 109 immagini (Main 11, Settings 73, Alarms 5, Statistics 4, Manuals 7,
  Diagnostic 8, Formats 1).
- Various: 61 immagini fra popup e faceplate.

Desktop e Mobile non sono due versioni responsive della pagina: il contenuto mantiene la stessa
tela standard, mentre cambia il guscio che lo ospita. Le coppie omonime vanno quindi confrontate,
ma non duplicate come due template diversi quando il contenuto e' identico.

## Regole visive confermate dalle foto

### Guscio desktop

- Barra superiore nera/antracite alta 151 px: ora e data, utente, primo guasto, linee e formato,
  stato OMAC, collegamento PLC, velocita' e marchio.
- Barra laterale da 80 px sotto la top bar, con sette riquadri colorati e relativa etichetta.
- La pagina di contenuto 1280x694 viene mostrata nel riquadro 1200x649 a sinistra 80, alto 151.
- A destra della pagina possono comparire tab verticali numerati o comandi di pagina.

### Guscio mobile

- Top bar compatta nera, navigatore orizzontale della sezione sotto la barra e contenuto 1280x694.
- Utente, PLC e marchio restano visibili; le informazioni macchina estese del desktop spariscono.
- Le tab della sezione hanno testo bianco e sottolineatura nel colore della sezione attiva.

### Pagina di contenuto

- Il contenuto e' **chiaro**, non scuro: sfondo `#d0d0d0`, pannelli `#ffffff`, separatori
  `#c7c7c7`, testo quasi nero.
- La cornice principale e' arrotondata. L'intestazione e' una riga bianca alta circa 37 px.
- Input e select sono bianchi con bordo grigio sottile; valori non modificabili hanno un grigio
  leggermente piu scuro.
- I comandi principali sono antracite con testo bianco. Attenzione/richiesta operatore usa arancio;
  gli switch usano magenta OFF e verde chiaro ON.
- Le immagini macchina sono dati del singolo progetto: il template deve lasciare un'immagine
  sostituibile, conservando posizione e spazio visti nella foto.

## Famiglie visive osservate

### 1000 Main

- `1001_Upstair`: grande immagine macchina, senza pannelli dati sovrapposti.
- `1081_Special`: lista impostazioni a sinistra e grande immagine macchina a destra.
- `1201_Omac`: diagramma di stato ISA-88/OMAC con nodi e transizioni.
- `1281_Chat_Bot`: contenuto integrato con illustrazione del bot.
- `0001_Menu_1xxxx_Main_Template`: il sottomenu della sezione, sette voci col pittogramma, pannello
  bianco 210x290 a 131,160 e triangolino che punta all'icona; mentre e' aperto lo schermo va in
  penombra e le tessere laterali restano tutte accese.
- `1002_Downstair`, `1041_Counters`, `1121_Collector_Counters`, `1161_` e
  `1241_Maintenace` sono davvero vuote sia nelle foto sia nei JSON: conservano soltanto la cornice
  grigia, la `HmiTouchArea` e gli swipe dichiarati dall'export. Non vanno riempite con KPI inventati.
- **Fatte**: 1001 (`machine-render`), 1002 (`machine-downstair`), 1041 (`main-counters`), 1042
  (`command-grid`, dieci linguette), 1081 (`special-function`), 1121 (`main-collector-counters`),
  1161 (`main-free`), 1201 (`production-overview`), 1241 (`main-maintenance`), 1281
  (`web-content`) e il sottomenu Main nel pannello generato.
- La 1081 conserva le sette righe 403x75 e lo screen `PBP1 - Main` alle coordinate del JSON, ma
  non copia `AAAAAAA`, `M3031` o i due poligoni verdi della macchina campione. Le righe sono slot
  configurabili e lo screen spiega di aggiungere solo le zone interattive realmente necessarie.

### 2000 Settings

`Program Modification` non e' una famiglia unica. Le foto mostrano almeno:

1. dimensioni scatola e impostazioni generali (`2001`, `2021`);
2. composizione grafica del layer e stepper (`2002`);
3. prodotto/pallet con schemi a destra (`2003`, `2024`);
4. linea e posizioni annotate (`2004`, `2025`);
5. griglia di soli parametri (`2005`, `2026`);
6. parametri con diagramma centrale (`2006`);
7. quote attorno alla macchina (`2007`, `2010`, `2027`, `2030`);
8. matrici pusher con toggle (`2008`, `2009`, `2028`, `2029`);
9. illustrazione pallet/layer con pannello laterale (`2011`, `2021`);
10. immagine macchina con pannelli sovrapposti (`2012`, `2013`, `2022`, `2032`, `2033`);
11. editor pallet/layer (`2031`).

Gli encoder hanno una coppia ricorrente: pagina impostazioni con campi + immagine 3D, seguita da
pagina illustrativa con la stessa parte e quote. `2041` e' invece un indice scuro di tutti gli
encoder. Seguono famiglie autonome per Motor Speed, Robot Function, Lubrification, MMC Guide,
MMC Motor Box, MMC Motor e System Function.

- `0012_Menu_2xxxx_Settings_Template`: il sottomenu della sezione, sette voci — Program Settings,
  Encoders, Motor Speed, Robot Function, Lubrication, Infeed Guide, System Function — col pannello
  bianco 210x290 e il triangolino sull'icona Settings, piu' in basso di quello della Main perche' lo
  segue.
- **Fatte — sessione Robot**: 2001 (`program-modification`), 2002 (`program-layer`), 2003 (`program-pallet`), 2004
  (`program-callouts`), 2005 (`program-infeed`), 2006 (`program-robot`), 2007 e 2010
  (`program-quotes`), 2008 e 2009 (`program-squaring`), 2041 (`encoder-index`, con le piastrelle che
  aprono la taratura), 2042-2077 (`encoder-settings`, le due pagine di ognuno dei diciotto encoder),
  2081 (`motor-speed`), 2121 (`robot-function`), 2161 (`lubrification`), 2201 (`device-control`),
  2202 (`motor-box-control`), 2203 (`motor-control`), 2241 (`system-function`) e il sottomenu
  Settings nel pannello generato. Le quattro pagine 2201-2241 mantengono coordinate, tag, eventi e
  swipe dei JSON; gli screen della guida, del motor box e del motore restano sostituibili.
  Anche 2121 e 2161 sono ora allineate ai JSON: Robot Function conserva i quattro pulsanti senza
  inventare tag assenti dall'export; Lubrification collega sette campi e il comando momentaneo
  `DB_Lubrication_TEST_Cmd`, lasciando configurabili gli screen di robot e pompa.
  La 2081 conserva pannelli, `Motor_Speed` e swipe del JSON, ma non copia le sei linee, i motori
  Mxxxx o il faceplate della macchina campione: lo screen configurabile indica di aggiungere una
  targhetta e una linea di richiamo per ogni motore realmente presente.
- **Fatte — sessioni alternative dai JSON reali**: Nemo 2011-2013, Classic/Palletizer 2021-2030,
  Sweep Off 2021-2022 e Pouches 2031-2033 hanno diciotto template dedicati. Il wizard ne fa
  scegliere una sola: i nomi file si sovrappongono e gli eventi `Loaded` di Nemo, Sweep e Pouches
  riscrivono 2001-2003, quindi mischiarle nello stesso router produrrebbe numeri duplicati.
- **Le linguette numerate a destra sono le pagine sorelle**: nell'export ogni linguetta e' un
  `Button` a Left 1208 col suo `ChangeScreen`. Program Settings e' un gruppo di dieci (2001-2010),
  Encoders l'indice piu' diciotto coppie: nel pannello generato ci sono tutte e si aprono davvero.
  Le CLV (2281-2293) ne hanno tredici a testa, ma nel menu non compaiono: al blocco si arriva dal
  logo `CLV_White` della barra in alto, che e' un pulsante verso la 2281.
- **Le tredici CLV sono ricostruite senza foto**: di questo blocco non esiste nessuna immagine, e
  quindi nessuna delle sue tredici pagine e' verificata su una fotografia. La geometria e i tag
  vengono dai JSON e il loro `visualStatus` dice `missing`, cosi' chi le sceglie sa che cosa sta
  prendendo. I tag invece sono controllati uno per uno: un test rilegge il JSON di ogni schermata e
  pretende di trovarci ogni `data-plc-variable` che il template scrive.
- **Le pagine sono chiare, il guscio e' scuro**: sono due tavolozze diverse (`pagePalette` e
  `palette`), e confonderle si vede subito — una riga di impostazione scura in mezzo a sei righe
  bianche. Vale anche per i pezzi presi da soli dalla palette: nelle pagine il bianco lo mette la
  scheda, quindi un pezzo trascinato da solo se lo deve portare dietro.
- **La cornice 1214x681 non e' bianca, e' grigia**: e' la pagina stessa, arrotondata. Il bianco che
  si vede sono le lastre appoggiate sopra — la barra del titolo, le righe, la tabella. La foto della
  1041, che e' vuota, mostra solo la cornice: e' tutta `#CFCFCF`. Disegnarla bianca fa sparire i
  3 px che separano una scheda dall'altra, perche' quei 3 px sono pagina che si vede.
- **Le linguette a destra si vedono a meta' apposta**: stanno a Left 1208 e sono larghe 63, ma nel
  JSON vengono prima del rettangolo della cornice, che ci passa sopra. Sullo schermo resta il
  moncone da 1223 a 1271. Non e' un ritaglio da imitare a mano: basta mettere la cornice opaca sopra.
- **Il reticolo del controllo allarmi e' solo verticale** (`GridLineVisibility: "Vertical"`): fra una
  riga e l'altra non c'e' nessuna linea, c'e' il grigio alternato `#F2F2F5`. Chi disegna anche le
  orizzontali ottiene una griglia che nello standard non esiste.
- **Il pannello del sottomenu non e' bianco**: e' **#C8C8C8**, col filo fra le voci **#C0C0C0** e la
  scritta **#323232**. Le tre foto dei sottomenu (0001, 0085, 0102) danno gli stessi tre valori, e
  nel JSON i colori non ci sono perche' vengono dalla classe di stile: le foto sono l'unica prova.
- **Il sottomenu ha un velo, e non copre tutto**: con il pannello aperto il bianco della pagina sotto
  scende a ~100, cioe' un nero al 61 %; la barra in alto e le tessere laterali restano accese, perche'
  nell'export sono disegnate dopo il pulsante trasparente 1280x800 che fa da velo.
- **L'icona di una voce del sottomenu sta fuori dal pulsante**: il `Graphic view` e' a 146 sulla
  pagina, il pulsante comincia a 189. Chi la mette dentro al pulsante sposta a destra tutte le
  scritte.
- **La barretta del navigatore mobile sta *sulla* tab, non sotto**: e' a Top 38 di una tab alta 43,
  cioe' sugli ultimi 5 px, ed e' larga 158 contro i 157 della tab, quindi sborda di un pixel per
  lato. Disegnata sotto il bordo si vede una riga staccata che nello standard non c'e'.
- **Dove vanno le tab del navigatore lo dice Settings**: nella schermata del navigatore sono tutte a
  Left 1, una sopra l'altra (i gruppi appiattiti). Settings e' l'unica con otto voci, e le sue tab
  sono sette da 158 piu' una da 103: `71 + 7*158 + 103` fa 1280, e cosi' si sa che partono a 71 e
  valgono 158.
- **Il pannello del sottomenu si apre da tutte e due le parti**: nel menu delle sezioni del mobile i
  quadrati della prima colonna (x=451) hanno il pannello a **sinistra** col triangolino a destra, gli
  altri due il contrario. E' lo stesso pannello del desktop, spostato di 40 px di fianco al quadrato.
- **Le misure delle righe Settings sono assolute sulla pagina**: la riga comincia a x=20, e il campo
  a 348 e' 348 *dal bordo della pagina*, non dal bordo della riga. Quando un controllo esce dal suo
  riquadro di una ventina di pixel, e' quasi sempre questo.
- **Nell'export i gruppi sono appiattiti**: i pezzi che stavano dentro un gruppo hanno tenuto le
  coordinate locali, e allora si vedono cose impossibili — nel navigatore mobile tutte e nove le tab
  sono a Left 1, una sopra l'altra, e nella barra in alto l'orologio sta dentro il pulsante della
  sessione. Quando una coordinata sembra assurda e' quasi sempre questo: si rimette a posto col
  passo (nel navigatore 71 + 7x158 + 103 fa esattamente 1280) invece di prenderla alla lettera.
- **I popup hanno la misura scritta nel JSON**: 9001 e' 343x500, 9002 670x250, 9003 1062x637, 9004
  426x300 e la 9010 e' 1280x800, cioe' tutto il pannello — non e' un velo sopra una pagina, e' una
  schermata intera. Nella palette erano cinque finestre uguali 760x520 inventate; adesso ognuna ha
  la sua, e un test la rilegge dall'export. Attenzione ai pulsanti tondi della 9001: la parola non
  e' dentro al cerchio, sta nel `Text box` sopra, e il cerchio nel JSON e' solo un disegno.
- La 2002 e' **interattiva nei tag, non negli script**: i quattro pulsanti a passo scrivono
  `ProgModR.PV.GroupN`, `DATA_PackInGroup`, `DATA_DistanceBeetweenPack` e
  `DATA_GroupInfo.PositionY` (passo 1, 1, 10, 10), i toggle invertono i bit di `DATA_GroupInfo.*`, e
  i trenta pacchi dell'area grafica sono trenta faceplate `Pack_1..30`, ognuno con la sua
  dynamization su Left/Top/Width/Height da `PatternDisplay_Pack[i]`.

### 3000-7000

- Allarmi: tabella bianca a righe alternate, header compatto, troubleshooting e refresh a destra.
- Statistiche: `4001` tiene immagine macchina, operatore e due contenuti web Node-RED; `4041` e
  `4081` sono occupate interamente dai rispettivi contenuti web e per questo nelle foto appaiono
  vuote.
- Manuali: immagine macchina o stazione quasi a tutta pagina con pulsanti scuri posizionati vicino
  agli organi. `5001` usa zone verdi trasparenti e punti informativi.
- Diagnostica: `6001` ha la grafica Synoptic e cinque trasportatori Tracking; `6081` ha tre zone
  allarme condizionate da `Alarms_EM[1|3|9].NumEvents`; `6121` ha sette dispositivi dinamici attorno
  alla grafica Motor_Speed. `6041`, `6161`, `6201` e `6241` sono davvero vuote. La linguetta della
  6241 e' arancione nella foto 0109 e i suoi swipe puntano a 5001/5081: entrambe le anomalie sono
  conservate, non corrette per supposizione.
- Formats: nelle foto compare solo il menu. Le tre pagine sono ricostruite dai JSON dell'export
  (`7001` in due varianti, `7041` in due varianti, `7081`), che per coordinate, tipi e conteggi
  valgono quanto una foto; i testi restano segnaposto, perche' nell'export sono multilingua.

I cinque menu, uno per sezione, letti dalle foto `0085`, `0090`, `0094`, `0102` e `0110`:

| Foto | Voci |
| --- | --- |
| `0085_Menu_3xxxx_Alarms_Template` | Alarms, Alarms By Zone, History, Media Mngmnt, Free x3 |
| `0090_Menu_4xxxx_Statistics_Template` | Statistics, Production, Availability, Free x4 |
| `0094_Menu_5xxxx_Manuals_Template` | General, Infeed, Preforming, Layer Pusher, Lifter, Tie Sheet, Pallet Conveyor, Free (**otto** voci) |
| `0102_Menu_6xxxx_Diagnostic_Template` | Synoptic, Robot, Diagnostic Zone, Diagnostic Device, Prev. Maintenance, Profinet, Free |
| `0110_Menu_7xxxx_Formats_Template` | Format Selection, Formats Copy, Pallet Store Select, Free x4 |

Le voci "Free" sono posti che lo standard tiene liberi: dove la schermata esiste (1161, 6241) la
voce ci porta, dove non esiste resta nel menu spenta e non diventa una pagina finta.

- **Fatte**: 3001/3041/3081/3121 (`alarms`, `alarm-zone`, `alarm-history`, `media`): filtri
  `Alarm_CTH`/`Alarm_History`, colonne e azioni arrivano dai JSON; la 3121 resta la lastra del vero
  `HmiWebControl` Node-RED, senza inventare documenti locali. Seguono 4001 (`statistics`), con i
  due URL, la macchina e il tag `Alarms_Trigger[65]` dell'export, 4041
  (`statistics-production`) e 4081 (`statistics-availability`) con il loro `HmiWebControl` a piena
  pagina e gli URL originali, senza grafici o numeri finti; poi 5001 (`machine-map`) e le
  sei stazioni separate (`manual-infeed`, `manual-preforming`, `manual-layer-pusher`,
  `manual-lifter`, `manual-tie-sheet`, `manual-pallet-conveyor`), con lo slot per lo screen reale,
  ellisse e swipe presi dai rispettivi JSON; richiami, motori e valvole si aggiungono dalla palette
  perche' dipendono dalla macchina; 6001 (`synoptic`),
  6081 (`diagnostic-zone`), 6121
  (`device-diagnostic`) con 6041/6161/6201/6241 vuote come nell'export, 7001/7041/7081
  (`format-manager`, `format-copy`, `pallet-selection`), e i cinque sottomenu nel pannello generato.

### Popup e faceplate

Le foto confermano chiaramente i popup `9001`, `9002` e `9004`. Molti screenshot faceplate mostrano
solo il placeholder/area di apertura e non bastano a ricostruire il contenuto. I faceplate visibili
e utilizzabili come riferimento sono almeno Setting Motor e Tracking; gli altri richiedono export
visivo migliore o dati TIA degli oggetti interni.

### Giro del sistema visivo misurato

Le primitive stanno in `src/core/hmiPrimitives.ts` e sono misurate, non stimate: la pagina sta dentro
`SW_Screen` a (80,151) rimpicciolita di 0.9375, quindi `pagina = (foto - (81,145)) / 0.9375`. Da li'
vengono cornice (9,8) 1214x681, contenuto (16,19) 1192x658, intestazione scheda 34 + 3 di grigio,
riga di impostazione 108 con etichetta a +14 e controllo a +37, riga compatta 59 con etichetta a
sinistra e campo a destra, campo 186x32, select 186x42 col bottone grigio sfumato 40, switch 82x40,
radio 20, comando 44, tabella 30 di testata e righe da 27, linguette a (1225,21) passo 40.

Due cose prima date per scontate sono ora misurate:

- lo **switch acceso** e' `#AAE682`, letto sul `CONFIGURED` della pagina 2201: e' l'unico acceso in
  tutte e 279 le foto. Lo spento resta il magenta `#E00046`;
- la **pagina indice** 2041 non e' nera piena: e' un fondo `#303030` che sfuma a `#050505` sui bordi,
  con le piastrelle `#373737`.

Due modi di riga convivono e vanno usati per quello che sono: la 2001 mette l'etichetta **sopra** il
controllo con l'illustrazione a destra, la 2042 mette l'etichetta **a sinistra** e il campo a destra.
Confonderli era una delle cose che facevano sembrare i template "quasi giusti ma sbagliati".

Le linguette non sono decorazione: quante ne ha una pagina dipende dalla famiglia (10 in Program
Modification, 3 nelle pagine dispositivo, 2 negli encoder, nessuna negli allarmi, dove al loro posto
c'e' il bottone rosso di aggiornamento) e il colore e' quello della sezione.

Per guardare: `node scripts/hmi-page-preview.mjs` rende ogni famiglia dentro il guscio reale e la
serve su `http://localhost:4173`, cosi' il confronto con la foto e' a occhio e non a memoria.

## Stato di riallineamento

- [x] Inventario completo delle 279 foto.
- [x] Confronto Desktop/Mobile e individuazione delle regole condivise.
- [x] Individuato l'errore di tavolozza scura nei template di contenuto.
- [x] Correggere primitive, colori, bordi, campi, switch e pulsanti condivisi.
- [x] Correggere il guscio generato desktop e mobile sulla top bar reale (`src/core/standardProject.ts`: due file di schede `#333333` nella barra alta 151, tessere laterali sfumate a passo 94, finestra pagina 1200x649 con scala 0.9375, navigatore mobile alto 58 sotto una barra da 47; confronto con `scripts/hmi-panel-preview.mjs`).
- [x] Sostituire le famiglie generiche con le famiglie visive elencate sopra (28 famiglie).
- [x] Aggiungere a ogni template lo stato visivo e la foto sorgente quando disponibile.
- [x] Correggere le 21 basi esistenti affinche' generino JSX valido con la tavolozza chiara.
- [x] Separare le varianti di Program Modification, encoder e funzioni autonome in template dedicati.
- [x] Renderizzare i template e fare confronto visivo con le foto (`scripts/hmi-page-preview.mjs`).
- [x] Marcare esplicitamente le schermate senza sufficiente riferimento, senza inventare contenuto.

### Verifica del giro corrente

- Il generatore aggiunge `public/placeholder.svg`: le zone immagine non restano rotte e l'utente sa
  che deve sostituirle dall'Inspector con la grafica specifica della macchina.
- Le pagine Allarmi generano valori JSX sicuri e una tabella realmente parsabile.
- `format-manager`, `format-copy` e `pallet-selection` restano marcati `missing`: sono basi operative,
  non ricostruzioni visivamente approvate, perche' le foto non mostrano la pagina aperta.
- Le 28 schermate Program Modification sono ora separate nelle cinque sessioni reali. Un test
  incrocia ogni tag PLC emesso dai diciotto template nuovi con il JSON della schermata sorgente;
  la copertura 160/160 resta distinta dalla verifica su una macchina TIA reale.
