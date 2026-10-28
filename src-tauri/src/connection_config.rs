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
    pub plc: Option<String>,
}

pub(super) fn target(root: &Path, name: &str) -> Result<PathBuf, String> {
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

pub(super) fn read_one(root: &Path, name: &str) -> Result<Option<String>, String> {
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

pub(super) fn read_files(root: &Path) -> Result<ConfigurationFiles, String> {
    Ok(ConfigurationFiles { connections: read_one(root, CONNECTIONS)?, runtime: read_one(root, RUNTIME)?, plc: read_one(root, PLC)? })
}

pub(super) fn check_root<'a>(requested: &str, current: &'a Option<PathBuf>) -> Result<&'a Path, String> {
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

pub(super) fn stage(root: &Path, name: &str, source: &str) -> Result<NamedTempFile, String> {
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

pub(super) fn persist(file: NamedTempFile, path: &Path) -> Result<(), String> {
    file.persist(path).map_err(|_| "Impossibile sostituire il catalogo.")?;
    Ok(())
}

fn validate_plc_append(previous: Option<&str>, source: &str) -> Result<(), String> {
    use serde_json::Value;
    if source.len() > LIMIT { return Err("framecraft.plc.json: catalogo troppo grande (massimo 4 MiB).".into()); }
    let old: Value = serde_json::from_str(previous.unwrap_or(r#"{"version":1,"variables":[]}"#)).map_err(|_| "Catalogo PLC precedente non valido.")?;
    let next: Value = serde_json::from_str(source).map_err(|_| "Nuovo catalogo PLC non valido.")?;
    let before = old["variables"].as_array().ok_or("Catalogo PLC precedente non valido.")?;
    let after = next["variables"].as_array().ok_or("Nuovo catalogo PLC non valido.")?;
    let mut old_meta = old.as_object().ok_or("Catalogo PLC non valido.")?.clone(); old_meta.remove("variables");
    let mut new_meta = next.as_object().ok_or("Catalogo PLC non valido.")?.clone(); new_meta.remove("variables");
    if next["version"] != 1 || old_meta != new_meta || after.len() <= before.len() || after.len() > 50000 || after[..before.len()] != before[..] { return Err("L’importazione può solo aggiungere variabili: definizioni e metadati esistenti devono restare invariati.".into()); }
    let mut names = std::collections::HashSet::new();
    for item in before { let name = item["name"].as_str().ok_or("Nome PLC precedente non valido.")?; if !names.insert(name) { return Err("Nomi PLC duplicati.".into()); } }
    for item in &after[before.len()..] {
        let object = item.as_object().ok_or("Nuova variabile non valida.")?;
        let name = item["name"].as_str().unwrap_or(""); let bytes = name.as_bytes();
        let valid_name = !bytes.is_empty() && bytes.len() <= 200 && name.trim() == name && (bytes[0].is_ascii_alphabetic() || bytes[0] == b'_') && bytes.iter().all(|b| b.is_ascii_alphanumeric() || b"_.-&{}[]()/: ".contains(b));
        if !valid_name || !names.insert(name) || !object.keys().all(|key| ["name","dataType","access","address","description","connection"].contains(&key.as_str())) || !["Bool","SInt","USInt","Int","UInt","DInt","UDInt","Real","LReal","String","WString"].contains(&item["dataType"].as_str().unwrap_or("")) || !["read","write","read-write"].contains(&item["access"].as_str().unwrap_or("")) || item["address"].as_str() != Some("") || !item["description"].as_str().is_some_and(|text| text.len()<=1000) || item.get("connection").is_some_and(|value| !value.as_str().is_some_and(|text| !text.trim().is_empty() && text.len()<=200 && !text.chars().any(char::is_control))) { return Err("Nuova variabile PLC non valida o duplicata. Nessun valore iniziale o indirizzo è inventato.".into()); }
    }
    Ok(())
}
// Each replacement is atomic; ordinary errors roll back, not a crash-atomic group transaction.
fn save_with(root: &Path, expected: &ConfigurationFiles, next: &ConfigurationUpdate, mut commit: impl FnMut(NamedTempFile, &Path) -> Result<(), String>) -> Result<ConfigurationFiles, String> {
    if let Some(source) = &next.plc { validate_plc_append(expected.plc.as_deref(), source)?; }
    let mut entries = vec![(CONNECTIONS,&next.connections,&expected.connections),(RUNTIME,&next.runtime,&expected.runtime)];
    if let Some(source) = &next.plc { entries.push((PLC,source,&expected.plc)); }
    let mut staged = Vec::new(); for (name,source,_) in &entries { staged.push(stage(root,name,source)?); }
    if &read_files(root)? != expected { return Err("I cataloghi sono cambiati sul disco. Ricarica prima di salvare; nessun file è stato sovrascritto.".into()); }
    let mut intermediate = expected.clone();
    for (index, ((name,source,_), file)) in entries.iter().zip(staged).enumerate() {
        let mut attempted = false;
        let result = (|| {
            if read_files(root)? != intermediate { return Err("Un catalogo è cambiato durante il salvataggio.".into()); }
            let path = target(root,name)?;
            attempted = true;
            commit(file,&path)
        })();
        if let Err(error) = result {
            restore_configuration(root, &entries[..index + usize::from(attempted)]);
            return Err(save_failure(root,expected,&error));
        }
        match *name { CONNECTIONS=>intermediate.connections=Some((*source).clone()),RUNTIME=>intermediate.runtime=Some((*source).clone()),_=>intermediate.plc=Some((*source).clone()) }
    }
    if read_files(root).ok().as_ref() != Some(&intermediate) {
        restore_configuration(root,&entries);
        return Err(save_failure(root,expected,"I cataloghi sono cambiati prima della verifica finale."));
    }
    Ok(intermediate)
}

fn restore_configuration(root: &Path, entries: &[(&str, &String, &Option<String>)]) {
    for (name,written,original) in entries.iter().rev() {
        // Restore only our exact content, including a commit that wrote then returned an error.
        if read_one(root,name).ok().as_ref() != Some(&Some((*written).clone())) { continue; }
        let restored = (|| {
            let path = target(root,name)?;
            match original {
                Some(old) => persist(stage(root,name,old)?,&path),
                None => fs::remove_file(path).map_err(|_| "Ripristino fallito.".into()),
            }
        })();
        let _: Result<(),String> = restored;
    }
}

fn save_failure(root: &Path, expected: &ConfigurationFiles, error: &str) -> String {
    if read_files(root).ok().as_ref() == Some(expected) { format!("{error} La configurazione precedente è stata ripristinata.") }
    else { "Salvataggio parziale o modifica esterna: non sovrascrivere i cataloghi. Verifica connessioni, Runtime e variabili PLC prima di avviare il servizio.".into() }
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
        ConfigurationUpdate { connections: "{\"version\":1,\"connections\":[]}".into(), runtime: "{\"version\":1,\"gateway\":{\"enabled\":false}}".into(), plc: None }
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
        assert!(result.unwrap_err().contains("parziale")); assert!(!root.join(CONNECTIONS).exists()); assert!(root.join(RUNTIME).is_dir());
    }
    fn appended_catalog() -> String {
        r#"{"version":1,"variables":[{"name":"New.Speed","dataType":"Real","access":"read","address":"","description":"","connection":"opcua-1"}]}"#.into()
    }
    #[test]
    fn optional_plc_update_is_backward_compatible_and_can_create_all_three_catalogs() {
        let legacy: ConfigurationUpdate = serde_json::from_str(r#"{"connections":"{}","runtime":"{}"}"#).unwrap(); assert!(legacy.plc.is_none());
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let expected = read_files(&root).unwrap(); let mut next = update(); next.plc = Some(appended_catalog());
        let result = save_with(&root,&expected,&next,persist).unwrap();
        assert_eq!(read_files(&root).unwrap(),result); assert_eq!(result.plc,next.plc);
    }
    #[test]
    fn imported_variables_preserve_old_catalog_metadata_and_definitions_exactly() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap();
        let original = r#"{"version":1,"custom":{"keep":true},"variables":[{"name":"Velocità","dataType":"Real","access":"read","address":"%OLD","vendor":{"nested":[1,2]}}]}"#;
        fs::write(root.join(PLC),original).unwrap(); let expected = read_files(&root).unwrap();
        let mut value: serde_json::Value = serde_json::from_str(original).unwrap();
        value["variables"].as_array_mut().unwrap().push(serde_json::from_str::<serde_json::Value>(&appended_catalog()).unwrap()["variables"][0].clone());
        let mut next = update(); next.plc = Some(serde_json::to_string_pretty(&value).unwrap());
        save_with(&root,&expected,&next,persist).unwrap();
        let saved: serde_json::Value = serde_json::from_str(&read_one(&root,PLC).unwrap().unwrap()).unwrap(); assert_eq!(saved,value);
        let old: serde_json::Value = serde_json::from_str(original).unwrap(); assert_eq!(old["variables"][0],saved["variables"][0]);
    }
    #[test]
    fn imported_variables_cannot_edit_delete_or_reorder_old_definitions_or_root_metadata() {
        use serde_json::{json,Value};
        let original = json!({"version":1,"custom":{"keep":true},"variables":[{"name":"A","dataType":"Real","extra":7},{"name":"B","access":"read"}]}).to_string();
        let mut valid: Value = serde_json::from_str(&original).unwrap();
        valid["variables"].as_array_mut().unwrap().push(serde_json::from_str::<Value>(&appended_catalog()).unwrap()["variables"][0].clone());
        assert!(validate_plc_append(Some(&original),&valid.to_string()).is_ok());
        for index in 0..6 {
            let mut changed=valid.clone();
            match index {
                0=>changed["custom"]=json!({"keep":false}),
                1=>changed["variables"][0]["name"]=json!("Changed"),
                2=>{changed["variables"][0].as_object_mut().unwrap().remove("extra");},
                3=>{changed["variables"].as_array_mut().unwrap().remove(0);},
                4=>changed["variables"].as_array_mut().unwrap().swap(0,1),
                _=>changed["version"]=json!(2),
            }
            assert!(validate_plc_append(Some(&original),&changed.to_string()).is_err(),"mutation {index}");
        }
        assert!(validate_plc_append(Some(&original),&original).is_err());
    }
    #[test]
    fn invalid_new_variable_fields_are_rejected_before_any_catalog_is_written() {
        use serde_json::{json,Value};
        let invalid = [("name",json!("1Wrong")),("name",json!("bad\nname")),("name",json!("Velocità")),("name",json!("x".repeat(201))),
            ("dataType",json!("Int64")),("access",json!("admin")),("address",json!("%DB10")),("initialValue",json!(99)),("description",json!(null)),("connection",json!("bad\nprofile"))];
        for (key,value) in invalid {
            let dir=tempfile::tempdir().unwrap(); let root=fs::canonicalize(dir.path()).unwrap(); let expected=read_files(&root).unwrap();
            let mut plc:Value=serde_json::from_str(&appended_catalog()).unwrap(); plc["variables"][0][key]=value;
            let mut next=update(); next.plc=Some(plc.to_string()); assert!(save_with(&root,&expected,&next,persist).is_err(),"field {key}");
            assert_eq!(read_files(&root).unwrap(),expected);
        }
    }
    #[test]
    fn duplicate_names_and_variable_budget_are_rejected() {
        let mut source:serde_json::Value=serde_json::from_str(&appended_catalog()).unwrap(); let variable=source["variables"][0].clone();
        source["variables"].as_array_mut().unwrap().push(variable.clone()); assert!(validate_plc_append(None,&source.to_string()).is_err());
        source["variables"]=serde_json::Value::Array(vec![variable;50001]); assert!(validate_plc_append(None,&source.to_string()).is_err());
        assert!(validate_plc_append(None,&"x".repeat(LIMIT+1)).unwrap_err().contains("4 MiB"));
    }
    #[test]
    fn three_catalog_writes_roll_back_at_each_failure_position_including_a_late_error() {
        for existing in [false,true] { for failure in 1..=3 { for fail_after_write in [false,true] {
            let dir=tempfile::tempdir().unwrap(); let root=fs::canonicalize(dir.path()).unwrap();
            if existing { for (name,source) in [(CONNECTIONS,r#"{"version":1,"connections":[],"custom":true}"#),(RUNTIME,r#"{"version":1,"gateway":{},"custom":true}"#),(PLC,r#"{"version":1,"variables":[]}"#)] {fs::write(root.join(name),source).unwrap();} }
            let expected=read_files(&root).unwrap(); let mut next=update(); next.plc=Some(appended_catalog()); let mut calls=0;
            let result=save_with(&root,&expected,&next,|file,path| {
                calls+=1; if calls==failure&&!fail_after_write { return Err("Test I/O failure".into()); }
                persist(file,path)?; if calls==failure {Err("Test I/O late failure".into())}else{Ok(())}
            });
            assert!(result.unwrap_err().contains("ripristinata"),"existing {existing}, failure {failure}, late {fail_after_write}");
            assert_eq!(read_files(&root).unwrap(),expected);
        } } }
    }
    #[test]
    fn third_target_read_error_still_restores_the_two_written_catalogs() {
        let dir=tempfile::tempdir().unwrap(); let root=fs::canonicalize(dir.path()).unwrap(); let expected=read_files(&root).unwrap(); let mut next=update(); next.plc=Some(appended_catalog()); let mut calls=0;
        let result=save_with(&root,&expected,&next,|file,path| {calls+=1;persist(file,path)?;if calls==2 {fs::create_dir(root.join(PLC)).unwrap();}Ok(())});
        assert!(result.unwrap_err().contains("parziale")); assert!(!root.join(CONNECTIONS).exists()); assert!(!root.join(RUNTIME).exists()); assert!(root.join(PLC).is_dir());
    }
    #[test]
    fn final_verification_preserves_external_edits_and_restores_only_our_content() {
        let dir=tempfile::tempdir().unwrap(); let root=fs::canonicalize(dir.path()).unwrap(); let expected=read_files(&root).unwrap(); let mut next=update(); next.plc=Some(appended_catalog()); let mut calls=0;
        let result=save_with(&root,&expected,&next,|file,path| {calls+=1;persist(file,path)?;if calls==3 {fs::write(root.join(PLC),"external edit").unwrap();}Ok(())});
        assert!(result.unwrap_err().contains("parziale")); assert!(!root.join(CONNECTIONS).exists()); assert!(!root.join(RUNTIME).exists()); assert_eq!(fs::read_to_string(root.join(PLC)).unwrap(),"external edit");
    }
    #[test]
    fn a_concurrent_catalog_edit_between_writes_is_not_clobbered() {
        let dir=tempfile::tempdir().unwrap(); let root=fs::canonicalize(dir.path()).unwrap(); let expected=read_files(&root).unwrap(); let mut next=update(); next.plc=Some(appended_catalog()); let mut calls=0;
        let result=save_with(&root,&expected,&next,|file,path| {calls+=1;persist(file,path)?;fs::write(root.join(PLC),"external edit").unwrap();Ok(())});
        assert!(result.unwrap_err().contains("parziale")); assert_eq!(calls,1); assert!(!root.join(CONNECTIONS).exists()); assert!(!root.join(RUNTIME).exists()); assert_eq!(fs::read_to_string(root.join(PLC)).unwrap(),"external edit");
    }
}
