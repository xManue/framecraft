use crate::{path_string, write_atomic, RuntimeState};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
const BACKUPS: &str = ".framecraft/script-migrations";
const MAX_FILE: usize = 1024 * 1024;
const MAX_TOTAL: usize = 24 * 1024 * 1024;
const MAX_JOURNAL: usize = 64 * 1024 * 1024;
static SEQUENCE: AtomicU64 = AtomicU64::new(1);
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    path: String,
    before: String,
    after: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
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
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    generation: u64,
    token: Option<String>,
    files: BTreeMap<String, String>,
    backups: Vec<Backup>,
    runtime_ready: bool,
}
pub(crate) struct ReadSet {
    root: PathBuf,
    generation: u64,
    token: String,
    files: BTreeMap<String, String>,
    protection: BTreeMap<String, Option<String>>,
}
fn failure(message: impl AsRef<str>) -> String {
    format!("Migrazione script: {}", message.as_ref())
}
fn only_editor(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err(failure("comando disponibile solo nell’editor principale."))
    }
}
fn relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 240
        && !path
            .chars()
            .any(|c| c.is_control() || "<>:\"\\|?*#".contains(c))
        && path.split('/').all(|p| {
            !p.is_empty()
                && p != "."
                && p != ".."
                && !p.ends_with('.')
                && !p.ends_with(' ')
                && !matches!(
                    p.split('.')
                        .next()
                        .unwrap_or("")
                        .to_ascii_uppercase()
                        .as_str(),
                    "CON"
                        | "PRN"
                        | "AUX"
                        | "NUL"
                        | "COM1"
                        | "COM2"
                        | "COM3"
                        | "COM4"
                        | "COM5"
                        | "COM6"
                        | "COM7"
                        | "COM8"
                        | "COM9"
                        | "LPT1"
                        | "LPT2"
                        | "LPT3"
                        | "LPT4"
                        | "LPT5"
                        | "LPT6"
                        | "LPT7"
                        | "LPT8"
                        | "LPT9"
                )
        })
}
fn ignored(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    matches!(
        name.as_str(),
        ".git"
            | ".framecraft"
            | ".framecraft-runtime"
            | ".hmi-preview"
            | ".vscode"
            | ".idea"
            | ".cache"
            | "node_modules"
            | "dist"
            | "build"
            | "target"
            | "coverage"
    )
}
fn extension(path: &str) -> &str {
    path.rsplit('.').next().unwrap_or("")
}
fn source_path(path: &str) -> bool {
    if !relative(path)
        || path.split('/').any(ignored)
        || path
            .split('/')
            .next()
            .is_some_and(|part| part.eq_ignore_ascii_case("runtime"))
    {
        return false;
    }
    let lower = path.to_ascii_lowercase();
    if !path.contains('/') && lower.starts_with("framecraft.") {
        return matches!(
            lower.as_str(),
            "framecraft.scripts.json"
                | "framecraft.faceplates.json"
                | "framecraft.header.json"
                | "framecraft.runtime-components.json"
        );
    }
    matches!(
        extension(&lower),
        "js" | "jsx"
            | "ts"
            | "tsx"
            | "mjs"
            | "cjs"
            | "mts"
            | "cts"
            | "html"
            | "htm"
            | "json"
            | "txt"
    )
}
fn writable(path: &str) -> bool {
    if !source_path(path) {
        return false;
    }
    let lower = path.to_ascii_lowercase();
    if lower
        .split('/')
        .any(|part| part == ".env" || part.starts_with(".env."))
    {
        return false;
    }
    if lower == "framecraft.runtime-components.json" || lower.starts_with("src/framecraft") {
        return false;
    }
    if !path.contains('/')
        && (matches!(
            lower.as_str(),
            "package.json" | "package-lock.json" | "npm-shrinkwrap.json"
        ) || lower.starts_with("tsconfig")
            || lower.starts_with("vite.config")
            || lower.starts_with("vitest.config"))
    {
        return false;
    }
    true
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
    let mut target = root.to_path_buf();
    for part in Path::new(path).components() {
        if !matches!(part, std::path::Component::Normal(_)) {
            return Err(failure("percorso non valido."));
        }
        target.push(part);
        match fs::symlink_metadata(&target) {
            Ok(meta) if linked(&meta) => {
                return Err(failure("collegamenti e junction non ammessi."))
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(failure("percorso non verificabile.")),
        }
    }
    Ok(target)
}
fn read(root: &Path, path: &str, limit: usize) -> Result<Option<String>, String> {
    let target = location(root, path)?;
    let file = match fs::File::open(&target) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(failure(format!("{path}: file non leggibile."))),
    };
    let meta = file
        .metadata()
        .map_err(|_| failure("metadati non disponibili."))?;
    if !meta.is_file() || meta.len() > limit as u64 {
        return Err(failure(format!(
            "{path}: file non regolare o troppo grande."
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
fn write(root: &Path, path: &str, source: &str) -> Result<(), String> {
    let target = location(root, path)?;
    let parent = target
        .parent()
        .ok_or_else(|| failure("cartella non valida."))?;
    fs::create_dir_all(parent).map_err(|_| failure("cartella backup non scrivibile."))?;
    location(root, path)?;
    write_atomic(&target, source).map_err(|_| failure(format!("{path}: scrittura non completata.")))
}
fn inventory(root: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut files = BTreeMap::new();
    let mut total = 0;
    let mut names = HashSet::new();
    let mut visited = 0;
    let walker = walkdir::WalkDir::new(root)
        .max_depth(15)
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || !ignored(&entry.file_name().to_string_lossy())
                    && !(entry.depth() == 1
                        && entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case("runtime"))
        });
    for entry in walker {
        let entry =
            entry.map_err(|_| failure("inventario interrotto: una cartella non è leggibile."))?;
        visited += 1;
        if visited > 20000 {
            return Err(failure("troppi file da ispezionare."));
        }
        if entry.depth() == 0 {
            continue;
        }
        if linked(
            &fs::symlink_metadata(entry.path())
                .map_err(|_| failure("inventario cambiato durante la lettura."))?,
        ) {
            return Err(failure("l’inventario contiene un collegamento: copia nel progetto i sorgenti condivisi prima di migrare."));
        }
        if entry.file_type().is_dir() {
            if entry.depth() >= 14 {
                return Err(failure(
                    "una cartella supera 14 livelli: inventario incompleto.",
                ));
            }
            continue;
        }
        if !entry.file_type().is_file() {
            return Err(failure("l’inventario contiene un file non regolare."));
        }
        let path = entry
            .path()
            .strip_prefix(root)
            .map_err(|_| failure("file fuori dal progetto."))?
            .to_str()
            .ok_or_else(|| failure("nome file non UTF-8."))?
            .replace('\\', "/");
        if !source_path(&path) {
            continue;
        }
        if files.len() >= 1200 || !names.insert(path.to_lowercase()) {
            return Err(failure("più di 1.200 sorgenti o nomi di file ambigui."));
        }
        let source = read(root, &path, MAX_FILE)?
            .ok_or_else(|| failure("un file è stato rimosso durante la lettura."))?;
        total += source.len();
        if total > MAX_TOTAL {
            return Err(failure("l’inventario supera 24 MB."));
        }
        files.insert(path, source);
    }
    Ok(files)
}
fn protection(root: &Path) -> Result<BTreeMap<String, Option<String>>, String> {
    let mut result = BTreeMap::new();
    for path in [
        "framecraft.connections.json",
        "runtime/script-migration-guard.mjs",
        "runtime/gateway-service.mjs",
        "runtime/mqtt-service.mjs",
    ] {
        result.insert(path.into(), read(root, path, 4 * 1024 * 1024)?);
    }
    Ok(result)
}
fn runtime_ready(files: &BTreeMap<String, Option<String>>) -> bool {
    if ["runtime/gateway-service.mjs", "runtime/mqtt-service.mjs"]
        .iter()
        .any(|path| {
            !files
                .get(*path)
                .and_then(Option::as_ref)
                .is_some_and(|source| {
                    source.contains("await assertScriptMigrationComplete(fileURLToPath(root));")
                })
        })
    {
        return false;
    }
    [
        (
            "runtime/script-migration-guard.mjs",
            include_str!("../../runtime/script-migration-guard.mjs"),
        ),
        (
            "runtime/gateway-service.mjs",
            include_str!("../../runtime/gateway-service.mjs"),
        ),
        (
            "runtime/mqtt-service.mjs",
            include_str!("../../runtime/mqtt-service.mjs"),
        ),
    ]
    .iter()
    .all(|(path, expected)| {
        files
            .get(*path)
            .and_then(Option::as_ref)
            .is_some_and(|text| text.replace("\r\n", "\n") == expected.replace("\r\n", "\n"))
    })
}
fn id_valid(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && !id.starts_with('-')
        && id.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}
fn terminal(state: &str) -> bool {
    matches!(state, "completed" | "restored" | "rolled-back")
}
fn save_backup(root: &Path, backup: &Backup) -> Result<(), String> {
    write(
        root,
        &format!("{BACKUPS}/{}/meta.json", backup.id),
        &serde_json::to_string(backup).map_err(|_| failure("stato backup non serializzabile."))?,
    )
}
fn backups(root: &Path) -> Result<Vec<Backup>, String> {
    let directory = location(root, BACKUPS)?;
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => return Err(failure("elenco backup non leggibile.")),
    };
    let mut result = vec![];
    let mut count = 0;
    for entry in entries {
        let name = entry
            .map_err(|_| failure("elenco backup interrotto."))?
            .file_name()
            .to_string_lossy()
            .into_owned();
        if !id_valid(&name) {
            continue;
        }
        count += 1;
        if count > 256 {
            return Err(failure("troppi backup: archivia quelli precedenti."));
        }
        let source = read(root, &format!("{BACKUPS}/{name}/meta.json"), 32768)?
            .ok_or_else(|| failure("backup incompleto: conserva la cartella per il recupero."))?;
        let meta: Backup =
            serde_json::from_str(&source).map_err(|_| failure("metadati backup danneggiati."))?;
        if meta.root != path_string(root) && terminal(&meta.state) {
            continue;
        }
        if meta.version != 1 || meta.root != path_string(root) || meta.id != name {
            return Err(failure("backup di un’altra cartella o versione."));
        }
        result.push(meta);
    }
    result.sort_by(|a, b| {
        terminal(&a.state)
            .cmp(&terminal(&b.state))
            .then_with(|| b.created_at.cmp(&a.created_at))
    });
    Ok(result)
}
pub(crate) fn assert_complete(root: &Path) -> Result<(), String> {
    if backups(root)?.iter().any(|backup| !terminal(&backup.state)) {
        return Err(failure("operazione incompleta. Apri Pannello → Recupera migrazioni script prima di avviare l’anteprima."));
    }
    Ok(())
}
fn assert_runtime_update_complete(root: &Path) -> Result<(), String> {
    let directory = location(root, ".framecraft/runtime-updates")?;
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(failure("elenco aggiornamenti Runtime non leggibile.")),
    };
    let mut count = 0;
    for entry in entries {
        let name = entry
            .map_err(|_| failure("elenco aggiornamenti Runtime interrotto."))?
            .file_name()
            .to_string_lossy()
            .into_owned();
        if !id_valid(&name) {
            continue;
        }
        count += 1;
        if count > 256 {
            return Err(failure("troppi backup Runtime da verificare."));
        }
        let source = read(
            root,
            &format!(".framecraft/runtime-updates/{name}/meta.json"),
            32768,
        )?
        .ok_or_else(|| failure("un backup Runtime non è leggibile."))?;
        let meta:serde_json::Value=serde_json::from_str(&source).map_err(|_|failure("stato Runtime danneggiato: apri Aggiorna componenti del pannello → Backup e ripristino."))?;
        if meta["version"] != 1
            || meta["id"] != name
            || !meta["state"].as_str().is_some_and(terminal)
        {
            return Err(failure("un aggiornamento Runtime è incompleto. Recuperalo da Aggiorna componenti del pannello prima di migrare gli script."));
        }
    }
    Ok(())
}
fn validate(changes: &[Change]) -> Result<(), String> {
    if changes.is_empty() || changes.len() > 1200 {
        return Err(failure("numero di file non valido."));
    }
    let mut names = HashSet::new();
    let mut total = 0;
    for change in changes {
        if !writable(&change.path)
            || !names.insert(change.path.to_lowercase())
            || change.after.is_empty()
            || change.before.len() > MAX_FILE
            || change.after.len() > MAX_FILE
        {
            return Err(failure(
                "file protetto, duplicato, vuoto o troppo grande nella proposta.",
            ));
        }
        total += change.before.len() + change.after.len();
        if change.path.to_ascii_lowercase().ends_with(".json") {
            serde_json::from_str::<serde_json::Value>(&change.after)
                .map_err(|_| failure(format!("{}: JSON non valido.", change.path)))?;
        }
    }
    if total > MAX_TOTAL {
        return Err(failure("la proposta supera 24 MB."));
    }
    Ok(())
}
fn checked_write(root: &Path, change: &Change) -> Result<(), String> {
    if read(root, &change.path, MAX_FILE)?.as_deref() != Some(&change.before) {
        return Err(failure(format!(
            "{} è cambiato dopo il confronto. Nessuna sovrascrittura automatica.",
            change.path
        )));
    }
    write(root, &change.path, &change.after)
}
fn load_backup(root: &Path, id: &str) -> Result<(Backup, Journal), String> {
    if !id_valid(id) {
        return Err(failure("ID backup non valido."));
    }
    let meta: Backup = serde_json::from_str(
        &read(root, &format!("{BACKUPS}/{id}/meta.json"), 32768)?
            .ok_or_else(|| failure("backup non trovato."))?,
    )
    .map_err(|_| failure("stato backup non valido."))?;
    let journal: Journal = serde_json::from_str(
        &read(
            root,
            &format!("{BACKUPS}/{id}/.env.script-migration.json"),
            MAX_JOURNAL,
        )?
        .ok_or_else(|| failure("contenuto backup mancante."))?,
    )
    .map_err(|_| failure("contenuto backup non valido."))?;
    if meta.version != 1
        || meta.root != path_string(root)
        || meta.id != id
        || journal.version != 1
        || journal.root != path_string(root)
        || meta.file_count != journal.changes.len()
    {
        return Err(failure("backup di un’altra cartella o versione."));
    }
    validate(&journal.changes)?;
    Ok((meta, journal))
}
fn restore(root: &Path, id: &str) -> Result<Vec<String>, String> {
    let (mut meta, journal) = load_backup(root, id)?;
    let mut reverse = vec![];
    for change in journal.changes.iter().rev() {
        let current = read(root, &change.path, MAX_FILE)?;
        if current.as_deref() == Some(&change.before) {
            continue;
        }
        if current.as_deref() != Some(&change.after) {
            return Err(failure(format!("{} contiene modifiche successive: conservate. Controlla il backup prima di ripristinare.",change.path)));
        }
        reverse.push(Change {
            path: change.path.clone(),
            before: change.after.clone(),
            after: change.before.clone(),
        });
    }
    meta.state = "restoring".into();
    save_backup(root, &meta)?;
    for change in reverse {
        if let Err(error) = checked_write(root, &change) {
            meta.state = "needs-review".into();
            meta.failure = Some(error.clone());
            let _ = save_backup(root, &meta);
            return Err(error);
        }
    }
    meta.state = "restored".into();
    meta.failure = None;
    save_backup(root, &meta)?;
    Ok(journal
        .changes
        .into_iter()
        .map(|change| change.path)
        .collect())
}
fn apply_with(
    root: &Path,
    changes: Vec<Change>,
    mut writer: impl FnMut(&Path, &Change, usize) -> Result<(), String>,
    verify: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<String, String> {
    validate(&changes)?;
    assert_complete(root)?;
    for change in &changes {
        if read(root, &change.path, MAX_FILE)?.as_deref() != Some(&change.before) {
            return Err(failure(format!(
                "{} è cambiato: ricarica il confronto.",
                change.path
            )));
        }
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| failure("orologio non valido."))?;
    let id = format!("{}-{}", stamp.as_nanos(), std::process::id());
    let staging = format!("{BACKUPS}/pending-{id}");
    let mut meta = Backup {
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
    if journal.len() > MAX_JOURNAL {
        return Err(failure("backup troppo grande."));
    }
    write(
        root,
        &format!("{staging}/.env.script-migration.json"),
        &journal,
    )?;
    write(
        root,
        &format!("{staging}/meta.json"),
        &serde_json::to_string(&meta).map_err(|_| failure("stato backup non serializzabile."))?,
    )?;
    fs::rename(
        location(root, &staging)?,
        location(root, &format!("{BACKUPS}/{id}"))?,
    )
    .map_err(|_| failure("backup non pubblicato: nessun file aggiornato."))?;
    meta.state = "applying".into();
    save_backup(root, &meta)?;
    let attempt = (|| {
        for (index, change) in changes.iter().enumerate() {
            writer(root, change, index)?;
        }
        verify(root)
    })();
    if let Err(error) = attempt {
        let rolled = restore(root, &id);
        meta.state = if rolled.is_ok() {
            "rolled-back"
        } else {
            "needs-review"
        }
        .into();
        meta.failure = Some(error.clone());
        let _ = save_backup(root, &meta);
        return Err(failure(format!(
            "{error} Backup {id}. {}",
            if rolled.is_ok() {
                "File ripristinati. Prepara un nuovo confronto."
            } else {
                "Recupero da verificare. Le modifiche esterne sono conservate."
            }
        )));
    }
    meta.state = "completed".into();
    save_backup(root, &meta)?;
    Ok(id)
}
fn project<'a>(
    requested: &str,
    state: &'a RuntimeState,
) -> Result<(std::sync::MutexGuard<'a, Option<PathBuf>>, PathBuf), String> {
    let root = fs::canonicalize(requested).map_err(|_| failure("progetto non disponibile."))?;
    let guard = state
        .project_root
        .try_lock()
        .map_err(|_| failure("progetto occupato."))?;
    if guard.as_ref() != Some(&root) {
        return Err(failure("il progetto non è più quello aperto."));
    }
    Ok((guard, root))
}
fn reserve_gateway(root: &Path) -> Result<Option<std::net::TcpListener>, String> {
    let Some(source) = read(root, "framecraft.connections.json", 4 * 1024 * 1024)? else {
        return Ok(None);
    };
    let config: serde_json::Value = serde_json::from_str(&source)
        .map_err(|_| failure("Connessioni PLC non leggibili: nessun file scritto."))?;
    if config["gateway"]["enabled"] != true {
        return Ok(None);
    }
    let port = config["gateway"]["port"]
        .as_u64()
        .filter(|port| *port >= 1 && *port <= 65535)
        .ok_or_else(|| failure("configura una porta fissa valida per il servizio PLC."))?
        as u16;
    std::net::TcpListener::bind(("127.0.0.1",port)).map(Some).map_err(|_|failure("il servizio PLC è attivo o la sua porta è occupata. Arrestalo prima di applicare o ripristinare."))
}
fn mutate<T>(
    requested: &str,
    generation: u64,
    state: &RuntimeState,
    operation: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    let _edit = state
        .ai_project_edit
        .try_lock()
        .map_err(|_| failure("una modifica ai file è già in corso."))?;
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
            "arresta l’anteprima prima di applicare o ripristinare.",
        ));
    }
    let _port = reserve_gateway(&root)?;
    operation(&root)
}
fn snapshot(
    requested: &str,
    recovery_only: bool,
    state: &RuntimeState,
) -> Result<Snapshot, String> {
    let _edit = state
        .ai_project_edit
        .lock()
        .map_err(|_| failure("una modifica ai file è già in corso."))?;
    let (_guard, root) = project(requested, state)?;
    let generation = state.project_generation.load(Ordering::SeqCst);
    let records = backups(&root)?;
    if recovery_only {
        return Ok(Snapshot {
            generation,
            token: None,
            files: BTreeMap::new(),
            backups: records,
            runtime_ready: false,
        });
    }
    if !state
        .external_roots
        .try_lock()
        .map_err(|_| failure("sorgenti condivisi occupati."))?
        .is_empty()
    {
        return Err(failure("il progetto usa sorgenti condivisi esterni. Copiali nel progetto prima della migrazione per evitare modifiche ad altri pannelli."));
    }
    let files = inventory(&root)?;
    let protection = protection(&root)?;
    if files != inventory(&root)? {
        return Err(failure(
            "l’inventario è cambiato durante la lettura. Riprova.",
        ));
    }
    let token = format!(
        "{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::SeqCst)
    );
    let ready = runtime_ready(&protection);
    *state
        .script_migration
        .try_lock()
        .map_err(|_| failure("confronto occupato."))? = Some(ReadSet {
        root,
        generation,
        token: token.clone(),
        files: files.clone(),
        protection,
    });
    Ok(Snapshot {
        generation,
        token: Some(token),
        files,
        backups: records,
        runtime_ready: ready,
    })
}
fn apply(
    requested: &str,
    generation: u64,
    token: &str,
    changes: Vec<Change>,
    state: &RuntimeState,
) -> Result<String, String> {
    mutate(requested, generation, state, |root| {
        assert_runtime_update_complete(root)?;
        let mut cached = state
            .script_migration
            .try_lock()
            .map_err(|_| failure("confronto occupato."))?;
        let current = cached
            .as_ref()
            .ok_or_else(|| failure("confronto scaduto. Ricarica la proposta."))?;
        if current.root != root || current.generation != generation || current.token != token {
            return Err(failure("confronto di un altro progetto o superato."));
        }
        let expected = cached.take().unwrap();
        drop(cached);
        if expected.files != inventory(root)? || expected.protection != protection(root)? {
            return Err(failure(
                "sorgenti, import o servizio sono cambiati. Ricarica il confronto.",
            ));
        }
        if !runtime_ready(&expected.protection) {
            return Err(failure("aggiorna prima i componenti del pannello: il servizio installato non ha la guardia di recupero delle migrazioni."));
        }
        validate(&changes)?;
        let mut after = expected.files.clone();
        for change in &changes {
            if expected.files.get(&change.path) != Some(&change.before) {
                return Err(failure(
                    "la proposta non corrisponde all’inventario verificato.",
                ));
            }
            after.insert(change.path.clone(), change.after.clone());
        }
        apply_with(
            root,
            changes,
            |root, change, _| checked_write(root, change),
            |root| {
                if inventory(root)? != after || protection(root)? != expected.protection {
                    return Err(failure("un file o la configurazione del servizio è cambiato durante l’applicazione."));
                }
                Ok(())
            },
        )
    })
}
#[tauri::command]
pub async fn read_script_migration(
    root: String,
    recovery_only: Option<bool>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Snapshot, String> {
    only_editor(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        snapshot(
            &root,
            recovery_only.unwrap_or(false),
            &app.state::<RuntimeState>(),
        )
    })
    .await
    .map_err(|_| failure("lettura interrotta."))?
}
#[tauri::command]
pub async fn apply_script_migration(
    root: String,
    generation: u64,
    token: String,
    changes: Vec<Change>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<String, String> {
    only_editor(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        apply(
            &root,
            generation,
            &token,
            changes,
            &app.state::<RuntimeState>(),
        )
    })
    .await
    .map_err(|_| failure("operazione interrotta: apri Recupera migrazioni script."))?
}
#[tauri::command]
pub async fn restore_script_migration(
    root: String,
    generation: u64,
    backup: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    only_editor(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        mutate(&root, generation, &app.state::<RuntimeState>(), |root| {
            restore(root, &backup)
        })
    })
    .await
    .map_err(|_| failure("ripristino interrotto: conserva il backup."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        write(&root, "src/Page.tsx", "export const value=1;").unwrap();
        write(
            &root,
            "framecraft.scripts.json",
            "{\"version\":1,\"globalModules\":[],\"localDefinitions\":[],\"scheduledTasks\":[]}",
        )
        .unwrap();
        (temp, root)
    }
    fn state(root: &Path) -> RuntimeState {
        let state = RuntimeState::default();
        *state.project_root.lock().unwrap() = Some(root.to_path_buf());
        state
    }
    fn runtime(root: &Path) {
        for (path, source) in [
            (
                "runtime/script-migration-guard.mjs",
                include_str!("../../runtime/script-migration-guard.mjs"),
            ),
            (
                "runtime/gateway-service.mjs",
                include_str!("../../runtime/gateway-service.mjs"),
            ),
            (
                "runtime/mqtt-service.mjs",
                include_str!("../../runtime/mqtt-service.mjs"),
            ),
        ] {
            write(root, path, source).unwrap();
        }
        assert!(
            runtime_ready(&protection(root).unwrap()),
            "the candidate services must call the migration guard"
        );
    }
    fn change() -> Change {
        Change {
            path: "src/Page.tsx".into(),
            before: "export const value=1;".into(),
            after: "export const value=2;".into(),
        }
    }
    fn commit(root: &Path, changes: Vec<Change>) -> Result<String, String> {
        apply_with(
            root,
            changes,
            |root, change, _| checked_write(root, change),
            |_| Ok(()),
        )
    }
    #[test]
    fn path_policy_does_not_allow_runtime_auth_or_filesystem_escape() {
        for path in [
            "../outside.ts",
            "/absolute.ts",
            "src/../outside.ts",
            "src/CON.ts",
            "src/a.ts:stream",
            "src/end. /a.ts",
            ".env.json",
            "runtime/gateway.mjs",
            "framecraft.connections.json",
            "framecraft.auth.json",
            "package.json",
            "framecraft.runtime-components.json",
            "src/framecraftEvents.ts",
        ] {
            assert!(!writable(path), "{path}");
        }
        for path in [
            "src/Schermata principale.tsx",
            "src/pagine/Velocità.tsx",
            "index.html",
            "src/events.json",
            "events.txt",
            "framecraft.scripts.json",
        ] {
            assert!(writable(path), "{path}");
        }
    }
    #[test]
    fn inventory_is_complete_for_source_imports_and_ignores_private_and_generated_directories() {
        let (_temp, root) = fixture();
        write(&root, "events.json", "[]").unwrap();
        write(&root, "src/Other.ts", "export const x=1;").unwrap();
        write(&root, "framecraft.auth.json", "{\"secret\":\"synthetic\"}").unwrap();
        write(&root, "node_modules/dependency.js", "bad").unwrap();
        write(&root, ".framecraft/private.json", "bad").unwrap();
        let files = inventory(&root).unwrap();
        assert_eq!(files.len(), 4);
        assert!(files.contains_key("events.json"));
        assert!(!files.contains_key("framecraft.auth.json"));
    }
    #[test]
    fn snapshot_is_server_owned_and_commits_only_the_exact_read_set() {
        let (_temp, root) = fixture();
        runtime(&root);
        let state = state(&root);
        let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
        assert!(snapshot.runtime_ready);
        let id = apply(
            &path_string(&root),
            snapshot.generation,
            snapshot.token.as_ref().unwrap(),
            vec![change()],
            &state,
        )
        .unwrap();
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            change().after
        );
        assert_eq!(backups(&root).unwrap()[0].state, "completed");
        assert_eq!(restore(&root, &id).unwrap(), vec!["src/Page.tsx"]);
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            change().before
        );
    }
    #[test]
    fn an_old_or_custom_runtime_is_refused_before_writing() {
        let (_temp, root) = fixture();
        let state = state(&root);
        let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
        assert!(!snapshot.runtime_ready);
        assert!(apply(
            &path_string(&root),
            0,
            snapshot.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .unwrap_err()
        .contains("componenti"));
        assert!(backups(&root).unwrap().is_empty());
    }
    #[test]
    fn changing_an_unchanged_import_invalidates_the_proposal() {
        let (_temp, root) = fixture();
        runtime(&root);
        let state = state(&root);
        write(&root, "src/Import.ts", "export const x=1;").unwrap();
        let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
        write(&root, "src/Import.ts", "export const x=2;").unwrap();
        assert!(apply(
            &path_string(&root),
            0,
            snapshot.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .is_err());
        assert!(backups(&root).unwrap().is_empty());
    }
    #[test]
    fn adding_or_removing_a_source_invalidates_the_inventory() {
        for remove in [true, false] {
            let (_temp, root) = fixture();
            runtime(&root);
            let state = state(&root);
            let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
            if remove {
                fs::remove_file(root.join("src/Page.tsx")).unwrap();
            } else {
                write(&root, "src/New.tsx", "export const x=1;").unwrap();
            }
            assert!(apply(
                &path_string(&root),
                0,
                snapshot.token.as_ref().unwrap(),
                vec![change()],
                &state
            )
            .is_err());
            assert!(backups(&root).unwrap().is_empty());
        }
    }
    #[test]
    fn a_service_configuration_change_invalidates_the_proposal_without_exposing_it_in_snapshot() {
        let (_temp, root) = fixture();
        runtime(&root);
        write(
            &root,
            "framecraft.connections.json",
            "{\"gateway\":{\"enabled\":false},\"secret\":\"synthetic\"}",
        )
        .unwrap();
        let state = state(&root);
        let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
        assert!(!snapshot.files.contains_key("framecraft.connections.json"));
        write(
            &root,
            "framecraft.connections.json",
            "{\"gateway\":{\"enabled\":false}}",
        )
        .unwrap();
        assert!(apply(
            &path_string(&root),
            0,
            snapshot.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .is_err());
    }
    #[test]
    fn token_generation_root_and_full_before_text_are_checked() {
        let (_temp, root) = fixture();
        runtime(&root);
        let state = state(&root);
        let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
        assert!(apply(
            &path_string(&root),
            1,
            snapshot.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .is_err());
        assert!(apply(&path_string(&root), 0, "wrong", vec![change()], &state).is_err());
        let mut changed = change();
        changed.before = "invented".into();
        assert!(apply(
            &path_string(&root),
            0,
            snapshot.token.as_ref().unwrap(),
            vec![changed],
            &state
        )
        .is_err());
        assert!(backups(&root).unwrap().is_empty());
    }
    #[test]
    fn snapshots_invalidate_previous_tokens_and_success_consumes_them() {
        let (_temp, root) = fixture();
        runtime(&root);
        let state = state(&root);
        let first = snapshot(&path_string(&root), false, &state).unwrap();
        let second = snapshot(&path_string(&root), false, &state).unwrap();
        assert_ne!(first.token, second.token);
        assert!(apply(
            &path_string(&root),
            0,
            first.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .is_err());
        apply(
            &path_string(&root),
            0,
            second.token.as_ref().unwrap(),
            vec![change()],
            &state,
        )
        .unwrap();
        assert!(apply(
            &path_string(&root),
            0,
            second.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .is_err());
    }
    #[test]
    fn failure_after_the_first_write_restores_original_files() {
        let (_temp, root) = fixture();
        write(&root, "src/Second.ts", "before").unwrap();
        let result = apply_with(
            &root,
            vec![
                change(),
                Change {
                    path: "src/Second.ts".into(),
                    before: "before".into(),
                    after: "after".into(),
                },
            ],
            |root, change, index| {
                if index == 1 {
                    Err(failure("synthetic failure"))
                } else {
                    checked_write(root, change)
                }
            },
            |_| Ok(()),
        );
        assert!(result.is_err());
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            change().before
        );
        assert_eq!(
            read(&root, "src/Second.ts", MAX_FILE).unwrap().unwrap(),
            "before"
        );
        assert_eq!(backups(&root).unwrap()[0].state, "rolled-back");
        assert_complete(&root).unwrap();
    }
    #[test]
    fn post_write_read_set_failure_rolls_back_without_overwriting_external_edits() {
        let (_temp, root) = fixture();
        write(&root, "src/Other.ts", "before").unwrap();
        let mut expected = inventory(&root).unwrap();
        expected.insert(change().path, change().after);
        let result = apply_with(
            &root,
            vec![change()],
            |root, change, _| {
                checked_write(root, change)?;
                write(root, "src/Other.ts", "external")
            },
            |root| {
                if inventory(root)? != expected {
                    Err(failure("inventory changed"))
                } else {
                    Ok(())
                }
            },
        );
        assert!(result.is_err());
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            change().before
        );
        assert_eq!(
            read(&root, "src/Other.ts", MAX_FILE).unwrap().unwrap(),
            "external"
        );
    }
    #[test]
    fn a_conflicting_target_is_preserved_and_requires_review_before_restart() {
        let (_temp, root) = fixture();
        write(&root, "src/Second.ts", "before").unwrap();
        let result = apply_with(
            &root,
            vec![
                change(),
                Change {
                    path: "src/Second.ts".into(),
                    before: "before".into(),
                    after: "after".into(),
                },
            ],
            |root, change, index| {
                if index == 0 {
                    checked_write(root, change)?;
                    write(root, "src/Second.ts", "external")
                } else {
                    checked_write(root, change)
                }
            },
            |_| Ok(()),
        );
        assert!(result.is_err());
        assert_eq!(
            read(&root, "src/Second.ts", MAX_FILE).unwrap().unwrap(),
            "external"
        );
        assert_eq!(backups(&root).unwrap()[0].state, "needs-review");
        assert!(assert_complete(&root).is_err());
    }
    #[test]
    fn interrupted_writes_leave_a_recoverable_journal_and_block_restart() {
        let (_temp, root) = fixture();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            apply_with(
                &root,
                vec![change()],
                |root, change, _| {
                    checked_write(root, change)?;
                    panic!("synthetic process interruption")
                },
                |_| Ok(()),
            )
        }));
        assert!(result.is_err());
        let backups = backups(&root).unwrap();
        assert_eq!(backups[0].state, "applying");
        assert!(assert_complete(&root).is_err());
        restore(&root, &backups[0].id).unwrap();
        assert_complete(&root).unwrap();
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            change().before
        );
    }
    #[test]
    fn completed_backup_restore_does_not_overwrite_subsequent_changes() {
        let (_temp, root) = fixture();
        let id = commit(&root, vec![change()]).unwrap();
        write(&root, "src/Page.tsx", "external").unwrap();
        assert!(restore(&root, &id).unwrap_err().contains("successive"));
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            "external"
        );
    }
    #[test]
    fn restore_checks_all_conflicts_before_modifying_any_target() {
        let (_temp, root) = fixture();
        write(&root, "src/Second.ts", "before").unwrap();
        let id = commit(
            &root,
            vec![
                change(),
                Change {
                    path: "src/Second.ts".into(),
                    before: "before".into(),
                    after: "after".into(),
                },
            ],
        )
        .unwrap();
        write(&root, "src/Page.tsx", "external").unwrap();
        assert!(restore(&root, &id).is_err());
        assert_eq!(
            read(&root, "src/Second.ts", MAX_FILE).unwrap().unwrap(),
            "after"
        );
    }
    #[test]
    fn recovery_listing_does_not_require_a_valid_catalog_or_source_inventory() {
        let (_temp, root) = fixture();
        let id = commit(&root, vec![change()]).unwrap();
        write(&root, "framecraft.scripts.json", "broken JSON").unwrap();
        let state = state(&root);
        let snapshot = snapshot(&path_string(&root), true, &state).unwrap();
        assert!(snapshot.files.is_empty());
        assert!(snapshot.token.is_none());
        assert_eq!(snapshot.backups[0].id, id);
    }
    #[test]
    fn private_runtime_journal_is_not_read_or_modified_by_script_migrations() {
        let (_temp, root) = fixture();
        write(
            &root,
            ".framecraft/runtime-updates/12-34/meta.json",
            "synthetic old runtime record",
        )
        .unwrap();
        let id = commit(&root, vec![change()]).unwrap();
        restore(&root, &id).unwrap();
        assert_eq!(
            read(
                &root,
                ".framecraft/runtime-updates/12-34/meta.json",
                MAX_FILE
            )
            .unwrap()
            .unwrap(),
            "synthetic old runtime record"
        );
    }
    #[test]
    fn hard_links_and_duplicate_paths_are_refused() {
        let (_temp, root) = fixture();
        fs::hard_link(root.join("src/Page.tsx"), root.join("src/Linked.tsx")).unwrap();
        assert!(inventory(&root).is_err());
        assert!(validate(&[change(), change()]).is_err());
    }
    #[test]
    fn malformed_or_out_of_root_journals_never_restore_project_files() {
        let (_temp, root) = fixture();
        let id = commit(&root, vec![change()]).unwrap();
        let path = format!("{BACKUPS}/{id}/.env.script-migration.json");
        let mut journal: Journal =
            serde_json::from_str(&read(&root, &path, MAX_JOURNAL).unwrap().unwrap()).unwrap();
        journal.changes[0].path = "../outside.ts".into();
        write(&root, &path, &serde_json::to_string(&journal).unwrap()).unwrap();
        assert!(restore(&root, &id).is_err());
        assert_eq!(
            read(&root, "src/Page.tsx", MAX_FILE).unwrap().unwrap(),
            change().after
        );
    }
    #[test]
    fn unfinished_metadata_and_corruption_block_recovery_and_new_writes() {
        let (_temp, root) = fixture();
        write(&root, &format!("{BACKUPS}/12-34/meta.json"), "broken").unwrap();
        assert!(assert_complete(&root).is_err());
        assert!(commit(&root, vec![change()]).is_err());
    }
    #[test]
    fn active_gateway_port_and_editor_locks_prevent_mutations() {
        let (_temp, root) = fixture();
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        write(
            &root,
            "framecraft.connections.json",
            &format!("{{\"gateway\":{{\"enabled\":true,\"port\":{port}}}}}"),
        )
        .unwrap();
        let state = state(&root);
        assert!(mutate(&path_string(&root), 0, &state, |_| Ok(())).is_err());
        drop(listener);
        mutate(&path_string(&root), 0, &state, |_| {
            assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_err());
            Ok(())
        })
        .unwrap();
        let _guard = state.ai_project_edit.lock().unwrap();
        assert!(mutate(&path_string(&root), 0, &state, |_| Ok(())).is_err());
    }
    #[test]
    fn only_main_window_can_use_the_commands() {
        assert!(only_editor("main").is_ok());
        for label in ["preview", "panel", "", "main-child"] {
            assert!(only_editor(label).is_err());
        }
    }
    #[test]
    fn source_limits_fail_without_producing_partial_inventories() {
        let (_temp, root) = fixture();
        write(&root, "src/Large.ts", &"x".repeat(MAX_FILE + 1)).unwrap();
        assert!(inventory(&root).is_err());
    }
    #[test]
    fn pending_runtime_updates_are_read_only_and_prevent_new_migrations() {
        let (_temp, root) = fixture();
        runtime(&root);
        let state = state(&root);
        let record = "{\"version\":1,\"id\":\"12-34\",\"state\":\"applying\"}";
        write(&root, ".framecraft/runtime-updates/12-34/meta.json", record).unwrap();
        let snapshot = snapshot(&path_string(&root), false, &state).unwrap();
        assert!(apply(
            &path_string(&root),
            0,
            snapshot.token.as_ref().unwrap(),
            vec![change()],
            &state
        )
        .unwrap_err()
        .contains("Runtime"));
        assert_eq!(
            read(
                &root,
                ".framecraft/runtime-updates/12-34/meta.json",
                MAX_FILE
            )
            .unwrap()
            .unwrap(),
            record
        );
        assert!(backups(&root).unwrap().is_empty());
    }
    #[test]
    fn user_hidden_source_directories_are_inventoried_instead_of_silently_skipped() {
        let (_temp, root) = fixture();
        write(&root, "src/.internal/Panel.tsx", "export const value=1;").unwrap();
        write(&root, ".components/events.ts", "export const events=[];").unwrap();
        let files = inventory(&root).unwrap();
        assert!(files.contains_key("src/.internal/Panel.tsx"));
        assert!(files.contains_key(".components/events.ts"));
        assert!(writable("src/.internal/Panel.tsx"));
    }
}
