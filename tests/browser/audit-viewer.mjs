import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, build } from 'vite';
import { execFileSync } from 'node:child_process';
import { createPlcGateway } from '../../runtime/gateway.mjs';
import { createLocalOperatorAuth } from '../../runtime/operator-auth.mjs';
import { openRuntimeAudit } from '../../runtime/audit-store.mjs';
import { writeOperatorStore, hashOperatorPassword } from '../../runtime/operator-store.mjs';
import { randomUUID } from 'node:crypto';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), base = path.join(root, '.hmi-preview');
const token = 'synthetic_audit_browser_token_01234567890123456789', password = 'SYNTHETIC-audit-browser-password-012345';
let editor, panel, gateway, audit, browser;
try {
  await mkdir(base, { recursive: true });
  const generated = await mkdtemp(path.join(base, 'audit-browser-')); assert.equal(path.dirname(generated), base);
  editor = await createServer({ root, configLoader: 'runner', cacheDir: path.join(base, 'audit-qa-editor/node_modules/.vite'), server: { watch: null, warmup: { clientFiles: [] } }, logLevel: 'error' });
  const { standardProjectFiles } = await editor.ssrLoadModule('/src/core/standardProject.ts');
  const files = standardProjectFiles({ machineName: 'Registro QA sintetico', layout: 'desktop', sections: ['main'] });
  for (const file of files) { const target = path.resolve(generated, file.path); assert.ok(target.startsWith(generated + path.sep)); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
  await symlink(path.join(root, 'node_modules'), path.join(generated, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await copyFile(new URL('../fixtures/audit-panel.html', import.meta.url), path.join(generated, 'audit-qa.html'));
  await copyFile(new URL('../fixtures/audit-runtime-tsconfig.json', import.meta.url), path.join(generated, 'tsconfig.audit-qa.json'));
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.audit-qa.json'], { cwd: generated, encoding: 'utf8', windowsHide: true });
  const config = JSON.parse(files.find(file => file.path === 'framecraft.auth.json').content);
  await writeFile(path.join(generated, 'framecraft.auth.json'), JSON.stringify({ ...config, enabled: true, allowHttpLoopback: true }));
  await writeFile(path.join(generated, 'framecraft.runtime.json'), JSON.stringify({ version: 1, gateway: { enabled: true, path: '/_framecraft/plc/v1', pollMs: 1000, timeoutMs: 5000 } }));
  panel = await createServer({ root: generated, configLoader: 'runner', cacheDir: path.join(generated, '.qa/node_modules/.vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null, warmup: { clientFiles: [] } }, logLevel: 'error' });
  await panel.listen(); const origin = 'http://127.0.0.1:' + panel.httpServer.address().port;
  const security = path.join(generated, '.framecraft-runtime/security'); await mkdir(security, { recursive: true });
  const accountFile = path.join(security, 'operators.json');
  await writeOperatorStore(accountFile, { version: 1, id: randomUUID(), accounts: [{ id: randomUUID(), username: 'auditor', name: 'Audit sintetico QA', role: 'Audit', disabled: false, capabilities: ['audit.read'], permissions: [], password: await hashOperatorPassword(password) }] }, undefined);
  audit = openRuntimeAudit({ root: generated, namespace: config.namespace });
  const auth = createLocalOperatorAuth({ file: accountFile, config: { ...config, enabled: true, allowHttpLoopback: true }, allowedOrigins: [origin], audit });
  gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: 'SYNTHETIC_AUDIT_QA', allowedOrigins: [origin] }, connections: [] }, [], { resolveSecret: () => token, operatorAuth: auth, audit });
  await gateway.start(); browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  let reads = 0, external = 0, commands = 0; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external++; return route.abort(); }
    if (!url.pathname.startsWith('/_framecraft/plc/v1/')) return route.continue();
    if (url.pathname.endsWith('/audit')) reads++;
    if (request.method() !== 'GET' && !url.pathname.includes('/session/')) commands++;
    const response = await route.fetch({ url: gateway.address + url.pathname + url.search, headers: { ...request.headers(), authorization: 'Bearer ' + token, origin, host: new URL(gateway.address).host } });
    return route.fulfill({ response });
  });
  await page.goto(origin + '/audit-qa.html'); await page.getByRole('heading', { name: 'Registro attività', exact: true }).waitFor({ timeout: 60000 });
  assert.equal(reads, 0); assert.equal(await page.getByRole('button', { name: 'Carica registro', exact: true }).isEnabled(), false);
  await page.getByRole('button', { name: 'Apri accesso operatore', exact: true }).click();
  await page.getByLabel('Nome utente', { exact: true }).fill('auditor'); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accedi al pannello', exact: true }).click(); await page.getByRole('button', { name: 'Esci / cambia utente', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Chiudi accesso', exact: true }).click();
  assert.equal(reads, 0); const read = page.getByRole('button', { name: 'Carica registro', exact: true }); await read.focus(); await page.keyboard.press('Enter');
  await page.getByRole('list', { name: 'Eventi del registro', exact: true }).waitFor(); assert.equal(reads, 1);
  assert.match(await page.locator('[data-hmi-audit-root]').innerText(), /Accesso riuscito/);
  const shots = path.join(base, 'audit-viewer-shots'); await mkdir(shots, { recursive: true });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator('[data-hmi-audit-root]').evaluate(host => ({ overflow: host.scrollWidth > host.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1, controls: [...host.querySelectorAll('button,input,select,summary')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height) }));
    assert.equal(layout.overflow, false); assert.ok(layout.controls.every(height => height >= 47.9)); await page.screenshot({ path: path.join(shots, `audit-${width}.png`) });
  }
  await page.getByText('Filtri del registro (facoltativi)', { exact: true }).click();
  await page.getByLabel('Operazione', { exact: true }).selectOption('tags.write'); assert.equal(reads, 1);
  await page.getByRole('button', { name: 'Aggiorna dalla prima pagina', exact: true }).click(); await page.getByText('Nessun evento per questi filtri.', { exact: true }).waitFor(); assert.equal(reads, 2);
  await page.getByRole('button', { name: 'Account operatore', exact: true }).click(); await page.getByRole('button', { name: 'Esci / cambia utente', exact: true }).click();
  await page.getByRole('button', { name: 'Accedi al pannello', exact: true }).waitFor(); await page.getByRole('button', { name: 'Chiudi accesso', exact: true }).click();
  assert.equal(await page.getByRole('list', { name: 'Eventi del registro', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Carica registro', exact: true }).isEnabled(), false);
  assert.deepEqual(errors, []); assert.equal(external, 0); assert.equal(commands, 0);
  assert.deepEqual(audit.read().events.filter(event => event.outcome !== 'requested').map(event => event.operation), ['session.logout', 'session.login']);
  await build({ root: generated, configLoader: 'runner', logLevel: 'error', build: { rollupOptions: { input: path.join(generated, 'audit-qa.html') } } });
  console.log(JSON.stringify({ passed: true, generated, shots, reads, commands, external, viewports: [375, 768, 1024, 1440], realLocalAccounts: true, realSqlite: true, plcConnections: 0, runtimeTypecheck: true, qaEntryProductionBuild: true, nativeScaffolding: false }));
} finally { await browser?.close(); await panel?.close(); await gateway?.stop(); audit?.close(); await editor?.close(); }
