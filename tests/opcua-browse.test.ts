import { afterEach, describe, expect, it, vi } from "vitest";
import { AttributeIds, DataType, DataValue, Variant, VariantArrayType, StatusCodes, NodeClass, coerceNodeId, type ClientSession } from "node-opcua-client";
import { browseOpcUaSession } from "../runtime/opcua-browse.mjs";
import { parseOpcUaBrowseQuery, parseOpcUaBrowsePage, opcUaStandardNamespace } from "../runtime/opcua-browse-policy.mjs";
const ns = "urn:framecraft:synthetic-browse";
const data = (dataType: DataType, value: unknown, arrayType = VariantArrayType.Scalar) => new DataValue({ value: new Variant({ dataType, value, arrayType }), statusCode: StatusCodes.Good });
function fixture(count = 230) {
  const refs = Array.from({length:count},(_,i)=>({nodeId:coerceNodeId("ns=1;s=Node"+i),nodeClass:NodeClass.Variable,browseName:{name:"Node"+i,namespaceIndex:1},displayName:{text:"Nodo "+i}}));
  const chunk = (offset: number) => ({statusCode:StatusCodes.Good,references:refs.slice(offset,offset+100),continuationPoint:offset+100<refs.length?Buffer.from(String(offset+100)):null});
  const session = {requestedMaxReferencesPerNode:17,readNamespaceArray:vi.fn(async()=>[opcUaStandardNamespace,ns]),browse:vi.fn(async(_input:unknown)=>chunk(0)),browseNext:vi.fn(async(point:Buffer,release:boolean)=>release?{statusCode:StatusCodes.Good,references:[],continuationPoint:null}:chunk(Number(point.toString()))),read:vi.fn(async(requests:{nodeId:unknown;attributeId:number}[])=>requests.map(request=>{
    if(request.attributeId===AttributeIds.DataType)return data(DataType.NodeId,coerceNodeId("i=10"));
    if(request.attributeId===AttributeIds.ValueRank)return data(DataType.Int32,-1);
    if(request.attributeId===AttributeIds.ArrayDimensions)return data(DataType.UInt32,[],VariantArrayType.Array);
    if(request.attributeId===AttributeIds.UserAccessLevel)return data(DataType.Byte,1);
    throw Error("Process value read is forbidden");
  }))};
  return {refs,session,run:(query={},options={})=>browseOpcUaSession(session as unknown as ClientSession,query,options)};
}
afterEach(()=>vi.useRealTimers());
describe("read-only OPC UA browse contracts",()=>{
  it.each([null,[],{url:"opc.tcp://not-allowed:4840"},{namespaceUri:ns},{nodeId:"i=85"},{namespaceUri:ns,nodeId:"ns=1;s=Node0"},{offset:1},{offset:-1},{limit:101},{limit:0},{revision:"bad"}])("rejects invalid query %j",input=>{expect(()=>parseOpcUaBrowseQuery(input)).toThrow();});
  it("uses portable namespace identity, stable pages and metadata only",async()=>{
    const test=fixture(),first=await test.run();expect(first).toMatchObject({total:230,nextOffset:100,target:{namespaceUri:opcUaStandardNamespace,nodeId:"i=85"}});expect(first.nodes[0]).toMatchObject({target:{namespaceUri:ns,nodeId:"s=Node0"},supportedDataType:"Real",valueRank:-1,arrayDimensions:[],readable:true,writable:false,issues:[]});
    const second=await test.run({offset:100,revision:first.revision}),third=await test.run({offset:200,revision:first.revision});expect(new Set([...first.nodes,...second.nodes,...third.nodes].map(node=>node.target?.nodeId)).size).toBe(230);expect(third.nextOffset).toBeNull();expect(test.session.requestedMaxReferencesPerNode).toBe(17);
    expect(test.session.read.mock.calls.every(([requests])=>requests.every(request=>request.attributeId!==AttributeIds.Value))).toBe(true);expect(test.session.read.mock.calls.every(([requests])=>requests.length<=64)).toBe(true);
  });
  it("resolves a changed namespace index by URI and never follows a remote server",async()=>{
    const test=fixture(1);test.session.readNamespaceArray.mockResolvedValue([opcUaStandardNamespace,"urn:other",ns]);test.refs[0].nodeId=coerceNodeId("ns=2;s=Node0");await test.run({namespaceUri:ns,nodeId:"s=Folder"});const target=(test.session.browse.mock.calls[0][0] as {nodeId:{namespace:number}}).nodeId;expect(target.namespace).toBe(2);
    Object.assign(test.refs[0].nodeId,{serverIndex:1});const page=await test.run();expect(page.nodes[0]).toMatchObject({target:null,supportedDataType:null,issues:["remote"]});
  });
  it("marks arrays, custom data types and unavailable access metadata without claiming scalar support",async()=>{
    const test=fixture(1),original=test.session.read.getMockImplementation()!;
    test.session.read.mockImplementation(async requests=>(await original(requests)).map((value,i)=>requests[i].attributeId===AttributeIds.ValueRank?data(DataType.Int32,1):requests[i].attributeId===AttributeIds.ArrayDimensions?data(DataType.UInt32,[3],VariantArrayType.Array):value));
    expect((await test.run()).nodes[0]).toMatchObject({valueRank:1,arrayDimensions:[3],supportedDataType:null,issues:["array"]});
    test.session.read.mockImplementation(async requests=>(await original(requests)).map((value,i)=>requests[i].attributeId===AttributeIds.DataType?data(DataType.NodeId,coerceNodeId("ns=1;s=CustomType")):requests[i].attributeId===AttributeIds.UserAccessLevel?new DataValue({statusCode:StatusCodes.BadUserAccessDenied}):value));
    expect((await test.run()).nodes[0]).toMatchObject({supportedDataType:null,readable:null,writable:null,issues:["metadata","unsupported-type"]});
  });
  it("rejects changed directories and ambiguous namespaces, without partial pages",async()=>{
    const test=fixture(2),page=await test.run();test.refs[0].displayName.text="Changed";await expect(test.run({offset:1,revision:page.revision})).rejects.toMatchObject({code:"OPC_UA_BROWSE_CHANGED"});
    test.session.readNamespaceArray.mockResolvedValue([opcUaStandardNamespace,ns,ns]);await expect(test.run({namespaceUri:ns,nodeId:"s=Folder"})).rejects.toMatchObject({code:"OPC_UA_BROWSE_NAMESPACE"});
  });
  it("releases continuation points at a folder budget failure",async()=>{
    const test=fixture(5200);await expect(test.run()).rejects.toMatchObject({code:"OPC_UA_BROWSE_LIMIT"});expect(test.session.browseNext.mock.calls.some(([,release])=>release)).toBe(true);expect(test.session.read).not.toHaveBeenCalled();
  });
  it("releases a continuation received after cancellation",async()=>{
    const test=fixture(1),abort=new AbortController();let complete!:(value:Awaited<ReturnType<typeof test.session.browse>>)=>void;
    test.session.browse.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));const pending=test.run({}, {signal:abort.signal});await vi.waitFor(()=>expect(test.session.browse).toHaveBeenCalledOnce());abort.abort();await expect(pending).rejects.toMatchObject({code:"OPC_UA_BROWSE_CANCELLED"});
    complete({statusCode:StatusCodes.Good,references:[],continuationPoint:Buffer.from("late")});await vi.waitFor(()=>expect(test.session.browseNext).toHaveBeenCalledWith(Buffer.from("late"),true));expect(test.session.read).not.toHaveBeenCalled();
  });
  it("accepts an empty continuation page but rejects malformed metadata and misleading type claims",async()=>{
    const test=fixture(1);test.session.browse.mockResolvedValueOnce({statusCode:StatusCodes.Good,references:[],continuationPoint:Buffer.from("0")});const page=await test.run();expect(page.total).toBe(1);
    const invalid=structuredClone(page);invalid.nodes[0].dataType!.nodeId="i=12";expect(()=>parseOpcUaBrowsePage(invalid)).toThrow();
    test.session.read.mockResolvedValue([]);await expect(test.run()).rejects.toMatchObject({code:"OPC_UA_BROWSE_RESPONSE"});
  });
  it("reports an unspecified node class without guessing a variable",async()=>{const test=fixture(1);test.refs[0].nodeClass=NodeClass.Unspecified;expect((await test.run()).nodes[0]).toMatchObject({nodeClass:"Unknown",supportedDataType:null});expect(test.session.read).not.toHaveBeenCalled();});
  it.each([8,9,13,15])("does not map unsupported built-in datatype %i to a smaller scalar",async id=>{const test=fixture(1),original=test.session.read.getMockImplementation()!;test.session.read.mockImplementation(async requests=>(await original(requests)).map((value,i)=>requests[i].attributeId===AttributeIds.DataType?data(DataType.NodeId,coerceNodeId("i="+id)):value));expect((await test.run()).nodes[0]).toMatchObject({supportedDataType:null,issues:["unsupported-type"]});});
  it.each(["i=42","g=12345678-1234-1234-abcd-123456789012","b=YWJj"])("preserves portable identifier %s without a namespace index",async id=>{const test=fixture(1);test.refs[0].nodeId=coerceNodeId("ns=1;"+id);const target=(await test.run()).nodes[0].target!;expect(target.namespaceUri).toBe(ns);expect(id.startsWith("g=")?target.nodeId.toLowerCase():target.nodeId).toBe(id);});
});
