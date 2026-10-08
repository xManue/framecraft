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
panel source. **Pannello → Connessioni PLC** configures the real Node MQTT/OPC UA scalar service and same-origin
gateway; saving does not start a connection or send commands. OPC UA scalar mappings are supported; browsing/arrays/methods and optional AI remain planned.

See [ARCHITETTURA-HMI.md](ARCHITETTURA-HMI.md), [LAVORO.md](LAVORO.md), and the WinCC/Optix/AI roadmaps
for implemented behavior, verification and remaining work. These are autonomous React panels,
not projects for deployment inside Siemens or Rockwell proprietary runtimes.

## Editing an element

Click an element in **Modifica** and use the right-hand property tabs: **Aspetto** for text,
images, size, colors, layers and rotation; **Azioni** for clicks, highlighted regions, access
and events; **PLC e dati** for bindings, dynamics, list imports, faceplates and trends;
**Altro** for CSS, attributes and code. These are task groups, not simple/advanced modes.

In **Azioni → Cosa fa**, start with **Abilita reazioni**. Switching reactions off keeps the
configured actions but blocks their execution. Each action has **Quando** (click, double click,
press/release and the events supported by the object) and **Cosa succede**. Guided actions open
a project page, show/hide or enable/disable a named screen item, or write a diagnostic message;
custom scripts remain available. **Accesso utente** and **Evidenzia una parte** appear only with
reactions enabled, and their event can also be chosen. Double-click is a Framecraft extension;
when both single and double click are configured, the browser runs the single clicks first.
Double touch depends on browser/device support for `dblclick`.

**Chi vede e usa l’elemento** provides separate permissions for visibility and use. Assign
permissions to accounts in the account window, then choose them on the element. Visibility
also applies to passive elements. Editing keeps protected elements visible/selectable; runtime
updates rules on login, logout and navigation without re-enabling a disabled machine control.
These browser/local-PIN rules are UI restrictions, not server-side authentication or PLC RBAC.
Do not use them as the security boundary for real machine commands.

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

## Updating a faceplate instance

In **Modifica → PLC e dati → Istanza faceplate**, select another released type/version.
A comparison window opens before any source edit: review the interface and visual changes,
choose which old fields to map to the new ones, and click **Applica all’istanza**.
Compatible same-name tags, values and event scripts are retained automatically. Renamed fields
can be mapped explicitly; event scripts require the same parameter names and types. Missing
required tags and incompatible values block the update. Removing or replacing configured data
requires a separate confirmation that lists what will be discarded.

**Solo questa** updates one identified copy inside a repeated list. **Tutte** updates the
shared template only when its faceplate configuration is static; copies with separate
configurations must be reviewed individually. Changing page, selection, edit scope or catalog
invalidates an open comparison. **Annulla (Ctrl+Z)** restores the previous source configuration.
Container position/size are unchanged. Runtime local state is recreated for the new version;
live PLC values are not migrated, and this command does not connect to or write a PLC.
Project-wide and nested-instance bulk migrations remain planned.

## One field, different PLC signals

