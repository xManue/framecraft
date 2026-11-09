// Shared by the editor bridge and the generated runtime. References contain IDs, never DOM objects.
export function createHmiPropertyFlashing(surface) {
  const state = new Map();
  const propertyState = new Map(),processValueVersions=new Map();
  const syncProcessValue=item=>{const values=propertyState.get(item.itemId);if(!values?.has("ProcessValue"))return;const source=item.processValue,version=processValueVersions.get(item.itemId);if(source?.binding||version!==undefined&&Number.isSafeInteger(source?.revision)&&source.revision>version){if(source&&!source.binding&&source.value!==undefined&&source.value!==null)values.set("ProcessValue",source.value);else values.delete("ProcessValue");processValueVersions.set(item.itemId,source?.revision);}};
  let revision = 0;
  const reported = new Set();
  const properties = ["BackColor", "ForeColor", "BorderColor"];
  const fontProperties = ["Name", "Size", "Weight", "Italic", "Underline", "StrikeOut"];
  const pivotProperties=["RotationCenterPlacement","RotationCenterX","RotationCenterY"];
  const insetSides=["Left","Top","Right","Bottom"];
  const validateInt32Inset=(property,value)=>{if(typeof value!=="number"||!Number.isInteger(value)||value < -2147483648||value>2147483647)throw new Error(property+" richiede un numero intero tra -2147483648 e 2147483647 (Int32).");};
  const propertyKey = (reference, property) => {
    if (reference.screenPropertyPath === "Font") {
      if (!fontProperties.includes(property)) throw new Error("Font non espone la proprieta' " + property + ".");
      return "Font." + property;
    }
    if(["Margin","Padding"].includes(reference.screenPropertyPath)){
      if(!insetSides.includes(property))throw new Error(reference.screenPropertyPath+" non espone la proprieta' "+property+".");
      return reference.screenPropertyPath+"."+property;
    }
    if (property.includes(".")) throw new Error("Accedi alle proprieta' annidate tramite il riferimento Font, Margin o Padding.");
    return property;
  };
  const color = (value) => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return "#" + value.toString(16).padStart(8, "0");
    if (typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) return value;
    throw new Error("PropertyFlashing richiede colori RGB/ARGB numerici o esadecimali.");
  };
  const commands = () => {
    const live = new Set(surface.items().map((item) => item.itemId));
    for (const itemId of state.keys()) if (!live.has(itemId)) state.delete(itemId);
    return [...state.values()].flatMap((entries) => [...entries.values()]);
  };
  const report = (message) => { if (!reported.has(message)) { if (reported.size >= 256) reported.delete(reported.values().next().value); reported.add(message); surface.report?.(message); } };
  const publish = () => surface.apply(commands());
  const propertyCommands = () => {
    const items=surface.items(),live = new Set(items.map((item) => item.itemId));
    for(const item of items)syncProcessValue(item);
    for (const itemId of propertyState.keys()) if (!live.has(itemId)){propertyState.delete(itemId);processValueVersions.delete(itemId);}
    return [...propertyState].flatMap(([itemId, values]) => [...values].map(([property, value]) => ({ itemId, property, value,...(property==="ProcessValue"&&Number.isSafeInteger(processValueVersions.get(itemId))?{valueRevision:processValueVersions.get(itemId)}:{}) })));
  };
  return {
    commands,
    propertyCommands,
    reset() { revision++; reported.clear(); state.clear(); propertyState.clear();processValueVersions.clear(); surface.applyProperties?.([]); publish(); },
    context(ownerId) {
      const contextRevision = revision;
      const assertActive = () => { if (contextRevision !== revision) throw new Error("Il contesto oggetti HMI non e' piu' attivo."); };
      const itemFor = (reference) => {
        assertActive();
        if (!reference || typeof reference.screenItemId !== "string" || (reference.screenPropertyPath !== undefined && !["Font","Margin","Padding"].includes(reference.screenPropertyPath))) throw new Error("Riferimento grafico HMI non valido.");
        const items = surface.items();
        if (ownerId && !items.some((item) => item.itemId === ownerId)) throw new Error("L'oggetto HMI del contesto non e' piu' disponibile.");
        const item = items.find((candidate) => candidate.itemId === reference.screenItemId);
        if (!item) throw new Error("L'oggetto HMI non e' piu' disponibile.");
        return item;
      };
      const rootFor=(scope)=>{
        assertActive();const items=surface.items(),owner=ownerId?items.find(item=>item.itemId===ownerId):undefined;
        if(ownerId&&!owner)throw new Error("L'oggetto HMI del contesto non e' piu' disponibile.");
        const screens=items.filter(item=>item.itemId===item.screenId),rootId=scope==="faceplate"?owner?.faceplateId:owner?.screenId??(screens.length===1?screens[0].itemId:undefined);
        if(!rootId)throw new Error(scope==="faceplate"?"Faceplate richiede il contesto di un'istanza faceplate.":"Screen non identifica una schermata univoca.");
        return {items,rootId};
      };
      const members=(items,rootId,scope)=>items.filter(item=>{
        if(item.itemId===rootId)return false;
        const container=item.itemId===item.faceplateId?item.parentFaceplateId:item.faceplateId;
        return scope==="faceplate"?container===rootId:item.screenId===rootId&&!container;
      });
      const validateInset=(item,part,side,value)=>{
        validateInt32Inset(part+"."+side,value);
        if(part==="Padding"&&value<0&&item.paddingAllowsNegative===false)throw new Error("Padding."+side+": questo elemento HTML richiede un valore non negativo; usa Margin per gli spostamenti esterni.");
      };
      const setInsets=(reference,part,value)=>{
        const item=itemFor(reference);
        if(reference.screenPropertyPath)throw new Error("Assegna "+part+" all'oggetto grafico, non a una sua parte.");
        if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==4||!insetSides.every(side=>Object.hasOwn(value,side)))throw new Error(part+" richiede Left, Top, Right, Bottom.");
        for(const side of insetSides){if(!Object.hasOwn(item.properties??{},part+"."+side))throw new Error("L'oggetto HMI non espone "+part+" nel layout corrente.");validateInset(item,part,side,value[side]);}
        if(!surface.applyProperties)throw new Error("Il contesto corrente non permette modifiche grafiche.");
        const previous=propertyState.get(item.itemId),next=new Map(previous);
        for(const side of insetSides)next.set(part+"."+side,value[side]);
        if(previous&&insetSides.every(side=>previous.get(part+"."+side)===value[side]))return;
        propertyState.set(item.itemId,next);
        try{surface.applyProperties(propertyCommands());}catch(error){if(previous)propertyState.set(item.itemId,previous);else propertyState.delete(item.itemId);try{surface.applyProperties(propertyCommands());}catch{report("Il layout non e' stato ripristinato completamente: ricarica la pagina.");}throw error;}
      };
      return {
        items(scope){const {items,rootId}=rootFor(scope);return members(items,rootId,scope).map(item=>({screenItemId:item.itemId}));},
        resolve(scope, name) {
          assertActive();
          const items = surface.items();
          const owner = ownerId ? items.find((item) => item.itemId === ownerId) : undefined;
          if (ownerId && !owner) throw new Error("L'oggetto HMI del contesto non e' piu' disponibile.");
          const screens = items.filter((item) => item.itemId === item.screenId);
          const screenId = owner?.screenId ?? (screens.length === 1 ? screens[0].itemId : undefined);
          const faceplateId = owner?.faceplateId;
          if (scope === "item") {
            if (!owner) throw new Error("item richiede un evento o una dinamizzazione di un oggetto HMI.");
            return { screenItemId: owner.itemId };
          }
          const rootId = scope === "faceplate" ? faceplateId : screenId;
          if (!rootId) throw new Error(scope === "faceplate" ? "Faceplate richiede il contesto di un'istanza faceplate." : "Screen non identifica una schermata univoca.");
          let matches=name===undefined?items.filter(item=>item.itemId===rootId):members(items,rootId,scope).filter(item=>item.name===name);
          // Preserve the historical explicit lookup of the root by its own name.
          if(!matches.length&&name!==undefined)matches=items.filter(item=>item.itemId===rootId&&item.name===name);
          if (matches.length !== 1) throw new Error(matches.length ? "Nome oggetto HMI duplicato: " + name : "Oggetto HMI non trovato: " + (name ?? scope));
          return { screenItemId: matches[0].itemId };
        },
        processValue(reference,context,writing=false){
          const item=itemFor(reference);if(reference.screenPropertyPath)throw new Error('ProcessValue richiede un oggetto grafico, non una sua parte.');
          syncProcessValue(item);const source=item.processValue;if(!source)throw new Error("L'oggetto non espone ProcessValue: scegli un campo valore o configura il collegamento della proprietà.");
          if(source.error)throw new Error(source.error);
          const definition=surface.resolveProcessValue?surface.resolveProcessValue(source,context,writing):source.binding?(()=>{throw new Error('Il collegamento ProcessValue richiede i componenti Runtime aggiornati.');})():{...source,dataType:source.dataType??'WString',access:'read-write'};
          const values=propertyState.get(item.itemId);return !definition.tag&&values?.has('ProcessValue')?{...definition,value:values.get('ProcessValue')}:definition;
        },
        get(reference, property) {
          const item = itemFor(reference);
          if (!reference.screenPropertyPath && property === "Font") {
            if (!fontProperties.some((name) => Object.hasOwn(item.properties ?? {}, "Font." + name))) throw new Error("L'oggetto HMI non espone Font: serve un testo univoco o un campo input.");
            return { screenItemId: item.itemId, screenPropertyPath: "Font" };
          }
          if(!reference.screenPropertyPath&&["Margin","Padding"].includes(property)){
            if(!insetSides.every(side=>Object.hasOwn(item.properties??{},property+"."+side)))throw new Error("L'oggetto HMI non espone "+property+" nel layout corrente.");
            return {screenItemId:item.itemId,screenPropertyPath:property};
          }
          const key = propertyKey(reference, property);
          if (key === "Name") return item.name;
          if (!Object.prototype.hasOwnProperty.call(item.properties ?? {}, key)) throw new Error(key === "RotationAngle" ? "L'oggetto HMI non espone RotationAngle: usa un contenitore con una trasformazione CSS 2D piana risolvibile." : "L'oggetto HMI non espone la proprieta' " + key + ".");
          const overrides = propertyState.get(item.itemId);
          const value = overrides?.has(key) ? overrides.get(key) : item.properties[key];
          if (value === null && properties.includes(key)) throw new Error("Il colore base " + key + " non e' risolvibile come RGB nel contesto corrente.");
          if(value===null&&key==="RotationAngle")throw new Error("RotationAngle richiede un angolo intero Int16 in gradi: imposta un valore tra -32768 e 32767.");
          if(value===null&&reference.screenPropertyPath==="Margin")throw new Error("La proprieta' base "+key+" non e' risolvibile come Int32: imposta un margine intero in pixel; auto e frazioni non possono essere letti come interi.");
          if(value===null&&reference.screenPropertyPath==="Padding")throw new Error("La proprieta' base "+key+" non e' risolvibile come Int32: imposta uno spazio interno intero in pixel; frazioni e percentuali non risolte non possono essere lette come interi.");
          if (value === null && reference.screenPropertyPath) throw new Error("La proprieta' base " + key + " non e' risolvibile nel contesto corrente.");
          return value;
        },
        set(reference, property, value) {
          const item = itemFor(reference);
          if (!reference.screenPropertyPath && property === "Font") throw new Error("Font e' un riferimento grafico non sostituibile: modifica le sue proprieta'.");
          const key = propertyKey(reference, property);
          if (key === "Name") throw new Error("Name e' in sola lettura nel Runtime: modifica il nome nell'Inspector.");
          if (!Object.prototype.hasOwnProperty.call(item.properties ?? {}, key)) throw new Error(key === "RotationAngle" ? "L'oggetto HMI non espone RotationAngle: usa un contenitore con una trasformazione CSS 2D piana risolvibile." : "L'oggetto HMI non espone la proprieta' " + key + ".");
          if(key==="RotationCenterPlacement"){if(![0,1,2].includes(value))throw new Error("RotationCenterPlacement richiede AbsoluteFromCenter (0), NormedFromCenter (1) o AbsoluteToContainer (2).");}
          else if(["RotationCenterX","RotationCenterY"].includes(key)){if(typeof value!=="number"||!Number.isFinite(value)||!Number.isFinite(Math.fround(value)))throw new Error(key+" richiede un Float finito, anche negativo.");}
          else if(key==="RotationAngle"){if(typeof value!=="number"||!Number.isInteger(value)||value < -32768||value > 32767)throw new Error("RotationAngle richiede un numero intero tra -32768 e 32767 (Int16).");}
          else if(key==='ProcessValue'){
            if(item.processValue?.binding)throw new Error('ProcessValue collegato deve passare dal motore script e dal trasporto tag.');
            if(value===null||!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>20000)throw new Error('ProcessValue richiede un valore scalare valido.');
          }
          else if(key.startsWith("Margin.")||key.startsWith("Padding."))validateInset(item,reference.screenPropertyPath,property,value);
          else if (["Visible", "Enabled", "Font.Italic", "Font.Underline"].includes(key)) {
            if (typeof value !== "boolean") throw new Error(key + " richiede un Boolean.");
          } else if (key === "Font.Name") {
            if (typeof value !== "string" || value.length > 20000 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Font.Name richiede una stringa fino a 20000 caratteri senza caratteri di controllo.");
          } else if (key === "Font.Size") {
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isFinite(Math.fround(value))) throw new Error("Font.Size richiede un Float finito non negativo in DIU.");
          } else if (key === "Font.Weight") {
            if (![0, 300, 400, 600, 700].includes(value)) throw new Error("Font.Weight richiede HmiFontWeight: None (0), Light (300), Normal (400), SemiBold (600) o Bold (700).");
          } else if (key === "Font.StrikeOut") {
            if (![0, 1].includes(value)) throw new Error("Font.StrikeOut richiede HmiFontStrikeOut: None (0) o Single (1), non Boolean.");
          } else if (key === "Text") {
            if (typeof value !== "string" || value.length > 20000) throw new Error("Text richiede una stringa fino a 20000 caratteri.");
          } else if (["Left", "Top", "Width", "Height", ...properties].includes(key)) {
            const signed = key === "Left" || key === "Top";
            if (typeof value !== "number" || !Number.isInteger(value) || value < (signed ? -2147483648 : 0) || value > (signed ? 2147483647 : 0xffffffff)) throw new Error(key + " richiede un " + (signed ? "Int32." : "UInt32."));
          } else throw new Error("Proprieta' grafica non supportata: " + key);
          if (!surface.applyProperties) throw new Error("Il contesto corrente non permette modifiche grafiche.");
          if (propertyState.get(item.itemId)?.get(key) === value) return;
          const previous=propertyState.get(item.itemId),next=new Map(previous);
          if(pivotProperties.includes(key))for(const name of pivotProperties){const part=name===key?value:previous?.has(name)?previous.get(name):item.properties[name];if(name==="RotationCenterPlacement"?![0,1,2].includes(part):typeof part!=="number"||!Number.isFinite(part)||!Number.isFinite(Math.fround(part)))throw new Error("Il centro di rotazione non e' risolvibile: usa un contenitore grafico 2D con dimensioni e origine esplicite.");next.set(name,part);}
          else next.set(key,value);
          propertyState.set(item.itemId,next);
          if(key==='ProcessValue')processValueVersions.set(item.itemId,item.processValue?.revision);
          try{surface.applyProperties(propertyCommands());}catch(error){if(key==='ProcessValue')processValueVersions.set(item.itemId,surface.items().find(item=>item.itemId===reference.screenItemId)?.processValue?.revision);if(previous)propertyState.set(item.itemId,previous);else propertyState.delete(item.itemId);try{surface.applyProperties(propertyCommands());}catch{report("Il layout non e' stato ripristinato completamente: ricarica la pagina.");}throw error;}
        },
        getBoundingBox(reference){
          const item=itemFor(reference);
          if(reference.screenPropertyPath)throw new Error("La misura richiede un oggetto grafico, non Font o Margin o Padding.");
          if(!Object.hasOwn(item,"boundingBox"))throw new Error("La misura richiede i componenti Runtime aggiornati del pannello.");
          if(item.geometryError)throw new Error(item.geometryError);
          return item.boundingBox;
        },
        ...(surface.measureBoundingBox?{async getBoundingBoxAsync(reference,signal){
          const item=itemFor(reference);if(reference.screenPropertyPath)throw new Error("La misura richiede un oggetto grafico, non Font o Margin o Padding.");
          const box=await surface.measureBoundingBox(item.itemId,signal);itemFor(reference);return box;
        }}:{}),
        setMargin(reference,value){setInsets(reference,"Margin",value);},
        setPadding(reference,value){setInsets(reference,"Padding",value);},
        propertyFlashing(reference, args) {
          const item = itemFor(reference);
          if (reference.screenPropertyPath) throw new Error("PropertyFlashing richiede un oggetto Screen/Faceplate, non Font o Margin o Padding.");
          const [property, enabled, value, alternateValue, rate] = args;
          if (!properties.includes(property)) throw new Error("PropertyFlashing: proprieta' non supportata: " + property);
          if (typeof enabled !== "boolean") throw new Error("PropertyFlashing: enable deve essere Boolean.");
          if (rate != null && ![0, 1, 2].includes(rate)) throw new Error("PropertyFlashing: rate deve essere Slow (0), Medium (1) o Fast (2).");
          const existing = state.get(item.itemId)?.get(property);
          const configured = item.flashing?.find((binding) => binding.property === property);
          const source = value ?? existing?.color ?? configured?.color;
          const alternate = alternateValue ?? existing?.alternateColor ?? configured?.alternateColor;
          if (enabled && (source == null || alternate == null)) {
            report("PropertyFlashing: configura due colori oppure passali allo script (" + (item.name || property) + ").");
            return false;
          }
          const command = { itemId: item.itemId, property, enabled,
            ...(source != null ? { color: color(source) } : {}), ...(alternate != null ? { alternateColor: color(alternate) } : {}),
            periodMs: [2000, 1000, 500][rate ?? 1] };
          if (enabled && command.color.toLowerCase() === command.alternateColor.toLowerCase()) {
            report("PropertyFlashing: i due colori devono essere diversi.");
            return false;
          }
          if (!state.has(item.itemId)) state.set(item.itemId, new Map());
          state.get(item.itemId).set(property, command);
          publish();
          return true;
        },
      };
    },
  };
}

