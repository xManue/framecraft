export interface HmiTrendSourceChoice {
    source: "online" | "log";
    tag: string;
    logId?: string;
    loggedTagId?: string;
}
export interface HmiTrendSourceCatalog {
    tags: readonly string[];
    logs: readonly {
        id: string;
        name: string;
        tags: readonly {
            id: string;
            name: string;
            tag: string;
        }[];
    }[];
}
export interface HmiTrendSourceCurve {
    id: string;
    name: string;
    sources: Record<string, HmiTrendSourceChoice>;
}
export interface HmiTrendZoomArea {
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
    xRange: [number, number];
    yRange: [number, number];
    rightRange?: [number, number];
}
interface TrendPickerState {
    curves: HmiTrendSourceCurve[];
    catalog: HmiTrendSourceCatalog;
    apply: (id: string, sources: Record<string, HmiTrendSourceChoice>) => void;
    reset: () => void;
    drafts: Map<string, Record<string, HmiTrendSourceChoice>>;
    selected?: string;
    catalogSignature: string;
}
interface TrendAreaZoomState {
    active: boolean;
    areas: HmiTrendZoomArea[];
    apply: (area: HmiTrendZoomArea) => void;
    drag?: {
        pointerId: number;
        area: HmiTrendZoomArea;
        start: [number, number];
        end: [number, number];
    };
}
export declare function renderTrendSourcePicker(root: HTMLElement, curves: HmiTrendSourceCurve[], catalog: HmiTrendSourceCatalog, apply: TrendPickerState["apply"], reset: () => void): void;
export declare function trendRuntimeZoomRange(range: [number, number], factor: number, shift?: number): [number, number];
export declare function trendAreaZoomDragging(svg: SVGSVGElement): boolean;
export declare function installTrendAreaZoom(svg: SVGSVGElement, active: boolean, areas: HmiTrendZoomArea[], apply: TrendAreaZoomState["apply"]): void;
export declare function trendQualityClass(qualityCode?: number): "good" | "uncertain" | "bad" | "unknown";
export declare function hmiTrendRuntimeUiModuleSource(): string;
export {};
