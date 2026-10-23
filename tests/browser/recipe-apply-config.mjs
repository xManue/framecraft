import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
let server, browser;
try {
  await mkdir(path.join(root, '.hmi-preview'), {recursive:true}); const artifacts = await mkdtemp(path.join(root, '.hmi-preview/recipe-apply-config-browser-'));
  server = await createServer({root,configLoader:'runner',cacheDir:path.join(artifacts,'node_modules/.vite'),server:{host:'127.0.0.1',port:0,strictPort:false,watch:null,warmup:{clientFiles:[]}},logLevel:'error'}); await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port; browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors = []; let external = 0, operations = 0;
  page.on('pageerror', error => errors.push(error.message)); await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { external++; return route.abort(); } if (url.pathname.startsWith('/_framecraft/')) { operations++; return route.abort(); } return route.continue(); });
  await page.goto(origin + '/tests/fixtures/recipe-apply-editor.html', {waitUntil:'domcontentloaded'});
  const enabled = page.getByLabel('Configura applicazione PLC per questo schema',{exact:true}); await enabled.waitFor({timeout:60000}); const dialog = page.getByRole('dialog'), before = await dialog.boundingBox();
  await page.getByLabel('Schema ricetta',{exact:true}).selectOption('other'); const after = await dialog.boundingBox(); assert.equal(before.width,after.width); assert.equal(before.height,after.height); await page.getByLabel('Schema ricetta',{exact:true}).selectOption('s');
  await enabled.check(); await page.getByLabel('ID canale PLC',{exact:true}).fill('line1'); await page.getByLabel('Tag richiesta al PLC',{exact:true}).selectOption('Request'); await page.getByLabel('Tag risposta del PLC',{exact:true}).selectOption('Response');
  assert.equal((await page.evaluate(() => window.recipeApplyQa)).saves,0); const layouts = [];
  for (const width of [1440,1024,768,375]) {
    await page.setViewportSize({width,height:1000}); const layout = await dialog.evaluate(node => ({overflow:node.scrollWidth>node.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,targets:[...node.querySelectorAll('button,select,input:not([type=checkbox]),.recipe-plc-check')].filter(item => item.getClientRects().length).map(item => item.getBoundingClientRect().height)}));
    assert.equal(layout.overflow,false); assert.ok(layout.targets.every(height => height>=43.9)); layouts.push({width,overflow:layout.overflow}); await page.screenshot({path:path.join(artifacts,'editor-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000}); await page.getByRole('button',{name:'Verifica configurazione',exact:true}).click(); const confirm = page.getByRole('button',{name:'Conferma salvataggio interfaccia',exact:true}); assert.equal(await confirm.isDisabled(),true); assert.equal((await page.evaluate(() => window.recipeApplyQa)).saves,0);
  await page.getByLabel('Confermo che il servizio è fermo e che canale, buffer e protocollo sono concordati con chi programma il PLC',{exact:true}).check(); await confirm.click(); await page.getByText(/Interfaccia salvata\. Nessuna connessione avviata/).waitFor(); const result = await page.evaluate(() => window.recipeApplyQa); assert.equal(result.saves,1); assert.deepEqual(result.saved.schemas.map(item=>[item.schemaId,item.channelId,item.requestTag,item.responseTag]),[['s','line1','Request','Response']]);
  assert.deepEqual(errors,[]); assert.equal(external,0); assert.equal(operations,0); console.log(JSON.stringify({passed:true,artifacts,layouts,fixedDialog:true,saves:1,external,plcOperations:operations,native:'mocked bridge; separate focused Rust tests'}));
} finally { await browser?.close(); await server?.close(); }
