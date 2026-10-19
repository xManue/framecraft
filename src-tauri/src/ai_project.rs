use super::{path_string, write_atomic, RuntimeState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use tauri::State;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change { path: String, before: Option<String>, after: Option<String> }
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Backup { version: u8, root: String, changes: Vec<Change> }

fn allowed(path: &str) -> bool {
    if path.is_empty() || path.len() > 240 || !path.bytes().all(|b| b.is_ascii_alphanumeric() || b"_./ -".contains(&b)) { return false; }
    if path.split('/').any(|part| {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        part.is_empty() || part.starts_with('.') || part.ends_with(['.', ' ']) || ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&stem.as_str())
            || ["node_modules", "dist", "build", "coverage", "target", "standard"].contains(&part.to_ascii_lowercase().as_str())
    }) { return false; }
    if path == "framecraft.plc.json" || path == "framecraft.recipes.json" { return true; }
    let lower = path.to_ascii_lowercase();
    let name = lower.rsplit('/').next().unwrap_or("");
    path.starts_with("src/") && [".js", ".jsx", ".ts", ".tsx", ".mjs", ".css"].iter().any(|ext| lower.ends_with(ext))
        && !["secret", "credential", "password", "token", ".config."].iter().any(|part| name.contains(part))
}
fn link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)] { use std::os::windows::fs::MetadataExt; meta.file_attributes() & 0x400 != 0 }
    #[cfg(not(windows))] { meta.file_type().is_symlink() }
}
fn no_links(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let mut target = root.to_path_buf();
    for part in relative.components() {
        if !matches!(part, std::path::Component::Normal(_)) { return Err("Percorso AI non valido.".into()); }
        target.push(part);
        match fs::symlink_metadata(&target) {
            Ok(meta) if link(&meta) => return Err("I collegamenti e le junction non sono modificabili dall’AI.".into()),
            Ok(_) => {},
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(target)
}
fn read(root: &Path, path: &str) -> Result<Option<String>, String> {
    if !allowed(path) { return Err(format!("File protetto o fuori progetto: {path}")); }
    let file = no_links(root, Path::new(path))?;
    match fs::metadata(&file) {
        Ok(meta) if !meta.is_file() || meta.len() > 300_000 => return Err(format!("{path}: non è un file di testo entro 300 kB.")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
        _ => {},
    }
    fs::read_to_string(file).map(Some).map_err(|error| error.to_string())
}
fn catalog(before: Option<&str>, after: &str) -> Result<(), String> {
    let old: Value = match before { Some(text) => serde_json::from_str(text).map_err(|_| "Catalogo PLC esistente non valido")?, None => serde_json::json!({"version":1,"variables":[]}) };
    let next: Value = serde_json::from_str(after).map_err(|_| "Nuovo catalogo PLC non valido")?;
    let previous = old["variables"].as_array().ok_or("Catalogo PLC senza variables")?;
    let values = next["variables"].as_array().ok_or("Catalogo PLC senza variables")?;
    let mut unchanged = next.clone(); unchanged["variables"] = Value::Array(previous.clone());
    if unchanged != old || values.len() < previous.len() || values[..previous.len()] != previous[..] { return Err("L’AI può solo aggiungere variabili non mappate: il catalogo reale resta invariato.".into()); }
    let mut names: Vec<String> = previous.iter().filter_map(|item| item["name"].as_str()).map(str::to_lowercase).collect();
    if values.len() - previous.len() > 24 { return Err("Troppe variabili nuove.".into()); }
    for item in &values[previous.len()..] {
        let name = item["name"].as_str().unwrap_or("");
        if name.is_empty() || name.len() > 200 || !name.as_bytes()[0].is_ascii_alphabetic() && !name.starts_with('_') || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.-&{}[]()/: ".contains(&b))
            || names.contains(&name.to_lowercase()) || !["BOOL", "INT", "DINT", "REAL", "LREAL", "STRING"].contains(&item["dataType"].as_str().unwrap_or(""))
            || item["access"] != "read" || item["address"] != "" || item.get("connection").is_some() || !item.is_object() || item["description"].as_str().is_none_or(|text| text.len() > 2000)
            || item.as_object().unwrap().keys().any(|key| !["name", "dataType", "description", "access", "address", "table"].contains(&key.as_str())) {
            return Err("Variabile AI non valida: servono nome unico, tipo scalare, sola lettura e nessun indirizzo o connessione inventati.".into());
        }
        names.push(name.to_lowercase());
    }
    Ok(())
}
fn recipe_change(root: &Path, change: &Change) -> Result<(), String> {
    if change.path == "framecraft.recipes.json" {
        crate::recipe_config::require_initial(root)?;
        if let Some(source) = &change.after { crate::recipe_config::validate_source(source)?; }
    }
    Ok(())
}
fn write(root: &Path, change: &Change) -> Result<(), String> {
    recipe_change(root, change)?;
    if read(root, &change.path)? != change.before { return Err(format!("{} è cambiato dopo la proposta. Nessuna sovrascrittura automatica.", change.path)); }
    let file = no_links(root, Path::new(&change.path))?;
    match &change.after {
        Some(source) => {
            let parent = file.parent().ok_or("Cartella non valida")?;
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            no_links(root, Path::new(&change.path))?;
            write_atomic(&file, source)
        },
        None => fs::remove_file(file).map_err(|error| error.to_string()),
    }
}
fn apply(root: &Path, changes: &[Change], restore: bool) -> Result<String, String> {
    if changes.is_empty() || changes.len() > 8 || changes.iter().map(|change| change.after.as_ref().map_or(0, String::len) + change.before.as_ref().map_or(0, String::len)).sum::<usize>() > 2_000_000 { return Err("Proposta AI troppo grande o vuota.".into()); }
    let mut paths = Vec::new();
    for change in changes {
        if paths.contains(&change.path.to_lowercase()) || !allowed(&change.path) || !restore && change.after.as_ref().is_none_or(|source| source.trim().is_empty()) { return Err("La proposta contiene file duplicati, protetti o cancellazioni non consentite.".into()); }
        paths.push(change.path.to_lowercase());
        recipe_change(root, change)?;
        if change.after.as_ref().is_some_and(|source| source.len() > 300_000) || read(root, &change.path)? != change.before { return Err(format!("{} è cambiato o supera i limiti. Aggiorna la proposta.", change.path)); }
        if !restore && change.path == "framecraft.plc.json" { catalog(change.before.as_deref(), change.after.as_deref().ok_or("Catalogo non valido")?)?; }
    }
    let id = format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| "Orologio non valido")?.as_nanos(), std::process::id());
    let directory = no_links(root, Path::new(".framecraft/ai-backups"))?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    no_links(root, Path::new(".framecraft/ai-backups"))?;
    let backup = Backup { version: 1, root: path_string(root), changes: changes.to_vec() };
    write_atomic(&directory.join(format!("{id}.json")), &serde_json::to_string(&backup).map_err(|error| error.to_string())?)?;
    for (index, change) in changes.iter().enumerate() {
        if let Err(error) = write(root, change) {
            let mut failed = Vec::new();
            for previous in changes[..index].iter().rev() {
                let reverse = Change { path: previous.path.clone(), before: previous.after.clone(), after: previous.before.clone() };
                if write(root, &reverse).is_err() { failed.push(previous.path.clone()); }
            }
            return Err(format!("Modifica AI fermata: {error}. Backup: {id}. {}", if failed.is_empty() { "File già scritti ripristinati.".into() } else { format!("Ripristino da verificare, senza sovrascrivere modifiche esterne: {}", failed.join(", ")) }));
        }
    }
    Ok(id)
}
fn project(root: &str, state: &RuntimeState) -> Result<PathBuf, String> {
    let requested = fs::canonicalize(root).map_err(|_| "Progetto non più disponibile")?;
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato")?;
    if opened.as_ref() != Some(&requested) { return Err("Il progetto AI non è più aperto.".into()); }
    Ok(requested)
}
#[tauri::command]
pub fn read_ai_project_file(root: String, path: String, state: State<RuntimeState>) -> Result<Option<String>, String> {
    let root = project(&root, &state)?;
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato")?;
    if opened.as_ref() != Some(&root) { return Err("Il progetto è cambiato.".into()); }
    read(&root, &path)
}
#[tauri::command]
pub fn apply_ai_project_changes(root: String, changes: Vec<Change>, state: State<RuntimeState>) -> Result<String, String> {
    let _edit = state.ai_project_edit.lock().map_err(|_| "Modifica AI occupata")?;
    let root = project(&root, &state)?;
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato")?;
    if opened.as_ref() != Some(&root) { return Err("Il progetto è cambiato.".into()); }
    apply(&root, &changes, false)
}
#[tauri::command]
pub fn restore_ai_project_changes(root: String, backup: String, state: State<RuntimeState>) -> Result<(), String> {
    let _edit = state.ai_project_edit.lock().map_err(|_| "Modifica AI occupata")?;
    let root = project(&root, &state)?;
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato")?;
    if opened.as_ref() != Some(&root) || backup.is_empty() || backup.len() > 80 || !backup.bytes().all(|b| b.is_ascii_digit() || b == b'-') { return Err("Backup AI non valido per il progetto.".into()); }
    let file = no_links(&root, Path::new(&format!(".framecraft/ai-backups/{backup}.json")))?;
    if fs::metadata(&file).map_err(|_| "Backup non trovato")?.len() > 3_000_000 { return Err("Backup troppo grande.".into()); }
    let saved: Backup = serde_json::from_str(&fs::read_to_string(file).map_err(|error| error.to_string())?).map_err(|_| "Backup non leggibile")?;
    if saved.version != 1 || saved.root != path_string(&root) { return Err("Backup di un altro progetto.".into()); }
    let reverse = restore_plan(&root, &saved.changes)?;
    if reverse.is_empty() { return Ok(()); }
    apply(&root, &reverse, true).map(|_| ())
}

fn restore_plan(root: &Path, changes: &[Change]) -> Result<Vec<Change>, String> {
    let mut reverse = Vec::new();
    for change in changes {
        let current = read(root, &change.path)?;
        if current == change.before { continue; } // Also recovers a process exit halfway through a batch.
        if current != change.after { return Err(format!("{} è cambiato dopo il salvataggio AI. Il ripristino non sovrascrive modifiche esterne.", change.path)); }
        reverse.push(Change { path: change.path.clone(), before: change.after.clone(), after: change.before.clone() });
    }
    Ok(reverse)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn ai_project_rejects_protected_paths() {
        for path in ["../src/App.tsx", "src/../App.tsx", "src/.env.ts", "package.json", "src/secrets.ts", "src/node_modules/a.js", "C:/src/a.ts", "src\\App.tsx", "src/a.ts ", "src/CON.ts", "src/lpt1.ts"] { assert!(!allowed(path), "{path}"); }
        assert!(allowed("src/Header.tsx")); assert!(allowed("framecraft.plc.json"));
    }
    #[test] fn ai_project_checks_stale_sources_and_keeps_backup() {
        let temp = tempfile::tempdir().unwrap(); let root = temp.path(); fs::create_dir(root.join("src")).unwrap(); fs::write(root.join("src/App.tsx"), "before").unwrap();
        let changes = vec![Change { path: "src/App.tsx".into(), before: Some("before".into()), after: Some("after".into()) }];
        let id = apply(root, &changes, false).unwrap(); assert_eq!(fs::read_to_string(root.join("src/App.tsx")).unwrap(), "after"); assert!(root.join(format!(".framecraft/ai-backups/{id}.json")).is_file());
        assert!(apply(root, &changes, false).is_err());
        let reverse = vec![Change { path: "src/App.tsx".into(), before: Some("after".into()), after: Some("before".into()) }]; apply(root, &reverse, true).unwrap();
        assert_eq!(fs::read_to_string(root.join("src/App.tsx")).unwrap(), "before");
    }
    #[test] fn ai_recipe_catalog_has_backup_and_restores_only_before_operational_initialization() {
        let temp = tempfile::tempdir().unwrap(); let root = fs::canonicalize(temp.path()).unwrap();
        let change = Change { path: "framecraft.recipes.json".into(), before: None, after: Some("{\"version\":1,\"schemas\":[]}".into()) };
        let id = apply(&root, &[change.clone()], false).unwrap(); assert!(root.join(format!(".framecraft/ai-backups/{id}.json")).is_file());
        let reverse = restore_plan(&root, &[change.clone()]).unwrap(); apply(&root, &reverse, true).unwrap(); assert!(!root.join(&change.path).exists());
        apply(&root, &[change.clone()], false).unwrap(); let reverse = restore_plan(&root, &[change.clone()]).unwrap();
        fs::create_dir_all(root.join(".framecraft-runtime/recipes")).unwrap(); fs::write(root.join(".framecraft-runtime/recipes/recipes.json"), "PRIVATE_OPERATIONAL_VALUES").unwrap();
        assert!(apply(&root, &reverse, true).unwrap_err().contains("operativo")); assert_eq!(fs::read_to_string(root.join(&change.path)).unwrap(), change.after.unwrap()); assert_eq!(fs::read_to_string(root.join(".framecraft-runtime/recipes/recipes.json")).unwrap(), "PRIVATE_OPERATIONAL_VALUES");
    }
    #[test] fn ai_recipe_preflight_blocks_the_entire_batch_for_an_operational_store_or_invalid_envelope() {
        let temp = tempfile::tempdir().unwrap(); let root = fs::canonicalize(temp.path()).unwrap(); fs::create_dir(root.join("src")).unwrap(); fs::write(root.join("src/A.ts"), "before").unwrap();
        let code = Change { path: "src/A.ts".into(), before: Some("before".into()), after: Some("after".into()) };
        let mut recipe = Change { path: "framecraft.recipes.json".into(), before: None, after: Some("{\"version\":1,\"schemas\":[],\"PRIVATE_EXTRA\":true}".into()) };
        assert!(apply(&root, &[code.clone(), recipe.clone()], false).is_err()); assert_eq!(fs::read_to_string(root.join("src/A.ts")).unwrap(), "before");
        recipe.after = Some("{\"version\":1,\"schemas\":[]}".into()); fs::create_dir_all(root.join(".framecraft-runtime/recipes")).unwrap();
        assert!(apply(&root, &[code, recipe], false).unwrap_err().contains("operativo")); assert!(!root.join("framecraft.recipes.json").exists()); assert_eq!(fs::read_to_string(root.join("src/A.ts")).unwrap(), "before"); assert!(!root.join(".framecraft/ai-backups").exists());
        for path in [".framecraft-runtime/recipes/recipes.json", "framecraft.connections.json", "FRAMECRAFT.RECIPES.JSON"] { assert!(!allowed(path)); } assert!(allowed("framecraft.recipes.json"));
    }
    #[test] fn ai_project_does_not_partially_apply_on_preflight_failure() {
        let temp = tempfile::tempdir().unwrap(); fs::create_dir(temp.path().join("src")).unwrap(); fs::write(temp.path().join("src/A.ts"), "old").unwrap();
        let changes = vec![Change { path: "src/A.ts".into(), before: Some("old".into()), after: Some("new".into()) }, Change { path: "src/B.ts".into(), before: Some("missing".into()), after: Some("new".into()) }];
        assert!(apply(temp.path(), &changes, false).is_err()); assert_eq!(fs::read_to_string(temp.path().join("src/A.ts")).unwrap(), "old");
    }
    #[test] fn ai_project_can_create_and_restore_new_files() {
        let temp = tempfile::tempdir().unwrap();
        let change = Change { path: "src/Header.tsx".into(), before: None, after: Some("export const Header=()=>null".into()) };
        apply(temp.path(), &[change.clone()], false).unwrap();
        assert!(apply(temp.path(), &[Change { path: change.path.clone(), before: change.after.clone(), after: None }], false).is_err());
        apply(temp.path(), &[Change { path: change.path, before: change.after, after: None }], true).unwrap(); assert!(!temp.path().join("src/Header.tsx").exists());
    }
    #[test] fn ai_project_variables_are_append_only_and_unmapped() {
        let old = r#"{"version":1,"variables":[{"name":"Real","address":"ns=2;s=Real"}]}"#;
        let mut next: Value = serde_json::from_str(old).unwrap();
        next["variables"].as_array_mut().unwrap().push(serde_json::json!({"name":"Speed","dataType":"REAL","access":"read","address":"","description":"Velocita"}));
        assert!(catalog(Some(old), &next.to_string()).is_ok());
        next["variables"][1]["address"] = Value::String("invented".into()); assert!(catalog(Some(old), &next.to_string()).is_err());
        next["variables"][1]["address"] = Value::String("".into()); next["variables"][0]["address"] = Value::String("changed".into()); assert!(catalog(Some(old), &next.to_string()).is_err());
    }
    #[test] fn ai_project_rejects_symlink_escape() {
        let temp = tempfile::tempdir().unwrap(); let outside = tempfile::tempdir().unwrap(); fs::create_dir(temp.path().join("src")).unwrap(); fs::write(outside.path().join("A.ts"), "private").unwrap();
        #[cfg(unix)] let linked = std::os::unix::fs::symlink(outside.path(), temp.path().join("src/linked"));
        #[cfg(windows)] let linked = std::os::windows::fs::symlink_dir(outside.path(), temp.path().join("src/linked"));
        if linked.is_ok() { assert!(read(temp.path(), "src/linked/A.ts").is_err()); }
    }
    #[test] fn ai_project_can_restore_partial_batches_but_not_external_edits() {
        let temp = tempfile::tempdir().unwrap(); fs::create_dir(temp.path().join("src")).unwrap();
        fs::write(temp.path().join("src/A.ts"), "after-a").unwrap(); fs::write(temp.path().join("src/B.ts"), "before-b").unwrap();
        let changes = vec![Change { path: "src/A.ts".into(), before: Some("before-a".into()), after: Some("after-a".into()) }, Change { path: "src/B.ts".into(), before: Some("before-b".into()), after: Some("after-b".into()) }];
        let reverse = restore_plan(temp.path(), &changes).unwrap(); assert_eq!(reverse.len(), 1); apply(temp.path(), &reverse, true).unwrap();
        fs::write(temp.path().join("src/A.ts"), "external").unwrap(); assert!(restore_plan(temp.path(), &changes).is_err());
    }
}
