use std::{fs, path::{Path, PathBuf}, sync::atomic::Ordering};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::{RuntimeState, connection_config::{read_one, stage, persist, target}};
const NAME: &str = "framecraft.recipe-apply.json";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Interface { version: u8, schemas: Vec<Profile> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Profile { schema_id: String, channel_id: String, request_tag: String, response_tag: String, max_payload_bytes: u32, max_age_ms: u32, prepare_timeout_ms: u32, apply_timeout_ms: u32, stage_lifetime_ms: u32 }
fn validate_source(source: &str) -> Result<(), String> {
    let config: Interface = serde_json::from_str(source).map_err(|_| "JSON o campi interfaccia ricette non validi.")?;
    if config.version != 1 || config.schemas.len() > 32 { return Err("Formato interfaccia ricette Framecraft v1 richiesto (massimo 32 schemi).".into()); }
    let id = |s: &str| !s.is_empty() && s.len() <= 80 && s.as_bytes()[0].is_ascii_alphanumeric() && s.bytes().all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c)) && !["__proto__", "prototype", "constructor"].contains(&s.to_ascii_lowercase().as_str());
    let tag = |s: &str| !s.is_empty() && s.trim() == s && s.chars().count() <= 200 && !s.chars().any(char::is_control);
    let mut schemas = std::collections::HashSet::new(); let mut channels = std::collections::HashMap::new(); let mut tags = std::collections::HashMap::new();
    for p in &config.schemas {
        if !id(&p.schema_id) || !id(&p.channel_id) || !tag(&p.request_tag) || !tag(&p.response_tag) || p.request_tag == p.response_tag || !schemas.insert(&p.schema_id) || !(512..=131072).contains(&p.max_payload_bytes) || !(250..=10000).contains(&p.max_age_ms) || !(1000..=20000).contains(&p.prepare_timeout_ms) || !(1000..=20000).contains(&p.apply_timeout_ms) || p.stage_lifetime_ms < p.prepare_timeout_ms.saturating_add(1000) || p.stage_lifetime_ms > 120000 { return Err("Completa canali, due tag distinti, capacità e tempi dell’interfaccia ricette; nessun file sovrascritto.".into()); }
        let definition = (&p.request_tag, &p.response_tag, p.max_payload_bytes, p.max_age_ms, p.prepare_timeout_ms, p.apply_timeout_ms, p.stage_lifetime_ms);
        if channels.insert(&p.channel_id, definition).is_some_and(|old| old != definition) { return Err("Schemi sullo stesso canale richiedono tag e tempi identici.".into()); }
        for name in [&p.request_tag, &p.response_tag] { if tags.insert(name, &p.channel_id).is_some_and(|old| old != &p.channel_id) { return Err("Un tag dell’interfaccia non può appartenere a due canali.".into()); } }
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot { generation: u64, source: Option<String>, recipes: Option<String>, plc: Option<String>, connections: Option<String>, auth: Option<String>, commissioned: bool }
fn check_root<'a>(requested: &str, opened: &'a Option<PathBuf>) -> Result<&'a Path, String> {
    let root = opened.as_deref().ok_or("Nessun progetto aperto.")?;
    if fs::canonicalize(requested).map_err(|_| "Progetto non accessibile.")? != root { return Err("Il progetto è cambiato. Riapri Applicazione ricette al PLC.".into()); }
    Ok(root)
}
fn commissioned(root: &Path) -> Result<bool, String> {
    let runtime = root.join(".framecraft-runtime");
    match fs::symlink_metadata(&runtime) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("Non posso verificare il registro trasferimenti. Nessuna interfaccia salvata.".into()),
        Ok(meta) => if !meta.is_dir() || meta.file_type().is_symlink() || fs::canonicalize(&runtime).map_err(|_| "Registro trasferimenti non accessibile.")?.parent() != Some(root) { return Err("Directory operativa non regolare. Verifica con chi ti assiste; nessun salvataggio.".into()); }
    }
    match fs::symlink_metadata(runtime.join("recipe-apply")) { Ok(_) => Ok(true), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false), Err(_) => Err("Non posso verificare il registro trasferimenti. Nessun salvataggio.".into()) }
}
fn files(root: &Path, generation: u64) -> Result<Snapshot, String> { Ok(Snapshot { generation, source: read_one(root, NAME)?, recipes: read_one(root, "framecraft.recipes.json")?, plc: read_one(root, "framecraft.plc.json")?, connections: read_one(root, "framecraft.connections.json")?, auth: read_one(root, "framecraft.auth.json")?, commissioned: commissioned(root)? }) }
fn snapshot(root: &str, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato.")?;
    files(check_root(root, &opened)?, state.project_generation.load(Ordering::SeqCst))
}
fn save(root: &str, expected: Snapshot, source: String, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato.")?; let root = check_root(root, &opened)?;
    let generation = state.project_generation.load(Ordering::SeqCst);
    if generation != expected.generation { return Err("La sessione è cambiata. Riapri Applicazione ricette al PLC; nessun file sovrascritto.".into()); }
    if expected.commissioned || commissioned(root)? { return Err("Registro trasferimenti già presente: interfaccia in sola lettura. Occorre una migrazione con verifica delle richieste pendenti e backup; non eliminare il registro per sbloccarla.".into()); }
    if source.len() > 1_000_000 { return Err("Interfaccia ricette troppo grande (massimo 1 MB).".into()); }
    validate_source(&source)?;
    let staged = stage(root, NAME, &source)?; let current = files(root, generation)?;
    if current.commissioned { return Err("Il servizio ha creato il registro trasferimenti. Interfaccia non salvata; verifica la messa in servizio prima di continuare.".into()); }
    if current.source != expected.source || current.recipes != expected.recipes || current.plc != expected.plc || current.connections != expected.connections || current.auth != expected.auth { return Err("Interfaccia, schemi, tag, connessioni o accessi cambiati sul disco. Rileggi prima di salvare; nessun file sovrascritto.".into()); }
    persist(staged, &target(root, NAME)?)?;
    Ok(Snapshot { source: Some(source), ..current })
}
#[tauri::command]
pub fn read_recipe_apply_configuration(root: String, state: State<RuntimeState>) -> Result<Snapshot, String> { snapshot(&root, &state) }
#[tauri::command]
pub fn save_recipe_apply_configuration(root: String, expected: Snapshot, source: String, state: State<RuntimeState>) -> Result<Snapshot, String> { save(&root, expected, source, &state) }

