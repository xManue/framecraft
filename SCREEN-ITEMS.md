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
