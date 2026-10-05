# Standard HMI aziendale — come funziona e cosa serve per andare avanti

Documento di passaggio di consegne. Serve a chiunque (Claude, Codex, una persona) riprenda il lavoro
senza aver letto la conversazione in cui è stato prodotto.

**In una riga:** lo standard è un progetto WinCC Unified (TIA Portal V20) chiamato
`New_Layout_V19_V20`, pannello `XPB1`, 160 schermate 1280x800, con un guscio a tre finestre
(TopBar / barra laterale / area contenuti) e una navigazione a due livelli guidata da una regola di
numerazione rigida. I template React in `../templateHmi` e l'editor Framecraft devono parlare quella
lingua. La cartella `standard/` di questo repo è l'estrazione grezza del progetto vero.

---

## 1. Cos'è la cartella `standard/`

È l'output dello script `C:\Users\m.negrini\Desktop\hmiPanels\StandardHmi\export_unified_standard.py`,
che si attacca a TIA Portal via Openness (pythonnet + `Siemens.Engineering`) e cammina l'albero degli
oggetti per riflessione, scrivendo JSON. È **sola lettura**: non tocca il progetto TIA.

```
standard/
  index.json            elenco delle 160 schermate: nome, gruppo, dimensione, numero di oggetti
  screens/<gruppo>/<nome>.json   una schermata per file, con tutti i suoi ScreenItems
  screen-groups.json    l'albero delle cartelle di schermate (12 MB, ripete le schermate)
  tags.json             27 tabelle variabili, 280 tag, 10 tag di sistema (43 MB per la ricorsione)
  alarms.json           21 classi di allarme, 1024 allarmi discreti
  connections.json      la connessione PLC (S7 1200/1500, HMI 10.14.1.230 -> PLC 10.14.1.220)
  text-lists.json       26 liste testi utente + le liste di sistema (solo i nomi, vedi §8)
  runtime-settings.json risoluzione, schermata iniziale, lingue, font
  scripts.json          i moduli script globali (solo i nomi, vedi §8)
  XPB1/                 export vecchio e parziale (solo le 5 schermate senza gruppo), ma e' l'unico
                        posto con testi e colori veri: vedi §8
```

Per rigenerarla: aprire TIA sul progetto standard, poi `run.cmd --tia 20` dentro `StandardHmi`.

---

## 2. Architettura runtime

Risoluzione `SR_1280X800`. Schermata iniziale `0000_Layout_Choice`.

```
0000_Layout_Choice  (avvio: autologin, watchdog di sessione, poi mostra 0001_Choice)
   └── 0001_Choice  "PC" oppure "Mobile"
          ├── PC     -> 0000_Layout_PC
          └── Mobile -> 0000_Layout_Mobile
```

### Layout PC (`screens/0000_Layout_PC.json`)

Quattro finestre di schermata, sempre le stesse:

| finestra       | posizione | dimensione | contenuto                             |
|----------------|-----------|------------|---------------------------------------|
| `SW_TopBar`    | 0,0       | 1280x151   | schermata `TopBar`                    |
| `SW_Main_Menu` | 0,151     | 80x649     | schermata `Lateral Bar`               |
| `SW_Screen`    | 80,151    | 1200x649   | **la pagina di contenuto**            |
| `Sottomenu`    | 0,0       | 1280x800   | il pannello a scomparsa (sopra tutto) |

