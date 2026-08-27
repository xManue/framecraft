# Framecraft architecture

## Milestone 1

Framecraft opens or creates a React + TypeScript + Vite project, runs the real app in an iframe, instruments rendered DOM nodes in memory, maps a click back to a JSX source range, and applies small AST-validated source edits. The imported project remains independently runnable.

## ADR-001: Tauri host with an AST-aware TypeScript editing core

**Status:** Accepted  
**Date:** 2026-08-24

### Context

The editor needs local filesystem, process and file-watch access. It must preserve hand-written React source while keeping visual and code views synchronized. Browser-only file APIs cannot reliably execute arbitrary project toolchains or watch trees.

### Decision

- Use Tauri 2 for the desktop boundary and React/Vite for the editor UI.
- Keep filesystem, process execution and watching behind a typed `DesktopBridge`.
- Parse TSX with Babel. Use AST node positions plus `MagicString` for minimal patches; never regex-rewrite a component.
- Start a project's own Vite app with an editor-only config under `.framecraft/`. A separate plugin adds source identifiers to intrinsic JSX nodes in memory and injects the selection bridge into served HTML.
- Treat dynamic expressions and unsupported syntax as visible but read-only. Each `EditorNode` exposes an editability capability instead of pretending all JSX is safe.

### Options considered

1. **Tauri** — small distributable, explicit native permissions, Rust process lifecycle. Requires a Rust bridge and more setup than a browser app.
2. **Electron** — mature Node APIs and easier process orchestration, but a larger attack surface and package footprint.
3. **Browser-only** — simplest deployment, but cannot meet the local project execution and watching requirements consistently.

### Consequences

- Preview instrumentation does not alter user source files.
- Source edits are narrow and reviewable, but complex expressions remain code-only until a safe transform is implemented.
- The browser build supports a clearly labeled demo workspace; local project operations require the Tauri host.

## Module boundaries

- `project-manager/`: project lifecycle and detection.
- `filesystem/`: typed native bridge only.
- `source-parser/`: source-to-document parsing and safe source edits.
- `preview/`: instrumented Vite session and postMessage protocol.
- `canvas/`: viewport, overlays and visual selection.
- `components/`: registry and palette.
- `inspector/`: capability-aware property editing.
- `history/`: reversible source snapshots.
- `state/`: editor orchestration; no filesystem calls.
- `editor/`: shell, panels, commands and shortcuts.

## Data flow

```text
React source -> Babel AST -> EditorDocument -> layers / inspector
      ^                                          |
      |                                          v
atomic localized patch <- EditorOperation <- canvas selection

Vite in-memory instrumentation -> DOM data-fc-source -> postMessage -> selection
```

## Safe editing rules

Text is editable only for a JSX element with one static `JSXText` child. Style is editable when `style` is absent or an object literal containing only static properties. Insert/delete/reorder require a stable parent/source range. Failed validation leaves the file unchanged and opens the code path instead.

## Next milestones

Routing synchronization, CSS-module/Tailwind-specific transforms, multi-select, flex/grid drag semantics, Monaco, asset manager and plugin packages follow after this vertical slice is hardened with fixture coverage.
