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

## Editor settings and keyboard shortcuts

Open **File → Impostazioni dell’editor**, or **Impostazioni** on the welcome screen.
**AI e account** contains ChatGPT connection/logout, saved-account verification and model selection;
opening it does not start login or inference. **Area di lavoro** contains panel layouts,
interface size, smart guides and grid spacing; these preferences apply immediately
without changing the HMI source. **Scorciatoie e comandi** lets you search 25 commands,
click a combination and press replacement keys. Each command accepts up to three
combinations. Remove all combinations to disable its shortcut; save to apply the draft.
Resetting defaults changes the draft, not the saved preferences until you save.

The editor keeps preferences locally across projects. **Aiuto e suggerimenti** lets you disable the one-time
visual editing hint or explicitly replay it once. **Apri guida rapida** opens the same
guide as the Help menu, including MQTT/OPC UA setup, diagnostics and safety limits.
Errors and safety notices cannot be hidden through this preference. Free snapping
(grid step 0) is retained after reopening the app.

Menus and **Comandi rapidi** display the saved keys. **Ctrl+K** opens command search; arrows select a command and
Enter executes it. The same bindings work inside the preview canvas and after changing
pages. Duplicate bindings and common system/text-editing shortcuts are rejected.
Undo/delete/duplicate are restricted to Modifica, and text fields retain their native
editing keys. Global save and command search remain available while typing.
These are editor commands, not HMI scripts or PLC command macros. Shift/Alt drag gestures
and arrow nudges remain fixed. Native keyboard/layout and packaged-app validation remain
separate from the automated checks.

## Trying a faceplate on the page

See also **Trying trend controls** below for local process/history plots.

Configure its type/version and bindings in **PLC e dati → Istanza faceplate**, then
choose **Usa il pannello**. Its configured graphics render inside the project iframe,
including nested instances and project-relative images. **PLC → Prova locale** supplies
manual tag values; no PLC connection is started. The preview tooltip identifies this
local test. **Modifica** restores the editable JSX content and original style.

Interface events and their timer callbacks keep local tag values separate for each
instance. Page/project changes cancel old contexts. Updating a popup's geometry or
interface keeps its container; bound popups close on a page change. These checks do not
replace server authorization or machine commissioning.

## Trying trend controls

Configure a Trend Control or Function Trend in **PLC e dati**, then choose **Usa il
pannello**. Supply manual values in **PLC → Prova locale**. Time plots and X/Y plots
render inside the project iframe; their local-test note distinguishes them from a PLC
connection. Toolbar pause, zoom, area zoom, ruler and source choices use the shared
Runtime renderer. **Modifica** restores the original editable content.

For historical curves, choose a declared Data Log and logged variable. The preview queries
the editor's local archive on demand, preserving timestamps and quality rather than
inventing samples. A stalled query shows a remedy; **Vista originale** explicitly retries.
Source changes belong to the current preview session, not the project configuration.
Time trends offer **Fuso orario del grafico** and aggregation in the Inspector and
Runtime toolbar. Device time, UTC and IANA zones include the UTC offset, so repeated
daylight-saving hours remain distinguishable. Invalid zones show a remedy and fall
back explicitly to UTC; CSV timestamps remain ISO UTC.

When samples outnumber available CSS pixels, **Media temporale a gradini** weighs
each held value by its duration, including one predecessor at the left boundary when
available. It does not invent coverage before the first known value. **Conserva picchi
(min/max)** keeps the first/last/min/max valid values per pixel; pixels containing Bad
are represented as invalid instead of connecting through them. The worst quality is
retained, including unknown quality. **Tutti i campioni** disables display aggregation
and can be slower. The graph reports original/displayed counts; the ruler and CSV
retain the original samples, not aggregated display points. This applies to numeric
time trends, not X/Y paths. Numeric vendor time-zone IDs and the full control object
model remain outside this tranche; device timezone data/native load require commissioning.

**CSV** prepares the displayed data in the editor window, not the sandboxed iframe;
the window/browser handles the download. This does not confirm a native file save or
machine commissioning. See **runtime/README.md** and **LICENZE-E-PRODUZIONE.md** for limits.

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

### Add an alarm indicator or alarm line

Choose **Aggiungi → HMI e PLC → Indicatore allarmi** or **Riga allarmi**, then open
the selected element's **PLC e dati** tab. Set its title, classes/areas (exact names,
comma-separated; empty means all), minimum priority and the alarm state to display.
The indicator separates active faults, pending acknowledgment and pending confirmation.
The line shows one to three messages, ordered by recency or global priority, with
activation time in local time or UTC. It is read-only unless you enable the separate detail view.

