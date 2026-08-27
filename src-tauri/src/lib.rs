use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tempfile::NamedTempFile;
use walkdir::WalkDir;

#[derive(Default)]
struct RuntimeState {
    preview: Mutex<Option<Child>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    project_root: Mutex<Option<PathBuf>>,
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
struct PreviewSession {
    url: String,
    port: u16,
    /// Directories the project itself declares as source, so the editor can edit everything the
    /// preview is able to render.
    source_roots: Vec<String>,
}

/// The editor config is generated rather than formatted so the JavaScript below stays readable:
/// `format!` would need every brace doubled.
const EDITOR_CONFIG_TEMPLATE: &str = r#"import { defineConfig, loadConfigFromFile, mergeConfig, searchForWorkspaceRoot } from "vite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import framecraft from "__FRAMECRAFT_PLUGIN_URL__";

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
  const candidate = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs", "vite.config.cjs"]
    .map((name) => resolve(root, name))
    .find(existsSync);
  const original = candidate ? await loadConfigFromFile(env, candidate, root) : null;
  const merged = mergeConfig(original?.config ?? {}, { root, plugins: [framecraft()] });
  try {
    mkdirSync(resolve(root, ".framecraft"), { recursive: true });
    writeFileSync(resolve(root, ".framecraft/source-roots.json"), JSON.stringify(sourceRoots(merged, root), null, 2));
  } catch { /* the editor falls back to the project folder alone */ }
  return merged;
});
"#;

#[derive(Debug, Serialize, Clone)]
struct PreviewOutput {
    stream: String,
    line: String,
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
    *state.project_root.lock().map_err(|_| "Project root lock poisoned")? = Some(root_path);
    *state.authorized_root.lock().map_err(|_| "Authorized root lock poisoned")? = Some(authorized_root);
    Ok(analysis)
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

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?.local_addr().map(|address| address.port()).map_err(|error| error.to_string())
}

/// A dev server can take well over a minute to boot the first time it pre-bundles dependencies.
const PREVIEW_START_TIMEOUT: Duration = Duration::from_secs(120);
const PREVIEW_ATTEMPTS: usize = 3;

fn shell_command(program: &str, args: &[String]) -> Command {
    if cfg!(windows) {
        let mut command = Command::new("cmd");
        command.args(["/C", program]);
        command.args(args);
        command
    } else {
        let mut command = Command::new(program);
        command.args(args);
        command
    }
}

/// A plain TCP connect also succeeds against whatever else grabbed the port, which would point the
/// editor at a foreign server. Only a real HTTP reply counts as "the dev server is up".
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

