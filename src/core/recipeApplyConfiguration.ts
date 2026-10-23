import { emptyRecipeApplyConfig, parseRecipeApplyConfig, RecipeApplyError, type RecipeApplyConfig, type RecipeApplyProfile } from "../../runtime/recipe-apply.mjs";
import { recipeId, type RecipeCatalog } from "../../runtime/recipe-catalog.mjs";
import { parseOperatorAuthConfig, type OperatorAuthConfig } from "../../runtime/operator-policy.mjs";
import { validateConnectionCatalog, type ConnectionCatalog } from "../../runtime/connection-config.mjs";
import { parseConnectionConfiguration } from "./plcConnections";
import type { PlcVariableDefinition } from "./plcVariables";
export { emptyRecipeApplyConfig, parseRecipeApplyConfig };
export type { RecipeApplyConfig, RecipeApplyProfile };
export interface RecipeApplyConfigurationSnapshot { generation: number; source: string | null; recipes: string | null; plc: string | null; connections: string | null; auth: string | null; commissioned: boolean }
export interface RecipeApplyEnvironment { variables: PlcVariableDefinition[]; connections: ConnectionCatalog; auth?: OperatorAuthConfig }
export function recipeApplyEnvironment(snapshot: RecipeApplyConfigurationSnapshot): RecipeApplyEnvironment {
  const { catalog, variables } = parseConnectionConfiguration({ generation: snapshot.generation, files: { connections: snapshot.connections, plc: snapshot.plc, runtime: null } });
  let auth: OperatorAuthConfig | undefined;
  if (snapshot.auth !== null) { try { auth = parseOperatorAuthConfig(JSON.parse(snapshot.auth)); } catch { throw new Error("Configurazione accessi operatore non valida. Correggila in Account e permessi; nessuna interfaccia salvata."); } }
  return { connections: catalog, variables, auth };
}
export function newRecipeApplyProfile(schemaId: string): RecipeApplyProfile {
  return { schemaId, channelId: "", requestTag: "", responseTag: "", maxPayloadBytes: 8192, maxAgeMs: 2000, prepareTimeoutMs: 5000, applyTimeoutMs: 5000, stageLifetimeMs: 30000 };
}
export function recipeApplyConfigurationIssues(config: RecipeApplyConfig, recipes: RecipeCatalog, environment: RecipeApplyEnvironment): string[] {
  const issues: string[] = [], add = (message: string) => { if (!issues.includes(message)) issues.push(message); };
  for (const profile of config.schemas) {
    const name = recipes.schemas.find(schema => schema.id === profile.schemaId)?.name;
    if (!name) add("Schema mancante: " + profile.schemaId + ". Rimuovi esplicitamente l’interfaccia obsoleta o ripristina lo schema.");
    const label = name ?? profile.schemaId;
    if (!recipeId(profile.channelId)) add(label + ": inserisci un ID canale stabile, da 1 a 80 lettere/cifre, punti, trattini o underscore, senza spazi.");
    for (const [key, access, title] of [["requestTag", "write", "richiesta"], ["responseTag", "read", "risposta"]] as const) {
      const tag = environment.variables.find(item => !item.detected && item.name === profile[key]);
      if (!tag || ![access, "read-write"].includes(tag.access) || !["string", "wstring"].includes(tag.dataType.toLowerCase())) add(label + ": scegli un tag " + title + " dichiarato String/WString e " + (access === "write" ? "scrivibile." : "leggibile."));
    }
    if (profile.requestTag && profile.requestTag === profile.responseTag) add(label + ": richiesta e risposta devono usare due tag diversi.");
    if (!Number.isInteger(profile.maxPayloadBytes) || profile.maxPayloadBytes < 512 || profile.maxPayloadBytes > 131072) add(label + ": capacità richiesta da 512 a 131072 caratteri ASCII. Deve corrispondere al buffer/parser reale del PLC.");
    if (!Number.isInteger(profile.maxAgeMs) || profile.maxAgeMs < 250 || profile.maxAgeMs > 10000) add(label + ": età massima della risposta da 250 a 10000 ms.");
    if (![profile.prepareTimeoutMs, profile.applyTimeoutMs].every(value => Number.isInteger(value) && value >= 1000 && value <= 20000)) add(label + ": attese di preparazione e applicazione da 1000 a 20000 ms.");
    if (!Number.isInteger(profile.stageLifetimeMs) || profile.stageLifetimeMs < profile.prepareTimeoutMs + 1000 || profile.stageLifetimeMs > 120000) add(label + ": durata preparazione almeno attesa preparazione + 1000 ms, massimo 120000 ms.");
  }
  if (config.schemas.length) {
    if (environment.auth?.enabled !== true) add("Abilita gli account locali in Account e permessi. Il PIN browser non abilita l’applicazione ricette.");
    if (environment.connections.gateway.enabled !== true || environment.connections.gateway.allowWrites !== true) add("In Connessioni PLC abilita esplicitamente servizio e scritture. Questa finestra non cambia quei consensi.");
    try { validateConnectionCatalog(environment.connections, environment.variables); }
    catch { add("Controlla i profili attivi in Connessioni PLC: catalogo, tag, trasporto o consensi non sono validi."); }
    for (const profile of config.schemas) {
      const name = recipes.schemas.find(schema => schema.id === profile.schemaId)?.name ?? profile.schemaId;
      const owner = (tag: string) => environment.connections.connections.filter(connection => connection.enabled && connection.bindings.some(binding => binding.tag === tag));
      const requests = owner(profile.requestTag), responses = owner(profile.responseTag);
      if (requests.length !== 1 || responses.length !== 1 || requests[0] !== responses[0]) { add(name + ": associa richiesta e risposta alla stessa connessione PLC attiva, senza sorgenti duplicate."); continue; }
      const connection = requests[0]; if (connection.allowWrites !== true) add(name + ": abilita le scritture della connessione in Connessioni PLC.");
      if (connection.protocol === "mqtt") {
        const request = connection.bindings.find(binding => binding.tag === profile.requestTag)!, response = connection.bindings.find(binding => binding.tag === profile.responseTag)!;
        if (!request.writeTopic || request.writeEncoding !== "text") add(name + ": la richiesta MQTT deve avere topic di scrittura dedicato e codifica testo (JSON ASCII completo).");
        if (!response.topic || !response.qualityPath || (response.encoding ?? "json") !== "json") add(name + ": la risposta MQTT richiede un topic letto con qualità esplicita e involucro JSON. Configura i percorsi valore e qualità in Connessioni PLC.");
        if ((connection.maxPayloadBytes ?? 65536) < Math.max(profile.maxPayloadBytes, 8192)) add(name + ": il limite messaggio della connessione MQTT deve coprire la richiesta e almeno 8192 byte per la risposta con involucro. Non viene aumentato automaticamente.");
      } else if (connection.bindings.find(binding => binding.tag === profile.requestTag)?.writeEnabled !== true) add(name + ": abilita esplicitamente la scrittura del nodo richiesta OPC UA in Connessioni PLC.");
    }
  }
  try { parseRecipeApplyConfig(config, recipes, environment.variables); } catch { if (!issues.length) add("Canali incompatibili: due schemi possono condividere un canale solo con tag e tempi identici. Ogni tag appartiene a un solo canale."); }
  return issues;
}
export function recipeApplyConfigurationError(reason: unknown): string {
  if (reason instanceof RecipeApplyError) return reason.message + ". " + reason.remedy;
  const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  if (/command.+not found|unknown command/i.test(message)) return "Questa build desktop non include la configurazione di applicazione ricette. Salva il lavoro e apri una build aggiornata; nessun riavvio automatico.";
  return message || "Interfaccia ricette non disponibile. Bozza e file esistenti restano invariati.";
}
