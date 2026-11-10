export declare function controlWireQuality(raw?: number): number;
export declare function controlSampleCode(status?: {qualityCode?:number;qualityKnown?:boolean;localValue?:boolean;lastError?:number}): number | undefined;
export declare function controlQuality(codes: Iterable<number>): number;
export declare function publishControlQuality(host: HTMLElement, root: HTMLElement, signature: string, codes: Iterable<number>, liveTags: Iterable<string>): void;
export declare function clearControlQuality(host: HTMLElement): void;
export declare function hmiControlQualityModuleSource(): string;

export declare function serviceQualitySignature(host: Element): string;
export declare function publishServiceQuality(host: HTMLElement, root: Element, read: () => number): void;
export declare function alarmRowsQuality(rows: readonly {enabled?: boolean; quality?: string; active?: boolean|null}[]): number;

export declare function alarmRecordQuality(record: unknown): number | undefined;
export declare function alarmEventsQuality(events: readonly unknown[]): number;