fn forward_output(child: &mut Child, app: &AppHandle, log: &OutputLog) {
    let mut sources: Vec<(&'static str, Box<dyn Read + Send>)> = Vec::new();
    if let Some(stdout) = child.stdout.take() { sources.push(("stdout", Box::new(stdout))); }
    if let Some(stderr) = child.stderr.take() { sources.push(("stderr", Box::new(stderr))); }
    for (stream, reader) in sources {
        let handle = app.clone();
        let log = Arc::clone(log);
        thread::spawn(move || {
            for line in BufReader::new(reader).lines().map_while(Result::ok) {
                if let Ok(mut recent) = log.lock() {
                    recent.push(line.clone());
                    if recent.len() > 40 { recent.remove(0); }
                }
                let _ = handle.emit("preview-output", PreviewOutput { stream: stream.into(), line });
            }
        });
    }
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

fn package_manager_available(program: &str) -> bool {
    shell_command(program, &["--version".to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// A lock file says which manager the project was built with, not which one this machine has.
/// npm ships with Node, so it is the fallback rather than failing the whole preview.
fn usable_package_manager(preferred: &str, app: &AppHandle) -> String {
    if preferred == "npm" || package_manager_available(preferred) { return preferred.to_string(); }
    let _ = app.emit("preview-output", PreviewOutput {
        stream: "stdout".into(),
        line: format!("{preferred} non è installato su questo computer: uso npm per installare le dipendenze della copia."),
    });
    "npm".to_string()
}

fn install_dependencies(root: &Path, preferred_manager: &str, app: &AppHandle) -> Result<(), String> {
    let package_manager = usable_package_manager(preferred_manager, app);
    let package_manager = package_manager.as_str();
    let _ = app.emit("preview-output", PreviewOutput {
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
    forward_output(&mut child, app, &log);
    let status = child.wait().map_err(|error| error.to_string())?;
    if status.success() { return Ok(()); }
    let tail = recent_output(&log);
    Err(if tail.is_empty() { format!("{package_manager} install non è riuscito.") } else { format!("{package_manager} install non è riuscito: {tail}") })
}

fn terminate_child(child: &mut Child) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn editor_plugin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("scripts/framecraft-vite-plugin.mjs");
    if development.exists() { return Ok(development); }
    app.path().resource_dir().map_err(|error| error.to_string()).map(|path| path.join("scripts/framecraft-vite-plugin.mjs"))
}

fn file_url(path: &Path) -> String {
    format!("file:///{}", path_string(path).replace('\\', "/").replace(' ', "%20"))
}

#[tauri::command]
fn start_preview(root: String, app: AppHandle, state: State<RuntimeState>) -> Result<PreviewSession, String> {
    let root_path = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let allowed = state.project_root.lock().map_err(|_| "Project root lock poisoned")?.clone();
    if allowed.as_ref() != Some(&root_path) { return Err("Apri e analizza il progetto prima di avviare la preview.".into()); }
    let analysis = analyze(&root_path)?;
    if analysis.framework != "vite" { return Err("La prima milestone supporta la preview completa solo per Vite.".into()); }
    if !analysis.missing_dependencies.is_empty() {
        let listed = analysis.missing_dependencies.iter().take(4).cloned().collect::<Vec<_>>().join(", ");
        let extra = analysis.missing_dependencies.len().saturating_sub(4);
        let _ = app.emit("preview-output", PreviewOutput {
            stream: "stdout".into(),
            line: format!("Dipendenze non risolvibili nella copia di lavoro: {listed}{}. Le installo nella copia; il progetto originale non viene toccato.",
                if extra > 0 { format!(" e altre {extra}") } else { String::new() }),
        });
        unlink_dependency_directory(&root_path)?;
        install_dependencies(&root_path, &analysis.package_manager, &app)?;
        let still_missing = missing_dependencies(&root_path, &analysis.dependencies);
        if !still_missing.is_empty() {
            return Err(format!(
                "Dopo l'installazione con {} restano irrisolvibili: {}. Il progetto originale ha un node_modules incompleto: prova a eseguire '{} install' nella cartella originale.",
                analysis.package_manager, still_missing.join(", "), analysis.package_manager));
        }
    }
    if let Some(mut child) = state.preview.lock().map_err(|_| "Preview lock poisoned")?.take() { terminate_child(&mut child); }
    let framecraft_dir = root_path.join(".framecraft");
    fs::create_dir_all(&framecraft_dir).map_err(|error| error.to_string())?;
    let plugin_url = file_url(&editor_plugin_path(&app)?);
    let config = EDITOR_CONFIG_TEMPLATE
        .replace("__FRAMECRAFT_PLUGIN_URL__", &plugin_url)
        .replace("__FRAMECRAFT_ROOT__", &path_string(&root_path).replace('\\', "\\\\"));
    let config_path = framecraft_dir.join("vite.editor.config.mjs");
    fs::write(&config_path, config).map_err(|error| error.to_string())?;
    let (program, base_args) = package_command(&root_path);

    let mut failure = String::new();
    for attempt in 1..=PREVIEW_ATTEMPTS {
        // The port is chosen, released and immediately handed to Vite, so another process can still
        // win the race. When that happens the child dies at once and we simply pick a different port.
        let port = free_port()?;
        let mut args = base_args.clone();
        args.extend([
            "--config".into(), config_path.to_string_lossy().into_owned(),
            "--host".into(), "127.0.0.1".into(), "--port".into(), port.to_string(), "--strictPort".into(),
        ]);
        let log: OutputLog = Arc::new(Mutex::new(Vec::new()));
        let mut child = shell_command(&program, &args)
            .current_dir(&root_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Impossibile avviare {program}: {error}"))?;
        forward_output(&mut child, &app, &log);

        let started = Instant::now();
        let mut announced = 0;
        loop {
            if preview_responds(port) {
                // The config has run by now, so the roots it resolved are on disk.
                let roots = declared_source_roots(&root_path);
                *state.external_roots.lock().map_err(|_| "External roots lock poisoned")? = roots.clone();
                *state.preview.lock().map_err(|_| "Preview lock poisoned")? = Some(child);
                return Ok(PreviewSession {
                    url: format!("http://127.0.0.1:{port}"),
                    port,
                    source_roots: roots.iter().map(|root| path_string(root)).collect(),
                });
            }
            if child.try_wait().map_err(|error| error.to_string())?.is_some() {
                let tail = recent_output(&log);
                failure = if tail.is_empty() { format!("{program} si è chiuso subito dopo l'avvio.") } else { tail };
                break;
            }
            let elapsed = started.elapsed();
            if elapsed >= PREVIEW_START_TIMEOUT {
                terminate_child(&mut child);
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

#[tauri::command]
fn stop_preview(state: State<RuntimeState>) -> Result<(), String> {
    if let Some(mut child) = state.preview.lock().map_err(|_| "Preview lock poisoned")?.take() { terminate_child(&mut child); }
    Ok(())
}

/// Leaving a project releases the watcher and the granted paths too, not just the dev server.
#[tauri::command]
fn close_project(state: State<RuntimeState>) -> Result<(), String> {
    if let Some(mut child) = state.preview.lock().map_err(|_| "Preview lock poisoned")?.take() { terminate_child(&mut child); }
    let _ = state.watcher.lock().map(|mut watcher| watcher.take());
    let _ = state.project_root.lock().map(|mut root| root.take());
    let _ = state.authorized_root.lock().map(|mut root| root.take());
    let _ = state.external_roots.lock().map(|mut roots| roots.clear());
    Ok(())
}

#[tauri::command]
fn create_vite_project(root: String) -> Result<ProjectAnalysis, String> {
    let root_path = PathBuf::from(root);
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
    fs::write(root_path.join("src/App.tsx"), "import { Link, Route, Routes } from 'react-router-dom';\nimport { HomePage } from './pages/HomePage';\nimport { AboutPage } from './pages/AboutPage';\n\nexport function App() {\n  return (\n    <>\n      <nav><Link to=\"/\">Home</Link><Link to=\"/about\">About</Link></nav>\n      <Routes>\n        <Route path=\"/\" element={<HomePage />} />\n        <Route path=\"/about\" element={<AboutPage />} />\n      </Routes>\n    </>\n  );\n}\n").map_err(|error| error.to_string())?;
    fs::write(root_path.join("src/pages/HomePage.tsx"), "export function HomePage() {\n  return <main className=\"page\"><h1>Start building</h1><p>Switch to Edit mode and select any element.</p><button type=\"button\">Get started</button></main>;\n}\n").map_err(|error| error.to_string())?;
    fs::write(root_path.join("src/pages/AboutPage.tsx"), "export function AboutPage() {\n  return <main className=\"page\"><h1>About</h1><p>This is your second editable page.</p></main>;\n}\n").map_err(|error| error.to_string())?;
    fs::write(root_path.join("src/styles.css"), "* { box-sizing: border-box; }\nbody { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f6f7fb; color: #16181d; }\nnav { display: flex; gap: 18px; padding: 18px 24px; background: white; border-bottom: 1px solid #e6e8ee; }\nnav a { color: #5146c7; text-decoration: none; font-weight: 600; }\n.page { min-height: calc(100vh - 61px); display: grid; place-content: center; gap: 16px; text-align: center; }\nbutton { margin: auto; padding: 12px 18px; border: 0; border-radius: 8px; background: #6558e8; color: white; }\n").map_err(|error| error.to_string())?;
    let marker = WorkingCopyMarker { original_workspace: None, created_at: SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs() };
    fs::write(root_path.join(".framecraft-workspace.json"), serde_json::to_string_pretty(&marker).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    analyze(&root_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RuntimeState::default())
        .invoke_handler(tauri::generate_handler![create_working_copy, analyze_project, read_text_file, write_text_file, create_project_file, start_preview, stop_preview, close_project, create_vite_project])
        .build(tauri::generate_context!())
        .expect("error while building Framecraft");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Ok(mut guard) = app_handle.state::<RuntimeState>().preview.lock() {
                if let Some(mut child) = guard.take() { terminate_child(&mut child); }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn created_project_is_a_real_vite_react_project() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("sample-app");
        let analysis = create_vite_project(path_string(&root)).unwrap();
        assert_eq!(analysis.framework, "vite");
        assert_eq!(analysis.language, "typescript");
        assert!(analysis.entry_files.iter().any(|path| path.ends_with("App.tsx")));
        assert!(root.join("src/styles.css").exists());
        assert!(root.join("src/pages/HomePage.tsx").exists());
        assert!(analysis.dependencies.iter().any(|item| item == "react-router-dom"));
    }

    #[test]
    fn atomic_write_replaces_the_complete_file() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("App.tsx");
        fs::write(&target, "old").unwrap();
        write_atomic(&target, "new source").unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), "new source");
    }

    #[cfg(windows)]
    #[test]
    fn windows_verbatim_paths_are_safe_for_node_tools() {
        assert_eq!(path_string(Path::new(r"\\?\C:\work\project")), r"C:\work\project");
        assert_eq!(path_string(Path::new(r"\\?\UNC\server\share")), r"\\server\share");
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
