import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, build } from 'vite';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), base = path.join(root, '.hmi-preview');
const token = 'synthetic_recipe_browser_token_01234567890123456789', password = 'SYNTHETIC-recipe-browser-password-012345';
let editor, panel, gateway, audit, browser;
try {
  await mkdir(base, { recursive: true }); const generated = await mkdtemp(path.join(base, 'recipe-exchange-browser-')); assert.equal(path.dirname(generated), base);
  editor = await createServer({ root, configLoader: 'runner', cacheDir: path.join(base, 'recipe-exchange-qa-editor/node_modules/.vite'), server: { watch: { ignored: () => true }, warmup: { clientFiles: [] } }, logLevel: 'error' });
  const { standardProjectFiles } = await editor.ssrLoadModule('/src/core/standardProject.ts');
  const files = standardProjectFiles({ machineName: 'Ricette QA sintetiche', layout: 'desktop', sections: ['main'] });
  for (const file of files) { const target = path.resolve(generated, file.path); assert.ok(target.startsWith(generated + path.sep)); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
  await symlink(path.join(root, 'node_modules'), path.join(generated, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await copyFile(new URL('../fixtures/recipe-exchange-panel.html', import.meta.url), path.join(generated, 'recipe-qa.html'));
  await copyFile(new URL('../fixtures/audit-runtime-tsconfig.json', import.meta.url), path.join(generated, 'tsconfig.recipe-qa.json'));
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.recipe-qa.json'], { cwd: generated, encoding: 'utf8', windowsHide: true });
  const config = JSON.parse(files.find(file => file.path === 'framecraft.auth.json').content);
  await writeFile(path.join(generated, 'framecraft.auth.json'), JSON.stringify({ ...config, enabled: true, allowHttpLoopback: true }));
  await writeFile(path.join(generated, 'framecraft.runtime.json'), JSON.stringify({ version: 1, gateway: { enabled: true, path: '/_framecraft/plc/v1', pollMs: 1000, timeoutMs: 5000 } }));
  const catalog = { version: 1, schemas: [{ id: 'format', name: 'Formato QA', fields: [{ id: 'speed', name: 'Velocità', type: 'integer', minimum: 0, maximum: 100, unit: 'pz/min' }, { id: 'enabled', name: 'Abilitato', type: 'boolean' }, { id: 'note', name: 'Nota', type: 'string' }], records: [{ id: 'a', name: 'Formato A', values: { speed: 10, enabled: true, note: 'prima' } }, { id: 'keep', name: 'Formato conservato', values: { speed: 20, enabled: true, note: '' } }] }] };
  await writeFile(path.join(generated, 'framecraft.recipes.json'), JSON.stringify(catalog));
  const module = name => import(pathToFileURL(path.join(generated, 'runtime', name)).href);
  const { createPlcGateway } = await module('gateway.mjs'), { createLocalOperatorAuth } = await module('operator-auth.mjs'), { openRuntimeAudit } = await module('audit-store.mjs');
  const { writeOperatorStore, hashOperatorPassword } = await module('operator-store.mjs'), { openRecipeStore } = await module('recipe-store.mjs'), { parseRecipeFile } = await module('recipe-exchange.mjs');
  panel = await createServer({ root: generated, configLoader: 'runner', cacheDir: path.join(generated, '.qa/node_modules/.vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: { ignored: () => true }, warmup: { clientFiles: [] } }, logLevel: 'error' }); await panel.listen(); const origin = 'http://127.0.0.1:' + panel.httpServer.address().port;
  const security = path.join(generated, '.framecraft-runtime/security'); await mkdir(security, { recursive: true }); const accountFile = path.join(security, 'operators.json');
  await writeOperatorStore(accountFile, { version: 1, id: randomUUID(), accounts: [{ id: randomUUID(), username: 'operator', name: 'Operatore QA', role: 'Operatore', disabled: false, capabilities: ['recipes.read', 'recipes.import'], permissions: [], password: await hashOperatorPassword(password) }] }, undefined);
  audit = openRuntimeAudit({ root: generated, namespace: config.namespace });
  const store = await openRecipeStore({ directory: path.join(generated, '.framecraft-runtime/recipes'), catalog });
  const auth = createLocalOperatorAuth({ file: accountFile, config: { ...config, enabled: true, allowHttpLoopback: true }, allowedOrigins: [origin], audit });
  gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: 'SYNTHETIC_RECIPE_QA', allowedOrigins: [origin], allowWrites: false }, connections: [] }, [], { resolveSecret: () => token, operatorAuth: auth, audit, recipeStore: store }); await gateway.start();
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true }); const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage();
  let reads = 0, imports = 0, otherCommands = 0, external = 0; const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); if (url.origin !== origin) { external++; return route.abort(); }
    if (!url.pathname.startsWith('/_framecraft/plc/v1/')) return route.continue();
    if (url.pathname.endsWith('/recipes')) { if (request.method() === 'GET') reads++; else imports++; }
    else if (request.method() !== 'GET' && !url.pathname.includes('/session/')) otherCommands++;
    const response = await route.fetch({ url: gateway.address + url.pathname + url.search, headers: { ...request.headers(), authorization: 'Bearer ' + token, origin, host: new URL(gateway.address).host } }); return route.fulfill({ response });
  });
  await page.goto(origin + '/recipe-qa.html'); await page.getByRole('region', { name: 'Archivio ricette', exact: true }).waitFor({ timeout: 60000 }); assert.equal(reads, 0);
  await page.getByRole('button', { name: 'Account operatore', exact: true }).click(); await page.getByLabel('Nome utente', { exact: true }).fill('operator'); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Accedi al pannello', exact: true }).click(); await page.getByRole('button', { name: 'Esci / cambia utente', exact: true }).waitFor(); await page.getByRole('button', { name: 'Chiudi accesso', exact: true }).click();
  await page.getByRole('button', { name: 'Rileggi archivio', exact: true }).click(); await page.getByRole('heading', { name: 'Scambio ricette con file', exact: true }).waitFor(); assert.equal(reads, 1);
  const downloadEvent = page.waitForEvent('download', { timeout: 10000 }); await page.getByRole('button', { name: 'Esporta schema JSON', exact: true }).click();
  const download = await downloadEvent.catch(async reason => { await page.screenshot({ path: path.join(generated, 'download-failure.png'), fullPage: true }); throw new Error(reason.message + '\nControl: ' + await page.locator('main').innerText() + '\nErrors: ' + JSON.stringify(errors)); });
  const downloads = await mkdtemp(path.join(base, 'recipe-exchange-downloads-'));
  const downloaded = path.join(downloads, 'download.framecraft.json'); await download.saveAs(downloaded);
  const file = parseRecipeFile(await readFile(downloaded, 'utf8')); assert.equal(file.schema.records.length, 2); assert.equal(imports, 0); assert.equal(reads, 1);
  file.schema.records = [{ id: 'a', name: 'Formato A', values: { speed: 0, enabled: false, note: '' } }, { id: 'new', name: 'Formato nuovo', values: { speed: 30, enabled: true, note: '<img src=x onerror=alert(1)>\t\n=SUM(1)' } }];
  await page.getByLabel('File ricette Framecraft', { exact: true }).setInputFiles({ name: 'ricette.framecraft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByRole('heading', { name: 'Confronto prima dell’importazione', exact: true }).waitFor(); assert.equal(imports, 0);
  await page.getByText('Sostituisce: Formato A · ID a', { exact: true }).click(); await page.getByText('Nuova: Formato nuovo · ID new', { exact: true }).click(); assert.equal(await page.locator('main img').count(), 0);
  const shots = path.join(base, 'recipe-exchange-shots'); await mkdir(shots, { recursive: true });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator('[data-hmi-recipe-root]').evaluate(host => ({ overflow: host.scrollWidth > host.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1, controls: [...host.querySelectorAll('button,input,select,summary,a[download]')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height) }));
    assert.equal(layout.overflow, false); assert.ok(layout.controls.every(height => height >= 47.9)); await page.screenshot({ path: path.join(shots, `recipes-${width}.png`), fullPage: true });
  }
  const confirm = page.getByRole('button', { name: 'Conferma importazione nell’archivio', exact: true }); await confirm.focus(); await page.keyboard.press('Enter'); await page.getByText('Importazione salvata in un’unica operazione nell’archivio. Nessuna ricetta eliminata e nessun trasferimento al PLC.', { exact: true }).waitFor();
  const saved = await store.snapshot(); assert.equal(saved.sequence, 1); assert.equal(saved.schemas[0].records.length, 3); assert.deepEqual(saved.schemas[0].records.find(item => item.id === 'a').values, { speed: 0, enabled: false, note: '' }); assert.ok(saved.schemas[0].records.find(item => item.id === 'keep'));
  const { parseRecipeTable, mapRecipeTable, suggestRecipeTableMapping } = await module('recipe-table.mjs');
  const tsvEvent = page.waitForEvent('download', { timeout: 10000 }); await page.getByRole('button', { name: 'Esporta schema TSV', exact: true }).click();
  const tsvDownload = await tsvEvent, tsvFile = path.join(downloads, 'download.framecraft.tsv'); await tsvDownload.saveAs(tsvFile);
  const table = parseRecipeTable(await readFile(tsvFile, 'utf8')); assert.deepEqual(mapRecipeTable(saved.schemas[0], table, suggestRecipeTableMapping(saved.schemas[0], table)), saved.schemas[0].records); assert.equal(imports, 1);
  const note = '=SUM(1)' + 'x'.repeat(170), tabular = 'Codice\tTitolo\tVelocita\tAttivo\tNota\tExtra\r\na\tFormato A\t11\tfalse\t' + note + '\tSYNTHETIC_IGNORED\r\n';
  await page.getByLabel('File ricette Framecraft', { exact: true }).setInputFiles({ name: 'tabella.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(tabular) });
  await page.getByRole('heading', { name: '1. Abbina le colonne', exact: true }).waitFor(); assert.equal(imports, 1);
  assert.equal(await page.locator('[aria-label="Abbinamento colonne ricette"]').evaluate(node => node === document.activeElement), true);
  for (const [label, column] of [['ID ricetta', '0'], ['Nome ricetta', '1'], ['Velocità · integer · pz/min', '2'], ['Abilitato · boolean', '3'], ['Nota · string', '4']]) await page.getByLabel('Colonna per ' + label, { exact: true }).selectOption(column);
  await page.getByRole('button', { name: 'Genera confronto', exact: true }).click(); await page.getByText(/Abbinamento colonne incompleto o ambiguo/).waitFor(); assert.equal(imports, 1);
  assert.equal(await page.locator('[data-recipe-file-status]').evaluate(node => node === document.activeElement), true);
  await page.getByLabel('Ignora le colonne che non ho abbinato.', { exact: false }).check();
  assert.equal(await page.locator('[data-recipe-file-status]').getAttribute('role'), 'status');
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const mapping = page.getByRole('region', { name: 'Abbinamento colonne ricette', exact: true }); await mapping.scrollIntoViewIfNeeded();
    const layout = await mapping.evaluate(host => ({ overflow: host.scrollWidth > host.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1, controls: [...host.querySelectorAll('button,select,label.recipe-apply-ack')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height), selects: [...host.querySelectorAll('select')].map(node => node.getBoundingClientRect().height) }));
    assert.equal(layout.overflow, false); assert.ok(layout.controls.every(height => height >= 47.9)); assert.ok(layout.selects.every(height => height <= 49)); await page.screenshot({ path: path.join(shots, `tsv-mapping-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Genera confronto', exact: true }).click(); assert.equal(await page.locator('[aria-label="Confronto importazione ricette"]').evaluate(node => node === document.activeElement), true); assert.equal(imports, 1);
  await page.getByText('Sostituisce: Formato A · ID a', { exact: true }).click(); await page.locator('[aria-label="Confronto importazione ricette"] dd').filter({ hasText: /^0 → 11$/ }).waitFor();
  await page.getByRole('button', { name: 'Rivedi colonne', exact: true }).click(); assert.equal(await page.getByLabel('Colonna per ID ricetta', { exact: true }).inputValue(), '0');
  await page.getByRole('button', { name: 'Genera confronto', exact: true }).click();
  await page.getByRole('button', { name: 'Conferma importazione nell’archivio', exact: true }).click(); await page.getByText('Importazione salvata in un’unica operazione nell’archivio. Nessuna ricetta eliminata e nessun trasferimento al PLC.', { exact: true }).waitFor();
  const afterTsv = await store.snapshot(); assert.equal(afterTsv.sequence, 2); assert.equal(afterTsv.schemas[0].records.length, 3); assert.deepEqual(afterTsv.schemas[0].records.find(item => item.id === 'a').values, { speed: 11, enabled: false, note });
  assert.deepEqual(audit.read({ operation: 'recipes.import' }).events.map(event => event.outcome), ['applied', 'requested', 'applied', 'requested']); assert.equal(imports, 2); assert.equal(otherCommands, 0); assert.equal(external, 0); assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Account operatore', exact: true }).click(); await page.getByRole('button', { name: 'Esci / cambia utente', exact: true }).click(); await page.getByRole('button', { name: 'Accedi al pannello', exact: true }).waitFor(); await page.getByRole('button', { name: 'Chiudi accesso', exact: true }).click(); assert.equal(await page.locator('[data-recipe-exchange]').count(), 0);
  await build({ root: generated, configLoader: 'runner', logLevel: 'error', build: { rollupOptions: { input: path.join(generated, 'recipe-qa.html') } } });
  console.log(JSON.stringify({ passed: true, generated, shots, reads, imports, otherCommands, external, realLocalAccounts: true, realSqliteAudit: true, realArchive: true, plcConnections: 0, runtimeTypecheck: true, qaEntryProductionBuild: true, nativeScaffolding: false }));
} finally { await browser?.close(); await panel?.close(); await gateway?.stop(); audit?.close(); await editor?.close(); }
