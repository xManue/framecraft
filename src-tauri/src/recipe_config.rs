use std::{fs, path::{Path, PathBuf}, sync::atomic::Ordering};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::{RuntimeState, connection_config::{read_one, stage, persist, target}};
const NAME: &str = "framecraft.recipes.json";
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot { generation: u64, source: Option<String>, initialized: bool }
fn check_root<'a>(requested: &str, opened: &'a Option<PathBuf>) -> Result<&'a Path, String> {
    let root = opened.as_deref().ok_or("Nessun progetto aperto.")?;
    if fs::canonicalize(requested).map_err(|_| "Progetto non accessibile.")? != root { return Err("Il progetto è cambiato. Riapri Ricette.".into()); }
    Ok(root)
}
fn initialized(root: &Path) -> Result<bool, String> {
    let runtime = root.join(".framecraft-runtime");
    match fs::symlink_metadata(&runtime) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("Non posso verificare l’archivio operativo. Nessuna configurazione salvata.".into()),
        Ok(meta) => if !meta.is_dir() || meta.file_type().is_symlink() || fs::canonicalize(&runtime).map_err(|_| "Archivio operativo non accessibile.")?.parent() != Some(root) { return Err("Directory operativa non regolare: verifica con chi ti assiste.".into()); }
    }
    match fs::symlink_metadata(runtime.join("recipes")) { Ok(_) => Ok(true), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false), Err(_) => Err("Non posso verificare l’archivio ricette. Nessuna configurazione salvata.".into()) }
}
fn snapshot(root: &str, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato.")?;
    let root = check_root(root, &opened)?;
    Ok(Snapshot { generation: state.project_generation.load(Ordering::SeqCst), source: read_one(root, NAME)?, initialized: initialized(root)? })
}
pub(super) fn require_initial(root: &Path) -> Result<(), String> {
    if initialized(root)? { return Err("L’archivio operativo esiste già. Configurazione iniziale e ripristino AI bloccati: serve una migrazione con backup, non eliminare l’archivio.".into()); }
    Ok(())
}
pub(super) fn validate_source(source: &str) -> Result<(), String> {
    if source.len() > 2_000_000 { return Err("Catalogo ricette troppo grande (massimo 2 MB).".into()); }
    let value: serde_json::Value = serde_json::from_str(source).map_err(|_| "JSON ricette non valido.")?;
    let object = value.as_object().ok_or("Catalogo ricette non valido.")?;
    if object.len() != 2 || value["version"] != 1 || !value["schemas"].as_array().is_some_and(|schemas| schemas.len() <= 32) { return Err("Formato ricette Framecraft v1 richiesto. Nessun file sovrascritto.".into()); }
    Ok(())
}
fn save(root: &str, expected: Snapshot, source: String, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.lock().map_err(|_| "Progetto occupato.")?;
    let root = check_root(root, &opened)?;
    let generation = state.project_generation.load(Ordering::SeqCst);
    if generation != expected.generation { return Err("La sessione è cambiata. Riapri Ricette; nessun file sovrascritto.".into()); }
    if expected.initialized || initialized(root)? { return Err("L’archivio operativo esiste già. I valori iniziali non vengono riscritti: serve una migrazione con backup. Non eliminare l’archivio per sbloccare il salvataggio.".into()); }
    validate_source(&source)?;
    let staged = stage(root, NAME, &source)?;
    if read_one(root, NAME)? != expected.source || initialized(root)? { return Err("Catalogo o archivio operativo cambiato. Rileggi prima di salvare; la bozza resta nella finestra.".into()); }
    persist(staged, &target(root, NAME)?)?;
    Ok(Snapshot { generation, source: Some(source), initialized: false })
}
#[tauri::command]
pub fn read_recipe_configuration(root: String, state: State<RuntimeState>) -> Result<Snapshot, String> { snapshot(&root, &state) }
#[tauri::command]
pub fn save_recipe_configuration(root: String, expected: Snapshot, source: String, state: State<RuntimeState>) -> Result<Snapshot, String> { save(&root, expected, source, &state) }

#[cfg(test)]
mod tests {
    use super::*;
    const EMPTY: &str = "{\"version\":1,\"schemas\":[]}";
    #[test]
    fn configuration_is_session_scoped_and_conflicts_preserve_existing_data() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy();
        let initial = snapshot(&name, &state).unwrap(); let stale = initial.clone(); let saved = save(&name, initial, EMPTY.into(), &state).unwrap(); assert_eq!(saved.source.as_deref(), Some(EMPTY));
        assert!(save(&name, stale, EMPTY.into(), &state).is_err()); assert!(save(&name, saved.clone(), "PRIVATE_BAD_JSON".into(), &state).is_err());
        crate::set_project_root(&state, root.clone()).unwrap(); assert!(save(&name, saved, EMPTY.into(), &state).unwrap_err().contains("sessione")); assert_eq!(fs::read_to_string(root.join(NAME)).unwrap(), EMPTY);
        let other = tempfile::tempdir().unwrap(); assert!(snapshot(&other.path().to_string_lossy(), &state).is_err());
    }
    #[test]
    fn an_operational_store_is_never_deleted_or_reseeded() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = root.to_string_lossy();
        let expected = snapshot(&name, &state).unwrap(); let store = root.join(".framecraft-runtime/recipes"); fs::create_dir_all(&store).unwrap(); fs::write(store.join("recipes.json"), "PRIVATE_OPERATIONAL_VALUES").unwrap();
        assert!(snapshot(&name, &state).unwrap().initialized); assert!(save(&name, expected, EMPTY.into(), &state).is_err()); assert!(!root.join(NAME).exists()); assert_eq!(fs::read_to_string(store.join("recipes.json")).unwrap(), "PRIVATE_OPERATIONAL_VALUES");
    }
}
