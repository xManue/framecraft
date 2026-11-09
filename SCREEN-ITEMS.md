# Oggetti della schermata negli script

Dal pacchetto Runtime `2026.11.06.1`, `Screen.Items` e `Faceplate.Items` supportano
conteggio, ricerca per nome, indice e iterazione. La stessa implementazione viene usata
nel ponte dell’anteprima e nei pannelli generati.

```javascript
const objects = Screen.Items;
HMIRuntime.Trace("Oggetti presenti: " + objects.Count);
Object.values(objects).forEach(control => HMIRuntime.Trace(control.Name));
```

`Count` comprende anche gli oggetti invisibili. La collezione esclude la radice Screen,
gli elementi fuori dalla schermata e i contenuti interni dei faceplate. Un’istanza faceplate
compare una volta nella schermata che la contiene. `Faceplate.Items` riguarda l’istanza
corrente; un faceplate annidato compare una volta nel padre, con i propri contenuti isolati.
Questo permette di usare gli stessi nomi interni in più istanze. I popup del Runtime
sono radici indipendenti: non entrano nel conteggio della pagina principale e mantengono
l’accesso agli oggetti del loro faceplate.

## Nomi, indici e riferimenti

```javascript
const named = Screen.Items("M2400");
const first = Screen.Items(0);
named.Text = "Motore pronto";
HMIRuntime.Trace(first.Name);
```

- I nomi sono esatti e distinguono maiuscole/minuscole. Un nome duplicato genera un errore.
- Gli indici partono da zero e seguono l’ordine degli oggetti nel DOM del pannello Framecraft.
  Per mantenere un riferimento a uno specifico motore usare il nome; un cambiamento del layout
  può cambiare gli indici.
- La stringa `"1"` cerca un nome; il numero `1` cerca il secondo oggetto.
- Indici negativi, frazionari o fuori intervallo e selettori non validi vengono rifiutati.
- `UI.ActiveScreen.Items`, `HMIRuntime.UI.ActiveScreen.Items` e `this.Items` nello script
  grafico condividono il riferimento della schermata corrente. Anche un alias locale della
  collezione può essere chiamato; call/apply/bind non consentono di spostarlo su un altro contesto.
- Per compatibilità rimane la ricerca esplicita della radice tramite il suo nome se non c’è
  un oggetto della collezione con quel nome. La radice non compare nel conteggio o negli indici.

La collezione è in sola lettura: `Count` e le posizioni non sono sostituibili. Le proprietà
supportate degli oggetti restano modificabili, con gli stessi limiti di tipo, permessi grafici
e invalidazione del contesto delle altre API HMI. I riferimenti non espongono nodi DOM,
identificatori interni, costruttori o prototipi e non possono essere inviati al PLC come valori.

## Iterazione e limiti

`Object.keys` restituisce gli indici come stringhe; `Object.values` restituisce i riferimenti
agli oggetti; `Object.entries` restituisce coppie indice/riferimento. L’enumerazione conserva
l’ordine della collezione ed è limitata a 1024 elementi e al budget della VM. Il conteggio
può leggere una collezione più grande senza materializzarla come dati dello script.
I riferimenti memorizzati conservano il proprio contesto: un cambio pagina o la rimozione
dell’oggetto proprietario li rende inutilizzabili, anziché cercare oggetti nella nuova pagina.
Anche lo spostamento del proprietario in un’altra schermata invalida il riferimento
conservato: va acquisita una nuova collezione nel nuovo contesto.

Conteggio e lettura dei nomi non richiedono il calcolo di geometrie, colori o font di tutti
gli oggetti. La superficie DOM produce le proprietà solo quando vengono richieste.

La IR resta versione 9 e legge le versioni 1–9. Questa estensione non aggiunge classi,
for/for-in/while, generatori o JavaScript completo: per iterare si usano i metodi Array
supportati. Restano da completare le altre collezioni e parti dell’object model, incluse
finestre schermata, percorsi, proprietà annidate e metodi specifici dei controlli.

