import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Aedes } from "aedes";
import { connectAsync } from "mqtt";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { openRecipeApplyStore } from "../runtime/recipe-apply-store.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { defaultOperatorResources } from "../runtime/operator-policy.mjs";
import { hashOperatorPassword, writeOperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { createRecipePlcReference, newRecipePlcState } from "../runtime/recipe-plc-reference.mjs";
import { recipeApplyAscii, type RecipeApplyFrame } from "../runtime/recipe-apply.mjs";
import { standardProjectFiles } from "../src/core/standardProject";
import type { RecipeCatalog, RecipeScalar } from "../runtime/recipe-catalog.mjs";
const token = "synthetic_apply_gateway_token_0123456789", password = "SYNTHETIC-apply-password-012345", origin = "http://127.0.0.1:4173", marker = "SYNTHETIC_RECIPE_VALUE_NOT_A_LOG";
let hash: OperatorPassword; beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
const catalog: RecipeCatalog = { version: 1, schemas: ["s", "denied"].map(id => ({ id, name: id, fields: [{ id: "n", name: "Numero", type: "number" }, { id: "t", name: "Testo", type: "string" }], records: [{ id: "r", name: "Formato", values: { n: 0, t: marker } }] })) };
const profile = { schemaId: "s", channelId: "line1", requestTag: "Request", responseTag: "Response", maxPayloadBytes: 8192, maxAgeMs: 2000, prepareTimeoutMs: 1000, applyTimeoutMs: 1000, stageLifetimeMs: 3000 };
async function fixture(emitted = false) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "recipe-apply-http-")), namespace = randomUUID();
  const config = { version: 1 as const, schemas: [profile, { ...profile, schemaId: "denied" }] }, variables = ["Request", "Response", "UnsafeAlias", "ResponseAlias"].map(name => ({ name, dataType: "String", access: name === "Response" ? "read" as const : "write" as const }));
  const authConfig = { version: 1 as const, enabled: true, namespace, allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 };
  const broker = await Aedes.createBroker(), tcp = createServer(broker.handle); await new Promise<void>(resolve => tcp.listen(0, "127.0.0.1", resolve)); const url = "mqtt://127.0.0.1:" + (tcp.address() as {port:number}).port;
  const plcClient = await connectAsync(url, { clientId: "synthetic-plc", reconnectPeriod: 0 }); await plcClient.subscribeAsync("recipe/request", { qos: 1 });
  const frames: RecipeApplyFrame[] = [], errors: unknown[] = [], machine: Record<string, RecipeScalar>[] = []; let retained = newRecipePlcState(namespace, "line1"), dropApplied = false, ignorePrepare = false, chain = Promise.resolve();
  const plc = createRecipePlcReference({ namespace, channelId: "line1", catalog, retained, persist: state => { retained = state; }, canApply: () => true, apply: values => { machine.push(values); } });
  const publish = async (ack = plc.response()) => { if (dropApplied && ack.state === "applied") return; await plcClient.publishAsync("recipe/response", JSON.stringify({ value: recipeApplyAscii(ack), quality: 192 }), { qos: 1, retain: false }); };
  plcClient.on("message", (_topic, bytes) => { chain = chain.then(async () => { const frame = JSON.parse(bytes.toString()) as RecipeApplyFrame; frames.push(frame); if (ignorePrepare && frame.phase === "prepare") return; await publish(plc.receive(bytes.toString())); }).catch(error => { errors.push(error); }); });
  const timer = setInterval(() => { chain = chain.then(() => publish(plc.tick())).catch(error => { errors.push(error); }); }, 100);
  const connections = { version: 1 as const, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_APPLY_TOKEN", allowedOrigins: [origin], allowWrites: true }, connections: [{ id: "plc", protocol: "mqtt" as const, enabled: true, url, allowInsecure: true, allowWrites: true, bindings: [
    { tag: "Request", writeTopic: "recipe/request", writeEncoding: "text" as const, writeQos: 1 as const }, { tag: "Response", topic: "recipe/response", valuePath: "/value", qualityPath: "/quality", qos: 1 as const }, { tag: "UnsafeAlias", writeTopic: "recipe/request", writeEncoding: "text" as const }, { tag: "ResponseAlias", writeTopic: "recipe/response", writeEncoding: "text" as const },
  ] }] };
  const security = path.join(root, ".framecraft-runtime/security"); await mkdir(security, { recursive: true }); const accountId = randomUUID();
  await writeOperatorStore(path.join(security, "operators.json"), { version: 2, id: randomUUID(), accounts: [{ id: accountId, username: "operator", name: "Operatore", role: "Admin", permissions: [], disabled: false, capabilities: ["recipes.read", "recipes.apply", "tags.write"], password: hash }], resourceRules: [{ accountId, limits: { ...defaultOperatorResources(), recipeChanges: { mode: "selected", ids: ["s"] }, tagWrites: { mode: "all" } } }] }, undefined);
  const recipes = await openRecipeStore({ directory: path.join(root, "recipes"), catalog }); let ledger: ReturnType<typeof openRecipeApplyStore> | undefined, audit: ReturnType<typeof openRuntimeAudit> | undefined, gateway: ReturnType<typeof createPlcGateway> | undefined, child: ReturnType<typeof spawn> | undefined, address = "", output = "", stderr = "", exit: Promise<void> | undefined;
  const close = async () => { clearInterval(timer); await gateway?.stop(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await exit; } ledger?.close(); audit?.close(); await chain; await plcClient.endAsync(true); await new Promise<void>(resolve => broker.close(resolve)); await new Promise<void>(resolve => tcp.close(() => resolve())); };
  try {
  if (emitted) {
    const files = standardProjectFiles({ machineName: "Synthetic recipe apply", layout: "desktop", sections: ["main"] });
    for (const file of files.filter(item => item.path.startsWith("runtime/"))) { const target = path.resolve(root, file.path); await mkdir(path.dirname(target), {recursive:true}); await writeFile(target,file.content); }
    await symlink(path.resolve("node_modules"), path.join(root,"node_modules"), process.platform === "win32" ? "junction" : "dir");
    for (const [file, value] of Object.entries({ "framecraft.connections.json": connections, "framecraft.plc.json": {version:1,variables}, "framecraft.auth.json": authConfig, "framecraft.recipes.json": catalog, "framecraft.recipe-apply.json": config })) await writeFile(path.join(root,file),JSON.stringify(value));
    child = spawn(process.execPath,[path.join(root,"runtime/start-gateway.mjs"),"--json"],{cwd:root,windowsHide:true,env:{...process.env,SYNTHETIC_APPLY_TOKEN:token},stdio:["pipe","pipe","pipe"]}); child.stdout!.on("data",data=>{output+=data;}); child.stderr!.on("data",data=>{stderr+=data;}); exit = new Promise<void>((resolve,reject)=>{child!.once("exit",()=>resolve());child!.once("error",reject);});
    await vi.waitFor(()=>expect(output,stderr).toContain('"type":"gateway"'),{timeout:60000}); address=output.split("\n").filter(Boolean).map(line=>JSON.parse(line)).find(row=>row.type==="gateway").address;
  } else {
    ledger = openRecipeApplyStore({root,namespace}); audit = openRuntimeAudit({root,namespace}); const auth = createLocalOperatorAuth({file:path.join(security,"operators.json"),config:authConfig,allowedOrigins:[origin],audit});
    gateway = createPlcGateway(connections,variables,{resolveSecret:()=>token,operatorAuth:auth,audit,recipeStore:recipes,recipeApplyConfig:config,recipeApplyNamespace:namespace,recipeApplyStore:ledger}); await gateway.start(); address=gateway.address!;
  }
  const request = (route: string, body?: unknown, extra = {}) => fetch(address+"/_framecraft/plc/v1/"+route,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+token,Origin:origin,...(body===undefined?{}:{"Content-Type":"application/json"}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  await vi.waitFor(async()=>expect((await (await request("snapshot")).json()).samples.some((sample:{tag:string})=>sample.tag==="Response")).toBe(true),{timeout:8000});
  const login = await request("session/login",{username:"operator",password}); expect(login.status).toBe(200); const session = await login.json(), headers={Cookie:login.headers.get("set-cookie")!.split(";")[0],"X-Framecraft-CSRF":session.csrfToken};
  const snapshot = await (await request("recipes",undefined,headers)).json(), current = await (await request("recipe-apply/current?schemaId=s",undefined,headers)).json(), command={id:randomUUID().replaceAll("-",""),expectedRevision:snapshot.revision,schemaId:"s",recordId:"r",ledgerId:current.ledgerId};
  return {root,namespace,request,headers,command,frames,machine,errors,get audit(){return audit;},get output(){return output+stderr;},set dropApplied(value:boolean){dropApplied=value;},set ignorePrepare(value:boolean){ignorePrepare=value;},close};
  } catch(error) { await close(); throw error; }
}
describe("real HTTP/MQTT recipe application with server accounts and audit",()=>{
  it("fences an unseen command with server ACL/CSRF and audit, without a single MQTT write",async()=>{
    const test=await fixture();try{
      expect((await test.request("recipe-apply/fence",test.command)).status).toBe(401);expect((await test.request("recipe-apply/fence",{...test.command,schemaId:"denied"},test.headers)).status).toBe(403);
      expect((await test.request("recipe-apply/fence",test.command,{...test.headers,"X-Framecraft-CSRF":"bad"})).status).toBe(403);
      const fenced=await test.request("recipe-apply/fence",test.command,test.headers);expect(fenced.status).toBe(422);expect(await fenced.json()).toMatchObject({outcome:"rejected",code:"RECIPE_APPLY_NOT_SENT",writePhase:"none"});
      const delayed=await test.request("recipe-apply",test.command,test.headers);expect(delayed.status).toBe(422);expect(await delayed.json()).toMatchObject({outcome:"rejected",duplicate:true});expect(test.frames).toHaveLength(0);expect(test.machine).toHaveLength(0);
      expect(test.audit!.read({operation:"recipes.fence"}).events.some(event=>event.code==="RECIPE_APPLY_NOT_SENT")).toBe(true);
    }finally{await test.close();}
  },20000);
  it("checks session, CSRF and schema capability before any protocol message, including raw alias writes",async()=>{
    const test=await fixture();try{
      expect((await test.request("recipe-apply",test.command)).status).toBe(401);expect((await test.request("recipe-apply",test.command,{...test.headers,"X-Framecraft-CSRF":"bad"})).status).toBe(403);expect((await test.request("recipe-apply",{...test.command,schemaId:"denied"},test.headers)).status).toBe(403);
      for(const tag of ["Request","Response","UnsafeAlias","ResponseAlias"]){const result=await test.request("write",{id:randomUUID().replaceAll("-",""),tag,value:"SYNTHETIC_FORGED_FRAME"},test.headers);expect(result.status).toBe(403);}
      expect(test.frames).toHaveLength(0);expect(test.machine).toHaveLength(0);const tags=(await(await test.request("snapshot")).json()).tags;expect(tags.every((tag:{writable:boolean})=>!tag.writable)).toBe(true);
    }finally{await test.close();}
  },20000);
  it("applies once after the PLC handshake and writes no recipe values in the audit",async()=>{
    const test=await fixture();try{
      const response=await test.request("recipe-apply",test.command,test.headers);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({type:"recipe-apply",outcome:"applied",plcConfirmed:true});expect(test.frames.map(frame=>frame.phase)).toEqual(["prepare","apply"]);expect(test.machine).toEqual([{n:0,t:marker}]);
      const duplicate=await test.request("recipe-apply",test.command,test.headers);expect(duplicate.status).toBe(200);expect(await duplicate.json()).toMatchObject({duplicate:true,plcConfirmed:true});expect(test.machine).toHaveLength(1);expect(test.frames).toHaveLength(2);
      const events=test.audit!.read({operation:"recipes.apply"}).events;expect(events.some(event=>event.code==="RECIPE_APPLY_CONFIRMED")).toBe(true);for(const secret of [marker,password,token])expect(JSON.stringify(events)).not.toContain(secret);expect(test.errors).toEqual([]);
    }finally{await test.close();}
  },20000);
  it("reconciles a lost applied result using status, not another prepare/apply",async()=>{
    const test=await fixture();test.dropApplied=true;try{
      const uncertain=await test.request("recipe-apply",test.command,test.headers);expect(uncertain.status).toBe(503);expect(await uncertain.json()).toMatchObject({outcome:"uncertain",plcConfirmed:false,writePhase:"apply"});expect(test.machine).toHaveLength(1);test.dropApplied=false;
      const current=await test.request("recipe-apply/current?schemaId=s",undefined,test.headers);expect(current.status).toBe(200);expect(await current.json()).toMatchObject({current:{id:test.command.id,outcome:"uncertain"}});expect(test.frames).toHaveLength(2);
      const checked=await test.request("recipe-apply/check",{id:test.command.id,schemaId:"s"},test.headers);expect(checked.status).toBe(200);expect(await checked.json()).toMatchObject({plcConfirmed:true});expect(test.frames.map(frame=>frame.phase)).toEqual(["prepare","apply","status"]);expect(test.machine).toHaveLength(1);
    }finally{await test.close();}
  },20000);
  it("runs the emitted launcher with opt-in configuration and real MQTT, not an injected authorizer",async()=>{
    const test=await fixture(true);try{const {stdout}=await promisify(execFile)(process.execPath,[path.join(test.root,"runtime/print-recipe-interface.mjs"),"--json"],{cwd:test.root,encoding:"utf8",windowsHide:true,timeout:30000});const descriptor=JSON.parse(stdout);expect(descriptor).toMatchObject({namespace:test.namespace,configurationEnabled:true});expect(JSON.stringify(descriptor)).not.toContain(marker);expect(descriptor.schemas[0].schemaHash).toMatch(/^[a-f0-9]{64}$/);const response=await test.request("recipe-apply",test.command,test.headers);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({plcConfirmed:true,outcome:"applied"});expect(test.machine).toHaveLength(1);expect(test.frames.map(frame=>frame.phase)).toEqual(["prepare","apply"]);for(const secret of [marker,password,token])expect(test.output).not.toContain(secret);expect(test.errors).toEqual([]);}
    finally{await test.close();}
  },120000);
});
