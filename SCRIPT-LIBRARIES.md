# Librerie di script Framecraft

Apri **Script → Librerie · importa, esporta e aggiorna**. La finestra mantiene la stessa
misura nelle due schede e lascia il canvas libero quando viene chiusa.

## Riutilizzare una libreria

1. Apri il file `.framecraft-script-library.json` e scegli la versione.
2. Scegli **Tipo collegato** per fissare quella versione nel progetto oppure **Copia indipendente**
   per riusare il codice senza collegarne gli aggiornamenti. Non ci sono aggiornamenti automatici.
3. Controlla gli alias usati in `Modules.Alias.Funzione()`. Il confronto evita alias già occupati;
   i riferimenti interni alla libreria seguono i nomi scelti. Un modulo identico e privo di un
   collegamento precedente può essere collegato senza duplicare o sostituire il codice.
4. Premi **Confronta con la bozza**. Leggi codice attuale/proposto, tag e attribuzioni di tutti
   i moduli. Le personalizzazioni e il ritorno a una versione precedente hanno conferme separate.
5. Per nuove importazioni e copie: **Applica alla bozza**, poi **Compila e salva**. Per un tipo
   collegato con codice aggiornato: **Continua con il progetto**, come descritto qui sotto.
   Configura e verifica i tag richiesti prima di usare le funzioni.

Il numero della versione compare anche nell'elenco moduli. Dal modulo puoi scegliere
**Rendi copia indipendente**: resta lo stesso codice, con le attribuzioni di origine.

## Aggiornare un tipo collegato

Salva prima pagina e moduli modificati. Dopo il confronto della libreria premi
**Continua con il progetto**. Se il pannello non ha ancora le protezioni di migrazione,
la finestra indica **Aggiorna componenti del pannello**; dopo l’aggiornamento riapri la libreria.

1. Per ogni funzione o export cambiato scegli il nuovo riferimento. Per i parametri nuovi
   scegli un parametro precedente, un valore fisso tipizzato oppure undefined. Vengono
   precompilati soltanto nomi corrispondenti; i valori mancanti richiedono una scelta.
2. Premi **Confronta file del progetto**. Il controllo comprende moduli globali/locali,
   Scheduler e binding di pagine/componenti staticamente analizzabili. I moduli del rilascio
   usano già le interfacce nuove: vengono adattati i chiamanti preesistenti del progetto.
3. Le pagine conosciute forniscono il loro contesto locale. Per un componente condiviso
   con contesto non determinabile seleziona tutte le pagine in cui è usato e ripeti il confronto.
   Le dipendenze dei tag comprendono tutti i contesti scelti. Produttori dinamici e riferimenti
   non analizzabili fermano l’intera proposta con percorso e motivo.
4. Confronta tutti i file prima/dopo. Conferma la verifica dei collegamenti e, quando richiesto,
   l’aggiornamento del motore degli script modificati e tutti i contesti dei componenti condivisi.
5. Arresta il servizio PLC del progetto, incluso MQTT separato se usato, e confermalo.
   **Applica aggiornamento con backup** ferma l’anteprima, ricontrolla i sorgenti e salva
   la transazione. Nessun comando viene inviato al PLC e i servizi restano fermi.
6. Controlla le pagine e riavvia il pannello e il servizio dopo la verifica. Per tornare ai
   sorgenti precedenti usa **Pannello → Recupera migrazioni script**.

Anche un aggiornamento con gli stessi nomi e parametri passa dal confronto del progetto:
una funzione può leggere tag diversi e richiedere il ricalcolo delle dinamizzazioni.
Le IR non toccate e i dati estranei del catalogo rimangono conservati. Una modifica esterna,
un cambio progetto o una bozza non salvata impediscono di applicare un confronto obsoleto.
Un errore di rilettura dopo la scrittura viene distinto dal mancato salvataggio; il backup resta
indicato e non viene eseguita una seconda scrittura automatica.

## Creare e distribuire una versione

