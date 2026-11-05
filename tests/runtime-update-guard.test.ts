// @vitest-environment node
import { mkdir, mkdtemp, writeFile, link, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { assertRuntimeUpdateComplete } from '../runtime/runtime-update-guard.mjs';
async function fixture(state?:string){await mkdir(path.resolve('.hmi-preview'),{recursive:true});const root=await mkdtemp(path.resolve('.hmi-preview/runtime-update-guard-')),directory=path.join(root,'.framecraft/runtime-updates/123-456');if(state){await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'meta.json'),JSON.stringify({version:1,id:'123-456',state}));}return{root,directory};}
it('allows a project that has no component updates',async()=>{const f=await fixture();await expect(assertRuntimeUpdateComplete(f.root)).resolves.toBeUndefined();});
it.each(['completed','restored','rolled-back'])('allows finalized backups (%s)',async(state)=>{const f=await fixture(state);await expect(assertRuntimeUpdateComplete(f.root)).resolves.toBeUndefined();});
it.each(['prepared','applying','restoring','needs-review'])('blocks PLC startup before drivers for incomplete updates (%s)',async(state)=>{const f=await fixture(state);await expect(assertRuntimeUpdateComplete(f.root)).rejects.toMatchObject({code:'RUNTIME_UPDATE_PENDING',remedy:expect.stringContaining('Backup e ripristino')});});
it('blocks unreadable or malformed backup metadata',async()=>{const f=await fixture('completed');await writeFile(path.join(f.directory,'meta.json'),'{broken');await expect(assertRuntimeUpdateComplete(f.root)).rejects.toMatchObject({code:'RUNTIME_UPDATE_PENDING'});});
it('rejects hard-linked metadata',async()=>{const f=await fixture('completed');await link(path.join(f.directory,'meta.json'),path.join(f.root,'another.json'));await expect(assertRuntimeUpdateComplete(f.root)).rejects.toMatchObject({code:'RUNTIME_UPDATE_PENDING'});});
it('ignores an unpublished staging directory that has not changed project files',async()=>{const f=await fixture();await mkdir(path.join(f.root,'.framecraft/runtime-updates/pending-123-456'),{recursive:true});await expect(assertRuntimeUpdateComplete(f.root)).resolves.toBeUndefined();});

it.each(['gateway', 'mqtt'])('gates the %s launcher before loading a missing service body', async (name) => {
  const f = await fixture('applying');
  const directory = path.join(f.root, 'runtime');
  await mkdir(directory);
  for (const file of ['runtime-update-guard.mjs', 'script-migration-guard.mjs', 'start-' + name + '.mjs']) {
    await copyFile(path.resolve('runtime', file), path.join(directory, file));
  }
  const result = spawnSync(process.execPath, [path.join(directory, 'start-' + name + '.mjs'), '--json'], { cwd: f.root, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ code: 'RUNTIME_UPDATE_PENDING', remedy: expect.stringContaining('Backup e ripristino') });
  expect(result.stdout).toBe('');
});
it.each(['gateway', 'mqtt'])('reports an actionable %s module load failure after the update gate', async (name) => {
  const f = await fixture('completed');
  const directory = path.join(f.root, 'runtime');
  await mkdir(directory);
  for (const file of ['runtime-update-guard.mjs', 'script-migration-guard.mjs', 'start-' + name + '.mjs']) {
    await copyFile(path.resolve('runtime', file), path.join(directory, file));
  }
  const result = spawnSync(process.execPath, [path.join(directory, 'start-' + name + '.mjs'), '--json'], { cwd: f.root, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ code: 'RUNTIME_COMPONENT_LOAD', remedy: expect.stringContaining('Aggiorna componenti del pannello'), technical: expect.stringContaining(name + '-service.mjs') });
  expect(result.stdout).toBe('');
});