## Pannelli esistenti e verifica

I nuovi progetti includono l’implementazione nella pipeline standard. Per quelli esistenti
usare **Pannello → Aggiorna componenti del pannello**, confrontando eventuali personalizzazioni.
Un adattatore host precedente che non espone la collezione riceve un errore con questa indicazione.
Non vengono aggiornati automaticamente pannelli già installati.

`tests/hmi-screen-collections.test.ts` verifica lookup, limiti, scope annidati, riferimenti,
trasporto dei metadati del ponte e assenza di calcoli di stile per nomi/conteggio.
`tests/browser/screen-collections.mjs` genera un pannello dalla pipeline standard, lo compila,
prova eventi/timer, faceplate reali annidati e popup in Edge, legge gli script IR 1–9 e usa gli helper autonomi
nel Runtime Node. I dati sono sintetici e non viene contattato un PLC.

Riferimento primario: [Siemens, Tips and Tricks for Scripting, sezione 5.4.6](https://support.industry.siemens.com/cs/attachments/109758536/109758536_Unified_TipsScripting_V31_en.pdf),
per conteggio, oggetti invisibili e accesso numerico. Ordine DOM e API di iterazione qui
sono il contratto Framecraft; non si dichiara parità completa del linguaggio Siemens.

## Margin dal pacchetto 2026.11.06.2

Margin è una parte opaca dell’oggetto con Left, Top, Right e Bottom. Ogni lato accetta
un numero intero con segno da -2147483648 a 2147483647 (Int32). I valori negativi sono
ammessi e vengono applicati come margini esterni CSS del contenitore grafico.

```javascript
const motor = Screen.Items("M2400");
const spacing = motor.Margin;
spacing.Left = -8;
spacing.Top = 12;
```

È possibile assegnare tutti e quattro i lati con un oggetto di valori, oppure copiare il
Margin di un altro elemento. La copia produce valori indipendenti, non un collegamento.
La validazione di tutti i lati precede l’unica pubblicazione al livello grafico: un valore
errato o mancante non lascia una copia parziale. Il record deve contenere tutti e soli i
quattro lati; metadati vendor come _type non fanno parte di questo contratto Framecraft.

```javascript
motor.Margin = { Left: 8, Top: 4, Right: 8, Bottom: 4 };
Screen.Items("SecondMotor").Margin = motor.Margin;
```

I riferimenti si possono usare in funzioni, moduli e timer; i contesti disattivati vengono
rifiutati. Non espongono DOM o prototipi e non sono valori PLC. La parte Margin è distinta
da Font e non accetta PropertyFlashing.

La superficie standard legge i pixel calcolati quando sono rappresentabili come Int32.
Valori automatici, frazioni o unità non risolte non vengono arrotondati o inventati: la
lettura spiega di impostare un margine intero in pixel. Impostare esplicitamente i quattro
lati resta possibile. SVG, display:contents e celle/righe/colonne di tabella senza un box
CSS supportato non espongono questa parte; per essi usare il contenitore grafico esterno.
La resa segue il layout CSS del pannello, incluse le regole dei margini nel flusso inline.

Il livello temporaneo usa priorità coerenti, conserva nodi/listener e ripristina i margini
precedenti alla disattivazione, mantenendo le modifiche esterne successive. Una pubblicazione
fallita richiede il ripristino del livello precedente e segnala un eventuale errore del layout.

Per pannelli esistenti usare Aggiorna componenti del pannello. Un adattatore host deve
esporre le quattro proprietà Margin.* negli snapshot e setMargin(reference, value) per
l’assegnazione completa, oltre ai getter/setter scalari. La IR resta 9 con lettori 1–9.

La prova compilata verifica anche lo spostamento effettivo del rettangolo, dimensioni
invariate, copia indipendente, timer, ripristino e helper Node. Padding e le altre parti
annidate dell’object model restano separate e da completare.

Fonti primarie: [Margin e HmiMarginPart](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.margin-rt-unified/description-button.margin-rt-unified?contentId=LlDyCqW1HPNXQUZ3TuiTZQ),
[Left Int32](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.margin-rt-unified/margin.left-rt-unified?contentId=TTCbZhZaqPHlqofA476lDQ) e
[Top Int32](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/clock-rt-unified/clock.margin-rt-unified/margin.top-rt-unified?contentId=wTgR7O4yam6yhT3bCsi~MQ).
L’assegnazione di record e la mappatura CSS sono il contratto Framecraft, non una dichiarazione
di equivalenza completa a tutti i widget e contenitori Siemens.

## Ingombro reale dal pacchetto 2026.11.06.3

GetBoundingBoxInScreenCoordinates() restituisce una fotografia dei quattro valori
Left, Top, Width e Height. La misura comprende trasformazioni CSS dell'oggetto e dei
suoi gruppi, rotazione, scala, bordi e margini. I numeri conservano le frazioni: non
vengono convertiti negli interi delle proprietà di configurazione Left/Width.

```javascript
const motor = Screen.Items("M2400");
const box = motor.GetBoundingBoxInScreenCoordinates();
if (box) {
  HMIRuntime.Trace("Ingombro: " + box.Left + ", " + box.Top);
}
```

Il sistema di coordinate Framecraft è il viewport HMI, in pixel CSS: origine nell'angolo
in alto a sinistra della pagina visualizzata. Lo scorrimento cambia Left e Top; lo zoom
esterno dell'editor e la posizione della finestra sul monitor non entrano nella misura.
L'ingombro è il rettangolo allineato agli assi che racchiude il box trasformato, non un
poligono ruotato e non la sola parte rimasta visibile dopo un ritaglio/overflow. Il criterio
segue getBoundingClientRect del browser. Non si presume identità tra queste coordinate e
quelle fisiche di ogni dispositivo Siemens.

La chiamata non richiede argomenti. Restituisce null quando l'elemento non genera un box
CSS, per esempio display:none; visibility:hidden mantiene invece la geometria del box.
Una riga/cella/SVG misurabile segue la geometria del browser. Un oggetto rimosso, un contesto
scaduto o una misura non finita producono un errore, senza inventare coordinate.

Il risultato è un oggetto di dati indipendente: cambiarlo non sposta l'elemento. Non contiene
DOM o prototipi host. Si possono copiare le proprietà, usare il metodo nei moduli e nei timer,
o conservarlo con call/apply/bind specificando un oggetto grafico come this. Font e Margin
non sono oggetti grafici misurabili tramite questo metodo.

Nel Runtime esportato la misura è diretta. Gli eventi e i timer dell'anteprima interrogano
il frame attivo anche dopo setter nello stesso script: la risposta arriva dopo le modifiche
inviate al frame, senza attendere il polling delle proprietà. L'attesa è interna all'esecutore;
lo script conserva la firma sincrona mostrata sopra. Origine, finestra, pagina e richiesta
sono verificate; cambio pagina, interruzione e timeout annullano l'attesa. Non viene usato il
trasporto OPC UA/MQTT. I calcoli sincroni delle dinamizzazioni nell'editor usano invece
l'ultima fotografia disponibile del frame; un adattatore custom può usare la stessa distinzione.

Gli host custom espongono boundingBox negli snapshot, getBoundingBox nel manager e,
per misure tra frame, measureBoundingBox nella superficie/getBoundingBoxAsync nel manager.
I campi vengono ricopiati e validati all'ingresso della VM. La IR resta 9, senza nuovi nodi;
i vecchi programmi 1-9 restano leggibili. Per gli HMI esistenti aggiornare i componenti Runtime.

Verifica ripetibile: node tests/browser/hmi-geometry.mjs genera il pannello standard, lo
compila e misura in Edge gli oggetti ruotati/raggruppati, i setter nello stesso script,
lo scorrimento, gli elementi senza box e i timer. Verifica inoltre helper Node e ponte Vite
reale con un parent. Il test Canvas usa anche il componente React reale con origini distinte.
Si usano solo dati sintetici, senza rete esterna o contatti PLC.

Fonte primaria: [Siemens, Button.GetBoundingBoxInScreenCoordinates](https://docs.tia.siemens.cloud/r/en-us/v20/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.getboundingboxinscreencoordinates-rt-unified?contentId=elJtj8ZB7Ad~IMO6F7nY1w).
Restano altre parti dell'object model, incluse Padding e le API di trasformazione.

## RotationAngle dal pacchetto 2026.11.09.1

Gli script leggono e impostano RotationAngle sugli oggetti grafici con trasformazione
CSS piana risolvibile. Il valore e' un Int16 in gradi, tra -32768 e 32767: niente conversioni
implicite da stringhe o arrotondamento degli input. I giri completi restano nel valore
impostato dallo script, anche se la matrice visualizzata descrive un angolo equivalente.

```javascript
const motor = Screen.Items("M2400");
motor.RotationAngle = 90;
const box = motor.GetBoundingBoxInScreenCoordinates();
```

Il layer combina la matrice CSS dell'elemento con rotate e scale individuali e sostituisce
l'orientamento locale. Conserva traslazione affine, allungamenti, inclinazione, riflessione,
translate indipendente, transform-origin e trasformazioni dei gruppi esterni. La misura
GetBoundingBoxInScreenCoordinates riflette il risultato reale anche nello stesso evento.

Una rotazione individuale senza orientamento aggiuntivo della matrice conserva il suo
valore dichiarato (inclusi i giri). Le altre matrici vengono lette con orientamento canonico,
normalmente tra -180 e 180 gradi; una tolleranza di 0.0001 gradi corregge la serializzazione
numerica del browser vicino a un intero. Una frazione non rappresentabile come Int16 si
segnala in lettura e puo' essere sostituita esplicitamente con un angolo intero.

RotationAngle descrive la trasformazione locale dell'oggetto, non l'angolo dopo i gruppi
padre o un percorso di movimento CSS. Le matrici 3D non piane, assi di rotazione X/Y e
trasformazioni non risolte non vengono appiattiti o cancellati. In questi casi la proprieta'
non e' esposta; usare un contenitore grafico con una trasformazione 2D risolvibile.

Gli stili temporanei prevalgono anche su classi important. Reset, sospensione e chiusura
della simulazione ripristinano i valori e le priorita' precedenti, conservando successive
modifiche esterne. I setter scalari ora ripristinano anche lo stato logico se una pubblicazione
grafica fallisce, come gia' previsto per la copia completa di Margin.

Riferimenti nei moduli e timer restano soggetti al contesto attivo. Anteprima, ponte Vite,
Runtime esportato e helper Node condividono il setter tipizzato. Gli host custom devono
esporre RotationAngle negli snapshot e gestire il relativo comando grafico.
La IR resta 9 e i lettori 1-9 sono conservati. Sugli HMI esistenti aggiornare i componenti.

La prova tests/browser/hmi-geometry.mjs confronta ingombro e matrice realmente applicati,
controlla traslazione, prodotti scalari e determinante, timer e ripristino. Ripete il setter
sul ponte Vite caricato dalle risorse del pacchetto. Il Canvas React e' verificato su origini
distinte. Dati sintetici e nessuna connessione PLC.

Fonte primaria: [Siemens, Button.RotationAngle Int16](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.rotationangle-rt-unified?contentId=yuN2OD27G0qFgjBXtDdYgw).
RotationCenterPlacement/X/Y restano da implementare nelle API script; questo setter conserva
il pivot CSS gia' presente. Restano anche Padding e le altre voci aperte dell'object model.

## Centro di rotazione dal pacchetto 2026.11.09.2

RotationCenterPlacement usa i valori Unified AbsoluteFromCenter (0), NormedFromCenter (1)
e AbsoluteToContainer (2). RotationCenterX e RotationCenterY accettano Float finiti, anche
frazionari, negativi o esterni al riquadro; il limite numerico e' quello del Float32.

```javascript
const motor = Screen.Items("M2400");
motor.RotationCenterPlacement = 1;
motor.RotationCenterX = 1;
motor.RotationCenterY = -1;
motor.RotationAngle = 90;
```

AbsoluteFromCenter somma X/Y al centro del border-box in pixel CSS. NormedFromCenter usa
0 per il centro e -1/+1 per i bordi opposti; valori oltre questo intervallo portano il
punto fuori dall'oggetto. Queste due modalita' seguono le dimensioni del riquadro tramite
percentuali CSS, anche dopo un ridimensionamento senza un nuovo comando script.

AbsoluteToContainer usa le coordinate del border-box della schermata HMI attiva. Nei popup
il riferimento e' il riquadro della finestra Runtime; sullo stesso oggetto schermata X/Y
sono coordinate locali. La conversione comprende gruppi 2D, traslazioni, scale, zoom CSS e
scorrimento. GetBoundingBoxInScreenCoordinates restituisce invece coordinate del viewport
HMI: il modello mantiene distinta la misura visiva dal riferimento scelto per il pivot.

Per i centri assoluti il livello grafico aggiorna il punto quando cambia il layout, anche
senza un evento script. La lettura degli oggetti forza l'aggiornamento prima della misura.
La verifica nel browser confronta marcatori DOM del pivot e del riferimento nella schermata.
L'aggiornamento si ferma se l'oggetto viene rimosso, si esce dalla simulazione o viene chiusa
la pagina. Non parte un ciclo di misurazione finche' non esiste un centro assoluto attivo.

La prima lettura di un pivot CSS esistente lo rappresenta con la modalita' 0 e con gli
scostamenti dal centro del border-box. Cambiare Placement mantiene i numeri X/Y e ne cambia
il riferimento. Ogni setter valida e pubblica la terna completa per mantenere coerenti le
letture tra editor e frame. Il pivot CSS precedente, il riferimento del box, le priorita' e
le modifiche esterne successive vengono conservati per sospensione e ripristino.

Gli oggetti devono avere un riquadro HTML trasformabile. Per nodi SVG diretti e layout senza
un box adatto usare il contenitore grafico HTML. La modalita' assoluta richiede una geometria
misurabile e contenitori 2D invertibili; scale nulle, trasformazioni 3D, percorsi di movimento
o assenza del riquadro producono un errore con il nome dell'oggetto. Gli errori del layout
vengono segnalati una volta finche' la causa resta la stessa; la misura non restituisce un
rettangolo inventato e riprende dopo la correzione della causa. Il centro relativo resta
utilizzabile senza convertire coordinate della schermata.

Il pacchetto comprende il passaggio degli errori a diagnostica Runtime/Canvas con pagina,
origine e finestra verificate. Non usa trasporti PLC, non introduce dipendenze e conserva
la IR 9 con lettori 1-9. Moduli e timer possono usare i riferimenti finche' il contesto e'
attivo. Per gli HMI installati rimane previsto l'aggiornamento assistito esplicito.

Fonti primarie: [RotationCenterPlacement](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.rotationcenterplacement-rt-unified?contentId=2mrqlucIOekFnifVAWnE0Q),
[RotationCenterX Float](https://docs.tia.siemens.cloud/r/zh-cn/v21/wincc-unified-javascript-%E5%AF%B9%E8%B1%A1%E6%A8%A1%E5%9E%8B-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/button-rt-unified/button.rotationcenterx-rt-unified?contentId=TzIaNL8eVjjsn4MS0hHpjQ) e
[RotationCenterY Float](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-javascript-object-model-rt-unified/hmiruntime-rt-unified/ui-rt-unified/screen-items-rt-unified/graphicview-rt-unified/graphicview.rotationcentery-rt-unified?contentId=xDAUz0zbTTkXgXe_fymD4w).
Le coordinate CSS, la rappresentazione iniziale e l'aggiornamento reattivo sono il contratto
Framecraft; non si dichiara equivalenza completa di ogni oggetto e dispositivo Siemens.
