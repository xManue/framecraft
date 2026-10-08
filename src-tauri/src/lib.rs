use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{atomic::{AtomicU64, Ordering}, Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tempfile::NamedTempFile;
use walkdir::WalkDir;
mod editor_draft;
mod connection_config;

#[derive(Default)]
struct RuntimeState {
    draft: Mutex<editor_draft::DraftSession>,
    preview: PreviewSlot,
    preview_generation: AtomicU64,
    watcher: Mutex<Option<RecommendedWatcher>>,
    project_root: Mutex<Option<PathBuf>>,
    project_generation: AtomicU64,
    authorized_root: Mutex<Option<PathBuf>>,
    /// Directories outside the project the user explicitly chose to edit, such as a shared
    /// template catalog the project reaches through a Vite alias.
    external_roots: Mutex<Vec<PathBuf>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    kind: String,
    children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAnalysis {
    root: String,
    name: String,
    framework: String,
    language: String,
    package_manager: String,
    entry_files: Vec<String>,
    files: Vec<FileEntry>,
    scripts: HashMap<String, String>,
    dependencies: Vec<String>,
    has_node_modules: bool,
    missing_dependencies: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkingCopyMarker {
    original_workspace: Option<String>,
    created_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkingCopyResult {
    root: String,
    original_root: Option<String>,
    workspace_root: String,
    created: bool,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    root: String,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewSession {
    session_id: String,
    url: String,
    port: u16,
    /// Directories the project itself declares as source, so the editor can edit everything the
    /// preview is able to render.
    source_roots: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewProjectFile {
    path: String,
    #[serde(default)]
    content: String,
    /// When present the file is copied from here instead of writing `content`: images are not text.
    #[serde(default)]
    source: Option<String>,
}

/// The editor config is generated rather than formatted so the JavaScript below stays readable:
/// `format!` would need every brace doubled.
const EDITOR_CONFIG_TEMPLATE: &str = r#"import { defineConfig, mergeConfig, searchForWorkspaceRoot } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import framecraft from "__FRAMECRAFT_PLUGIN_URL__";
import originalConfig from "__FRAMECRAFT_CONFIG_URL__";

// Framecraft may edit whatever the preview can serve, so the source roots are taken from the
// project's own configuration instead of being guessed.
function sourceRoots(config, root) {
  const roots = new Set([root]);
  try { roots.add(searchForWorkspaceRoot(root)); } catch { /* no workspace marker above the project */ }
  for (const entry of config.server?.fs?.allow ?? []) {
    if (typeof entry === "string" && isAbsolute(entry)) roots.add(resolve(entry));
  }
  const alias = config.resolve?.alias;
  const targets = Array.isArray(alias) ? alias.map((item) => item.replacement) : Object.values(alias ?? {});
  for (const target of targets) {
    if (typeof target === "string" && isAbsolute(target)) roots.add(resolve(target));
  }
  return [...roots];
}

export default defineConfig(async (env) => {
  const root = resolve("__FRAMECRAFT_ROOT__");
  const original = typeof originalConfig === "function" ? await originalConfig(env) : await originalConfig;
  const merged = mergeConfig(original ?? {}, { root });
  // Framecraft has to read every file exactly as it is on disk. @vitejs/plugin-react is an
  // "enforce: pre" plugin too, and inside one enforce bucket Vite keeps the array order, so simply
  // appending would let React's Babel pass run first: the editor would then stamp the offsets of
  // already-transformed code into the DOM and every selection would point at a line that does not
  // exist in the source. Going first is what keeps the canvas tied to the real file.
  merged.plugins = [framecraft(), ...(merged.plugins ?? [])];
  try {
    mkdirSync(resolve(root, ".framecraft"), { recursive: true });
    writeFileSync(resolve(root, ".framecraft/source-roots.json"), JSON.stringify(sourceRoots(merged, root), null, 2));
  } catch { /* the editor falls back to the project folder alone */ }
  return merged;
});
"#;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PreviewOutput {
    stream: String,
    line: String,
    session_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PreviewExit {
    session_id: String,
    code: Option<i32>,
    message: String,
}

struct ManagedPreview {
    child: Child,
    session_id: String,
    port: u16,
    log: OutputLog,
    output_threads: Vec<thread::JoinHandle<()>>,
}

type PreviewSlot = Arc<Mutex<Option<ManagedPreview>>>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorNativeSession {
    project: Option<ProjectAnalysis>,
    preview: Option<PreviewSession>,
    external_roots: Vec<String>,
    authorized_root: Option<String>,
    generation: u64,
}

fn editor_session_snapshot(state: &RuntimeState) -> Result<EditorNativeSession, String> {
    let (root, preview, external_roots, generation) = {
        // Same lock order as attach_preview; this query never grants paths or restarts a child.
        let mut slot = state.preview.lock().map_err(|_| "Preview lock poisoned")?;
        let root = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
        let roots = state.external_roots.lock().map_err(|_| "External roots lock poisoned")?;
        let generation = state.preview_generation.load(Ordering::SeqCst);
        let external_roots: Vec<String> = roots.iter().map(|path| path_string(path)).collect();
        let preview = if root.is_some() {
            if let Some(preview) = slot.as_mut() {
                if preview.child.try_wait().map_err(|error| error.to_string())?.is_none() { Some(PreviewSession {
                    session_id: preview.session_id.clone(), url: format!("http://127.0.0.1:{}", preview.port),
                    port: preview.port, source_roots: external_roots.clone(),
                }) } else { None }
            } else { None }
        } else { None };
        (root.clone(), preview, external_roots, generation)
    };
    let authorized_root = state.authorized_root.lock().map_err(|_| "Authorized root lock poisoned")?.as_deref().map(path_string);
    let project = root.as_deref().map(analyze).transpose()?;
    let current_root = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    if generation != state.preview_generation.load(Ordering::SeqCst) || root != *current_root {
        return Err("Il progetto è cambiato durante il recupero. Riprova.".into());
    }
    Ok(EditorNativeSession { project, preview, external_roots: if root.is_some() { external_roots } else { vec![] }, authorized_root: if root.is_some() { authorized_root } else { None }, generation })
}

#[tauri::command]
async fn get_editor_session(app: AppHandle) -> Result<EditorNativeSession, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RuntimeState>();
        editor_session_snapshot(&state)
    }).await.map_err(|error| format!("Verifica sessione interrotta: {error}"))?
}

#[derive(Debug, Deserialize)]
struct PackageJson {
    name: Option<String>,
    scripts: Option<HashMap<String, String>>,
    dependencies: Option<HashMap<String, serde_json::Value>>,
    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<HashMap<String, serde_json::Value>>,
}

fn path_string(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        if let Some(network_path) = value.strip_prefix(r"\\?\UNC\") { return format!(r"\\{network_path}"); }
        if let Some(local_path) = value.strip_prefix(r"\\?\") { return local_path.to_string(); }
    }
    value
}

fn ignored(name: &str) -> bool {
    matches!(name, "node_modules" | ".git" | "dist" | "build" | "target" | ".framecraft")
}

fn copy_ignored(name: &str) -> bool {
    // Any Framecraft working copy living beside the project is skipped, or copies would nest.
    name.starts_with(".framecraft")
        || matches!(name, ".git" | ".vs" | ".idea" | "dist" | "build" | "target" | "bin" | "obj" | "coverage")
}

#[cfg(windows)]
fn link_dependency_directory(source: &Path, destination: &Path) -> bool {
    Command::new("cmd").args(["/C", "mklink", "/J"]).arg(destination).arg(source)
        .stdout(Stdio::null()).stderr(Stdio::null()).status().map(|status| status.success()).unwrap_or(false)
}

#[cfg(not(windows))]
fn link_dependency_directory(source: &Path, destination: &Path) -> bool {
    std::os::unix::fs::symlink(source, destination).is_ok()
}

/// A single locked or unreadable file must not abort the copy: it is recorded and reported to the
/// user instead, so opening a project never fails because of one stray file.
fn copy_workspace_contents(source: &Path, destination: &Path, warnings: &mut Vec<String>) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for item in fs::read_dir(source).map_err(|error| error.to_string())? {
        let item = match item {
            Ok(value) => value,
            Err(error) => { warnings.push(format!("Voce illeggibile in {}: {error}", path_string(source))); continue; }
        };
        let name = item.file_name().to_string_lossy().into_owned();
        let source_path = item.path();
        let destination_path = destination.join(&name);
        if copy_ignored(&name) { continue; }
        let file_type = match item.file_type() {
            Ok(value) => value,
            Err(error) => { warnings.push(format!("Tipo di file sconosciuto per {}: {error}", path_string(&source_path))); continue; }
        };
        if name == "node_modules" && file_type.is_dir() {
            if !link_dependency_directory(&source_path, &destination_path) {
                warnings.push("Non è stato possibile collegare node_modules alla copia: le dipendenze verranno installate.".into());
            }
        } else if file_type.is_dir() {
            if let Err(error) = copy_workspace_contents(&source_path, &destination_path, warnings) {
                warnings.push(format!("Cartella saltata {}: {error}", path_string(&source_path)));
            }
        } else if file_type.is_file() {
            if let Err(error) = fs::copy(&source_path, &destination_path) {
                warnings.push(format!("File saltato {}: {error}", path_string(&source_path)));
            }
        } else {
            warnings.push(format!("Collegamento saltato {}", path_string(&source_path)));
        }
    }
    Ok(())
}

fn marker_in_ancestors(root: &Path) -> Option<(PathBuf, WorkingCopyMarker)> {
    for ancestor in root.ancestors().take(10) {
        let marker_path = ancestor.join(".framecraft-workspace.json");
        if !marker_path.is_file() { continue; }
        let source = fs::read_to_string(marker_path).ok()?;
        let marker = serde_json::from_str(&source).ok()?;
        return Some((ancestor.to_path_buf(), marker));
    }
    None
}

/// The copy is a direct sibling of the original workspace, not a folder nested inside a container.
/// Relative imports that reach outside the workspace — `../../../templates/shared.css` and friends —
/// are resolved by depth, so a copy placed one level deeper would silently resolve them somewhere
/// else and break a project that runs perfectly in its original location.
fn unique_working_root(source_workspace: &Path) -> Result<PathBuf, String> {
    let parent = source_workspace.parent().ok_or("Il progetto non ha una cartella padre valida.")?;
    let base = source_workspace.file_name().unwrap_or_default().to_string_lossy();
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs();
    for suffix in 0..100u8 {
        let name = if suffix == 0 { format!(".framecraft-{base}-edit-{timestamp}") } else { format!(".framecraft-{base}-edit-{timestamp}-{suffix}") };
        let candidate = parent.join(name);
        if !candidate.exists() { return Ok(candidate); }
    }
    Err("Non riesco a creare un nome univoco per la copia di lavoro.".into())
}

/// The copy has to sit next to the original to keep relative paths intact, so it is hidden from
/// Explorer to avoid cluttering the folder the user actually works in.
#[cfg(windows)]
fn hide_directory(path: &Path) {
    let _ = Command::new("attrib").arg("+h").arg(path).stdout(Stdio::null()).stderr(Stdio::null()).status();
}

#[cfg(not(windows))]
fn hide_directory(_path: &Path) {}

#[tauri::command]
fn create_working_copy(root: String) -> Result<WorkingCopyResult, String> {
    let selected_root = fs::canonicalize(&root).map_err(|error| error.to_string())?;
    analyze(&selected_root)?;
    if let Some((copy_workspace, marker)) = marker_in_ancestors(&selected_root) {
        let relative = selected_root.strip_prefix(&copy_workspace).map_err(|error| error.to_string())?;
        let original_root = marker.original_workspace.as_ref().map(|workspace| path_string(&PathBuf::from(workspace).join(relative)));
        return Ok(WorkingCopyResult { root: path_string(&selected_root), original_root, workspace_root: path_string(&copy_workspace), created: false, warnings: Vec::new() });
    }

    let source_workspace = workspace_root(&selected_root);
    let project_relative = selected_root.strip_prefix(&source_workspace).map_err(|error| error.to_string())?;
    let destination_workspace = unique_working_root(&source_workspace)?;
    let mut warnings = Vec::new();
    if let Err(error) = copy_workspace_contents(&source_workspace, &destination_workspace, &mut warnings) {
        let _ = fs::remove_dir_all(&destination_workspace);
        return Err(error);
    }
    let working_project = destination_workspace.join(project_relative);
    // Skipping stray files is tolerable; skipping the manifest is not.
    if !working_project.join("package.json").is_file() {
        let _ = fs::remove_dir_all(&destination_workspace);
        return Err("La copia di lavoro non contiene package.json: verifica i permessi sulla cartella del progetto.".into());
    }
    let created_at = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs();
    let marker = WorkingCopyMarker { original_workspace: Some(path_string(&source_workspace)), created_at };
    fs::write(destination_workspace.join(".framecraft-workspace.json"), serde_json::to_string_pretty(&marker).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    hide_directory(&destination_workspace);
    let skipped = warnings.len();
    warnings.truncate(8);
    if skipped > 8 { warnings.push(format!("…e altri {} elementi saltati durante la copia.", skipped - 8)); }
    Ok(WorkingCopyResult {
        root: path_string(&working_project),
        original_root: Some(path_string(&selected_root)),
        workspace_root: path_string(&destination_workspace),
        created: true,
        warnings,
    })
}

fn file_tree(directory: &Path, depth: usize) -> Result<Vec<FileEntry>, String> {
    if depth > 8 { return Ok(Vec::new()); }
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(directory).map_err(|error| error.to_string())?;
    for item in read_dir {
        let item = item.map_err(|error| error.to_string())?;
        let path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();
        if ignored(&name) || name.starts_with('.') { continue; }
        if path.is_dir() {
            entries.push(FileEntry { name, path: path_string(&path), kind: "directory".into(), children: Some(file_tree(&path, depth + 1)?) });
        } else {
            entries.push(FileEntry { name, path: path_string(&path), kind: "file".into(), children: None });
        }
    }
    entries.sort_by(|a, b| (a.kind != "directory", a.name.to_lowercase()).cmp(&(b.kind != "directory", b.name.to_lowercase())));
    Ok(entries)
}

fn analyze(root: &Path) -> Result<ProjectAnalysis, String> {
    let package_path = root.join("package.json");
    if !package_path.is_file() { return Err("La cartella non contiene package.json.".into()); }
    let package: PackageJson = serde_json::from_str(&fs::read_to_string(&package_path).map_err(|error| error.to_string())?)
        .map_err(|error| format!("package.json non valido: {error}"))?;
    let mut all_dependencies = package.dependencies.unwrap_or_default();
    all_dependencies.extend(package.dev_dependencies.unwrap_or_default());
    if !all_dependencies.contains_key("react") { return Err("Il progetto non dichiara React tra le dipendenze.".into()); }
    let dependencies: Vec<String> = all_dependencies.keys().cloned().collect();
    let framework = if all_dependencies.contains_key("next") { "next" } else if all_dependencies.contains_key("vite") { "vite" } else { "react" };
    // Most projects keep components under src/, but plenty do not: app/, pages/ or the project root
    // itself are all normal layouts, and rejecting them would make the editor look broken.
    let mut entry_files = Vec::new();
    let src = root.join("src");
    let scan_root = if src.is_dir() { src } else { root.to_path_buf() };
    for item in WalkDir::new(&scan_root)
        .max_depth(8)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !ignored(&name) && !(entry.depth() > 0 && name.starts_with('.'))
        })
        .filter_map(Result::ok)
    {
        if item.file_type().is_file() && matches!(item.path().extension().and_then(|value| value.to_str()), Some("tsx" | "jsx" | "ts" | "js")) {
            entry_files.push(path_string(item.path()));
        }
    }
    entry_files.sort_by_key(|path| (!path.ends_with("App.tsx") && !path.ends_with("App.jsx"), path.clone()));
    let language = if root.join("tsconfig.json").exists() || entry_files.iter().any(|file| file.ends_with(".tsx")) { "typescript" } else { "javascript" };
    let package_manager = if root.join("pnpm-lock.yaml").exists() { "pnpm" } else if root.join("yarn.lock").exists() { "yarn" } else { "npm" };
    let name = package.name.unwrap_or_else(|| root.file_name().unwrap_or_default().to_string_lossy().into_owned());
    let missing = missing_dependencies(root, &dependencies);
    Ok(ProjectAnalysis {
        root: path_string(root), name, framework: framework.into(), language: language.into(), package_manager: package_manager.into(),
        entry_files, files: file_tree(root, 0)?, scripts: package.scripts.unwrap_or_default(),
        has_node_modules: root.join("node_modules").is_dir(), missing_dependencies: missing, dependencies,
    })
}

/// A dependency counts as installed only when its own manifest is readable. `node_modules` existing
/// proves nothing: a moved pnpm store, an interrupted install or a copied tree all leave a folder
/// full of entries that resolve to nothing, and the dev server then dies with a raw Node stack trace.
fn missing_dependencies(root: &Path, dependencies: &[String]) -> Vec<String> {
    let modules = root.join("node_modules");
    if !modules.is_dir() { return dependencies.to_vec(); }
    let mut missing: Vec<String> = dependencies
        .iter()
        .filter(|name| !modules.join(name).join("package.json").is_file())
        .cloned()
        .collect();
    missing.sort();
    missing
}

/// A working copy links `node_modules` back to the original project so gigabytes are not duplicated.
/// Installing through that link would write into the user's real project, so the link is dropped and
/// the copy gets a private tree instead.
fn unlink_dependency_directory(root: &Path) -> Result<(), String> {
    let modules = root.join("node_modules");
    let Ok(metadata) = fs::symlink_metadata(&modules) else { return Ok(()) };
    if !metadata.file_type().is_symlink() { return Ok(()); }
    // remove_dir on a junction detaches the link without touching the directory it points at.
    fs::remove_dir(&modules)
        .or_else(|_| fs::remove_file(&modules))
        .map_err(|error| format!("Impossibile scollegare node_modules dalla copia di lavoro: {error}"))
}

fn start_watcher(app: &AppHandle, root: &Path, state: &RuntimeState) -> Result<(), String> {
    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
        if let Ok(event) = result {
            for path in event.paths {
                // Dependency and build trees churn constantly; forwarding them would flood the editor.
                if path.components().any(|part| ignored(&part.as_os_str().to_string_lossy())) { continue; }
                if matches!(path.extension().and_then(|value| value.to_str()), Some("tsx" | "jsx" | "ts" | "js" | "css" | "scss")) {
                    let _ = app_handle.emit("project-file-changed", path_string(&path));
                }
            }
        }
    }).map_err(|error| error.to_string())?;
    watcher.watch(root, RecursiveMode::Recursive).map_err(|error| error.to_string())?;
    *state.watcher.lock().map_err(|_| "Watcher lock poisoned")? = Some(watcher);
    Ok(())
}

