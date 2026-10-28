import { parseOpcUaBrowseTarget, opcUaBrowseScalarTypes, opcUaStandardNamespace, type OpcUaBrowseNode } from "../../runtime/opcua-browse-policy.mjs";
import { isPlcVariableName, type PlcAccess, type PlcVariableDefinition } from "./plcVariables";
import { connectionConfigurationIssues, parseConnectionConfiguration, type ConnectionConfigurationSnapshot, type ConnectionEditorModel } from "./plcConnections";

export type OpcUaMappingChoice =
  | { mode: "existing"; name: string }
  | { mode: "create"; name: string; access: PlcAccess; dataType: string };

const aliases: Readonly<Record<string, string>> = {
  bool: "Bool", boolean: "Bool", sint: "SInt", usint: "USInt", byte: "USInt", int: "Int", uint: "UInt", word: "UInt",
  dint: "DInt", udint: "UDInt", dword: "UDInt", real: "Real", float: "Real", lreal: "LReal", double: "LReal", string: "String", wstring: "String",
};

export function opcUaNodeAccepts(node: OpcUaBrowseNode, variable: Pick<PlcVariableDefinition, "dataType" | "access">): boolean {
  return node.target !== null && node.nodeClass === "Variable" && node.valueRank === -1 && !node.arrayDimensions?.length
    && node.issues.length === 0 && node.dataType?.namespaceUri === opcUaStandardNamespace
    && !!node.supportedDataType && opcUaBrowseScalarTypes[node.dataType.nodeId] === node.supportedDataType
    && aliases[variable.dataType.toLowerCase()] === node.supportedDataType
    && ["read", "write", "read-write"].includes(variable.access)
    && typeof node.readable === "boolean" && typeof node.writable === "boolean"
    && (variable.access === "write" || node.readable) && (variable.access === "read" || node.writable);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => JSON.stringify(key) + ":" + canonical(child)).join(",") + "}";
  return JSON.stringify(value);
}

export function opcUaBrowseUnavailable(model: ConnectionEditorModel, snapshot: ConnectionConfigurationSnapshot, index: number): string | undefined {
  const profile = model.catalog.connections[index];
  if (profile?.protocol !== "opcua" || !profile.enabled) return "Salva e abilita prima la connessione OPC UA da esplorare.";
  let saved;
  try { saved = parseConnectionConfiguration(snapshot).catalog.connections.find(item => item.id === profile.id); }
  catch { return "Ricarica la configurazione prima di esplorare il server."; }
  if (!saved || saved.protocol !== "opcua") return "Salva prima la nuova connessione OPC UA.";
  const withoutBindings = ({ bindings: _bindings, ...value }: typeof profile) => value;
  if (canonical(withoutBindings(profile)) !== canonical(withoutBindings(saved))) {
    return "Salva prima le modifiche a endpoint, sicurezza o tempi: l’esplorazione usa il profilo salvato.";
  }
  return undefined;
}

export function prepareOpcUaMapping(model: ConnectionEditorModel, snapshot: ConnectionConfigurationSnapshot, index: number, node: OpcUaBrowseNode, choice: OpcUaMappingChoice) {
  const reason = opcUaBrowseUnavailable(model, snapshot, index);
  if (reason) throw new Error(reason);
  const profile = model.catalog.connections[index];
  if (profile.protocol !== "opcua" || !node.target) throw new Error("Seleziona un nodo locale compatibile.");
  const target = parseOpcUaBrowseTarget(node.target);
  const created = choice.mode === "create", name = created ? choice.name.trim() : choice.name;
  let variable = model.variables.find(value => value.name === name);
  if (created) {
    if (!isPlcVariableName(name)) throw new Error("Scegli un nome locale valido: inizia con una lettera o _, massimo 200 caratteri.");
    if (variable) throw new Error("Questo nome esiste già. Scegli la variabile esistente oppure un nome diverso.");
    if (choice.dataType !== node.supportedDataType && !(choice.dataType === "WString" && node.supportedDataType === "String")) {
      throw new Error("La nuova variabile deve usare il tipo scalare rilevato nel server.");
    }
    variable = { name, dataType: choice.dataType, access: choice.access, address: "", description: "", connection: profile.id };
  }
  if (!variable || !opcUaNodeAccepts(node, variable)) {
    throw new Error("Tipo o accesso della variabile non compatibili con i metadati del nodo. Nessuna conversione o autorizzazione implicita.");
  }
  if (model.catalog.connections.some((other, i) => i !== index && other.enabled && other.bindings.some(binding => binding.tag === name))) {
    throw new Error("La variabile ha già un’altra sorgente attiva. Correggi esplicitamente quel mapping prima di sostituirlo.");
  }
  const previous = profile.bindings.find(binding => binding.tag === name);
  const binding = { ...previous, tag: name, namespaceUri: target.namespaceUri, nodeId: target.nodeId, writeEnabled: false, staleAfterMs: previous?.staleAfterMs ?? 5000 };
  if (!created && previous && canonical(previous) === canonical(binding)) throw new Error("Questa associazione è già nella bozza.");
  if (!previous && model.catalog.connections.reduce((sum, c) => sum + c.bindings.length, 0) >= 5000) {
    throw new Error("Raggiunto il limite di 5000 mapping. Nessun elemento è stato eliminato.");
  }
  const next = structuredClone(model);
  next.catalog.connections[index] = { ...structuredClone(profile), bindings: previous
    ? profile.bindings.map(item => structuredClone(item.tag === name ? binding : item)) : [...structuredClone(profile.bindings), binding] };
  if (created) {
    if (next.variables.length >= 50000) throw new Error("Raggiunto il limite di 50000 variabili PLC. Nessuna variabile è stata eliminata.");
    const source = JSON.parse(model.plcSource ?? snapshot.files.plc ?? '{"version":1,"variables":[]}') as Record<string, unknown>;
    if (source.version !== 1 || canonical(source.variables) !== canonical(model.variables)) throw new Error("La bozza del catalogo PLC non è coerente. Ricarica prima di importare.");
    next.variables.push(structuredClone(variable));
    next.plcSource = JSON.stringify({ ...source, variables: next.variables }, null, 2) + "\n";
    if (new TextEncoder().encode(next.plcSource).length > 4 * 1024 * 1024) throw new Error("Catalogo PLC oltre 4 MiB: nessuna nuova variabile è stata inserita.");
  }
  const issues = connectionConfigurationIssues(next);
  if (issues.length) throw new Error(issues[0].message);
  return { model: next, variable: structuredClone(variable), binding: structuredClone(binding), previous: previous && structuredClone(previous), created };
}
