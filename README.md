# Framecraft

A Tauri-based visual editor for existing React + TypeScript + Vite projects. The first vertical slice uses a real project preview and AST-aware, localized source edits.

## Implemented capabilities

- Open and analyze an existing React/Vite folder, or scaffold a clean Vite project.
- Run the project's own Vite server with editor-only in-memory DOM instrumentation.
- Map a rendered intrinsic DOM element back to its exact TSX file and source range.
- Explore real files and source-derived JSX layers.
- Edit static text inline or in the Inspector; update safe inline styles.
- Insert registered components, duplicate, delete and reorder sibling JSX elements.
- Undo/redo source operations, atomic saves and external file watching.
- Visual, code and split views; viewport switching, zoom and a normal interaction preview.

The editor also generates standalone React HMI panels, supports page navigation, multi-selection,
drag/resize/snap, z-index and rotation, PLC bindings and explicit simulation, trends/data logs,
faceplates and a bounded script interpreter. Mouse-drawn highlight regions are persisted in the
panel source. **Pannello → Connessioni PLC** configures the real Node MQTT service and same-origin
gateway; saving does not start a connection or send commands. OPC UA and optional AI remain planned.

See [ARCHITETTURA-HMI.md](ARCHITETTURA-HMI.md), [LAVORO.md](LAVORO.md), and the WinCC/Optix/AI roadmaps
for implemented behavior, verification and remaining work. These are autonomous React panels,
not projects for deployment inside Siemens or Rockwell proprietary runtimes.

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

## Draft recovery and diagnostics

The recovery screen identifies the project, page, backup date and unsaved status. Choose
**Recupera bozza e riprendi il lavoro** to restore the editor buffer, not to save files or start
the panel. If the disk version has changed, choose explicitly between the draft and the saved
page; the disk choice does not restore the draft's unsaved changes or history.
**Scarta bozza e torna ai progetti** removes the recovery copy and asks for confirmation when
it contains unsaved changes. It does not modify the saved project files.

**Codice della bozza (per assistenza)** is a read-only technical copy, not a graphical preview.
You do not need to open it to recover your work. The real preview reads saved files: save the
recovered draft explicitly before expecting its unsaved changes to appear in that preview.

Errors and warnings explain common problems and the next step, with the original diagnostic
text under **Dettagli tecnici (per assistenza)**. **Apri diagnostica** shows the searchable log;
consecutive identical messages are grouped without deleting the originals. Clearing the log
does not delete project files or drafts. Unknown errors remain available for assistance rather
than being assigned an unverified cause. Technical details may contain project data: review
them before sharing outside your organization.

## Public code and private reference data

The public repository deliberately excludes the real WinCC JSON exports in `standard/`, comparison
photos in `FotoStandardManu/`, local scratch tests, secrets and generated output. Do not upload them.
Source generation and the editor build do not require those exports. The example XLSX tag fixture
and synthetic test catalogs are test data, not a connection to a real machine.

`npm test` runs the public tests. If authorized local exports are present at `standard/index.json`
and `standard/screens/`, it also runs the reference tests against that actual standard. Without
them it explicitly reports the excluded reference test files; this is not a claim of verified
fidelity to WinCC. `npm run test:standard` requires those exports and fails clearly when absent.
Never create fake reference JSON merely to satisfy that test suite.

Additional checks: `npm run test:gateway` uses a real isolated local MQTT broker/HTTP gateway;
`npm run test:production` checks the bundled standalone generator; `cargo test --offline` in
`src-tauri` checks native lifecycle/recovery/configuration persistence. They do not prove CPU/TLS
interoperability or approval for industrial use.

## Production status

This checkpoint is not an industrial release. Authentication/RBAC and durable server audit/storage,
OPC UA, async script transport and real CPU/TLS testing remain open. The license audit is offline,
adds no new dependency for the connection dialog, and intentionally does not approve release while
reviews/notices remain outstanding. See [LICENZE-E-PRODUZIONE.md](LICENZE-E-PRODUZIONE.md).

“Pubblica pannello” is a proposal for a future guided delivery workflow. Installer/executable formats,
deployment targets and automatic steps will be agreed with the user before implementation.
