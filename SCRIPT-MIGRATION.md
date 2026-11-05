# Analisi delle migrazioni delle librerie script

Stato dei punti 192–193: motore di confronto, inventario e transazione nativa collegati;
**recupero operativo da Pannello → Recupera migrazioni script**. La finestra Librerie mantiene
il blocco delle API incompatibili: restano da collegare le scelte guidate di simboli, parametri
e contesti e la revisione prima dell’applicazione. Il backend non esegue migrazioni automatiche.

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
serve lo scope della pagina, fornito esplicitamente oppure coincidente esattamente con il
percorso del file: in assenza di certezza il confronto si ferma.

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

## Da completare prima della migrazione guidata delle librerie

- Scelte guidate di simboli, parametri e contesto locale, confronto di tutti i file e conferma della ricompilazione delle vecchie IR.
- Collegamento del piano dalla finestra Librerie alla transazione, invalidazione delle proposte e prova dell’intero aggiornamento di una libreria.

I test mirati sono `script-reference-migration`, `script-document-migration`,
`script-project-migration` e `script-migration-worker`. `tests/browser/script-migration.mjs`
compila il worker reale, prova pagine JSX e HTML in Edge, verifica dipendenze e vecchie IR,
annullamento e blocchi, poi esegue il risultato negli helper Runtime browser e Node.
Nessun servizio PLC o progetto macchina reale viene coinvolto.

Il punto 193 verifica anche 25 casi nativi su file temporanei, 81 casi mirati JavaScript/UI
e la finestra compilata in Edge. Le API native della prova browser sono simulate; le prove
native esercitano la transazione reale. Il collaudo su macchine fisiche rimane distinto.