#[tauri::command]
fn analyze_project(root: String, app: AppHandle, state: State<RuntimeState>) -> Result<ProjectAnalysis, String> {
    let root_path = fs::canonicalize(&root).map_err(|error| error.to_string())?;
    let analysis = analyze(&root_path)?;
    let authorized_root = workspace_root(&root_path);
    start_watcher(&app, &authorized_root, &state)?;
    set_project_root(&state, root_path)?;
    *state.authorized_root.lock().map_err(|_| "Authorized root lock poisoned")? = Some(authorized_root);
    Ok(analysis)
}

fn set_project_root(state: &RuntimeState, root_path: PathBuf) -> Result<(), String> {
    let mut root = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    if root.as_ref() != Some(&root_path) {
        state.external_roots.lock().map_err(|_| "External roots lock poisoned")?.clear();
    }
    *root = Some(root_path);
    state.project_generation.fetch_add(1, Ordering::SeqCst);
    state.preview_generation.fetch_add(1, Ordering::SeqCst);
    Ok(())
}

/// Dependencies of a package inside a monorepo are hoisted to the monorepo root, so the whole
/// workspace is the unit that has to be copied. pnpm declares itself with a file; npm and yarn
/// declare a `workspaces` field in the root manifest.
fn workspace_root(root: &Path) -> PathBuf {
    root.ancestors()
        .take(8)
        .find(|candidate| candidate.join("pnpm-workspace.yaml").is_file() || declares_workspaces(candidate))
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root.to_path_buf())
}

fn declares_workspaces(candidate: &Path) -> bool {
    let manifest = candidate.join("package.json");
    if !manifest.is_file() { return false; }
    fs::read_to_string(&manifest)
        .ok()
        .and_then(|source| serde_json::from_str::<serde_json::Value>(&source).ok())
        .is_some_and(|value| value.get("workspaces").map_or(false, |workspaces| !workspaces.is_null()))
}

fn authorized_path(path: &str, state: &RuntimeState) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    // A file that does not exist yet cannot be canonicalized, so its parent is validated instead.
    let target = match fs::canonicalize(requested) {
        Ok(value) => value,
        Err(_) => {
            let parent = requested.parent().ok_or_else(|| format!("Percorso file non valido: {path}"))?;
            let name = requested.file_name().ok_or_else(|| format!("Percorso file non valido: {path}"))?;
            fs::canonicalize(parent).map_err(|error| format!("{}: {error}", path_string(parent)))?.join(name)
        }
    };
    let guard = state.authorized_root.lock().map_err(|_| "Authorized root lock poisoned")?;
    let root = guard.as_ref().ok_or("Nessun progetto aperto")?;
    if target.starts_with(root) { return Ok(target); }
    drop(guard);
    let external = state.external_roots.lock().map_err(|_| "External roots lock poisoned")?;
    if external.iter().any(|allowed| target.starts_with(allowed)) { return Ok(target); }
    Err("Accesso negato: il file non appartiene al progetto aperto.".into())
}

