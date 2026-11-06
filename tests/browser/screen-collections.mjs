import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, build, preview } from 'vite';
const {
  chromium
} = await import(process.env.FRAMECRAFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
let editor, server, browser;
try {
  const base = path.join(root, '.hmi-preview');
  await mkdir(base, {
    recursive: true
  });
  const generated = await mkdtemp(path.join(base, 'screen-collections-browser-'));
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
  for (const file of standard.standardProjectFiles({
    machineName: 'Collections QA synthetic',
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
  const visual = (id, type, text, left = 0) => ({
    id,
    type,
    text,
    left,
    top: 0,
    width: 100,
    height: 32,
    bindings: []
  });
  const type = (id, nested = false) => ({
    id,
    name: id,
    version: '1.0.0',
    status: 'released',
    width: 250,
    height: 110,
    interfaceTags: [],
    interfaceProperties: [{
      name: 'Label',
      dataType: 'ConfigurationString',
      defaultValue: 'Default'
    }],
    interfaceEvents: [],
    localTags: [],
    visualization: [{
      ...visual('Title', 'text', '', 0),
      bindings: [{
        property: 'Text',
        source: 'property',
        name: 'Label'
      }]
    }, visual('Read', 'button', 'Read', 110)],
    nestedInstances: nested ? [{
      id: 'Nested',
      typeId: 'inner',
      version: '1.0.0',
      tagBindings: {},
      propertyBindings: {
        Label: 'Label'
      },
      left: 0,
      top: 45,
      width: 240,
      height: 50
    }] : []
  });
  await writeFile(path.join(generated, 'framecraft.faceplates.json'), JSON.stringify({
    version: 1,
    types: [type('outer', true), type('inner')]
  }));
  const binding = label => JSON.stringify({
    typeId: 'outer',
    version: '1.0.0',
    tagBindings: {},
    propertyValues: {
      Label: label
    },
    eventBindings: {}
  }).replaceAll('"', '&quot;');
  const source = 'const items=Screen.Items;HMIRuntime.Trace("COUNT="+items.Count);HMIRuntime.Trace("NAMES="+Object.values(items).map(entry=>entry.Name).join(","));items(2).Text="Updated by index";HMIRuntime.Timers.SetTimeout(()=>HMIRuntime.Trace("TIMER="+items.Count),20);';
  const fpSource = 'HMIRuntime.Trace("FP="+Faceplate.Items("Title").Text+":"+Object.values(Faceplate.Items).map(entry=>entry.Name).join(","));';
  const program = code => {
    const result = scripts.inspectHmiScript(code);
    assert.equal(result.error, undefined);
    return result.program;
  };
  const events = code => JSON.stringify([{
    event: 'Tapped',
    script: code,
    program: program(code)
  }]);
  const attr = code => events(code).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  await writeFile(path.join(generated, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Collection QA</title><style>body{font:13px system-ui;background:#222;color:#ddd;padding:20px}button{padding:10px;margin:8px}section{margin:20px}span{display:inline-block;padding:8px}</style></head><body><div id="Outside">Outside screen</div><main data-hmi-screen="Main"><button data-hmi-name="Run" data-hmi-events="' + attr(source) + '">Run collection script</button><span data-hmi-name="Hidden" hidden>Hidden</span><span data-hmi-name="Target">Before</span><section data-hmi-name="FP1" data-hmi-faceplate="' + binding('One') + '"></section><section data-hmi-name="FP2" data-hmi-faceplate="' + binding('Two') + '"></section></main><main data-hmi-screen="Other"><span data-hmi-name="OtherItem">Other</span></main><script type="module">import{installFramecraftHmiRuntime}from"/src/framecraftHmiRuntime.ts";window.qa={traces:[],errors:[]};window.qa.dispose=installFramecraftHmiRuntime({navigate:()=>{},routes:[],trace:message=>window.qa.traces.push(message),error:message=>window.qa.errors.push(message)});</script></body></html>');
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
  const errors = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || url.startsWith('data:')) {
      if (url.includes('/tags/write')) plcWrites++;
      return route.continue();
    }
    external++;
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelectorAll('[data-hmi-faceplate-object="Title"]').length === 4);
  await page.getByRole('button', {
    name: 'Run collection script'
  }).click();
  await page.waitForFunction(() => window.qa.traces.some(t => t.includes('TIMER=5')));
  const traces = await page.evaluate(() => window.qa.traces);
  assert.ok(traces.some(t => t.includes('COUNT=5')));
  assert.ok(traces.some(t => t.includes('NAMES=Run,Hidden,Target,FP1,FP2')));
  assert.equal(await page.locator('[data-hmi-name="Target"]').textContent(), 'Updated by index');
  await page.locator('[data-hmi-faceplate-object="Read"]').evaluateAll((buttons, binding) => buttons.forEach(button => button.setAttribute('data-hmi-events', binding)), events(fpSource));
  const fp1 = page.locator('[data-hmi-name="FP1"]'),
    fp2 = page.locator('[data-hmi-name="FP2"]');
  await fp1.locator('[data-hmi-faceplate-object="Read"]').first().click();
  await fp2.locator('[data-hmi-faceplate-object="Read"]').first().click();
  await fp1.locator('[data-hmi-faceplate-nested="Nested"] [data-hmi-faceplate-object="Read"]').click();
  await page.waitForFunction(() => window.qa.traces.some(t => t.includes('FP=One:Title,Read,Nested')) && window.qa.traces.some(t => t.includes('FP=Two:Title,Read,Nested')) && window.qa.traces.some(t => t.includes('FP=One:Title,Read')));
  await page.screenshot({
    path: path.join(generated, 'collections-runtime.png')
  });
  assert.deepEqual(await page.evaluate(() => window.qa.errors), []);
  assert.deepEqual(errors, []);
  const legacy = 'HMIRuntime.Trace("LEGACY="+Screen.Items("Target").Text);';
  const legacyProgram = program(legacy);
  for (let version = 1; version <= 9; version++) {
    await page.locator('[data-hmi-name="Run"]').evaluate((button, binding) => button.setAttribute('data-hmi-events', binding), JSON.stringify([{
      event: 'Tapped',
      script: legacy,
      program: {
        ...legacyProgram,
        version
      }
    }]));
    await page.getByRole('button', {
      name: 'Run collection script'
    }).click();
  }
  await page.waitForFunction(() => window.qa.traces.filter(t => t.includes('LEGACY=Updated by index')).length === 9);
  await page.locator('[data-hmi-name="Run"]').evaluate((button, binding) => button.setAttribute('data-hmi-events', binding), events('UI.OpenFaceplateInPopup("outer","Collection popup",{Label:"Popup"});'));
  await page.getByRole('button', {
    name: 'Run collection script'
  }).click();
  const popup = page.locator('[data-framecraft-runtime-popup-id]');
  await popup.locator('[data-hmi-faceplate-object="Read"]').first().waitFor();
  await popup.locator('[data-hmi-faceplate-object="Read"]').first().evaluate((button, binding) => button.setAttribute('data-hmi-events', binding), events('HMIRuntime.Trace("POPUP="+Screen.Items.Count+":"+Faceplate.Items.Count+":"+Faceplate.Items("Title").Text);'));
  await popup.locator('[data-hmi-faceplate-object="Read"]').first().click();
  await page.waitForFunction(() => window.qa.traces.some(t => t.includes('POPUP=1:3:Popup')));
  await copyFile(path.join(generated, 'src/framecraftHmiFlashing.ts'), path.join(generated, 'flashing.mjs'));
  await writeFile(path.join(generated, 'runtime.mjs'), scripts.hmiScriptRuntimeModuleSource());
  const runtime = await import(pathToFileURL(path.join(generated, 'runtime.mjs')).href),
    surface = await import(pathToFileURL(path.join(generated, 'flashing.mjs')).href),
    controller = surface.createHmiPropertyFlashing({
      items: () => [{
        itemId: 'screen',
        name: 'Root',
        screenId: 'screen',
        flashing: []
      }, {
        itemId: 'a',
        name: 'A',
        screenId: 'screen',
        flashing: []
      }],
      apply: () => {}
    });
  const node = runtime.executeHmiScript(program('return Object.values(Screen.Items).map(entry=>entry.Name).join(",");'), {}, {
    screenItems: controller.context('a')
  });
  assert.equal(node.error, undefined);
  assert.equal(node.returned, 'A');
  controller.reset();
  await page.evaluate(() => window.qa.dispose());
  assert.deepEqual(await page.evaluate(() => window.qa.errors), []);
  assert.equal(external, 0);
  assert.equal(plcWrites, 0);
  console.log(JSON.stringify({
    passed: true,
    generated,
    standardPipeline: true,
    compiledPanel: true,
    invisibleMembers: true,
    numericAndAliasLookup: true,
    scopedNestedFaceplates: true,
    popupScope: true,
    collectionTimer: true,
    legacyReaders: '1-9',
    generatedNodeRuntime: true,
    external,
    plcWrites
  }));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) console.error(await page.evaluate(() => ({
    traces: window.qa?.traces,
    errors: window.qa?.errors
  })));
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await editor?.close();
}
