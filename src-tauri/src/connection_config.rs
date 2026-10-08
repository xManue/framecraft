use serde::{Deserialize, Serialize};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}};
use tempfile::NamedTempFile;
use tauri::State;
use crate::RuntimeState;

const LIMIT: usize = 4 * 1024 * 1024;
const CONNECTIONS: &str = "framecraft.connections.json";
const RUNTIME: &str = "framecraft.runtime.json";
const PLC: &str = "framecraft.plc.json";

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigurationFiles {
    pub connections: Option<String>,
    pub runtime: Option<String>,
    pub plc: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigurationSnapshot {
    pub generation: u64,
    pub files: ConfigurationFiles,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConfigurationUpdate {
    pub connections: String,
    pub runtime: String,
}

fn target(root: &Path, name: &str) -> Result<PathBuf, String> {
    let path = root.join(name);
    match fs::symlink_metadata(&path) {
        Ok(meta) => {
            if !meta.is_file() || meta.file_type().is_symlink() || fs::canonicalize(&path).map_err(|_| "Configurazione non accessibile")?.parent() != Some(root) {
                return Err(format!("{name}: il catalogo deve essere un file normale nella cartella del progetto."));
            }
            if meta.len() > LIMIT as u64 { return Err(format!("{name}: catalogo troppo grande (massimo 4 MiB).")); }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err(format!("{name}: impossibile accedere al catalogo.")),
    }
    Ok(path)
}

fn read_one(root: &Path, name: &str) -> Result<Option<String>, String> {
    let path = target(root, name)?;
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(format!("{name}: impossibile leggere il catalogo.")),
    };
    let mut bytes = Vec::new();
    file.take((LIMIT + 1) as u64).read_to_end(&mut bytes).map_err(|_| format!("{name}: lettura fallita."))?;
    if bytes.len() > LIMIT { return Err(format!("{name}: catalogo troppo grande (massimo 4 MiB).")); }
    String::from_utf8(bytes).map(Some).map_err(|_| format!("{name}: codifica UTF-8 richiesta."))
}

fn read_files(root: &Path) -> Result<ConfigurationFiles, String> {
    Ok(ConfigurationFiles { connections: read_one(root, CONNECTIONS)?, runtime: read_one(root, RUNTIME)?, plc: read_one(root, PLC)? })
}

fn check_root<'a>(requested: &str, current: &'a Option<PathBuf>) -> Result<&'a Path, String> {
    let root = current.as_deref().ok_or("Nessun progetto aperto.")?;
    if fs::canonicalize(requested).map_err(|_| "Progetto non accessibile.")? != root {
        return Err("Il progetto aperto è cambiato. Riapri Connessioni PLC.".into());
    }
    Ok(root)
}

#[tauri::command]
pub fn read_connection_configuration(root: String, state: State<RuntimeState>) -> Result<ConfigurationSnapshot, String> {
    read_for_root(&root, &state)
}

fn read_for_root(root: &str, state: &RuntimeState) -> Result<ConfigurationSnapshot, String> {
    let guard = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    let root = check_root(&root, &guard)?;
    Ok(ConfigurationSnapshot { generation: state.project_generation.load(std::sync::atomic::Ordering::SeqCst), files: read_files(root)? })
}

fn stage(root: &Path, name: &str, source: &str) -> Result<NamedTempFile, String> {
    if source.len() > LIMIT { return Err(format!("{name}: catalogo troppo grande (massimo 4 MiB).")); }
    let value: serde_json::Value = serde_json::from_str(source).map_err(|_| format!("{name}: JSON non valido."))?;
    if !value.is_object() || value.get("version").and_then(|v| v.as_u64()) != Some(1) {
        return Err(format!("{name}: versione del catalogo non supportata."));
    }
    target(root, name)?;
    let mut file = NamedTempFile::new_in(root).map_err(|_| "Impossibile preparare il salvataggio.")?;
    file.write_all(source.as_bytes()).and_then(|_| file.as_file().sync_all()).map_err(|_| "Impossibile preparare il salvataggio.")?;
    Ok(file)
}

fn persist(file: NamedTempFile, path: &Path) -> Result<(), String> {
    file.persist(path).map_err(|_| "Impossibile sostituire il catalogo.")?;
    Ok(())
}

