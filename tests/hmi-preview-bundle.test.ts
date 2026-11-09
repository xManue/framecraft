// @vitest-environment node
import {expect,it} from 'vitest';
import {mkdirSync,mkdtempSync,copyFileSync,readFileSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
it('loads the packaged preview plugin with its declared resources and shared quality adapter',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),native=path.join(root,'src-tauri');
 const resources=JSON.parse(readFileSync(path.join(native,'tauri.conf.json'),'utf8')).bundle.resources as Record<string,string>;
 expect(resources['../scripts/hmi-control-quality.mjs']).toBe('scripts/hmi-control-quality.mjs');
 mkdirSync(path.join(root,'.hmi-preview'),{recursive:true});const deployed=mkdtempSync(path.join(root,'.hmi-preview/quality-resources-'));
 for(const [source,target] of Object.entries(resources)){const output=path.resolve(deployed,target);expect(output.startsWith(deployed+path.sep)).toBe(true);mkdirSync(path.dirname(output),{recursive:true});copyFileSync(path.resolve(native,source),output);}
 symlinkSync(path.join(root,'node_modules'),path.join(deployed,'node_modules'),'junction');
 const url=pathToFileURL(path.join(deployed,'scripts/framecraft-vite-plugin.mjs')).href;
 const output=execFileSync(process.execPath,['--input-type=module','-e',`const {default:plugin}=await import(${JSON.stringify(url)});const code=plugin().transformIndexHtml('<main></main>').tags[0].children;if(!code.includes('framecraft.control-quality.v1'))throw Error('Missing quality adapter');console.log('packaged-preview-ok');`],{encoding:'utf8',timeout:15000});expect(output.trim()).toBe('packaged-preview-ok');
});
