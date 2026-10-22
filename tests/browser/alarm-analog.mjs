import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), base = path.join(root, '.hmi-preview');
let server, browser;
try {
  await mkdir(base, { recursive: true }); const output = await mkdtemp(path.join(base, 'analog-browser-'));
  server = await createVite({ root, configLoader: 'runner', cacheDir: path.join(output, 'node_modules/.vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null, warmup: { clientFiles: [] } }, logLevel: 'error' }); await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), external = [], errors = [], plc = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(request.url()); if (url.pathname.startsWith('/_framecraft/')) plc.push(request.url()); });
  await page.goto(origin + '/tests/fixtures/alarm-analog-editor.html', { waitUntil: 'domcontentloaded', timeout: 45000 }); const dialog = page.getByRole('dialog'); await page.getByRole('button', { name: 'Applica segnale di prova', exact: true }).waitFor({ timeout: 45000 });
  assert.equal(await page.getByLabel('Attivazione', { exact: true }).inputValue(), 'high-equal'); assert.equal(await page.getByLabel('Segnale PLC della soglia', { exact: true }).inputValue(), 'Limit');
  await page.getByLabel('Valore del segnale selezionato', { exact: true }).fill('10'); await page.getByRole('button', { name: 'Applica segnale di prova', exact: true }).click();
  await page.locator('[data-hmi-type="HmiAlarmIndicator"]').getByText(/sconosciuti/).waitFor();
  await page.getByLabel('Valore della soglia PLC di prova', { exact: true }).fill('10'); await page.getByRole('button', { name: 'Applica soglia di prova', exact: true }).click();
  assert.match(await page.locator('.alarm-test-view tbody').innerText(), /Attivo/);
  await page.getByLabel('Qualità della soglia', { exact: true }).selectOption('0'); await page.getByLabel('Valore della soglia PLC di prova', { exact: true }).fill('100'); await page.getByRole('button', { name: 'Applica soglia di prova', exact: true }).click();
  const detail = page.locator('.alarm-test-view tbody details'); await detail.locator('summary').focus(); await page.keyboard.press('Enter'); assert.equal(await detail.getAttribute('open'), ''); assert.match(await detail.innerText(), /Soglia PLC non disponibile/); assert.match(await page.locator('.alarm-test-view tbody').innerText(), /Attivo/);
  for (const text of ['Successivi', 'Precedenti', 'Conferma rientro']) assert.equal(await page.locator('.alarm-test-view button').filter({ hasText: text }).isVisible(), false);
  const layouts = [];
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 }); await page.getByLabel('Origine della soglia', { exact: true }).scrollIntoViewIfNeeded();
    const layout = await dialog.evaluate(element => { const row = element.querySelector('.alarm-test-view tbody tr'); return { overflow: element.scrollWidth > element.clientWidth + 1, bodyOverflow: document.documentElement.scrollWidth > innerWidth + 1, rowDisplay: getComputedStyle(row).display }; }); assert.equal(layout.overflow, false); assert.equal(layout.bodyOverflow, false); assert.equal(layout.rowDisplay, width === 375 ? 'block' : 'table-row'); layouts.push({ width, ...layout });
    await page.screenshot({ path: path.join(output, 'editor-' + width + '.png') }); await detail.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'diagnostic-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); assert.equal(await page.getByRole('button', { name: 'Salva allarmi', exact: true }).isDisabled(), true); await page.getByLabel('Isteresi di rientro', { exact: true }).fill('3'); await page.getByRole('button', { name: 'Salva allarmi', exact: true }).click();
  const result = await page.evaluate(() => window.framecraftAnalogQa); assert.equal(result.reads, 1); assert.equal(result.saves, 1); assert.deepEqual(result.saved.alarms[0].trigger, { kind: 'high-equal', limit: { tag: 'Limit' }, hysteresis: 3 });
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(plc, []);
  console.log(JSON.stringify({ passed: true, output, layouts, keyboardDiagnostic: true, reads: result.reads, saves: result.saves, external: external.length, plcRequests: plc.length, nativeBridge: 'mocked: synthetic catalogs only', runtimeProtocols: 'separate emitted-launcher integration tests' }));
} finally { await browser?.close(); await server?.close(); }
