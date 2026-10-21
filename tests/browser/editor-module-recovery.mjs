import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configLoader: 'runner', cacheDir: resolve('.hmi-preview/editor-import-qa/node_modules/.vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null, warmup: { clientFiles: [] } }, logLevel: 'warn' });
let browser;
try {
  await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let blockShell = false, requests = 0, external = 0, navigations = 0;
  const errors = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { external++; return route.abort(); }
    if (url.pathname === '/src/editor/AppShell.tsx') {
      requests++;
      if (blockShell) return route.abort('connectionfailed');
    }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto(origin);
  await page.locator('.welcome-shell').waitFor({ timeout: 45000 });
  blockShell = true;
  await page.evaluate(async () => {
    const { useEditorStore: store } = await import('/src/state/editorStore.ts');
    const { useEditorGuidance } = await import('/src/state/editorGuidance.ts');
    useEditorGuidance.setState({ enabled: false, seen: true });
    window.fcRecovery = store;
    const source = 'export function Panel(){return <button>Draft content</button>}';
    store.setState({ project: { root: 'C:/synthetic-recovery', name: 'Recovery fixture', framework: 'vite', language: 'typescript', packageManager: 'npm', files: [], entryFiles: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
      document: { file: 'C:/synthetic-recovery/Panel.tsx', source, version: 4, nodes: {}, roots: [] }, dirty: true,
      history: [{ file: 'C:/synthetic-recovery/Panel.tsx', source: 'previous' }], loading: false, reloadRecovery: undefined, pages: [],
      previewUrl: undefined, previewSessionId: 'preserved-session', previewStatus: 'idle', selectedId: undefined, viewMode: 'visual' });
  });
  const retry = page.getByRole('button', { name: 'Riprova caricamento', exact: true });
  await retry.waitFor();
  assert.equal(requests, 1);
  await retry.click();
  await retry.waitFor();
  for (let attempt = 0; requests < 2 && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 25));
  if (requests !== 2) console.log(JSON.stringify({ requests, errors, recoveryText: await page.locator('.editor-recovery').innerText() }));
  assert.equal(requests, 2);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await retry.evaluate(button => ({ height: button.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.ok(layout.height >= 44); assert.equal(layout.overflow, false);
  }
  await page.getByRole('button', { name: 'Torna ai progetti', exact: true }).focus();
  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('Enter');
  await retry.waitFor(); assert.equal(requests, 2);
  blockShell = false;
  await retry.focus(); await page.keyboard.press('Enter');
  await page.locator('.app-shell .topbar').waitFor({ timeout: 90000 });
  assert.equal(requests, 3);
  const state = await page.evaluate(() => { const state = fcRecovery.getState(); return { root: state.project.root, draft: state.document.source, dirty: state.dirty, undo: state.history.length, session: state.previewSessionId }; });
  assert.deepEqual(state, { root: 'C:/synthetic-recovery', draft: 'export function Panel(){return <button>Draft content</button>}', dirty: true, undo: 1, session: 'preserved-session' });
  assert.equal(navigations, 1); assert.equal(external, 0);
  assert.ok(errors.every(error => /Failed to fetch dynamically imported module/.test(error)), errors.join('\n'));
  console.log(JSON.stringify({ passed: true, requests, expectedErrors: errors.length, state, navigations, external, viewports: [375, 768, 1024, 1440], cache: server.config.cacheDir }));
} finally { await browser?.close(); await server.close(); }
