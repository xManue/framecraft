import type { HmiScriptCatalog } from './hmiScriptModules';
import type { ScriptLibraryInterfaceChange } from './scriptLibrary';
import type { MigrationArgument, ScriptSymbolMigration } from './scriptReferenceMigration';
import type { PageDefinition } from './types';
import { joinProjectPath } from './paths';
export interface LibraryMigrationTarget {
  key: string;
  alias: string;
  name: string;
  kind: 'function' | 'variable';
  parameters: string[];
}
export type LibraryArgumentChoice = {
  kind: 'argument';
  index: number;
} | {
  kind: 'fixed';
  type: 'string' | 'number' | 'boolean' | 'null';
  text: string;
} | {
  kind: 'undefined';
} | {
  kind: 'unset';
};
export interface LibraryMappingChoice {
  target: string;
  arguments: LibraryArgumentChoice[];
}
export function libraryMigrationTargets(catalog: HmiScriptCatalog, kind: 'function' | 'variable'): LibraryMigrationTarget[] {
  const result: LibraryMigrationTarget[] = [];
  for (const module of catalog.globalModules) {
    if (kind === 'function') for (const fn of module.functions) result.push({
      key: JSON.stringify([module.alias, fn.name]),
      alias: module.alias,
      name: fn.name,
      kind,
      parameters: fn.parameters
    });else for (const item of module.globalDefinition?.program?.exports ?? []) result.push({
      key: JSON.stringify([module.alias, item.name]),
      alias: module.alias,
      name: item.name,
      kind,
      parameters: []
    });
  }
  return result.sort((a, b) => (a.alias + '.' + a.name).localeCompare(b.alias + '.' + b.name));
}
export function chooseLibraryMigrationTarget(change: ScriptLibraryInterfaceChange, catalog: HmiScriptCatalog, key: string): LibraryMappingChoice {
  const target = libraryMigrationTargets(catalog, change.kind).find(item => item.key === key);
  return {
    target: target?.key ?? '',
    arguments: target?.parameters.map(name => {
      const index = change.parameters.indexOf(name);
      return index >= 0 ? {
        kind: 'argument',
        index
      } : {
        kind: 'unset'
      };
    }) ?? []
  };
}
export function initialLibraryMigrationChoices(changes: ScriptLibraryInterfaceChange[], catalog: HmiScriptCatalog): LibraryMappingChoice[] {
  return changes.map(change => chooseLibraryMigrationTarget(change, catalog, JSON.stringify([change.alias, change.name])));
}
export function libraryMigrationRules(changes: ScriptLibraryInterfaceChange[], catalog: HmiScriptCatalog, choices: LibraryMappingChoice[]): ScriptSymbolMigration[] {
  if (choices.length !== changes.length) throw Error('Completa il collegamento di tutte le interfacce cambiate.');
  return changes.map((change, index) => {
    const choice = choices[index],
      target = libraryMigrationTargets(catalog, change.kind).find(item => item.key === choice.target),
      name = 'Modules.' + change.alias + '.' + change.name;
    if (!target) throw Error('Scegli la nuova ' + (change.kind === 'function' ? 'funzione' : 'variabile pubblica') + ' per ' + name + '.');
    if (change.kind === 'variable') return {
      kind: change.kind,
      fromAlias: change.alias,
      fromName: change.name,
      toAlias: target.alias,
      toName: target.name
    };
    if (choice.arguments.length !== target.parameters.length) throw Error('Collega tutti i parametri di ' + name + '.');
    const arguments_: MigrationArgument[] = choice.arguments.map((argument, param) => {
      if (argument.kind === 'argument') {
        if (!Number.isInteger(argument.index) || argument.index < 0 || argument.index >= change.parameters.length) throw Error('Parametro precedente non disponibile per ' + name + '.');
        return argument;
      }
      if (argument.kind === 'undefined') return argument;
      if (argument.kind !== 'fixed') throw Error('Scegli il valore di ' + target.parameters[param] + ' in Modules.' + target.alias + '.' + target.name + '.');
      if (argument.type === 'null') return {
        kind: 'literal',
        value: null
      };
      if (argument.type === 'boolean') {
        if (!['true', 'false'].includes(argument.text)) throw Error('Scegli Vero o Falso per ' + target.parameters[param] + '.');
        return {
          kind: 'literal',
          value: argument.text === 'true'
        };
      }
      if (argument.type === 'string') {
        if (argument.text.length > 20000) throw Error('Il testo fisso supera 20.000 caratteri.');
        return {
          kind: 'literal',
          value: argument.text
        };
      }
      const text = argument.text.trim().replace(',', '.');
      if (!text || !Number.isFinite(Number(text))) throw Error('Inserisci un numero finito per ' + target.parameters[param] + '.');
      return {
        kind: 'literal',
        value: Number(text)
      };
    });
    return {
      kind: change.kind,
      fromAlias: change.alias,
      fromName: change.name,
      toAlias: target.alias,
      toName: target.name,
      arguments: arguments_
    };
  });
}
export function libraryMigrationPageScopes(files: Readonly<Record<string, string>>, pages: readonly PageDefinition[], root: string): Record<string, string[]> {
  const normalize = (value: string) => {
      const path = value.replaceAll('\\', '/').replace(/^\/\/\?\//, '');
      return /^[A-Za-z]:\//.test(path) ? path.toLowerCase() : path;
    },
    result: Record<string, string[]> = {};
  for (const file of Object.keys(files)) {
    const routes = [...new Set(pages.filter(page => normalize(page.file) === normalize(joinProjectPath(root, file))).map(page => page.route))];
    if (routes.length) result[file] = routes;
  }
  return result;
}
