# Framecraft come editor grafico HMI React

Questo documento spiega il prodotto e le sue regole stabili. Serve a continuare il lavoro senza
ricostruire ogni volta l'obiettivo da conversazioni, screenshot o singoli file.

## Obiettivo

Framecraft e' l'editor e il nucleo verificabile della pipeline che genera un pannello operatore.
Deve funzionare interamente senza AI; quando l'utente la abilita, l'AI puo' preparare la prima
versione da input reali approvati e puo' assistere le modifiche successive. In entrambi i casi usa
le stesse operazioni dell'editor, propone cambiamenti revisionabili e non inventa dati della
macchina. Il progetto React resta una copia di lavoro protetta e modificabile senza conoscere React.

L'utente deve poter:

- vedere subito la pagina eseguita, non soltanto l'albero dei file;
- navigare il pannello in modalita' Prova e modificarlo in modalita' Modifica;
- selezionare, spostare, ridimensionare, ruotare, duplicare ed eliminare elementi; impostare lo z-index;
- usare selezione multipla, snap, guide e allineamenti come in un editor grafico;
- modificare tutte le proprieta' utili nell'Inspector, compresi eventi, destinazione pagina,
  evidenziazione, immagine, geometria, font, colori e dimensioni;
- importare immagini specifiche della macchina e posizionare sopra aree cliccabili o evidenziate;
- disegnare col mouse una zona da evidenziare al click di un pulsante, senza dover creare prima
  un elemento separato per quella zona;
- collegare variabili PLC reali e configurare le dynamization, senza esporre i binding React come
  concetto principale;
- annullare e ripristinare azioni in modo affidabile e salvare soltanto la copia di lavoro.

## Connessioni PLC configurabili senza modificare JSON a mano

`Pannello → Connessioni PLC` configura MQTT e OPC UA scalare nel servizio Node e il client same-origin del pannello:
broker/server, mapping del catalogo tag reale, valore/qualità/timestamp, freshness, QoS o nodi,
timeout, riferimenti ambiente e percorsi TLS/PKI. Gateway, connessione, accesso tag e mapping comando sono gate
separati per le scritture. Non esistono credenziali inline, connessioni avviate dal dialogo o
conferme PLC simulate; il client OPC UA scalare verifica trust, Namespace URI, tipi e permessi; browsing, array/UDT e metodi restano da implementare. Mapping paginati e ricerca dei tag limitano
il DOM anche per cataloghi grandi. Il modulo puro di validazione è comune a editor, driver e
gateway, e viene copiato nello standard generato.

Flusso comune: catalogo tag + profili validati → servizio Node → driver MQTT/OPC UA →
campioni acquisiti → gateway loopback autenticato → proxy same-origin → HMI/IR.
Il browser non contiene credenziali PLC. Il gateway è il confine trasporto, non RBAC
operatore o interblocco: una ricevuta di servizio non autorizza a inventare conferme.
Per OPC UA si usa Namespace URI invece di indici stabili presunti, subscription e
letture reali per verificare valori invariati, trust caricato all'avvio senza autoaccept.
La lettura periodica aumenta traffico ma evita di confondere keepalive con freschezza;
va dimensionata sulla CPU. Driver scalare e policy SHA256 riducono il primo perimetro;
browsing, UDT/array, metodi/allarmi e interoperabilità aziendale restano lavoro esplicito.

La persistenza confronta contenuto originale dei due cataloghi e del catalogo tag, root e
generazione del progetto. File mancanti e errori sono distinti; conflitti richiedono ricarica
esplicita, senza scarto automatico del draft. I cataloghi devono essere file regolari nella root,
non link o percorsi esterni. La root resta bloccata durante lettura/salvataggio. Le sostituzioni
sono atomiche per file, con ripristino su errori I/O: non è una transazione crash-atomica dei due
JSON né un lock fra processi esterni. Non scrive il catalogo tag e non usa recovery, undo JSX o
checkpoint per i draft. Il successo non avvia/riavvia il servizio o l'anteprima dell'utente.

