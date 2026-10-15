import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type { EditorDocument, PageDefinition } from "../core/types";
import { createElementValueInspector } from "../source-parser/inspectElementValues";
import { aiEditContext, type AiEditSnapshot } from "./aiProposal";
import type { AiChatAttachment } from "./aiChat";
import type { AiDataReference } from "./aiBindings";

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;
function owner(path: NodePath): string {
  let current: NodePath | null = path;
  while (current) {
    if (current.isFunctionDeclaration()) return current.node.id?.name ?? "default";
    if ((current.isArrowFunctionExpression() || current.isFunctionExpression()) && current.parentPath?.isVariableDeclarator() && current.parentPath.node.id.type === "Identifier") return current.parentPath.node.id.name;
    current = current.parentPath;
  }
  return "module";
}
function stateVisible(path: NodePath, state?: string): boolean {
  if (!state) return true;
  let child: NodePath = path, parent = path.parentPath;
  while (parent) {
    const test = parent.isConditionalExpression() || parent.isIfStatement() ? parent.node.test : parent.isLogicalExpression() && parent.node.operator === "&&" ? parent.node.left : undefined;
    if (test?.type === "BinaryExpression" && ["===", "=="].includes(test.operator)) {
      const key = test.left.type === "Identifier" ? test.left.name : "", value = test.right.type === "StringLiteral" ? test.right.value : undefined;
      if (/^(page|view|screen|section|activePage)$/i.test(key) && value !== undefined) {
        if ((child.key === "consequent" || child.key === "right") && value !== state) return false;
        if (child.key === "alternate" && value === state) return false;
      }
    }
    child = parent; parent = parent.parentPath;
  }
  return true;
}
export function pageAiAttachment(root: string, page: PageDefinition, document: EditorDocument, subtree?: string): AiChatAttachment {
  const inspector = createElementValueInspector(document.source), owners = new Map<number, string>(), visible = new Set<number>(), links = new Map<string, Set<string>>();
  traverse(parse(document.source, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] }), {
    JSXElement(path) {
      const name = owner(path), start = path.node.start!; owners.set(start, name);
      if (stateVisible(path, page.stateValue)) visible.add(start);
      const tag = path.node.openingElement.name;
      if (tag.type === "JSXIdentifier" && /^[A-Z]/.test(tag.name)) { if (!links.has(name)) links.set(name, new Set()); links.get(name)!.add(tag.name); }
    },
  });
  const names = new Set(owners.values()), scope = new Set<string>();
  if (page.componentName && names.has(page.componentName)) scope.add(page.componentName);
  else if (names.has("default")) scope.add("default");
  else for (const name of names) scope.add(name);
  for (const name of scope) for (const child of links.get(name) ?? []) if (names.has(child)) scope.add(child);
  const all = Object.values(document.nodes).filter(node => visible.has(node.source.start) && scope.has(owners.get(node.source.start) ?? "module"));
  const ancestor = subtree ? document.nodes[subtree] : undefined;
  const nodes = all.filter(node => {
    if (ancestor && (node.source.start < ancestor.source.start || node.source.end > ancestor.source.end)) return false;
    let parent = node.parentId ? document.nodes[node.parentId] : undefined;
    while (parent) { if (parent.type === "svg" && node.type !== "svg") return false; parent = parent.parentId ? document.nodes[parent.parentId] : undefined; }
    return true;
  }).sort((a, b) => a.source.start - b.source.start);
  const ids = new Map(nodes.map((node, index) => [node.id, `e${index}`])), targets: Record<string, AiEditSnapshot> = {}, templates = new Map<string, unknown>();
  const rows = nodes.map(node => {
    const snapshot = { root, document, selectedId: node.id, pageId: page.id, label: `${page.name} · ${node.label}` }, context = aiEditContext(snapshot, inspector);
    if (context.element.editable.style || context.element.editable.text) targets[ids.get(node.id)!] = snapshot;
    if (context.template) templates.set(context.template.id, context.template);
    const text = context.element.text, shortened = typeof text === "string" && text.length > 512;
    const bindings = context.element.editable.bindings;
    const row: unknown[] = [ids.get(node.id), ids.get(node.parentId ?? "") ?? null, node.type, shortened ? text.slice(0, 256) + "…" + text.slice(-128) : text ?? null, context.element.styles, (context.element.editable.text ? 1 : 0) + (context.element.editable.style ? 2 : 0) + (bindings.includes("ForeColor") ? 4 : 0) + (bindings.includes("Text") ? 8 : 0) + (bindings.includes("Visible") ? 16 : 0)];
    if (context.element.dynamicProperties.length || context.element.runtimeProperties.properties.length || shortened) row.push(context.element.dynamicProperties, context.element.runtimeProperties.unknown ? "unknown" : context.element.runtimeProperties.properties);
    if (shortened) row.push(true);
    return row;
  });
  const first = Object.values(targets)[0]; if (!first) throw new Error("Questa pagina non contiene elementi grafici modificabili nel sorgente allegato.");
  const snapshot = { ...first, targets, pageId: page.id, label: page.name };
  return { id: subtree ? `element:${document.file}:${subtree}` : `page:${page.id}`, root, kind: subtree ? "element" : "page", label: subtree ? document.nodes[subtree].label : page.name, snapshot,
    context: { name: page.name, route: page.route, file: document.file.split(/[\\/]/).at(-1), columns: ["id", "parent", "type", "text", "style", "editableBits", "dynamic", "runtime", "textShortened"], editableBits: "bit1=text,bit2=style,bit4=colorBinding,bit8=textBinding,bit16=visibilityBinding; absent dynamic/runtime=[]", rows, ...(templates.size ? { templates: [...templates.values()] } : {}), scope: page.stateValue ?? page.componentName ?? "local-page-module", ...(names.size > 1 && !page.componentName ? { sharedComponents: true } : {}) } };
}
export function aiContextAttachments(attachments: AiChatAttachment[]) {
  const same = (a: AiEditSnapshot, b: AiEditSnapshot) => a.document.file === b.document.file && a.document.source === b.document.source && a.document.nodes[a.selectedId]?.source.start === b.document.nodes[b.selectedId]?.source.start;
  return attachments.map((item, index) => ({ item, index })).filter(({ item }) => item.kind !== "element" || !item.snapshot || !attachments.some(page => page.kind === "page" && page.snapshot?.targets && Object.values(item.snapshot!.targets ?? { selection: item.snapshot! }).every(target => Object.values(page.snapshot!.targets!).some(other => same(target, other)))));
}
export function aiChatScope(attachments: AiChatAttachment[], dataReferences: readonly AiDataReference[] = []): AiEditSnapshot | undefined {
  if (!attachments.some(item => item.snapshot?.targets)) { const selected = attachments.find(item => item.kind === "element")?.snapshot; return selected && dataReferences.length ? { ...selected, dataReferences } : selected; }
  const targets: Record<string, AiEditSnapshot> = {};
  aiContextAttachments(attachments).forEach(({ item, index }) => {
    if (item.snapshot?.targets) for (const [id, target] of Object.entries(item.snapshot.targets)) targets[`a${index}_${id}`] = target;
    else if (item.snapshot) targets[`a${index}_selection`] = item.snapshot;
  });
  const first = Object.values(targets)[0]; return first && { ...first, targets, ...(dataReferences.length ? { dataReferences } : {}), label: "Pagine ed elementi allegati" };
}
export function aiAttachmentWireContext(item: AiChatAttachment, index: number): unknown {
  if (!item.snapshot?.targets) return item.context;
  const context = item.context as { rows: unknown[][]; [key: string]: unknown };
  return { ...context, rows: context.rows.map(row => [`a${index}_${row[0]}`, row[1] ? `a${index}_${row[1]}` : null, ...row.slice(2)]) };
}
