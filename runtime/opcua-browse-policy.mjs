import { isOpcUaNodeIdentifier } from "./connection-config.mjs";
const messages = {
  OPC_UA_BROWSE_INPUT: ["Richiesta di esplorazione non valida", "Usa Namespace URI e identificatore separati; per le pagine successive conserva revisione e cartella."],
  OPC_UA_BROWSE_RESPONSE: ["Risposta di esplorazione OPC UA non valida", "Non usare questi dati per il mapping. Controlla server e versione del Runtime, poi rileggi la cartella."],
  OPC_UA_BROWSE_CHANGED: ["La cartella OPC UA è cambiata", "Riparti dalla prima pagina. Non mescolare nodi di revisioni o sessioni diverse."],
  OPC_UA_BROWSE_LIMIT: ["Cartella OPC UA troppo grande", "Superati 5000 riferimenti, 4 MiB o il budget di richieste. Organizza il server in cartelle più piccole o usa un NodeId noto; nessun risultato troncato."],
  OPC_UA_BROWSE_CANCELLED: ["Esplorazione OPC UA annullata", "Nessun mapping o comando è stato applicato. Puoi avviare una nuova lettura esplicita."],
  OPC_UA_BROWSE_BUSY: ["Esplorazione OPC UA già in corso", "Attendi il termine della lettura della cartella, oppure annullala. Non vengono accodate richieste."],
  OPC_UA_BROWSE_CONFIG: ["Profilo OPC UA non disponibile per l’esplorazione", "Controlla il catalogo salvato: identificativo univoco, protocollo OPC UA e connessione abilitata. Non vengono alterati profili o permessi."],
  OPC_UA_BROWSE_NAMESPACE: ["Namespace della cartella non disponibile", "Controlla il Namespace URI nel server attuale: deve comparire una sola volta. Non sostituirlo con un indice di un’altra sessione."],
  OPC_UA_BROWSE_OFFLINE: ["Sessione OPC UA non disponibile per l’esplorazione", "Avvia esplicitamente la connessione configurata e attendi il collegamento. La lettura non avvia o riconnette automaticamente il driver."],
};
export class OpcUaBrowseError extends Error {
  constructor(code) { const known = Object.hasOwn(messages, code) ? code : "OPC_UA_BROWSE_RESPONSE"; super(messages[known][0]); this.name = "OpcUaBrowseError"; this.code = known; this.remedy = messages[known][1]; }
}
const keys = (v, required, optional = []) => v !== null && typeof v === "object" && !Array.isArray(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const uri = value => typeof value === "string" && !!value.trim() && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const opcUaStandardNamespace = "http://opcfoundation.org/UA/";
export const opcUaBrowseScalarTypes = Object.freeze({ "i=1": "Bool", "i=2": "SInt", "i=3": "USInt", "i=4": "Int", "i=5": "UInt", "i=6": "DInt", "i=7": "UDInt", "i=10": "Real", "i=11": "LReal", "i=12": "String" });
export function parseOpcUaBrowseTarget(value) {
  if (!keys(value, ["namespaceUri", "nodeId"]) || !uri(value.namespaceUri) || !isOpcUaNodeIdentifier(value.nodeId)) throw new OpcUaBrowseError("OPC_UA_BROWSE_INPUT");
  return { namespaceUri: value.namespaceUri, nodeId: value.nodeId };
}
export function parseOpcUaBrowseQuery(value = {}) {
  if (!keys(value, [], ["namespaceUri", "nodeId", "offset", "limit", "revision"]) || (value.namespaceUri === undefined) !== (value.nodeId === undefined)) throw new OpcUaBrowseError("OPC_UA_BROWSE_INPUT");
  const target = value.namespaceUri === undefined ? { namespaceUri: opcUaStandardNamespace, nodeId: "i=85" } : parseOpcUaBrowseTarget({ namespaceUri: value.namespaceUri, nodeId: value.nodeId });
  const offset = value.offset ?? 0, limit = value.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 4999 || !Number.isInteger(limit) || limit < 1 || limit > 100 || value.revision !== undefined && !hash(value.revision) || offset > 0 && !hash(value.revision)) throw new OpcUaBrowseError("OPC_UA_BROWSE_INPUT");
  return { ...target, offset, limit, ...(value.revision !== undefined ? { revision: value.revision } : {}) };
}
export function parseOpcUaBrowsePage(value, input = {}) {
  const q = parseOpcUaBrowseQuery(input), text = v => typeof v === "string" && v.length <= 4096 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), bit = v => v === null || typeof v === "boolean";
  if (!keys(value, ["version", "target", "revision", "offset", "limit", "total", "nextOffset", "nodes"]) || value.version !== 1 || !hash(value.revision) || value.offset !== q.offset || value.limit !== q.limit || !Number.isInteger(value.total) || value.total < 0 || value.total > 5000 || !Array.isArray(value.nodes) || value.nodes.length > q.limit || value.nodes.length !== Math.min(q.limit, Math.max(0, value.total - q.offset)) || value.nextOffset !== (q.offset + value.nodes.length < value.total ? q.offset + value.nodes.length : null) || q.revision !== undefined && value.revision !== q.revision) throw new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE");
  let target; try { target = parseOpcUaBrowseTarget(value.target); } catch { throw new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE"); }
  if (target.namespaceUri !== q.namespaceUri || target.nodeId !== q.nodeId || q.offset > 0 && q.offset >= value.total) throw new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE");
  for (const node of value.nodes) {
    if (!keys(node, ["target", "browseName", "displayName", "nodeClass", "dataType", "valueRank", "arrayDimensions", "readable", "writable", "supportedDataType", "issues"]) || !text(node.browseName) || !text(node.displayName) || !["Object", "Variable", "Method", "ObjectType", "VariableType", "ReferenceType", "DataType", "View", "Unknown"].includes(node.nodeClass) || !bit(node.readable) || !bit(node.writable) || node.valueRank !== null && (!Number.isInteger(node.valueRank) || node.valueRank < -3 || node.valueRank > 2147483647) || node.arrayDimensions !== null && (!Array.isArray(node.arrayDimensions) || node.arrayDimensions.length > 32 || node.arrayDimensions.some(n => !Number.isInteger(n) || n < 0 || n > 4294967295)) || node.supportedDataType !== null && !["Bool", "SInt", "USInt", "Int", "UInt", "DInt", "UDInt", "Real", "LReal", "String"].includes(node.supportedDataType) || !Array.isArray(node.issues) || node.issues.length > 4 || new Set(node.issues).size !== node.issues.length || node.issues.some(i => !["remote", "identity", "metadata", "array", "unsupported-type"].includes(i))) throw new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE");
    try { if (node.target !== null) parseOpcUaBrowseTarget(node.target); if (node.dataType !== null) parseOpcUaBrowseTarget(node.dataType); } catch { throw new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE"); }
    if (node.supportedDataType !== null && (node.nodeClass !== "Variable" || node.valueRank !== -1 || node.target === null || node.dataType === null || node.dataType.namespaceUri !== opcUaStandardNamespace || opcUaBrowseScalarTypes[node.dataType.nodeId] !== node.supportedDataType || node.readable === null || node.writable === null || node.issues.length)) throw new OpcUaBrowseError("OPC_UA_BROWSE_RESPONSE");
  }
  return structuredClone(value);
}
