import type { HmiScriptBox, HmiScriptScalar, HmiScriptScreenItemManager, HmiScriptProcessValue, HmiScriptProcessValueContext } from "../src/core/hmiScript";
import type { HmiFlashingVisual } from "../src/core/hmiFlashing";
import type { Dynamization } from "../src/core/hmiStandard";
import type { HmiProcessValueSource } from "../src/core/hmiProcessValue";
import type { HmiQualitySource, HmiScriptQualityContext } from "../src/core/hmiCurrentQuality";

export interface HmiScreenItemSnapshot {
  itemId: string; name: string; screenId: string;
  faceplateId?: string; parentFaceplateId?: string; flashing: Dynamization[];
  /** False for CSS hosts, which reject negative Padding before publication. */
  paddingAllowsNegative?: boolean;
  geometryError?: string; boundingBox?: HmiScriptBox | null;
  properties?: Record<string, HmiScriptScalar>; processValue?: HmiProcessValueSource;
  parentItemId?: string; quality?: HmiQualitySource;
}
export interface HmiScreenPropertyCommand { itemId: string; property: string; value: HmiScriptScalar; valueRevision?: number }
export interface HmiPropertyFlashingCommand { itemId: string; property: string; enabled: boolean; color?: string; alternateColor?: string; periodMs: number }
export interface HmiPropertyFlashingSurface { resolveCurrentQuality?(sources:readonly HmiQualitySource[],context:HmiScriptQualityContext):number; resolveProcessValue?(source:HmiProcessValueSource,context:HmiScriptProcessValueContext,writing?:boolean):HmiScriptProcessValue; items(): HmiScreenItemSnapshot[]; apply(commands: HmiPropertyFlashingCommand[]): void; applyProperties?(commands: HmiScreenPropertyCommand[]): void; report?(message: string): void; measureBoundingBox?(itemId:string,signal:AbortSignal):Promise<HmiScriptBox|null> }
export function createHmiPropertyFlashing(surface: HmiPropertyFlashingSurface): { context(ownerId?: string): HmiScriptScreenItemManager; commands(): HmiPropertyFlashingCommand[]; propertyCommands(): HmiScreenPropertyCommand[]; reset(): void };
export function createHmiPropertyFlashingDomSurface(root: Document, identify?: (element: Element) => string, interactionEnabled?: () => boolean, onError?: (message:string)=>void): HmiPropertyFlashingSurface & { applyProperties(commands: HmiScreenPropertyCommand[]): void; allowsInteraction(element: Element): boolean; setDeclarative(element: Element, visuals: HmiFlashingVisual[]): void; suspend(): void; resume(): void; dispose(): void };
