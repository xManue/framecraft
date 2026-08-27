# Framecraft

A Tauri-based visual editor for existing React + TypeScript + Vite projects. The first vertical slice uses a real project preview and AST-aware, localized source edits.

## Implemented vertical slice

- Open and analyze an existing React/Vite folder, or scaffold a clean Vite project.
- Run the project's own Vite server with editor-only in-memory DOM instrumentation.
- Map a rendered intrinsic DOM element back to its exact TSX file and source range.
- Explore real files and source-derived JSX layers.
- Edit static text inline or in the Inspector; update safe inline styles.
- Insert registered components, duplicate, delete and reorder sibling JSX elements.
- Undo/redo source operations, atomic saves and external file watching.
- Visual, code and split views; viewport switching, zoom and a normal interaction preview.

Dynamic JSX and non-static styles remain selectable but read-only. Router synchronization, CSS-class transforms, resize handles, multi-select and Monaco are explicitly deferred rather than simulated.

## Run

```bash
npm install
npm run dev
```

`npm run dev` launches the native Tauri window. Do not open `localhost:1420` manually: it is only the internal development frontend used by the desktop host.

To work on the web shell alone, without local filesystem access, use:

```bash
npm run web:dev
```

Run `npm test` for parser and transformation fixtures, and `npm run build` for the editor production build.
