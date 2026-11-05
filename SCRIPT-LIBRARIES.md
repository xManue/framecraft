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
5. **Applica alla bozza**, poi **Salva moduli**. Prima del salvataggio nessun file del progetto
   viene modificato. Configura e verifica i tag richiesti prima di usare le funzioni. Se il modulo
   è usato dallo Scheduler centrale, riavvia il servizio gateway dopo il salvataggio.

Il numero della versione compare anche nell'elenco moduli. Dal modulo puoi scegliere
**Rendi copia indipendente**: resta lo stesso codice, con le attribuzioni di origine.

Le modifiche che rimuovono funzioni/export o cambiano l'elenco dei parametri non sostituiscono
un tipo già collegato: importa la nuova versione come copia, migra le azioni e verifica il
pannello. Le copie consentono di tenere la versione precedente durante il passaggio.
Il rifacimento automatico delle azioni e dei riferimenti nelle pagine rimane aperto nella roadmap.

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
