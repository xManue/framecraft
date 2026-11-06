import type { HmiScriptCatalog } from './hmiScriptModules';
import type { ScriptSymbolMigration } from './scriptReferenceMigration';
import type { ScriptProjectMigration } from './scriptProjectMigration';
import type {ScriptLibraryPlan,ScriptLibraryReview} from './scriptLibrary';
export interface ScriptMigrationJob {
  files: Record<string, string>;
  catalog: HmiScriptCatalog;
  mappings: ScriptSymbolMigration[];
  scopes?: Record<string, string | string[]>;
  library?:{catalog:HmiScriptCatalog;plan:ScriptLibraryPlan;review:ScriptLibraryReview};
}
/** A disposable worker keeps parsing and compiler inspection away from the editor thread. */
export function previewScriptProjectMigration(job: ScriptMigrationJob, signal?: AbortSignal): Promise<ScriptProjectMigration> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Error('Confronto annullato. Nessun file è stato modificato.'));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL('./scriptMigrationWorker.ts', import.meta.url), {
        type: 'module'
      });
    } catch {
      reject(Error('Il confronto non è partito. Riprova dopo il completamento degli aggiornamenti dell’editor.'));
      return;
    }
    let done = false;
    const finish = (result?: ScriptProjectMigration, error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(Error(error));else resolve(result!);
    };
    const abort = () => finish(undefined, 'Confronto annullato. Nessun file è stato modificato.');
    const timer = setTimeout(() => finish(undefined, 'Il confronto ha superato 15 secondi. Nessun file è stato modificato: riduci i sorgenti o separa la migrazione.'), 15000);
    signal?.addEventListener('abort', abort, {
      once: true
    });
    worker.onerror = event => {
      event.preventDefault();
      finish(undefined, 'Il confronto si è interrotto. Nessun file è stato modificato. Riprova e conserva i dettagli tecnici se ricapita.');
    };
    worker.onmessageerror = () => finish(undefined, 'Il risultato del confronto non è leggibile. Nessun file è stato modificato.');
    worker.onmessage = event => {
      const value = event.data as {
        error?: unknown;
        result?: ScriptProjectMigration;
      };
      if (typeof value?.error === 'string') {
        finish(undefined, value.error.slice(0, 1000));
        return;
      }
      if (!value?.result || typeof value.result.base !== 'string' || !Array.isArray(value.result.changes) || !Array.isArray(value.result.issues)) {
        finish(undefined, 'Il confronto ha restituito un risultato non valido. Nessun file è stato modificato.');
        return;
      }
      finish(value.result);
    };
    try {
      worker.postMessage(job);
    } catch {
      finish(undefined, 'I dati del confronto non possono essere trasferiti. Nessun file è stato modificato.');
    }
  });
}