**Mostra allarmi** opens a filtered list; an optional linked page must exist in the
project. Viewing does not send PLC commands. Acknowledgment follows the existing server
authorization rules. Hidden/disabled elements cannot act through an already-open popup.
No catalog, unknown quality or a lost service is never shown as a healthy zero.
**Pannello → Allarmi → Prova locale** shows both controls alongside the test list,
without connecting to a PLC. Configuration is persisted in JSX and supports undo.
Invalid JSON or a code-computed configuration is never silently replaced.

To try the objects placed on an actual page, save the catalog in **Pannello → Allarmi**,
then open **PLC → Prova locale**, click **Attiva valori di prova**, enter the alarm tag's
value and choose **Usa il pannello** in the top bar. The indicator, line and alarm list
use the same local engine for that editor project. **Modifica** restores their editable
JSX content and closes details; **Ferma la prova locale** resets test history and
acknowledgments, without clearing any machine archive. Missing values remain unknown.
The preview is labelled **SIMULAZIONE · nessun PLC collegato** and does not connect to
MQTT/OPC UA. Unsaved edits inside the alarm configuration dialog do not alter this catalog.

New standard panels include both controllers; existing panels and machine templates
are not rewritten. The object model, complete vendor properties and physical touch/CPU
commissioning remain open. See the [runtime guide](runtime/README.md#indicatori-e-righe-allarme).

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

## Recipe data service

Generated panels include an empty `framecraft.recipes.json` and a Node recipe store with typed
schemas, create/update/copy/rename/delete, persistent operation receipts and content-revision
conflict checks. No sample machine values, automatic schema migrations or PLC writes are added.
Gateway recipe operations require a separate server-side identity/authorization callback; the
standard launcher deliberately denies access until that integration exists. A damaged recipe
store does not stop unrelated PLC monitoring. See [runtime configuration and recovery](runtime/README.md#ricette-archivio-dati-server-non-trasferimento-plc).

Use **Pannello → Ricette** to configure initial scalar schemas, fields and recipes without AI.
The dialog validates every value, supports copying/removing recipes and reviewing a Framecraft
JSON import, and saves only after an explicit click. Existing operational archives make the
initial configuration read-only: migration and backup are required, not archive deletion.
This is not a finished Runtime operator editor. Guided recipe pages remain structures;
Runtime forms, AI/wizard wiring, controller comparison/apply handshake, vendor
CSV/TSV compatibility, industrial database/backup and regulated audit still need implementation
or commissioning. File persistence and passing loopback tests do not establish production readiness.

## Guided AI project creation

Choose **Nuovo pannello → Con AI**. Framecraft asks for the machine/process, desktop/mobile,
the exact page count, each page’s name/function/category, and then only the relevant content
questions. A synoptic asks for the real machine-part screen and separate motor labels; alarms
ask for a real catalogue. Each image is required, optional or unwanted; missing assets/data can
be explicitly deferred and are listed in `framecraft.requirements.json` in the generated project.

The interview also covers twelve requirement areas with more than sixty targeted questions:
device/resolution/graphics/touch/mobile use; navigation/start page/popups/reusable objects;
PLC sources/quality/refresh/units/TLS; commands/modes/confirmations/interlocks/sequences;
alarms/history/acknowledgement; trends/sampling/retention; recipes/formats; production/maintenance;
users/roles/audit; languages/time/accessibility; reports/documents/integrations; and delivery,
offline behaviour, backup and acceptance tests. Each choice can be deferred. Optional areas
open only when requested or implied by a dedicated page; follow-up fields appear only for the
selected options. Choosing a capability does not silently add pages.

The start page and online trend time range/sample interval are applied to the generated project.
Other answers are local requirements, not a claim that the implementation is ready: changing
resolution/theme, server access controls, persistent retention, recipes, reports, external
services, executables and installers still need implementation/configuration and commissioning.
Recipe/production/maintenance/report page kinds create clearly labelled incomplete structures,
not operational controls or fake data. Conflicting monitoring/write-command or role/login choices
are rejected. The final review allows editing each requirement area without losing answers.
Technical text answers stay in `framecraft.requirements.json`; Codex receives validated choices
and whether details were supplied, not those details. Do not enter passwords, tokens or PINs.
Document/recipe file availability is recorded; PDF/CSV/database contents are not imported by
these new requirement fields. Real image, tag and alarm imports retain their existing flow.

Every standard page template and guided base carries a versioned behaviour contract: purpose,
known behaviour, machine-specific inputs, implementation status, limitations and actual defaults.
The catalogue and interview display the same contract; visual verification is not functional
commissioning. Empty bases remain explicitly structure-only, and web statistics templates depend
on external services rather than calculating KPI themselves.

AI creation receives only the selected contracts, deduplicated and referenced by each page.
Its instructions do not ask users to re-explain known template behaviour or confirm inherited
defaults. Resolution/style/category navigation and, where relevant, online trend timing/source
and session history are inherited from the implemented bases. Use **Personalizza** to change a
known choice or **Usa impostazione del template** to restore inheritance; explicit answers and
deferrals always win. Local technical details and real PLC mappings are never invented or replaced.
Unknown machine inputs still need user answers/imports or explicit deferral.

New projects save `framecraft.templates.json` with the bundled base contracts. Generated page
roots declare `data-hmi-template-id` and `data-hmi-template-version`; edit assistance resolves
the selected element's known ancestor contract without sending source or local paths. Unknown
IDs/versions and older pages without markers do not get an invented contract. These contracts
describe the original base, not a certification of later code changes. Version contracts when
changing their functional meaning; no metadata enables PLC writes, safety, services or deployment.

Tag inputs: Framecraft JSON or CSV with Name/DataType (or Nome/Tipo) and optional Address/Description,
up to 2 MB/5000 tags. Alarm inputs: `framecraft.alarms.json`, validated against imported readable
tags and their trigger types. A list of messages alone does not establish activation conditions.
Images are selected locally and copied into distinct assets for each page. No invented PLC data.

The optional `framecraft.resources.json` import adds existing translations to guided creation.
Choose a dictionary key explicitly for each page title and static label in overview, synoptic,
values or commands pages. Only keys containing the exact original text in a declared language
are offered; no key or translation is inferred. Invalid/stale choices block creation until corrected
or reset to the original text. Page titles also translate the visible navigation entry; routes,
page identifiers, PLC tags/values, permissions and command events remain unchanged.

The operator-language answer sets the generated Runtime locale, preferring an imported locale
of the same language when available. Review shows original/effective texts, unresolved choices
and fallback languages, with **Rivedi** returning to the corresponding page. This is not full
automatic HMI translation: unmapped text, curve names, alarms and system controls can remain
in their original language. Check translations and text fit before commissioning.

Import limits: 2 MB, 32 declared BCP 47 languages, 5000 multilingual texts, 200 text lists and
200 graphic lists, with 20000 list entries in total. Unknown fields, duplicate keys and malformed
values are rejected without replacing the previous catalogue. Lists are preserved, but referenced
images are not imported. Draft recovery retains the local catalogue and selected keys, not send
consent. AI receives only counts and linked/unlinked flags, not dictionary keys, translations or
the imported filename. Changing an AI-delegated title clears its old dictionary link.

For time trends and X/Y pages, **Dati e tag disponibili** can also import a local
`framecraft.logs.json` after the PLC tags. This imports logging configuration, not previous
samples or an external database. Limits: 2 MB, 32 logs, 5000 logged variables, up to 100000
samples per log and one year of retention. Unknown fields/storage modes, duplicate IDs,
missing required settings, unreadable/missing tags and ambiguous equality triggers are rejected.
The configuration is copied without inventing a logger or changing its storage/retention.

Choose **Online** or **Archivio** for each curve, independently for X and Y. Selecting an
archive does not pick its first variable automatically. Only enabled imported sources with
compatible readable numeric tags are offered; changed IDs/tag mappings remain visible and
block creation until corrected. Review shows the actual per-curve sources and each logger's
storage, enabled state, sampling and limits. General source/retention answers remain requirements
and do not overwrite this configuration. Draft recovery retains both the catalogue and references.
AI receives only counts and source-mode flags, not log names, IDs, tags, addresses or samples.

The emitted Data Log catalogue gets a fresh project storage key; importing configuration does
not reopen another project's previous browser history. Logging is performed only while the panel
is open and receives values. Memory and browser-local storage are not an industrial historian:
quotas, deletion, retention, backup/recovery and server logging still need commissioning.
No gateway, PLC connection or write is enabled by importing or creating the project.

The guided page catalogue also includes **Grafico X/Y**: up to nine curves, each with
separate readable numeric scalar tags for horizontal X and vertical Y. The AI receives the
template contract and linked/unlinked flags, not either tag name or its address. Both axes
are reviewed locally; missing links remain explicit and incompatible types block creation.
The generated page uses the existing Function Trend Runtime, not a drawing or fake samples.
Sampling and the time window apply to the paired samples, not to the X-axis scale. Axes remain
linear/automatic; units, limits, pairing tolerance and archived sources can be configured in
the Inspector. Runtime sampling does not establish synchronous acquisition in the PLC.
Draft recovery preserves both mappings; new labels do not inherit another curve's tags.
Creating the page never enables a gateway, writes a tag or approves machine commissioning.

Creation prepares and validates the files in a temporary sibling directory before publishing
the complete project. Missing/locked images or invalid generated files leave the selected
destination unchanged; correct the problem and retry the same empty folder. Existing files
are never overwritten. Publishing requires directory rename support and write access to the
parent folder; if unavailable, choose a writable local disk.
Replacing an available image or another valid local mapping preserves the AI proposal only
when the entire approved AI context is unchanged. Review the updated local configuration
before creating; no extra account request is sent. Changes to public answers invalidate the
proposal. Cancelling the folder dialog clears the previous creation error and keeps answers.

Connect your own ChatGPT account and select a model in **Impostazioni → AI e account**.
The AI screen only shows connection status and **Apri impostazioni AI**; it does not contain
account controls. Returning from settings preserves questionnaire answers and edit requests;
the account login completion is observed even after closing settings. Approve the displayed
context before sending.
Install [Codex CLI](https://developers.openai.com/codex/cli) separately; Framecraft does not install
it or reuse the desktop Codex login. It launches the [App Server](https://learn.chatgpt.com/docs/app-server)
in an isolated app-data profile, without shell, agents, file edits, tools or PLC execution.
During creation only approved page/item labels, validated choices and counts go to AI; technical requirement
details, images/catalogues/addresses/tag names stay local.
Further AI questions get separate answer fields. You review and explicitly create the plan;
the generator rejects AI changes to the chosen machine/layout/categories. Closing the wizard
preserves answers in the running app. The desktop app also conserves one local questionnaire
in its user profile (`ai-interview/questionnaire.json`, maximum 8 MiB). On reopening AI creation,
choose **Riprendi il questionario** or **Ricomincia da zero**; deletion needs a second confirmation
and never deletes projects or original images/catalogues. Responses, imported catalogues and
image paths stay local, in a plaintext user-profile file: do not enter passwords, tokens or PINs.
Account data, AI proposals, send consent and command-mapping approvals are not restored.
Review image availability and reconfirm every write mapping after recovery; no AI request,
project opening, PLC connection or command is triggered by recovery.

Changes are queued and atomically saved after a short pause. Check the saved status before
quitting; a hard process termination can still lose edits not yet confirmed as saved. Corrupt
or changed drafts are not overwritten silently. Errors offer rereading or continuing with
session-only answers, leaving the stored copy untouched. Browser-only use remains session-only.
Building the native app requires Rust 1.89+ for the cross-instance file lock (tested with 1.96).

Generated pages use the same standalone React project/editor as manual creation. Imported tags can
be selected for read-only values and trend curves. Selection and generation now share scalar type
checks with the existing MQTT/OPC UA configuration contract. Numeric curves exclude text, BOOL,
arrays/UDTs, unsupported types, write-only and source-detected-only tags; ordinary value displays
also accept supported BOOL/text scalars. Explicit scalar members can be mapped separately, but no
array expansion or numeric conversion is inferred. An obsolete/invalid choice remains visible
with a reason instead of being silently replaced. The same checks reject invalid direct generator
calls and invalidate an AI proposal when a changed local tag type is incompatible.
Before and after AI planning, **Letture dati** lists each page/element, actual local tag/type and
whether it is configured, unmapped or invalid; **Rivedi** returns to its page. Configured means
only a local binding, not a live connection, good quality or completed commissioning. The initial
AI request still excludes the tag catalogue and addresses. Blank mappings stay blank.
For each machine-write button, choose **Scrivere un
valore in un tag PLC**, an operator event (click/double-click/context click), a declared writable
tag, a compatible scalar value and an optional user permission; explicitly confirm the mapping.
The wizard compiles the same event IR as the Inspector. Deferred commands stay disabled; changing
the value/event/permission or reimporting tags revokes approval. Renaming/reordering/deleting item
rows cannot transfer an existing command to a different name. Tag names, addresses and write
values stay local, outside the AI request. Permission gates block without a grant, but they are
browser UI rules, not server/PLC authentication. Connections, interlocks and commissioning are
separate. These are single writes, not hold-to-run or safety functions; a PLC watchdog/lease and
fault tests are necessary before implementing momentary machine commands. Transport receipt
does not confirm PLC execution and uncertain/rejected commands are not automatically retried.

Command pages also offer **Aprire una pagina del pannello**. Select a destination from the
current page plan, an operator event and optional permission, then explicitly confirm the link.
There is no default destination or free URL/script. Navigation uses the same event IR/Runtime
as the Inspector and requires no PLC tags; it is valid in a monitor-only project and preserves
the panel's selected desktop/mobile mode. The generator resolves stable page IDs into the current
routes, including after page reordering or category changes. Removed/ambiguous destinations block
creation and lose approval; recreating the same page ID does not restore that approval.

Switching action clears the previous write/navigation mapping. Destination/event/permission
changes revoke confirmation; importing PLC tags does not change an unrelated navigation link.
The review shows the actual target title and **Rivedi pulsante**. Draft recovery preserves the
configuration, never approval. AI sees action type and destination page ID already in its plan,
not generated routes, tag names or write values. The command base is now version 2; version-1
pages retain their original behaviour contract. A permission on a button is not page access
control: protect sensitive pages/data separately on the server.

MQTT/OPC UA choice and roles are recorded requirements, not automatic setup. The selected
operator locale and explicitly mapped static translations are applied; complete English
translation is not automatic.
Alarm history is session history, not a production retention guarantee. No deployment occurs.

The event model follows the [WinCC Unified event documentation](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/triggering-events-rt-unified/basics-on-the-events-rt-unified)
and the [FactoryTalk Optix button documentation](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/current/contents-ditamap/creating-projects/graphic-objects/predefined-objects/basic-control-objects/button.html):
operator events and press/release semantics are distinct. This does not imply full vendor parity
or safety certification. No new dependencies or redistributed vendor assets were added for this flow.

Open **Chat AI** in the activity bar or **Pannello → Chat AI · Codex** for the project side chat.
Right-click an element in **Modifica**, or a page in the page list, and choose **Aggiungi alla chat**.
The composer also offers **Elemento selezionato** and **Pagina aperta**. References are explicit
chips that can be removed: selecting another object does not silently replace the destination.
**Modifiche al progetto** is enabled by default: attachments choose where to start, not a hard
boundary around Inspector properties. After session consent, the assistant can read bounded source
excerpts, follow imported components, request configuration fragments, edit source and declare missing
variables. No screenshot or manual attachment of every child is required for source-based changes.
The native adapter supports CLI 0.163.0's named permission profiles; the missing legacy
`ReadOnlyAccess` field alone is no longer considered an incompatibility. Source requests explicitly
select a dedicated profile: only the proposal workspace and Codex's minimal platform paths are
readable, no writes or tool network access. Effective configuration, managed-policy allowance and
the selected thread profile are checked; legacy and named sandbox fields are never mixed in a request.
**Current Windows limit:** the Framecraft profile reports `updateRequired`. The adapter checks
readiness before creating a source-edit thread and explains when Windows sandbox setup is needed.
In **Impostazioni → AI e account → Protezione dei file**, choose **Verifica isolamento** after
connecting/checking the account. Opening settings does not perform that check or start setup.
When needed, **Configura Windows…** explains the effects; its separate, initially unchecked consent
and **Autorizza e avvia configurazione** are both required. **Non adesso** makes no OS changes.
It never starts setup automatically or widens permissions. Administrative setup may change
dedicated local sandbox accounts, firewall and logon rules; see the
[official Windows sandbox documentation](https://learn.chatgpt.com/docs/windows/windows-sandbox).
An accepted start is not success: Framecraft waits for the completion notification, then reads
readiness again, including when settings were closed. A lost response/process keeps the outcome
uncertain and blocks duplicate setup and new AI requests for the current app session. Do not
restart/retry setup merely because a wait expired: check the Windows prompt or contact IT.
Confirmed failure requires a fresh explicit consent before another attempt. No raw setup errors,
tokens or source paths are forwarded to the UI. Manual editing remains available; finishing setup
never sends an AI request or applies a proposal automatically.
The native preflight verifies configuration, not successful source editing or filesystem enforcement.
An updated desktop build, authorized Windows setup and a new end-to-end test are still required.
Disable this option for the previous graphical-only mode described below; switching scope revokes
transmission consent. In graphical-only mode, attach one element (including its children) or up to five pages. Pages supply actual source-derived
hierarchy, literal texts, supported inline styles and editable/dynamic flags, not just navigation names.
The assistant can propose a graphical restyling across these objects without requesting screenshots
or individual selections. Component/state page boundaries are respected when declared. Imported
component internals, stylesheet values and live Runtime visuals are not inferred. Large literal text
runs are explicitly abbreviated in page rows; a single-element attachment retains its full text.

Messages and the unsent draft survive closing/reopening the chat during the same project session.
They also survive editor reloads in the same window: visible text, pinned notes and clarification
answers are checkpointed in local, plaintext **sessionStorage**, not in the project/Git or an AI
service. This is refresh recovery, not an archive after the window/app closes. A project close/change
or account logout/change clears the checkpoint. Restoring an account-bound chat first checks the
local CLI account status; it never logs in or sends an AI request automatically.
Recovered proposals are read-only history. Sources, ASTs, PLC catalogues/addresses, prepared prompts,
running requests and approval/consent are never restored. Previous reference labels remain visible;
reattach current pages/elements and reselect PLC data for a new proposal. Unsent clarification answers,
including text in a deferred field, remain readable in their original message. A storage error warns
you to copy the text before refreshing, without silently truncating or replacing a broken checkpoint.
**Nuova chat** requires confirmation and never edits the panel. It keeps **Indicazioni da ricordare**
(up to 2,000 characters, session-only); project/account changes clear these too. Use them for important
constraints that must be sent every time, instead of relying on automatic recall of an old message.
Authorize request/context transmission **once per project/account session**. The checkbox remains
set across messages, changed attachments/notes, closing the chat and **Nuova chat**. Uncheck it to
revoke authorization and cancel an in-flight request; switching project/account clears it. No consent
is restored from disk. Applying a proposal always needs separate approval.
A conversation stops at 40 messages with a clear new-chat instruction.

Project mode uses the same Codex account, model and reasoning controls. It includes only necessary
source excerpts plus variable names/types/access/descriptions, not addresses, connections or live
values. Project sharing is authorized separately from applying changes. Context is limited to three
model passes, 80,000 UTF-8 bytes per pass and 180,000 cumulative input bytes (including schema), at
most six recent messages with explicit abbreviation, and an index of up to 500 source paths. No
extra summarization model or full-project upload is used. The exact last request and local token
estimate are inspectable; estimates are not provider billing. Unknown machine facts stay unknown.

Review the file list, new variables and before/after code, then explicitly approve the batch.
Nothing is applied on receipt of an AI answer. The local foundation validates exact source replacements
and proposed new, unmapped variables, and exposes native project-confined read/apply/restore primitives.
It checks the expected disk text, writes a local
backup under `.framecraft/ai-backups/` before changes, and refuses stale versions during apply or
restore. Source files outside `src/`, credentials/configuration paths, symlinks/junctions and direct
file deletion are excluded. The PLC catalogue can only gain read-only variables with empty addresses;
existing rows/mapping and extra catalogue fields remain intact. These are not live machine signals.
Backups contain local plaintext source and are not an AI-upload source. Multi-file writes are not a
filesystem transaction: rollback is best-effort and a backup can recover partially applied batches
without overwriting later external edits.
The source checks catch syntax/import problems and known dangerous calls; they are not a JavaScript
sandbox, a complete secret detector, a type/build check of the edited panel or a machine safety
validation. New network/execution/PLC-write calls are not enabled through this code-edit path.
Use **Ripristina questa proposta** with its separate confirmation to restore the whole batch;
ordinary editor Undo concerns individual existing source files. A whitelisted backup reference,
not proposal source or approval, survives a same-window reload so restore stays available. The
restorer refuses newer external versions. During apply/restore the editor is temporarily locked and
requests waiting before closing/reloading; forced termination is not covered by browser guards.
Use the updated Framecraft desktop build for the native commands. Codex must support the named
restricted profile or the legacy restricted read-only policy. Compatibility failures never fall
back to wider filesystem access. The protocol follows the [official App Server documentation](https://learn.chatgpt.com/docs/app-server)
and [permission profiles](https://learn.chatgpt.com/docs/permissions); named profiles require the
experimental API opt-in. This adapter is provisional, not a production-support guarantee.

When the assistant needs clarification, answer in **Completa questi dettagli** inside its message,
then choose **Invia risposte e continua**. Each question has its own field (up to 1,000 characters)
and **Non ho questo dato: lascia invariata questa parte**. Deferral is not permission to invent
machine data or activate a function. A disabled answer stays local and is not sent.
The follow-up retains the original objective, pinned attachments and explicit earlier answers in
the same clarification chain; it never replaces a separate composer draft. Changed attachments
require a new request to avoid applying old answers to another object. Responses survive closing
the chat and failed/cancelled sends, but not **Nuova chat**, project/account changes or app exit.
The exact follow-up context is inspectable before sending and uses the same 24 kB budget and
session consent. Answers alone never apply changes: review and approve the new proposal separately.
In project mode the same question fields are available. The original objective and all explicit
answers in the clarification chain are carried as structured data, within the project input budget
(80 kB per pass, 180 kB cumulative), not the 24 kB graphical-mode budget. Its pre-send preview shows
the objective and answers; source retrieval happens on Send, and the technical pane then shows the
exact last prepared request. Repeating a question updates its answer; a deferral replaces an earlier
answer and instructs the assistant to keep that part unchanged. Review the resulting diff; the
instructions are not a semantic correctness guarantee. Disabled field text
is not collected. Without explicit attachments, follow-ups keep the initial source pages even if
you navigate elsewhere; they reread current disk content, not an old source snapshot. Changing the
attachments or editing scope requires a new request. Separate composer drafts are never sent as
answers or overwritten by them. After reload project questions and unsent answers remain readable,
but cannot resume an old proposal or restore approval automatically; request a new review.
During clarification the main composer is compacted; **Scrivi una nuova richiesta** reopens it
without losing its draft or the answers. New questions open at their first field; typing does not
reset the conversation scroll position.
Pending proposals use the same compact composer and open at the start of the review, so the
approval controls are not hidden below a long schematic. **Scrivi una nuova richiesta** keeps
the separate draft available; it never applies the proposal.

Choose **Modello** and **Ragionamento** directly above the chat (also available in AI settings).
Options come from the Codex model catalog, including its supported/default reasoning efforts;
changing model restores its default. The native adapter sends an optional `effort` on `turn/start`,
and rejects an unsupported override. The catalog is not a guarantee of account entitlement.

Production gate: the [official App Server documentation](https://learn.chatgpt.com/docs/app-server)
describes this integration as experimental and unsupported for production workloads. The current
CLI-backed editor assistant is a prototype provider, not a production-readiness guarantee. Shipping
requires a supported provider contract, release/security/privacy checks and a separately validated
HMI runtime; AI must stay optional.
Protocol reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

For data-driven changes, expand **Dati da usare**, choose a scalar readable tag from the local
catalog and give it a distinct AI-facing label such as **Allarme motore**. Up to eight references
are allowed. Only the anonymous ID, this explicit label and type go into the context; tag names,
addresses, descriptions, connections and sample values are not gathered for the provider.
The assistant can propose read-only **Text**, **ForeColor**, **BackColor**, **BorderColor** and
**Visible** bindings: scalar text display, direct BOOL visibility or explicit false/true mappings
from a declared BOOL. There are no inferred thresholds, scripts, tag creation, writable IO values,
automatic MQTT/OPC UA connections or changes to user permissions.

Every proposed binding starts unchecked. The local review shows the actual tag, type, old rule
and false/true outputs before approval; applying uses the same HMI attribute format as the
Inspector and one Undo per file. Other rules, handlers and the PLC catalog are preserved.
Stale catalog definitions, unknown aliases, incompatible types, attribute spreads, computed
configurations, text containers and known repeated callback/loop markup are blocked. General
cross-file instance impact analysis is still incomplete; verify shared components and commissioning.
Runtime sample quality and unavailable values use the existing diagnostics, not an AI assertion
that the machine signal is valid. The schematic shows base values, not live PLC readings.
Visibility is graphical, not authentication, authorization or machine safety.
Existing events/scripts may react to property changes: read-only data rules do not certify their
effects. Review and commission that existing logic before using the panel on a machine.

Removing a reference or starting a new chat only removes it from AI context, not from rules
already saved. Project/account changes clear the references. During clarification you may append
the missing data without retyping the original goal; removing/reassigning prior references requires
a new request. The same per-session consent, context budget and explicit proposal approval apply.
Functional references: [Unified tag dynamization](https://docs.tia.siemens.cloud/r/en-us/v21/configuring-screens-rt-unified/configuring-dynamization-rt-unified/dynamizing-object-properties-rt-unified/dynamizing-an-object-property-via-a-tag-rt-unified/dynamizing-object-property-via-tag-rt-unified)
and [Optix conditional converter](https://www.rockwellautomation.com/en-tr/docs/factorytalk-optix/1-03/contents-ditamap/using-the-software/converters/conditional-converter.html).

The context compiler sends compact JSON with a stable rules prefix. The element is included once,
an element already included in an attached page is not sent twice. Single-element graphical requests
use a template ID/version/purpose reference instead of the full behavioural contract; page scopes
keep deduplicated template contracts. Requests, fixed notes or the last user turn
involving operations, alarms, dynamic data or permissions keep the full contract. Editable capabilities
and dynamic/Runtime flags are always preserved. This is selection, not compression of source code.

Up to three recent user/assistant exchanges are retained together (9,000-byte history budget), plus
up to two relevant older user excerpts selected locally by keyword overlap (1,800 bytes). No extra AI
summarization, embeddings, tokenizer API call or account credits are used for this selection. Original
messages stay in the chat; omissions and abbreviations are visible, and the exact technical payload
is inspectable. This recall is not a guarantee of remembering every old instruction: pin important ones.
Proposal-only changes and previously applied changes are distinct; only approved operations are
recorded as applied. Historical application is not proof of the current file after Undo.

The prompt plus serialized output schema is capped at **24,000 UTF-8 bytes**. Current request,
fixed notes and prepared destination are never silently shortened to fit: oversized mandatory input is rejected before
inference and the draft is kept. Optional history is abbreviated or excluded explicitly. The displayed
token estimate is a local bytes/3 heuristic, not a model tokenizer, context-window limit, account quota,
exact usage or bill. It excludes provider framing, internal instructions, reasoning and response tokens.
Design references: [OpenAI context management](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory)
and [token counting guidance](https://developers.openai.com/api/docs/guides/token-counting).
No full source, expression/handler bodies, real tag mappings or credentials are gathered for the
request. Text explicitly typed into chat and literal element content can be sent: never enter secrets.
Account connection stays in settings; the initial guided creation wizard is unchanged.

The assistant can propose text, supported geometry and bounded layout properties (spacing, flex/grid,
alignment) on attached objects. Page operations address exact local target IDs; unknown targets and
duplicate fields, including aliases through different attachments, are rejected. Partial approval is
available **per file**, with one undo/redo per file; multi-file proposals are not atomic transactions.
Only the latest completed proposal can be applied;
cancelled/late replies cannot become new proposals in another project. Its review
shows Italian property names and before/after source values. Unset values are labelled as CSS/
component-dependent, not guessed as live readings. Unchanged operations are excluded; duplicate
operations on the same field are rejected rather than silently taking the last value.

Changes that replace a computed value, or alter a base value still controlled by HMI dynamization,
start unchecked and explain the impact. Selecting them is an explicit decision. Other fields,
unselected bindings and all events are preserved. Explicitly approved read bindings only replace
their own property. Runtime property names and dynamic flags can enter the
approved context, but expression/script bodies and actual tag names are not sent automatically.
Styles hidden or overridden by JSX attribute spreads remain Inspector-only.

The two schematic drawings follow only the selected operations, using a common scale and bounded
dimensions. They never mount the project's JSX, load its images, execute handlers or evaluate PLC
data. This is not a live-panel preview: external CSS, images, placement, stacking and Runtime
behaviour must be checked in the actual panel. Attachments remain pinned to their approved snapshot.
Single-element edits require the same selection/instance/scope; page edits target attached source
objects independently of the current selection and can update a non-open file without navigating.
Both refuse stale source, unsaved drafts and project changes. A successful edit refreshes affected
attachments locally. A native compare-and-swap save is still pending: external writes racing after
the final read are not covered by an atomic filesystem guarantee.
Broader AI operations and whole-project semantic impact analysis remain on the roadmap.
The native adapter needs a new desktop build; local CLI protocol 0.159.2 and synthetic/targeted
tests are not proof of a successful real-account login or inference on a production installation.

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

## Generated-panel smoke check

New panels use the actual device clock and alarm catalogue, with no demo operator, fault,
state, format or speed. The optional guided header step binds readable scalar tags and
explicit speed units/range; local `framecraft.header.json` is validated on load. Unknown
or invalid quality displays `—`; a quality-only Bad sample clears the meter until recovery.
Numeric state codes are not guessed as PackML states. No operator accounts are generated.

`node scripts/check-generated-panel.mjs --offline --browser` validates a synthetic guided
proposal, passes the actual generator output to the native `create_vite_project` function,
copies a synthetic SVG, installs the generated package dependencies from cache and runs
the generated project's strict TypeScript/production build. Its real-browser phase checks
mobile viewport/navigation persistence, return to device choice (including narrow Desktop),
and a source edit through the editor's parser/transformer followed by HMR. No ChatGPT request,
PLC connection, user project or desktop window is used. This is not the real-account/native-UI
end-to-end test or industrial commissioning.

The generated build separates application, HMI Runtime and third-party vendor chunks without
raising or suppressing Vite's size warning. Client dependency notices are emitted in
`dist/THIRD_PARTY_NOTICES.md`; this does not clear other runtime/asset/licensing release gates.
The browser phase also opens the compiled production output, checks chunk loading, navigation
and device selection, and records JavaScript bundle sizes. These size assertions concern the
small synthetic fixture, not a maximum size guarantee for every future panel.

Prerequisites: Node 24, Cargo and cached Rust/npm dependencies. The optional `--browser` phase
needs Playwright and an installed browser (Edge by default on Windows). Set
`FRAMECRAFT_PLAYWRIGHT_MODULE` to its `index.mjs` if it is not locally installed, and
`FRAMECRAFT_SMOKE_NPM_CLI` to `npm/bin/npm-cli.js` if using a Node runtime without npm.
`FRAMECRAFT_SMOKE_BROWSER_CHANNEL` overrides the browser channel. Without `--offline`, npm
can contact the official registry; dependency install scripts/audit/funding calls stay disabled.
The companion native fixture test is explicitly ignored in ordinary Cargo runs and invoked
only by this command. Artifacts/result/screenshots stay in a fresh ignored `.hmi-preview/`
directory, retained for diagnosis; no existing directory is overwritten or removed.

For an explicitly authorized real-account test, add `--real-ai`. It sends one synthetic
interview through the same native Codex client/proposal implementation used by Tauri,
using the ChatGPT account already connected in **Settings → AI and account**, then validates
the real response with the frontend parser before creation/build/browser checks. The native
fixture is ignored normally and additionally requires a dedicated opt-in environment flag.
A local attempt marker prevents automatically repeating an ambiguous/failed inference.
For later generator/browser regressions, `--reuse-ai-response <successful-ai-response.json>`
reuses an existing completed reply only if the saved prompt/schema/request ID still match.
It does not send another account request and cannot be combined with `--real-ai`.
No real PLC, user machine file or credential is supplied to the test. `--offline` only
applies to dependency installation; `--real-ai` necessarily contacts Codex online.
This checks the engine/provider/generated panel, not all wizard clicks, folder-dialog/IPC
handoff or Inspector gestures in the actual desktop window, and not commissioning.

Commercial-release gate: [official App Server authentication guidance](https://learn.chatgpt.com/docs/app-server#authentication-endpoints)
allows continuing local/open-source integrations but excludes App Server authentication for
commercial/hosted services. Review applicability and switch to an authorized API or Sign in
with ChatGPT integration before commercial distribution; CLI remains the current local option.

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
