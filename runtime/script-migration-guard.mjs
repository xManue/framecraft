import {lstat,readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
export class ScriptMigrationError extends Error {
 constructor(){super('Il servizio PLC resta fermo: una migrazione delle librerie script è incompleta o il backup non è verificabile.');this.name='ScriptMigrationError';this.code='SCRIPT_MIGRATION_PENDING';this.remedy='Apri Framecraft → Pannello → Recupera migrazioni script. Ripristina il backup, poi riavvia il servizio. Conserva la cartella di backup.';}
}
export async function assertScriptMigrationComplete(root){
 root=resolve(root);
 try{
  const directory=join(root,'.framecraft','script-migrations');
  for(const folder of [join(root,'.framecraft'),directory]){let stat;try{stat=await lstat(folder);}catch(error){if(error.code==='ENOENT')return;throw error;}if(!stat.isDirectory()||stat.isSymbolicLink())throw new ScriptMigrationError();}
  let count=0;
  for(const entry of await readdir(directory,{withFileTypes:true})){
   if(!/^[0-9][0-9-]{0,79}$/.test(entry.name))continue;
   if(++count>256||!entry.isDirectory()||entry.isSymbolicLink())throw new ScriptMigrationError();
   const file=join(directory,entry.name,'meta.json'),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>32768)throw new ScriptMigrationError();
   const meta=JSON.parse(await readFile(file,'utf8'));if(meta.version!==1||meta.id!==entry.name||!['completed','restored','rolled-back'].includes(meta.state))throw new ScriptMigrationError();
  }
 }catch(error){throw error instanceof ScriptMigrationError?error:new ScriptMigrationError();}
}
