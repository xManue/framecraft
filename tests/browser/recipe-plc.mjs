import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createVite, build } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Aedes } from 'aedes';
import { connectAsync } from 'mqtt';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), base = path.join(root, '.hmi-preview');
const token = 'synthetic_recipe_capture_browser_token_0123456789', password = 'SYNTHETIC-capture-browser-password-012345';
let editor, panel, browser, child, exited, broker, tcp, publisher;
const wait = async (check, label) => { const end = Date.now() + 60000; while (!await check()) { if (Date.now() > end) throw new Error('Timeout: ' + label); await new Promise(resolve => setTimeout(resolve, 100)); } };
try {
  await mkdir(base, { recursive: true }); const generated = await mkdtemp(path.join(base, 'recipe-plc-browser-')), shots = path.join(generated, 'shots'); await mkdir(shots);
  editor = await createVite({ root, configLoader: 'runner', cacheDir: path.join(generated, 'editor/node_modules/.vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null, warmup: { clientFiles: [] } }, logLevel: 'error' });
  const { standardProjectFiles } = await editor.ssrLoadModule('/src/core/standardProject.ts');
  const files = standardProjectFiles({ machineName: 'Ricette PLC QA', layout: 'desktop', sections: ['main'] });
  for (const file of files) { const target = path.resolve(generated, file.path); assert.ok(target.startsWith(generated + path.sep)); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
  await symlink(path.join(root, 'node_modules'), path.join(generated, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await copyFile(new URL('../fixtures/recipe-exchange-panel.html', import.meta.url), path.join(generated, 'recipe-qa.html'));
  await copyFile(new URL('../fixtures/audit-runtime-tsconfig.json', import.meta.url), path.join(generated, 'tsconfig.recipe-qa.json'));
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.recipe-qa.json'], { cwd: generated, encoding: 'utf8', windowsHide: true });
  panel = await createVite({ root: generated, configLoader: 'runner', cacheDir: path.join(generated, 'panel/node_modules/.vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null, warmup: { clientFiles: [] } }, logLevel: 'error' }); await panel.listen(); const origin = 'http://127.0.0.1:' + panel.httpServer.address().port;
  const config = JSON.parse(files.find(file => file.path === 'framecraft.auth.json').content);
  await writeFile(path.join(generated, 'framecraft.auth.json'), JSON.stringify({ ...config, enabled: true, allowHttpLoopback: true }));
  await writeFile(path.join(generated, 'framecraft.runtime.json'), JSON.stringify({ version: 1, gateway: { enabled: true, path: '/_framecraft/plc/v1', pollMs: 1000, timeoutMs: 5000 } }));
  const schema = { id: 'format', name: 'Formato QA', fields: [{ id: 'speed', name: 'Velocità', type: 'number', minimum: 0, maximum: 100, unit: 'pz/min' }, { id: 'enabled', name: 'Abilitato', type: 'boolean' }, { id: 'note', name: 'Nota', type: 'string' }], records: [{ id: 'a', name: 'Formato A', values: { speed: 10, enabled: true, note: 'prima' } }] };
  const variables = [{ name: 'Speed', dataType: 'Real', access: 'read' }, { name: 'Enabled', dataType: 'Bool', access: 'read' }, { name: 'Note', dataType: 'String', access: 'read' }];
  await writeFile(path.join(generated, 'framecraft.recipes.json'), JSON.stringify({ version: 1, schemas: [schema] }));
  await writeFile(path.join(generated, 'framecraft.plc.json'), JSON.stringify({ version: 1, variables }));
  await writeFile(path.join(generated, 'framecraft.recipe-plc.json'), JSON.stringify({ version: 1, schemas: [{ schemaId: schema.id, maxAgeMs: 10000, maxSkewMs: 100, fields: schema.fields.map((field, i) => ({ fieldId: field.id, tag: variables[i].name })) }] }));
  broker = await Aedes.createBroker(); tcp = createServer(broker.handle); await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve)); const mqttUrl = 'mqtt://127.0.0.1:' + tcp.address().port; publisher = await connectAsync(mqttUrl, { reconnectPeriod: 0 });
  let plcWrites = 0; broker.on('publish', packet => { if (packet.topic === 'command') plcWrites++; });
  const publish = values => publisher.publishAsync('values', JSON.stringify({ ...values, quality: 192 }), { retain: true, qos: 1 }); await publish({speed:9, enabled:true, note:'retained'});
  await writeFile(path.join(generated, 'framecraft.connections.json'), JSON.stringify({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: 'SYNTHETIC_CAPTURE_TOKEN', allowedOrigins: [origin], allowWrites: false }, connections: [{ id: 'mqtt', protocol: 'mqtt', enabled: true, url: mqttUrl, allowInsecure: true, allowWrites: false, bindings: variables.map((variable, i) => ({ tag: variable.name, topic: 'values', valuePath: '/' + schema.fields[i].id, qualityPath: '/quality', writeTopic: 'command' })) }] }));
  const { writeOperatorStore, hashOperatorPassword } = await import(pathToFileURL(path.join(generated, 'runtime/operator-store.mjs')).href);
  const security = path.join(generated, '.framecraft-runtime/security'); await mkdir(security, { recursive: true }); await writeOperatorStore(path.join(security, 'operators.json'), { version: 1, id: randomUUID(), accounts: [{ id: randomUUID(), username: 'operator', name: 'Operatore QA', role: 'Operatore', disabled: false, permissions: [], capabilities: ['recipes.read', 'recipes.capture', 'recipes.create'], password: await hashOperatorPassword(password) }] }, undefined);
  let output = '', stderr = ''; child = spawn(process.execPath, [path.join(generated, 'runtime/start-gateway.mjs'), '--json'], { cwd: generated, windowsHide: true, env: { ...process.env, SYNTHETIC_CAPTURE_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] }); child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { stderr += data; }); exited = new Promise(resolve => child.once('exit', resolve));
  await wait(() => output.includes('"type":"gateway"'), 'launcher gateway'); const address = output.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(item => item.type === 'gateway').address;
  const service = async route => (await fetch(address + '/_framecraft/plc/v1/' + route, {headers:{Authorization:'Bearer ' + token, Origin:origin}})).json();
  await wait(async () => (await service('snapshot')).samples.length === 3, 'MQTT retained ricevuto');
  browser = await chromium.launch({ channel: 'msedge', headless: true }); const context = await browser.newContext({ viewport: {width:1440,height:1000} }), page = await context.newPage(); const errors = []; let captures = 0, saves = 0, external = 0;
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); if (url.origin !== origin) { external++; return route.abort(); }
    if (!url.pathname.startsWith('/_framecraft/plc/v1/')) return route.continue();
    if (url.pathname.endsWith('/recipe-plc')) captures++; if (url.pathname.endsWith('/recipes') && request.method() === 'POST') saves++;
    const response = await route.fetch({url: address + url.pathname + url.search, headers:{...request.headers(), authorization:'Bearer ' + token, origin, host:new URL(address).host}}); return route.fulfill({response});
  });
  await page.goto(origin + '/recipe-qa.html'); await page.getByRole('region', {name:'Archivio ricette',exact:true}).waitFor({timeout:60000}); assert.equal(captures,0);
  await page.getByRole('button',{name:'Account operatore',exact:true}).click(); await page.getByLabel('Nome utente',{exact:true}).fill('operator'); await page.getByLabel('Password',{exact:true}).fill(password); await page.getByRole('button',{name:'Accedi al pannello',exact:true}).click(); await page.getByRole('button',{name:'Esci / cambia utente',exact:true}).waitFor(); await page.getByRole('button',{name:'Chiudi accesso',exact:true}).click();
  await page.getByRole('button',{name:'Rileggi archivio',exact:true}).click(); const captureButton = page.getByRole('button',{name:'Leggi valori PLC',exact:true}); await captureButton.waitFor(); assert.equal(captures,0); await captureButton.click();
  await page.getByRole('button',{name:'Crea bozza dai valori letti',exact:true}).waitFor(); assert.equal(await page.getByRole('button',{name:'Crea bozza dai valori letti',exact:true}).isDisabled(),true); assert.match(await page.locator('.recipe-plc-comparison').innerText(),/valore conservato/);
  await publish({speed:0,enabled:false,note:''}); await wait(async () => (await service('snapshot')).samples.find(item=>item.tag==='Speed')?.value==='0','MQTT live'); await new Promise(resolve=>setTimeout(resolve,210)); await captureButton.click();
  await page.getByText('Tutti i campi sono leggibili e nei limiti configurati. Controlla le differenze prima di creare una bozza.',{exact:true}).waitFor();
  const layouts=[]; for(const width of [1440,768,375]) { await page.setViewportSize({width,height:1000}); const layout=await page.locator('[data-hmi-recipe-root]').evaluate(host=>({overflow:host.scrollWidth>host.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,controls:[...host.querySelectorAll('button,input,select')].filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect().height)})); assert.equal(layout.overflow,false); assert.ok(layout.controls.every(height=>height>=47.9)); layouts.push({width,overflow:layout.overflow}); await page.screenshot({path:path.join(shots,`panel-${width}.png`),fullPage:true}); }
  await page.getByRole('button',{name:'Crea bozza dai valori letti',exact:true}).click(); assert.equal(saves,0); assert.equal(await page.getByLabel('Velocità',{exact:true}).inputValue(),'0'); assert.equal(await page.getByLabel('Abilitato',{exact:true}).inputValue(),'false'); assert.equal(await page.getByLabel('Nota',{exact:true}).inputValue(),'');
  await page.getByLabel('Nome ricetta',{exact:true}).fill('Da macchina'); await page.getByRole('button',{name:'Verifica operazione',exact:true}).click(); assert.equal(saves,0); await page.getByRole('button',{name:'Conferma salvataggio',exact:true}).click(); await page.getByText('Salvato nell’archivio del servizio. Nessun trasferimento al PLC.',{exact:true}).waitFor(); assert.equal(saves,1); assert.equal(plcWrites,0); assert.equal(captures,2);
  await page.getByRole('button',{name:'Account operatore',exact:true}).click(); await page.getByRole('button',{name:'Esci / cambia utente',exact:true}).click(); await page.getByRole('button',{name:'Accedi al pannello',exact:true}).waitFor(); await page.getByRole('button',{name:'Chiudi accesso',exact:true}).click(); assert.equal(await page.locator('.recipe-plc-comparison').count(),0); assert.deepEqual(errors,[]); assert.equal(external,0);
  console.log(JSON.stringify({stage:'runtime-browser',passed:true,captures,saves,plcWrites,layouts}));
  await editor.listen(); const editorOrigin='http://127.0.0.1:'+editor.httpServer.address().port, editorPage=await browser.newPage({viewport:{width:1440,height:1000}}); editorPage.on('pageerror',error=>errors.push(error.message));
  await editorPage.goto(editorOrigin+'/tests/fixtures/recipe-plc-editor.html',{waitUntil:'domcontentloaded'}); await editorPage.getByLabel('Abilita lettura PLC per questo schema',{exact:true}).waitFor({timeout:60000}); const dialog=editorPage.getByRole('dialog'), before=await dialog.boundingBox(); await editorPage.getByLabel('Schema ricetta',{exact:true}).selectOption('more'); const after=await dialog.boundingBox(); assert.equal(before.width,after.width); assert.equal(before.height,after.height);
  await editorPage.getByLabel('Schema ricetta',{exact:true}).selectOption('s'); await editorPage.getByLabel('Abilita lettura PLC per questo schema',{exact:true}).check(); await editorPage.getByLabel('Tag PLC per Velocità',{exact:true}).selectOption('Speed');
  for(const width of [1440,768,375]) { await editorPage.setViewportSize({width,height:1000}); assert.equal(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1),false); await editorPage.screenshot({path:path.join(shots,`editor-${width}.png`)}); }
  await editorPage.getByRole('button',{name:'Salva collegamenti',exact:true}).click(); assert.equal((await editorPage.evaluate(()=>window.recipePlcQa)).saves,1); assert.deepEqual(errors,[]);
  console.log(JSON.stringify({stage:'editor-browser',passed:true,saves:1,fixedDialog:true}));
  const deploy = JSON.parse(await readFile(path.join(generated,'framecraft.connections.json'),'utf8'));
  deploy.gateway.port = Number(new URL(address).port); await writeFile(path.join(generated,'framecraft.connections.json'),JSON.stringify(deploy));
  const previousToken = process.env.SYNTHETIC_CAPTURE_TOKEN; process.env.SYNTHETIC_CAPTURE_TOKEN = token;
  try { await build({root:generated,configLoader:'runner',logLevel:'error',build:{rollupOptions:{input:path.join(generated,'recipe-qa.html')}}}); }
  finally { if(previousToken === undefined) delete process.env.SYNTHETIC_CAPTURE_TOKEN; else process.env.SYNTHETIC_CAPTURE_TOKEN = previousToken; }
  for(const secret of [token,password]) assert.equal((output+stderr).includes(secret),false);
  console.log(JSON.stringify({passed:true,generated,shots,layouts,captures,saves,plcWrites,external,emittedLauncher:true,realMqtt:true,realAccounts:true,runtimeTypecheck:true,qaProductionBuild:true,editorBridge:'synthetic mock',native:'separate focused Rust tests'}));
} finally { await browser?.close(); await panel?.close(); if(child&&child.exitCode===null){child.kill('SIGTERM'); await exited;} await publisher?.endAsync(true); if(broker) await new Promise(resolve=>broker.close(resolve)); if(tcp) await new Promise(resolve=>tcp.close(()=>resolve())); await editor?.close(); }
