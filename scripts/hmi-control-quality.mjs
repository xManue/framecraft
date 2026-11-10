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
        if (!Number.isInteger(code) || code < 0 || code > 199 || (code & ~199) !== 0 || ![0,1,2,4].includes(code & 7)) { bad=true;continue; }
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
    return [controlWireQuality,controlSampleCode,controlQuality,publishControlQuality,clearControlQuality,serviceQualitySignature,publishServiceQuality,alarmRecordQuality,alarmEventsQuality,alarmRowsQuality].map(String).join('\n');
}

/** Metadata that changes which service supplies the displayed data. */
export function serviceQualitySignature(host) {
    return JSON.stringify(['data-hmi-type','data-hmi-alarm-source','data-hmi-filter','data-hmi-alarm-summary'].map(name => host.getAttribute(name)));
}
/** The getter reads local state only; transport and command outcomes stay separate. */
export function publishServiceQuality(host, root, read) {
    const view=host.ownerDocument.defaultView;if(!view || !root)return;
    const records=view[Symbol.for('framecraft.control-quality.v1')] ??= new WeakMap();
    records.set(host,Object.freeze({kind:'service',signature:serviceQualitySignature(host),root,get quality(){try{return controlQuality([read()]);}catch{return 1;}},liveTags:Object.freeze([])}));
}
/** Raw source quality at acquisition time; missing legacy event metadata stays unknown. */
export function alarmRecordQuality(record) {
    if(!record||record.qualityDetails===undefined)return undefined;
    const details=record.qualityDetails;
    if(!details||details.version!==1||!Array.isArray(details.sources)||details.sources.length<1||details.sources.length>2||details.invalid!==undefined&&details.invalid!==true)return 1;
    const tags=new Set(),codes=[];
    if(details.invalid)codes.push(1);
    for(const source of details.sources){
        if(!source||typeof source.tag!=='string'||!source.tag.trim()||source.tag.length>200||tags.has(source.tag)||!['valid','missing','invalid'].includes(source.state))return 1;
        tags.add(source.tag);codes.push(controlWireQuality(source.qualityCode),source.state==='invalid'?1:source.state==='missing'?0:4);
    }
    return controlQuality(codes);
}
export function alarmEventsQuality(events) {
    return Array.isArray(events)?controlQuality(events.filter(event=>event?.state!=='Commented').map(event=>alarmRecordQuality(event)??0)):1;
}
/** Legacy rows contribute only the usability their older service actually reported. */
export function alarmRowsQuality(rows) {
    if(!Array.isArray(rows))return 1;
    return controlQuality(rows.filter(row=>row?.enabled!==false).map(row=>alarmRecordQuality(row)??(row?.quality==='good'&&typeof row.active==='boolean'?4:row?.quality==='unknown'?0:1)));
}
