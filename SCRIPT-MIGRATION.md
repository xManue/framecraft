# Analisi delle migrazioni delle librerie script

Stato dei punti 192–194: confronto, inventario, transazione e recupero sono collegati
alla procedura **Script → Librerie → Continua con il progetto**. Simboli, parametri e contesti
hanno scelte esplicite; ogni salvataggio richiede confronto e conferme. Non ci sono
aggiornamenti automatici delle librerie.

## Contratto del confronto

`planScriptProjectMigration(files, proposedCatalog, mappings, {scopes})` riceve un inventario
completo dei sorgenti e dei dati importabili, il catalogo proposto e le scelte esplicite delle
interfacce. Restituisce differenze prima/dopo, riferimenti e posizioni, programmi ricompilati,
versioni IR precedenti, problemi e impronta dell’intero inventario. Non accede al filesystem,
non esegue il codice analizzato e non invia richieste PLC o richieste esterne.

Il chiamante deve fornire tutti i file del progetto pertinenti. L’impronta include anche i file
non modificati: un import cambiato, una nuova pagina o una rimozione devono invalidare il piano.
Il motore puro non certifica che l’inventario ricevuto corrisponda al filesystem. Il backend
conserva il proprio inventario e un token legato a progetto/generazione: prima della scrittura
confronta nuovamente tutti i file, compresi import e sorgenti non modificati, e la configurazione
del servizio. Un secondo controllo dopo le scritture rileva cambiamenti concorrenti e avvia
il rollback. Le bozze aperte e l’arresto dell’anteprima sono controllati dall’editor.

`previewScriptProjectMigration` esegue il confronto in un worker eliminabile, con timeout di
15 secondi e AbortSignal. Le operazioni non continuano in background dopo annullamento,
risposta, errore o timeout. Fino a 1.200 file, 1 MB per file e 24 MB di testo nell’inventario;
script limitati a 20.000 caratteri e dati evento a 64 livelli.

## Scelte di interfaccia

Ogni funzione rimossa o con parametri cambiati richiede un collegamento esplicito a una funzione
esistente del nuovo catalogo. Ogni export pubblico rimosso richiede il nuovo export. Non vengono
inventati parametri: ciascun parametro nuovo usa un argomento precedente, uno scalare fisso o
`undefined`. Sono ammessi riordino, ripetizione e scarto degli argomenti precedenti.

Il motore riscrive i membri `Modules` reali tramite AST, mantenendo commenti e stringhe estranee.
Quando cambia la forma degli argomenti, un adattatore nel punto d’uso mantiene l’ordine di
valutazione degli argomenti originali, inclusi quelli scartati, e non ripete le espressioni.
Le prove coprono chiamate dirette, callback, closure restituite, `call/apply/bind`, receiver,
`name` e `length` nella VM Framecraft. Non è un’equivalenza generale fra funzioni JavaScript:
identità degli adattatori, stack, budget aggiuntivo e cambi di comportamento della nuova
implementazione devono rimanere parte della revisione. Nessun vecchio nome viene aggiunto
come funzione di compatibilità al catalogo della libreria.

## Pagine e dati condivisi

Vengono analizzati JSX/TSX/JS/TS e HTML, script inline JavaScript, attributi HMI,
`setAttribute` e `dataset`. I valori possono essere letterali, costanti locali, oggetti/array
statici, accessi statici, `JSON.stringify`, import/re-export relativi, JSON o testo `?raw`.
Gli attributi HTML sono letti con parse5 e riscritti conservando l’escaping.

Un valore importato viene modificato nel sorgente condiviso. Il motore controlla gli altri
importatori e blocca mutazioni, riferimenti ciclici/ambigui, alias destrutturati, passaggi a
funzioni sconosciute o altri usi non dimostrabilmente statici. Non valuta produttori dinamici,
non risolve alias Vite/npm e non segue dipendenze fuori dall’inventario. Un problema restituisce
zero modifiche: niente risultato parziale da applicare. Gli helper generati sono esclusi
solo se percorso e SHA-256 coincidono con il manifesto Runtime; le personalizzazioni restano
visibili all’analisi.

Catalogo globale, locale e Scheduler sono confrontati insieme alle pagine. Gli handler
modificati sono ricompilati; i programmi non toccati mantengono la loro IR precedente.
Il confronto riporta le versioni da ricompilare: passare a IR 9 può cambiare semantiche
precedenti, per esempio la forma delle eccezioni, e richiede revisione esplicita.

