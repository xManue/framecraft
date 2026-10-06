import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import { join, resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { expect, it, vi } from "vitest";
// @ts-expect-error the project preview plugin is shipped as plain JavaScript.
import framecraftPlugin, { previewWatchConfig } from "../scripts/framecraft-vite-plugin.mjs";

it("imports and replaces public images without acquiring a busy native watch handle", async () => {
  const fixtures = resolve(".hmi-preview");
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(join(fixtures, "watch-"));
  const directory = join(root, "public", "framecraft-assets");
  const first = join(directory, "image.png");
  const second = join(directory, "image-2.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6a8AAAAASUVORK5CYII=", "base64");
  let server: ViteDevServer | undefined;
  let watcherReady = false;
  const watch = vi.spyOn(fs, "watch").mockImplementation(() => {
    throw Object.assign(new Error("EBUSY: resource busy or locked, watch 'image-2.png'"), { code: "EBUSY", syscall: "watch", path: second });
  });
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(root, "index.html"), '<!doctype html><img src="/framecraft-assets/image.png">');
    await writeFile(first, png);

    server = await createServer({ configFile: false, root, logLevel: "silent", plugins: [framecraftPlugin(), {
      name: "fixture-watch-ready", configureServer(value) { value.watcher.once("ready", () => { watcherReady = true; }); },
    }],
      server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root] }, ...previewWatchConfig(undefined, "win32").server } });
    const protectedErrors: Error[] = [];
    const added: string[] = [];
    server.watcher.on("error", (error) => protectedErrors.push(error));
    server.watcher.on("add", (path) => added.push(path));
    await server.listen();
    await vi.waitFor(() => expect(watcherReady).toBe(true), { timeout: 5000 });
    await vi.waitFor(() => expect(Object.values(server!.watcher.getWatched()).some((files) => files.includes("image.png"))).toBe(true));
    expect((server.watcher as unknown as { options: { usePolling: boolean } }).options.usePolling).toBe(true);
    const url = `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`;
    await writeFile(second, png);
    await vi.waitFor(() => expect(added, JSON.stringify({ publicDir: server!.config.publicDir, watched: server!.watcher.getWatched() })).toContain(second), { timeout: 3000 });
    await vi.waitFor(async () => {
      const response = await fetch(url + "/framecraft-assets/image-2.png");
      expect(response.status, `Image response: ${await response.clone().text()}`).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    });
    await writeFile(second, Buffer.concat([png, Buffer.from("replacement")]));
    await vi.waitFor(async () => {
      const response = await fetch(url + "/framecraft-assets/image-2.png");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile(second));
    });
    expect(await fetch(url).then((response) => response.status)).toBe(200);
    expect(protectedErrors).toEqual([]);
    expect(watch).not.toHaveBeenCalled();
  } finally {
    await server?.close(); watch.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