// Each replacement is atomic; ordinary I/O errors roll back. Not a crash-atomic two-file transaction.
fn save_with(root: &Path, expected: &ConfigurationFiles, next: &ConfigurationUpdate, mut commit: impl FnMut(NamedTempFile, &Path) -> Result<(), String>) -> Result<ConfigurationFiles, String> {
    let connections = stage(root, CONNECTIONS, &next.connections)?;
    let runtime = stage(root, RUNTIME, &next.runtime)?;
    if &read_files(root)? != expected { return Err("I cataloghi sono cambiati sul disco. Ricarica prima di salvare; nessun file è stato sovrascritto.".into()); }
    let connections_path = target(root, CONNECTIONS)?;
    commit(connections, &connections_path)?;
    let second = read_one(root, RUNTIME).and_then(|actual| {
        if actual != expected.runtime { return Err("Il catalogo Runtime è cambiato durante il salvataggio.".into()); }
        commit(runtime, &target(root, RUNTIME)?)
    });
    if let Err(error) = second {
        if read_one(root, CONNECTIONS)? != Some(next.connections.clone()) {
            return Err("Salvataggio parziale: il primo catalogo è cambiato durante il ripristino. Verifica entrambi i JSON prima di avviare il servizio.".into());
        }
        let rollback = match &expected.connections {
            Some(source) => crate::write_atomic(&connections_path, source),
            None => fs::remove_file(&connections_path).map_err(|_| "Ripristino fallito.".into()),
        };
        if rollback.is_err() { return Err("Salvataggio parziale: ripristino non riuscito. Verifica entrambi i JSON prima di avviare il servizio.".into()); }
        return Err(format!("{error} La configurazione precedente è stata ripristinata."));
    }
    Ok(ConfigurationFiles { connections: Some(next.connections.clone()), runtime: Some(next.runtime.clone()), plc: expected.plc.clone() })
}

#[tauri::command]
pub fn save_connection_configuration(root: String, expected: ConfigurationSnapshot, next: ConfigurationUpdate, state: State<RuntimeState>) -> Result<ConfigurationSnapshot, String> {
    save_for_root(&root, expected, next, &state)
}

