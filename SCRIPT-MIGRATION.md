# Analisi delle migrazioni delle librerie script

Stato del punto 192: motore di confronto e worker verificati. **La migrazione guidata sui file
reali non è ancora attiva nell’editor.** La finestra Librerie mantiene il blocco delle API
incompatibili. Questo documento descrive il motore da collegare alla revisione e alla
transazione con backup; non è una procedura alternativa per scrivere i file manualmente.

## Contratto del confronto

`planScriptProjectMigration(files, proposedCatalog, mappings, {scopes})` riceve un inventario
completo dei sorgenti e dei dati importabili, il catalogo proposto e le scelte esplicite delle
interfacce. Restituisce differenze prima/dopo, riferimenti e posizioni, programmi ricompilati,
versioni IR precedenti, problemi e impronta dell’intero inventario. Non accede al filesystem,
non esegue il codice analizzato e non invia richieste PLC o richieste esterne.

Il chiamante deve fornire tutti i file del progetto pertinenti. L’impronta include anche i file
non modificati: un import cambiato, una nuova pagina o una rimozione devono invalidare il piano.
Il motore puro non certifica che l’inventario ricevuto corrisponda al filesystem. Questo controllo
spetterà alla transazione nativa, insieme all’identità del progetto, alle bozze non salvate,
all’arresto dell’anteprima e del servizio e al recupero dopo un’interruzione.

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
serve lo scope della pagina, fornito esplicitamente oppure coincidente esattamente con il
percorso del file: in assenza di certezza il confronto si ferma.

## Da completare prima dell’applicazione

- Domande guidate per simboli e parametri, contesto locale, differenze e ricompilazione delle IR.
- Inventario nativo completo e confinato, confronto prima della scrittura e invalidazione delle bozze.
- Unica transazione con backup, rollback, recupero delle interruzioni e controllo delle modifiche esterne.
- Collegamento alla finestra Librerie e verifica dell’intero flusso su progetti sintetici.

I test mirati sono `script-reference-migration`, `script-document-migration`,
`script-project-migration` e `script-migration-worker`. `tests/browser/script-migration.mjs`
compila il worker reale, prova pagine JSX e HTML in Edge, verifica dipendenze e vecchie IR,
annullamento e blocchi, poi esegue il risultato negli helper Runtime browser e Node.
Nessun servizio PLC o progetto macchina reale viene coinvolto.
