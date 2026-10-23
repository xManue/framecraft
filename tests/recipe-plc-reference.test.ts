import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRecipePlcReference, newRecipePlcState, type RecipePlcRetainedState } from "../runtime/recipe-plc-reference.mjs";
import { recipeApplyFrame, recipeApplySchemaSource } from "../runtime/recipe-apply.mjs";
const schema={id:"s",name:"Schema",fields:[{id:"n",name:"Numero",type:"number" as const,minimum:0,maximum:10}],records:[]};
function fixture() {
  const namespace=randomUUID(),receipt={namespace,channelId:"line1",sequence:1,id:"a".repeat(32),fingerprint:"a".repeat(64),schemaId:"s",recordId:"r"},payload={schemaHash:createHash("sha256").update(recipeApplySchemaSource(schema)).digest("hex"),ttlMs:3000,values:{n:5}};
  let retained=newRecipePlcState(namespace,"line1"),fault=false;const applied=vi.fn(),persist=vi.fn((next:RecipePlcRetainedState)=>{if(fault)throw Error("SYNTHETIC_STORAGE_FAILURE");retained=structuredClone(next);});
  const options:Parameters<typeof createRecipePlcReference>[0]={namespace,channelId:"line1",catalog:{version:1 as const,schemas:[schema]},retained,persist,canApply:()=>true,apply:applied};const plc=createRecipePlcReference(options);
  const prepare=()=>recipeApplyFrame(receipt,"prepare",payload,8192),apply=()=>recipeApplyFrame(receipt,"apply",undefined,8192);
  return {plc,options,applied,receipt,payload,prepare,apply,get retained(){return retained;},set fault(value:boolean){fault=value;}};
}
describe("PLC-side reference contract and retentive boundaries",()=>{
  it("restarts a prepared job as rejected, never auto-applies, and rejects delayed duplicate commands",()=>{
    const test=fixture();expect(test.plc.receive(test.prepare(),0).state).toBe("prepared");const restarted=createRecipePlcReference({...test.options,retained:test.retained});expect(restarted.response()).toMatchObject({state:"rejected",code:6});expect(restarted.receive(test.apply(),1)).toMatchObject({state:"rejected",code:6});expect(test.applied).not.toHaveBeenCalled();
  });
  it("keeps a possible applied-but-unrecorded copy uncertain across restart instead of executing again",()=>{
    const test=fixture();test.plc.receive(test.prepare(),0);test.options.apply=()=>{test.applied();test.fault=true;};const active=createRecipePlcReference({...test.options,retained:newRecipePlcState(test.options.namespace,"line1")});active.receive(test.prepare(),0);expect(active.receive(test.apply(),1)).toMatchObject({state:"uncertain",code:10});expect(test.applied).toHaveBeenCalledOnce();test.fault=false;
    const restarted=createRecipePlcReference({...test.options,retained:test.retained});expect(restarted.response()).toMatchObject({state:"uncertain",code:6});expect(restarted.receive(test.apply(),1).state).toBe("uncertain");expect(test.applied).toHaveBeenCalledOnce();
  });
  it("checks the schema hash and all field bounds before preparing",()=>{
    const test=fixture();const source=recipeApplyFrame(test.receipt,"prepare",{...test.payload,values:{n:11}},8192);expect(test.plc.receive(source,0)).toMatchObject({state:"rejected",code:3});expect(test.applied).not.toHaveBeenCalled();
    const other=fixture();expect(other.plc.receive(recipeApplyFrame(other.receipt,"prepare",{...other.payload,schemaHash:"b".repeat(64)},8192),0)).toMatchObject({state:"rejected",code:2});
  });
  it("expires staging before a late apply and accepts neither another namespace nor a bare success flag",()=>{
    const test=fixture();test.plc.receive(test.prepare(),0);expect(test.plc.receive(test.apply(),3001)).toMatchObject({state:"rejected",code:5});expect(test.applied).not.toHaveBeenCalled();expect(()=>test.plc.receive('{"applied":true}',3002)).toThrow();expect(()=>test.plc.receive(recipeApplyFrame({...test.receipt,namespace:randomUUID()},"apply",undefined,8192),3002)).toThrow();
  });
});
