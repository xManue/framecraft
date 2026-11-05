import { planScriptProjectMigration } from './scriptProjectMigration';
import type { ScriptMigrationJob } from './scriptMigrationClient';
let busy = false;
self.onmessage = async (event: MessageEvent<ScriptMigrationJob>) => {
  if (busy) {
    self.postMessage({
      error: 'Un confronto è già in corso.'
    });
    return;
  }
  busy = true;
  try {
    const {
      files,
      catalog,
      mappings,
      scopes
    } = event.data;
    self.postMessage({
      result: await planScriptProjectMigration(files, catalog, mappings, {
        scopes
      })
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message.slice(0, 1000) : 'Non è stato possibile preparare il confronto della migrazione.'
    });
  } finally {
    busy = false;
  }
};