/// The source roots the editor config resolved from the project's own configuration. A project that
/// renders a shared catalog through an alias declares it here, so its files are editable without the
/// user having to grant anything.
fn declared_source_roots(root: &Path) -> Vec<PathBuf> {
    let Ok(text) = fs::read_to_string(root.join(".framecraft/source-roots.json")) else { return Vec::new() };
    let Ok(entries) = serde_json::from_str::<Vec<String>>(&text) else { return Vec::new() };
    let mut roots: Vec<PathBuf> = entries
        .into_iter()
        .filter_map(|entry| fs::canonicalize(entry).ok())
        .filter(|entry| entry.is_dir())
        .collect();
    roots.sort();
    roots.dedup();
    roots
}

#[tauri::command]
fn read_text_file(path: String, state: State<RuntimeState>) -> Result<String, String> {
    fs::read_to_string(authorized_path(&path, &state)?).map_err(|error| error.to_string())
}

fn write_atomic(target: &Path, content: &str) -> Result<(), String> {
    let parent = target.parent().ok_or("Percorso file non valido")?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary.write_all(content.as_bytes()).map_err(|error| error.to_string())?;
    temporary.as_file().sync_all().map_err(|error| error.to_string())?;
    temporary.persist(target).map_err(|error| error.error.to_string())?;
    Ok(())
}

#[tauri::command]
fn write_text_file(path: String, content: String, state: State<RuntimeState>) -> Result<(), String> {
    let target = authorized_path(&path, &state)?;
    write_atomic(&target, &content)
}

#[tauri::command]
fn create_project_file(relative_path: String, content: String, state: State<RuntimeState>) -> Result<String, String> {
    let relative = Path::new(&relative_path);
    if relative.is_absolute() || relative.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_))) {
        return Err("Percorso file non valido.".into());
    }
    let guard = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    let root = guard.as_ref().ok_or("Nessun progetto aperto")?;
    let target = root.join(relative);
    if !target.starts_with(root) { return Err("Accesso negato.".into()); }
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    write_atomic(&target, &content)?;
    Ok(path_string(&target))
}

#[tauri::command]
fn list_project_source_files(state: State<RuntimeState>) -> Result<Vec<String>, String> {
    let mut roots = Vec::new();
    if let Some(root) = state.project_root.lock().map_err(|_| "Project root lock poisoned")?.clone() { roots.push(root); }
    roots.extend(state.external_roots.lock().map_err(|_| "External roots lock poisoned")?.clone());
    if roots.is_empty() { return Err("Nessun progetto aperto".into()); }
    let mut files = Vec::new();
    for root in roots {
        let walker = WalkDir::new(root).max_depth(14).into_iter().filter_entry(|entry| {
            if entry.depth() == 0 { return true; }
            let name = entry.file_name().to_string_lossy();
            !ignored(&name) && !name.starts_with(".framecraft")
        });
        for entry in walker.filter_map(Result::ok) {
            if !entry.file_type().is_file() { continue; }
            let extension = entry.path().extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
            if !["js", "jsx", "ts", "tsx", "mjs", "cjs"].contains(&extension.as_str()) { continue; }
            files.push(path_string(entry.path()));
            if files.len() >= 1200 { break; }
        }
        if files.len() >= 1200 { break; }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

fn safe_asset_stem(source: &Path) -> String {
    let raw = source.file_stem().and_then(|name| name.to_str()).unwrap_or("immagine");
    let mut result = String::new();
    let mut separator = false;
    for character in raw.chars() {
        if character.is_ascii_alphanumeric() {
            result.push(character.to_ascii_lowercase());
            separator = false;
        } else if !separator && !result.is_empty() {
            result.push('-');
            separator = true;
        }
    }
    let result = result.trim_matches('-');
    if result.is_empty() { "immagine".into() } else { result.into() }
}

fn import_asset_to_project(source: &Path, root: &Path) -> Result<String, String> {
    let source = fs::canonicalize(source).map_err(|error| format!("Immagine non trovata: {error}"))?;
    if !source.is_file() { return Err("Scegli un file immagine valido.".into()); }
    let extension = source.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    const SUPPORTED: [&str; 8] = ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"];
    if !SUPPORTED.contains(&extension.as_str()) { return Err("Formato immagine non supportato.".into()); }

    let directory = root.join("public").join("framecraft-assets");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let stem = safe_asset_stem(&source);
    let mut file_name = format!("{stem}.{extension}");
    let mut target = directory.join(&file_name);
    let mut suffix = 2u32;
    while target.exists() {
        file_name = format!("{stem}-{suffix}.{extension}");
        target = directory.join(&file_name);
        suffix += 1;
    }
    fs::copy(&source, &target).map_err(|error| format!("Impossibile copiare l'immagine nel progetto: {error}"))?;
    Ok(format!("/framecraft-assets/{file_name}"))
}

#[tauri::command]
fn import_project_asset(source: String, state: State<RuntimeState>) -> Result<String, String> {
    let guard = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    let root = guard.as_ref().ok_or("Nessun progetto aperto")?;
    import_asset_to_project(Path::new(&source), root)
}

fn package_command(root: &Path) -> (String, Vec<String>) {
    let local_vite = if cfg!(windows) { root.join("node_modules/.bin/vite.cmd") } else { root.join("node_modules/.bin/vite") };
    // The launcher shim outlives a broken install, so it is used only when the package it forwards
    // to is actually resolvable. Otherwise the package manager gets to resolve vite itself.
    if local_vite.is_file() && root.join("node_modules/vite/package.json").is_file() {
        return (path_string(&local_vite), Vec::new());
    }
    if root.join("pnpm-lock.yaml").exists() { ("pnpm".into(), vec!["exec".into(), "vite".into()]) }
    else if root.join("yarn.lock").exists() { ("yarn".into(), vec!["vite".into()]) }
    else { ("npm".into(), vec!["exec".into(), "vite".into(), "--".into()]) }
}

fn project_vite_config(root: &Path) -> Option<PathBuf> {
    ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"]
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.is_file())
}

fn vite_supports_config_runner(root: &Path) -> bool {
    let Ok(text) = fs::read_to_string(root.join("node_modules/vite/package.json")) else { return false };
    let Ok(package) = serde_json::from_str::<serde_json::Value>(&text) else { return false };
    package.get("version").and_then(|value| value.as_str())
        .and_then(|version| version.split('.').next())
        .and_then(|major| major.parse::<u64>().ok())
        .is_some_and(|major| major >= 6)
}

fn preview_arguments(config_path: &Path, port: u16, config_runner: bool, force: bool) -> Vec<String> {
    let mut args = Vec::new();
    if config_runner { args.extend(["--configLoader".into(), "runner".into()]); }
    if force { args.push("--force".into()); }
    args.extend([
        "--config".into(), path_string(config_path),
        "--host".into(), "127.0.0.1".into(), "--port".into(), port.to_string(), "--strictPort".into(),
    ]);
    args
}

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?.local_addr().map(|address| address.port()).map_err(|error| error.to_string())
}

/// A dev server can take well over a minute to boot the first time it pre-bundles dependencies.
const PREVIEW_START_TIMEOUT: Duration = Duration::from_secs(120);
const PREVIEW_ATTEMPTS: usize = 3;

fn background_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn shell_command(program: &str, args: &[String]) -> Command {
    if cfg!(windows) {
        let mut command = background_command("cmd");
        command.args(["/C", program]);
        command.args(args);
        command
    } else {
        let mut command = background_command(program);
        command.args(args);
        command
    }
}

fn preview_command(root: &Path, vite_args: &[String]) -> Command {
    let script = root.join("node_modules/vite/bin/vite.js");
    if script.is_file() && root.join("node_modules/vite/package.json").is_file() {
        // Track Node itself, not a .cmd launcher that could exit while its server stays alive.
        let local_node = root.join("node_modules/.bin/node.exe");
        let node = if cfg!(windows) && local_node.is_file() { path_string(&local_node) } else { "node".into() };
        let mut command = background_command(node);
        command.arg(path_string(&script)).args(vite_args);
        return command;
    }
    let (program, mut args) = package_command(root);
    args.extend_from_slice(vite_args);
    shell_command(&program, &args)
}

/// A listening socket alone is not enough: readiness requires an HTTP reply too.
fn preview_responds(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(800)) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(2000)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    let request = format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() { return false; }
    let mut buffer = [0u8; 12];
    let mut filled = 0;
    while filled < buffer.len() {
        match stream.read(&mut buffer[filled..]) {
            Ok(0) => break,
            Ok(size) => filled += size,
            Err(_) => break,
        }
    }
    buffer[..filled].starts_with(b"HTTP/")
}

type OutputLog = Arc<Mutex<Vec<String>>>;