In **Modifica → PLC e dati → Dinamica PLC**, choose a tag source and enable
**Il tag sceglie un altro segnale**. Select a declared **WSTRING** selector and the
expected destination type. For example, `SelectedMotor = "Motor1.Temperature"`
makes the field read the declared `Motor1.Temperature` signal. Another field can
read `SelectedMotor` directly to display the selected name. This follows the
[Unified tag-selector workflow](https://docs.tia.siemens.cloud/r/en-us/v20/configuring-tags-rt-unified/configuring-tags-rt-unified/addressing-tags-indirectly-rt-unified).

In **PLC → Valori di prova**, enter the destination name in the selector, then
enter the destination value in the field that appears. The Inspector shows the
resolved name/value or an actionable reason. The same resolver and conversions
are included in new standalone panels and react to selector, destination and
quality updates through the MQTT/OPC UA gateway.

Only declared, readable, uniquely named, type-compatible destinations are accepted.
Real gateway readings require known Good quality for both tags. Invalid references
show **—** for text/process values (empty numeric inputs), restore static styles and disable dynamically
controlled visibility/interaction. References are resolved once; self-references
are rejected and text destinations are not recursively dereferenced. This is a
read-only property binding; IO inputs are made read-only and their original state
is restored when the local preview ends. This is not indirect PLC writing or server authorization.
Indirect screen-object/system-function parameters and PLC input transfers remain planned.
Old generated panels are not automatically rewritten.

## Configure and test alarms

Open **Pannello → Allarmi**. In the large dialog, add an alarm, choose a declared
readable PLC signal and set its message, class, area and priority. A Bool uses bit 0;
integer signals support a selected bit, including exact 64-bit decimal strings.
Analog alarms currently support above/below a fixed threshold with return hysteresis.
Empty signals, duplicate bits/IDs, incompatible types and oversized histories block saving.

Use **Prova locale** to apply values and Good/Bad/unknown quality without opening a
PLC connection. **Prendi in visione** records that the operator has seen the alarm;
it does not clear an active fault or write a PLC signal. A class can require no
acknowledgment, acknowledgment, or acknowledgment plus confirmation after return.
This follows the [Unified state/acknowledgment model](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-alarms-rt-unified/basics-rt-unified/acknowledgment-model-rt-unified).

**Salva allarmi** writes `framecraft.alarms.json` using the native project/session
guard and checks both the existing alarm file and PLC catalog before replacement.
Invalid JSON is not silently replaced. The new desktop commands require the updated
native app; this change does not restart a running app. New standard projects include
the empty catalog, shared engine and live control. Old projects are not auto-migrated.

With a configured gateway, acquisition runs in the Node service, shared by every
browser, independently of the displayed page. Loss of signal quality preserves the
last alarm condition and shows a warning; it never means the fault has cleared.
Real acknowledgment is disabled unless a trusted server authorization hook is
configured. Local PINs/roles and the gateway proxy token are not operator identities.
See [runtime/README.md](runtime/README.md#allarmi-nel-servizio-condiviso).

History is a bounded **service-session history**, not a persistent industrial archive.
Server RBAC/audit, restart recovery, shelving, batch acknowledgment, multilingual texts,
controller alarm events and commissioning remain open. No new npm dependencies.

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

New **desktop + mobile** standard panels open with a **Desktop / Mobile** choice
page inside the HMI itself, not in the editor. With no choice saved in the current
browser tab, select a device before entering the operating pages. Deep links keep
their requested page after selection. This screen selects a layout, not a login
or a PLC interlock; existing machine projects are not rewritten.

Use **Cambia dispositivo** to return to the initial page and choose another layout.
It is visible at the top right on Desktop and beside the section strip on Mobile,
even when the strip scrolls. There is no bottom-right layout selector or automatic
layout change on resize: Desktop/Mobile stays selected across page changes and
reloads in the same browser tab. Returning clears this project's layout preference
until a device is chosen again, preserves the requested page, and focuses the choices.
An old saved Automatico preference asks for an explicit choice in the new shell.
The editor's compatibility helper still remembers selectors on already-created
panels without rewriting their files. Header, configured user access,
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

`npm run test:public` explicitly excludes the private reference tests even when local exports
exist. Use it for public CI or append the affected test paths for normal changes; do not run
every suite after each edit. The one-off Vitest migration check and its targeted reruns are
recorded in `LAVORO.md` (checkpoint 103).

The runner is pinned to Vitest 5.0.3. Use Node 24 LTS (verified with 24.19.0); the manifest
declares the compatible Node ranges. All test configurations leave the test API disabled,
retain the previous mock-clearing behavior and preserve per-file isolation. Unit tests use
at most two workers; process/build integrations use one. Transformed-module cache is local
to ignored `.hmi-preview/vitest-cache/`. Node installed globally is not changed by these checks.

Additional checks: `npm run test:gateway` uses isolated local MQTT TCP/TLS brokers, controlled
MQTT 5 peers, HTTP gateways and generated-service processes. OpenSSL creates ephemeral CA,
server and client certificates for TLS/mTLS faults; no system trust store is changed.
The gateway checks also use an isolated OPC UA server with temporary trust and certificates.
`npm run test:production` checks the bundled standalone generator and real Vite image watching;
`npm run test:recovery` checks the compiled editor's reload recovery without restarting the app;
`cargo test --offline` in
`src-tauri` checks native lifecycle/recovery/configuration persistence. These checks do not
prove interoperability with a real machine or its broker/trust, or approval for industrial use.

## Production status

This checkpoint is not an industrial release. Authentication/RBAC and durable server audit/storage,
OPC UA browsing/arrays/methods, PLC application acknowledgements, advanced payloads and real CPU/TLS testing remain open.
Compiled scripts, modules, timers and Scheduler now await MQTT/OPC UA transport without optimistic tag
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
