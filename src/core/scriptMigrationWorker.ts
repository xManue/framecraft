import { planScriptProjectMigration } from './scriptProjectMigration';
import {prepareScriptLibraryMigration} from './scriptLibrary';
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
      result: await planScriptProjectMigration(files, event.data.library?await prepareScriptLibraryMigration(files['framecraft.scripts.json']??'',event.data.library.catalog,event.data.library.plan,event.data.library.review):catalog, mappings, {
        scopes,
        updatedModules:event.data.library?.plan.changes.map(change=>change.alias)
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
