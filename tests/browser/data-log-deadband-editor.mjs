import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), base = path.join(root, '.hmi-preview');
let server, browser;
try {
  await mkdir(base, { recursive:true }); const fixture = await mkdtemp(path.join(base, 'deadband-editor-browser-'));
  await writeFile(path.join(fixture, 'index.html'), await readFile(path.join(root, 'tests/fixtures/data-log-deadband-editor.html')));
  server = await createServer({ root, configLoader:'runner', logLevel:'error', server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:()=>true},warmup:{clientFiles:[]}}, cacheDir:path.join(fixture, 'node_modules/.vite') });
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel:process.platform === 'win32' ? 'msedge' : undefined, headless:true });
  const page = await browser.newPage({ viewport:{width:640,height:1080} }), errors = []; let external = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external++; return route.abort(); });
  await page.goto(origin + '/' + path.relative(root, fixture).replaceAll('\\','/') + '/index.html');
  await page.getByLabel('Filtro variazioni predefinito', {exact:true}).selectOption('absolute');
  await page.getByLabel('Variazione minima (unità del tag)', {exact:true}).fill('5');
  await page.getByText('Filtro dell’archivio: almeno 5 unità del tag.', {exact:true}).waitFor();
  await page.getByLabel('Filtro variazioni della variabile', {exact:true}).selectOption('none');
  await page.getByRole('button', {name:'Salva Data Log',exact:true}).click();
  await page.waitForFunction(() => window.saved);
  const saved = JSON.parse(await page.evaluate(() => window.saved));
  assert.equal(saved.logs[0].deadband.value, 5); assert.equal(saved.logs[0].tags[0].deadband.mode, 'none');
  const shots = path.join(fixture, 'shots'); await mkdir(shots);
  for (const width of [375,640]) {
    await page.setViewportSize({width,height:1080});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({path:path.join(shots,width+'.png'),fullPage:true});
  }
  assert.equal(external,0); assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,savedAndValidated:true,widths:[375,640],shots,external}));
} finally { await browser?.close(); await server?.close(); }