fn forward_output(child: &mut Child, log: &OutputLog, session_id: &str, emit: impl Fn(PreviewOutput) + Send + Sync + 'static) -> Vec<thread::JoinHandle<()>> {
    let mut sources: Vec<(&'static str, Box<dyn Read + Send>)> = Vec::new();
    if let Some(stdout) = child.stdout.take() { sources.push(("stdout", Box::new(stdout))); }
    if let Some(stderr) = child.stderr.take() { sources.push(("stderr", Box::new(stderr))); }
    let emit = Arc::new(emit);
    sources.into_iter().map(|(stream, reader)| {
        let emit = Arc::clone(&emit);
        let log = Arc::clone(log);
        let session_id = session_id.to_string();
        thread::spawn(move || {
            for line in BufReader::new(reader).lines().map_while(Result::ok) {
                if let Ok(mut recent) = log.lock() {
                    recent.push(line.clone());
                    if recent.len() > 40 { recent.remove(0); }
                }
                emit(PreviewOutput { stream: stream.into(), line, session_id: session_id.clone() });
            }
        })
    }).collect()
}

fn finish_preview_output(threads: Vec<thread::JoinHandle<()>>) {
    // An inherited pipe can remain open after the launcher exits: it must not block recovery.
    let deadline = Instant::now() + Duration::from_millis(500);
    for reader in threads {
        while !reader.is_finished() && Instant::now() < deadline { thread::sleep(Duration::from_millis(10)); }
        if reader.is_finished() { let _ = reader.join(); }
    }
}

fn stop_managed_preview(slot: &PreviewSlot) -> Result<(), String> {
    let preview = slot.lock().map_err(|_| "Preview lock poisoned")?.take();
    if let Some(mut preview) = preview {
        terminate_child(&mut preview.child);
        finish_preview_output(preview.output_threads);
    }
    Ok(())
}

fn preview_start_current(state: &RuntimeState, root: &Path, generation: u64) -> Result<(), String> {
    let allowed = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    if state.preview_generation.load(Ordering::SeqCst) != generation || allowed.as_deref() != Some(root) {
        return Err("Avvio Vite annullato.".into());
    }
    Ok(())
}

fn stop_previous_preview(state: &RuntimeState, root: &Path, generation: u64) -> Result<(), String> {
    let previous = {
        let mut slot = state.preview.lock().map_err(|_| "Preview lock poisoned")?;
        preview_start_current(state, root, generation)?;
        slot.take()
    };
    if let Some(mut preview) = previous {
        terminate_child(&mut preview.child);
        finish_preview_output(preview.output_threads);
    }
    Ok(())
}

fn attach_preview(state: &RuntimeState, root: &Path, generation: u64, mut preview: ManagedPreview, roots: Vec<PathBuf>) -> Result<(), String> {
    let guards = (|| {
        let slot = state.preview.lock().map_err(|_| "Preview lock poisoned")?;
        let allowed = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
        if state.preview_generation.load(Ordering::SeqCst) != generation || allowed.as_deref() != Some(root) {
            return Err("Avvio Vite annullato.".to_string());
        }
        if slot.is_some() { return Err("Esiste gia' un processo Vite gestito.".to_string()); }
        let external = state.external_roots.lock().map_err(|_| "External roots lock poisoned")?;
        Ok((slot, allowed, external))
    })();
    match guards {
        Ok((mut slot, _allowed, mut external)) => { *external = roots; *slot = Some(preview); Ok(()) }
        Err(error) => {
            terminate_child(&mut preview.child);
            finish_preview_output(preview.output_threads);
            Err(error)
        }
    }
}

fn wait_for_startup_process(child: &mut Child, output_threads: Vec<thread::JoinHandle<()>>, generation: &AtomicU64, expected: u64, timeout: Option<Duration>) -> Result<ExitStatus, String> {
    let started = Instant::now();
    loop {
        if generation.load(Ordering::SeqCst) != expected {
            terminate_child(child);
            finish_preview_output(output_threads);
            return Err("Avvio Vite annullato.".into());
        }
        if timeout.is_some_and(|timeout| started.elapsed() >= timeout) {
            terminate_child(child);
            finish_preview_output(output_threads);
            return Err("Il comando di preparazione non ha risposto in tempo.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => { finish_preview_output(output_threads); return Ok(status); }
            Ok(None) => thread::sleep(Duration::from_millis(150)),
            Err(error) => {
                terminate_child(child);
                finish_preview_output(output_threads);
                return Err(error.to_string());
            }
        }
    }
}

fn monitor_preview(slot: PreviewSlot, session_id: String, notify: impl FnOnce(PreviewExit) + Send + 'static) -> thread::JoinHandle<()> {
    thread::spawn(move || loop {
        let finished = {
            let Ok(mut guard) = slot.lock() else { return };
            let Some(preview) = guard.as_mut() else { return };
            if preview.session_id != session_id { return; }
            let result = match preview.child.try_wait() {
                Ok(None) => None,
                Ok(Some(status)) => Some(Ok(status)),
                Err(error) => Some(Err(error)),
            };
            result.and_then(|result| guard.take().map(|preview| (preview, result)))
        };
        if let Some((mut preview, result)) = finished {
            let (code, mut message) = match result {
                Ok(status) => (status.code(), match status.code() {
                    Some(code) => format!("Vite si è chiuso inaspettatamente (codice {code})."),
                    None => "Vite si è chiuso inaspettatamente.".into(),
                }),
                Err(error) => {
                    let _ = preview.child.kill();
                    let _ = preview.child.wait();
                    (None, format!("Il processo Vite non è più controllabile ed è stato arrestato: {error}"))
                }
            };
            finish_preview_output(preview.output_threads);
            let tail = recent_output(&preview.log);
            if !tail.is_empty() { message.push_str(&format!(" Ultimo output: {tail}")); }
            notify(PreviewExit { session_id, code, message });
            return;
        }
        thread::sleep(Duration::from_millis(250));
    })
}

fn recent_output(log: &OutputLog) -> String {
    let Ok(recent) = log.lock() else { return String::new() };
    // The tail of a Node crash is boilerplate. The line that names the problem is the useful one.
    if let Some(line) = recent.iter().rev().find(|line| line.contains("Cannot find module") || line.contains("Error:") || line.contains("error:")) {
        return line.trim().to_string();
    }
    recent.iter().rev().take(4).rev().map(|line| line.trim()).filter(|line| !line.is_empty()).collect::<Vec<_>>().join(" | ")
}

fn port_conflict(log: &OutputLog) -> bool {
    let text = log.lock().map(|recent| recent.join("\n")).unwrap_or_default().to_lowercase();
    text.contains("eaddrinuse") || text.contains("already in use") || text.contains("port is not available")
}

fn package_manager_available(program: &str, generation: &AtomicU64, expected: u64) -> bool {
    let Ok(mut child) = shell_command(program, &["--version".to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn() else { return false };
    wait_for_startup_process(&mut child, Vec::new(), generation, expected, Some(Duration::from_secs(10)))
        .is_ok_and(|status| status.success())
}

/// A lock file says which manager the project was built with, not which one this machine has.
/// npm ships with Node, so it is the fallback rather than failing the whole preview.
fn usable_package_manager(preferred: &str, app: &AppHandle, session_id: &str, generation: &AtomicU64, expected: u64) -> Result<String, String> {
    let available = preferred == "npm" || package_manager_available(preferred, generation, expected);
    if generation.load(Ordering::SeqCst) != expected { return Err("Avvio Vite annullato.".into()); }
    if available { return Ok(preferred.to_string()); }
    let _ = app.emit("preview-output", PreviewOutput {
        session_id: session_id.into(),
        stream: "stdout".into(),
        line: format!("{preferred} non è disponibile o non risponde: uso npm per installare le dipendenze della copia."),
    });
    Ok("npm".to_string())
}

fn install_dependencies(root: &Path, preferred_manager: &str, app: &AppHandle, session_id: &str, generation: &AtomicU64, expected: u64) -> Result<(), String> {
    let package_manager = usable_package_manager(preferred_manager, app, session_id, generation, expected)?;
    let package_manager = package_manager.as_str();
    let _ = app.emit("preview-output", PreviewOutput {
        session_id: session_id.into(),
        stream: "stdout".into(),
        line: format!("Installazione dipendenze con {package_manager}: la prima apertura può richiedere qualche minuto."),
    });
    let log: OutputLog = Arc::new(Mutex::new(Vec::new()));
    let mut child = shell_command(package_manager, &["install".to_string()])
        .current_dir(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Impossibile eseguire {package_manager} install: {error}"))?;
    let handle = app.clone();
    let output_threads = forward_output(&mut child, &log, session_id, move |output| { let _ = handle.emit("preview-output", output); });
    let status = wait_for_startup_process(&mut child, output_threads, generation, expected, None)?;
    if status.success() { return Ok(()); }
    let tail = recent_output(&log);
    Err(if tail.is_empty() { format!("{package_manager} install non è riuscito.") } else { format!("{package_manager} install non è riuscito: {tail}") })
}

fn terminate_child(child: &mut Child) {
    if matches!(child.try_wait(), Ok(Some(_))) { return; }
    #[cfg(windows)]
    {
        let _ = background_command("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

const EDITOR_PREVIEW_PLUGIN_RESOURCE: &str = "scripts/framecraft-vite-plugin.mjs";

fn editor_plugin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(EDITOR_PREVIEW_PLUGIN_RESOURCE);
    if development.exists() { return Ok(development); }
    app.path().resource_dir().map_err(|error| error.to_string()).map(|path| path.join(EDITOR_PREVIEW_PLUGIN_RESOURCE))
}

fn file_url(path: &Path) -> String {
    format!("file:///{}", path_string(path).replace('\\', "/").replace(' ', "%20"))
}

#[tauri::command]
async fn start_preview(root: String, force: Option<bool>, session_id: String, on_exit: tauri::ipc::Channel<PreviewExit>, app: AppHandle) -> Result<PreviewSession, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RuntimeState>();
        start_preview_inner(root, force, session_id, on_exit, app.clone(), state)
    }).await.map_err(|error| format!("Avvio Vite interrotto: {error}"))?
}

fn start_preview_inner(root: String, force: Option<bool>, session_id: String, on_exit: tauri::ipc::Channel<PreviewExit>, app: AppHandle, state: State<RuntimeState>) -> Result<PreviewSession, String> {
    if session_id.is_empty() || session_id.len() > 128 { return Err("Identificativo della preview non valido.".into()); }
    let root_path = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let generation = {
        let allowed = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
        if allowed.as_ref() != Some(&root_path) { return Err("Apri e analizza il progetto prima di avviare la preview.".into()); }
        state.preview_generation.fetch_add(1, Ordering::SeqCst).wrapping_add(1)
    };
    let analysis = analyze(&root_path)?;
    if analysis.framework != "vite" { return Err("La prima milestone supporta la preview completa solo per Vite.".into()); }
    if !analysis.missing_dependencies.is_empty() {
        let listed = analysis.missing_dependencies.iter().take(4).cloned().collect::<Vec<_>>().join(", ");
        let extra = analysis.missing_dependencies.len().saturating_sub(4);
        let _ = app.emit("preview-output", PreviewOutput {
            session_id: session_id.clone(),
            stream: "stdout".into(),
            line: format!("Dipendenze non risolvibili nella copia di lavoro: {listed}{}. Le installo nella copia; il progetto originale non viene toccato.",
                if extra > 0 { format!(" e altre {extra}") } else { String::new() }),
        });
        unlink_dependency_directory(&root_path)?;
        install_dependencies(&root_path, &analysis.package_manager, &app, &session_id, &state.preview_generation, generation)?;
        let still_missing = missing_dependencies(&root_path, &analysis.dependencies);
        if !still_missing.is_empty() {
            return Err(format!(
                "Dopo l'installazione con {} restano irrisolvibili: {}. Il progetto originale ha un node_modules incompleto: prova a eseguire '{} install' nella cartella originale.",
                analysis.package_manager, still_missing.join(", "), analysis.package_manager));
        }
    }
    stop_previous_preview(&state, &root_path, generation)?;
    let framecraft_dir = root_path.join(".framecraft");
    fs::create_dir_all(&framecraft_dir).map_err(|error| error.to_string())?;
    let plugin_url = file_url(&editor_plugin_path(&app)?);
    let fallback_config = framecraft_dir.join("empty.config.mjs");
    let original_config = match project_vite_config(&root_path) {
        Some(path) => path,
        None => {
            fs::write(&fallback_config, "export default {};\n").map_err(|error| error.to_string())?;
            fallback_config
        }
    };
    let config = EDITOR_CONFIG_TEMPLATE
        .replace("__FRAMECRAFT_PLUGIN_URL__", &plugin_url)
        .replace("__FRAMECRAFT_CONFIG_URL__", &file_url(&original_config))
        .replace("__FRAMECRAFT_ROOT__", &path_string(&root_path).replace('\\', "\\\\"));
    let config_path = framecraft_dir.join("vite.editor.config.mjs");
    fs::write(&config_path, config).map_err(|error| error.to_string())?;

    let mut failure = String::new();
    for attempt in 1..=PREVIEW_ATTEMPTS {
        preview_start_current(&state, &root_path, generation)?;
        // The port is chosen, released and immediately handed to Vite, so another process can still
        // win the race. When that happens the child dies at once and we simply pick a different port.
        let port = free_port()?;
        let args = preview_arguments(&config_path, port, vite_supports_config_runner(&root_path), force.unwrap_or(false));
        let log: OutputLog = Arc::new(Mutex::new(Vec::new()));
        let mut command = preview_command(&root_path, &args);
        let program = command.get_program().to_string_lossy().into_owned();
        let mut child = command
            .current_dir(&root_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Impossibile avviare {program}: {error}"))?;
        let handle = app.clone();
        let mut output_threads = Some(forward_output(&mut child, &log, &session_id, move |output| { let _ = handle.emit("preview-output", output); }));

        let started = Instant::now();
        let mut announced = 0;
        loop {
            if let Err(error) = preview_start_current(&state, &root_path, generation) {
                terminate_child(&mut child);
                finish_preview_output(output_threads.take().unwrap_or_default());
                return Err(error);
            }
            if preview_responds(port) {
                // The config has run by now, so the roots it resolved are on disk.
                let roots = declared_source_roots(&root_path);
                attach_preview(&state, &root_path, generation, ManagedPreview {
                    child, session_id: session_id.clone(), port, log,
                    output_threads: output_threads.take().unwrap_or_default(),
                }, roots.clone())?;
                let handle = app.clone();
                monitor_preview(Arc::clone(&state.preview), session_id.clone(), move |exit| {
                    let _ = handle.emit("preview-exit", exit.clone());
                    let _ = on_exit.send(exit);
                });
                return Ok(PreviewSession {
                    session_id,
                    url: format!("http://127.0.0.1:{port}"),
                    port,
                    source_roots: roots.iter().map(|root| path_string(root)).collect(),
                });
            }
            if child.try_wait().map_err(|error| error.to_string())?.is_some() {
                finish_preview_output(output_threads.take().unwrap_or_default());
                let tail = recent_output(&log);
                failure = if tail.is_empty() { format!("{program} si è chiuso subito dopo l'avvio.") } else { tail };
                break;
            }
            let elapsed = started.elapsed();
            if elapsed >= PREVIEW_START_TIMEOUT {
                terminate_child(&mut child);
                finish_preview_output(output_threads.take().unwrap_or_default());
                let tail = recent_output(&log);
                failure = format!("Vite non ha risposto entro {} secondi.{}", PREVIEW_START_TIMEOUT.as_secs(),
                    if tail.is_empty() { String::new() } else { format!(" Ultimo output: {tail}") });
                // A server that is merely slow will not become faster on a second attempt.
                return Err(failure);
            }
            // Long dependency pre-bundling looks like a freeze without a sign of life.
            if elapsed.as_secs() / 15 > announced {
                announced = elapsed.as_secs() / 15;
                let _ = app.emit("preview-output", PreviewOutput {
                    session_id: session_id.clone(),
                    stream: "stdout".into(),
                    line: format!("Vite si sta ancora avviando… ({}s)", elapsed.as_secs()),
                });
            }
            thread::sleep(Duration::from_millis(150));
        }
        if attempt < PREVIEW_ATTEMPTS && port_conflict(&log) { continue; }
        break;
    }
    Err(format!("Vite non si è avviato. {failure}"))
}

/// The exported copy is meant to be opened and run elsewhere, so installed dependencies and every
/// piece of Framecraft bookkeeping are left behind: `npm install` rebuilds node_modules anywhere.
fn export_contents(source: &Path, destination: &Path, warnings: &mut Vec<String>) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for item in fs::read_dir(source).map_err(|error| error.to_string())? {
        let item = match item {
            Ok(value) => value,
            Err(error) => { warnings.push(format!("Voce illeggibile in {}: {error}", path_string(source))); continue; }
        };
        let name = item.file_name().to_string_lossy().into_owned();
        if copy_ignored(&name) || name == "node_modules" { continue; }
        let source_path = item.path();
        let destination_path = destination.join(&name);
        let file_type = match item.file_type() {
            Ok(value) => value,
            Err(error) => { warnings.push(format!("Tipo di file sconosciuto per {}: {error}", path_string(&source_path))); continue; }
        };
        if file_type.is_dir() {
            if let Err(error) = export_contents(&source_path, &destination_path, warnings) {
                warnings.push(format!("Cartella saltata {}: {error}", path_string(&source_path)));
            }
        } else if file_type.is_file() {
            if let Err(error) = fs::copy(&source_path, &destination_path) {
                warnings.push(format!("File saltato {}: {error}", path_string(&source_path)));
            }
        } else {
            warnings.push(format!("Collegamento saltato {}", path_string(&source_path)));
        }
    }
    Ok(())
}

/// Saving under a new name is the only way edits leave the hidden working copy. It always writes a
/// folder that does not exist yet: no existing project can be overwritten by a misplaced click.
fn export_to(root: &Path, destination: &str) -> Result<ExportResult, String> {
    let chosen = fs::canonicalize(destination).map_err(|error| format!("{destination}: {error}"))?;
    if !chosen.is_dir() { return Err("Scegli una cartella esistente in cui salvare il progetto.".into()); }
    if chosen.starts_with(root) { return Err("Scegli una cartella fuori dalla copia di lavoro del progetto.".into()); }
    let base = root.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| "progetto".into());
    let mut target = chosen.join(&base);
    let mut suffix = 2u32;
    while target.exists() {
        if suffix > 99 { return Err(format!("Esistono già troppe cartelle chiamate {base} qui: scegli un'altra destinazione.")); }
        target = chosen.join(format!("{base}-{suffix}"));
        suffix += 1;
    }
    let mut warnings = Vec::new();
    if let Err(error) = export_contents(root, &target, &mut warnings) {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    if !target.join("package.json").is_file() {
        let _ = fs::remove_dir_all(&target);
        return Err("La copia salvata non contiene package.json: verifica i permessi sulla cartella scelta.".into());
    }
    let skipped = warnings.len();
    warnings.truncate(8);
    if skipped > 8 { warnings.push(format!("…e altri {} elementi saltati durante il salvataggio.", skipped - 8)); }
    Ok(ExportResult { root: path_string(&target), warnings })
}

#[tauri::command]
fn export_project(destination: String, state: State<RuntimeState>) -> Result<ExportResult, String> {
    let root = state.project_root.lock().map_err(|_| "Project root lock poisoned")?.clone().ok_or("Nessun progetto aperto")?;
    export_to(&root, &destination)
}

#[tauri::command]
fn stop_preview(state: State<RuntimeState>) -> Result<(), String> {
    state.preview_generation.fetch_add(1, Ordering::SeqCst);
    stop_managed_preview(&state.preview)
}

/// Leaving a project releases the watcher and the granted paths too, not just the dev server.
#[tauri::command]
fn close_project(state: State<RuntimeState>) -> Result<(), String> {
    {
        let mut root = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
        root.take();
        state.project_generation.fetch_add(1, Ordering::SeqCst);
        state.preview_generation.fetch_add(1, Ordering::SeqCst);
    }
    let stopped = stop_managed_preview(&state.preview);
    let _ = state.watcher.lock().map(|mut watcher| watcher.take());
    let _ = state.authorized_root.lock().map(|mut root| root.take());
    let _ = state.external_roots.lock().map(|mut roots| roots.clear());
    stopped
}

#[tauri::command]
fn create_vite_project(root: String, files: Option<Vec<NewProjectFile>>) -> Result<ProjectAnalysis, String> {
    let root_path = PathBuf::from(root);
    let generated_files = files.unwrap_or_default();
    let is_generated_project = !generated_files.is_empty();
    fs::create_dir_all(&root_path).map_err(|error| error.to_string())?;
    if fs::read_dir(&root_path).map_err(|error| error.to_string())?.next().is_some() { return Err("Per creare un progetto scegli una cartella vuota.".into()); }
    fs::create_dir_all(root_path.join("src/pages")).map_err(|error| error.to_string())?;
    let name = root_path.file_name().unwrap_or_default().to_string_lossy().to_lowercase().replace(' ', "-");
    fs::write(root_path.join("package.json"), format!(r#"{{
  "name": "{name}", "private": true, "version": "0.0.0", "type": "module",
  "scripts": {{ "dev": "vite", "build": "tsc -b && vite build" }},
  "dependencies": {{ "react": "^19.1.1", "react-dom": "^19.1.1", "react-router-dom": "^7.8.2" }},
  "devDependencies": {{ "@vitejs/plugin-react": "^5.0.2", "vite": "^7.1.3", "typescript": "~5.9.2", "@types/react": "^19.1.12", "@types/react-dom": "^19.1.9" }}
}}"#)).map_err(|error| error.to_string())?;
    fs::write(root_path.join("index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>").map_err(|error| error.to_string())?;
    fs::write(root_path.join("tsconfig.json"), r#"{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","jsx":"react-jsx","strict":true,"noEmit":true},"include":["src"]}"#).map_err(|error| error.to_string())?;
    fs::write(root_path.join("vite.config.ts"), "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n").map_err(|error| error.to_string())?;
    fs::write(root_path.join("src/main.tsx"), "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport { App } from './App';\nimport './styles.css';\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);\n").map_err(|error| error.to_string())?;
    if !is_generated_project {
        fs::write(root_path.join("src/App.tsx"), "import { Link, Route, Routes } from 'react-router-dom';\nimport { HomePage } from './pages/HomePage';\nimport { AboutPage } from './pages/AboutPage';\n\nexport function App() {\n  return (\n    <>\n      <nav><Link to=\"/\">Home</Link><Link to=\"/about\">About</Link></nav>\n      <Routes>\n        <Route path=\"/\" element={<HomePage />} />\n        <Route path=\"/about\" element={<AboutPage />} />\n      </Routes>\n    </>\n  );\n}\n").map_err(|error| error.to_string())?;
        fs::write(root_path.join("src/pages/HomePage.tsx"), "export function HomePage() {\n  return <main className=\"page\"><h1>Start building</h1><p>Switch to Edit mode and select any element.</p><button type=\"button\">Get started</button></main>;\n}\n").map_err(|error| error.to_string())?;
        fs::write(root_path.join("src/pages/AboutPage.tsx"), "export function AboutPage() {\n  return <main className=\"page\"><h1>About</h1><p>This is your second editable page.</p></main>;\n}\n").map_err(|error| error.to_string())?;
        fs::write(root_path.join("src/styles.css"), "* { box-sizing: border-box; }\nbody { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f6f7fb; color: #16181d; }\nnav { display: flex; gap: 18px; padding: 18px 24px; background: white; border-bottom: 1px solid #e6e8ee; }\nnav a { color: #5146c7; text-decoration: none; font-weight: 600; }\n.page { min-height: calc(100vh - 61px); display: grid; place-content: center; gap: 16px; text-align: center; }\nbutton { margin: auto; padding: 12px 18px; border: 0; border-radius: 8px; background: #6558e8; color: white; }\n").map_err(|error| error.to_string())?;
    }
    for file in generated_files {
        let relative = Path::new(&file.path);
        if relative.is_absolute() || relative.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_))) {
            return Err(format!("File del nuovo progetto fuori dalla cartella consentita: {}", file.path));
        }
        let target = root_path.join(relative);
        if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
        match file.source {
            Some(source) => {
                let source = Path::new(&source);
                if !source.is_file() { return Err(format!("Immagine del nuovo progetto non trovata: {}", source.display())); }
                fs::copy(source, &target).map_err(|error| format!("Impossibile copiare {}: {error}", source.display()))?;
            }
            None => fs::write(target, file.content).map_err(|error| error.to_string())?,
        }
    }
    let marker = WorkingCopyMarker { original_workspace: None, created_at: SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs() };
    fs::write(root_path.join(".framecraft-workspace.json"), serde_json::to_string_pretty(&marker).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    analyze(&root_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RuntimeState::default())
        .invoke_handler(tauri::generate_handler![get_editor_session, editor_draft::read_editor_draft, editor_draft::write_editor_draft, editor_draft::clear_editor_draft, connection_config::read_connection_configuration, connection_config::save_connection_configuration, connection_config::read_alarm_configuration, connection_config::save_alarm_configuration, create_working_copy, analyze_project, read_text_file, write_text_file, create_project_file, list_project_source_files, import_project_asset, export_project, start_preview, stop_preview, close_project, create_vite_project])
        .build(tauri::generate_context!())
        .expect("error while building Framecraft");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle.state::<RuntimeState>();
            state.preview_generation.fetch_add(1, Ordering::SeqCst);
            let _ = stop_managed_preview(&state.preview);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_preview_resources_match_the_backend_lookup_path() {
        use tauri::utils::{config::BundleResources, resources::ResourcePaths};
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let resources: BundleResources = serde_json::from_value(config["bundle"]["resources"].clone()).unwrap();
        let resolved = match &resources {
            BundleResources::List(paths) => ResourcePaths::new(paths, true).iter().collect::<Result<Vec<_>, _>>(),
            BundleResources::Map(paths) => ResourcePaths::from_map(paths, true).iter().collect::<Result<Vec<_>, _>>(),
        }.unwrap();
        for target in [EDITOR_PREVIEW_PLUGIN_RESOURCE, "scripts/framecraft-snap.mjs", "scripts/framecraft-picking.mjs", "scripts/hmi-property-flashing.mjs"] {
            let resource = resolved.iter().find(|resource| resource.target() == Path::new(target))
                .unwrap_or_else(|| panic!("Missing bundled preview resource at backend path: {target}"));
            assert!(resource.path().is_file(), "Preview resource source does not exist: {}", resource.path().display());
        }
    }

    #[test]
    fn preview_child_process() {
        let Ok(mode) = std::env::var("FRAMECRAFT_PREVIEW_TEST_MODE") else { return };
        let port: u16 = std::env::var("FRAMECRAFT_PREVIEW_TEST_PORT").unwrap().parse().unwrap();
        let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if let Ok((mut stream, _)) = listener.accept() {
                stream.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
                let mut request = [0u8; 1024];
                let _ = stream.read(&mut request);
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK");
                if mode != "idle" {
                    eprintln!("Error: controlled preview exit after HTTP readiness");
                    std::process::exit(if mode == "exit0" { 0 } else { 7 });
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn preview_process(mode: &str, session_id: &str) -> (ManagedPreview, u16) {
        let port = free_port().unwrap();
        let mut child = background_command(std::env::current_exe().unwrap())
            .args(["--exact", "tests::preview_child_process", "--nocapture"])
            .env("FRAMECRAFT_PREVIEW_TEST_MODE", mode)
            .env("FRAMECRAFT_PREVIEW_TEST_PORT", port.to_string())
            .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
        let log = Arc::new(Mutex::new(Vec::new()));
        let output_threads = forward_output(&mut child, &log, session_id, |_| {});
        (ManagedPreview { child, session_id: session_id.into(), port, log, output_threads }, port)
    }

    fn wait_for_test_preview(port: u16) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !preview_responds(port) {
            assert!(Instant::now() < deadline, "Controlled HTTP preview did not start");
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn monitor_reports_real_process_exit_after_http_readiness() {
        let (preview, port) = preview_process("exit7", "crash");
        let slot = Arc::new(Mutex::new(Some(preview)));
        let (send, receive) = std::sync::mpsc::channel();
        let monitor = monitor_preview(Arc::clone(&slot), "crash".into(), move |exit| { let _ = send.send(exit); });
        wait_for_test_preview(port);
        let exit = receive.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(exit.session_id, "crash");
        assert_eq!(exit.code, Some(7));
        assert!(exit.message.contains("Error: controlled preview exit"));
        assert!(slot.lock().unwrap().is_none());
        monitor.join().unwrap();
        assert!(!preview_responds(port));
    }

    #[test]
    fn an_unrequested_successful_exit_is_still_reported() {
        let (preview, port) = preview_process("exit0", "exit-zero");
        let slot = Arc::new(Mutex::new(Some(preview)));
        let (send, receive) = std::sync::mpsc::channel();
        let monitor = monitor_preview(Arc::clone(&slot), "exit-zero".into(), move |exit| { let _ = send.send(exit); });
        wait_for_test_preview(port);
        let exit = receive.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(exit.code, Some(0));
        assert!(exit.message.contains("inaspettatamente"));
        monitor.join().unwrap();
    }

    #[test]
    fn an_explicit_stop_does_not_report_a_crash() {
        let (preview, port) = preview_process("idle", "requested-stop");
        let slot = Arc::new(Mutex::new(Some(preview)));
        let (send, receive) = std::sync::mpsc::channel();
        let monitor = monitor_preview(Arc::clone(&slot), "requested-stop".into(), move |exit| { let _ = send.send(exit); });
        wait_for_test_preview(port);
        stop_managed_preview(&slot).unwrap();
        monitor.join().unwrap();
        assert!(matches!(receive.try_recv(), Err(std::sync::mpsc::TryRecvError::Disconnected)));
        assert!(!preview_responds(port));
    }

    #[test]
    fn replacing_a_session_cancels_only_the_old_monitor() {
        let (old, old_port) = preview_process("idle", "old");
        let slot = Arc::new(Mutex::new(Some(old)));
        let (send_old, receive_old) = std::sync::mpsc::channel();
        let old_monitor = monitor_preview(Arc::clone(&slot), "old".into(), move |exit| { let _ = send_old.send(exit); });
        wait_for_test_preview(old_port);
        let (new, new_port) = preview_process("exit7", "new");
        let mut old = slot.lock().unwrap().replace(new).unwrap();
        let (send_new, receive_new) = std::sync::mpsc::channel();
        let new_monitor = monitor_preview(Arc::clone(&slot), "new".into(), move |exit| { let _ = send_new.send(exit); });
        terminate_child(&mut old.child);
        finish_preview_output(old.output_threads);
        wait_for_test_preview(new_port);
        assert_eq!(receive_new.recv_timeout(Duration::from_secs(5)).unwrap().session_id, "new");
        old_monitor.join().unwrap(); new_monitor.join().unwrap();
        assert!(matches!(receive_old.try_recv(), Err(std::sync::mpsc::TryRecvError::Disconnected)));
    }

    #[test]
    fn output_cleanup_is_bounded_when_a_reader_does_not_reach_eof() {
        let (release, wait) = std::sync::mpsc::channel::<()>();
        let reader = thread::spawn(move || { let _ = wait.recv_timeout(Duration::from_secs(2)); });
        let start = Instant::now();
        finish_preview_output(vec![reader]);
        let _ = release.send(());
        assert!(start.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn preview_messages_use_the_frontend_session_contract() {
        let exit = PreviewExit { session_id: "run".into(), code: None, message: "Stopped".into() };
        let value = serde_json::to_value(exit).unwrap();
        assert_eq!(value["sessionId"], "run");
        assert!(value["code"].is_null());
        let output = PreviewOutput { session_id: "run".into(), stream: "stderr".into(), line: "Error".into() };
        assert_eq!(serde_json::to_value(output).unwrap()["sessionId"], "run");
    }

    struct PreviewTestGuard(PreviewSlot);
    impl Drop for PreviewTestGuard {
        fn drop(&mut self) { let _ = stop_managed_preview(&self.0); }
    }

    #[test]
    fn editor_session_query_does_not_reopen_a_closed_project() {
        let state = RuntimeState::default();
        state.external_roots.lock().unwrap().push(PathBuf::from("stale-template"));
        let session = editor_session_snapshot(&state).unwrap();
        assert!(session.project.is_none());
        assert!(session.preview.is_none());
        assert!(session.authorized_root.is_none());
        assert!(session.external_roots.is_empty());
        assert_eq!(state.preview_generation.load(Ordering::SeqCst), 0);
        assert!(state.project_root.lock().unwrap().is_none());
        assert_eq!(state.external_roots.lock().unwrap().len(), 1);
    }

    fn recovery_project(root: &Path, state: &RuntimeState) {
        fs::write(root.join("package.json"), r#"{"name":"recovery","dependencies":{"react":"19","vite":"7"}}"#).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/App.jsx"), "export default function App(){return null}").unwrap();
        set_project_root(state, root.to_path_buf()).unwrap();
        *state.authorized_root.lock().unwrap() = Some(root.to_path_buf());
        state.external_roots.lock().unwrap().push(root.join("linked-template"));
    }

    #[test]
    fn editor_session_query_reports_only_its_live_child_without_changing_permissions() {
        let directory = tempfile::tempdir().unwrap();
        let state = RuntimeState::default();
        recovery_project(directory.path(), &state);
        let (preview, port) = preview_process("idle", "recovery-live");
        *state.preview.lock().unwrap() = Some(preview);
        let _cleanup = PreviewTestGuard(Arc::clone(&state.preview));
        wait_for_test_preview(port);
        let generation = state.preview_generation.load(Ordering::SeqCst);
        let session = editor_session_snapshot(&state).unwrap();
        assert_eq!(session.project.as_ref().unwrap().name, "recovery");
        assert_eq!(session.project.as_ref().unwrap().root, path_string(directory.path()));
        assert_eq!(session.preview.as_ref().unwrap().port, port);
        assert_eq!(session.preview.as_ref().unwrap().session_id, "recovery-live");
        assert_eq!(session.authorized_root, Some(path_string(directory.path())));
        assert_eq!(session.external_roots, vec![path_string(&directory.path().join("linked-template"))]);
        assert_eq!(state.preview_generation.load(Ordering::SeqCst), generation);
        assert_eq!(state.preview.lock().unwrap().as_ref().unwrap().session_id, "recovery-live");
        let json = serde_json::to_value(session).unwrap();
        assert_eq!(json["preview"]["sessionId"], "recovery-live");
        assert!(json.get("authorizedRoot").is_some());
        assert!(preview_responds(port));
    }

    #[test]
    fn editor_session_query_does_not_present_an_exited_child_as_ready() {
        let directory = tempfile::tempdir().unwrap();
        let state = RuntimeState::default();
        recovery_project(directory.path(), &state);
        let (mut preview, _) = preview_process("idle", "recovery-exited");
        terminate_child(&mut preview.child);
        *state.preview.lock().unwrap() = Some(preview);
        let _cleanup = PreviewTestGuard(Arc::clone(&state.preview));
        let session = editor_session_snapshot(&state).unwrap();
        assert!(session.project.is_some());
        assert!(session.preview.is_none());
        assert!(state.preview.lock().unwrap().is_some());
    }

    #[test]
    fn refreshing_the_same_project_retains_its_template_roots_but_switching_clears_them() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("panel");
        let shared = directory.path().join("templates");
        let state = RuntimeState::default();
        set_project_root(&state, root.clone()).unwrap();
        *state.external_roots.lock().unwrap() = vec![shared.clone()];
        set_project_root(&state, root).unwrap();
        assert_eq!(*state.external_roots.lock().unwrap(), vec![shared]);
        set_project_root(&state, directory.path().join("other-panel")).unwrap();
        assert!(state.external_roots.lock().unwrap().is_empty());
    }

    #[test]
    fn a_canceled_start_cannot_attach_or_stop_a_newer_server() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let state = RuntimeState::default();
        *state.project_root.lock().unwrap() = Some(root.to_path_buf());
        state.preview_generation.store(2, Ordering::SeqCst);
        let (current, current_port) = preview_process("idle", "newer");
        *state.preview.lock().unwrap() = Some(current);
        let _cleanup = PreviewTestGuard(Arc::clone(&state.preview));
        wait_for_test_preview(current_port);
        let (old, old_port) = preview_process("idle", "canceled");
        wait_for_test_preview(old_port);
        assert!(attach_preview(&state, root, 1, old, vec![root.join("stale-source")]).unwrap_err().contains("annullato"));
        assert!(stop_previous_preview(&state, root, 1).unwrap_err().contains("annullato"));
        assert!(!preview_responds(old_port));
        assert!(preview_responds(current_port));
        assert_eq!(state.preview.lock().unwrap().as_ref().unwrap().session_id, "newer");
        assert!(state.external_roots.lock().unwrap().is_empty());
    }

    #[test]
    fn a_closed_project_cannot_authorize_late_source_roots_or_attach_a_server() {
        let directory = tempfile::tempdir().unwrap();
        let state = RuntimeState::default();
        state.preview_generation.store(1, Ordering::SeqCst);
        let (preview, port) = preview_process("idle", "closed");
        wait_for_test_preview(port);
        assert!(attach_preview(&state, directory.path(), 1, preview, vec![directory.path().to_path_buf()]).is_err());
        assert!(state.preview.lock().unwrap().is_none());
        assert!(state.external_roots.lock().unwrap().is_empty());
        assert!(!preview_responds(port));
    }

    #[test]
    fn preparation_is_cancelable_while_its_owned_process_is_still_running() {
        let (mut preview, port) = preview_process("idle", "preparation");
        wait_for_test_preview(port);
        let generation = Arc::new(AtomicU64::new(1));
        let current = Arc::clone(&generation);
        let (ready, waiting) = std::sync::mpsc::channel();
        let worker = thread::spawn(move || {
            ready.send(()).unwrap();
            wait_for_startup_process(&mut preview.child, preview.output_threads, &current, 1, Some(Duration::from_secs(5)))
        });
        waiting.recv_timeout(Duration::from_secs(2)).unwrap();
        generation.store(2, Ordering::SeqCst);
        assert!(worker.join().unwrap().unwrap_err().contains("annullato"));
        assert!(!preview_responds(port));
    }

    #[test]
    fn a_preparation_probe_has_a_deadline_and_reaps_only_its_owned_child() {
        let (mut preview, port) = preview_process("idle", "probe");
        wait_for_test_preview(port);
        let generation = AtomicU64::new(1);
        assert!(wait_for_startup_process(&mut preview.child, preview.output_threads, &generation, 1, Some(Duration::from_millis(10)))
            .unwrap_err().contains("non ha risposto"));
        assert!(!preview_responds(port));
    }

    #[test]
    fn preparation_preserves_the_real_exit_code_and_drains_its_error() {
        let (mut preview, port) = preview_process("exit7", "preparation-exit");
        wait_for_test_preview(port);
        let generation = AtomicU64::new(1);
        let status = wait_for_startup_process(&mut preview.child, preview.output_threads, &generation, 1, Some(Duration::from_secs(5))).unwrap();
        assert_eq!(status.code(), Some(7));
        assert!(recent_output(&preview.log).contains("Error: controlled preview exit"));
    }

    #[test]
    fn the_local_vite_cli_is_started_as_a_direct_node_child_with_safe_paths() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("pannello con spazi");
        let script = root.join("node_modules/vite/bin/vite.js");
        fs::create_dir_all(script.parent().unwrap()).unwrap();
        fs::write(&script, "// fixture").unwrap();
        write_package(&root, "vite");
        let args = preview_arguments(&root.join("vite.config.mjs"), 4173, true, true);
        let command = preview_command(&root, &args);
        assert_eq!(command.get_program(), "node");
        let actual = command.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert_eq!(actual[0], path_string(&script));
        assert_eq!(&actual[1..], args.as_slice());
        assert!(!actual.iter().any(|arg| arg == "/C" || arg == "exec" || arg.contains(r"\\?\")));
    }

    #[cfg(windows)]
    #[test]
    fn a_local_node_executable_is_used_like_the_npm_launcher() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let script = root.join("node_modules/vite/bin/vite.js");
        fs::create_dir_all(script.parent().unwrap()).unwrap();
        fs::write(script, "// fixture").unwrap();
        write_package(root, "vite");
        let node = root.join("node_modules/.bin/node.exe");
        fs::create_dir_all(node.parent().unwrap()).unwrap(); fs::write(&node, "fixture").unwrap();
        assert_eq!(preview_command(root, &[]).get_program(), path_string(&node).as_str());
    }

    #[test]
    fn the_real_installed_vite_reports_a_crash_and_can_be_started_again() {
        let editor_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let config = directory.path().join("vite.test.config.mjs");
        fs::write(&config, "export default {};\n").unwrap();
        fs::write(directory.path().join("index.html"), "<main>Controlled preview</main>").unwrap();
        let slot = Arc::new(Mutex::new(None));
        let _cleanup = PreviewTestGuard(Arc::clone(&slot));
        for (session_id, crash) in [("real-crash", true), ("real-recovery", false)] {
            let port = free_port().unwrap();
            let args = preview_arguments(&config, port, vite_supports_config_runner(editor_root), false);
            let mut child = preview_command(editor_root, &args).current_dir(directory.path())
                .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
            let log = Arc::new(Mutex::new(Vec::new()));
            let output_threads = forward_output(&mut child, &log, session_id, |_| {});
            *slot.lock().unwrap() = Some(ManagedPreview { child, session_id: session_id.into(), port, log, output_threads });
            wait_for_test_preview(port);
            let (send, receive) = std::sync::mpsc::channel();
            let monitor = monitor_preview(Arc::clone(&slot), session_id.into(), move |exit| { let _ = send.send(exit); });
            if crash {
                slot.lock().unwrap().as_mut().unwrap().child.kill().unwrap();
                let exit = receive.recv_timeout(Duration::from_secs(5)).unwrap();
                assert_eq!(exit.session_id, session_id);
                assert!(exit.message.contains("inaspettatamente"));
            } else {
                stop_managed_preview(&slot).unwrap();
            }
            monitor.join().unwrap();
            assert!(!preview_responds(port));
        }
    }

    #[test]
    fn created_project_is_a_real_vite_react_project() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("sample-app");
        let analysis = create_vite_project(path_string(&root), None).unwrap();
        assert_eq!(analysis.framework, "vite");
        assert_eq!(analysis.language, "typescript");
        assert!(analysis.entry_files.iter().any(|path| path.ends_with("App.tsx")));
        assert!(root.join("src/styles.css").exists());
        assert!(root.join("src/pages/HomePage.tsx").exists());
        assert!(analysis.dependencies.iter().any(|item| item == "react-router-dom"));
    }

    #[test]
    fn created_project_accepts_safe_generated_hmi_files() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("hmi-panel");
        let files = vec![
            NewProjectFile { path: "src/App.tsx".into(), content: "export const App = () => <main data-hmi-type=\"HmiScreen\" />;".into(), source: None },
            NewProjectFile { path: "panel.json".into(), content: "{\"name\":\"HMI\"}".into(), source: None },
        ];
        create_vite_project(path_string(&root), Some(files)).unwrap();
        assert!(fs::read_to_string(root.join("src/App.tsx")).unwrap().contains("HmiScreen"));
        assert!(root.join("panel.json").is_file());
        assert!(!root.join("src/pages/HomePage.tsx").exists());
        assert!(!root.join("src/pages/AboutPage.tsx").exists());
    }

    #[test]
    fn atomic_write_replaces_the_complete_file() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("App.tsx");
        fs::write(&target, "old").unwrap();
        write_atomic(&target, "new source").unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), "new source");
    }

    #[test]
    fn imported_images_are_copied_inside_the_project_with_safe_unique_names() {
        let directory = tempfile::tempdir().unwrap();
        let project = directory.path().join("project");
        fs::create_dir_all(&project).unwrap();
        let source = directory.path().join("Vista Macchina.PNG");
        fs::write(&source, b"image-bytes").unwrap();

        let first = import_asset_to_project(&source, &project).unwrap();
        let second = import_asset_to_project(&source, &project).unwrap();

        assert_eq!(first, "/framecraft-assets/vista-macchina.png");
        assert_eq!(second, "/framecraft-assets/vista-macchina-2.png");
        assert_eq!(fs::read(project.join("public/framecraft-assets/vista-macchina.png")).unwrap(), b"image-bytes");
    }

    #[cfg(windows)]
    #[test]
    fn windows_verbatim_paths_are_safe_for_node_tools() {
        assert_eq!(path_string(Path::new(r"\\?\C:\work\project")), r"C:\work\project");
        assert_eq!(path_string(Path::new(r"\\?\UNC\server\share")), r"\\server\share");
    }

    #[cfg(windows)]
    #[test]
    fn vite_never_receives_a_verbatim_config_path() {
        let args = preview_arguments(Path::new(r"\\?\C:\Users\m.negrini\Desktop\pippo\.framecraft\vite.editor.config.mjs"), 4173, true, false);
        let config = args.iter().position(|arg| arg == "--config").unwrap();
        assert_eq!(args[config + 1], r"C:\Users\m.negrini\Desktop\pippo\.framecraft\vite.editor.config.mjs");
        assert!(!args[config + 1].contains('?'));
    }

    fn write_vite_launcher(root: &Path) -> PathBuf {
        let binary = if cfg!(windows) { root.join("node_modules/.bin/vite.cmd") } else { root.join("node_modules/.bin/vite") };
        fs::create_dir_all(binary.parent().unwrap()).unwrap();
        fs::write(&binary, "local vite").unwrap();
        binary
    }

    fn write_package(root: &Path, name: &str) {
        let package = root.join("node_modules").join(name);
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("package.json"), format!(r#"{{"name":"{name}","version":"1.0.0"}}"#)).unwrap();
    }

    #[test]
    fn installed_project_vite_is_preferred_over_package_manager_exec() {
        let directory = tempfile::tempdir().unwrap();
        let binary = write_vite_launcher(directory.path());
        write_package(directory.path(), "vite");
        fs::write(directory.path().join("pnpm-lock.yaml"), "lockfileVersion: '9.0'").unwrap();
        let (program, args) = package_command(directory.path());
        assert_eq!(program, path_string(&binary));
        assert!(args.is_empty());
    }

    #[test]
    fn modern_vite_uses_the_runner_for_the_editor_config() {
        let directory = tempfile::tempdir().unwrap();
        write_package(directory.path(), "vite");
        fs::write(directory.path().join("node_modules/vite/package.json"), r#"{"name":"vite","version":"7.1.3"}"#).unwrap();
        let args = preview_arguments(&directory.path().join(".framecraft/vite.editor.config.mjs"), 4173, vite_supports_config_runner(directory.path()), false);
        assert_eq!(&args[..2], ["--configLoader", "runner"]);
    }

    #[test]
    fn old_vite_does_not_receive_an_unknown_config_loader_option() {
        let directory = tempfile::tempdir().unwrap();
        write_package(directory.path(), "vite");
        fs::write(directory.path().join("node_modules/vite/package.json"), r#"{"name":"vite","version":"5.4.0"}"#).unwrap();
        let args = preview_arguments(&directory.path().join("vite.editor.config.mjs"), 4173, vite_supports_config_runner(directory.path()), false);
        assert_ne!(&args[..2], ["--configLoader", "runner"]);
    }

    #[test]
    fn force_rebuild_is_only_requested_explicitly() {
        let config = Path::new("vite.editor.config.mjs");
        assert!(!preview_arguments(config, 4173, true, false).contains(&"--force".into()));
        assert!(preview_arguments(config, 4173, true, true).contains(&"--force".into()));
        assert!(preview_arguments(config, 4173, false, true).contains(&"--force".into()));
    }

    #[test]
    fn a_launcher_left_behind_by_a_broken_install_is_not_used() {
        let directory = tempfile::tempdir().unwrap();
        let binary = write_vite_launcher(directory.path());
        fs::write(directory.path().join("pnpm-lock.yaml"), "lockfileVersion: '9.0'").unwrap();
        // The shim is there but the package it forwards to is not: this is what a moved pnpm store
        // leaves behind, and running it produces a raw MODULE_NOT_FOUND crash.
        let (program, args) = package_command(directory.path());
        assert_ne!(program, path_string(&binary));
        assert_eq!(program, "pnpm");
        assert_eq!(args, vec!["exec".to_string(), "vite".to_string()]);
    }

    #[test]
    fn dependencies_are_missing_when_their_manifest_cannot_be_resolved() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let declared = vec!["react".to_string(), "vite".to_string(), "@vitejs/plugin-react".to_string()];
        assert_eq!(missing_dependencies(root, &declared), declared);

        write_package(root, "react");
        write_package(root, "@vitejs/plugin-react");
        // An empty folder, like a dangling link resolves to, must not count as installed.
        fs::create_dir_all(root.join("node_modules/vite")).unwrap();
        assert_eq!(missing_dependencies(root, &declared), vec!["vite".to_string()]);

        write_package(root, "vite");
        assert!(missing_dependencies(root, &declared).is_empty());
    }

    #[test]
    fn a_project_with_npm_workspaces_is_copied_from_the_monorepo_root() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = directory.path().join("catalog");
        let package = workspace.join("panels/operator");
        fs::create_dir_all(&package).unwrap();
        fs::write(workspace.join("package.json"), r#"{"name":"catalog","workspaces":["panels/*"]}"#).unwrap();
        fs::write(package.join("package.json"), r#"{"name":"operator"}"#).unwrap();
        assert_eq!(workspace_root(&package), workspace);
    }

    #[test]
    fn the_working_copy_resolves_escaping_relative_imports_like_the_original() {
        let directory = tempfile::tempdir().unwrap();
        let catalog = directory.path().join("catalog");
        let project = catalog.join("panels/operator");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::create_dir_all(catalog.join("templates/shell/src")).unwrap();
        fs::write(catalog.join("pnpm-workspace.yaml"), "packages:\n  - panels/*\n").unwrap();
        fs::write(catalog.join("templates/shell/src/styles.css"), "body { margin: 0; }").unwrap();
        fs::write(project.join("package.json"), r#"{"name":"operator","dependencies":{"react":"^19.0.0"}}"#).unwrap();
        // A stylesheet three levels up is a normal layout for panels sharing a template.
        fs::write(project.join("src/main.jsx"), "import \"../../../templates/shell/src/styles.css\";").unwrap();

        let created = create_working_copy(path_string(&project)).unwrap();
        let copied_workspace = PathBuf::from(&created.workspace_root);
        let original_workspace = fs::canonicalize(&catalog).unwrap();

        // Same depth as the original, so "../../.." lands on the matching folder in the copy.
        assert_eq!(
            copied_workspace.parent().map(path_string),
            original_workspace.parent().map(path_string),
        );
        let imported = PathBuf::from(&created.root).join("src/../../../templates/shell/src/styles.css");
        assert!(imported.is_file(), "l'import relativo deve risolvere anche nella copia: {}", path_string(&imported));
    }

    /// @vitejs/plugin-react is an "enforce: pre" plugin like Framecraft's, and Vite keeps array order
    /// inside one enforce bucket. Appending instead of prepending would hand the canvas the offsets
    /// of code React had already rewritten, and every click would resolve to a line that is not
    /// there: no delete, no insert, no undo history. The order is the whole editor working or not.
    #[test]
    fn the_editor_config_runs_framecraft_before_the_project_own_plugins() {
        assert!(EDITOR_CONFIG_TEMPLATE.contains("merged.plugins = [framecraft(), ...(merged.plugins ?? [])];"));
        assert!(!EDITOR_CONFIG_TEMPLATE.contains("plugins: [framecraft()]"));
        assert!(EDITOR_CONFIG_TEMPLATE.contains("import originalConfig from \"__FRAMECRAFT_CONFIG_URL__\";"));
        assert!(!EDITOR_CONFIG_TEMPLATE.contains("loadConfigFromFile"));
    }

    #[test]
    fn a_working_copy_is_never_copied_into_another_copy() {
        assert!(copy_ignored(".framecraft-catalog-edit-1787819451"));
        assert!(copy_ignored(".framecraft"));
        assert!(!copy_ignored("src"));
        assert!(!copy_ignored("framecraft.plc.json"));
    }

    #[test]
    fn a_preview_path_with_forward_slashes_is_recognised_inside_the_project() {
        let directory = tempfile::tempdir().unwrap();
        let project = directory.path().join("panel");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::write(project.join("src/Overlay.jsx"), "export const Overlay = () => <div />;").unwrap();

        // What analyze_project stores as the boundary.
        let authorized = fs::canonicalize(&project).unwrap();
        // What the preview reports: the same file, but with the separators Vite uses.
        let reported = path_string(&project).replace('\\', "/") + "/src/Overlay.jsx";
        let target = fs::canonicalize(&reported).unwrap();

        assert!(target.starts_with(&authorized), "target {target:?} non riconosciuto dentro {authorized:?}");
    }

    #[test]
    fn a_plain_project_is_its_own_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let project = directory.path().join("panel");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("package.json"), r#"{"name":"panel","dependencies":{"react":"^19.0.0"}}"#).unwrap();
        assert_eq!(workspace_root(&project), project);
    }

    #[test]
    fn package_inside_a_workspace_can_resolve_shared_sources() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = directory.path().join("catalog");
        let package = workspace.join("panels/operator");
        fs::create_dir_all(&package).unwrap();
        fs::write(workspace.join("pnpm-workspace.yaml"), "packages:\n  - panels/*\n").unwrap();
        assert_eq!(workspace_root(&package), workspace);
    }

    #[test]
    fn saving_with_a_new_name_copies_the_sources_without_touching_anything_that_exists() {
        let directory = tempfile::tempdir().unwrap();
        let project = directory.path().join(".framecraft-panel-edit-1787831728/panel");
        let chosen = directory.path().join("Documenti");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::create_dir_all(project.join("node_modules/react")).unwrap();
        fs::create_dir_all(project.join(".framecraft")).unwrap();
        fs::create_dir_all(&chosen).unwrap();
        fs::write(project.join("package.json"), r#"{"name":"panel"}"#).unwrap();
        fs::write(project.join("src/App.jsx"), "export const App = () => <main>Modificato</main>;").unwrap();
        fs::write(project.join("node_modules/react/index.js"), "module.exports = {};").unwrap();
        fs::write(project.join(".framecraft/vite.editor.config.mjs"), "export default {};").unwrap();

        let saved = export_to(&project, &path_string(&chosen)).unwrap();
        let saved_root = PathBuf::from(&saved.root);

        assert_eq!(saved_root.file_name().unwrap(), "panel");
        assert!(fs::read_to_string(saved_root.join("src/App.jsx")).unwrap().contains("Modificato"));
        assert!(saved_root.join("package.json").is_file());
        // Installed dependencies and editor bookkeeping do not belong in a project the user keeps.
        assert!(!saved_root.join("node_modules").exists());
        assert!(!saved_root.join(".framecraft").exists());

        // A second save never overwrites the first one.
        let again = export_to(&project, &path_string(&chosen)).unwrap();
        assert_eq!(PathBuf::from(&again.root).file_name().unwrap(), "panel-2");
        assert!(fs::read_to_string(saved_root.join("src/App.jsx")).unwrap().contains("Modificato"));
    }

    #[test]
    fn saving_into_the_working_copy_itself_is_refused() {
        let directory = tempfile::tempdir().unwrap();
        let project = directory.path().join("panel");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::write(project.join("package.json"), r#"{"name":"panel"}"#).unwrap();

        let error = export_to(&fs::canonicalize(&project).unwrap(), &path_string(&project.join("src"))).unwrap_err();
        assert!(error.contains("fuori dalla copia di lavoro"), "{error}");
    }

    #[test]
    fn working_copy_protects_the_original_workspace_and_is_reused() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = directory.path().join("catalog");
        let project = workspace.join("panels/operator");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::create_dir_all(workspace.join("templates/shared")).unwrap();
        fs::write(workspace.join("pnpm-workspace.yaml"), "packages:\n  - panels/*\n").unwrap();
        fs::write(project.join("package.json"), r#"{"name":"operator","dependencies":{"react":"^19.0.0","vite":"^7.0.0"}}"#).unwrap();
        fs::write(project.join("src/App.jsx"), "export function App() { return <main>Original</main>; }").unwrap();
        fs::write(workspace.join("templates/shared/value.js"), "export const value = 'original';").unwrap();

        let created = create_working_copy(path_string(&project)).unwrap();
        let copied_project = PathBuf::from(&created.root);
        assert!(created.created);
        assert_ne!(copied_project, project);
        assert_eq!(created.original_root, Some(path_string(&fs::canonicalize(&project).unwrap())));
        assert!(PathBuf::from(&created.workspace_root).join("templates/shared/value.js").is_file());

        fs::write(copied_project.join("src/App.jsx"), "export function App() { return <main>Changed</main>; }").unwrap();
        assert!(fs::read_to_string(project.join("src/App.jsx")).unwrap().contains("Original"));

        let reopened = create_working_copy(created.root).unwrap();
        assert!(!reopened.created);
        assert_eq!(reopened.root, path_string(&copied_project));
    }
}
