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

## Editing an element

Click an element in **Modifica** and use the right-hand property tabs: **Aspetto** for text,
images, size, colors, layers and rotation; **Azioni** for clicks, highlighted regions, access
and events; **PLC e dati** for bindings, dynamics, list imports, faceplates and trends;
**Altro** for CSS, attributes and code. These are task groups, not simple/advanced modes.

Text labels from lists edit the selected data row through a single **Testo** field, preserving
the JSX/data link. The label comes first; other row properties are under **Altri dati dell’elemento**.
Use **Applica testo** to apply the draft or **Annulla** to restore the current text. A visible
message distinguishes applying, applied, rejected, and a draft whose file could not be saved.
Cancel also works by keyboard without focus loss applying the discarded text. Clearing a
label does not remove its text field: you can write a new label into the empty element.
When inline editing is unavailable, double-clicking requests that text field
without opening every technical section. Common property fields apply on Enter or focus loss;
multiline text also accepts Ctrl+Enter.
Escape cancels pending edits in the common text/style/geometry fields and binding inputs;
color pickers and choices apply immediately. Existing percent/rem units are retained.
Translations are expandable, and open initially when the element has a multilingual key.
For repeated elements, **Solo questa / Tutte** controls source edits such as styles and deletion;
the visible list-row text/data fields always edit the selected row. A shared data file changes
that row in every panel that uses it, as the property sheet warns.

The active property tab and scroll position survive the selected element's own style edits;
selecting another element returns to **Aspetto**. Group/external-element sheets and the
faceplate type mini-editor retain their existing layouts. Local preview changes and saving
the project are separate from publishing or commanding a PLC.

## Pages and categories

Use **Pagine → Nuova pagina** for the full-size creation window: choose a name,
route, category and page template. Similar empty Main bases are grouped with an
explicit variant selector; original standard variants remain available. Template
icons represent the contents rather than repeating the same miniature.

On a standard panel, **Nuova categoria** adds a real navigation category. Add its
first page to make it navigable. New pages are registered in the router, section
menu and numeric screen lookup, not just the editor list. Standard sections keep
their original numbers; custom categories use 10–99 and leave 9 to popups.
**Aggiungi elementi** contains reusable components, not the project's page exports.

New **desktop + mobile** standard panels offer **Automatico**, **Desktop** and
**Mobile** in the layout selector. Automatic mode follows viewport changes,
including orientation, and switches to mobile below the desktop shell's 1280 px.
Manual mode stays selected while navigating. Header, configured user access,
scrolling section navigation and menus remain available on small screens.
The machine drawing keeps its coordinates: pan at **Dimensioni reali**, or choose
**Adatta disegno**, calculated from the actual content area and page width.
Fit also reduces drawing controls: use natural size for larger operating targets;
44 px shell/menu controls do not make every scaled machine control touch-sized.
This generator change does not overwrite or delete existing machine projects.
Browser layout checks are not physical-device or live-PLC commissioning.

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

## Files, workspace and local test values

**File** opens JS/JSX/TS/TSX sources beside the graphical page; **Torna alla grafica** returns
to the visual editor. CSS, JSON, Markdown and other supported text files are read-only viewers,
not extra code editors. Images open through the active local preview, without decoding them as
text. Unsupported formats and read errors are explained. Closing a viewer restores focus to
the file list; inspecting a file does not replace or save the current page's draft.

**Visualizza → Disposizione dei pannelli** describes three arrangements: graphics/components,
variables/dynamics, and files/code. They change only side panels and widths, not available
features or the page. Resized or different panels are identified as a custom arrangement.

**Valori di prova · locale** supplies manually entered values to HMI graphics, events and
trends. It does not execute a PLC program, acquire real PLC values or command the machine.

On Windows, the editor's project preview watches files by polling to avoid a native `EBUSY`
watch failure while an image is being copied. Source and binary checks default to 100/300 ms;
polling can use more CPU on large projects. This does not change the project's saved Vite
configuration or production build. A stopped preview needs **Visualizza → Riprova anteprima**
to load the updated plugin; this preserves the editor draft but does not save its changes.

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

Additional checks: `npm run test:gateway` uses isolated local MQTT TCP/TLS brokers, controlled
MQTT 5 peers, HTTP gateways and generated-service processes. OpenSSL creates ephemeral CA,
server and client certificates for TLS/mTLS faults; no system trust store is changed.
`npm run test:production` checks the bundled standalone generator and real Vite image watching;
`cargo test --offline` in
`src-tauri` checks native lifecycle/recovery/configuration persistence. These checks do not
prove interoperability with a real machine or its broker/trust, or approval for industrial use.

## Production status

This checkpoint is not an industrial release. Authentication/RBAC and durable server audit/storage,
OPC UA, PLC application acknowledgements, advanced payloads and real CPU/TLS testing remain open.
Compiled scripts, modules, timers and Scheduler now await MQTT transport without optimistic tag
updates or replay; broker receipts are not PLC acknowledgements. See [runtime/README.md](runtime/README.md).
MQTT attempts, including reconnect/subscription, are bounded. Credentials, certificate,
mapping, stale-data and command errors include their impact and how to resolve them.
**Pannello → Connessioni PLC → Guida rapida** contains the short user guide; generated panels
also expose diagnostics from the top PLC status. Rotating local logs never store secrets or
command values; their limits and incomplete-log warnings are documented in the runtime guide.
The license audit is offline,
adds no new dependency for the connection dialog, and intentionally does not approve release while
reviews/notices remain outstanding. See [LICENZE-E-PRODUZIONE.md](LICENZE-E-PRODUZIONE.md).

“Pubblica pannello” is a proposal for a future guided delivery workflow. Installer/executable formats,
deployment targets and automatic steps will be agreed with the user before implementation.
