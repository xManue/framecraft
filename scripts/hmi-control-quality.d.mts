export declare function controlWireQuality(raw?: number): number;
export declare function controlSampleCode(status?: {qualityCode?:number;qualityKnown?:boolean;localValue?:boolean;lastError?:number}): number | undefined;
export declare function controlQuality(codes: Iterable<number>): number;
export declare function publishControlQuality(host: HTMLElement, root: HTMLElement, signature: string, codes: Iterable<number>, liveTags: Iterable<string>): void;
export declare function clearControlQuality(host: HTMLElement): void;
export declare function hmiControlQualityModuleSource(): string;
