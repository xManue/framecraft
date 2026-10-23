use std::{fs, path::{Path, PathBuf}, sync::atomic::Ordering};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::{RuntimeState, connection_config::{read_one, stage, persist, target}};
const NAME: &str = "framecraft.recipe-plc.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot { generation: u64, source: Option<String>, recipes: Option<String>, plc: Option<String> }
fn check_root<'a>(requested: &str, opened: &'a Option<PathBuf>) -> Result<&'a Path, String> {
    let root = opened.as_deref().ok_or("Nessun progetto aperto.")?;
    if fs::canonicalize(requested).map_err(|_| "Progetto non accessibile.")? != root { return Err("Il progetto è cambiato. Riapri i collegamenti ricette-PLC.".into()); }
    Ok(root)
}
fn files(root: &Path, generation: u64) -> Result<Snapshot, String> { Ok(Snapshot { generation, source: read_one(root, NAME)?, recipes: read_one(root, "framecraft.recipes.json")?, plc: read_one(root, "framecraft.plc.json")? }) }
fn snapshot(root: &str, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato.")?;
    files(check_root(root, &opened)?, state.project_generation.load(Ordering::SeqCst))
}
fn save(root: &str, expected: Snapshot, source: String, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato.")?; let root = check_root(root, &opened)?;
    let generation = state.project_generation.load(Ordering::SeqCst);
    if generation != expected.generation { return Err("La sessione è cambiata. Riapri i collegamenti ricette-PLC; nessun file sovrascritto.".into()); }
    if source.len() > 1_000_000 { return Err("Collegamenti ricette-PLC troppo grandi (massimo 1 MB).".into()); }
    let value: serde_json::Value = serde_json::from_str(&source).map_err(|_| "JSON collegamenti ricette-PLC non valido.")?;
    if !value.as_object().is_some_and(|object| object.len() == 2 && object.contains_key("version") && object.contains_key("schemas")) || value["version"] != 1 || !value["schemas"].as_array().is_some_and(|schemas| schemas.len() <= 32) { return Err("Formato collegamenti ricette-PLC Framecraft v1 richiesto.".into()); }
    let staged = stage(root, NAME, &source)?; let current = files(root, generation)?;
    if current.source != expected.source || current.recipes != expected.recipes || current.plc != expected.plc { return Err("Collegamenti, schemi ricetta o tag PLC cambiati sul disco. Rileggi prima di salvare; nessun file sovrascritto.".into()); }
    persist(staged, &target(root, NAME)?)?;
    Ok(Snapshot { source: Some(source), ..current })
}
#[tauri::command]
pub fn read_recipe_plc_configuration(root: String, state: State<RuntimeState>) -> Result<Snapshot, String> { snapshot(&root, &state) }
#[tauri::command]
pub fn save_recipe_plc_configuration(root: String, expected: Snapshot, source: String, state: State<RuntimeState>) -> Result<Snapshot, String> { save(&root, expected, source, &state) }

#[cfg(test)]
mod tests {
    use super::*;
    const EMPTY: &str = "{\"version\":1,\"schemas\":[]}";
    #[test]
    fn mapping_changes_are_session_scoped_and_do_not_reseed_an_operational_store() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy();
        fs::write(root.join("framecraft.recipes.json"), EMPTY).unwrap(); fs::write(root.join("framecraft.plc.json"), "{\"version\":1,\"variables\":[]}").unwrap();
        let operational = root.join(".framecraft-runtime/recipes"); fs::create_dir_all(&operational).unwrap(); fs::write(operational.join("recipes.json"), "SYNTHETIC_OPERATIONAL_VALUES").unwrap();
        let initial = snapshot(&name, &state).unwrap(); let stale = initial.clone(); let saved = save(&name, initial, EMPTY.into(), &state).unwrap();
        assert_eq!(saved.source.as_deref(), Some(EMPTY)); assert!(save(&name, stale, EMPTY.into(), &state).is_err());
        assert!(save(&name, saved.clone(), "SYNTHETIC_BAD_JSON".into(), &state).unwrap_err().contains("JSON"));
        crate::set_project_root(&state, root.clone()).unwrap(); assert!(save(&name, saved, EMPTY.into(), &state).unwrap_err().contains("sessione"));
        assert_eq!(fs::read_to_string(operational.join("recipes.json")).unwrap(), "SYNTHETIC_OPERATIONAL_VALUES"); assert_eq!(fs::read_to_string(root.join("framecraft.recipes.json")).unwrap(), EMPTY);
        let other = tempfile::tempdir().unwrap(); assert!(snapshot(&other.path().to_string_lossy(), &state).is_err());
    }
    #[test]
    fn edits_to_schema_or_tag_catalog_preserve_the_mapping_and_draft() {
        for file in ["framecraft.recipes.json", "framecraft.plc.json"] {
            let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy();
            let expected = snapshot(&name, &state).unwrap(); fs::write(root.join(file), "SYNTHETIC_EXTERNAL_CHANGE").unwrap();
            assert!(save(&name, expected, EMPTY.into(), &state).unwrap_err().contains("cambiati")); assert!(!root.join(NAME).exists()); assert_eq!(fs::read_to_string(root.join(file)).unwrap(), "SYNTHETIC_EXTERNAL_CHANGE");
        }
    }
}
