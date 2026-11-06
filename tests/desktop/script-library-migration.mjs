/** Windows/WebView2 integration of the real desktop bridge, isolated sources and profile.
 * Uses the application's normal IPC handlers. No service, PLC driver or mock bridge is started.
 * https://playwright.dev/docs/webview2
 */
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, build, preview } from 'vite';
import react from '@vitejs/plugin-react';
const {
  chromium
} = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
assert.equal(process.platform, 'win32', 'This test requires the Windows desktop build and WebView2.');
const root = path.resolve(process.env.FRAMECRAFT_DESKTOP_SOURCE || fileURLToPath(new URL('../../', import.meta.url)));
const target = path.resolve(process.env.FRAMECRAFT_CARGO_TARGET || path.join(root, '.hmi-preview/script-desktop-target'));
const cargo = process.env.FRAMECRAFT_CARGO || path.join(process.env.USERPROFILE, '.cargo/bin/cargo.exe');
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port;
    socket.close(() => resolve(port));
  });
});
let editor, server, browser, app, generated;
let external = 0;
const hashes = value => createHash('sha256').update(value).digest('hex');
async function buildDesktop(origin) {
  const existing = execFileSync('powershell.exe', ['-NoProfile', '-Command', "@(Get-Process framecraft -ErrorAction SilentlyContinue).Count"], {
    encoding: 'utf8',
    windowsHide: true
  }).trim();
  assert.equal(existing, '0', 'Close the desktop app before a QA build uses its build cache.');
  const executable = path.join(target, 'debug/framecraft.exe'),
    backup = path.join(generated, 'original-framecraft.exe'),
    output = path.join(generated, 'framecraft-qa.exe');
  let original;
  try {
    original = await readFile(executable);
    await copyFile(executable, backup);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!original && !target.startsWith(path.join(root, '.hmi-preview') + path.sep)) throw Error('A shared build cache requires an existing desktop executable to preserve. Use the default isolated target instead.');
  const config = {
    identifier: 'com.framecraft.migration.qa',
    productName: 'Framecraft migration QA',
    build: {
      devUrl: origin
    },
    bundle: {
      resources: null
    },
    app: {
      windows: [{
        label: 'main',
        title: 'Framecraft migration QA',
        width: 1365,
        height: 960,
        visible: false,
        backgroundColor: '#202020'
      }]
    }
  };
  const log = createWriteStream(path.join(generated, 'cargo.log'));
  try {
    console.log(JSON.stringify({
      phase: 'build-native',
      generated
    }));
    await new Promise((resolve, reject) => {
      const child = spawn(cargo, ['build', '--offline', '--locked', '--manifest-path', path.join(root, 'src-tauri/Cargo.toml'), '--target-dir', target, '--bin', 'framecraft'], {
        cwd: path.join(root, 'src-tauri'),
        windowsHide: true,
        env: {
          ...process.env,
          TAURI_CONFIG: JSON.stringify(config)
        }
      });
      child.stdout.pipe(log, {
        end: false
      });
      child.stderr.pipe(log, {
        end: false
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(Error('Desktop QA compilation failed: ' + code + '; see ' + path.join(generated, 'cargo.log'))));
    });
    await copyFile(executable, output);
  } finally {
    log.end();
    if (original) {
      await copyFile(backup, executable);
      assert.equal(hashes(await readFile(executable)), hashes(original), 'Original desktop executable must be preserved.');
    }
  }
  return output;
}
try {
  const base = path.join(root, '.hmi-preview');
  await mkdir(base, {
    recursive: true
  });
  generated = await mkdtemp(path.join(base, 'script-desktop-'));
  const panel = path.join(generated, 'Pannello È (test) #1');
  await mkdir(path.join(panel, 'src'), {
    recursive: true
  });
  await mkdir(path.join(panel, 'runtime'));
  await symlink(path.join(root, 'node_modules'), path.join(generated, 'node_modules'), 'junction');
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
  const libraries = await editor.ssrLoadModule('/src/core/scriptLibrary.ts'),
    modules = await editor.ssrLoadModule('/src/core/hmiScriptModules.ts'),
    scripts = await editor.ssrLoadModule('/src/core/hmiScript.ts');
  const metadata = {
    id: 'qa.desktop',
    name: 'Desktop QA library',
    license: 'MIT',
    notice: 'Synthetic sources only.'
  };
  const source = (name, parameters, tag) => modules.parseHmiScriptCatalog({
    globalModules: [{
      alias: 'M',
      name: 'M',
      functions: [{
        name,
        parameters,
        source: 'return Tags(' + JSON.stringify(tag) + ').Read()+value' + (parameters.length > 1 ? '*scale' : '') + ';'
      }]
    }]
  });
  const first = await libraries.releaseScriptLibrary(undefined, metadata, source('Old', ['value'], 'PreviousInput'), ['M'], '1.0.0', 'First');
  const second = await libraries.releaseScriptLibrary(first, metadata, source('New', ['value', 'scale'], 'CurrentInput'), ['M'], '2.0.0', 'Changed interface');
  const third = await libraries.releaseScriptLibrary(second, metadata, source('New', ['value', 'scale'], 'LatestInput'), ['M'], '3.0.0', 'Compatible update');
  const imported = await libraries.applyScriptLibraryPlan(modules.parseHmiScriptCatalog({}), await libraries.planScriptLibraryImport(modules.parseHmiScriptCatalog({}), first, '1.0.0', 'type', {
    M: 'M'
  }), {
    code: true,
    customized: true,
    downgrade: true
  });
  const catalog = modules.parseHmiScriptCatalog({
    ...imported,
    scheduledTasks: [{
      id: 'manual',
      name: 'Synthetic task',
      enabled: false,
      trigger: {
        kind: 'interval',
        intervalMs: 1000
      },
      script: 'return Modules.M.Old(3);'
    }]
  });
  const event = [{
      event: 'Tapped',
      script: 'return Modules.M.Old(4);',
      program: scripts.inspectHmiScript('return Modules.M.Old(4);').program
    }],
    dynamic = [{
      kind: 'Script',
      property: 'Text',
      source: 'return Modules.M.Old(2);',
      program: scripts.inspectHmiScript('return Modules.M.Old(2);').program,
      scriptTags: {
        read: ['PreviousInput'],
        written: []
      }
    }];
  const original = {
    'framecraft.scripts.json': JSON.stringify(catalog, null, 2),
    'src/Page.tsx': 'export default function Page(){return <button data-hmi-events={' + JSON.stringify(JSON.stringify(event)) + '} data-hmi-dynamizations={' + JSON.stringify(JSON.stringify(dynamic)) + '}>Test</button>}'
  };
  for (const [file, text] of Object.entries(original)) await writeFile(path.join(panel, file), text);
  await writeFile(path.join(panel, 'package.json'), JSON.stringify({
    name: 'framecraft-desktop-qa',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite'
    },
    dependencies: {
      react: '19.1.1'
    }
  }));
  await writeFile(path.join(panel, 'framecraft.connections.json'), JSON.stringify({
    version: 1,
    gateway: {
      enabled: true,
      host: '127.0.0.1',
      port: await freePort()
    },
    connections: []
  }));
  for (const file of ['script-migration-guard.mjs', 'gateway-service.mjs', 'mqtt-service.mjs']) await copyFile(path.join(root, 'runtime', file), path.join(panel, 'runtime', file));
  await writeFile(path.join(generated, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Desktop IPC QA</title><link rel="icon" href="data:,"></head><body style="background:#202020;color:#ddd;font:12px system-ui"><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
  await writeFile(path.join(generated, 'fixture.tsx'), `import{StrictMode,useState}from'react';import{createRoot}from'react-dom/client';import{ScriptModulesPanel}from'@framecraft/editor/ScriptModulesPanel';import{ScriptMigrationRecoveryDialog}from'@framecraft/editor/ScriptMigrationRecoveryDialog';import{desktopAvailable,desktopBridge}from'@framecraft/filesystem/desktopBridge';import{useEditorStore}from'@framecraft/state/editorStore';import{parseHmiScriptCatalog}from'@framecraft/core/hmiScriptModules';async function init(){if(!desktopAvailable)throw Error('Real desktop IPC required');const project=await desktopBridge.analyzeProject(${JSON.stringify(panel)});const catalog=parseHmiScriptCatalog(JSON.parse(await desktopBridge.readFile(project.root+'/framecraft.scripts.json')));useEditorStore.setState({project,pages:[{id:'page',name:'Page',file:project.root+'/src/Page.tsx',route:'/page'}],scriptCatalog:catalog,document:undefined,dirty:false,loading:false,exporting:false,previewRestarting:false,reloadRecovery:undefined,highlightPicker:undefined,interactionMode:'edit'});window.qa={desktopAvailable,bridge:desktopBridge,store:useEditorStore,project};function Fixture(){const[recover,setRecover]=useState(false);return <><button id="recover" onClick={()=>setRecover(true)}>Recupera migrazioni script</button><ScriptModulesPanel/>{recover&&<ScriptMigrationRecoveryDialog onClose={()=>setRecover(false)}/>}</>;}createRoot(document.getElementById('root')).render(<StrictMode><Fixture/></StrictMode>);}init().catch(error=>{document.body.textContent='QA init failed: '+String(error);});`);
  const vite = {
    root: generated,
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: {
        '@framecraft': path.join(root, 'src')
      }
    },
    build: {
      minify: false
    },
    logLevel: 'error'
  };
  await build(vite);
  server = await preview({
    ...vite,
    preview: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false
    }
  });
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  const executable = await buildDesktop(origin),
    cdp = await freePort();
  const appLog = createWriteStream(path.join(generated, 'desktop.log'));
  app = spawn(executable, [], {
    cwd: generated,
    windowsHide: true,
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: path.join(generated, 'webview-profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + cdp + ' --remote-debugging-address=127.0.0.1'
    }
  });
  app.stdout.pipe(appLog, {
    end: false
  });
  app.stderr.pipe(appLog, {
    end: false
  });
  app.once('exit', () => appLog.end());
  const deadline = Date.now() + 60000;
  while (true) {
    if (app.exitCode !== null) throw Error('Desktop closed before CDP: ' + app.exitCode);
    try {
      const response = await fetch('http://127.0.0.1:' + cdp + '/json/version');
      if (response.ok) break;
    } catch {}
    if (Date.now() > deadline) throw Error('WebView2 debug endpoint did not start within 60 seconds.');
    await delay(250);
  }
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + cdp);
  const context = browser.contexts()[0];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\/ipc\.localhost\//.test(url) || url.startsWith('ipc://localhost/')) return route.continue();
    external++;
    return route.abort();
  });
  const page = context.pages()[0] || (await context.waitForEvent('page'));
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.qa?.desktopAvailable === true);
  await page.getByRole('button', {
    name: 'Librerie · importa, esporta e aggiorna'
  }).waitFor();
  console.log(JSON.stringify({
    phase: 'real-desktop-ready',
    panel
  }));
  const library = async pkg => {
    await page.getByRole('button', {
      name: 'Librerie · importa, esporta e aggiorna'
    }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'qa.framecraft-script-library.json',
      mimeType: 'application/json',
      buffer: Buffer.from(libraries.serializeScriptLibrary(pkg))
    });
    await page.getByRole('status').filter({
      hasText: 'Libreria controllata'
    }).waitFor();
    await page.getByRole('button', {
      name: 'Confronta con la bozza'
    }).click();
    await page.getByRole('checkbox', {
      name: /Ho confrontato codice/
    }).check();
    await page.getByRole('button', {
      name: 'Continua con il progetto'
    }).click();
    await page.getByRole('dialog', {
      name: 'Aggiorna libreria nel progetto'
    }).waitFor();
  };
  await library(second);
  await page.getByLabel('Nuovo riferimento M.Old').selectOption(JSON.stringify(['M', 'New']));
  await page.getByLabel('Valore M.Old.scale').selectOption('fixed:number');
  await page.getByLabel('Valore fisso scale').fill('2');
  const compare = () => page.getByRole('button', {
      name: 'Confronta file del progetto'
    }).click(),
    confirm = async () => {
      await page.getByRole('checkbox', {
        name: /Ho controllato tutti/
      }).check();
      await page.getByRole('checkbox', {
        name: /Ho arrestato il servizio PLC/
      }).check();
    };
  await compare();
  await page.getByRole('region', {
    name: 'File proposti'
  }).waitFor();
  await confirm();
  await writeFile(path.join(panel, 'src/Inventory.ts'), 'export const unchanged=1;');
  await page.getByRole('button', {
    name: 'Applica aggiornamento con backup'
  }).click();
  await page.getByRole('alert').filter({
    hasText: 'sorgenti, import o servizio sono cambiati'
  }).waitFor();
  for (const [file, text] of Object.entries(original)) assert.equal(await readFile(path.join(panel, file), 'utf8'), text, 'Stale inventory must not write ' + file);
  await page.getByRole('button', {
    name: 'Rileggi progetto'
  }).click();
  await compare();
  await page.getByRole('region', {
    name: 'File proposti'
  }).waitFor();
  await confirm();
  await page.getByRole('button', {
    name: 'Applica aggiornamento con backup'
  }).click();
  await page.getByRole('status').filter({
    hasText: 'Libreria e file aggiornati'
  }).waitFor();
  assert.equal(JSON.parse(await readFile(path.join(panel, 'framecraft.scripts.json'), 'utf8')).globalModules[0].library.version, '2.0.0');
  assert.ok((await readFile(path.join(panel, 'src/Page.tsx'), 'utf8')).includes('CurrentInput'));
  parse(await readFile(path.join(panel, 'src/Page.tsx'), 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  const snapshot = await page.evaluate(() => window.qa.bridge.readScriptMigration(window.qa.project.root));
  assert.equal(snapshot.backups.length, 1);
  assert.equal(snapshot.backups[0].state, 'completed');
  const backup = snapshot.backups[0].id;
  await page.getByRole('button', {
    name: 'Chiudi aggiornamento libreria'
  }).click();
  await library(third);
  await compare();
  await page.getByRole('region', {
    name: 'File proposti'
  }).waitFor();
  assert.equal(await page.getByRole('alert').filter({
    hasText: 'precedente deve essere recuperata'
  }).count(), 0);
  await page.getByLabel('File da confrontare').selectOption('src/Page.tsx');
  assert.ok((await page.getByLabel('File dopo la migrazione').inputValue()).includes('LatestInput'));
  await page.screenshot({
    path: path.join(generated, 'desktop-second-migration.png')
  });
  await page.getByRole('button', {
    name: 'Chiudi aggiornamento libreria'
  }).click();
  await page.locator('#recover').click();
  await page.getByRole('radio', {
    name: 'Backup ' + backup
  }).waitFor();
  await page.getByRole('checkbox', {
    name: /Ho arrestato il servizio PLC/
  }).check();
  await page.getByRole('button', {
    name: 'Ripristina backup scelto'
  }).click();
  await page.getByRole('status').filter({
    hasText: 'File ripristinati dal backup'
  }).waitFor();
  for (const [file, text] of Object.entries(original)) assert.equal(await readFile(path.join(panel, file), 'utf8'), text, 'Recovery must restore exact source bytes: ' + file);
  assert.equal(await readFile(path.join(panel, 'src/Inventory.ts'), 'utf8'), 'export const unchanged=1;');
  await page.waitForFunction(() => window.qa.store.getState().scriptCatalog.globalModules[0].library.version === '1.0.0');
  await page.getByRole('button', {name:'Chiudi recupero migrazioni'}).waitFor();
  assert.equal(await page.evaluate(() => window.qa.store.getState().scriptCatalog.globalModules[0].library.version), '1.0.0');
  const after = await page.evaluate(() => window.qa.bridge.readScriptMigration(window.qa.project.root, true));
  assert.equal(after.backups[0].state, 'restored');
  assert.equal(after.token, null);
  await page.screenshot({
    path: path.join(generated, 'desktop-restored.png')
  });
  assert.deepEqual(errors, []);
  assert.equal(external, 0);
  console.log(JSON.stringify({
    passed: true,
    generated,
    realWindowsWebView2: true,
    realIpc: true,
    realFilesystemTransaction: true,
    staleInventoryBlocked: true,
    secondUpdateAfterCompletedBackup: true,
    compatibleTagDependencies: true,
    recoveryExactBytes: true,
    catalogRefreshed: true,
    isolatedProfile: true,
    hiddenWindow: true,
    external,
    plcWrites: 0
  }));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    console.error((await page.locator('body').innerText()).slice(-9000));
    await page.screenshot({
      path: path.join(generated, 'failure.png')
    }).catch(() => {});
  }
  throw error;
} finally {
  if (app && app.exitCode === null) {
    app.kill();
    await Promise.race([new Promise(resolve => app.once('exit', resolve)), delay(10000)]);
  }
  await browser?.close().catch(() => {});
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await editor?.close();
}
