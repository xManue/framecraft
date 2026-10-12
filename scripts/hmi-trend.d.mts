import type { PlcVariableDefinition } from "../src/core/plcVariables";
import type { HmiDataLogCatalog } from "../src/core/hmiDataLogs";
import { type HmiTrendSourceCatalog } from "./hmi-trend-runtime-ui.mjs";
export declare const hmiTrendAttribute = "data-hmi-trend";
export function trendCsvCell(value: unknown): string;
export declare const hmiTrendModes: readonly ["points", "interpolated", "stepped", "values"];
export declare const hmiTrendAggregations: readonly ["time-average-stepped", "min-max", "none"];
export declare const hmiTrendTimeZones: readonly (readonly [string, string])[];
export type HmiTrendAggregation = (typeof hmiTrendAggregations)[number];
export function trendTimeZoneValid(timeZone: string): boolean;
export function trendFormatTime(time: number, timeZone?: string, date?: boolean): string;
export function aggregateTrendSamples(source: readonly HmiTrendSample[], from: number, to: number, pixels: number, mode?: HmiTrendAggregation): { samples: HmiTrendSample[]; rawCount: number; aggregated: boolean; buckets: number };
export type HmiTrendMode = (typeof hmiTrendModes)[number];
export type HmiTrendAxisSide = "left" | "right";
export type HmiTrendScale = "linear" | "logarithmic" | "negative-logarithmic";
export type HmiTrendSource = "online" | "log";
export interface HmiTrendAxis {
    minimum?: number;
    maximum?: number;
    scale: HmiTrendScale;
    unit?: string;
}
export interface HmiTrendSeries {
    id: string;
    name: string;
    tag: string;
    source: HmiTrendSource;
    logId?: string;
    loggedTagId?: string;
    areaId: string;
    color: string;
    mode: HmiTrendMode;
    axis: HmiTrendAxisSide;
    visible: boolean;
    lowThreshold?: number;
    highThreshold?: number;
}
export interface HmiTrendArea {
    id: string;
    name: string;
    weight: number;
    leftAxis?: HmiTrendAxis;
    rightAxis?: HmiTrendAxis;
}
export interface HmiTrendConfig {
    version: 1;
    caption: string;
    timeRangeMs: number;
    sampleIntervalMs: number;
    timeZone: string;
    aggregation: HmiTrendAggregation;
    online: boolean;
    showToolbar: boolean;
    showLegend: boolean;
    showGrid: boolean;
    showRuler: boolean;
    backColor: string;
    plotColor: string;
    leftAxis: HmiTrendAxis;
    rightAxis: HmiTrendAxis;
    areas: HmiTrendArea[];
    trends: HmiTrendSeries[];
}
export interface HmiTrendIssue {
    severity: "error" | "warning";
    message: string;
}
export interface HmiTrendSample {
    time: number;
    value: number;
    qualityCode?: number;
    aggregated?: boolean;
}
export interface HmiTrendRenderOptions {
    now?: number;
    sample?: boolean;
    status?: Readonly<Record<string, {
        qualityCode?: number;
    }>>;
    sources?: HmiTrendSourceCatalog;
    exportCsv?: (fileName: string, content: string) => void;
    history?: (trend: HmiTrendSeries, from: number, to: number) => readonly HmiTrendSample[];
}
export declare function defaultHmiTrendConfig(): HmiTrendConfig;
export declare function parseHmiTrendConfig(value: unknown): HmiTrendConfig | undefined;
export declare function serializeHmiTrendConfig(config: HmiTrendConfig): string;
export declare function hmiTrendIssues(config: HmiTrendConfig, variables?: readonly PlcVariableDefinition[], dataLogs?: HmiDataLogCatalog): HmiTrendIssue[];
export declare function trendArgb(value: string): string;
export declare function trendAxisValue(value: number, scale: HmiTrendScale): number | undefined;
export declare function trendAxisLabel(value: number, scale: HmiTrendScale): string;
export declare function trendAxisRange(config: HmiTrendAxis, samples: readonly number[]): [number, number];
export declare function trendPath(mode: HmiTrendMode, points: readonly [number, number][]): string;
export declare function appendTrendText(parent: Element, name: string, text: string, attributes?: Record<string, string | number>): SVGElement;
export declare function renderHmiTrendControl(host: HTMLElement, values: Readonly<Record<string, string>>, options?: HmiTrendRenderOptions): boolean;
export declare function renderHmiTrendControls(root: ParentNode, values: Readonly<Record<string, string>>, options?: HmiTrendRenderOptions): number;
export declare function clearHmiTrendHistory(host: HTMLElement): void;
export declare function hmiTrendJsx(): string;
export declare function hmiTrendRuntimeModuleSource(): string;
