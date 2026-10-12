import type { HmiFaceplateCatalog, HmiFaceplateInstanceBinding, HmiFaceplateTypeDefinition } from "../src/core/hmiFaceplates";
export interface HmiFaceplateVisualRenderOptions {
  localValues?: (host: Element, type: HmiFaceplateTypeDefinition, binding: HmiFaceplateInstanceBinding) => Readonly<Record<string, string>> | undefined;
}
export function renderHmiFaceplateInstance(host: HTMLElement, catalog: HmiFaceplateCatalog, instance: HmiFaceplateInstanceBinding, values: Readonly<Record<string, string>>, options?: HmiFaceplateVisualRenderOptions, stack?: readonly string[]): boolean;
export function findHmiFaceplateRuntimeType(catalog: HmiFaceplateCatalog, runtimeName: string): HmiFaceplateTypeDefinition | undefined;
export function renderHmiFaceplates(root: ParentNode, catalog: HmiFaceplateCatalog, values: Readonly<Record<string, string>>, options?: HmiFaceplateVisualRenderOptions): number;
export function hmiFaceplateVisualRuntimeModuleSource(): string;
