import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openSchedulerStore, SchedulerError } from './scheduler-store.mjs';
import { parseOperatorAuthConfig } from './operator-policy.mjs';
const root=new URL('../',import.meta.url);let store;
try {
  const [command,id,...extra]=process.argv.slice(2);
  if (extra.length || !['status','review'].includes(command) || command==='status' && id || command==='review' && !/^[a-f0-9-]{36}$/.test(id ?? '')) throw new Error('Uso: npm run scheduler -- status | review ID_ESECUZIONE. Arresta prima il servizio. Review registra una verifica manuale e non invia comandi.');
  const auth=parseOperatorAuthConfig(JSON.parse(await readFile(new URL('framecraft.auth.json',root),'utf8')));
  store=openSchedulerStore({root:fileURLToPath(root),namespace:auth.namespace});
  if(command==='review' && !store.review(id)) throw new Error('Esecuzione incerta non trovata. Usa status per leggere gli ID; nessun comando è stato inviato.');
  process.stdout.write(JSON.stringify({needsReview:store.needsReview(),history:store.history()})+'\n');
} catch(error) { process.stderr.write((error instanceof SchedulerError ? error.message+' '+error.remedy : error.message)+'\n');process.exitCode=1; }
finally {store?.close();}