Riferimenti funzionali, non compatibilità con formati o Runtime proprietari:
[impostazione broker MQTT Optix](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-3-5/contents-ditamap/creating-projects/iot/iot-tutorial/configure-an-application-as-an-mqtt-client/configure-the-message-broker-ip.html)
e [configurazione client OPC UA Unified](https://docs.tia.siemens.cloud/r/en-us/v20/opc-ua-open-platform-communications-rt-unified/wincc-unified-opc-ua-client-rt-unified).

## Pubblica pannello — proposta da definire con l'utente

Richiesta del 05/10/2026: un passaggio finale guidato “Pubblica pannello”, dopo aver completato
l'editing. Domande candidate: MQTT oppure OPC UA secondo le interfacce della CPU, destinazione,
ambiente di servizio, connessioni e formato di consegna (sorgenti, eseguibile, installer o altro).
Packaging, piattaforme target e automatismi vanno discussi con l'utente prima di implementarli.
Non è già disponibile e non abilita OPC UA, deployment o scritture per il solo fatto di
esportare. Dovrà includere validazione, versioni/lockfile, licenze/notice, segreti separati,
sicurezza e collaudo industriale; il commit/push del codice resta distinto dalla pubblicazione
di un pannello sull'impianto.

## Zone di evidenziazione scelte col mouse

Selezionare il pulsante, aprire **Evidenzia una parte** nell'Inspector e premere **Disegna zona**.
La forma **Rettangolo** usa un trascinamento; **Contorno a punti** usa clic successivi e si chiude
con Invio o **Fine**. Backspace/Delete toglie l'ultimo punto, Esc annulla. Durante il disegno
compare una guida sul canvas e gli oggetti sottostanti non vengono selezionati, spostati o attivati.
Resta disponibile **Scegli la parte** per collegare un elemento intero come prima.

La zona e' salvata nel JSX del pulsante, insieme a colore, spessore e collegamento alla foto,
al disegno SVG o al contenitore scelto. **Ridisegna zona** sostituisce il contorno senza annidare
il vecchio click; **Applica modifiche** conserva la geometria cambiando colore/spessore.
**Rimuovi interazione** ripristina il click originale, che continua a essere eseguito una sola volta.
In **Usa il pannello**, il pulsante accende/spegne un overlay trasparente non cliccabile senza
riscrivere lo stile della foto. Le normali regole CSS generali per SVG non devono aggiungere
sfondi/margini all'overlay o nasconderne il contorno. Ogni riferimento mantiene una zona attiva:
cliccando un altro pulsante della stessa foto si passa subito alla sua zona, senza un click
intermedio per spegnere quella precedente. Resta selezionato il pulsante realmente modificato
anche quando piu' targhette condividono l'identificatore della foto.
L'handler salvato e' autonomo: funziona anche fuori dall'editor,
senza modulo Framecraft da installare nel pannello e senza abilitare simulazione o connessioni PLC.

Foto/contenitori usano coordinate relative al loro rettangolo visualizzato; SVG usa coordinate
native e la matrice `getScreenCTM`. Il disegno tiene conto dello zoom del canvas; il Runtime
segue spostamento, scroll e ridimensionamento del riferimento e rimuove l'overlay se esso sparisce.
Non e' un riconoscimento automatico delle parti della macchina. Per foto ritagliate/letterboxed
o trasformazioni CSS ruotate annidate non e' garantito l'ancoraggio al pixel originale: ridisegnare
la zona dopo aver definito il layout. L'SVG usa invece la sua matrice effettiva.

Disegni nulli/non validi e copie generate da liste sono rifiutati; i limiti dei template condivisi
e delle cartelle autorizzate restano applicati. Un buffer diverso dal file su disco non viene
sovrascritto: va salvato prima del disegno. Esc, cambio pagina, passaggio a Usa, reload o perdita
del gesto invalidano la scelta; messaggi di richieste vecchie o di altre finestre non la completano.
Nello stesso file il collegamento e' un solo Annulla/Ripristina. Se foto e pulsante sono in due
file distinti la cronologia contiene due passi; non e' ancora una transazione atomica multifile
ne' sostituisce il CAS completo previsto per il command layer.

## Selezione e operazioni asincrone

Il clic dell'utente (`framecraft:select`) e la risposta a una richiesta dell'editor
(`framecraft:selection-response`) sono messaggi diversi. Una risposta aggiorna geometria e
proprieta' renderizzate, non avvia un'altra selezione o lettura del sorgente. Il protocollo 2
identifica richiesta e versione della selezione; le risposte obsolete vengono ignorate e i
tentativi di conferma si fermano quando arriva quella valida.

L'ultimo intento dell'utente possiede le letture asincrone. Documento, progetto, modalita' e
copia renderizzata vengono verificati prima delle modifiche; una lettura o un comando superato
non deve riportare la selezione indietro. Anche i comandi di gruppo si interrompono senza
ripristinare informazioni del gruppo sopra un clic nuovo. Una scrittura gia' iniziata conserva
la propria cronologia, ma non cancella la nuova selezione o il flag dirty di un buffer successivo.

Il codice non salvato viene validato e salvato prima di selezionare un elemento di un altro file.
Se il salvataggio fallisce, il buffer resta aperto e non viene sostituito. Offset obsoleti
dell'anteprima non autorizzano una rilettura da disco sopra un buffer dirty. Gli spostamenti con
le frecce ancora in debounce vengono annullati e ripristinati se cambia la selezione o si passa
a Naviga. Queste guardie sono gia' implementate; non sostituiscono il command layer completo
previsto dalla roadmap AI.

Drag diretto e maniglie usano l'ultima posizione del puntatore, con un aggiornamento per frame:
nessuna riscrittura del sorgente durante il movimento. Il rilascio scarica l'ultima posizione;
Escape, cancel/perdita della cattura e cambio modalità ripristinano il gesto senza una nuova voce
in cronologia. Le transizioni CSS e will-change sono sospesi/aggiunti soltanto durante il gesto e
poi ripristinati, priorità comprese. Gli oggetti del gruppo non vengono riscansionati a ogni evento;
i loro riferimenti AST vengono aggiornati dopo le nostre riscritture, comprese istanze ripetute.
Non si rimappano così offset esterni obsoleti o nodi provenienti da un albero JSX differente.

## Avvio e recupero dell'anteprima

Ogni avvio Vite ha un identificativo distinto, condiviso da comando, log e notifica di uscita.
Il callback del canale Tauri viene preparato prima della richiesta nativa: anche un'uscita fra
readiness e risposta del comando viene gestita. Log, risposte e notifiche di una sessione superata
non possono cambiare quella nuova. La chiusura inattesa, anche con codice zero, elimina soltanto
l'URL dell'anteprima e mostra l'errore con le azioni di recupero; documento, buffer dirty,
selezione, cronologia e route rimangono. Un messaggio tardivo di pagina pronta non nasconde l'errore.

Quando disponibile, il launcher esegue direttamente Node con l'entry point Vite installato,
invece di sorvegliare soltanto lo shim `vite.cmd`. Il processo posseduto viene controllato ogni
250 ms con `try_wait`; stop volontario e sostituzione non sono crash. Il recupero e' esplicito:
non vengono riavviati automaticamente il server o i comandi del pannello. Le operazioni native
di avvio lavorano su un worker bloccante separato dalla finestra Tauri.

Durante l'avvio la schermata temporanea mostra stato e output reale del caricamento, senza
comandi per interrompere il server o nuove toolbar permanenti. Il titolo indica l'avvio
dell'anteprima, non il nome dello strumento tecnico. La cancellazione resta nella gestione
interna del ciclo di vita: una generazione nativa invalida il lavoro precedente prima di stop,
chiusura o cambio progetto:
un avvio cancellato non puo' installare il proprio processo, fermare quello nuovo o concedere
accesso a sorgenti esterne dopo la chiusura. Una nuova analisi della stessa root conserva invece
i permessi dei template collegati.

Anche la preparazione delle dipendenze e' cancellabile; il probe del package manager ha un limite
di 10 secondi e lo scarico dei thread di output attende al massimo 500 ms. Le sottoscrizioni e i
timer dell'App vengono rilasciati anche se la registrazione asincrona termina dopo lo smontaggio.
L'avvio richiede una risposta HTTP minima, non prova l'identita' del server su una porta contesa.
Il monitor verifica l'uscita del processo, non la salute HTTP continua di un processo bloccato.
Collaudo della finestra desktop, packaging e prove prolungate su progetti reali restano necessari;
questo recupero dell'editor non e' un deployment industriale.

Contratti di riferimento: [canali Tauri](https://v2.tauri.app/develop/calling-frontend/#channels),
[comandi asincroni Tauri](https://v2.tauri.app/develop/calling-rust/#async-commands),
[worker spawn_blocking](https://docs.rs/tauri/latest/tauri/async_runtime/fn.spawn_blocking.html) e
[stato non bloccante del processo Rust](https://doc.rust-lang.org/std/process/struct.Child.html#method.try_wait).

## Runtime autonomo e collegamento PLC

Chiarimento del 30 settembre 2026: i pannelli generati **non vengono importati o eseguiti in
TIA Portal, WinCC Runtime, Studio 5000 o FactoryTalk Optix Runtime**. Sono HMI React autonomi;
Unified e Optix sono riferimenti funzionali, non piattaforme di destinazione.

Il collegamento alla CPU fisica o al PLC virtuale deve usare **OPC UA oppure MQTT** in base alle
interfacce realmente disponibili, non soltanto alla marca del PLC. L'editor mantiene mapping,
tipi, accesso e configurazione; un servizio Runtime separato gestirà trasporto, autenticazione,
certificati, letture/scritture, sottoscrizioni, timestamp, qualità, riconnessione ed errori.
Il browser del pannello non deve contenere segreti.

Il collegamento industriale resta **parziale**: driver MQTT Node e gateway HTTP alimentano il
browser con letture tipizzate, qualità e timestamp; i comandi autorizzati passano al servizio
senza aggiornamento ottimistico o replay automatico. Sono collaudati su broker TCP locale,
HTTP e sorgenti generati, non su CPU reali/TLS. La configurazione grafica è disponibile in
`Pannello → Connessioni PLC`; gli script evento, moduli, timer e Scheduler ora sospendono la IR
fino all'esito del trasporto senza rigiocare gli effetti. Le letture provengono dai campioni
acquisiti, le scritture non aggiornano la cache. Cambio contesto/stop impediscono ulteriori
effetti; un invio interrotto resta incerto e non viene ritentato. `hmiWriteWait`, lettura CPU
forzata, QCD/audit operatore e bit atomici non disponibili non vengono simulati come riusciti.
Mancano browsing/array/UDT/metodi OPC UA, conferme applicative PLC, autenticazione/RBAC/audit server e payload
avanzati. Una ricevuta MQTT o del servizio Write OPC UA non è una conferma PLC. Servizio, client e interprete vengono
copiati dallo standard, con connessioni disabilitate inizialmente. Vedi `runtime/README.md`.
Importare sorgenti vendor può aiutare la migrazione, ma round-trip verso IDE, licenze/token vendor
e deploy sui loro Runtime non sono requisiti del prodotto.

## Interfaccia intuitiva e barra comandi

La quantità di funzioni WinCC e Optix non deve trasformarsi in una fila di icone indecifrabili. La
barra alta è il punto stabile per le categorie principali: **File**, **Modifica**, **Visualizza**,
**Pannello** e **Aiuto**; **AI** sarà aggiunta soltanto quando configurata. Ogni categoria apre un menu corto con nomi e
descrizioni concrete: per esempio File contiene apri/cambia progetto, salva, salva con nome o
esporta; Visualizza contiene tela, codice, disposizione e formato pannello.

Per scelta dell'utente i comandi, incluso **Prova pannello**, restano nei menu a comparsa; il canvas
non ha toolbar permanente superiore o inferiore. Fa eccezione lo switch **Modifica / Usa il pannello**,
sempre visibile nella barra superiore, fuori dai menu, con testo, icona e spunta della scelta attiva.
Modifica consente selezione e gesti di disegno; Usa il pannello lascia interagire con pulsanti,
campi e navigazione nel canvas. Riusa la modalità esistente, non apre il Runtime separato e non
abilita automaticamente la simulazione o le connessioni PLC. Il cambio chiude il menu aperto e
non salva, riavvia Vite, chiude il progetto o altera documento e cronologia; passando a Usa
la selezione singola viene tolta come già previsto dall'editor. I due pulsanti nativi hanno
target minimo di 44 px, stato `aria-pressed`, focus visibile e supporto Tab/Spazio/Invio.
La barra può andare a capo sulle finestre strette, senza nascondere etichette o sovrapporre il canvas.
Visualizza include aggiorna anteprima, riavvia
Vite, ricostruisci cache con `--force` e log di avvio. Il riavvio non riapre il progetto né perde
buffer, selezione o cronologia; le operazioni concorrenti sono serializzate. Un errore mostra
azioni temporanee di recupero, senza rendere inaccessibili i sorgenti.
Le opzioni tecniche rare usano divulgazione progressiva: prima il risultato comprensibile,
poi i dettagli. Ogni controllo ha etichetta, focus da tastiera, stato visibile e messaggio vicino
all'errore. L'editor ha una sola interfaccia, senza selettore semplice/completa: posizione,
dimensioni, z-index, rotazione in gradi e aspetto sono subito visibili; attributi, layout CSS, effetti e informazioni restano
in sezioni espandibili. Dettagli delle azioni, sorgenti delle dinamizzazioni e contorni SVG precisi
sono sempre accessibili, anche nella selezione multipla dove applicabile. Disegno, Affiancati e
Codice sono viste disponibili nel menu Visualizza, non profili che limitano le funzioni.
In Codice e Affiancati, la stessa barra superiore mostra anche **Torna alla grafica**: comando
contestuale con testo esplicito, hit area minima di 44 px e focus visibile, che scompare in Disegno.
Chiude il menu e cambia soltanto la vista, senza salvare, riavviare Vite o modificare documento,
dirty, selezione e cronologia. Il codice non salvato resta nel buffer; questo non promette che
l'anteprima su disco mostri già quelle modifiche. Prova pannello resta soltanto nella tendina.
La vecchia preferenza `inspectorMode` viene ignorata al caricamento e non è più presente nello
store; al salvataggio delle preferenze viene eliminata senza perdere formato, disposizione,
dimensione dell'interfaccia, larghezze dei pannelli o griglia. Disposizione dei pannelli e
dimensione dell'interfaccia restano preferenze distinte, senza limitare le funzioni disponibili.

La voce AI non deve comparire come passaggio obbligatorio: quando nessun provider è configurato,
l'editor manuale mantiene tutte le funzioni e tutti i menu.

## Ricaricamenti dell'editor durante lo sviluppo

Il progetto aperto non è soltanto una schermata: store, buffer dirty, cronologia e operazioni
pendenti devono sopravvivere agli aggiornamenti del frontend. Con HMR lo store e i contatori
restano nei dati del modulo, mentre le azioni vengono aggiornate. Una risposta asincrona
superata non può cambiare il nuovo progetto o documento. Non si usa self-accept per impedire
la propagazione degli aggiornamenti ai moduli dipendenti.

Nel contesto Vite di sviluppo, prima del full reload viene conservato un checkpoint in
sessionStorage, senza AST, credenziali configurate, permessi, valori simulati o sessioni/URL
dell'anteprima. Il recupero automatico è limitato a 10 minuti e richiede una sessione desktop
ancora aperta, verificata due volte tramite `get_editor_session`. La query nativa è in sola
lettura, controlla il processo effettivamente posseduto e non apre cartelle, concede permessi,
avvia watcher o server. I percorsi della bozza devono essere già autorizzati dal backend.

Il testo dirty viene riparsato, quello pulito riletto dal disco; un errore di parsing conserva
la bozza nella vista codice. Dopo il full reload si torna in Modifica, con simulazione spenta,
senza salvataggi automatici o replay di comandi PLC. Il listener globale delle uscite impedisce
che una risposta tardiva riporti in vita una sessione dell'anteprima terminata. Un recupero
fallito mostra soltanto una schermata temporanea con bozza copiabile, retry quando valido e
scarto esplicito con conferma se dirty; nessuna toolbar permanente.

Un errore di scrittura del checkpoint ferma il full reload del client Vite installato,
verificato sul notifier di Vite 7.3.6. Il fallback beforeunload e il collaudo nella finestra
desktop restano da verificare manualmente. La protezione richiede il backend aggiornato;
un comando non disponibile conserva la bozza e segnala il problema, senza forzare un'apertura.
Il checkpoint sessionStorage non è il backup persistente: sopravvive al reload ma termina
con la finestra. Il deposito locale qui sotto copre separatamente le copie completate prima
di crash/riavvio completo, anche senza HMR. Il collaudo del WebView e del pacchetto desktop
rimane distinto dalle prove dello store compilato e dei processi nativi.

Contratti di riferimento: [dati e ciclo di vita HMR Vite](https://vite.dev/guide/api-hmr) e
[sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

## Deposito locale delle bozze

Il backup vive in `app_local_data_dir()/editor-drafts`, non nei sorgenti, ed è disponibile
anche nel frontend compilato senza HMR. Ogni esecuzione nativa conserva il proprio record;
la lettura iniziale offre quello più recente senza riaprire o autorizzare cartelle. Documento,
dirty, cronologia, pagine, route e vista usano lo stesso checkpoint esplicito del reload.
Il record conserva anche una base del testo su disco per il confronto; non include AST,
azioni, URL/sessioni, valori PLC, permessi o configurazione account. I sorgenti possono
comunque contenere segreti inseriti dall'autore: il deposito è testo locale non cifrato.

Le modifiche sono accorpate con 500 ms di debounce, avvio del backup entro 3 secondi di
digitazione continua e richieste serializzate. Il backend ricontrolla progetto/generazione
e percorsi autorizzati, sincronizza il file temporaneo e sostituisce il record atomicamente.
Revisioni obsolete, record corrotti o troppo grandi non sostituiscono l'ultima copia valida.
Limiti: 16 MiB per record, 1000 snapshot totali, 5000 pagine, 200 bozze enumerate. Lo scarto
controlla identificativo e revisione; non riceve un percorso arbitrario dal frontend.

Il recupero persistente è sempre esplicito e indica root/data. Riapre quella root tramite
l'analisi ordinaria, senza nuova copia di lavoro, avvio dell'anteprima o salvataggio dei
sorgenti. Le autorizzazioni restano quelle del backend, non del record. Un file esterno
non più autorizzato resta nella bozza consultabile: non viene concesso automaticamente.
Quando il disco differisce dalla base, entrambe le versioni sono consultabili e l'utente
sceglie quale aprire nell'editor. Una nuova differenza rilevata richiede un'altra scelta.
La versione disco scarta dirty/vecchia cronologia; la bozza recuperata resta dirty fino a
un salvataggio esplicito. Prima di consumare il vecchio record viene conservata la nuova copia.

Un errore del backup mostra un avviso temporaneo con retry, non una toolbar permanente.
La riapertura torna in Modifica con simulazione spenta, senza replay di comandi PLC.
Il backup non promette gli ultimi caratteri prima di un arresto improvviso: beforeunload
è best-effort e il tempo di completamento dipende da IPC/disco. Non è protezione da guasti
disco o interruzioni di alimentazione, né un CAS generale del salvataggio sorgente.
Prove multiprocesso verificano una copia completa dopo kill del processo scrittore;
GUI/packaging, flush alla chiusura e gestione/retention delle copie restano da collaudare/completare.

Contratti primari: [directory locali Tauri](https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html#method.app_local_data_dir)
e [sostituzione atomica tempfile](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html#method.persist).

## Recupero guidato e messaggi dell'editor

La schermata di recupero mostra progetto, pagina, data della copia e stato delle modifiche.
Il codice è consultabile in sola lettura nei dettagli per assistenza, non viene presentato
come anteprima grafica e non va letto per riprendere il lavoro. Il pulsante di ritorno che
scarta il record lo dichiara esplicitamente; la conferma spiega che elimina le modifiche non
salvate della bozza senza modificare i file già salvati. Nel conflitto sono distinti effetti
della scelta bozza e disco, inclusa la perdita della vecchia cronologia scegliendo il disco.
Il recupero non avvia né salva: l'anteprima legge il disco, non il buffer dirty della bozza.

`editorMessages.ts` è uno strato puro di presentazione: spiega i casi riconosciuti, separa
azione e testo tecnico e rimuove sequenze ANSI/OSC dalla visualizzazione. Non modifica errori
originali, payload di recupero, autorizzazioni o versioni; non deduce una causa per errori
sconosciuti e distingue un avviso di compatibilità da un avvio realmente fallito. I dettagli
sono locali e possono contenere dati di progetto: non sono una redazione automatica dei segreti.

Diagnostica: ricerca su testo originale ripulito e spiegazione, filtri per origine/problemi,
righe espandibili e raggruppamento visuale delle ripetizioni consecutive. Il limite esistente
di 300 messaggi per output dell'anteprima non cambia; i record dentro il limite restano separati.
Colori terminale non nascondono più gli errori nella classificazione; un nome tag come
`Motor.Error=0` non è un errore solo per la presenza di `.Error`. La cancellazione pulisce
l'elenco, non file o bozze. Gli errori nei toast restano fino alla chiusura dell'utente o a un
nuovo messaggio non informativo e offrono accesso alla diagnostica; i successi restano temporanei.

Il collaudo UI usa fixture sintetiche e browser headless isolato, non la finestra desktop
dell'utente o i suoi file. Non sostituisce il collaudo recovery nel pacchetto distribuito.

## Contesti e variabili degli script

Il modello di riferimento distingue due contesti per pagina, eventi e dinamizzazioni, e un
contesto Scheduler condiviso dalle operazioni pianificate. Ogni contesto ha copie indipendenti
dei namespace dei moduli. Fonti: [contesti di esecuzione Unified V21](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/scripts-editor-rt-unified/script-and-execution-context-rt-unified)
e [definizioni globali V21](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/scripts-editor-rt-unified/creating-a-global-definition-in-a-local-script-rt-unified).

Framecraft applica questo isolamento nel suo interprete IR, in anteprima e nel Runtime React
generato. Il catalogo versione 1 contiene definizioni opzionali `globalDefinition` per moduli
e contesti locali, `schedulerDefinition` per lo Scheduler. Il pannello Moduli JavaScript
espone campi espandibili con durata ed errori espliciti; il salvataggio ricompila il sorgente.
Sono ammesse dichiarazioni supportate dall'IR, non azioni operative negli inizializzatori.
Non si usa `eval` e il Runtime generato non incorpora il parser sorgente.

L'inizializzazione avviene una volta per contesto, usando i valori correnti dei tag. Gli errori
impediscono le azioni dipendenti; le variabili conservano il valore fra le chiamate, rispettano
`const` e non vengono sovrascritte da parametri o variabili locali omonime. Lo stato non viene
serializzato nel catalogo: ricaricare la pagina, cambiare catalogo o riavviare il Runtime crea
nuovi contesti. Le variabili senza `export` restano private: gli altri moduli non possono leggerle
tramite il namespace, ma possono chiamare le funzioni che il proprietario espone.

La definizione di un modulo globale ammette `export let count = 0;`, `export const step = 1;`
e `export var enabled = true;`, oppure export nominati come `export { count as current };`.
Gli script leggono `Modules.Counter.count` (o `Modules.Counter.current` nell'esempio con alias).
E' un binding live, non una copia: una funzione del modulo che esegue `count = count + step;`
aggiorna le letture successive nello stesso contesto. Assegnamenti e incrementi sul namespace
importato sono rifiutati; le costanti restano non riassegnabili anche nel modulo proprietario.
Questo segue il modello dei [moduli globali Unified](https://docs.tia.siemens.cloud/r/en-us/v21/runtime-scripting-rt-unified/notes-on-creating-scripts-rt-unified/global-modules-rt-unified)
e degli export descritti nei [Tips Scripting Siemens](https://support.industry.siemens.com/cs/attachments/109758536/109758536_Unified_TipsScripting_V30_en.pdf).

La sola lettura riguarda il binding, non congela un oggetto Tag o TagSet esportato: le sue API
restano disponibili con le restrizioni del Runtime. Non sostituisce autorizzazioni PLC/RBAC.
Il catalogo mantiene versione 1 e salva nella IR la mappa opzionale `exports: [{ name, local }]`;
il sorgente viene ricompilato in ingresso e le variabili Runtime non sono mai serializzate.
Il pannello Moduli JavaScript elenca solo i nomi realmente esportati, con alias e indicazione
costante/variabile, e spiega come accedervi. Definizioni locali, Scheduler e corpi delle funzioni
non ammettono dichiarazioni `export`; non sono supportati re-export da file esterni o default export.
Le copie eventi/dinamizzazioni/pagine restano indipendenti: per condividere stato macchina fra
pagine occorrono tag o altri servizi Runtime, non una variabile privata del contesto script.

I timer inline catturano per riferimento le variabili della chiamata; i locali dichiarati nel
callback sono nuovi a ogni esecuzione. I contesti scaduti non possono riattivare timer o comandi.
Nel cambio pagina, `Unloaded` conserva il vecchio contesto fino alla fine delle azioni gia'
accodate; il suo rilascio non tocca un nuovo caricamento della stessa route. Lo stop invalida
anche le azioni ancora in coda, senza applicare risultati tardivi. Quando non sono configurati
trigger manuali, le dinamizzazioni ricavano le dipendenze tag dalla propria IR, dalle definizioni
globali e dalle funzioni dei moduli; la cache viene invalidata al cambio contesto pagina.

Anche i campi dei valori di prova PLC usano l'ispezione collegata al catalogo: includono tag di
export letti dagli script, inizializzatori del contesto corrente e operazioni Scheduler abilitate.
Non scambiano i nomi delle variabili JavaScript per tag PLC e non includono definizioni locali
di altre pagine o task disabilitati. Il controllo del pannello verifica
anche tag di inizializzazione e dipendenze delle funzioni, senza fidarsi soltanto dei vecchi
metadati salvati nel catalogo.

Gli script supportano array e oggetti annidati nella IR, nelle definizioni globali e nello
Scheduler. Esempio: `export const cfg = { speed: 10, steps: [10, 20] };`. I membri si leggono e
modificano con `cfg.steps[0]`; parametri e risultati delle funzioni conservano il riferimento.
`const` e il namespace importato proteggono il binding, non congelano il contenuto dell'oggetto.
I dati restano isolati per contesto e non vengono serializzati nel catalogo.

Sono disponibili `push`, `pop`, `shift`, `unshift`, `indexOf`, `lastIndexOf`, `includes`, `slice`,
`join`, `toString`, `reverse`, `sort` lessicografico senza comparatore e `splice`, incluso il
caso senza argomenti. Le copie sono superficiali. `JSON.parse`/`JSON.stringify` e
`Object.keys`/`Object.values`/`Object.entries` operano sui dati supportati; il JSON non contiene
riferimenti Tag, TagSet o popup. Un risultato per un tag PLC o una proprietà deve essere scalare:
scegliere un membro oppure convertire i dati puri in JSON, non passare l'oggetto direttamente.
Gli esempi Siemens di array sono nei [Tips Scripting](https://support.industry.siemens.com/cs/attachments/109758536/109758536_Unified_TipsScripting_V30_en.pdf);
la semantica di [splice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice)
chiarisce rimozione, inserimento e risultato separato.

L'ispezione segue riferimenti annidati, alias, indici dinamici e possibili valori dopo modifiche
degli array o Add ai TagSet selezionabili. Lavora su copie simboliche, senza alterare la IR
salvata. In presenza di più possibilità include conservativamente i tag candidati: può
rivalutare una proprietà più spesso, senza trasformare normali stringhe di configurazione in
tag. Dipendenze, lista variabili e validazione usano lo stesso modello anche nel Runtime generato.
I nomi ottenuti da dati esterni, per esempio un JSON letto dal PLC, non sono ricostruibili
automaticamente dal sorgente: occorrono catalogo e trigger espliciti. L'analisi di flusso completa
fra moduli e contesti rimane da estendere, non è certificata da questa tranche.

La sandbox impedisce cicli, API host, getter/setter e accesso a prototipi anche tramite chiavi
calcolate o JSON. Limiti: 1024 elementi/proprietà per raccolta, chiavi fino a 128 caratteri,
scansioni e conversioni fino a 32 livelli, testo/JSON fino a 20000 caratteri; rimangono i budget
di operazioni e tempo dell'interprete. Sono massimi, non una garanzia che un dato grande rientri
nel budget predefinito. Le estensioni degli array vengono riempite con null: undefined e sparse
array non hanno ancora la distinzione completa di JavaScript. Le azioni e le mutazioni vanno
nei corpi delle funzioni o nello script Update, non negli inizializzatori.
Questi dati di configurazione non implementano il trasporto di array/struct/UDT PLC: `WCU-TAG-04`
resta parziale e richiede contratti tipizzati e driver reali.

Il primo sottoinsieme dell'object model grafico usa riferimenti opachi con ID, mai oggetti DOM:
`item`, `Screen`, `Screen.Items(nome)`, `UI.ActiveScreen.Items(nome)` e `Faceplate.Items(nome)`.
I nomi vengono salvati come `data-hmi-name` dall'Inspector, con fallback all'id HTML. La ricerca
è esatta nella schermata o nell'istanza faceplate; nomi duplicati, assenti o contesti scaduti
producono un errore, senza selezionare un altro oggetto. Il contesto viene catturato all'arrivo
dell'evento e passa anche ai callback dei timer. La IR legge e assegna le proprietà dei riferimenti
tramite il gestore grafico, non tramite accesso DOM: `Name` è in sola lettura; `Left`/`Top`,
`Width`/`Height`, `Visible`/`Enabled`, `Text` e BackColor/ForeColor/BorderColor sono tipizzati.
Il testo è esposto solo quando individua un contenuto univoco; icone, nodi e listener vengono
conservati. I campi input non usano `Text` come scorciatoia per modificare `ProcessValue`.

Il punto 83 estende i riferimenti opachi con il solo percorso autorizzato `Font`.
La IR ricorsiva già esistente esegue `item.Font.Size` e alias, riferimenti restituiti dai moduli,
dati annidati, timer e callback Promise/await. Il riferimento contiene ID e percorso, mai DOM;
il ponte trasporta solo comandi scalari `Font.NomeProprietà` e snapshot. `Font` non è sostituibile.
`Font.Name` è una famiglia CSS scrivibile, distinta da `item.Name` readonly; `Size` è un Float
finito non negativo in DIU, rappresentati come CSS px indipendenti dallo zoom, non punti né
pixel fisici. `Italic`/`Underline` sono Boolean, `Weight` usa 0/300/400/600/700 e `StrikeOut`
usa 0/1, non Boolean. Nel mapping web `Weight=0` diventa CSS normal: è un adattamento esplicito,
non una certificazione della resa Siemens. La famiglia letta è la prima famiglia configurata,
non una verifica della disponibilità dei glifi o del file font sul dispositivo.

Font viene esposto per un testo univoco, anche una label annidata con stili propri, oppure per
input/textarea/select. Non modifica valore, opzioni o binding PLC, e non viene attribuito a
immagini, SVG o più testi ambigui. Le decorazioni vengono raccolte dalla label fino al suo
contenitore HMI: togliere underline/line-through non lascia attiva la linea sul contenitore.
Il registro reversibile conserva anche il nodo destinatario dello stile, shorthand, priorità
CSS, altre decorazioni e aggiornamenti esterni. Non vengono modificati antenati fuori dall'oggetto,
né scaricati o inclusi font. Proprietà base non risolvibili generano una diagnostica in lettura;
è comunque possibile assegnare una proprietà esplicita. Le verifiche WebView/grafica reale restano
necessarie, specialmente per font installati e cascata CSS esterna al controllo.

Gli override sono temporanei: stesso helper nel ponte Vite e nel Runtime standard generato,
lettura immediata dopo la scrittura, proprietà base ripristinate uscendo dalla prova e contesti
invalidati. Sospensione/ripresa annidabile compone script, dinamiche, lampeggio e traduzioni;
gli stili estranei o modificati esternamente non vengono ripristinati a un valore vecchio.
`Enabled` e `Visible` sono rispettati anche per tastiera, discendenti ed eventi custom durante
la prova; la protezione non intercetta la selezione del designer in modifica.

Le geometrie non vengono moltiplicate per lo zoom dell'editor. I colori sono UInt32 ARGB:
se un colore CSS di sistema non è risolvibile, la lettura segnala il problema senza inventare
un valore; la scrittura RGB rimane disponibile. Nell'anteprima i messaggi `framecraft:screen-items`
aggiornano solo gli snapshot: non richiedono una rivalutazione delle dinamiche quando gli script
stessi modificano una proprietà. Eventi e raccolte forzate mantengono gli snapshot aggiornati.
Proprietà e catture grafiche non sono ammesse negli inizializzatori globali.

Questa tranche non aggiunge scritture PLC e non è l'object model Unified completo: restano
proprietà/metodi specifici dei controlli, Font di Caption/Title/assi e altri oggetti come Margin, collezioni complete,
bounding box/trasformazioni complete, contesti lifecycle e `ProcessValue` col trasporto tipizzato
reale. I punti 82/83 di `LAVORO.md` e `WCU-EVT-10` separano queste attività dall'API comune e Font.

`PropertyFlashing` controlla BackColor, ForeColor e BorderColor; supporta RGB/ARGB, i tre rate
Slow/Medium/Fast e i colori dichiarativi quando omessi. Senza due colori non inventa una coppia:
restituisce false e segnala il problema. Lo stop di una proprietà non ferma le altre e prevale
sul suo lampeggio dichiarativo. Gli helper `scripts/hmi-property-flashing.mjs` sono condivisi dal
ponte dell'anteprima e dal Runtime generato, preservano colori base e animazioni preesistenti e
invalidano i contesti al cambio pagina/uscita dalla prova. La prova funziona anche senza valori
PLC simulati. Non aggiunge scritture PLC, eval o accesso host; le API colore specifiche degli
altri controlli restano da coprire. Tranche e verifiche sono ai punti 79 e 82 di `LAVORO.md`.

Non e' un motore JavaScript completo: restano classi, spread e funzioni come valori, closure generiche,
scoping di blocco/hoisting completo e librerie versionate. L'isolamento completo dei contesti
JavaScript per istanza faceplate e lo Scheduler server industriale richiedono altro lavoro.
Il trasporto MQTT/OPC UA è integrato nelle continuazioni della IR, non equivale a un motore JavaScript
completo o alla conferma PLC. Stato e verifiche sono in `LAVORO.md`, punti 71, 74, 76 e 91;
`WCU-EVT-05/07` rimangono parziali e non certificano un HMI collegato alla macchina.

Il plugin desktop e i tre helper vengono mappati esplicitamente in `$RESOURCE/scripts`, dove
il backend li cerca. La regressione usa il resolver risorse Tauri reale; sono stati controllati
anche i file copiati da tauri-build. Non sostituisce il collaudo dell'installer senza checkout, Node e
dipendenze Babel disponibili. Stato e limiti sono al punto 81 di `LAVORO.md`.

## AI facoltativa

Esistono tre percorsi equivalenti: lavoro completamente manuale, generazione iniziale assistita e
assistenza facoltativa durante le modifiche. Il progetto non cambia formato quando si passa da un
percorso all'altro. L'AI non dispone di scorciatoie private: usa lo stesso command layer di canvas,
Inspector e operazioni massive, quindi validazione, cronologia e undo restano identici.

Tag, allarmi, interlock, soglie, ricette e autorizzazioni possono essere generati soltanto quando
derivano da cataloghi e mapping approvati. Se un'informazione critica manca, la proposta deve
lasciare un elemento configurabile o chiedere conferma. La roadmap completa è in
`AI-FRAMECRAFT-ROADMAP.md`.

## Produzione, sicurezza e licenze

Il prodotto deve essere usato in produzione: sviluppo e simulazione non bastano a dichiararlo
pronto. Le release richiedono test su CPU fisica/virtuale, TLS e trust, autorizzazioni server,
interlock lato PLC, conferme dei comandi, audit/storage persistenti, deployment gestito,
backup/recovery e versioni supportate. Nessuna credenziale nel bundle e nessun `Vite dev` esposto
come server industriale. Il token del gateway identifica la stazione/proxy, non un operatore.

`npm run check:licenses` produce un inventario offline npm/Cargo del target host e lascia sempre
`releaseApproved: false`: SPDX non approva obblighi, notice o diritti su immagini/font/export.
La licenza del prodotto resta una decisione del titolare. Le verifiche e i blocchi correnti sono
registrati in `LICENZE-E-PRODUZIONE.md`; provider AI e asset restano soggetti agli stessi controlli.

## Separazione delle responsabilita'

- **Framecraft**: editor desktop, anteprima Vite, analisi AST, selezione canvas, Inspector, palette,
  pagine, variabili PLC, template, command layer, validazione e salvataggio della copia.
- **AI facoltativa**: pianifica e propone operazioni Framecraft; non possiede un secondo formato e
  non è richiesta per aprire, modificare, validare o salvare un progetto.
- **Progetto pannello**: React/Vite della macchina aperto dall'utente. Non va modificato come esempio
  hard-coded dentro Framecraft; ogni operazione deve essere una funzione generale dell'editor.
- **Standard HMI**: regole, misure, tipi di oggetto, numerazione pagine, menu e comportamento comune.
- **FotoStandardManu**: verita' visiva per colori, ingombri, gerarchia e composizione delle schermate.
- **Export JSON in `standard/`**: verita' strutturale per nomi, coordinate, tipi HMI e dynamization.
- **Catalogo PLC del progetto**: unica fonte ammessa per i tag operativi della macchina.

## Modello di una schermata

Il guscio e il contenuto sono due livelli distinti. Il guscio desktop/mobile gestisce barre,
navigazione e finestre; la pagina e' una tela fissa 1280x694. Le foto desktop e mobile con lo stesso
nome sono normalmente lo stesso contenuto dentro due gusci differenti, non due pagine responsive.

Una pagina standard deve conservare:

- numero coerente con sezione e menu;
- route e destinazioni modificabili;
- geometria assoluta editabile sul canvas;
- tipi `data-hmi-type` riconoscibili dall'Inspector;
- `data-plc-variable` e `data-hmi-dynamizations` indipendenti dallo stile grafico;
- immagini sostituibili e non incorporate come asset di una macchina fittizia.

## Template e fedelta'

Un template non e' approvato perche' compila o perche' una regola assegna 160 schermate a una card.
Ci sono tre stati:

- `verified`: costruito da una foto precisa e tecnicamente parsabile;
- `partial`: parte visibile o comportamento noto, ma mancano dettagli per una replica completa;
- `missing`: base utile all'editing, senza evidenza visiva sufficiente; non va presentata come copia
  dello standard.

Quando due screenshot hanno strutture differenti servono due famiglie, anche se i nomi TIA sono
simili. Quando invece cambia solo la macchina o l'organo rappresentato, si riusa la stessa famiglia
con un'immagine sostituibile e dati diversi.

## Flusso di verifica

1. Collegare il template a una foto e alla schermata esportata.
2. Verificare struttura, misure, tavolozza e gerarchia contro la foto.
3. Generare JSX e farlo passare al parser e a TypeScript.
4. Aprire la pagina nel canvas e verificare selezione, drag, resize, Inspector e navigazione.
5. Confrontare il render con la foto alla risoluzione standard.
6. Aggiornare `FOTO-STANDARD.md` e `LAVORO.md` separando fatto, testato e ancora incerto.

Build e test dimostrano integrita' tecnica; non dimostrano da soli la fedelta' del pannello HMI.

## Cose da non inventare

- tag PLC, soglie, allarmi, interlock o comandi di una macchina;
- contenuto di popup o faceplate chiusi nelle foto;
- schermate Formati quando si vede soltanto il menu;
- KPI o pannelli dati dentro schermate che nella foto sono vuote;
- comportamento responsive del contenuto quando lo standard usa una tela fissa.
