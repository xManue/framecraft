use crate::{write_atomic, RuntimeState};
use serde::{Deserialize, Serialize};
use std::{collections::hash_map::DefaultHasher, fs, hash::{Hash, Hasher}, io::Read, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 8 * 1024 * 1024;
const FILE: &str = "questionnaire.json";
#[derive(Debug, Clone, Serialize)]
pub(super) struct Snapshot { revision: String, source: Option<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record { version: u8, saved_at: u64, interview: serde_json::Value }

fn snapshot(directory: &Path) -> Result<Snapshot, String> {
    if fs::symlink_metadata(directory).is_ok_and(|metadata| metadata.file_type().is_symlink() || !metadata.is_dir()) { return Err("Il deposito del questionario deve essere una cartella normale.".into()); }
    let path = directory.join(FILE);
    let source = match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err("Non posso accedere alla bozza del questionario. Controlla i permessi del profilo Framecraft e riprova.".into()),
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_BYTES { return Err("La bozza del questionario non è un file normale entro 8 MiB. Nessun file è stato modificato.".into()); }
            let file = fs::File::open(path).map_err(|_| "Non posso aprire la bozza del questionario: controlla permessi o programmi che la bloccano.")?;
            let mut text = String::new(); file.take(MAX_BYTES + 1).read_to_string(&mut text).map_err(|_| "La bozza del questionario non è leggibile come UTF-8.")?;
            if text.len() as u64 > MAX_BYTES { return Err("La bozza del questionario supera 8 MiB.".into()); }
            Some(text)
        }
    };
    // A change token for compare-and-swap, not a cryptographic signature or authorization.
    let mut hasher = DefaultHasher::new(); source.hash(&mut hasher);
    Ok(Snapshot { revision: format!("{:016x}", hasher.finish()), source })
}
fn replace(directory: &Path, expected_revision: &str, source: Option<String>) -> Result<Snapshot, String> {
    snapshot(directory)?;
    fs::create_dir_all(directory).map_err(|_| "Non posso creare il deposito locale del questionario. Verifica i permessi del profilo Framecraft.")?;
    let lock_path = directory.join("questionnaire.lock");
    if fs::symlink_metadata(&lock_path).is_ok_and(|metadata| metadata.file_type().is_symlink() || !metadata.is_file()) { return Err("Il blocco del deposito questionario non è un file normale.".into()); }
    let lock = fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(lock_path).map_err(|_| "Non posso proteggere il salvataggio del questionario. Verifica i permessi e riprova.")?;
    lock.try_lock().map_err(|_| "Un’altra istanza di Framecraft sta aggiornando la bozza. Attendi e rileggila; nessuna risposta è stata sovrascritta.")?;
    if snapshot(directory)?.revision != expected_revision { return Err("La bozza è cambiata in un’altra finestra. Rileggila prima di salvarla o eliminarla; la copia più recente è rimasta intatta.".into()); }
    let path = directory.join(FILE);
    if let Some(text) = source {
        if text.len() as u64 > MAX_BYTES { return Err("Questionario troppo grande: la copia precedente resta conservata (massimo 8 MiB).".into()); }
        let record: Record = serde_json::from_str(&text).map_err(|_| "Formato del questionario non valido: la copia precedente resta conservata.")?;
        if record.version != 1 || record.saved_at == 0 || !record.interview.is_object() || record.interview.as_object().unwrap().keys().any(|key| !["machineName", "layout", "spec", "step", "delegated", "followups"].contains(&key.as_str())) { return Err("Campi o versione del questionario non supportati: nessun salvataggio eseguito.".into()); }
        fs::create_dir_all(directory).map_err(|_| "Non posso creare il deposito locale del questionario. Verifica i permessi del profilo Framecraft.")?;
        write_atomic(&path, &text).map_err(|_| "Non posso conservare le risposte: verifica spazio, permessi e programmi che bloccano il deposito. Le risposte restano in questa sessione.")?;
    } else if path.exists() { fs::remove_file(&path).map_err(|_| "Non posso eliminare la bozza del questionario. La copia resta conservata: controlla permessi e riprova.")?; }
    snapshot(directory)
}
fn directory(app: &AppHandle) -> Result<PathBuf, String> { Ok(app.path().app_data_dir().map_err(|_| "Deposito Framecraft non disponibile")?.join("ai-interview")) }
#[tauri::command]
pub(super) async fn read_ai_interview_draft(app: AppHandle) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RuntimeState>(); let _lock = state.ai_interview_draft.lock().map_err(|_| "Deposito questionario occupato")?;
        snapshot(&directory(&app)?)
    }).await.map_err(|_| "Lettura del questionario interrotta")?
}
#[tauri::command]
pub(super) async fn write_ai_interview_draft(app: AppHandle, expected_revision: String, source: Option<String>) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RuntimeState>(); let _lock = state.ai_interview_draft.lock().map_err(|_| "Deposito questionario occupato")?;
        replace(&directory(&app)?, &expected_revision, source)
    }).await.map_err(|_| "Salvataggio del questionario interrotto")?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn source(name: &str) -> String { serde_json::json!({"version":1,"savedAt":1000,"interview":{"machineName":name}}).to_string() }
    #[test]
    fn interview_survives_restart_and_stale_save_or_delete_is_rejected() {
        let temp = tempfile::tempdir().unwrap(); let directory = temp.path().join("draft");
        let initial = snapshot(&directory).unwrap(); assert!(initial.source.is_none());
        let first = replace(&directory, &initial.revision, Some(source("one"))).unwrap();
        assert_eq!(snapshot(&directory).unwrap().source, first.source);
        let second = replace(&directory, &first.revision, Some(source("two"))).unwrap();
        assert!(replace(&directory, &first.revision, Some(source("old"))).is_err());
        assert!(replace(&directory, &first.revision, None).is_err());
        assert_eq!(snapshot(&directory).unwrap().source, second.source);
        assert!(replace(&directory, &second.revision, None).unwrap().source.is_none());
    }
    #[test]
    fn invalid_or_large_write_keeps_previous_and_corruption_can_be_explicitly_cleared() {
        let temp = tempfile::tempdir().unwrap(); let directory = temp.path(); let initial = snapshot(directory).unwrap();
        let first = replace(directory, &initial.revision, Some(source("keep"))).unwrap();
        for bad in ["not-json".to_string(), "x".repeat(MAX_BYTES as usize + 1), r#"{"version":2,"savedAt":1,"interview":{}}"#.into(), r#"{"version":1,"savedAt":1,"interview":{},"account":"never"}"#.into()] {
            assert!(replace(directory, &first.revision, Some(bad)).is_err()); assert_eq!(snapshot(directory).unwrap().source, first.source);
        }
        fs::write(directory.join(FILE), "corrupt-json").unwrap(); let corrupt = snapshot(directory).unwrap();
        assert_eq!(corrupt.source.as_deref(), Some("corrupt-json")); assert!(replace(directory, &corrupt.revision, None).unwrap().source.is_none());
    }
    #[test]
    fn a_directory_in_place_of_the_file_is_not_overwritten() {
        let temp = tempfile::tempdir().unwrap(); fs::create_dir(temp.path().join(FILE)).unwrap();
        assert!(snapshot(temp.path()).is_err()); assert!(temp.path().join(FILE).is_dir());
    }
    #[test]
    fn another_instance_holding_the_file_lock_prevents_a_lost_update() {
        let temp = tempfile::tempdir().unwrap(); let initial = snapshot(temp.path()).unwrap();
        let first = replace(temp.path(), &initial.revision, Some(source("keep"))).unwrap();
        let lock = fs::OpenOptions::new().read(true).write(true).open(temp.path().join("questionnaire.lock")).unwrap();
        lock.try_lock().unwrap();
        assert!(replace(temp.path(), &first.revision, Some(source("must wait"))).unwrap_err().contains("istanza"));
        assert_eq!(snapshot(temp.path()).unwrap().source, first.source);
        drop(lock);
        assert!(replace(temp.path(), &first.revision, Some(source("after lock"))).is_ok());
    }
    #[cfg(windows)]
    #[test]
    fn a_locked_file_is_preserved_and_returns_an_actionable_error() {
        use std::os::windows::fs::OpenOptionsExt;
        let temp = tempfile::tempdir().unwrap(); let initial = snapshot(temp.path()).unwrap();
        replace(temp.path(), &initial.revision, Some(source("keep"))).unwrap();
        let _lock = fs::OpenOptions::new().read(true).share_mode(0).open(temp.path().join(FILE)).unwrap();
        assert!(snapshot(temp.path()).unwrap_err().contains("permessi"));
    }
}
