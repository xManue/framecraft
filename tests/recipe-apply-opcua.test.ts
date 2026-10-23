import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OPCUAServer } from "node-opcua-server";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { DataType, DataValue, Variant, StatusCodes, MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { openRecipeApplyStore } from "../runtime/recipe-apply-store.mjs";
import { createRecipePlcReference, newRecipePlcState } from "../runtime/recipe-plc-reference.mjs";
import { recipeApplyAscii } from "../runtime/recipe-apply.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { hashOperatorPassword, writeOperatorStore } from "../runtime/operator-store.mjs";
const token="synthetic_ua_apply_token_01234567890123456789",password="SYNTHETIC-UA-apply-password-012345",origin="http://127.0.0.1:4173";
describe("OPC UA application-level recipe acknowledgement",()=>{
  it("uses real String nodes, does not equate Write Good with application, and protects node aliases",async()=>{
    const base=path.resolve(".hmi-preview");await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,"recipe-apply-ua-")),namespace=randomUUID();
    const catalog={version:1 as const,schemas:[{id:"s",name:"Schema",fields:[{id:"n",name:"Numero",type:"number" as const}],records:[{id:"r",name:"Formato",values:{n:12}}]}]};
    const applied=vi.fn(),plc=createRecipePlcReference({namespace,channelId:"line1",catalog,retained:newRecipePlcState(namespace,"line1"),persist:()=>{},canApply:()=>interlock,apply:applied});let interlock=true,responseText=recipeApplyAscii(plc.response());const frames:string[]=[];
    const manager=new OPCUACertificateManager({rootFolder:path.join(root,"pki"),disableFileWatchers:true}),server=new OPCUAServer({port:0,host:"127.0.0.1",hostname:"127.0.0.1",serverCertificateManager:manager,securityModes:[MessageSecurityMode.None],securityPolicies:[SecurityPolicy.None],allowAnonymous:true});
    let gateway:ReturnType<typeof createPlcGateway>|undefined,ledger:ReturnType<typeof openRecipeApplyStore>|undefined,audit:ReturnType<typeof openRuntimeAudit>|undefined;
    try{
      await server.initialize();const space=server.engine.addressSpace!,ns=space.registerNamespace("urn:framecraft:recipe-apply-qa");
      ns.addVariable({organizedBy:space.rootFolder.objects,browseName:"Request",nodeId:"s=Request",dataType:"String",accessLevel:"CurrentRead | CurrentWrite",userAccessLevel:"CurrentRead | CurrentWrite",value:{timestamped_get:()=>new DataValue({value:new Variant({dataType:DataType.String,value:""}),statusCode:StatusCodes.Good,sourceTimestamp:new Date()}),timestamped_set:(data,callback)=>{try{const source=String(data.value.value);frames.push(JSON.parse(source).phase);responseText=recipeApplyAscii(plc.receive(source));callback(null,StatusCodes.Good);}catch{callback(null,StatusCodes.BadInvalidArgument);}}}});
      ns.addVariable({organizedBy:space.rootFolder.objects,browseName:"Response",nodeId:"s=Response",dataType:"String",minimumSamplingInterval:100,value:{timestamped_get:()=>new DataValue({value:new Variant({dataType:DataType.String,value:responseText}),statusCode:StatusCodes.Good,sourceTimestamp:new Date()})}});await server.start();
      const endpoint=server.endpoints[0].endpointDescriptions().find(item=>item.securityMode===MessageSecurityMode.None)!.endpointUrl!;
      const security=path.join(root,".framecraft-runtime/security");await mkdir(security,{recursive:true});await writeOperatorStore(path.join(security,"operators.json"),{version:1,id:randomUUID(),accounts:[{id:randomUUID(),username:"operator",name:"Operator",role:"Operator",disabled:false,permissions:[],capabilities:["recipes.read","recipes.apply","tags.write"],password:await hashOperatorPassword(password)}]},undefined);
      audit=openRuntimeAudit({root,namespace});ledger=openRecipeApplyStore({root,namespace});const recipes=await openRecipeStore({directory:path.join(root,"recipes"),catalog});
      const auth=createLocalOperatorAuth({file:path.join(security,"operators.json"),config:{version:1,enabled:true,namespace,allowHttpLoopback:true,idleMinutes:1,absoluteMinutes:2},allowedOrigins:[origin],audit});
      gateway=createPlcGateway({version:1,gateway:{enabled:true,port:0,tokenEnv:"SYNTHETIC_UA_TOKEN",allowedOrigins:[origin],allowWrites:true},connections:[{id:"ua",protocol:"opcua",enabled:true,url:endpoint,allowWrites:true,allowInsecure:true,securityMode:"None",securityPolicy:"None",pkiDirectory:path.join(root,"client-pki"),readIntervalMs:250,samplingIntervalMs:250,bindings:[{tag:"Request",namespaceUri:"urn:framecraft:recipe-apply-qa",nodeId:"s=Request",writeEnabled:true},{tag:"Response",namespaceUri:"urn:framecraft:recipe-apply-qa",nodeId:"s=Response"},{tag:"Alias",namespaceUri:"urn:framecraft:recipe-apply-qa",nodeId:"s=Request",writeEnabled:true}]}]},[{name:"Request",dataType:"String",access:"write"},{name:"Response",dataType:"String",access:"read"},{name:"Alias",dataType:"String",access:"write"}],{resolveSecret:()=>token,operatorAuth:auth,audit,recipeStore:recipes,recipeApplyNamespace:namespace,recipeApplyStore:ledger,recipeApplyConfig:{version:1,schemas:[{schemaId:"s",channelId:"line1",requestTag:"Request",responseTag:"Response",maxPayloadBytes:8192,maxAgeMs:2000,prepareTimeoutMs:3000,applyTimeoutMs:3000,stageLifetimeMs:10000}]}});await gateway.start();await vi.waitFor(()=>expect(gateway!.snapshot().samples.some(sample=>sample.tag==="Response"&&sample.qualityCode===192)).toBe(true),{timeout:5000});
      const request=(route:string,body:unknown,extra={})=>fetch(gateway!.address+"/_framecraft/plc/v1/"+route,{method:"POST",headers:{Authorization:"Bearer "+token,Origin:origin,"Content-Type":"application/json",...extra},body:JSON.stringify(body)});
      const login=await request("session/login",{username:"operator",password});expect(login.status).toBe(200);const session=await login.json(),headers={Cookie:login.headers.get("set-cookie")!.split(";")[0],"X-Framecraft-CSRF":session.csrfToken};
      const command={id:randomUUID().replaceAll("-",""),schemaId:"s",recordId:"r",expectedRevision:(await recipes.snapshot()).revision};const result=await request("recipe-apply",command,headers);expect(result.status).toBe(200);expect(await result.json()).toMatchObject({plcConfirmed:true,outcome:"applied"});expect(applied).toHaveBeenCalledTimes(1);expect(frames).toEqual(["prepare","apply"]);
      interlock=false;const rejected=await request("recipe-apply",{...command,id:randomUUID().replaceAll("-","")},headers);expect(rejected.status).toBe(422);expect(await rejected.json()).toMatchObject({outcome:"rejected",plcCode:1,plcConfirmed:false});expect(applied).toHaveBeenCalledTimes(1);expect(frames).toEqual(["prepare","apply","prepare"]);
      const bypass=await request("write",{id:randomUUID().replaceAll("-",""),tag:"Alias",value:"SYNTHETIC_FORGED_FRAME"},headers);expect(bypass.status).toBe(403);expect(frames).toHaveLength(3);expect(gateway.snapshot().tags.find(tag=>tag.name==="Alias")?.writable).toBe(false);
    }finally{await gateway?.stop();ledger?.close();audit?.close();await server.shutdown(0);await manager.dispose();}
  },30000);
});
