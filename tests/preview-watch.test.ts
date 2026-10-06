import { describe, expect, it } from "vitest";
// @ts-expect-error the preview plugin is plain ESM, also shipped to imported projects.
import framecraftPlugin, { previewWatchConfig } from "../scripts/framecraft-vite-plugin.mjs";

describe("preview watcher on Windows", () => {
  it("avoids native file handles even when the project defaults to event watching", () => {
    expect(previewWatchConfig({ watch: { usePolling: false } }, "win32")).toEqual({ server: {
      watch: { usePolling: true, interval: 100, binaryInterval: 300 },
    } });
  });

  it("retains custom intervals and does not replace other project watch settings", () => {
    const server = { watch: { interval: 200, binaryInterval: 500, ignored: ["**/archive/**"], awaitWriteFinish: true } };
    expect(previewWatchConfig(server, "win32")).toEqual({ server: {
      watch: { usePolling: true, interval: 200, binaryInterval: 500 },
    } });
    expect(server.watch.ignored).toEqual(["**/archive/**"]);
  });

  it("respects an explicitly disabled watcher and leaves other operating systems alone", () => {
    expect(previewWatchConfig({ watch: null }, "win32")).toBeUndefined();
    expect(previewWatchConfig(undefined, "linux")).toBeUndefined();
    expect(previewWatchConfig(undefined, "darwin")).toBeUndefined();
  });

  it("does not modify production builds", () => {
    expect(framecraftPlugin().config({}, { command: "build" })).toBeUndefined();
    expect(framecraftPlugin().config({}, { command: "serve" })).toEqual(previewWatchConfig(undefined));
  });
});
