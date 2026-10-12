import type { PlcVariableDefinition } from "../src/core/plcVariables";
import type { HmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { type HmiTrendAxis, type HmiTrendIssue, type HmiTrendMode } from "./hmi-trend.mjs";
import { type HmiTrendSourceCatalog } from "./hmi-trend-runtime-ui.mjs";
export declare const hmiFunctionTrendAttribute = "data-hmi-function-trend";
export function clearHmiFunctionTrendHistory(host: HTMLElement): void;
export interface HmiFunctionTrendSource {
    source: "online" | "log";
    tag: string;
    logId?: string;
    loggedTagId?: string;
}
export interface HmiFunctionTrendRange {
    kind: "rolling" | "interval" | "points";
    durationMs: number;
    startTime?: number;
    endTime?: number;
    measuringPoints: number;
}
export interface HmiFunctionTrendSeries {
    id: string;
    name: string;
    areaId: string;
    color: string;
    mode: HmiTrendMode;
    visible: boolean;
    x: HmiFunctionTrendSource;
    y: HmiFunctionTrendSource;
    range: HmiFunctionTrendRange;
    pairToleranceMs: number;
    lowThreshold?: number;
    highThreshold?: number;
}
export interface HmiFunctionTrendArea {
    id: string;
    name: string;
    weight: number;
    xAxis: HmiTrendAxis;
    yAxis: HmiTrendAxis;
}
export interface HmiFunctionTrendConfig {
    version: 1;
    caption: string;
    sampleIntervalMs: number;
    maxPoints: number;
    online: boolean;
    showToolbar: boolean;
    showLegend: boolean;
    showGrid: boolean;
    showRuler: boolean;
    backColor: string;
    plotColor: string;
    areas: HmiFunctionTrendArea[];
    trends: HmiFunctionTrendSeries[];
}
export interface HmiFunctionTrendValue {
    time: number;
    value: string;
    qualityCode?: number;
}
export interface HmiFunctionTrendPoint {
    time: number;
    x: number;
    y: number;
    xQualityCode?: number;
    yQualityCode?: number;
}
export interface HmiFunctionTrendRenderOptions {
    now?: number;
    sample?: boolean;
    sources?: HmiTrendSourceCatalog;
    history?: (source: HmiFunctionTrendSource, from: number, to: number) => readonly HmiFunctionTrendValue[];
    status?: Readonly<Record<string, {
        qualityCode?: number;
    }>>;
    exportCsv?: (fileName: string, content: string) => void;
}
export declare function defaultHmiFunctionTrendConfig(): HmiFunctionTrendConfig;
export declare function parseHmiFunctionTrendConfig(value: unknown): HmiFunctionTrendConfig | undefined;
export declare function serializeHmiFunctionTrendConfig(config: HmiFunctionTrendConfig): string;
export declare function hmiFunctionTrendIssues(config: HmiFunctionTrendConfig, variables?: readonly PlcVariableDefinition[], dataLogs?: HmiDataLogCatalog): HmiTrendIssue[];
export declare function functionTrendNumericValues(raw: string | undefined): number[] | undefined;
export declare function pairFunctionTrendSamples(xValues: readonly HmiFunctionTrendValue[], yValues: readonly HmiFunctionTrendValue[], toleranceMs: number): {
    points: HmiFunctionTrendPoint[];
    unmatched: number;
};
export declare function renderHmiFunctionTrendControl(host: HTMLElement, values: Readonly<Record<string, string>>, options?: HmiFunctionTrendRenderOptions): boolean;
export declare function renderHmiFunctionTrendControls(root: ParentNode, values: Readonly<Record<string, string>>, options?: HmiFunctionTrendRenderOptions): number;
export declare function hmiFunctionTrendJsx(): string;
export declare function hmiFunctionTrendRuntimeModuleSource(): string;
