/** Quality of a rendered control. Shared across generated modules without DOM metadata. */
export function controlWireQuality(raw) {
    if (raw === undefined) return 0;
    if (!Number.isInteger(raw) || raw < 0 || raw > 65535) return 1;
    const base = (raw & 0xc0) === 0 ? 1 : (raw & 0xc0) === 64 ? 2 : 4;
    return base | ((raw & 3) === 1 ? 128 : (raw & 3) === 2 ? 64 : 0);
}
export function controlSampleCode(status) {
    if(status && (status.qualityKnown !== undefined && typeof status.qualityKnown !== 'boolean' || status.localValue !== undefined && typeof status.localValue !== 'boolean' || status.lastError !== undefined && !Number.isFinite(status.lastError))) return NaN;
    if (status?.lastError) return 0;
    return status?.qualityKnown === false || status?.localValue ? undefined : status?.qualityCode;
}
export function controlQuality(codes) {
    let bad=false,none=false,uncertain=false,flags=0,count=0;
    for (const code of codes) {
        count++;
        if (!Number.isInteger(code) || code < 0 || (code & ~199) !== 0 || ![0,1,2,4].includes(code & 7)) { bad=true;continue; }
        const base=code & 7;bad ||= base === 1;none ||= base === 0;uncertain ||= base === 2;flags |= code & 192;
    }
    return (bad ? 1 : none || !count ? 0 : uncertain ? 2 : 4) | flags;
}
export function publishControlQuality(host, root, signature, codes, liveTags) {
    const view=host.ownerDocument.defaultView;if (!view) return;
    const key=Symbol.for('framecraft.control-quality.v1');
    const records=view[key] ??= new WeakMap();
    records.set(host,Object.freeze({signature,root,quality:controlQuality(codes),liveTags:Object.freeze([...new Set(liveTags)])}));
}
export function clearControlQuality(host) {
    host.ownerDocument.defaultView?.[Symbol.for('framecraft.control-quality.v1')]?.delete(host);
}
export function hmiControlQualityModuleSource() {
    return [controlWireQuality,controlSampleCode,controlQuality,publishControlQuality,clearControlQuality].map(String).join('\n');
}
