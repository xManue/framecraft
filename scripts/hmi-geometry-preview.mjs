// Request only geometry from the active preview; never transmit DOM nodes or arbitrary code.
export function createHmiGeometryPreviewClient(view, endpoint, timeoutMs = 2000) {
  const pending = new Set();
  return {
    cancel() {
      for (const cancel of [...pending]) cancel();
    },
    measure(itemId, signal) {
      const page = endpoint();
      if (!page || !page.origin || page.origin === "null" || signal?.aborted) return Promise.reject(new Error("Anteprima non pronta per misurare l'oggetto. Riprova sulla pagina attiva."));
      if (typeof itemId !== "string" || !itemId || itemId.length > 128 || pending.size >= 32) return Promise.reject(new Error("Richiesta di misura non valida o troppe misure in attesa."));
      return new Promise((resolve, reject) => {
        const requestId = view.crypto.randomUUID();
        let timer;
        const finish = (box, error) => {
          view.clearTimeout(timer);
          view.removeEventListener("message", receive);
          signal?.removeEventListener("abort", cancel);
          pending.delete(cancel);
          if (error) reject(new Error(error));else resolve(box);
        };
        const cancel = () => finish(undefined, "Misura annullata: la pagina e' cambiata o l'operazione e' stata interrotta.");
        const receive = event => {
          const data = event.data;
          if (event.source !== page.window || event.origin !== page.origin || data?.type !== "framecraft:geometry-result" || data.requestId !== requestId || data.pageId !== page.pageId) return;
          const current = endpoint();
          if (!current || current.window !== page.window || current.origin !== page.origin || current.pageId !== page.pageId) return cancel();
          if (typeof data.error === "string") return finish(undefined, data.error.slice(0, 500));
          const box = data.box;
          if (box !== null && (!box || ["Left", "Top", "Width", "Height"].some(key => typeof box[key] !== "number" || !Number.isFinite(box[key])) || box.Width < 0 || box.Height < 0)) return finish(undefined, "L'anteprima ha restituito una misura non valida.");
          finish(box === null ? null : {
            Left: box.Left,
            Top: box.Top,
            Width: box.Width,
            Height: box.Height
          });
        };
        pending.add(cancel);
        view.addEventListener("message", receive);
        signal?.addEventListener("abort", cancel, {
          once: true
        });
        timer = view.setTimeout(() => finish(undefined, "L'anteprima non ha risposto alla misura. Attendi che la pagina sia pronta e riprova."), timeoutMs);
        try {
          page.window.postMessage({
            type: "framecraft:geometry-query",
            pageId: page.pageId,
            requestId,
            itemId
          }, page.origin);
        } catch {
          finish(undefined, "Impossibile raggiungere l'anteprima per misurare l'oggetto.");
        }
      });
    }
  };
}

// This function is embedded verbatim in the project preview by the Vite bridge.
export function installHmiGeometryPreviewEndpoint(view, surface, context) {
  const receive = event => {
    const page = context(),
      data = event.data;
    if (view.parent === view || event.source !== view.parent || !page?.origin || page.origin === "null" || event.origin !== page.origin || data?.type !== "framecraft:geometry-query" || data.pageId !== page.pageId) return;
    if (typeof data.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.requestId) || typeof data.itemId !== "string" || !data.itemId || data.itemId.length > 128) return;
    let box, error;
    try {
      const item = surface.items().find(item => item.itemId === data.itemId);
      if (!item) throw new Error("L'oggetto da misurare non e' piu' presente nella pagina.");
      if (!Object.hasOwn(item, "boundingBox")) throw new Error("Aggiorna i componenti dell'anteprima per misurare gli oggetti.");
      box = item.boundingBox;
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 500) : "Misura dell'oggetto non disponibile.";
    }
    view.parent.postMessage({
      type: "framecraft:geometry-result",
      pageId: page.pageId,
      requestId: data.requestId,
      ...(error ? {
        error
      } : {
        box
      })
    }, event.origin);
  };
  view.addEventListener("message", receive);
  return () => view.removeEventListener("message", receive);
}