fn save_for_root(root: &str, expected: ConfigurationSnapshot, next: ConfigurationUpdate, state: &RuntimeState) -> Result<ConfigurationSnapshot, String> {
    let guard = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    let root = check_root(&root, &guard)?;
    let generation = state.project_generation.load(std::sync::atomic::Ordering::SeqCst);
    if generation != expected.generation { return Err("La sessione del progetto è cambiata. Riapri Connessioni PLC.".into()); }
    Ok(ConfigurationSnapshot { generation, files: save_with(root, &expected.files, &next, persist)? })
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AlarmConfigurationSnapshot {
    pub generation: u64,
    pub source: Option<String>,
    pub plc: Option<String>,
}

#[tauri::command]
pub fn read_alarm_configuration(root: String, state: State<RuntimeState>) -> Result<AlarmConfigurationSnapshot, String> {
    read_alarms_for_root(&root, &state)
}

fn read_alarms_for_root(root: &str, state: &RuntimeState) -> Result<AlarmConfigurationSnapshot, String> {
    let guard = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    let root = check_root(root, &guard).map_err(|error| error.replace("Riapri Connessioni PLC.", "Riapri Allarmi."))?;
    Ok(AlarmConfigurationSnapshot { generation: state.project_generation.load(std::sync::atomic::Ordering::SeqCst), source: read_one(root, "framecraft.alarms.json")?, plc: read_one(root, PLC)? })
}

fn save_alarm_source(root: &Path, expected: &AlarmConfigurationSnapshot, source: &str) -> Result<(), String> {
    let staged = stage(root, "framecraft.alarms.json", source)?;
    if read_one(root, "framecraft.alarms.json")? != expected.source || read_one(root, PLC)? != expected.plc {
        return Err("Il catalogo allarmi o PLC è cambiato sul disco. Ricarica prima di salvare: nessun file è stato sovrascritto.".into());
    }
    persist(staged, &target(root, "framecraft.alarms.json")?)
}

#[tauri::command]
pub fn save_alarm_configuration(root: String, expected: AlarmConfigurationSnapshot, source: String, state: State<RuntimeState>) -> Result<AlarmConfigurationSnapshot, String> {
    save_alarms_for_root(&root, expected, source, &state)
}

fn save_alarms_for_root(root: &str, expected: AlarmConfigurationSnapshot, source: String, state: &RuntimeState) -> Result<AlarmConfigurationSnapshot, String> {
    let guard = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    let root = check_root(root, &guard).map_err(|error| error.replace("Riapri Connessioni PLC.", "Riapri Allarmi."))?;
    let generation = state.project_generation.load(std::sync::atomic::Ordering::SeqCst);
    if generation != expected.generation { return Err("La sessione del progetto è cambiata. Riapri Allarmi.".into()); }
    save_alarm_source(root, &expected, &source)?;
    Ok(AlarmConfigurationSnapshot { generation, source: Some(source), plc: expected.plc })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn alarm_commands_reject_previous_session_and_foreign_project() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let other = tempfile::tempdir().unwrap(); let other_root = fs::canonicalize(other.path()).unwrap();
        let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap();
        let snapshot = read_alarms_for_root(&root.to_string_lossy(), &state).unwrap();
        let source = "{\"version\":1,\"classes\":[],\"alarms\":[],\"maxHistory\":100}";
        crate::set_project_root(&state, root.clone()).unwrap();
        assert!(save_alarms_for_root(&root.to_string_lossy(), snapshot, source.into(), &state).err().unwrap().contains("sessione"));
        let snapshot = read_alarms_for_root(&root.to_string_lossy(), &state).unwrap();
        crate::set_project_root(&state, other_root.clone()).unwrap();
        assert!(read_alarms_for_root(&root.to_string_lossy(), &state).err().unwrap().contains("Riapri Allarmi"));
        assert!(save_alarms_for_root(&root.to_string_lossy(), snapshot, source.into(), &state).is_err());
        assert!(!root.join("framecraft.alarms.json").exists()); assert!(!other_root.join("framecraft.alarms.json").exists());
    }
    #[test]
    fn alarm_catalog_creation_conflicts_and_invalid_json_preserve_files() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let expected = AlarmConfigurationSnapshot { generation: 1, source: None, plc: None };
        let source = "{\"version\":1,\"classes\":[],\"alarms\":[],\"maxHistory\":100}";
        save_alarm_source(&root, &expected, source).unwrap();
        assert!(save_alarm_source(&root, &expected, source).is_err());
        let current = AlarmConfigurationSnapshot { source: Some(source.into()), ..expected };
        assert!(save_alarm_source(&root, &current, "bad json").is_err());
        fs::write(root.join(PLC), "changed").unwrap();
        assert!(save_alarm_source(&root, &current, "{\"version\":1}").is_err());
        assert_eq!(read_one(&root, "framecraft.alarms.json").unwrap().as_deref(), Some(source));
    }
    fn update() -> ConfigurationUpdate {
        ConfigurationUpdate { connections: "{\"version\":1,\"connections\":[]}".into(), runtime: "{\"version\":1,\"gateway\":{\"enabled\":false}}".into() }
    }
    #[test]
    fn missing_files_are_distinct_from_errors_and_creation_does_not_touch_plc() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join(PLC), "{\"variables\":[]}").unwrap();
        let expected = read_files(&root).unwrap(); assert!(expected.connections.is_none());
        let saved = save_with(&root, &expected, &update(), persist).unwrap();
        assert_eq!(read_files(&root).unwrap(), saved); assert_eq!(saved.plc, expected.plc);
    }
    #[test]
    fn edits_to_either_config_or_tag_catalog_block_every_write() {
        for name in [CONNECTIONS, RUNTIME, PLC] {
            let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
            let expected = read_files(&root).unwrap(); fs::write(root.join(name), "external edit").unwrap();
            let actual = read_files(&root).unwrap();
            assert!(save_with(&root, &expected, &update(), persist).unwrap_err().contains("cambiati"));
            assert_eq!(read_files(&root).unwrap(), actual);
        }
    }
    #[test]
    fn malformed_second_file_is_rejected_before_first_replacement() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let expected = read_files(&root).unwrap(); let mut next = update(); next.runtime = "broken".into();
        assert!(save_with(&root, &expected, &next, persist).is_err()); assert_eq!(read_files(&root).unwrap(), expected);
    }
    #[test]
    fn second_write_failure_restores_existing_and_missing_first_file() {
        for original in [None, Some("{\"version\":1,\"connections\":[],\"note\":\"keep\"}")] {
            let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
            if let Some(source) = original { fs::write(root.join(CONNECTIONS), source).unwrap(); }
            let expected = read_files(&root).unwrap(); let mut calls = 0;
            let result = save_with(&root, &expected, &update(), |file, path| { calls += 1; if calls == 2 { Err("Test I/O failure".into()) } else { persist(file, path) } });
            assert!(result.unwrap_err().contains("ripristinata")); assert_eq!(read_files(&root).unwrap(), expected);
        }
    }
    #[test]
    fn rollback_never_overwrites_an_external_change() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let expected = read_files(&root).unwrap(); let mut calls = 0;
        let result = save_with(&root, &expected, &update(), |file, path| {
            calls += 1; if calls == 2 { fs::write(root.join(CONNECTIONS), "external concurrent edit").unwrap(); Err("Test I/O failure".into()) } else { persist(file, path) }
        });
        assert!(result.unwrap_err().contains("parziale")); assert_eq!(fs::read_to_string(root.join(CONNECTIONS)).unwrap(), "external concurrent edit");
    }
    #[test]
    fn directories_large_sources_and_wrong_versions_are_not_overwritten() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        assert!(stage(&root, CONNECTIONS, &"x".repeat(LIMIT + 1)).is_err());
        assert!(stage(&root, CONNECTIONS, "{\"version\":2}").is_err());
        fs::create_dir(root.join(CONNECTIONS)).unwrap(); assert!(read_files(&root).is_err());
    }
    #[test]
    fn closed_or_other_projects_cannot_be_read() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let other = tempfile::tempdir().unwrap();
        assert!(check_root(&root.to_string_lossy(), &None).is_err());
        assert!(check_root(&other.path().to_string_lossy(), &Some(root.clone())).is_err());
        assert_eq!(check_root(&root.to_string_lossy(), &Some(root.clone())).unwrap(), root);
    }
    #[test]
    fn symbolic_link_catalogs_are_not_followed() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        #[cfg(windows)] let linked = std::os::windows::fs::symlink_file(outside.path(), root.join(CONNECTIONS));
        #[cfg(unix)] let linked = std::os::unix::fs::symlink(outside.path(), root.join(CONNECTIONS));
        if linked.is_ok() { assert!(read_files(&root).is_err()); }
    }
    #[test]
    fn reopening_the_same_folder_invalidates_previous_configuration_session() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        let snapshot = read_for_root(&root.to_string_lossy(), &state).unwrap();
        crate::set_project_root(&state, root.clone()).unwrap();
        assert!(save_for_root(&root.to_string_lossy(), snapshot, update(), &state).err().unwrap().contains("sessione"));
        assert!(!root.join(CONNECTIONS).exists());
    }
    #[test]
    fn changing_project_never_writes_old_or_new_configuration() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let other = tempfile::tempdir().unwrap(); let other_root = fs::canonicalize(other.path()).unwrap(); let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap(); let snapshot = read_for_root(&root.to_string_lossy(), &state).unwrap();
        crate::set_project_root(&state, other_root.clone()).unwrap();
        assert!(save_for_root(&root.to_string_lossy(), snapshot, update(), &state).is_err());
        assert!(!root.join(CONNECTIONS).exists()); assert!(!other_root.join(CONNECTIONS).exists());
    }
    #[test]
    fn second_target_becoming_a_directory_rolls_back_first_file() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let expected = read_files(&root).unwrap();
        let result = save_with(&root, &expected, &update(), |file, path| {
            persist(file, path)?; fs::create_dir(root.join(RUNTIME)).unwrap(); Ok(())
        });
        assert!(result.unwrap_err().contains("ripristinata")); assert!(!root.join(CONNECTIONS).exists()); assert!(root.join(RUNTIME).is_dir());
    }
}
