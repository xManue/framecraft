// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewScriptProjectMigration, type ScriptMigrationJob } from '../src/core/scriptMigrationClient';
const job: ScriptMigrationJob = {
  files: {},
  catalog: {
    version: 1,
    globalModules: [],
    localDefinitions: [],
    scheduledTasks: []
  },
  mappings: []
};
const result = {
  base: 'hash',
  changes: [],
  issues: [],
  references: [],
  recompiled: 0,
  previousVersions: [],
  ignoredGeneratedFiles: [],
  totalBytes: 0
};
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: {
    data: unknown;
  }) => void;
  onerror?: (event: {
    preventDefault(): void;
  }) => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('migration worker lifecycle', () => {
  it('returns a complete plan and terminates its worker', async () => {
    const pending = previewScriptProjectMigration(job),
      worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(job);
    worker.onmessage!({
      data: {
        result
      }
    });
    expect(await pending).toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels without accepting a late result', async () => {
    const abort = new AbortController(),
      pending = previewScriptProjectMigration(job, abort.signal),
      check = expect(pending).rejects.toThrow('annullato'),
      worker = FakeWorker.instances[0];
    abort.abort();
    worker.onmessage!({
      data: {
        result
      }
    });
    await check;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not start work for an already cancelled request', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(previewScriptProjectMigration(job, abort.signal)).rejects.toThrow('annullato');
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('bounds compiler and parser work to 15 seconds', async () => {
    const pending = previewScriptProjectMigration(job),
      check = expect(pending).rejects.toThrow('15 secondi');
    await vi.advanceTimersByTimeAsync(15000);
    await check;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it.each([{
    error: 'Contesto non disponibile'
  }, {
    result: {
      base: 'bad'
    }
  }, null])('rejects invalid/failed worker responses and releases resources: %j', async data => {
    const pending = previewScriptProjectMigration(job),
      check = expect(pending).rejects.toThrow();
    FakeWorker.instances[0].onmessage!({
      data
    });
    await check;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles parsing/transfer failures without leaking source data or a running worker', async () => {
    const pending = previewScriptProjectMigration(job),
      check = expect(pending).rejects.toThrow('interrotto'),
      event = {
        preventDefault: vi.fn()
      };
    FakeWorker.instances[0].onerror!(event);
    await check;
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it('handles message decoding failures', async () => {
    const pending = previewScriptProjectMigration(job),
      check = expect(pending).rejects.toThrow('non è leggibile');
    FakeWorker.instances[0].onmessageerror!();
    await check;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});
