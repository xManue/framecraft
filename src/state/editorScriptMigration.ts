import type {ScriptMigrationSnapshot} from '../core/scriptMigrationTransaction';
import type {ScriptProjectMigration} from '../core/scriptProjectMigration';
import {joinProjectPath} from '../core/paths';
import {parseHmiScriptCatalog,hmiScriptCatalogIssues} from '../core/hmiScriptModules';
import {parseHmiFaceplateCatalog} from '../core/hmiFaceplates';
import {desktopBridge} from '../filesystem/desktopBridge';
import {useEditorStore} from './editorStore';
import {hasUnsavedScriptModules} from './scriptDraftState';
export function assertScriptMigrationEditable(root:string){
 const editor=useEditorStore.getState();
 if(editor.project?.root!==root)throw Error('Il progetto del confronto non è più aperto.');
 if(editor.dirty||hasUnsavedScriptModules())throw Error('Salva prima la pagina e i moduli script modificati. Il recupero non deve cancellare le bozze.');
 if(editor.loading||editor.exporting||editor.previewRestarting||editor.reloadRecovery||editor.highlightPicker||editor.interactionMode!=='edit')throw Error('Torna in Modifica e completa le operazioni in corso prima di applicare o recuperare.');
 return editor;
}
export function scriptMigrationNativeError(error:unknown):Error{const detail=error instanceof Error?error.message:String(error);return /command.+not found|unknown command/i.test(detail)?Error('Questa finestra desktop non ha ancora i comandi di migrazione. Salva il lavoro e riapri la build aggiornata di Framecraft. Nessun file è stato modificato.'):Error(detail);}
async function quiesce(root:string,current:()=>boolean){
 const initial=assertScriptMigrationEditable(root),project=initial.project,document=initial.document;
 const valid=()=>{if(!current()||useEditorStore.getState().project!==project||useEditorStore.getState().document!==document)throw Error('L’editor è cambiato durante il controllo. Prepara un nuovo confronto.');assertScriptMigrationEditable(root);};
 valid();initial.closeStandalonePreview();useEditorStore.setState({previewSessionId:undefined,previewUrl:undefined,previewProcessExited:true,previewStatus:'idle',previewError:undefined});await desktopBridge.stopPreview();valid();return valid;
}
export async function applyScriptMigrationFiles(root:string,snapshot:ScriptMigrationSnapshot,plan:ScriptProjectMigration,stopped:boolean,current:()=>boolean):Promise<string>{
 if(!stopped)throw Error('Arresta il servizio PLC del progetto e confermalo prima di applicare.');
 if(!snapshot.token||!snapshot.runtimeReady||plan.issues.length||!plan.changes.length)throw Error('Il confronto non è applicabile. Completa i collegamenti e aggiorna i componenti del pannello.');
 const editor=assertScriptMigrationEditable(root),document=editor.document;
 const {scriptMigrationFingerprint}=await import('../core/scriptProjectMigration');
 if(plan.base!==await scriptMigrationFingerprint(snapshot.files))throw Error('Il confronto non corrisponde più all’inventario. Ricarica la proposta.');
 if(document){const entry=Object.entries(snapshot.files).find(([file])=>joinProjectPath(root,file).replaceAll('\\','/')===document.file.replaceAll('\\','/'));if(entry&&entry[1]!==document.source)throw Error('La pagina aperta ha un contenuto diverso dal confronto. Ricaricala prima di migrare.');}
 try{const valid=await quiesce(root,current);valid();return await desktopBridge.applyScriptMigration(root,snapshot.generation,snapshot.token,plan.changes);}
 catch(error){throw scriptMigrationNativeError(error);}
}
export async function restoreScriptMigrationFiles(root:string,generation:number,backup:string,stopped:boolean,current:()=>boolean):Promise<string[]>{
 if(!stopped)throw Error('Arresta il servizio PLC del progetto e confermalo prima di recuperare.');
 try{const valid=await quiesce(root,current);valid();return await desktopBridge.restoreScriptMigration(root,generation,backup);}
 catch(error){throw scriptMigrationNativeError(error);}
}
export async function refreshScriptMigrationFiles(root:string,files:string[]):Promise<void>{
 const project=useEditorStore.getState().project;if(project?.root!==root)return;let readFailure:unknown;let readFailed=false;
 await useEditorStore.getState().refreshAiProjectFiles(root,files,{label:'Migrazione script',read:async(root,file)=>{try{return await desktopBridge.readFile(joinProjectPath(root,file));}catch(error){readFailed=true;readFailure=error;throw error;}}});
 if(readFailed)throw readFailure??Error('Un file ripristinato non è leggibile.');if(useEditorStore.getState().project!==project)return;
 if(files.includes('framecraft.scripts.json')){
  const raw=JSON.parse(await desktopBridge.readFile(joinProjectPath(root,'framecraft.scripts.json')));
  if(!raw||raw.version!==1||!Array.isArray(raw.globalModules)||!Array.isArray(raw.localDefinitions)||!Array.isArray(raw.scheduledTasks))throw Error('Il catalogo script ripristinato non è leggibile.');
  const catalog=parseHmiScriptCatalog(raw),issues=hmiScriptCatalogIssues(catalog);if(issues.length)throw Error('Catalogo script ripristinato da verificare: '+issues[0]);
  if(useEditorStore.getState().project===project){if(hasUnsavedScriptModules())throw Error('La bozza dei moduli è cambiata: conservala prima di rileggerli.');useEditorStore.setState({scriptCatalog:catalog});}
 }
 if(files.includes('framecraft.faceplates.json')){
  const raw=JSON.parse(await desktopBridge.readFile(joinProjectPath(root,'framecraft.faceplates.json')));if(!raw||raw.version!==1||!Array.isArray(raw.types))throw Error('Il catalogo faceplate ripristinato non è leggibile.');
  if(useEditorStore.getState().project===project)useEditorStore.setState({faceplateCatalog:parseHmiFaceplateCatalog(raw)});
 }
}
