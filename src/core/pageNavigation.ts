import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type * as t from "@babel/types";
import MagicString from "magic-string";
import { sections, type StandardSection } from "./hmiStandard";

export interface PageCategory {
  id: string;
  label: string;
  number: number;
  route: string;
  pages: string[];
  entries: { label: string; icon: string; route: string }[];
  menu: { panel: { left: number; top: number; width: number; height: number }; pointer: { left: number; top: number; width: number; height: number }; entry: { left: number; width: number; height: number; pitch: number; first: number } } | null;
}
const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;
function literal(node: t.Node): unknown {
  if (node.type === "StringLiteral" || node.type === "NumericLiteral" || node.type === "BooleanLiteral") return node.value;
  if (node.type === "NullLiteral") return null;
  if (node.type === "ArrayExpression") return node.elements.map((item) => { if (!item) throw Error("Voce vuota nella navigazione."); return literal(item); });
  if (node.type === "ObjectExpression") return Object.fromEntries(node.properties.map((item) => {
    if (item.type !== "ObjectProperty" || item.computed || (item.key.type !== "Identifier" && item.key.type !== "StringLiteral" && item.key.type !== "NumericLiteral")) throw Error("La navigazione contiene codice dinamico: non viene sovrascritto.");
    return [item.key.type === "Identifier" ? item.key.name : String(item.key.value), literal(item.value)];
  }));
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral") return -node.argument.value;
  throw Error("La navigazione contiene codice dinamico: non viene sovrascritta.");
}
function navigationArray(source: string) {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  let array: t.ArrayExpression | undefined;
  traverse(ast, { VariableDeclarator(path) { if (path.node.id.type === "Identifier" && path.node.id.name === "panelSections" && path.node.init?.type === "ArrayExpression") array = path.node.init; } });
  return array;
}
export function readPageCategories(source: string): PageCategory[] {
  const array = navigationArray(source);
  if (!array) return [];
  const value = literal(array) as PageCategory[];
  const seen = new Set<string>();
  const seenNumbers = new Set<number>();
  return value.map((item, index) => {
    if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id) || typeof item.label !== "string" || typeof item.route !== "string" || !Array.isArray(item.pages) || !item.pages.every((page) => typeof page === "string") || !Array.isArray(item.entries) || !item.entries.every((entry) => entry && typeof entry.label === "string" && typeof entry.icon === "string" && typeof entry.route === "string")) throw Error("La navigazione del pannello non è valida. Correggila prima di aggiungere categorie.");
    seen.add(item.id);
    const number = item.number ?? sections.find((section) => section.id === item.id)?.number ?? 10 + index;
    if (!Number.isInteger(number) || number < 1 || number > 99 || number === 9) throw Error("Numero categoria non valido: 9 è riservato ai popup.");
    const builtin = sections.find((section) => section.id === item.id);
    if (seenNumbers.has(number) || (builtin ? number !== builtin.number : number < 10)) throw Error("La numerazione delle categorie non è valida: le sezioni standard restano 1–7 e le nuove categorie usano 10–99 senza duplicati.");
    seenNumbers.add(number);
    return { ...item, number };
  });
}
export function withPageCategories(source: string, categories: PageCategory[]): string {
  const array = navigationArray(source);
  if (!array || array.start == null || array.end == null) throw Error("Questo progetto non usa la navigazione standard Framecraft. Le pagine libere restano disponibili.");
  const magic = new MagicString(source).overwrite(array.start, array.end, JSON.stringify(categories, null, 2));
  const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  traverse(ast, { VariableDeclarator(path) {
    if (path.node.id.type !== "Identifier" || path.node.id.name !== "screenRoutes" || path.node.init?.type !== "ObjectExpression") return;
    const routes = literal(path.node.init) as Record<string, string>;
    for (const category of categories) for (const [slot, entry] of category.entries.entries()) {
      if (entry.route) routes[String(category.number * 1000 + 1 + slot * 40)] ??= entry.route;
    }
    magic.overwrite(path.node.init.start!, path.node.init.end!, JSON.stringify(routes, null, 2));
  } });
  return magic.toString()
    .replace("{sectionIcons[section.id]}", "{sectionIcons[section.id] ?? Object.values(sectionIcons)[0]}")
    .replace("{entryIcons[entry.icon]}", "{entryIcons[entry.icon] ?? Object.values(entryIcons)[0]}");
}
export function newPageCategory(categories: PageCategory[], label: string): PageCategory {
  const name = label.trim();
  if (!name || name.length > 60 || /[\x00-\x1f]/.test(name)) throw Error("Inserisci un nome di categoria da 1 a 60 caratteri.");
  if (categories.some((item) => item.label.toLocaleLowerCase("it") === name.toLocaleLowerCase("it"))) throw Error("Esiste già una categoria con questo nome.");
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "categoria";
  let id = base;
  for (let index = 2; categories.some((item) => item.id === id) || sections.some((item) => item.id === id); index++) id = `${base}-${index}`;
  const number = Array.from({ length: 90 }, (_, i) => i + 10).find((candidate) => !categories.some((item) => item.number === candidate));
  if (number === undefined) throw Error("Sono disponibili al massimo 90 categorie personalizzate.");
  return { id, label: name, number, route: "", pages: [], entries: [], menu: null };
}
export function categorySection(category: PageCategory): StandardSection {
  const builtin = sections.find((item) => item.id === category.id);
  return builtin ?? { ...sections[1], id: category.id, label: category.label, number: category.number, slot: 7 };
}
export function withCategoryPage(categories: PageCategory[], id: string, page: { route: string; label: string; slot: number }): PageCategory[] {
  if (!categories.some((category) => category.id === id)) throw Error("La categoria scelta non esiste.");
  if (!Number.isInteger(page.slot) || page.slot < 0 || page.slot >= 14) throw Error("La categoria non ha una voce di menu disponibile.");
  return categories.map((category) => {
    if (category.id !== id) return category;
    if (category.pages.includes(page.route)) throw Error("La pagina è già presente in questa categoria.");
    const entries = category.entries.map((entry) => ({ ...entry }));
    while (entries.length <= page.slot) entries.push({ label: "Libero", icon: "screen", route: "" });
    if (entries[page.slot].route) throw Error("Questa voce di navigazione è già occupata.");
    entries[page.slot] = { label: page.label, icon: "screen", route: page.route };
    const height = Math.min(600, 10 + entries.length * 40);
    return { ...category, route: category.route || page.route, pages: [...category.pages, page.route], entries, menu: category.menu ? { ...category.menu, panel: { ...category.menu.panel, top: Math.min(category.menu.panel.top, 790 - height), height } } : { panel: { left: 131, top: 160, width: 260, height }, pointer: { left: 102, top: 180, width: 30, height: 43 }, entry: { left: 189, width: 158, height: 34, pitch: 40, first: 8 } } };
  });
}