Nella scheda **Crea una versione**, scegli un modulo del progetto. Le dipendenze `Modules`
necessarie vengono incluse; se ne manca una il rilascio viene fermato. Specifica identità
stabile della libreria, nome, licenza dichiarata, autore/copyright e note del cambiamento.
Premi **Prepara file della versione**, poi **Scarica** per conservare il risultato.
La preparazione non salva il progetto e non collega automaticamente il modulo sorgente.
Puoi importare il file per collegare lo stesso modulo senza duplicarlo, se il codice coincide.

Per una versione successiva apri prima il file esistente e seleziona **Aggiungi una versione
alla libreria aperta**. Il file nuovo conserva le versioni precedenti. Il numero deve crescere,
per esempio `1.0.0` → `1.1.0`. Identità, nome e condizioni della libreria rilasciata sono fissi;
per cambiarli crea una libreria distinta. Non modificare a mano i file rilasciati.
Quando rilasci da un tipo importato con alias diversi, il file usa le identità originali;
reimportandolo, i moduli del progetto conservano i propri alias.

## Cosa viene conservato e controllato

Il file contiene sorgenti e metadati. Non aggiunge pagine, configurazioni di connessione,
archivi o credenziali del progetto. Eventuali valori scritti direttamente nei sorgenti restano
nel file: controllali prima di condividerlo. Il codice viene ricompilato dalla versione corrente
di Framecraft; i programmi IR forniti da un file esterno non sono accettati come sorgenti fidate.
La validazione non esegue le funzioni e non crea eventi o operazioni pianificate.

Ogni rilascio ha un'impronta SHA-256. Una versione già collegata non può essere ripubblicata
con un contenuto diverso. L'impronta rileva differenze rispetto al file e alla versione fissata;
non certifica autore, licenza o sicurezza del codice. Le attribuzioni delle dipendenze e delle
copie vengono conservate nelle successive esportazioni. Metadati incompleti bloccano il
salvataggio o il rilascio anziché cancellare silenziosamente le note legali.

I controlli vengono eseguiti in un worker terminabile dopo 15 secondi; il contenuto importato
resta dati durante l'analisi. Limiti: file 2 MB, 16 versioni, 32 moduli e 256 funzioni per versione,
128 funzioni per modulo, 32 parametri, sorgente 20.000 caratteri per funzione/definizione globale.
Le versioni hanno tre componenti numeriche, senza prerelease. Conserva gli archivi precedenti
quando una libreria raggiunge i limiti. Questi limiti non ampliano il linguaggio supportato dalla VM.

Se la bozza cambia mentre confronti una libreria, la proposta viene invalidata. I nuovi script
sono IR 9: per pannelli con Runtime precedente usa l'aggiornamento assistito dei componenti,
poi ricompila e salva. Le credenziali e le autorizzazioni del servizio PLC rimangono necessarie
per ogni operazione: il collegamento di una libreria non concede permessi.

Il riferimento funzionale Unified è [Creare un modulo script come tipo, V21](https://docs.tia.siemens.cloud/r/en-us/v21/wincc-unified-rt-unified/working-with-libraries-rt-unified/using-types-and-their-versions-rt-unified/creating-a-script-module-as-a-type-rt-unified).

## Verifica riproducibile

`tests/script-library.test.ts` verifica versioni, impronte, attribuzioni, dipendenze, conflitti,
bozze non più attuali, alias, stati globali e copie. `tests/browser/script-library.mjs` compila
la finestra reale, usa worker in Edge, verifica importazione/aggiornamento/download e prova
il catalogo importato con gli helper autonomi del Runtime Node. I dati sono sintetici;
nessun PLC fisico o servizio di produzione è coinvolto.

Il motore di confronto delle migrazioni è descritto in [SCRIPT-MIGRATION.md](SCRIPT-MIGRATION.md).
La procedura guidata è collegata al pannello Script. Il test browser script-library-migration
prova worker reali, modifica di evento/dinamizzazione/Scheduler, confronto e chiamata della
transazione; il bridge desktop è simulato e la transazione nativa è verificata separatamente.
Il collaudo IPC desktop completo e quello su macchina restano da svolgere.
