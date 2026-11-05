export interface ScriptMigrationBackup {version:1;id:string;root:string;state:string;createdAt:number;fileCount:number;failure:string|null}
export interface ScriptMigrationSnapshot {generation:number;token:string|null;files:Record<string,string>;backups:ScriptMigrationBackup[];runtimeReady:boolean}
