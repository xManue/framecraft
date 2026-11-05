export class ScriptMigrationError extends Error {readonly code:'SCRIPT_MIGRATION_PENDING';readonly remedy:string;constructor()}
export function assertScriptMigrationComplete(root:string):Promise<void>;
