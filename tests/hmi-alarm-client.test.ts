import { afterEach, expect, it, vi } from "vitest";
import { createHmiGatewayClient } from "../src/core/hmiGateway";
import { createAlarmEngine, emptyAlarmCatalog } from "../runtime/alarm-engine.mjs";
const cleanup: (() => void)[] = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); });
async function fixture(response: () => Response | Promise<Response>) {
  const catalog = { ...emptyAlarmCatalog(), alarms: [{ id: "a", name: "Alarm", text: "Check", tag: "Signal", className: "Alarm_CTH", priority: 1, enabled: true, trigger: { kind: "bit" as const, bit: 0, activeWhen: "set" as const } }] };
  const engine = createAlarmEngine(catalog, [{ name: "Signal", dataType: "Bool", access: "read" }]); engine.updateSample({ tag: "Signal", value: true, qualityCode: 192 });
  const snapshot = { version: 1, allowWrites: false, connections: [], tags: [], samples: [], alarms: { ...engine.snapshot(), actionsEnabled: true } };
  const request = vi.fn<typeof fetch>(async (input, init) => String(input).endsWith("/alarm-action") ? response() : new Response(JSON.stringify(snapshot)));
  const client = createHmiGatewayClient({ request, pollMs: 100 }); cleanup.push(() => client.stop()); client.start(); await vi.waitFor(() => expect(client.state).toBe("connected"));
  const row = snapshot.alarms.rows[0], command = { alarmId: row.id, occurrence: row.occurrence!, revision: row.revision, action: "acknowledge" as const };
  return { client, request, command, snapshot, engine };
}
it.each([
  [403, {}, "rejected"], [409, {}, "rejected"], [503, {}, "uncertain"],
  [403, { type: "operator", code: "AUTH_PERMISSION" }, "rejected"],
  [503, { type: "operator", code: "AUTH_AUDIT_UNCERTAIN" }, "uncertain"],
  [200, { alarms: "malformed" }, "uncertain"],
] as const)("classifies alarm HTTP %s as %s without retries or private server errors", async (status, body, outcome) => {
  const test = await fixture(() => new Response(JSON.stringify({ ...body, error: "PRIVATE_SERVER_STACK" }), { status }));
  await expect(test.client.alarmAction(test.command)).rejects.toMatchObject({ name: "HmiGatewayCommandError", outcome });
  try { await test.client.alarmAction(test.command); } catch (error) { expect(String(error)).not.toContain("PRIVATE_SERVER_STACK"); }
  expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
});
it("marks a lost transport response uncertain and sends the command once", async () => {
  const test = await fixture(() => { throw new TypeError("PRIVATE_NETWORK_ERROR"); });
  await expect(test.client.alarmAction(test.command)).rejects.toMatchObject({ outcome: "uncertain" }); expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("accepts only a valid successful snapshot and identifies offline rejection before transmission", async () => {
  const test = await fixture(() => new Response(JSON.stringify({ alarms: { ...test.engine.action(test.command, "operator"), actionsEnabled: true } })));
  expect((await test.client.alarmAction(test.command)).rows[0].acknowledged).toBe(true); test.client.stop();
  await expect(test.client.alarmAction(test.command)).rejects.toMatchObject({ outcome: "rejected" }); expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
