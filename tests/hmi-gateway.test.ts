import { describe, expect, it, vi } from "vitest";
import { createHmiGatewayClient, type HmiGatewaySnapshot } from "../src/core/hmiGateway";
const snapshot: HmiGatewaySnapshot = { version: 1, allowWrites: true, connections: [{ id: "test", state: "connected" }],
  tags: [{ name: "Speed", dataType: "Real", access: "read-write", connectionId: "test", writable: true }],
  samples: [{ tag: "Speed", connectionId: "test", value: "10", receivedAt: 1_000 }] };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("client gateway del Runtime browser", () => {
  it("blocca endpoint cross-origin e intervalli invalidi", () => {
    expect(() => createHmiGatewayClient({ path: "https://external.invalid" })).toThrow("stessa origine");
    expect(() => createHmiGatewayClient({ path: "//external.invalid" })).toThrow("stessa origine");
    expect(() => createHmiGatewayClient({ pollMs: 0 })).toThrow("Intervallo");
  });
  it("mantiene un solo poll in corso e non ripete notifiche per campioni invariati", async () => {
    const onSnapshot = vi.fn(), request = vi.fn(async () => response(snapshot));
    const client = createHmiGatewayClient({ request, pollMs: 100, onSnapshot });
    try { client.start(); client.start(); await vi.waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(1)); expect(onSnapshot).toHaveBeenCalledTimes(1); }
    finally { client.stop(); }
  });
  it("rifiuta snapshot incoerenti invece di accettare tag o qualità inventati", async () => {
    const onSnapshot = vi.fn(), client = createHmiGatewayClient({ onSnapshot, request: async () => response({ ...snapshot, samples: [{ ...snapshot.samples[0], qualityCode: 99_999 }] }) });
    try { client.start(); await vi.waitFor(() => expect(client.state).toBe("disconnected")); expect(onSnapshot).not.toHaveBeenCalled(); await expect(client.write("Speed", 20)).rejects.toMatchObject({ outcome: "rejected" }); }
    finally { client.stop(); }
  });
  it("non aggiorna la cache né invia conferma PLC dopo una ricevuta del broker", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/snapshot")) return response(snapshot);
      const command = JSON.parse(String(init?.body)); return response({ ...command, outcome: "delivered", delivery: "broker-ack", plcConfirmed: false });
    });
    const onSnapshot = vi.fn(), client = createHmiGatewayClient({ request, onSnapshot });
    try {
      client.start(); await vi.waitFor(() => expect(client.state).toBe("connected"));
      expect(await client.write("Speed", 20)).toMatchObject({ outcome: "delivered", plcConfirmed: false });
      expect(onSnapshot.mock.calls[0][0].samples[0].value).toBe("10"); expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write"))).toHaveLength(1);
    } finally { client.stop(); }
  });
  it("interrompe una risposta troppo grande prima di accumularla tutta", async () => {
    const cancel = vi.fn(), onSnapshot = vi.fn();
    const request = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(4_194_305)); }, cancel,
    }));
    const client = createHmiGatewayClient({ request, onSnapshot, pollMs: 60_000 });
    try { client.start(); await vi.waitFor(() => expect(client.state).toBe("disconnected")); expect(cancel).toHaveBeenCalledOnce(); expect(onSnapshot).not.toHaveBeenCalled(); }
    finally { client.stop(); }
  });
  it("non ritenta una scrittura se HTTP cade dopo l'invio", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => { if (String(input).endsWith("/snapshot")) return response(snapshot); throw new Error("Lost response"); });
    const client = createHmiGatewayClient({ request });
    try { client.start(); await vi.waitFor(() => expect(client.state).toBe("connected")); await expect(client.write("Speed", 30)).rejects.toMatchObject({ outcome: "uncertain" }); expect(request.mock.calls.filter(([input]) => String(input).endsWith("/write"))).toHaveLength(1); }
    finally { client.stop(); }
  });
  it("blocca tag read-only e segnala come incerta una richiesta in corso al logout", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/snapshot")) return response(snapshot);
      return await new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
    });
    const client = createHmiGatewayClient({ request });
    try {
      client.start(); await vi.waitFor(() => expect(client.state).toBe("connected")); await expect(client.write("Unknown", 1)).rejects.toMatchObject({ outcome: "rejected" });
      const assertion = expect(client.write("Speed", 40)).rejects.toMatchObject({ outcome: "uncertain" });
      await vi.waitFor(() => expect(request.mock.calls.some(([input]) => String(input).endsWith("/write"))).toBe(true)); client.stop(); await assertion;
    } finally { client.stop(); }
  });
});
