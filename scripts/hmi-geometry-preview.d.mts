import type { HmiScriptBox } from "../src/core/hmiScript";
import type { HmiPropertyFlashingSurface } from "./hmi-property-flashing.mjs";
export interface HmiGeometryPreviewPage { window: Window; origin: string; pageId: string }
export function createHmiGeometryPreviewClient(view: Window, endpoint: () => HmiGeometryPreviewPage | undefined, timeoutMs?: number): { measure(itemId: string, signal: AbortSignal): Promise<HmiScriptBox | null>; cancel(): void };
export function installHmiGeometryPreviewEndpoint(view: Window, surface: HmiPropertyFlashingSurface, context: () => { origin?: string; pageId: string }): () => void;
