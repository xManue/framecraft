use crate::{path_string, write_atomic, RuntimeState};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
const MANIFEST: &str = "framecraft.runtime-components.json";
const BACKUPS: &str = ".framecraft/runtime-updates";
const MAX_FILE: usize = 1024 * 1024;
const MAX_TOTAL: usize = 24 * 1024 * 1024;
const CONFIGS: &[&str] = &[
    "framecraft.runtime.json",
    "framecraft.connections.json",
    "framecraft.plc.json",
    "framecraft.scripts.json",
    "framecraft.auth.json",
    "framecraft.alarms.json",
    "framecraft.recipes.json",
    "framecraft.recipe-plc.json",
    "framecraft.recipe-apply.json",
    "framecraft.logs.json",
    "framecraft.resources.json",
    "framecraft.profiles.json",
    "framecraft.faceplates.json",
    "framecraft.recipes-ui.json",
    "framecraft.header.json",
];
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    path: String,
    before: Option<String>,
    after: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Metadata {
    version: u8,
    id: String,
    root: String,
    state: String,
    created_at: u64,
    file_count: usize,
    failure: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    version: u8,
    root: String,
    changes: Vec<Change>,
}
#[derive(Serialize)]
pub struct Snapshot {
    generation: u64,
    files: BTreeMap<String, Option<String>>,
    backups: Vec<Metadata>,
}
fn failure(message: impl AsRef<str>) -> String {
    format!("Aggiornamento Runtime: {}", message.as_ref())
}
fn only_editor(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err(failure("comando disponibile solo nell’editor principale."))
    }
}
fn relative(path: &str) -> bool {
    if path.is_empty()
        || path.len() > 240
        || !path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_./-".contains(&b))
    {
        return false;
    }
    path.split('/').all(|p| {
        !p.is_empty()
            && p != "."
            && p != ".."
            && !p.ends_with('.')
            && ![
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ]
            .contains(
                &p.split('.')
                    .next()
                    .unwrap_or("")
                    .to_ascii_uppercase()
                    .as_str(),
            )
    })
}
fn allowed(path: &str) -> bool {
    if !relative(path) {
        return false;
    }
    if path == MANIFEST || CONFIGS.contains(&path) {
        return true;
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() != 2 {
        return false;
    }
    let name = parts[1];
    if name.starts_with('.') {
        return false;
    }
    if parts[0] == "runtime" {
        return name == "package.json"
            || name == "README.md"
            || name.ends_with(".mjs")
            || name.ends_with(".d.mts");
    }
    parts[0] == "src"
        && name.starts_with("framecraft")
        && [".ts", ".tsx", ".mjs", ".mts", ".css"]
            .iter()
            .any(|s| name.ends_with(s))
}
fn linked(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
fn location(root: &Path, path: &str) -> Result<PathBuf, String> {
    if !relative(path) {
        return Err(failure("percorso non valido."));
    }
    let mut result = root.to_path_buf();
    for part in Path::new(path).components() {
        if !matches!(part, std::path::Component::Normal(_)) {
            return Err(failure("percorso non valido."));
        }
        result.push(part);
        match fs::symlink_metadata(&result) {
            Ok(m) if linked(&m) => {
                return Err(failure(
                    "collegamenti e junction non sono ammessi nei file da aggiornare.",
                ))
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(failure("impossibile verificare il percorso.")),
        }
    }
    Ok(result)
}
fn read_limited(root: &Path, path: &str, limit: usize) -> Result<Option<String>, String> {
    let target = location(root, path)?;
    let file = match fs::File::open(&target) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(failure(format!("{path}: file non leggibile."))),
    };
    let meta = file
        .metadata()
        .map_err(|_| failure("metadati non disponibili."))?;
    if !meta.is_file() || meta.len() > limit as u64 {
        return Err(failure(format!(
            "{path}: file troppo grande o non regolare."
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.nlink() != 1 {
            return Err(failure("hard link non ammesso."));
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        };
        let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::zeroed();
        unsafe {
            if GetFileInformationByHandle(file.as_raw_handle() as _, info.as_mut_ptr()) == 0
                || info.assume_init().nNumberOfLinks != 1
            {
                return Err(failure("hard link o handle non verificabile."));
            }
        }
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failure("lettura interrotta."))?;
    if bytes.len() > limit {
        return Err(failure("file cresciuto durante la lettura."));
    }
    location(root, path)?;
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| failure(format!("{path}: testo UTF-8 richiesto.")))
}
fn read(root: &Path, path: &str) -> Result<Option<String>, String> {
    if !allowed(path) {
        return Err(failure(format!("file fuori dal pacchetto Runtime: {path}")));
    }
    read_limited(root, path, MAX_FILE)
}
fn folder(root: &Path, path: &str) -> Result<PathBuf, String> {
    let p = location(root, path)?;
    fs::create_dir_all(&p).map_err(|_| failure("cartella backup non scrivibile."))?;
    location(root, path)
}
fn write(root: &Path, path: &str, source: &str) -> Result<(), String> {
    let file = location(root, path)?;
    let parent = file
        .parent()
        .ok_or_else(|| failure("cartella non valida."))?;
    fs::create_dir_all(parent).map_err(|_| failure("cartella non scrivibile."))?;
    location(root, path)?;
    write_atomic(&file, source).map_err(|_| failure(format!("{path}: scrittura non completata.")))
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id.bytes().all(|b| b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
}
fn meta_path(id: &str) -> String {
    format!("{BACKUPS}/{id}/meta.json")
}
fn save_meta(root: &Path, meta: &Metadata) -> Result<(), String> {
    write(
        root,
        &meta_path(&meta.id),
        &serde_json::to_string(meta).map_err(|_| failure("stato backup non serializzabile."))?,
    )
}
fn backups(root: &Path) -> Result<Vec<Metadata>, String> {
    let directory = location(root, BACKUPS)?;
    let entries = match fs::read_dir(directory) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => return Err(failure("elenco backup non leggibile.")),
    };
    let mut result = Vec::new();
    let mut inspected = 0;
    for entry in entries {
        let entry = entry.map_err(|_| failure("elenco backup interrotto."))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_id(&name) {
            continue;
        }
        inspected += 1;
        if inspected > 256 {
            return Err(failure(
                "troppi backup: archivia quelli precedenti prima di aggiornare.",
            ));
        }
        let source = read_limited(root, &meta_path(&name), 32768)?.ok_or_else(|| {
            failure("backup incompleto: controlla la cartella runtime-updates prima di continuare.")
        })?;
        let meta: Metadata =
            serde_json::from_str(&source).map_err(|_| failure("metadati backup danneggiati."))?;
        if meta.root != path_string(root)
            && ["completed", "restored", "rolled-back"].contains(&meta.state.as_str())
        {
            continue;
        }
        if meta.version != 1 || meta.id != name || meta.root != path_string(root) {
            return Err(failure("backup di un’altra cartella o versione."));
        }
        result.push(meta);
    }
    result.sort_by(|a, b| {
        pending(b)
            .cmp(&pending(a))
            .then_with(|| b.created_at.cmp(&a.created_at))
    });
    Ok(result)
}
fn pending(meta: &Metadata) -> bool {
    !["completed", "restored", "rolled-back"].contains(&meta.state.as_str())
}
fn validate(changes: &[Change], restore: bool) -> Result<(), String> {
    if changes.is_empty() || changes.len() > 384 {
        return Err(failure("numero di file non valido."));
    }
    let mut names = HashSet::new();
    let mut total = 0;
    for c in changes {
        if !allowed(&c.path)
            || !names.insert(c.path.to_ascii_lowercase())
            || !restore
                && (c.after.as_ref().is_none_or(|s| s.is_empty())
                    || CONFIGS.contains(&c.path.as_str()) && c.before.is_some())
        {
            return Err(failure(
                "catalogo esistente, file protetto o duplicato nella proposta.",
            ));
        }
        for s in [&c.before, &c.after].into_iter().flatten() {
            if s.len() > MAX_FILE {
                return Err(failure("file troppo grande."));
            }
            total += s.len();
        }
        if c.path.ends_with(".json") {
            if let Some(text) = &c.after {
                let value = serde_json::from_str::<serde_json::Value>(text)
                    .map_err(|_| failure(format!("{}: JSON non valido.", c.path)))?;
                if !restore && CONFIGS.contains(&c.path.as_str()) {
                    let passive = match c.path.as_str() {
                        "framecraft.auth.json" => value["enabled"] == false,
                        "framecraft.runtime.json" => value["gateway"]["enabled"] == false,
                        "framecraft.connections.json" => {
                            value["connections"].as_array().is_some_and(Vec::is_empty)
                                && value["gateway"]["enabled"] != true
                        }
                        "framecraft.plc.json" => {
                            value["variables"].as_array().is_some_and(Vec::is_empty)
                        }
                        "framecraft.scripts.json" => {
                            value["scheduledTasks"]
                                .as_array()
                                .is_some_and(Vec::is_empty)
                                && value["schedulerService"]["enabled"] != true
                        }
                        "framecraft.logs.json" => {
                            value["logs"].as_array().is_some_and(Vec::is_empty)
                        }
                        "framecraft.alarms.json" => {
                            value["alarms"].as_array().is_some_and(Vec::is_empty)
                        }
                        _ => true,
                    };
                    if !passive {
                        return Err(failure(
                            "i cataloghi mancanti possono essere creati solo vuoti o disabilitati.",
                        ));
                    }
                }
            }
        }
    }
    if total > MAX_TOTAL {
        return Err(failure("proposta troppo grande."));
    }
    Ok(())
}
fn checked_write(root: &Path, c: &Change) -> Result<(), String> {
    if read(root, &c.path)? != c.before {
        return Err(failure(format!(
            "{} è cambiato dopo il confronto. Nessuna sovrascrittura automatica.",
            c.path
        )));
    }
    match &c.after {
        Some(text) => write(root, &c.path, text),
        None => fs::remove_file(location(root, &c.path)?).map_err(|_| {
            failure(format!(
                "{}: impossibile ripristinare il file assente.",
                c.path
            ))
        }),
    }
}
fn reverse(root: &Path, changes: &[Change]) -> Result<Vec<Change>, String> {
    let mut result = Vec::new();
    for c in changes.iter().rev() {
        let current = read(root, &c.path)?;
        if current == c.before {
            continue;
        }
        if current != c.after {
            return Err(failure(format!("{} contiene modifiche successive. Conservate: controlla il backup prima del ripristino.",c.path)));
        }
        result.push(Change {
            path: c.path.clone(),
            before: c.after.clone(),
            after: c.before.clone(),
        });
    }
    validate(&result, true).or_else(|e| if result.is_empty() { Ok(()) } else { Err(e) })?;
    Ok(result)
}
fn restore(root: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err(failure("ID backup non valido."));
    }
    let mut meta: Metadata = serde_json::from_str(
        &read_limited(root, &meta_path(id), 32768)?
            .ok_or_else(|| failure("backup non trovato."))?,
    )
    .map_err(|_| failure("stato backup non valido."))?;
    let journal: Journal = serde_json::from_str(
        &read_limited(
            root,
            &format!("{BACKUPS}/{id}/.env.runtime-update.json"),
            48 * 1024 * 1024,
        )?
        .ok_or_else(|| failure("file di backup mancante."))?,
    )
    .map_err(|_| failure("contenuto backup non valido."))?;
    if meta.version != 1
        || meta.root != path_string(root)
        || meta.id != id
        || journal.version != 1
        || journal.root != path_string(root)
    {
        return Err(failure("backup di un altro progetto."));
    }
    validate(&journal.changes, false)?;
    let plan = reverse(root, &journal.changes)?;
    meta.state = "restoring".into();
    save_meta(root, &meta)?;
    for c in plan {
        if let Err(e) = checked_write(root, &c) {
            meta.state = "needs-review".into();
            meta.failure = Some(e.clone());
            let _ = save_meta(root, &meta);
            return Err(e);
        }
    }
    meta.state = "restored".into();
    meta.failure = None;
    save_meta(root, &meta)
}
fn component_priority(path: &str) -> u8 {
    match path {
        "runtime/runtime-update-guard.mjs" => 0,
        "runtime/start-gateway.mjs" | "runtime/start-mqtt.mjs" => 1,
        MANIFEST => 3,
        _ => 2,
    }
}
fn reserve_gateway(root: &Path) -> Result<Option<std::net::TcpListener>, String> {
    let Some(source) = read_limited(root, "framecraft.connections.json", 4 * 1024 * 1024)? else {
        return Ok(None);
    };
    let value: serde_json::Value = serde_json::from_str(&source).map_err(|_| {
        failure("framecraft.connections.json non è leggibile: nessun file aggiornato.")
    })?;
    if value["gateway"]["enabled"] != true {
        return Ok(None);
    }
    let port = value["gateway"]["port"]
        .as_u64()
        .filter(|port| *port >= 1 && *port <= 65535)
        .ok_or_else(|| {
            failure(
                "configura una porta fissa valida per il gateway prima di aggiornare il Runtime.",
            )
        })? as u16;
    std::net::TcpListener::bind(("127.0.0.1",port)).map(Some).map_err(|_|failure("la porta configurata per il servizio PLC è occupata. Arresta il servizio o correggi la porta in Connessioni PLC; nessun file aggiornato."))
}
fn apply_with(
    root: &Path,
    mut changes: Vec<Change>,
    mut writer: impl FnMut(&Path, &Change, usize) -> Result<(), String>,
) -> Result<String, String> {
    changes.sort_by_key(|change| component_priority(&change.path));
    validate(&changes, false)?;
    if backups(root)?.iter().any(pending) {
        return Err(failure(
            "un aggiornamento precedente richiede ripristino. Apri i backup prima di continuare.",
        ));
    }
    for c in &changes {
        if read(root, &c.path)? != c.before {
            return Err(failure(format!(
                "{} è cambiato. Ricarica il confronto.",
                c.path
            )));
        }
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| failure("orologio non valido."))?;
    let id = format!("{}-{}", stamp.as_nanos(), std::process::id());
    let staging = format!("{BACKUPS}/pending-{id}");
    folder(root, &staging)?;
    let mut meta = Metadata {
        version: 1,
        id: id.clone(),
        root: path_string(root),
        state: "prepared".into(),
        created_at: stamp.as_millis() as u64,
        file_count: changes.len(),
        failure: None,
    };
    let journal = serde_json::to_string(&Journal {
        version: 1,
        root: path_string(root),
        changes: changes.clone(),
    })
    .map_err(|_| failure("backup non serializzabile."))?;
    if journal.len() > 48 * 1024 * 1024 {
        return Err(failure("backup troppo grande."));
    }
    write(
        root,
        &format!("{staging}/.env.runtime-update.json"),
        &journal,
    )?;
    write(
        root,
        &format!("{staging}/meta.json"),
        &serde_json::to_string(&meta)
            .map_err(|_| failure("metadati backup non serializzabili."))?,
    )?;
    fs::rename(
        location(root, &staging)?,
        location(root, &format!("{BACKUPS}/{id}"))?,
    )
    .map_err(|_| failure("backup non pubblicato: nessun file del progetto aggiornato."))?;
    meta.state = "applying".into();
    save_meta(root, &meta)?;
    for (index, c) in changes.iter().enumerate() {
        if let Err(error) = writer(root, c, index) {
            let rolled = restore(root, &id);
            meta.state = if rolled.is_ok() {
                "rolled-back"
            } else {
                "needs-review"
            }
            .into();
            meta.failure = Some(error.clone());
            let _ = save_meta(root, &meta);
            return Err(failure(format!(
                "{error} Backup {id}. {}",
                if rolled.is_ok() {
                    "File ripristinati; prepara un nuovo confronto."
                } else {
                    "Ripristino da verificare: le modifiche esterne restano conservate."
                }
            )));
        }
    }
    meta.state = "completed".into();
    save_meta(root, &meta)?;
    Ok(id)
}
fn project<'a>(
    requested: &str,
    state: &'a RuntimeState,
) -> Result<(std::sync::MutexGuard<'a, Option<PathBuf>>, PathBuf), String> {
    let requested =
        fs::canonicalize(requested).map_err(|_| failure("progetto non disponibile."))?;
    let guard = state
        .project_root
        .try_lock()
        .map_err(|_| failure("progetto occupato."))?;
    if guard.as_ref() != Some(&requested) {
        return Err(failure("il progetto non è più quello aperto."));
    }
    Ok((guard, requested))
}
fn snapshot(
    requested: &str,
    paths: Vec<String>,
    presence_only: bool,
    state: &RuntimeState,
) -> Result<Snapshot, String> {
    let (_guard, root) = project(requested, state)?;
    if paths.is_empty() || paths.len() > 384 {
        return Err(failure("elenco file non valido."));
    }
    let mut files = BTreeMap::new();
    let mut total = 0;
    let mut names = HashSet::new();
    for p in paths {
        if !names.insert(p.to_ascii_lowercase()) {
            return Err(failure("file duplicato."));
        }
        let source = if presence_only && CONFIGS.contains(&p.as_str()) {
            match fs::symlink_metadata(location(&root, &p)?) {
                Ok(meta) if meta.is_file() => Some(String::new()),
                Ok(_) => return Err(failure(format!("{p}: catalogo non regolare."))),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(_) => return Err(failure("catalogo non accessibile.")),
            }
        } else {
            read(&root, &p)?
        };
        total += source.as_ref().map_or(0, String::len);
        if total > MAX_TOTAL {
            return Err(failure("confronto troppo grande."));
        }
        files.insert(p, source);
    }
    Ok(Snapshot {
        generation: state.project_generation.load(Ordering::SeqCst),
        files,
        backups: backups(&root)?,
    })
}
fn mutate(
    requested: &str,
    generation: u64,
    state: &RuntimeState,
    operation: impl FnOnce(&Path) -> Result<String, String>,
) -> Result<String, String> {
    let _edit = state
        .ai_project_edit
        .try_lock()
        .map_err(|_| failure("è già in corso una modifica ai file."))?;
    let (_guard, root) = project(requested, state)?;
    if generation != state.project_generation.load(Ordering::SeqCst) {
        return Err(failure("il progetto è cambiato dopo il confronto."));
    }
    let preview = state
        .preview
        .try_lock()
        .map_err(|_| failure("anteprima occupata."))?;
    if preview.is_some() {
        return Err(failure(
            "arresta l’anteprima prima di aggiornare il Runtime.",
        ));
    }
    let _gateway_port = reserve_gateway(&root)?;
    operation(&root)
}
#[tauri::command]
pub async fn read_runtime_update(
    root: String,
    paths: Vec<String>,
    catalog_presence_only: Option<bool>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Snapshot, String> {
    only_editor(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        snapshot(
            &root,
            paths,
            catalog_presence_only.unwrap_or(true),
            &app.state::<RuntimeState>(),
        )
    })
    .await
    .map_err(|_| failure("lettura interrotta."))?
}
#[tauri::command]
pub async fn apply_runtime_update(
    root: String,
    generation: u64,
    changes: Vec<Change>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<String, String> {
    only_editor(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        mutate(&root, generation, &app.state::<RuntimeState>(), |root| {
            apply_with(root, changes, |root, c, _| checked_write(root, c))
        })
    })
    .await
    .map_err(|_| failure("operazione interrotta: controlla i backup."))?
}
#[tauri::command]
pub async fn restore_runtime_update(
    root: String,
    generation: u64,
    backup: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    only_editor(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        mutate(&root, generation, &app.state::<RuntimeState>(), |root| {
            restore(root, &backup)?;
            Ok(backup)
        })
        .map(|_| ())
    })
    .await
    .map_err(|_| failure("ripristino interrotto: controlla i backup."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        (temp, root)
    }
    fn change(path: &str, before: Option<&str>, after: &str) -> Change {
        Change {
            path: path.into(),
            before: before.map(str::to_owned),
            after: Some(after.into()),
        }
    }
    fn commit(root: &Path, changes: Vec<Change>) -> Result<String, String> {
        apply_with(root, changes, |root, c, _| checked_write(root, c))
    }
    #[test]
    fn existing_machine_catalogs_are_preserved_without_loading_their_contents() {
        let (_temp, root) = fixture();
        write(&root, "framecraft.plc.json", &"SYNTHETIC".repeat(MAX_FILE)).unwrap();
        let state = RuntimeState::default();
        *state.project_root.lock().unwrap() = Some(root.clone());
        let result = snapshot(
            &path_string(&root),
            vec!["framecraft.plc.json".into()],
            true,
            &state,
        )
        .unwrap();
        assert_eq!(result.files["framecraft.plc.json"], Some(String::new()));
        assert!(snapshot(
            &path_string(&root),
            vec!["framecraft.plc.json".into()],
            false,
            &state
        )
        .is_err());
    }
    #[test]
    fn unpublished_backup_staging_never_blocks_an_unchanged_project() {
        let (_temp, root) = fixture();
        folder(&root, ".framecraft/runtime-updates/pending-123-456").unwrap();
        assert!(backups(&root).unwrap().is_empty());
        let id = commit(&root, vec![change("runtime/gateway.mjs", None, "new")]).unwrap();
        assert_eq!(backups(&root).unwrap().len(), 1);
        restore(&root, &id).unwrap();
    }
    #[test]
    fn active_gateway_blocks_updates_and_its_port_is_reserved_during_writes() {
        let (_temp, root) = fixture();
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        write(
            &root,
            "framecraft.connections.json",
            &format!("{{\"gateway\":{{\"enabled\":true,\"port\":{port}}}}}"),
        )
        .unwrap();
        let state = RuntimeState::default();
        *state.project_root.lock().unwrap() = Some(root.clone());
        assert!(mutate(&path_string(&root), 0, &state, |_| Ok("unexpected".into())).is_err());
        drop(listener);
        mutate(&path_string(&root), 0, &state, |_| {
            assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_err());
            Ok("reserved".into())
        })
        .unwrap();
        assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_ok());
    }
    #[test]
    fn launcher_and_guard_are_updated_before_other_runtime_components() {
        let (_temp, root) = fixture();
        let mut order = vec![];
        apply_with(
            &root,
            vec![
                change("runtime/gateway.mjs", None, "gateway"),
                change(MANIFEST, None, "{}"),
                change("runtime/start-gateway.mjs", None, "launcher"),
                change("runtime/runtime-update-guard.mjs", None, "guard"),
            ],
            |root, c, _| {
                order.push(c.path.clone());
                checked_write(root, c)
            },
        )
        .unwrap();
        assert_eq!(
            order,
            vec![
                "runtime/runtime-update-guard.mjs",
                "runtime/start-gateway.mjs",
                "runtime/gateway.mjs",
                MANIFEST
            ]
        );
    }
    #[test]
    fn incomplete_backups_are_listed_first_even_after_a_clock_change() {
        let (_temp, root) = fixture();
        for i in 0..10 {
            let meta = Metadata {
                version: 1,
                id: format!("{i}-1"),
                root: path_string(&root),
                state: if i == 0 { "applying" } else { "completed" }.into(),
                created_at: i,
                file_count: 1,
                failure: None,
            };
            save_meta(&root, &meta).unwrap();
        }
        let records = backups(&root).unwrap();
        assert_eq!(records[0].state, "applying");
        assert_eq!(records[0].created_at, 0);
    }
    #[test]
    fn update_scope_excludes_machine_data_and_traversal() {
        for path in [
            "src/App.tsx",
            "src/pages/Home.tsx",
            "../runtime/gateway.mjs",
            "runtime/../a.mjs",
            "runtime/.secret.mjs",
            "runtime/CON.mjs",
            "runtime/node_modules/a.mjs",
            ".framecraft-runtime/security/operators.json",
            "package.json",
            "C:/runtime/a.mjs",
            "runtime\\a.mjs",
            "src/framecraft/a.ts",
        ] {
            assert!(!allowed(path), "{path}");
        }
        for path in [
            "runtime/gateway.mjs",
            "runtime/a.d.mts",
            "src/framecraftHmiRuntime.ts",
            MANIFEST,
        ] {
            assert!(allowed(path), "{path}");
        }
        assert!(only_editor("main").is_ok());
        assert!(only_editor("preview").is_err());
    }
    #[test]
    fn migration_updates_code_together_and_restores_the_exact_originals() {
        let (_temp, root) = fixture();
        write(&root, "runtime/gateway.mjs", "old service").unwrap();
        write(&root, "src/framecraftHmiRuntime.ts", "old browser").unwrap();
        write(
            &root,
            "framecraft.plc.json",
            "{\"version\":1,\"variables\":[{\"name\":\"SYNTHETIC\"}]}",
        )
        .unwrap();
        let id = commit(
            &root,
            vec![
                change("runtime/gateway.mjs", Some("old service"), "new service"),
                change(
                    "src/framecraftHmiRuntime.ts",
                    Some("old browser"),
                    "new browser",
                ),
                change("runtime/scheduler-service.mjs", None, "scheduler"),
            ],
        )
        .unwrap();
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("new service")
        );
        restore(&root, &id).unwrap();
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("old service")
        );
        assert_eq!(
            read(&root, "src/framecraftHmiRuntime.ts")
                .unwrap()
                .as_deref(),
            Some("old browser")
        );
        assert_eq!(read(&root, "runtime/scheduler-service.mjs").unwrap(), None);
        assert!(read(&root, "framecraft.plc.json")
            .unwrap()
            .unwrap()
            .contains("SYNTHETIC"));
        assert_eq!(backups(&root).unwrap()[0].state, "restored");
        restore(&root, &id).unwrap();
    }
    #[test]
    fn existing_catalogs_cannot_be_overwritten_and_missing_ones_stay_passive() {
        let (_temp, root) = fixture();
        let source = "{\"version\":1,\"variables\":[]}";
        write(&root, "framecraft.plc.json", source).unwrap();
        assert!(commit(
            &root,
            vec![change("framecraft.plc.json", Some(source), source)]
        )
        .is_err());
        assert!(commit(
            &root,
            vec![change("framecraft.auth.json", None, "{\"enabled\":true}")]
        )
        .is_err());
        assert!(commit(
            &root,
            vec![change(
                "framecraft.runtime.json",
                None,
                "{\"gateway\":{\"enabled\":true}}"
            )]
        )
        .is_err());
        let id = commit(
            &root,
            vec![change("framecraft.auth.json", None, "{\"enabled\":false}")],
        )
        .unwrap();
        restore(&root, &id).unwrap();
        assert_eq!(read(&root, "framecraft.auth.json").unwrap(), None);
    }
    #[test]
    fn conflict_before_write_changes_nothing() {
        let (_temp, root) = fixture();
        write(&root, "runtime/gateway.mjs", "external").unwrap();
        assert!(commit(
            &root,
            vec![change("runtime/gateway.mjs", Some("reviewed"), "new")]
        )
        .is_err());
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("external")
        );
        assert!(backups(&root).unwrap().is_empty());
    }
    #[test]
    fn failed_batch_rolls_back_files_already_written() {
        let (_temp, root) = fixture();
        write(&root, "runtime/gateway.mjs", "old").unwrap();
        let result = apply_with(
            &root,
            vec![
                change("runtime/gateway.mjs", Some("old"), "new"),
                change("src/framecraftHmiRuntime.ts", None, "browser"),
            ],
            |root, c, index| {
                if index == 1 {
                    Err("synthetic failure".into())
                } else {
                    checked_write(root, c)
                }
            },
        );
        assert!(result.is_err());
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("old")
        );
        assert_eq!(read(&root, "src/framecraftHmiRuntime.ts").unwrap(), None);
        assert_eq!(backups(&root).unwrap()[0].state, "rolled-back");
    }
    #[test]
    fn interrupted_batch_remains_recoverable_and_blocks_further_updates() {
        let (_temp, root) = fixture();
        write(&root, "runtime/gateway.mjs", "old").unwrap();
        let result = std::panic::catch_unwind(|| {
            apply_with(
                &root,
                vec![
                    change("runtime/gateway.mjs", Some("old"), "new"),
                    change("src/framecraftHmiRuntime.ts", None, "browser"),
                ],
                |root, c, index| {
                    if index == 1 {
                        panic!("synthetic interruption");
                    }
                    checked_write(root, c)
                },
            )
        });
        assert!(result.is_err());
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("new")
        );
        let meta = backups(&root).unwrap().remove(0);
        assert_eq!(meta.state, "applying");
        assert!(commit(&root, vec![change("runtime/another.mjs", None, "new")]).is_err());
        restore(&root, &meta.id).unwrap();
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("old")
        );
        assert!(commit(&root, vec![change("runtime/another.mjs", None, "new")]).is_ok());
    }
    #[test]
    fn recovery_preserves_external_edits_and_reports_the_backup() {
        let (_temp, root) = fixture();
        write(&root, "runtime/gateway.mjs", "old").unwrap();
        let id = commit(
            &root,
            vec![change("runtime/gateway.mjs", Some("old"), "new")],
        )
        .unwrap();
        write(&root, "runtime/gateway.mjs", "external").unwrap();
        assert!(restore(&root, &id).is_err());
        assert_eq!(
            read(&root, "runtime/gateway.mjs").unwrap().as_deref(),
            Some("external")
        );
    }
    #[test]
    fn hard_links_cannot_import_content_from_outside_the_project() {
        let (_temp, root) = fixture();
        let outside = tempfile::NamedTempFile::new().unwrap();
        fs::write(outside.path(), "synthetic private").unwrap();
        folder(&root, "runtime").unwrap();
        fs::hard_link(outside.path(), root.join("runtime/linked.mjs")).unwrap();
        assert!(read(&root, "runtime/linked.mjs").is_err());
    }
    #[test]
    fn stale_project_generations_are_rejected_and_mutation_holds_preview_and_project_guards() {
        let (_temp, root) = fixture();
        let state = RuntimeState::default();
        *state.project_root.lock().unwrap() = Some(root.clone());
        state.project_generation.store(4, Ordering::SeqCst);
        assert!(mutate(&path_string(&root), 3, &state, |_| Ok("unexpected".into())).is_err());
        assert!(mutate(&path_string(&root), 4, &state, |_| {
            assert!(state.preview.try_lock().is_err());
            assert!(state.project_root.try_lock().is_err());
            assert!(state.ai_project_edit.try_lock().is_err());
            Ok("guarded".into())
        })
        .is_ok());
    }
    #[test]
    fn oversized_files_are_rejected_before_backup_or_mutation() {
        let (_temp, root) = fixture();
        write(&root, "runtime/large.mjs", &"x".repeat(MAX_FILE + 1)).unwrap();
        assert!(read(&root, "runtime/large.mjs").is_err());
        assert!(commit(
            &root,
            vec![change("runtime/new.mjs", None, &"x".repeat(MAX_FILE + 1))]
        )
        .is_err());
        assert!(backups(&root).unwrap().is_empty());
    }
}
