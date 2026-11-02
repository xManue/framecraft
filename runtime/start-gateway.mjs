import { fileURLToPath } from "node:url";
import { assertRuntimeUpdateComplete, RuntimeUpdateError } from "./runtime-update-guard.mjs";
try {
  await assertRuntimeUpdateComplete(fileURLToPath(new URL("../", import.meta.url)));
  await import("./gateway-service.mjs");
} catch (error) {
  const pending=error instanceof RuntimeUpdateError;
  process.stderr.write(JSON.stringify({type:"runtime-update",code:pending?error.code:"RUNTIME_COMPONENT_LOAD",error:pending?error.message:"Il servizio non riesce a caricare i componenti del pannello.",remedy:pending?error.remedy:"Apri Framecraft → Pannello → Aggiorna componenti del pannello → Backup e ripristino. Verifica l’installazione prima di riavviare il servizio.",...(!pending?{technical:error instanceof Error?error.message:"Errore di caricamento"}:{})})+"\n");
  process.exitCode=1;
}