export function createHmiPropertyFlashingDomSurface(root, identify, interactionEnabled = () => true, onError = message => root.defaultView?.console.warn("[HMI oggetti] "+message)) {
  let sequence = 0;
  const ids = new WeakMap();
  const identifyItem = identify ?? ((element) => { if (!ids.has(element)) ids.set(element, "hmi-item-" + ++sequence); return ids.get(element); });
  const boundingBox=(element)=>{
    if(!element.isConnected||!element.getClientRects().length)return null;
    const box=element.getBoundingClientRect();
    if(![box.left,box.top,box.width,box.height].every(Number.isFinite)||box.width<0||box.height<0)throw new Error("La misura dell'oggetto HMI non e' valida.");
    return {Left:box.left,Top:box.top,Width:box.width,Height:box.height};
  };
  const targets = new Map();
  const scripted = new Map();
  const declarative = new Map();
  const before = new Map();
  const propertyOverrides = new Map();
  const propertyBefore = new Map();
  const pivotProperties=["RotationCenterPlacement","RotationCenterX","RotationCenterY"];
  let pivotFrame, refreshingPivots=false;
  const pivotErrors=new Map(),absolutePivotIds=new Set();
  const createdText = new WeakSet();
  const baseColors = new WeakMap();
  let suspendDepth = 0;
  const stems = { BackColor: "background", ForeColor: "foreground", BorderColor: "border" };
  const cssProperties = { Left: "left", Top: "top", Width: "width", Height: "height", Visible: "visibility", BackColor: "background-color", ForeColor: "color", BorderColor: "border-color" };
  const marginCssProperties={"Margin.Left":"margin-left","Margin.Top":"margin-top","Margin.Right":"margin-right","Margin.Bottom":"margin-bottom"};
  const paddingCssProperties={"Padding.Left":"padding-left","Padding.Top":"padding-top","Padding.Right":"padding-right","Padding.Bottom":"padding-bottom"};
  const supportsPadding=(element,computed=root.defaultView?.getComputedStyle(element)??element.style)=>element.namespaceURI==="http://www.w3.org/1999/xhtml"&&!/^(contents|table-row|table-row-group|table-header-group|table-footer-group|table-column|table-column-group)$/.test(computed.display)&&!(["table","inline-table"].includes(computed.display)&&computed.borderCollapse==="collapse");
  const supportsMargin=(element,computed=root.defaultView?.getComputedStyle(element)??element.style)=>element.namespaceURI==="http://www.w3.org/1999/xhtml"&&!/^(contents|table-row|table-row-group|table-header-group|table-footer-group|table-column|table-column-group|table-cell)$/.test(computed.display);
  const fontCssProperties = { "Font.Name": "font-family", "Font.Size": "font-size", "Font.Weight": "font-weight", "Font.Italic": "font-style" };
  const fontProperties = [...Object.keys(fontCssProperties), "Font.Underline", "Font.StrikeOut"];
  // Compose the element's own planar CSS transforms; ancestors belong to its group context.
  // Keep the affine translation fixed when replacing the orientation.
  const planarRotation = (element, computed = root.defaultView?.getComputedStyle(element) ?? element.style) => {
    const raw = (computed.transform || "none").trim();
    let matrix = [1, 0, 0, 1, 0, 0];
    if (raw !== "none" && raw !== "") {
      const match = /^matrix(3d)?\(([^)]+)\)$/.exec(raw);
      if (!match) return;
      const entries = match[2].split(/\s*,\s*/).map(Number);
      if (!entries.every(Number.isFinite)) return;
      if (match[1]) {
        if (entries.length !== 16 || [2, 3, 6, 7, 8, 9, 11, 14].some(i => entries[i] !== 0) || entries[10] !== 1 || entries[15] !== 1) return;
        matrix = [entries[0], entries[1], entries[4], entries[5], entries[12], entries[13]];
      } else {
        if (entries.length !== 6) return;
        matrix = entries;
      }
    }
    const angleValue = raw => {
      if (!raw || raw === "none") return 0;
      const parts = raw.trim().split(/\s+/);
      let sign = 1;
      if (parts.length === 2) {
        if (parts[0] !== "z") return;
      } else if (parts.length === 4) {
        const axis = parts.slice(0, 3).map(Number);
        if (!axis.every(Number.isFinite) || axis[0] !== 0 || axis[1] !== 0 || axis[2] === 0) return;
        sign = Math.sign(axis[2]);
      } else if (parts.length !== 1) return;
      const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|rad|grad|turn)$/.exec(parts.at(-1));
      if (!match) return;
      const value = Number(match[1]) * {
        deg: 1,
        rad: 180 / Math.PI,
        grad: .9,
        turn: 360
      }[match[2]] * sign;
      return Number.isFinite(value) ? value : undefined;
    };
    const angle = angleValue(computed.rotate || "none");
    if (angle === undefined) return;
    const scaleRaw = (computed.scale || "none").trim();
    let scales = [1, 1];
    if (scaleRaw !== "none" && scaleRaw !== "") {
      const fields = scaleRaw.split(/\s+/);
      if (fields.length > 3) return;
      const values = fields.map(v => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/.test(v) ? Number.parseFloat(v) / (v.endsWith("%") ? 100 : 1) : NaN);
      if (!values.every(Number.isFinite) || values.length === 3 && values[2] !== 1) return;
      scales = [values[0], values[1] ?? values[0]];
    }
    const [a, b, c, d, e, f] = matrix,
      [sx, sy] = scales,
      radians = angle * Math.PI / 180,
      cos = Math.cos(radians),
      sin = Math.sin(radians);
    const composed = [cos * sx * a - sin * sy * b, sin * sx * a + cos * sy * b, cos * sx * c - sin * sy * d, sin * sx * c + cos * sy * d, cos * sx * e - sin * sy * f, sin * sx * e + cos * sy * f];
    if (!composed.every(Number.isFinite)) return;
    const heading = (Math.hypot(composed[0], composed[1]) > 1e-12 ? Math.atan2(composed[1], composed[0]) : Math.atan2(-composed[2], composed[3])) * 180 / Math.PI;
    // A plain individual rotate retains full turns. Computed matrices have browser rounding.
    const plain = a === 1 && b === 0 && c === 0 && d === 1 && sx >= 0;
    const nearest = Math.round(heading),
      degrees = plain ? angle : Math.abs(heading - nearest) < .0001 ? nearest : heading;
    return {
      matrix: composed,
      heading: plain ? angle : heading,
      degrees
    };
  };
  const lengthPixels=value=>/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?px$/i.test(value||"")?Number.parseFloat(value):value==="0"?0:undefined;
  const boxGeometry=(element,computed=root.defaultView?.getComputedStyle(element)??element.style)=>{
    if(!element||element.namespaceURI!=="http://www.w3.org/1999/xhtml"||!planarRotation(element,computed))return;
    if(["contents","table-column","table-column-group"].includes(computed.display)||computed.display==="inline"&&!/^(img|canvas|video|audio|iframe|input|textarea|select|button|object|embed)$/.test(element.localName))return;
    const px=name=>lengthPixels(computed.getPropertyValue(name))??0;
    const horizontal=px("padding-left")+px("padding-right")+px("border-left-width")+px("border-right-width"),vertical=px("padding-top")+px("padding-bottom")+px("border-top-width")+px("border-bottom-width");
    const width=(lengthPixels(computed.width)??(Number.isFinite(element.offsetWidth)?element.offsetWidth:0))+(computed.boxSizing==="border-box"||lengthPixels(computed.width)===undefined?0:horizontal);
    const height=(lengthPixels(computed.height)??(Number.isFinite(element.offsetHeight)?element.offsetHeight:0))+(computed.boxSizing==="border-box"||lengthPixels(computed.height)===undefined?0:vertical);
    if(![width,height].every(value=>Number.isFinite(value)&&value>=0))return;
    const contentBox=computed.transformBox==="content-box",referenceWidth=contentBox?Math.max(0,width-horizontal):width,referenceHeight=contentBox?Math.max(0,height-vertical):height;
    const left=contentBox?px("padding-left")+px("border-left-width"):0,top=contentBox?px("padding-top")+px("border-top-width"):0;
    const coordinate=(text,size)=>{
      if(text==="center")return size/2;if(text==="left"||text==="top")return 0;if(text==="right"||text==="bottom")return size;
      if(/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?%$/i.test(text))return Number.parseFloat(text)*size/100;
      const calc=/^calc\(\s*([-+]?\d+(?:\.\d+)?)%\s*([+-])\s*([-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)px\s*\)$/i.exec(text);
      if(calc)return Number(calc[1])*size/100+(calc[2]==="-"?-1:1)*Number(calc[3]);
      return lengthPixels(text);
    };
    const parts=(computed.transformOrigin||"50% 50%").match(/calc\([^)]*\)|\S+/g)||[];
    const x=coordinate(parts[0]??"50%",referenceWidth),y=coordinate(parts[1]??"50%",referenceHeight),z=lengthPixels(parts[2]??"0px");
    if(![x,y,z].every(Number.isFinite))return;
    return {width,height,origin:{x:x+left,y:y+top,z}};
  };
  const pivotBase=(element,computed)=>{
    const box=boxGeometry(element,computed);if(!box)return;
    const x=box.origin.x-box.width/2,y=box.origin.y-box.height/2;
    if(![x,y].every(value=>Number.isFinite(value)&&Number.isFinite(Math.fround(value))))return;
    return {RotationCenterPlacement:0,RotationCenterX:x,RotationCenterY:y};
  };
  const multiplyLinear=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3]];
  const inverseVector=(matrix,x,y)=>{
    const [a,b,c,d]=matrix,det=a*d-b*c;
    if(!Number.isFinite(det)||det===0)throw new Error("Il centro assoluto non e' convertibile: un contenitore ha scala nulla o una trasformazione non invertibile.");
    const result={x:(d*x-c*y)/det,y:(a*y-b*x)/det};
    if(![result.x,result.y].every(Number.isFinite))throw new Error("Le coordinate del centro assoluto non sono finite.");return result;
  };
  const zoomValue=computed=>{
    const raw=(computed.zoom||"1").trim(),value=raw==="normal"?1:raw.endsWith("%")?Number.parseFloat(raw)/100:Number(raw);
    if(!Number.isFinite(value)||value<=0)throw new Error("Lo zoom CSS non permette di convertire il centro assoluto.");return value;
  };
  const parentLinear=element=>{
    const own=root.defaultView.getComputedStyle(element),ownZoom=zoomValue(own);let matrix=[ownZoom,0,0,ownZoom];
    for(let parent=element.parentElement;parent;parent=parent.parentElement){
      const computed=root.defaultView.getComputedStyle(parent),rotation=planarRotation(parent,computed);
      if(parent.namespaceURI!=="http://www.w3.org/1999/xhtml"||!rotation||(computed.offsetPath&&computed.offsetPath!=="none"))throw new Error("Il centro assoluto richiede contenitori HTML con trasformazioni 2D, senza percorsi di movimento.");
      const zoom=zoomValue(computed),linear=rotation.matrix.slice(0,4).map(v=>v*zoom);matrix=multiplyLinear(linear,matrix);
    }
    if(!matrix.every(Number.isFinite))throw new Error("La trasformazione dei contenitori non e' finita.");return matrix;
  };
  const worldFrame=element=>{
    const computed=root.defaultView.getComputedStyle(element),box=boxGeometry(element,computed),rotation=planarRotation(element,computed);
    if(!box||!rotation||!element.isConnected||!element.getClientRects().length||(computed.offsetPath&&computed.offsetPath!=="none"))throw new Error("Il centro assoluto richiede un riquadro visibile nel layout della schermata.");
    const parent=parentLinear(element),linear=multiplyLinear(parent,rotation.matrix),[a,b,c,d]=linear,rect=element.getBoundingClientRect();
    const tx=rect.left-Math.min(0,a*box.width,c*box.height,a*box.width+c*box.height),ty=rect.top-Math.min(0,b*box.width,d*box.height,b*box.width+d*box.height);
    if(![tx,ty].every(Number.isFinite))throw new Error("La posizione del centro assoluto non e' risolvibile.");
    return {box,rotation,parent,linear,tx,ty};
  };
  const absolutePivot=(element,x,y)=>{
    const screen=element.closest("[data-hmi-screen], [data-hmi-type='HmiScreen'], [data-framecraft-runtime-popup-id]")??root.body??root.documentElement;
    if(screen===element)return {x,y};
    const frame=worldFrame(element),origin=worldFrame(screen),[a,b,c,d]=origin.linear;
    const point=inverseVector(frame.parent,a*x+c*y+origin.tx-frame.tx,b*x+d*y+origin.ty-frame.ty),o=frame.box.origin,m=frame.rotation.matrix;
    const result={x:point.x+o.x-m[0]*o.x-m[2]*o.y,y:point.y+o.y-m[1]*o.x-m[3]*o.y};
    if(![result.x,result.y].every(Number.isFinite))throw new Error("Il centro di rotazione assoluto non e' finito.");return result;
  };
  const cancelPivotFrame=()=>{if(pivotFrame!==undefined){root.defaultView?.cancelAnimationFrame(pivotFrame);pivotFrame=undefined;}};
  const refreshPivots=()=>{
    if(refreshingPivots||suspendDepth)return;refreshingPivots=true;
    try{for(const id of absolutePivotIds){
      const values=propertyOverrides.get(id);if(!values||values.get("RotationCenterPlacement")!==2)continue;
      const element=targets.get(id);if(!element?.isConnected){absolutePivotIds.delete(id);pivotErrors.delete(id);if(element)restoreProperties(element);continue;}
      try{
        const boxEntry=propertyBefore.get(element)?.find(entry=>entry.kind==="style"&&entry.name==="transform-box");
        if(boxEntry){const value=element.style.getPropertyValue("transform-box"),priority=element.style.getPropertyPriority("transform-box");if(value!==boxEntry.applied||priority!==boxEntry.appliedPriority){boxEntry.value=value;boxEntry.priority=priority;element.style.setProperty("transform-box","border-box","important");boxEntry.applied=element.style.getPropertyValue("transform-box");boxEntry.appliedPriority=element.style.getPropertyPriority("transform-box");}}
        const point=absolutePivot(element,values.get("RotationCenterX"),values.get("RotationCenterY")),entry=propertyBefore.get(element)?.find(entry=>entry.kind==="style"&&entry.name==="transform-origin");
        if(!entry)continue;
        const current=element.style.getPropertyValue("transform-origin"),priority=element.style.getPropertyPriority("transform-origin"),origin=boxGeometry(element).origin,z=origin.z;
        const desired=point.x+"px "+point.y+"px "+z+"px";
        if(current!==entry.applied||priority!==entry.appliedPriority){entry.value=current;entry.priority=priority;}
        if(Math.abs(origin.x-point.x)>1e-4||Math.abs(origin.y-point.y)>1e-4||priority!=="important")element.style.setProperty("transform-origin",desired,"important");
        entry.applied=element.style.getPropertyValue("transform-origin");entry.appliedPriority=element.style.getPropertyPriority("transform-origin");pivotErrors.delete(id);
      }catch(caught){const message="Centro di rotazione di "+(element.getAttribute("data-hmi-name")||element.id||"elemento")+": "+(caught instanceof Error?caught.message:String(caught));if(pivotErrors.get(id)!==message){pivotErrors.set(id,message);try{onError(message);}catch{root.defaultView?.console.warn(message);}}}
    }}finally{refreshingPivots=false;}
  };
  const schedulePivotFrame=()=>{
    if(suspendDepth||!absolutePivotIds.size){cancelPivotFrame();return;}
    if(pivotFrame===undefined&&root.defaultView?.requestAnimationFrame)pivotFrame=root.defaultView.requestAnimationFrame(()=>{pivotFrame=undefined;refreshPivots();schedulePivotFrame();});
  };

  const cssColor = (value) => {
    if (value.length !== 9) return value;
    const alpha = parseInt(value.slice(1, 3), 16) / 255;
    return alpha === 1 ? "#" + value.slice(3) : "rgba(" + [3, 5, 7].map((index) => parseInt(value.slice(index, index + 2), 16)).join(", ") + ", " + alpha + ")";
  };
  const textNodes = (element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || /^(input|textarea|select|img|iframe|script|style)$/.test(element.localName)) return null;
    const direct = [...element.childNodes].filter((node) => node.nodeType === 3);
    if (!element.childElementCount || direct.some((node) => node.data.trim())) return { host: element, nodes: direct };
    const candidates = [...element.querySelectorAll("span, label, div, p, [data-hmi-text]")].filter((child) => {
      if (child.childElementCount || ![...child.childNodes].some((node) => node.nodeType === 3 && node.data.trim())) return false;
      const owner = child.closest("[data-hmi-type], [data-hmi-name], [data-hmi-events], [data-hmi-faceplate]");
      return !child.closest("svg, input, textarea, select") && (!owner || owner === element);
    });
    const marked = candidates.filter((child) => child.hasAttribute("data-hmi-text"));
    const selected = marked.length === 1 ? marked : candidates;
    return selected.length === 1 ? { host: selected[0], nodes: [...selected[0].childNodes].filter((node) => node.nodeType === 3) } : null;
  };
  const fontHost = (element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml") return null;
    if (/^(input|textarea|select)$/.test(element.localName)) return element;
    return textNodes(element)?.host ?? null;
  };
  const decorationLines = (element, computed = root.defaultView?.getComputedStyle(element) ?? element.style) => {
    return new Set((computed.textDecorationLine || computed.textDecoration || "").split(/\s+/).filter((line) => ["underline", "line-through", "overline", "blink"].includes(line)));
  };
  const scopedDecorations = (element, font, computedStyles) => {
    const result = new Map();
    for (let current = font; current; current = current.parentElement) {
      result.set(current, decorationLines(current, computedStyles?.get(current)));
      if (current === element) break;
    }
    return result;
  };
  const fontFamilyName = (value) => {
    const match = /^\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,]+))/.exec(value);
    if (!match) return null;
    return (match[1] ?? match[2] ?? match[3]).trim().replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex, character) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd) : character);
  };
  const fontFamilyCss = (value) => {
    if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i.test(value)) return value.toLowerCase();
    const quote = value.includes('"') && !value.includes("'") ? "'" : '"';
    return quote + value.replace(/\\/g, "\\\\").replaceAll(quote, "\\" + quote) + quote;
  };
  const pixelLength = (value) => {
    const [mantissa, exponent] = String(value).split(/e/i);
    if (exponent === undefined) return mantissa + "px";
    const digits = mantissa.replace(".", ""), point = (mantissa.includes(".") ? mantissa.indexOf(".") : mantissa.length) + Number(exponent);
    return (point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point)) + "px";
  };
  const colorNumber = (value) => {
    if (/^#[0-9a-f]{6}$/i.test(value)) return Number("0xff" + value.slice(1));
    const rgb = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(value);
    if (!rgb) return value === "transparent" ? 0 : undefined;
    const channels = rgb.slice(1, 4).map(Number), alpha = rgb[4] == null ? 1 : Number(rgb[4]);
    if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return undefined;
    return (Math.round(alpha * 255) * 0x1000000 + Math.round(channels[0]) * 0x10000 + Math.round(channels[1]) * 0x100 + Math.round(channels[2])) >>> 0;
  };
  const processValueRevisions=new WeakMap();
  const processValueSource=(element)=>{
    let source;const raw=element.getAttribute('data-hmi-process-value');
    if(raw){try{if(raw.length>20000)throw Error();source=JSON.parse(raw);if(!source||typeof source!=='object'||Array.isArray(source))throw Error();}catch{return {error:'ProcessValue: configurazione del controllo non valida.'};}}
    const dynamics=element.getAttribute('data-hmi-dynamizations');
    if(!source&&dynamics){try{const parsed=JSON.parse(dynamics);if(Array.isArray(parsed)){const bindings=parsed.filter(binding=>binding?.property==='ProcessValue'&&binding.kind==='Tag');if(bindings.length>1)return {error:'ProcessValue ha più collegamenti: scegli una sola variabile.'};if(bindings[0])source={binding:bindings[0]};}}catch{return {error:'ProcessValue: collegamenti del controllo non leggibili.'};}}
    const tag=element.tagName,type=element.getAttribute('type')?.toLowerCase()||'text';
    const input=tag==='INPUT'&&['text','number','range','checkbox','search','tel','url','email'].includes(type),field=input||['TEXTAREA','SELECT','OUTPUT','PROGRESS','METER'].includes(tag),hmi=/^Hmi(?:IOField|SymbolicIOField|Slider|Bar|Gauge)$/.test(element.getAttribute('data-hmi-type')||'');
    if(!source&&!field&&!hmi)return;
    if(!source){const linked=element.getAttribute('data-plc-variable')||element.getAttribute('data-plc-tag');if(linked)source={binding:{property:'ProcessValue',tag:linked}};}
    source={...source};
    if(!source.dataType)source.dataType=element.getAttribute('data-hmi-value-type')||(tag==='INPUT'&&['checkbox'].includes(type)?'Bool':tag==='INPUT'&&['number','range'].includes(type)||['PROGRESS','METER'].includes(tag)||/^Hmi(?:Bar|Gauge|Slider)$/.test(element.getAttribute('data-hmi-type')||'')?'LReal':'WString');
    if(!source.binding){
      if(input&&['checkbox'].includes(type))source.value=element.checked;
      else if(field&&tag!=='OUTPUT')source.value=element.value;
      else if(element.hasAttribute('aria-valuenow'))source.value=element.getAttribute('aria-valuenow');
      else{const text=textNodes(element);if(text)source.value=text.nodes.map(node=>node.data).join('');}
      if(tag==='SELECT')source.choices=Array.from(element.options).map(option=>option.value);
      if(input&&['number','range'].includes(type)||['PROGRESS','METER'].includes(tag)){
        const minimum=element.getAttribute('min'),maximum=element.getAttribute('max');
        if(minimum!==null&&minimum.trim()&&Number.isFinite(Number(minimum)))source.minimum=Number(minimum);else if(type==='range'||['PROGRESS','METER'].includes(tag))source.minimum=0;
        if(maximum!==null&&maximum.trim()&&Number.isFinite(Number(maximum)))source.maximum=Number(maximum);else if(type==='range')source.maximum=100;else if(['PROGRESS','METER'].includes(tag))source.maximum=1;
      }
    }
    if(!source.binding&&typeof source.value==='string'&&!/^(?:w?string)$/i.test(source.dataType)){
      const value=source.value.trim();if(/^(?:bool|boolean)$/i.test(source.dataType))source.value=value==='true'||value==='1'?true:value==='false'||value==='0'?false:undefined;
      else source.value=value&&Number.isFinite(Number(value))?Number(value):undefined;
    }
    const signature=JSON.stringify(source),previous=processValueRevisions.get(element);if(!previous||previous.signature!==signature)processValueRevisions.set(element,{signature,revision:(previous?.revision??0)+1});source.revision=processValueRevisions.get(element).revision;
    return source;
  };
  const syncNativeProcessValue=element=>{
    const overrides=propertyOverrides.get(identifyItem(element));if(!overrides?.has('ProcessValue')||!propertyBefore.has(element))return;
    const source=processValueSource(element);if(source?.binding||source?.value===undefined||source?.value===null)overrides.delete('ProcessValue');else if(String(source.value)!==String(overrides.get('ProcessValue')))overrides.set('ProcessValue',source.value);
  };
  const snapshotProperties = (element) => {
    const computed = root.defaultView?.getComputedStyle(element) ?? element.style;
    const px = (name, fallback) => /^-?[\d.]+px$/.test(computed[name]) ? Math.round(parseFloat(computed[name])) : Math.round(fallback || 0);
    const values = { Left: px("left", element.offsetLeft), Top: px("top", element.offsetTop), Width: Math.round(element.offsetWidth || px("width", 0)), Height: Math.round(element.offsetHeight || px("height", 0)),
      Visible: !element.hidden && computed.visibility !== "hidden" && computed.visibility !== "collapse" && computed.display !== "none",
      Enabled: !element.hasAttribute("disabled") && !element.hasAttribute("inert") && element.getAttribute("aria-disabled") !== "true" && computed.pointerEvents !== "none" };
    if(supportsMargin(element,computed))for(const[property,css]of Object.entries(marginCssProperties)){
      const raw=computed.getPropertyValue(css).trim(),number=raw===""||raw==="0"?0:/^-?(?:\d+(?:\.\d+)?|\.\d+)px$/i.test(raw)?Number.parseFloat(raw):NaN;
      values[property]=Number.isInteger(number)&&number>=-2147483648&&number<=2147483647?number:null;
    }
    if(supportsPadding(element,computed))for(const[property,css]of Object.entries(paddingCssProperties)){
      const raw=computed.getPropertyValue(css).trim(),number=raw===""||raw==="0"?0:/^(?:\d+(?:\.\d+)?|\.\d+)px$/i.test(raw)?Number.parseFloat(raw):NaN;
      values[property]=Number.isInteger(number)&&number>=0&&number<=2147483647?number:null;
    }
    const process=processValueSource(element);if(process&&!process.binding&&!process.error)values.ProcessValue=process.value??null;
    const pivot=pivotBase(element,computed);
    if(pivot){const current=propertyOverrides.get(identifyItem(element));for(const name of pivotProperties)values[name]=current?.has(name)?current.get(name):pivot[name];}
    const rotation=planarRotation(element,computed);
    if(rotation)values.RotationAngle=Number.isInteger(rotation.degrees)&&rotation.degrees>=-32768&&rotation.degrees<=32767?rotation.degrees:null;
    const text = textNodes(element);
    if (text) values.Text = text.nodes.map((node) => node.data).join("");
    const font = fontHost(element);
    if (font) {
      const computedStyles = new Map([[element, computed]]);
      const inherited = (name) => {
        for (let current = font; current; current = current.parentElement) {
          if (!computedStyles.has(current)) computedStyles.set(current, root.defaultView?.getComputedStyle(current) ?? current.style);
          const value = computedStyles.get(current).getPropertyValue(name);
          if (value && !["inherit", "unset"].includes(value)) return value;
        }
        return "";
      };
      const size = inherited("font-size"), weight = inherited("font-weight"), italic = inherited("font-style");
      const lines = new Set([...scopedDecorations(element, font, computedStyles).values()].flatMap((entries) => [...entries]));
      values["Font.Name"] = fontFamilyName(inherited("font-family"));
      values["Font.Size"] = /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?px$/i.test(size) && Number.isFinite(parseFloat(size)) ? parseFloat(size) : null;
      values["Font.Weight"] = weight === "normal" ? 400 : weight === "bold" ? 700 : /^\d+$/.test(weight) ? Number(weight) : null;
      values["Font.Italic"] = italic === "normal" ? false : /^(italic|oblique)(?:\s|$)/.test(italic) ? true : null;
      values["Font.Underline"] = lines.has("underline");
      values["Font.StrikeOut"] = lines.has("line-through") ? 1 : 0;
    }
    for (const property of Object.keys(stems)) {
      const color = colorNumber(element.style.getPropertyValue(cssProperties[property]) || baseColors.get(element)?.[property] || computed.getPropertyValue(cssProperties[property]));
      values[property] = color ?? null;
    }
    return values;
  };
  const restoreProperties = (element) => {
    const entries = propertyBefore.get(element);
    if (!entries) return;
    for (const entry of [...entries].reverse()) {
      if (entry.kind === "style") {
        const target = entry.target ?? element;
        if (target.style.getPropertyValue(entry.name) !== entry.applied || target.style.getPropertyPriority(entry.name) !== entry.appliedPriority) continue;
        if (entry.value) target.style.setProperty(entry.name, entry.value, entry.priority);
        else target.style.removeProperty(entry.name);
      } else if (entry.kind === "attribute") {
        if (element.getAttribute(entry.name) !== entry.applied) continue;
        if (entry.value === null) element.removeAttribute(entry.name);
        else element.setAttribute(entry.name, entry.value);
      } else if(entry.kind==='property'){
        if(element[entry.name]===entry.applied)element[entry.name]=entry.value;
      } else if (entry.node.data === entry.applied) {
        if (createdText.has(entry.node) && !propertyOverrides.get(identifyItem(element))?.has("Text")) entry.node.remove();
        else entry.node.data = entry.value;
      }
    }
    propertyBefore.delete(element);
  };
  const applyProperties = (element) => {
    const overrides = propertyOverrides.get(identifyItem(element));
    if (!overrides?.size) return;
    const entries = [];
    propertyBefore.set(element,entries); // Keep partial publications recoverable as well.
    const style = (name, value, target = element) => {
      const entry = { kind: "style", target, name, value: target.style.getPropertyValue(name), priority: target.style.getPropertyPriority(name) };
      if (entry.value === value && !name.startsWith("padding-") && !["transform","rotate","scale","transform-origin","transform-box"].includes(name)) return;
      const priority = entry.priority || target.style.getPropertyPriority(name.startsWith("font-") ? "font" : name.startsWith("margin-") ? "margin" : name.startsWith("padding-") ? "padding" : name === "text-decoration-line" ? "text-decoration" : name) || (name.startsWith("font-") || name.startsWith("margin-") || name.startsWith("padding-") || name === "text-decoration-line" || ["transform","rotate","scale","transform-origin","transform-box"].includes(name) ? "important" : "");
      target.style.setProperty(name, value, priority);
      entries.push({ ...entry, applied: target.style.getPropertyValue(name), appliedPriority: target.style.getPropertyPriority(name) });
    };
    const attribute = (name, value) => {
      const previous = element.getAttribute(name);
      if (previous === value) return;
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      entries.push({ kind: "attribute", name, value: previous, applied: value });
    };
    const computed = root.defaultView?.getComputedStyle(element);
    const font = fontHost(element);
    if (font && (overrides.has("Font.Underline") || overrides.has("Font.StrikeOut"))) {
      const decorations = scopedDecorations(element, font);
      const previous = new Map([...decorations].map(([target, lines]) => [target, [...lines].join(" ")]));
      for (const [property, line] of [["Font.Underline", "underline"], ["Font.StrikeOut", "line-through"]]) {
        if (!overrides.has(property)) continue;
        if (!overrides.get(property)) for (const lines of decorations.values()) lines.delete(line);
        else if (![...decorations.values()].some((lines) => lines.has(line))) decorations.get(font).add(line);
      }
      for (const [target, lines] of decorations) if ([...lines].join(" ") !== previous.get(target)) style("text-decoration-line", [...lines].join(" ") || "none", target);
    }
    if ((overrides.has("Left") || overrides.has("Top")) && (!computed?.position || computed.position === "static")) {
      const left = element.offsetLeft || 0, top = element.offsetTop || 0;
      style("position", "absolute");
      if (!overrides.has("Left")) style("left", left + "px");
      if (!overrides.has("Top")) style("top", top + "px");
    }
    if (overrides.has("Width") || overrides.has("Height")) style("box-sizing", "border-box");
    for (const [property, value] of overrides) {
      if(property==='ProcessValue'){
        const name=element.tagName==='INPUT'&&['checkbox'].includes(element.type)?'checked':'value';
        if(name in element&&element.tagName!=='OUTPUT'){const previous=element[name];element[name]=name==='checked'?value:String(value);entries.push({kind:'property',name,value:previous,applied:element[name]});}
        else if(element.hasAttribute('aria-valuenow')){attribute('aria-valuenow',String(value));const fill=element.querySelector('[data-hmi-faceplate-bar-fill]');if(fill)style('width',Math.max(0,Math.min(100,Number(value)))+'%',fill);}
        else{const text=textNodes(element);if(!text)throw new Error('ProcessValue non è applicabile al contenuto del controllo.');if(!text.nodes.length){const node=root.createTextNode('');createdText.add(node);text.host.appendChild(node);text.nodes.push(node);}text.nodes.forEach((node,index)=>{entries.push({kind:'text',node,value:node.data,applied:index===0?String(value):''});node.data=index===0?String(value):'';});}
      }else if (property === "Text") {
        const text = textNodes(element);
        if (!text) continue;
        if (!text.nodes.length) { const node = root.createTextNode(""); createdText.add(node); text.host.appendChild(node); text.nodes.push(node); }
        text.nodes.forEach((node, index) => {
          const applied = index === 0 ? value : "";
          if (node.data !== applied || createdText.has(node)) entries.push({ kind: "text", node, value: node.data, applied });
          if (node.data !== applied) node.data = applied;
        });
      } else if (Object.hasOwn(fontCssProperties, property)) {
        if (font) style(fontCssProperties[property], property === "Font.Name" ? fontFamilyCss(value) : property === "Font.Size" ? pixelLength(value) : property === "Font.Weight" ? (value === 0 ? "normal" : String(value)) : value ? "italic" : "normal", font);
      } else if(Object.hasOwn(marginCssProperties,property)){
        style(marginCssProperties[property],value+"px");
      } else if(Object.hasOwn(paddingCssProperties,property)){
        style(paddingCssProperties[property],value+"px");
      } else if (property === "Enabled") {
        attribute("inert", value ? null : "");
        attribute("aria-disabled", value ? "false" : "true");
        if ("disabled" in element) attribute("disabled", value ? null : "");
        style("pointer-events", value ? "auto" : "none");
      } else if (Object.hasOwn(cssProperties, property)) {
        if (property === "Visible" && value) { attribute("hidden", null); if (computed?.display === "none") style("display", "revert"); }
        style(cssProperties[property], property === "Visible" ? (value ? "visible" : "hidden") : stems[property] ? cssColor("#" + value.toString(16).padStart(8, "0")) : value + "px");
      }
    }
    if(overrides.has("RotationAngle")){
      const rotation=planarRotation(element);if(!rotation)throw new Error("RotationAngle richiede una trasformazione CSS piana risolvibile.");
      const radians=(overrides.get("RotationAngle")-rotation.heading)*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),[a,b,c,d,e,f]=rotation.matrix;
      const matrix=[cos*a-sin*b,sin*a+cos*b,cos*c-sin*d,sin*c+cos*d,e,f];
      if(!matrix.every(Number.isFinite))throw new Error("La matrice di rotazione non e' finita.");
      style("rotate","none");style("scale","none");style("transform","matrix("+matrix.join(",")+")");
    }
    if(pivotProperties.every(name=>overrides.has(name))){
      const geometry=boxGeometry(element);if(!geometry)throw new Error("Il centro di rotazione richiede un contenitore grafico HTML 2D con un box risolvibile.");
      const z=geometry.origin.z;style("transform-box","border-box");
      const centerOffset=value=>"calc(50% "+(value<0?"- ":"+ ")+Math.abs(value)+"px)";
      const mode=overrides.get("RotationCenterPlacement"),x=overrides.get("RotationCenterX"),y=overrides.get("RotationCenterY");
      if(mode===0)style("transform-origin",centerOffset(x)+" "+centerOffset(y)+" "+z+"px");
      else if(mode===1)style("transform-origin",((x+1)*50)+"% "+((y+1)*50)+"% "+z+"px");
      else{const point=absolutePivot(element,x,y);style("transform-origin",point.x+"px "+point.y+"px "+z+"px");}
    }
    if (!entries.length) propertyBefore.delete(element);
  };
  const allowsReactions = (element) => {
    for (let current = element; current?.nodeType === 1; current = current.parentElement) {
      if (current.getAttribute("data-fc-reacts") === "false") return false;
      if (current.getAttribute("data-fc-user-requires") && current.getAttribute("data-fc-user-granted") !== "true") return false;
      if (current.getAttribute("data-fc-user-visible-requires") && current.getAttribute("data-fc-user-visible-granted") !== "true") return false;
    }
    return true;
  };
  const allowsInteraction = (element) => {
    if (!allowsReactions(element)) return false;
    for (let current = element; current?.nodeType === 1; current = current.parentElement) {
      const properties = propertyOverrides.get(identifyItem(current));
      if (properties?.get("Enabled") === false || properties?.get("Visible") === false) return false;
      if (current.hasAttribute("disabled") || current.hasAttribute("inert") || current.hasAttribute("hidden") || current.getAttribute("aria-disabled") === "true" || current.style?.pointerEvents === "none" || current.style?.visibility === "hidden" || current.style?.display === "none") return false;
    }
    return true;
  };
  const interactionEvents = ["click", "dblclick", "contextmenu", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup", "input", "change", "submit", "focusin", "framecraft:interface-event", "framecraft:faceplate-event", "framecraft:command-fired"];
  const guardInteraction = (event) => {
    if (!interactionEnabled()) return;
    const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (element && !allowsInteraction(element)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  for (const type of interactionEvents) root.addEventListener(type, guardInteraction, true);
  const restore = (element) => {
    baseColors.delete(element);
    const base = before.get(element);
    if (!base) return;
    for (const [name, entry] of base) {
      if (entry.value) element.style.setProperty(name, entry.value, entry.priority);
      else element.style.removeProperty(name);
    }
    before.delete(element);
  };
  const render = (element,propertiesChanged=false) => {
    restore(element);
    if(!propertiesChanged)syncNativeProcessValue(element);
    restoreProperties(element);
    if (suspendDepth || !element.isConnected || !element.style) return;
    applyProperties(element);
    const visuals = new Map((declarative.get(element) ?? []).map((visual) => [visual.property, visual]));
    for (const entry of scripted.get(identifyItem(element)) ?? []) {
      if (entry.enabled) visuals.set(entry.property, entry);
      else visuals.delete(entry.property);
    }
    if (!visuals.size) return;
    const computed = root.defaultView?.getComputedStyle(element);
    baseColors.set(element, Object.fromEntries(Object.keys(stems).map((property) => [property, computed?.getPropertyValue(cssProperties[property]) ?? ""])));
    const names = ["animation", ...Object.values(stems).flatMap((stem) => ["--framecraft-hmi-flash-" + stem + "-color", "--framecraft-hmi-flash-" + stem + "-alternate"])];
    before.set(element, new Map(names.map((name) => [name, { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }])));
    const animations = [];
    for (const visual of visuals.values()) {
      const stem = stems[visual.property];
      if (!stem) continue;
      element.style.setProperty("--framecraft-hmi-flash-" + stem + "-color", cssColor(visual.color));
      element.style.setProperty("--framecraft-hmi-flash-" + stem + "-alternate", cssColor(visual.alternateColor));
      animations.push("framecraft-hmi-flash-" + stem + " " + visual.periodMs + "ms steps(1, end) infinite");
    }
    const baseAnimation = before.get(element).get("animation").value;
    element.style.animation = (baseAnimation && baseAnimation !== "none" ? baseAnimation + ", " : "") + animations.join(", ");
  };
  return {
    items() {
      refreshPivots();
      for(const id of absolutePivotIds)if(!targets.get(id)?.isConnected){absolutePivotIds.delete(id);pivotErrors.delete(id);}
      for (const element of [...before.keys()]) if (!element.isConnected) restore(element);
      for (const element of [...propertyBefore.keys()]) if (!element.isConnected) { propertyOverrides.delete(identifyItem(element)); restoreProperties(element); }
      for (const element of declarative.keys()) if (!element.isConnected) declarative.delete(element);
      targets.clear();
      const defaultScreen = root.querySelector("[data-hmi-screen], [data-hmi-type='HmiScreen'], [data-framecraft-runtime-popup-id]") ?? root.body ?? root.documentElement;
      if (!defaultScreen) return [];
      const elements = new Set([defaultScreen, ...root.querySelectorAll("[data-hmi-name], [data-hmi-type], [data-hmi-screen], [data-hmi-faceplate], [data-hmi-events], [data-hmi-dynamizations], [data-framecraft-runtime-popup-id], [id]")]);
      const items = [];
      for (const element of elements) {
        if (!element.style) continue;
        const itemId = identifyItem(element);
        let flashing = [];
        try { const bindings = JSON.parse(element.getAttribute("data-hmi-dynamizations") ?? "[]"); if (Array.isArray(bindings)) flashing = bindings.filter((binding) => binding?.kind === "Flashing"); } catch { /* Invalid configuration is reported by the HMI validator. */ }
        const screen = element.closest("[data-hmi-screen], [data-hmi-type='HmiScreen'], [data-framecraft-runtime-popup-id]") ?? defaultScreen;
        if(!screen.contains(element))continue;
        targets.set(itemId,element);
        const nearestFaceplate=element.closest("[data-hmi-faceplate]"),faceplate=nearestFaceplate&&screen.contains(nearestFaceplate)?nearestFaceplate:undefined;
        const parent=faceplate===element?element.parentElement?.closest("[data-hmi-faceplate]"):undefined;
        let properties, measuredBox, boxMeasured=false;
        items.push({itemId,name:element.getAttribute("data-hmi-name")||element.id||element.getAttribute("data-hmi-screen")||"",screenId:identifyItem(screen),faceplateId:faceplate?identifyItem(faceplate):undefined,parentFaceplateId:parent&&screen.contains(parent)?identifyItem(parent):undefined,flashing,paddingAllowsNegative:false,get processValue(){return processValueSource(element);},geometryError:pivotErrors.get(itemId),get boundingBox(){if(pivotErrors.has(itemId))return null;if(!boxMeasured){measuredBox=boundingBox(element);boxMeasured=true;}return measuredBox;},get properties(){return properties??=snapshotProperties(element);}});
      }
      for (const itemId of scripted.keys()) if (!targets.has(itemId)) scripted.delete(itemId);
      for (const itemId of propertyOverrides.keys()) if (!targets.has(itemId)) propertyOverrides.delete(itemId);
      return items;
    },
    apply(commands) {
      const affected = new Set(scripted.keys());
      scripted.clear();
      for (const command of commands) {
        if (!stems[command.property] || typeof command.enabled !== "boolean" || ![2000, 1000, 500].includes(command.periodMs)) continue;
        if (command.enabled && (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(command.color) || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(command.alternateColor))) continue;
        if (!scripted.has(command.itemId)) scripted.set(command.itemId, []);
        scripted.get(command.itemId).push(command);
        affected.add(command.itemId);
      }
      for (const itemId of affected) { const element = targets.get(itemId); if (element) render(element); }
    },
    applyProperties(commands) {
      const next = new Map();
      for (const command of commands) {
        if (!command || typeof command.itemId !== "string" || !targets.has(command.itemId)) continue;
        const { property } = command;let value=command.value;
        if(property==='ProcessValue'){
          const source=processValueSource(targets.get(command.itemId));
          if(!source||source.error||source.binding)throw new Error('ProcessValue non è un campo locale modificabile: usa il collegamento tag dal motore script.');
          if(Number.isSafeInteger(command.valueRevision)&&command.valueRevision<source.revision){if(source.value===undefined||source.value===null)continue;value=source.value;}
          if(value===null||!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>20000||source.dataType?.toLowerCase()==='bool'&&typeof value!=='boolean'||source.choices&&!source.choices.includes(String(value))||typeof value==='number'&&(source.minimum!==undefined&&value<source.minimum||source.maximum!==undefined&&value>source.maximum))throw new Error('ProcessValue non è valido per il tipo o i limiti del controllo.');
        }
        if(Object.hasOwn(paddingCssProperties,property)){
          if(typeof value!=="number"||!Number.isInteger(value)||value<0||value>2147483647)throw new Error(property+" richiede un Int32 non negativo per questo elemento HTML.");
          if(!supportsPadding(targets.get(command.itemId)))throw new Error("L'oggetto HMI non espone Padding nel layout corrente.");
        }
        if (!Object.hasOwn(cssProperties, property) && !["Text", "ProcessValue", "Enabled", "RotationAngle", ...pivotProperties, ...fontProperties,...Object.keys(marginCssProperties),...Object.keys(paddingCssProperties)].includes(property)) continue;
        if (property==='ProcessValue'?false:["Enabled", "Visible", "Font.Italic", "Font.Underline"].includes(property) ? typeof value !== "boolean"
          : property === "Text" || property === "Font.Name" ? typeof value !== "string" || value.length > 20000 || (property === "Font.Name" && /[\u0000-\u001f\u007f]/.test(value))
          : property === "RotationCenterPlacement" ? ![0,1,2].includes(value)
          : ["RotationCenterX","RotationCenterY"].includes(property) ? typeof value!=="number"||!Number.isFinite(value)||!Number.isFinite(Math.fround(value))
          : property === "RotationAngle" ? typeof value!=="number"||!Number.isInteger(value)||value < -32768||value > 32767
          : Object.hasOwn(paddingCssProperties,property) ? false
          : Object.hasOwn(marginCssProperties,property) ? typeof value!=="number"||!Number.isInteger(value)||value < -2147483648||value>2147483647
          : property === "Font.Size" ? typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isFinite(Math.fround(value))
          : property === "Font.Weight" ? ![0, 300, 400, 600, 700].includes(value)
          : property === "Font.StrikeOut" ? ![0, 1].includes(value)
          : typeof value !== "number" || !Number.isInteger(value) || value < (["Left", "Top"].includes(property) ? -2147483648 : 0) || value > (["Left", "Top"].includes(property) ? 2147483647 : 0xffffffff)) continue;
        if(property==="RotationAngle"&&!planarRotation(targets.get(command.itemId)))continue;
        if (property === "Text" && !textNodes(targets.get(command.itemId))) continue;
        if(Object.hasOwn(marginCssProperties,property)&&!supportsMargin(targets.get(command.itemId)))continue;
        if (fontProperties.includes(property) && !fontHost(targets.get(command.itemId))) continue;
        if (!next.has(command.itemId)) next.set(command.itemId, new Map());
        next.get(command.itemId).set(property, value);
      }
      for(const[id,values]of next)if(pivotProperties.some(name=>values.has(name))&&(!pivotProperties.every(name=>values.has(name))||!pivotBase(targets.get(id))))for(const name of pivotProperties)values.delete(name);
      const affected = new Set([...propertyOverrides.keys(), ...next.keys()]);
      const changed = [...affected].filter((id) => JSON.stringify([...(propertyOverrides.get(id) ?? [])]) !== JSON.stringify([...(next.get(id) ?? [])]));
      propertyOverrides.clear();
      for (const [id, properties] of next) propertyOverrides.set(id, properties);
      absolutePivotIds.clear();for(const[id,values]of next)if(values.get("RotationCenterPlacement")===2)absolutePivotIds.add(id);
      for(const id of pivotErrors.keys())if(!absolutePivotIds.has(id))pivotErrors.delete(id);
      for (const id of changed) { const element = targets.get(id); if (element) render(element,true); }
      refreshPivots();schedulePivotFrame();
    },
    allowsInteraction,
    allowsReactions,
    setDeclarative(element, visuals) { declarative.set(element, visuals); targets.set(identifyItem(element), element); render(element); },
    suspend() { if (++suspendDepth !== 1) return; cancelPivotFrame(); for (const element of [...before.keys()]) restore(element); for (const element of [...propertyBefore.keys()]){syncNativeProcessValue(element);restoreProperties(element);} },
    resume() { suspendDepth = Math.max(0, suspendDepth - 1); if (suspendDepth) return; for (const element of new Set([...declarative.keys(), ...[...scripted.keys(), ...propertyOverrides.keys()].map((id) => targets.get(id)).filter(Boolean)])) render(element); refreshPivots();schedulePivotFrame(); },
    dispose() { cancelPivotFrame();pivotErrors.clear();absolutePivotIds.clear();scripted.clear(); propertyOverrides.clear(); for (const element of [...before.keys()]) restore(element); for (const element of [...propertyBefore.keys()]) restoreProperties(element); declarative.clear(); targets.clear(); for (const type of interactionEvents) root.removeEventListener(type, guardInteraction, true); },
  };
}
