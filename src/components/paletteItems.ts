import type { PageDefinition } from "../core/types";
import type { ProjectComponentDefinition } from "../core/projectIndex";

export function isPaletteProjectComponent(item: ProjectComponentDefinition, pages: PageDefinition[]): boolean {
  if (/^(App|Root|Main)$/.test(item.name)) return false;
  return !pages.some((page) => page.file.replaceAll("\\", "/").toLowerCase() === item.file.replaceAll("\\", "/").toLowerCase()
    && (item.isDefault || (page.componentName ? page.componentName === item.name : /Page$/.test(item.name) || page.file.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") === item.name)));
}