`Sottomenu` ha due dynamization: `Left <= tag SW_PopUp_SlideIN` (l'animazione di entrata: si scrive
un Int che è l'offset X) e `Visible <= tag SW_PopUp_Visibility` (Bool).

Attenzione all'incoerenza che c'è nello standard: `SW_Screen` è 1200x649 ma **tutte le pagine di
contenuto sono disegnate 1280x694**, quindi vengono adattate dalla finestra. Se i template React
devono essere fedeli: tela di progetto 1280x694, area realmente visibile 1200x649.

### Layout Mobile (`screens/0000_Layout_Mobile.json`)

| finestra           | posizione | dimensione | contenuto                                    |
|--------------------|-----------|------------|----------------------------------------------|
| `SW_TopBar`        | 0,0       | 1280x70    | `TopBar_Light`                               |
| `SW_TopBar_Big`    | 0,0       | 1280x350   | `TopBar_Big` (nascosta al load, a scomparsa) |
| `SW_Navigator`     | 0,47      | 1280x64    | `Nxxxx_..._Template_Navigator` (le tab)      |
| `SW_Screen`        | 0,105     | 1280x694   | la pagina di contenuto (**la stessa del PC**)|
| `SW_LowBar`        | 0,750     | 1280x50    | `LowBar` (nascosta)                          |
| `Sottomenu_Mobile` | 0,0       | 1280x800   | pannello a scomparsa                         |

Il layout mobile imposta il bit `Mobile_Layout_Active`. **Le pagine di contenuto sono condivise fra
PC e mobile**: la differenza la fa la pagina stessa, che ha una `HmiTouchArea` a tutto schermo con
`Visible <= Mobile_Layout_Active` e uno script `onGestureDetected` per lo swipe fra pagine sorelle.
Questo è il punto più importante da replicare: **una pagina sola, due navigazioni**.

### TopBar (`screens/Modelli_Desktop/TopBar.json`, 1280x151)

- **fascia alta** (y 0..45): ora `{T,@HH:mm}`, giorno `{D,@EEEE}`, data `{D,@dd.MM.yyyy}` (tre
  IOField in sola lettura con `ProcessValue` da script); pulsante `Layout` che torna a `0001_Choice`;
  la riga dell'ultimo allarme (`Alarms_History_Message`, indice e zona da `EM_List`).
- **fascia bassa** (y 49..145): blocco utente 151x96 a sinistra (icona `User_White`, `@UserName`; è
  anche il pulsante `Log_off`: `onDown` apre il dialogo di login, `onUp` fa `LogOff()`); al centro il
  blocco 747x95 con nome linea / numero programma / descrizione programma **per 4 linee**
  (`Line_N_Name`, `Program_Selection_Program_Selection_L[n]`, `Prog_In_Use_Ln_Description`); a destra
  stato PackML (`LPMLV30_UnitModes`, `LPMLV30_States` come resource list) e il logo `CLV_White`, che è
  anche un pulsante verso `2281_CLV_User_Main`.

### Barra laterale (`screens/Modelli_Desktop/Lateral Bar.json`, 80x649)

Sette voci fisse. Icona 60x60 a x=14, etichetta 61x18 subito sotto (+61), **passo verticale 94 px**:

| k | y   | icona                 | apre                        |
|---|-----|-----------------------|-----------------------------|
| 0 | 7   | `Icon_MachineControl` | `1xxxx_Main_Template`       |
| 1 | 101 | `Icon_Settings_1`     | `2xxxx_Settings_Template`   |
| 2 | 195 | `Icon_Alarms_2`       | `3xxxx_Alarms_Template`     |
| 3 | 289 | `Icon_Statistics`     | `4xxxx_Statistics_Template` |
| 4 | 383 | `Icon_Manuals_2`      | `5xxxx_Manuals_Template`    |
| 5 | 477 | `Icon_Diagnostic`     | `6xxxx_Diagnostic_Template` |
| 6 | 571 | `Icon_Formats`        | `7xxxx_Formats_Template`    |

Ogni pulsante fa esattamente due cose:

```js
HMIRuntime.Tags.SysFct.SetBitInTag("SW_PopUp_Visibility", 0);
HMIRuntime.UI.SysFct.ChangeScreen("<Nxxxx_..._Template>", "../Sottomenu");
```

Icona ed etichetta hanno `Opacity <= tag Actual_Page_Number` con un ValueConverter di tipo `Range`:
**la sezione attiva si illumina in base al numero della pagina aperta.** È il meccanismo di "selected"
dello standard, e dipende dalla numerazione del §3.

### I "Template" NON sono template: sono i sottomenu

`Nxxxx_<Sezione>_Template` (gruppo `Template Desktop`) è il **pannello a scomparsa** con l'elenco
delle pagine della sezione. Anatomia (misure da `1xxxx_Main_Template`):

- un `HmiButton` invisibile 1280x800 a (0,0) che chiude il pannello (`ResetBitInTag SW_PopUp_Visibility`);
- il pannello `Rectangle_1` 210x290 a (131,160);
- il triangolino `Polygon_1` 30x43 a (102,165) che punta all'icona della barra laterale;
- fino a 7 voci: pulsante 158x34 a x=189, **passo 40 px**;
- icona della voce ~24x20 a x≈146;
- separatore 200x2 a x=132 fra una voce e l'altra;
- copie nascoste dei 7 pulsanti della barra laterale (solo riferimento di allineamento).

Ogni voce fa **due** `ChangeScreen`, una per layout:

```js
HMIRuntime.Tags.SysFct.ResetBitInTag("SW_PopUp_Visibility", 0);
HMIRuntime.UI.SysFct.ChangeScreen("2041_Encoders_Main", "../SW_Screen");                    // desktop
HMIRuntime.UI.SysFct.ChangeScreen("2xxxx_Settings_Template_Navigator", "../SW_Navigator");  // mobile
```

Il pannello è posizionato in verticale vicino alla propria icona. Y della prima voce, per sezione:
Main 168, Settings 237, Alarms 322, Statistics 415, Manuals 443, Diagnostic 508, Formats 491
(Formats è l'unico fuori schema: non segue l'ancoraggio all'icona, probabilmente una svista).

### Navigatore mobile

`Nxxxx_<Sezione>_Template_Navigator` (gruppo `Template Mobile`, 1280x64) è la stessa lista come
striscia di tab orizzontali: pulsanti 157x43, `ForeColor <= Actual_Page_Number [Range]` e una barretta
158x5 sotto la tab attiva, sempre pilotata da `Actual_Page_Number`.

---

## 3. La regola di numerazione (fondamentale)

Tutto lo standard si regge su questa:

```
sezione        = N000                 N = 1..7
voce di menu k = N000 + 1 + 40*k      k = 0..13   ->  N001, N041, N081, N121, N161, N201, ...
pagina         = numero della voce + 0..39         ->  2041, 2042, ... 2077
```

Ogni sezione ha **14 slot di menu**, ogni slot **40 numeri di pagina**. Le cartelle vuote
(`1321_`, `2361_`, `4441_`, …) esistono già nel progetto: sono gli slot liberi.

Non è decorazione. Serve a due cose:

1. `Actual_Page_Number` (impostato dalla pagina al load) alimenta i ValueConverter `Range` che
   evidenziano la sezione nella barra laterale e la tab nel navigatore mobile;
2. il PLC riceve `PV_ActualPageNumber_For_PLC[sessione]` e sa dove si trova l'operatore.

**Un generatore di pagine deve assegnare i numeri con questa regola, altrimenti la selezione visiva e
la comunicazione col PLC si rompono in silenzio.**

Sezioni presenti (da `screen-groups.json`):

| N | sezione         | slot usati |
|---|-----------------|------------|
| 1 | Main            | 1001 Machine_Control, 1041 Counters, 1081 Special_Function, 1121 Collector_Counters, 1161, 1201 OMAC, 1241 Maintenance, 1281 Chat_Bot |
| 2 | Settings        | 2001 Program Modification (30 pagine), 2041 Encoders (37), 2081 Motor_Speed, 2121 Robot_Function, 2161 Lubrification, 2201 Infeed_Guides, 2241 System Function, 2281 CLV_User (13) |
| 3 | Alarms & Events | 3001 Alarms, 3041 Alarms_By_Zone, 3081 History, 3121 Troubleshooting_Media_Mng |
| 4 | Statistics      | 4001 Statistics, 4041 Advanced, 4081 Availability |
| 5 | Manuals         | 5001 General, 5041 Infeed, 5081 Preforming, 5121 Layer_Pusher, 5161 Lifter, 5201 Tie Sheet, 5241 PalletConveyor |
| 6 | Diagnostic      | 6001 Synoptic, 6041 Robot, 6081 By_Zone, 6121 By_Device, 6161 Preventive_Maintenance, 6201 Profinet, 6241 |
| 7 | Formats         | 7001 Formats (Robot/Normal), 7041 Formats_Copy (Robot/Normal), 7081 Pallet_Store_Selection |
| 9 | Various (popup) | 9001 Popup_Control_Panel, 9002 Popup_Diag_By_Device, 9003 PDF_Troubleshooting, 9004 Manual Popup, 9010 Alarm_Loading |

---

## 4. Anatomia di una pagina di contenuto

Riferimento: `screens/1000_Main/1081_Special_Function/1081_Special.json` (1280x694).

1. **Script `onLoaded` della schermata** — obbligatorio, sempre queste tre righe:

   ```js
   HMIRuntime.Tags.SysFct.SetTagValue("Actual_Page_Number", 1081);
   Tags("PV_ActualPageNumber_For_PLC["+ Tags("Enable_Session_Index").Read() +"]").Write(1081);
   HMIRuntime.Tags.SysFct.SetTagValue("Folder_Vis", 1);
   ```

2. **Cornice** `Rectangle` 1214x681 a (9,8).
3. **Intestazione** `recContentboard2_2` 1192x37 con la `TextBox` del titolo a x=16.
4. **Colonna sinistra di righe**: rettangoli 403x75 a x=20, y = 60, 138, 216, 294, 372, 450, 528
   (**passo 78**). Dentro ogni riga: etichetta `TextBox` 213x43 a (+14,+16) e a destra il controllo —
   `HmiIOField` 70x33 a x=348, oppure un `HmiButton` 101x50 a x=297 con `Graphic <= tag [Range]`
   (l'interruttore ON/OFF: due immagini `On`/`Off_1` scelte dal valore).
5. **Pannello destro** `recContentboard2_7` 784x618 a (428,60), tipicamente con una `GraphicView` del
   disegno macchina e sopra dei `Polygon` cliccabili per zona.
6. **Tab / cartelle**: pulsante in alto a destra 63x31 con `BackColor <= tag Folder_Vis [Range]`.
   `Folder_Vis` è il tag "quale scheda è aperta", il più usato dello standard (511 usi).
7. **`HmiTouchArea`** a tutto schermo, `Visible <= Mobile_Layout_Active`, con lo swipe:

   ```js
   if (gesture == UI.Enums.HmiGesture.SwipeRight) HMIRuntime.UI.SysFct.ChangeScreen("1041_Counters", ".");
   if (gesture == UI.Enums.HmiGesture.SwipeLeft)  HMIRuntime.UI.SysFct.ChangeScreen("1121_Collector_Counters", ".");
   ```

---

## 5. Come si "anima" un oggetto

Ogni `ScreenItem` ha una lista `Dynamizations`, e ogni voce lega **una** proprietà a una sorgente:

| tipo                       | cosa fa |
|----------------------------|---------|
| `TagDynamization`          | `PropertyName` <- valore del `Tag`, con `ValueConverter` opzionale (`MappingTable.ConditionType`: `None` 1360, `Range` 1068, `Singlebit` 93, `Expression` 10) |
| `ResourceListDynamization` | `PropertyName` <- testo/immagine scelto da una lista testi |
| `ScriptDynamization`       | `PropertyName` calcolata da JavaScript |
| `ExpressionDynamization`   | `PropertyName` da un'espressione |

Proprietà effettivamente animate nello standard, per frequenza:

```
ProcessValue 974 | BackColor 735 | Visible 492 | Graphic 182 | Text 159 | Opacity 79
Width 59 | Left 56 | Height 55 | Top 53 | ForeColor 50 | Enabled 8 | BorderWidth 7
BorderColor 7 | AlternateBackColor 4 | IsSelected 3 | RotationAngle 3 | Url 1 | AngleRange 1
```

Questa lista è il **capitolato minimo per l'editor e per i template React**: se un template non sa
esprimere "colore di sfondo in funzione di un tag con soglie", non è conforme allo standard.

Gli eventi sono `EventHandlers` (`EventType`: `Down`, `Up`, `Loaded`, `GestureDetected`, …) con dentro
`Script.ScriptCode` in JavaScript. Funzioni di sistema ricorrenti:
`HMIRuntime.UI.SysFct.ChangeScreen(schermata, percorsoFinestra)`, `ClosePopup`, `LogOff`,
`HMIRuntime.UI.UserManagement.SysFct.ShowLoginDialog/SetLocalUser`,
`HMIRuntime.Tags.SysFct.SetTagValue/SetBitInTag/ResetBitInTag`, `Tags("x").Read()/.Write(v)`,
`HMIRuntime.Timers.SetTimeout`.

Tipi di oggetto usati (conteggio su tutte le schermate):
`HmiRectangle` 2010, `HmiTextBox` 1764, `HmiButton` 1253, `HmiIOField` 959, `HmiGraphicView` 524,
`HmiLine` 436, `HmiPolygon` 376, `HmiCircle` 134, `HmiTouchArea` 123, `HmiEllipse` 109,
`HmiFaceplateContainer` 44, `HmiSymbolicIOField` 30, `HmiScreenWindow` 12,
`HmiCustomWidgetContainer` 12 (SVG dinamici), `HmiWebControl` 8, `HmiDataGridViewPart` 6,
`HmiBar` 4, `HmiGauge` 3, `HmiRadioButtonGroup` 3, `HmiAlarmControl` 3.

**Faceplate usati** (l'equivalente dei componenti riusabili):

| faceplate           | usi | interfaccia |
|---------------------|-----|-------------|
| `V0.0.8\Pack`       | 41  | `Group_Nr`, `Group_Selected`, `Height`, `Width`, `color_Pack` |
| `V0.0.5\Slider V2`  | 2   | `Color`, `Max_Value`, `Min_Value`, `floor`, `processValue` |
| `V0.0.28\Slider V1` | 1   | idem |

---

## 6. Contratto tag: quello che ogni pagina deve rispettare

Tabella `Server/Client Management` — i tag del guscio, non della macchina:

| tag                                  | tipo        | a cosa serve |
|--------------------------------------|-------------|--------------|
| `Actual_Page_Number`                 | Int         | numero della pagina aperta -> evidenzia il menu |
| `Folder_Vis`                         | Int         | scheda/cartella attiva dentro la pagina |
| `SW_PopUp_Visibility`                | Bool        | il sottomenu è aperto |
| `SW_PopUp_SlideIN`                   | Int         | offset X dell'animazione di entrata |
| `Mobile_Layout_Active`               | Bool        | siamo in layout mobile |
| `Enable_Session[0..10]`              | Bool        | slot di sessione occupati (client locali) |
| `Enable_Session_Index`               | SInt        | il proprio indice di sessione |
| `PV_Enable_Session_PLC[0..5]`        | Bool (PLC)  | sessioni viste dal PLC |
| `PV_Watchdog_HMI[0..5]`              | Bool (PLC)  | watchdog per sessione |
| `PV_ActualPageNumber_For_PLC[0..10]` | DInt (PLC)  | pagina corrente comunicata al PLC |
| `Clock_1Hz` / `Clock_2Hz`            | Bool (PLC)  | lampeggi |
| `PushButton_Login`                   | Bool        | richiesta di login |
| `AliasName`                          | WString     | usato per l'autologin |
| `Panel_Control_Selection_Zone`       | Int         | zona selezionata nel popup pannello di controllo |

Tag di sistema WinCC disponibili: `@UserName`, `@CurrentLanguage`, `@ServerMachineName`,
`@LocalMachineName`, `@HMI_Connection_PLC_OpState`, `@HMI_Connection_PLC_OpStateCtrl`,
`@SystemHealthIndex`, `@DiagnosticsIndicatorTag`, `@SystemActivationState`, `@DeltaActivationState`.

Altre tabelle notevoli: `PV_Config` (configurazione macchina, incluso `Line_N_Name`), `PackML`
(`UnitModeCurrent`, `StateCurrent`, `StatesDisabled` — la macchina a stati OMAC), `Alarms`
(trigger 0..1024 + buffer per unità `UN0..UN7`), `Program_Selection_General`, `Encoder`,
`MMC_Guide` (70 tag), `Diagnostic_By_Device`, `Lubrication`, `Conveyor_Synoptic`.

Connessione: una sola, `HMI_Connection`, driver `SIMATIC S7 1200/1500`, HMI `10.14.1.230` -> PLC
`10.14.1.220`, accesso simbolico.

---

## 7. Allarmi, lingue, utenti

- **Allarmi**: 1024 allarmi discreti, nessun allarme analogico. Trigger su bit:
  `TriggerBitAddress = "Alarm_Trigger_HMI.Active[454].x0"`, `RaisedStateTag = "Alarms_Trigger[454]"`,
  `TriggerMode = OnRisingEdge`. 21 classi (`Alarm_CTH`, `Acknowledgement`, …), area
  `HMI_RT_1::Alarming`. Ogni allarme ha `EventText` + `EventText1..9` + `InfoText`.
- **Lingue**: 6 attive — Italiano (default, Order 0), Inglese US (1), Francese (2), Inglese UK (3),
  Tedesco (4), Spagnolo (5). Font fisso **Siemens Sans**. Nelle schermate il font è `SiemensSans`,
  dimensioni tipiche 14/15 pt.
- **Utenti e permessi**: **non passano da Openness.** In Unified stanno in UMC/UMAC. Nelle schermate
  si vede solo la proprietà `Authorization` degli oggetti, e nello standard è usata **una volta sola**
  (`CLV`, su 2 oggetti). Il resto del controllo accessi è fuori dai dati che abbiamo: va raccolto a
  mano dal pannello di amministrazione.

---

## 8. Cosa manca nell'export (buchi noti, con la causa)

Questi buchi vengono dallo script di export, non dallo standard: erano nel modo in cui leggeva, non
in quello che c'era da leggere.

**I punti 1-4 sono già stati corretti nello script.** Non serve rifare l'export da capo: c'è la
modalità `--fill`, che ripercorre gli oggetti del progetto tenendo a fianco i JSON già scritti e
aggiunge solo quello che manca, senza toccare il resto.

```bash
cd C:\Users\m.negrini\Desktop\hmiPanels\StandardHmi && fill.cmd
```

(con TIA aperto sul progetto standard; `fill.cmd` trova da solo la cartella `standard/` di questo
repo. `screen-groups.json` viene saltato di proposito: ripete le stesse schermate di `screens/`.)

Tabella dei buchi, con la causa:

| # | cosa mancava | perché | com'è stato risolto |
|---|--------------|--------|---------------------|
| 1 | **Tutti i testi.** `Text`, `ToolTipText`, `AlternateText`, `DisplayName`, `EventText` valevano la stringa letterale `"Siemens.Engineering.MultilingualText"` (3637 testi + 7825 tooltip + i testi di 1024 allarmi) | la `ToString()` di `MultilingualText` non è il testo ma il nome del tipo; il testo vero sta in `Items`, uno per lingua | **corretto**: ora escono come `{"it-IT": "…", "en-US": "…"}`, `""` se non c'è testo in nessuna lingua |
| 2 | **Tutti i colori.** Nessun `BackColor`/`ForeColor`/`BorderColor` statico: sapevamo *che* `BackColor` è animato 735 volte, non *di che colore* | sono `System.Drawing.Color`, cioè struct e non primitivi: `scalar()` li scartava | **corretto**: ora escono come `"#AARRGGBB"` |
| 3 | **Le soglie dei ValueConverter**: `MappingTable` usciva col solo `ConditionType` (1068 `Range` + 93 `Singlebit`, cioè le regole "verde sopra X, rosso sotto Y") | le voci stanno a profondità 6 e la camminata si fermava a `MAX_DEPTH = 4` | **corretto**: `Entries` viene seguito comunque, con `From`/`To`/`Value`/`Condition` |
| 4 | **Le voci delle liste testi** (26 liste) e **il codice dei 2 moduli script**: uscivano col solo nome | `HmiTextList` e `HmiScriptModule` come proprietà .NET espongono solo `Name`: il contenuto passa dagli attributi Openness | **corretto**: si leggono con `GetAttributeInfos`/`GetAttribute`; se salta fuori il codice diventa un `.js` in `standard/scripts/`. Da verificare sul campo: se Openness V20 non li espone, `--fill` lo dice invece di inventare |
| 5 | Qualche oggetto esce con geometria `None` (es. `Ellipse_3` in `1081_Special`) | proprietà che sollevano eccezione in lettura vengono saltate in silenzio | **aperto**, pochi casi |
| 6 | Le immagini (225 grafiche referenziate per nome: `Icon_Formats`, `PBP1 - Main`, …) | l'export salva il nome, non il file | **aperto**: serve un export separato delle grafiche dal progetto TIA |

Gli script *degli oggetti* (gli `EventHandlers` dei pulsanti, gli `onLoaded` delle schermate) c'erano
già dal primo export e vanno bene.

### Cosa è stato effettivamente riempito

`--fill` è stato lanciato una volta ma ha scritto in `standard/XPB1/`, che era l'avanzo di un export
vecchio e parziale (5 schermate su 160), invece che in `standard/`. Quel poco però basta a rispondere
alle domande che contano, e **si lavora con questo**:

- **La tavolozza** (da 5 schermate, ma il guscio è tutto lì): sfondi scuri `#FF48494E`, `#FF333333`,
  `#FF404D53`; bordi `#FF64646A`, `#FF7D7D85`, `#FF474957`; testo chiaro `#FFF2F4FF`, `#FFFFFFFF`,
  `#FFB5BEC5`, `#FFCDD3D7`; grigi `#FF808080`, `#FF91939A`, `#FF859399`; accento **`#FF00A1D1`**
  (il petrol Siemens); verde di conferma `#FF00FF00`. Formato `#AARRGGBB`: `#00…` vuol dire
  trasparente, ed è usato spesso (`#00F2F4FF` su 31 oggetti) per gli sfondi "niente".
- **I font**: solo `SiemensSans`. Corpo 14 Normal (61 usi), titoli 16/18 Bold, numeri grossi 24/32.
- **I testi sono XHTML, non stringhe**: `{"it-IT": "<body><p>Testo</p></body>", "en-US": …}`, sei
  lingue sempre presenti, spesso riempite solo in italiano e inglese US (le altre restano `"Text"`).
  Chi genera i template deve sapere che il testo va estratto dal frammento, non usato così com'è.
- **Gli allarmi non hanno testo nel progetto HMI.** Tutti e 1024 hanno come `EventText` il segnaposto
  `Siemens.Simatic.Hmi.Utah.Alarm.HmiDiscreteAlarm:Discrete alarm_NNN`. Il testo vero arriva dal PLC
  a runtime, attraverso i buffer `UN0_Message`..`UN7_Message` (WString) della tabella `Alarms`.
  Non è un buco dell'export: è come è fatto lo standard, e cambia il modo in cui va fatto il
  template della pagina allarmi (nessuna lista statica di messaggi da tradurre).
- **Le soglie dei ValueConverter restano fuori.** Nelle 5 schermate riempite tutte le `MappingTable`
  hanno `ConditionType: None`, quindi zero voci — corretto, non un errore, ma vuol dire che le 1068
  regole `Range` del resto del progetto non le abbiamo. È l'unica cosa che manca davvero.

Se un giorno serve il resto, `fill.cmd` ora punta alla cartella giusta (prima sceglieva una
sottocartella per il solo fatto che esisteva) e avvisa se l'export su cui sta lavorando è parziale.

---

## 9. Dove siamo rispetto ai template React

Catalogo attuale: `C:\Users\m.negrini\Desktop\hmiPanels\templateHmi\templates\`

| template esistente | corrisponde a | giudizio |
|--------------------|---------------|----------|
| `operator-shell` | TopBar + Lateral Bar + SW_Screen | concetto giusto, geometria e contratto da riallineare (7 sezioni fisse, 80x649, 1280x151) |
| `operator-shell/linked/*-menu-popup` (4) | `Nxxxx_*_Template` | giusti come idea; ne mancano 3 (Settings, Statistics, Formats) e non seguono la numerazione |
| `alarm-list` | `3001_Alarms` | da verificare contro `HmiAlarmControl` e le 21 classi |
| `machine-counters` | `1041_Counters` | plausibile |
| `consumption` | nessuna pagina standard corrispondente | **inventato**, non è nello standard |
| `special-functions` | `1081_Special` | esiste; `reference/special-functions.png` è vuoto |

Mancano completamente, e sono le parti più pesanti dello standard: la sezione **Settings** (73 pagine
su 160!), il **navigatore mobile**, i **popup 9xxx**, la **pagina formati**, la **diagnostica per
zona/dispositivo**, il **sinottico**.

Sul lato editor (`ModificaSitiReact`), quello che lo standard richiede e che oggi non c'è:

1. **Numerazione automatica** — quando si aggiunge una pagina, l'editor deve assegnare il numero
   secondo la regola del §3 e scriverlo nel manifesto.
2. **Le due navigazioni** — aggiungere una pagina significa aggiungere una voce nel sottomenu desktop
   **e** una tab nel navigatore mobile. Oggi non è modellato.
3. **Le dynamization come proprietà di prima classe** — l'Inspector deve poter dire "BackColor = tag X
   con soglie", non solo uno stile inline.
4. **La tavolozza dei componenti deve corrispondere ai tipi `Hmi*`**, non a div generici.
5. Il difetto già noto: la palette inserisce un template di pagina come componente nudo senza props;
   deve inserirlo con i suoi `inputs`, o rifiutarsi.

---

## 10. Piano, in ordine

1. ~~Riempire i buchi dell'export.~~ Fatto quanto basta: tavolozza, font e formato dei testi si sanno
   (§8). Si va avanti con questo. Le soglie dei `Range` mancano ancora: quando servono davvero,
   `fill.cmd` con TIA aperto.
2. **Esportare le grafiche** dal progetto TIA (buco 6): servono per i template.
3. **Scrivere il modello dello standard** in un unico file leggibile dall'editor: sezioni, regola di
   numerazione, geometrie del guscio, contratto tag, tipi di oggetto ammessi. È la fonte di verità per
   generatore e validatore.
4. **Riallineare `operator-shell`** a TopBar / Lateral Bar / SW_Screen reali (misure del §2).
5. **Creare i 3 sottomenu mancanti** e il **navigatore mobile**.
6. **Coprire la sezione Settings**, partendo dallo schema di riga del §4 (403x75, passo 78): un solo
   template "lista di impostazioni" copre da solo decine di pagine standard.
7. **Portare le dynamization nell'editor** (Inspector + manifesto pagina).
8. **Raccogliere a mano utenti e permessi** UMC/UMAC (§7), che Openness non dà.

---



| percorso | cos'è |
|----------|-------|
| `standard/` | l'export dello standard (questo repo) |
| `../StandardHmi/export_unified_standard.py` | lo script di export Openness |
| `../templateHmi/templates/` | il catalogo dei template React |
| `../templateHmi/panels/can-line-operator/` | il pannello generato di esempio |
| `src/core/panelManifest.ts` | il contratto `panel.json`: cosa una pagina lascia modificare |
| `src/core/templateContract.ts` | il contratto `template.json` |

Note operative: nel workspace `templateHmi` le dipendenze **non** sono installate (serve
`pnpm install`, poi `pnpm run dev:can-line`). Lo standard è un progetto V20: un `.ap21` non si apre
con Openness V20.
