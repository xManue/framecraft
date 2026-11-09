import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, build, preview } from 'vite';
const {
  chromium
} = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
let editor, server, previewServer, browser;
const errors = [];
try {
  await mkdir(path.join(root, '.hmi-preview'), {
    recursive: true
  });
  const generated = await mkdtemp(path.join(root, '.hmi-preview/geometry-browser-'));
  editor = await createServer({
    root,
    configLoader: 'runner',
    cacheDir: path.join(generated, 'editor-cache'),
    server: {
      watch: {
        ignored: () => true
      },
      warmup: {
        clientFiles: []
      }
    },
    logLevel: 'error'
  });
  const standard = await editor.ssrLoadModule('/src/core/standardProject.ts'),
    scripts = await editor.ssrLoadModule('/src/core/hmiScript.ts');
  const program = source => {
    const r = scripts.inspectHmiScript(source);
    assert.equal(r.error, undefined);
    return r.program;
  };
  const binding = source => JSON.stringify([{
    event: 'Tapped',
    script: source,
    program: program(source)
  }]);
  const attr = source => binding(source).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  for (const file of standard.standardProjectFiles({
    machineName: 'Geometry QA synthetic',
    layout: 'desktop',
    sections: ['main']
  })) {
    const target = path.join(generated, file.path);
    assert.ok(target.startsWith(generated + path.sep));
    await mkdir(path.dirname(target), {
      recursive: true
    });
    await writeFile(target, file.content);
  }
  await symlink(process.env.FRAMECRAFT_RUNTIME_UPDATE_NODE_MODULES || path.join(root, 'node_modules'), path.join(generated, 'node_modules'), 'junction');
  await writeFile(path.join(generated, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;min-height:2400px}button{padding:6px}main{position:relative}#group{position:absolute;left:260px;top:210px;transform:translate(20px,10px) rotate(17deg) scale(1.15);transform-origin:0 0}#target{position:absolute;left:35px;top:45px;width:120px;height:45px;transform:rotate(33deg);transform-origin:center;border:2px solid black;box-sizing:border-box}#Run{position:fixed;left:10px;top:10px;z-index:10000}</style></head><body><main data-hmi-screen="Main"><button id="Run" data-hmi-name="Run" data-hmi-events="' + attr('HMIRuntime.Trace("READY");') + '">Run</button><section id="group" data-hmi-name="Group"><button id="target" data-hmi-name="Target">Target</button></section><span data-hmi-name="Hidden" hidden>Hidden</span><section id="pad" data-hmi-name="Pad" style="position:absolute;left:650px;top:210px;width:180px;height:90px;border:3px solid black;box-sizing:border-box;padding:2px 4px 6px 8px"><span id="pad-content" style="display:block;line-height:20px">Motor</span><svg width="10" height="10"></svg></section><section id="pad-copy" data-hmi-name="PadCopy" style="position:absolute;left:650px;top:320px;padding:0">Copy</section></main><script type="module">import{installFramecraftHmiRuntime}from"/src/framecraftHmiRuntime.ts";window.qa={traces:[],errors:[]};window.qa.dispose=installFramecraftHmiRuntime({navigate:()=>{},routes:[],trace:m=>window.qa.traces.push(m),error:m=>window.qa.errors.push(m)});</script></body></html>');
  await build({
    root: generated,
    configLoader: 'runner',
    logLevel: 'error'
  });
  server = await preview({
    root: generated,
    configLoader: 'runner',
    preview: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false
    },
    logLevel: 'error'
  });
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });
  const context = await browser.newContext({
    viewport: {
      width: 1365,
      height: 900
    }
  });
  let external = 0,
    plcWrites = 0;
  const allowed = new Set([origin]);
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('data:')) return route.continue();
    if ([...allowed].some(origin => url.startsWith(origin + '/'))) {
      if (url.includes('/tags/write')) plcWrites++;
      return route.continue();
    }
    external++;
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  const run = async (source, label) => {
    await page.locator('#Run').evaluate((button, binding) => button.setAttribute('data-hmi-events', binding), binding(source));
    await page.locator('#Run').click();
    await page.waitForFunction(label => window.qa.traces.some(t => t.includes(label + '=')), label);
    return JSON.parse(await page.evaluate(label => (() => {
      const trace = window.qa.traces.find(t => t.includes(label + '='));
      return trace.slice(trace.indexOf(label + '=') + label.length + 1);
    })(), label));
  };
  const read = label => 'const b=Screen.Items("Target").GetBoundingBoxInScreenCoordinates();HMIRuntime.Trace("' + label + '="+JSON.stringify(b));';
  const compare = (actual, expected) => {
    assert.ok(expected);
    for (const [key, value] of Object.entries({
      Left: expected.x,
      Top: expected.y,
      Width: expected.width,
      Height: expected.height
    })) assert.ok(Math.abs(actual[key] - value) < 0.05, key + ': ' + actual[key] + ' vs ' + value);
  };
  const pad=page.locator('#pad');
  const originalPadding=await pad.evaluate(element=>({padding:element.style.padding,priority:element.style.getPropertyPriority('padding-left'),width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}));
  assert.deepEqual(await run('const p=Screen.Items("Pad").Padding;HMIRuntime.Trace("PADDING_BASE="+JSON.stringify([p.Left,p.Top,p.Right,p.Bottom]));','PADDING_BASE'),[8,2,4,6]);
  await page.addStyleTag({content:'#pad{padding-left:99px!important}'});
  assert.equal(await pad.evaluate(element=>getComputedStyle(element).paddingLeft),'99px');
  await run('Screen.Items("Pad").Padding.Left=8;HMIRuntime.Trace("PADDING_IMPORTANT="+JSON.stringify(Screen.Items("Pad").Padding.Left));','PADDING_IMPORTANT');
  assert.equal(await pad.evaluate(element=>getComputedStyle(element).paddingLeft),'8px');
  assert.deepEqual(await run('const t=Screen.Items("Pad");t.Padding={Left:24,Top:12,Right:16,Bottom:8};HMIRuntime.Trace("PADDING_SET="+JSON.stringify([t.Padding.Left,t.Padding.Top,t.Padding.Right,t.Padding.Bottom]));','PADDING_SET'),[24,12,16,8]);
  const verifyPadding=async(left,top)=>{const box=await pad.boundingBox(),content=await page.locator('#pad-content').boundingBox();assert.ok(Math.abs(content.x-box.x-3-left)<.01);assert.ok(Math.abs(content.y-box.y-3-top)<.01);assert.equal(box.width,originalPadding.width);assert.equal(box.height,originalPadding.height);};
  await verifyPadding(24,12);
  assert.equal(await run('Screen.Items("PadCopy").Padding=Screen.Items("Pad").Padding;Screen.Items("Pad").Padding.Left=31;HMIRuntime.Trace("PADDING_COPY="+JSON.stringify(Screen.Items("PadCopy").Padding.Left));','PADDING_COPY'),24);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#pad-copy')).paddingLeft==='24px');
  await run('const p=Screen.Items("Pad").Padding;HMIRuntime.Timers.SetTimeout(()=>{p.Top=17;HMIRuntime.Trace("PADDING_TIMER="+JSON.stringify(p.Top));},10);','PADDING_TIMER');
  await verifyPadding(31,17);
  assert.ok((await run('try{Screen.Items("Pad").Padding.Bottom=-2;}catch(error){HMIRuntime.Trace("PADDING_NEGATIVE="+JSON.stringify(error.message));}','PADDING_NEGATIVE')).includes('non negativo'));
  assert.equal(await pad.evaluate(element=>getComputedStyle(element).paddingBottom),'8px');
  // Later author changes survive disposal of the transient script layer.
  await pad.evaluate(element=>element.style.setProperty('padding-top','44px','important'));
  compare(await run(read('ROTATED'), 'ROTATED'), await page.locator('#target').boundingBox());
  const live = await run('const target=Screen.Items("Target");target.Left=80;target.Margin.Top=12;const get=target.GetBoundingBoxInScreenCoordinates.bind(target);HMIRuntime.Trace("LIVE="+JSON.stringify(get()));', 'LIVE');
  compare(live, await page.locator('#target').boundingBox());
  await page.evaluate(() => window.scrollTo(0, 120));
  compare(await run(read('SCROLLED'), 'SCROLLED'), await page.locator('#target').boundingBox());
  assert.equal(await run('HMIRuntime.Trace("HIDDEN="+JSON.stringify(Screen.Items("Hidden").GetBoundingBoxInScreenCoordinates()));', 'HIDDEN'), null);
  await run('const target=Screen.Items("Target"),get=target.GetBoundingBoxInScreenCoordinates.bind(target);HMIRuntime.Timers.SetTimeout(()=>HMIRuntime.Trace("TIMED="+JSON.stringify(get())),10);', 'TIMED');
  const target=page.locator('#target');
  await target.evaluate(element=>Object.assign(element.style,{rotate:'10deg',scale:'1.5 2',transform:'translate(11px,17px) rotate(33deg) skewX(12deg) scale(1.2,.8)',transformOrigin:'25px 12px'}));
  const originalRotation=await target.evaluate(element=>({rotate:element.style.rotate,scale:element.style.scale,transform:element.style.transform,pivot:element.style.transformOrigin}));
  const baseMatrix=await target.evaluate(element=>{const css=getComputedStyle(element),[sx,sy]=css.scale.split(' ').map(Number),m=new DOMMatrix().rotate(parseFloat(css.rotate)).scale(sx,sy).multiply(new DOMMatrix(css.transform));return[m.a,m.b,m.c,m.d,m.e,m.f];});
  compare(await run('const target=Screen.Items("Target");target.RotationAngle=-25;HMIRuntime.Trace("ANGLE="+JSON.stringify(target.GetBoundingBoxInScreenCoordinates()));','ANGLE'),await target.boundingBox());
  const rotatedMatrix=await target.evaluate(element=>{const m=new DOMMatrix(getComputedStyle(element).transform);return[m.a,m.b,m.c,m.d,m.e,m.f];});
  const [a,b,c,d,e,f]=baseMatrix,[ra,rb,rc,rd,re,rf]=rotatedMatrix;
  assert.ok(Math.abs(Math.atan2(rb,ra)*180/Math.PI+25)<.001);
  for(const [actual,expected]of [[ra*ra+rb*rb,a*a+b*b],[rc*rc+rd*rd,c*c+d*d],[ra*rc+rb*rd,a*c+b*d],[ra*rd-rb*rc,a*d-b*c],[re,e],[rf,f]])assert.ok(Math.abs(actual-expected)<.001);
  await run('const target=Screen.Items("Target");HMIRuntime.Timers.SetTimeout(()=>{target.RotationAngle=80;HMIRuntime.Trace("ANGLE_TIMER="+JSON.stringify(target.RotationAngle));},10);','ANGLE_TIMER');
  assert.ok(Math.abs(await target.evaluate(element=>{const m=new DOMMatrix(getComputedStyle(element).transform);return Math.atan2(m.b,m.a)*180/Math.PI;})-80)<.001);
  const readOrigin=()=>target.evaluate(element=>getComputedStyle(element).transformOrigin.split(' ').map(Number.parseFloat));
  assert.deepEqual(await run('const t=Screen.Items("Target");t.RotationCenterPlacement=0;t.RotationCenterX=12.5;t.RotationCenterY=-8;HMIRuntime.Trace("PIVOT_OFFSET="+JSON.stringify([t.RotationCenterPlacement,t.RotationCenterX,t.RotationCenterY]));','PIVOT_OFFSET'),[0,12.5,-8]);
  let originPoint=await readOrigin();assert.ok(Math.abs(originPoint[0]-72.5)<.01);assert.ok(Math.abs(originPoint[1]-14.5)<.01);
  await run('const t=Screen.Items("Target");t.Width=200;t.Height=80;HMIRuntime.Trace("PIVOT_RESIZE="+JSON.stringify(t.Width));','PIVOT_RESIZE');
  originPoint=await readOrigin();assert.ok(Math.abs(originPoint[0]-112.5)<.01);assert.ok(Math.abs(originPoint[1]-32)<.01);
  await run('const t=Screen.Items("Target");t.RotationCenterPlacement=1;t.RotationCenterX=1;t.RotationCenterY=-1;HMIRuntime.Trace("PIVOT_NORM="+JSON.stringify(t.RotationCenterPlacement));','PIVOT_NORM');
  originPoint=await readOrigin();assert.ok(Math.abs(originPoint[0]-200)<.01);assert.ok(Math.abs(originPoint[1])<.01);
  await run('const t=Screen.Items("Target");t.Width=180;t.Height=60;HMIRuntime.Trace("PIVOT_NORM_RESIZE="+JSON.stringify(t.Width));','PIVOT_NORM_RESIZE');
  originPoint=await readOrigin();assert.ok(Math.abs(originPoint[0]-180)<.01);assert.ok(Math.abs(originPoint[1])<.01);
  await run('const t=Screen.Items("Target");HMIRuntime.Timers.SetTimeout(()=>{t.RotationCenterPlacement=2;t.RotationCenterX=120;t.RotationCenterY=100;HMIRuntime.Trace("PIVOT_SCREEN="+JSON.stringify(t.GetBoundingBoxInScreenCoordinates()));},10);','PIVOT_SCREEN');
  const verifyPivot=async()=>{
    const points=await target.evaluate(element=>{
      const css=getComputedStyle(element),origin=css.transformOrigin.split(' ').map(parseFloat),screen=element.closest('[data-hmi-screen]');
      let marker=element.querySelector('[data-qa-pivot]');if(!marker){marker=document.createElement('span');marker.dataset.qaPivot='';element.append(marker);}
      Object.assign(marker.style,{display:'block',position:'absolute',left:(origin[0]-parseFloat(css.borderLeftWidth))+'px',top:(origin[1]-parseFloat(css.borderTopWidth))+'px',width:'0px',height:'0px',margin:'0',padding:'0',border:'0',pointerEvents:'none'});
      let reference=screen.querySelector('[data-qa-screen-point]');if(!reference){reference=document.createElement('span');reference.dataset.qaScreenPoint='';screen.append(reference);}
      const rootCss=getComputedStyle(screen);Object.assign(reference.style,{display:'block',position:'absolute',left:(120-parseFloat(rootCss.borderLeftWidth||'0'))+'px',top:(100-parseFloat(rootCss.borderTopWidth||'0'))+'px',width:'0px',height:'0px',margin:'0',padding:'0',border:'0',pointerEvents:'none'});
      const a=marker.getBoundingClientRect(),b=reference.getBoundingClientRect();return[a.left,a.top,b.left,b.top];
    });assert.ok(Math.abs(points[0]-points[2])<.05,'absolute pivot X: '+points);assert.ok(Math.abs(points[1]-points[3])<.05,'absolute pivot Y: '+points);
  };
  await verifyPivot();
  await run('const t=Screen.Items("Target");t.RotationAngle=35;Screen.Items("Group").RotationAngle=-50;Screen.Items("Group").Left=320;HMIRuntime.Trace("PIVOT_GROUP="+JSON.stringify(t.GetBoundingBoxInScreenCoordinates()));','PIVOT_GROUP');await verifyPivot();
  await page.locator('#group').evaluate(element=>{element.style.zoom='1.2';element.style.left='450px';});await page.waitForTimeout(60);await verifyPivot();
  await page.evaluate(()=>window.scrollTo(0,240));await page.waitForTimeout(40);await verifyPivot();
  await run('const t=Screen.Items("Target");t.Width=160;HMIRuntime.Trace("PIVOT_RESIZE_ABS="+JSON.stringify(t.GetBoundingBoxInScreenCoordinates()));','PIVOT_RESIZE_ABS');await verifyPivot();
  await page.locator('#group').evaluate(element=>element.style.scale='0');await page.waitForFunction(()=>window.qa.errors.some(error=>error.includes('non invertibile')));
  const pivotFaults=await page.evaluate(()=>window.qa.errors);assert.equal(pivotFaults.length,1);assert.ok(pivotFaults[0].includes('Centro di rotazione'));
  await page.locator('#group').evaluate(element=>element.style.scale='1');await page.waitForTimeout(60);await verifyPivot();await page.evaluate(()=>window.qa.errors=[]);
  for (let version = 1; version <= 9; version++) {
    const source = 'HMIRuntime.Trace("LEGACY' + version + '="+JSON.stringify(Screen.Items("Target").Name));';
    const compiled = program(source);
    compiled.version = version;
    await page.locator('#Run').evaluate((button, value) => button.setAttribute('data-hmi-events', value), JSON.stringify([{
      event: 'Tapped',
      script: source,
      program: compiled
    }]));
    await page.locator('#Run').click();
  }
  await page.waitForFunction(() => window.qa.traces.filter(t => /LEGACY\d=/.test(t)).length === 9);
  await page.screenshot({
    path: path.join(generated, 'geometry-runtime.png')
  });
  assert.deepEqual(await page.evaluate(() => window.qa.errors), []);
  await writeFile(path.join(generated, 'runtime.mjs'), scripts.hmiScriptRuntimeModuleSource());
  await copyFile(path.join(generated, 'src/framecraftHmiFlashing.ts'), path.join(generated, 'flashing.mjs'));
  const runtime = await import(pathToFileURL(path.join(generated, 'runtime.mjs')).href),
    flashing = await import(pathToFileURL(path.join(generated, 'flashing.mjs')).href);
  const controller = flashing.createHmiPropertyFlashing({
    items: () => [{
      itemId: 's',
      screenId: 's',
      name: 'Main',
      flashing: []
    }, {
      itemId: 'a',
      screenId: 's',
      name: 'A',
      flashing: [],
      properties: {RotationAngle:0,RotationCenterPlacement:0,RotationCenterX:0,RotationCenterY:0,"Padding.Left":0,"Padding.Top":0,"Padding.Right":0,"Padding.Bottom":0},
      boundingBox: {
        Left: -5.5,
        Top: 4,
        Width: 10.25,
        Height: 20
      }
    }],
    apply: () => {},applyProperties:()=>{}
  });
  const node = runtime.executeHmiScript(program('return JSON.stringify(item.GetBoundingBoxInScreenCoordinates());'), {}, {
    screenItems: controller.context('a')
  });
  assert.equal(node.error, undefined);
  assert.equal(JSON.parse(node.returned).Width, 10.25);
  const nodeAngle=runtime.executeHmiScript(program('item.RotationAngle=-32768;return item.RotationAngle;'),{},{screenItems:controller.context('a')});assert.equal(nodeAngle.error,undefined);assert.equal(nodeAngle.returned,-32768);
  const nodePivot=runtime.executeHmiScript(program('item.RotationCenterPlacement=1;item.RotationCenterX=2.5;return item.RotationCenterX;'),{},{screenItems:controller.context('a')});assert.equal(nodePivot.error,undefined);assert.equal(nodePivot.returned,2.5);
  const nodePadding=runtime.executeHmiScript(program('item.Padding={Left:-2147483648,Top:2147483647,Right:3,Bottom:4};return JSON.stringify([item.Padding.Left,item.Padding.Top]);'),{},{screenItems:controller.context('a')});assert.equal(nodePadding.error,undefined);assert.deepEqual(JSON.parse(nodePadding.returned),[-2147483648,2147483647]);
  await page.evaluate(()=>window.qa.dispose());
  assert.equal(await pad.evaluate(element=>element.style.paddingLeft),'8px');assert.equal(await pad.evaluate(element=>element.style.paddingRight),'4px');assert.equal(await pad.evaluate(element=>element.style.paddingTop),'44px');assert.equal(await pad.evaluate(element=>element.style.getPropertyPriority('padding-top')),'important');
  assert.deepEqual(await target.evaluate(element=>({rotate:element.style.rotate,scale:element.style.scale,transform:element.style.transform,pivot:element.style.transformOrigin})),originalRotation);
  // Exercise the actual Vite preview endpoint plus the parent-side client and VM.
  const previewRoot = path.join(generated, 'editor-preview');
  await mkdir(previewRoot);
  for (const file of ['runtime.mjs', 'flashing.mjs']) await copyFile(path.join(generated, file), path.join(previewRoot, file));
  await copyFile(path.join(root, 'scripts/hmi-geometry-preview.mjs'), path.join(previewRoot, 'geometry-preview.mjs'));
  await writeFile(path.join(previewRoot, 'panel.html'), '<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0"><main data-hmi-screen="Main"><button data-hmi-name="A" style="position:absolute;left:20px;top:40px;width:100px;height:35px;box-sizing:border-box;padding:1px;transform:rotate(25deg)">A</button></main></body></html>');
  await writeFile(path.join(previewRoot, 'host.html'), '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><iframe style="width:900px;height:600px"></iframe><script type="module">import{createHmiGeometryPreviewClient}from"/geometry-preview.mjs";import{createHmiPropertyFlashing}from"/flashing.mjs";import{executeHmiScriptAsync}from"/runtime.mjs";const frame=document.querySelector("iframe");let endpoint,snapshot,manager;const client=createHmiGeometryPreviewClient(window,()=>endpoint);const controller=createHmiPropertyFlashing({items:()=>snapshot||[],apply:()=>{},applyProperties:commands=>frame.contentWindow.postMessage({type:"framecraft:screen-properties",commands},location.origin),measureBoundingBox:(id,signal)=>client.measure(id,signal)});window.previewQA={run:program=>executeHmiScriptAsync(program,{},{screenItems:manager})};window.addEventListener("message",event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=="framecraft:ready")return;client.cancel();controller.reset();endpoint={window:frame.contentWindow,origin:event.origin,pageId:event.data.alarmPreviewPageId};snapshot=event.data.screenItems;manager=controller.context(snapshot.find(item=>item.name==="A").itemId);frame.contentWindow.postMessage({type:"framecraft:set-shortcuts",pageId:endpoint.pageId,bindings:{}},endpoint.origin);frame.contentWindow.postMessage({type:"framecraft:set-mode",mode:"navigate"},endpoint.origin);window.previewQA.ready=event.data.geometryPreviewProtocol===1;});frame.src="/panel.html";</script></body></html>');
  const resourcesRoot=path.join(generated,'packaged-preview-resources');
  const resources=JSON.parse(await readFile(path.join(root,'src-tauri/tauri.conf.json'),'utf8')).bundle.resources;
  for(const [source,target] of Object.entries(resources)){
    const destination=path.join(resourcesRoot,target);assert.ok(destination.startsWith(resourcesRoot+path.sep));
    await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.resolve(root,'src-tauri',source),destination);
  }
  await symlink(path.join(root,'node_modules'),path.join(resourcesRoot,'node_modules'),'junction');
  const packagedPlugin=(await import(pathToFileURL(path.join(resourcesRoot,'scripts/framecraft-vite-plugin.mjs')).href)).default;
  previewServer = await createServer({
    root: previewRoot,
    configFile: false,
    plugins: [packagedPlugin()],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      watch: null
    },
    logLevel: 'error'
  });
  await previewServer.listen();
  const previewOrigin = 'http://127.0.0.1:' + previewServer.httpServer.address().port;
  allowed.add(previewOrigin);
  allowed.add(previewOrigin.replace('http:', 'ws:'));
  const host = await context.newPage();
  host.on('pageerror', e => errors.push(e.message));
  await host.goto(previewOrigin + '/host.html');
  await host.waitForFunction(() => window.previewQA?.ready);
  const result = await host.evaluate(program => window.previewQA.run(program), program('item.Padding={Left:11,Top:7,Right:5,Bottom:3};item.Left=190;item.RotationAngle=65;item.RotationCenterPlacement=2;item.RotationCenterX=50;item.RotationCenterY=30;return JSON.stringify(item.GetBoundingBoxInScreenCoordinates());'));
  assert.equal(result.error, undefined);
  const expected = await host.frameLocator('iframe').locator('[data-hmi-name="A"]').evaluate(element => {
    const b = element.getBoundingClientRect();
    return {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height
    };
  });
  compare(JSON.parse(result.returned), expected);
  const previewPad=host.frameLocator('iframe').locator('[data-hmi-name="A"]');assert.equal(await previewPad.evaluate(element=>getComputedStyle(element).padding),'7px 5px 3px 11px');
  const negative=await host.evaluate(program=>window.previewQA.run(program),program('item.Padding.Left=-1;'));assert.ok(negative.error.includes('non negativo'));assert.equal(await previewPad.evaluate(element=>getComputedStyle(element).paddingLeft),'11px');
  await host.screenshot({
    path: path.join(generated, 'geometry-preview.png')
  });
  assert.deepEqual(errors, []);
  assert.equal(external, 0);
  assert.equal(plcWrites, 0);
  console.log(JSON.stringify({
    passed: true,
    generated,
    standardPipeline: true,
    paddingLayout:true,paddingCopy:true,paddingTimer:true,paddingRestoration:true,paddingPreview:true,paddingNegativeRejected:true,paddingNodeSigned:true,
    compiledPanel: true,
    rotationAndGroups: true,
    pivotModes:true,pivotResize:true,pivotScaledRotatedGroups:true,pivotScroll:true,pivotZoom:true,pivotFaultRecovery:true,
    rotationScript:true,rotationTimer:true,rotationAffinePreserved:true,rotationRestored:true,
    currentGeometryAfterWrite: true,
    viewportScroll: true,
    hiddenReturnsNull: true,
    timer: true,
    legacyReaders: '1-9',
    generatedNode: true,
    realPreviewBridge: true,
    packagedResources: true,
    external,
    plcWrites
  }));
} catch (error) {
  console.error({
    browserErrors: errors
  });
  const pages = browser?.contexts()[0]?.pages() || [];
  for (const page of pages) console.error(await page.evaluate(() => ({
    url: location.href,
    qa: window.qa,
    preview: window.previewQA?.ready,
    frames: [...document.querySelectorAll('iframe')].map(f => ({
      src: f.src,
      html: f.contentDocument?.body?.innerHTML?.slice(0, 500)
    }))
  })));
  throw error;
} finally {
  await browser?.close();
  await previewServer?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await editor?.close();
}