#[cfg(test)]
mod tests {
    use super::*;
    const EMPTY: &str = "{\"version\":1,\"schemas\":[]}";
    #[test]
    fn malformed_channels_and_small_buffers_are_rejected_before_any_write() {
        assert!(validate_source(EMPTY).is_ok());
        let profile = serde_json::json!({"schemaId":"s","channelId":"line1","requestTag":"Request","responseTag":"Response","maxPayloadBytes":8192,"maxAgeMs":2000,"prepareTimeoutMs":5000,"applyTimeoutMs":5000,"stageLifetimeMs":30000});
        let config = serde_json::json!({"version":1,"schemas":[profile]}); assert!(validate_source(&config.to_string()).is_ok());
        for (field, value) in [("channelId", serde_json::json!("")), ("maxPayloadBytes", serde_json::json!(254)), ("responseTag", serde_json::json!("Request")), ("stageLifetimeMs", serde_json::json!(1000)), ("unexpected", serde_json::json!(true))] { let mut invalid = config.clone(); invalid["schemas"][0][field] = value; assert!(validate_source(&invalid.to_string()).is_err()); }
    }
    #[test]
    fn interface_saves_are_session_scoped_and_preserve_recipe_data() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy();
        let archive = root.join(".framecraft-runtime/recipes"); fs::create_dir_all(&archive).unwrap(); fs::write(archive.join("recipes.json"), "SYNTHETIC_OPERATIONAL_VALUES").unwrap();
        let initial = snapshot(&name, &state).unwrap(); let stale = initial.clone(); let saved = save(&name, initial, EMPTY.into(), &state).unwrap(); assert_eq!(saved.source.as_deref(), Some(EMPTY)); assert!(save(&name, stale, EMPTY.into(), &state).is_err());
        assert!(save(&name, saved.clone(), "SYNTHETIC_BAD_JSON".into(), &state).unwrap_err().contains("JSON")); crate::set_project_root(&state, root.clone()).unwrap(); assert!(save(&name, saved, EMPTY.into(), &state).unwrap_err().contains("sessione"));
        assert_eq!(fs::read_to_string(archive.join("recipes.json")).unwrap(), "SYNTHETIC_OPERATIONAL_VALUES"); let other = tempfile::tempdir().unwrap(); assert!(snapshot(&other.path().to_string_lossy(), &state).is_err());
    }
    #[test]
    fn all_five_inputs_have_compare_and_swap_checks() {
        for file in [NAME, "framecraft.recipes.json", "framecraft.plc.json", "framecraft.connections.json", "framecraft.auth.json"] {
            let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy(); let expected = snapshot(&name, &state).unwrap();
            fs::write(root.join(file), "SYNTHETIC_EXTERNAL_CHANGE").unwrap(); assert!(save(&name, expected, EMPTY.into(), &state).unwrap_err().contains("cambiati")); assert_eq!(fs::read_to_string(root.join(file)).unwrap(), "SYNTHETIC_EXTERNAL_CHANGE"); if file != NAME { assert!(!root.join(NAME).exists()); }
        }
    }
    #[test]
    fn commissioning_or_partial_initialization_prevents_a_mapping_change() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy(); fs::write(root.join(NAME), EMPTY).unwrap(); let expected = snapshot(&name, &state).unwrap();
        let ledger = root.join(".framecraft-runtime/recipe-apply"); fs::create_dir_all(&ledger).unwrap(); fs::write(ledger.join("identity.json"), "SYNTHETIC_ORIGINAL_IDENTITY").unwrap();
        assert!(snapshot(&name, &state).unwrap().commissioned); assert!(save(&name, expected, EMPTY.into(), &state).unwrap_err().contains("Registro trasferimenti")); assert_eq!(fs::read_to_string(root.join(NAME)).unwrap(), EMPTY); assert_eq!(fs::read_to_string(ledger.join("identity.json")).unwrap(), "SYNTHETIC_ORIGINAL_IDENTITY");
    }
}
