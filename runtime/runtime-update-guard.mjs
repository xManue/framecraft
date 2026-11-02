import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
export class RuntimeUpdateError extends Error {
  constructor(){super('Il servizio PLC resta fermo: un aggiornamento dei componenti è incompleto o il suo stato non è verificabile.');this.name='RuntimeUpdateError';this.code='RUNTIME_UPDATE_PENDING';this.remedy='Apri Framecraft → Pannello → Aggiorna componenti del pannello → Backup e ripristino. Recupera l’aggiornamento, poi riavvia il servizio. Non cancellare il backup per forzare l’avvio.';}
}
export async function assertRuntimeUpdateComplete(root){
  root=resolve(root);
  try{
    const directory=join(root,'.framecraft','runtime-updates');
    for(const folder of [join(root,'.framecraft'),directory]){let stat;try{stat=await lstat(folder);}catch(error){if(error.code==='ENOENT')return;throw error;}if(!stat.isDirectory()||stat.isSymbolicLink())throw new RuntimeUpdateError();}
    let count=0;
    for(const entry of await readdir(directory,{withFileTypes:true})){
      if(!/^[0-9][0-9-]{0,79}$/.test(entry.name))continue;
      if(++count>256||!entry.isDirectory()||entry.isSymbolicLink())throw new RuntimeUpdateError();
      const file=join(directory,entry.name,'meta.json'),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>32768)throw new RuntimeUpdateError();
      const metadata=JSON.parse(await readFile(file,'utf8'));if(metadata.version!==1||metadata.id!==entry.name||!['completed','restored','rolled-back'].includes(metadata.state))throw new RuntimeUpdateError();
    }
  }catch(error){throw error instanceof RuntimeUpdateError?error:new RuntimeUpdateError();}
}