Le dipendenze delle dinamizzazioni sono ricalcolate sul catalogo già migrato, anche attraverso
funzioni intermedie quando il sorgente del binding resta uguale. Una sola modifica alle
dipendenze non ricompila il programma. Se esistono definizioni locali delle dinamizzazioni,
servono gli scope delle pagine: una stringa o una lista. La UI usa le route delle pagine note;
per i componenti condivisi chiede tutti i contesti mancanti e la conferma della loro completezza.
Un contesto selezionato non compilabile ferma tutto il piano. In assenza di certezza il confronto si ferma.

La fusione della libreria parte dal catalogo sorgente su disco, confrontato con la bozza.
Conserva campi estranei, definizioni locali, Scheduler e programmi non toccati. Le opzioni
updatedModules identificano i moduli del rilascio, già compilati sulla nuova interfaccia:
i riferimenti in questi moduli non vengono adattati una seconda volta. Le nuove dipendenze
delle dinamizzazioni vengono ricalcolate anche quando non cambiano nomi o parametri.

## Transazione e recupero

La transazione usa il proprio journal in .framecraft/script-migrations/ID/, separato dagli
aggiornamenti Runtime. Prima copia tutti i sorgenti prima/dopo e pubblica i metadati; soltanto
poi scrive i file, singolarmente in modo atomico. Non crea o elimina file del progetto.
Il ripristino confronta tutti i destinatari prima di modificarne uno e conserva le modifiche
successive. Un conflitto richiede verifica; il backup rimane disponibile. Anche un’interruzione
prima del messaggio finale lascia uno stato leggibile al successivo avvio.

I comandi nativi sono riservati alla finestra principale e al progetto aperto. Modifiche di
progetto, anteprima, editor e servizio sono escluse durante la scrittura. La porta loopback del
gateway deve essere libera e viene riservata; l’operatore deve confermare di avere arrestato
il servizio, incluso un eventuale servizio MQTT separato. Non vengono inviati comandi PLC.
Il backend verifica in sola lettura anche eventuali aggiornamenti Runtime pendenti.

L’inventario include sorgenti e dati locali, anche in cartelle utente nascoste, ed esclude
cartelle di sistema, dipendenze, output e il codice server Runtime. Sono protetti i file Framecraft di connessione/autenticazione,
il manifesto dei componenti, il pacchetto principale e gli helper generati. Collegamenti/junction/hard link, radici
sorgenti esterne, UTF-8 non valido, inventari incompleti o oltre i limiti vengono rifiutati.
La configurazione delle connessioni resta nel confronto nativo e non è restituita al worker.

Per applicare serve prima il pacchetto Runtime 2026.11.05.2, installato con Aggiorna componenti
del pannello. Il backend verifica guardia ed entry point conosciuti: installazioni precedenti
o personalizzazioni di quei tre file richiedono confronto. Nuovi pannelli includono la guardia.
Gateway, MQTT e anteprima rifiutano una migrazione incompleta; gli aggiornamenti del journal
Runtime precedente mantengono il loro controllo separato.

Da Pannello → Recupera migrazioni script si possono leggere i backup anche se pagine o catalogo
non sono più leggibili. Salva le bozze, arresta il servizio e confermalo; l’app ferma l’anteprima,
ripristina e rilegge pagine/catalogo. La finestra resta stabile durante l’operazione e non può
essere chiusa a scrittura iniziata. Un errore nel rileggere l’editor dopo un ripristino riuscito
viene descritto esplicitamente, senza fingere che i file siano rimasti invariati.

## Verifiche e confini

I test mirati comprendono script-library-migration, script-library-migration-dialog,
script-reference-migration, script-document-migration, script-project-migration e
script-migration-worker. Le prove browser script-library e script-library-migration
compilano i worker reali e il flusso UI in Edge; il secondo parte dal pannello Script,
collega una funzione rinominata e un parametro fisso, migra evento/dinamizzazione/Scheduler,
verifica il risultato nel Runtime Node e controlla conferme e dimensione stabile della finestra.
Il bridge nativo delle prove browser è simulato: non sono prove IPC desktop complete.

Il punto 193 ha verificato 25 casi nativi su file temporanei, guardie e recupero. I test nativi
esercitano la transazione reale separatamente dal browser. Nessun progetto macchina o PLC
fisico viene coinvolto; il collaudo industriale e delle combinazioni reali resta distinto.
