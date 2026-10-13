import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface PreviewFullscreenSession {
  ready: Promise<void>;
  release: () => Promise<void>;
}

export interface PreviewFullscreenBackend {
  isFullscreen: () => boolean | Promise<boolean>;
  enter: () => void | Promise<void>;
  exit: () => void | Promise<void>;
}

export function createPreviewFullscreenController(backend: PreviewFullscreenBackend) {
  let tail: Promise<void> | undefined;
  const run = (operation: () => void | Promise<void>) => {
    let task: Promise<void>;
    try { task = tail ? tail.then(operation) : Promise.resolve(operation()); }
    catch (error) { task = Promise.reject(error); }
    const settled = task.catch(() => {});
    tail = settled;
    void settled.then(() => { if (tail === settled) tail = undefined; });
    return task;
  };
  return {
    begin(): PreviewFullscreenSession {
      let cancelled = false, owned = false, released: Promise<void> | undefined;
      const enter = async (alreadyFullscreen: boolean) => {
        if (cancelled || alreadyFullscreen) return;
        await backend.enter();
        owned = true;
      };
      const ready = run(() => {
        const existing = backend.isFullscreen();
        // The browser request must start in the click handler, before yielding user activation.
        return typeof existing === "boolean" ? enter(existing) : existing.then(enter);
      });
      return {
        ready,
        release() {
          cancelled = true;
          return released ??= run(async () => {
            if (!owned) return;
            await backend.exit();
            owned = false;
          });
        },
      };
    },
  };
}

export function previewFullscreenController(doc: Document = document) {
  if (isTauri()) {
    const view = getCurrentWindow();
    return createPreviewFullscreenController({
      isFullscreen: () => view.isFullscreen(),
      enter: () => view.setFullscreen(true),
      exit: () => view.setFullscreen(false),
    });
  }
  return createPreviewFullscreenController({
    isFullscreen: () => !!doc.fullscreenElement,
    enter: () => {
      if (!doc.documentElement.requestFullscreen) throw new Error("Schermo intero non supportato dal browser.");
      return doc.documentElement.requestFullscreen();
    },
    exit: () => doc.fullscreenElement === doc.documentElement ? doc.exitFullscreen() : undefined,
  });
}
