export class OpcUaBrowseError extends Error { readonly code: string; readonly remedy: string; constructor(code: string) }
export interface OpcUaBrowseTarget { namespaceUri: string; nodeId: string }
export interface OpcUaBrowseQuery { namespaceUri?: string; nodeId?: string; offset?: number; limit?: number; revision?: string }
export interface OpcUaBrowseNode { target: OpcUaBrowseTarget | null; browseName: string; displayName: string; nodeClass: "Object" | "Variable" | "Method" | "ObjectType" | "VariableType" | "ReferenceType" | "DataType" | "View" | "Unknown"; dataType: OpcUaBrowseTarget | null; valueRank: number | null; arrayDimensions: number[] | null; readable: boolean | null; writable: boolean | null; supportedDataType: "Bool" | "SInt" | "USInt" | "Int" | "UInt" | "DInt" | "UDInt" | "Real" | "LReal" | "String" | null; issues: string[] }
export interface OpcUaBrowsePage { version: 1; target: OpcUaBrowseTarget; revision: string; offset: number; limit: number; total: number; nextOffset: number | null; nodes: OpcUaBrowseNode[] }
export const opcUaStandardNamespace: string;
export const opcUaBrowseScalarTypes: Readonly<Partial<Record<string, NonNullable<OpcUaBrowseNode["supportedDataType"]>>>>;
export function parseOpcUaBrowseTarget(value: unknown): OpcUaBrowseTarget;
export function parseOpcUaBrowseQuery(value?: unknown): Required<Omit<OpcUaBrowseQuery, "revision">> & { revision?: string };
export function parseOpcUaBrowsePage(value: unknown, query?: OpcUaBrowseQuery): OpcUaBrowsePage;
