import type { HmiScriptScalar, HmiScriptScreenItemManager } from "../src/core/hmiScript";
import type { HmiFlashingVisual } from "../src/core/hmiFlashing";
import type { Dynamization } from "../src/core/hmiStandard";

export interface HmiScreenItemSnapshot { itemId: string; name: string; screenId: string; faceplateId?: string; flashing: Dynamization[]; properties?: Record<string, HmiScriptScalar> }
export interface HmiScreenPropertyCommand { itemId: string; property: string; value: HmiScriptScalar }
export interface HmiPropertyFlashingCommand { itemId: string; property: string; enabled: boolean; color?: string; alternateColor?: string; periodMs: number }
export interface HmiPropertyFlashingSurface { items(): HmiScreenItemSnapshot[]; apply(commands: HmiPropertyFlashingCommand[]): void; applyProperties?(commands: HmiScreenPropertyCommand[]): void; report?(message: string): void }
export function createHmiPropertyFlashing(surface: HmiPropertyFlashingSurface): { context(ownerId?: string): HmiScriptScreenItemManager; commands(): HmiPropertyFlashingCommand[]; propertyCommands(): HmiScreenPropertyCommand[]; reset(): void };
export function createHmiPropertyFlashingDomSurface(root: Document, identify?: (element: Element) => string, interactionEnabled?: () => boolean): HmiPropertyFlashingSurface & { applyProperties(commands: HmiScreenPropertyCommand[]): void; allowsInteraction(element: Element): boolean; setDeclarative(element: Element, visuals: HmiFlashingVisual[]): void; suspend(): void; resume(): void; dispose(): void };
