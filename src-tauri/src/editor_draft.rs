use super::{authorized_path, path_string, write_atomic, RuntimeState};
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::{Path, PathBuf}, sync::atomic::Ordering, time::{SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 16 * 1024 * 1024;

pub(super) struct DraftSession {
    id: String,
    blocked_generation: Option<u64>,
}
impl Default for DraftSession {
    fn default() -> Self {
        Self { id: format!("{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()), blocked_generation: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Snapshot { file: String, source: String }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Document { file: String, source: String, version: u64 }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Page {
    id: String, name: String, route: String, file: String,
    #[serde(skip_serializing_if = "Option::is_none")] router_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] component_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] state_value: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Checkpoint {
    version: u8, saved_at: u64, root: String,
    #[serde(skip_serializing_if = "Option::is_none")] original_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] workspace_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] is_working_copy: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")] document: Option<Document>,
    dirty: bool, history: Vec<Snapshot>, future: Vec<Snapshot>, pages: Vec<Page>,
    #[serde(skip_serializing_if = "Option::is_none")] router_file: Option<String>,
    router_editable: bool,
    #[serde(skip_serializing_if = "Option::is_none")] active_page_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] requested_state_page: Option<String>,
    preview_path: String, view_mode: String, zoom: f64, fit_canvas: bool,
}
impl Checkpoint {
    fn validate(&self) -> Result<(), String> {
        if self.version != 1 || self.saved_at == 0 || self.root.is_empty() || !self.zoom.is_finite()
            || !(0.25..=1.5).contains(&self.zoom) || !["visual", "split", "code"].contains(&self.view_mode.as_str())
            || !self.preview_path.starts_with('/') || self.preview_path.starts_with("//") || self.preview_path.starts_with("/\\")
            || self.history.len() + self.future.len() > 1000 || self.pages.len() > 5000 {
            return Err("La bozza locale non ha un formato valido.".into());
        }
        Ok(())
    }
    fn files(&self) -> Vec<&str> {
        self.document.iter().map(|item| item.file.as_str()).chain(self.router_file.iter().map(String::as_str))
            .chain(self.history.iter().chain(&self.future).map(|item| item.file.as_str()))
            .chain(self.pages.iter().flat_map(|page| std::iter::once(page.file.as_str()).chain(page.router_file.iter().map(String::as_str))))
            .filter(|file| !file.is_empty()).collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DraftRecord {
    id: String, checkpoint: Checkpoint,
    #[serde(skip_serializing_if = "Option::is_none")] base_source: Option<String>,
}
fn record_path(directory: &Path, id: &str) -> Result<PathBuf, String> {
    let parts: Vec<_> = id.split('-').collect();
    if id.len() > 64 || parts.len() != 2 || parts.iter().any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit())) {
        return Err("Identificativo della bozza non valido.".into());
    }
    Ok(directory.join(format!("draft-{id}.json")))
}
fn read_record(path: &Path) -> Result<DraftRecord, String> {
    if fs::symlink_metadata(path).map_err(|error| error.to_string())?.file_type().is_symlink() {
        return Err("La bozza locale non può essere un collegamento.".into());
    }
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    if file.metadata().map_err(|error| error.to_string())?.len() > MAX_BYTES { return Err("La bozza locale supera 16 MiB.".into()); }
    let mut text = String::new();
    file.take(MAX_BYTES + 1).read_to_string(&mut text).map_err(|error| error.to_string())?;
    if text.len() as u64 > MAX_BYTES { return Err("La bozza locale supera 16 MiB.".into()); }
    let record: DraftRecord = serde_json::from_str(&text).map_err(|error| format!("Bozza locale non leggibile: {error}"))?;
    record.checkpoint.validate()?;
    if path.file_name() != record_path(path.parent().ok_or("Cartella della bozza non valida")?, &record.id)?.file_name() {
        return Err("Identificativo della bozza non coerente.".into());
    }
    Ok(record)
}
fn read_latest(directory: &Path) -> Result<Option<DraftRecord>, String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut latest: Option<DraftRecord> = None;
    let mut errors = Vec::new();
    let mut count = 0;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("draft-") || !name.ends_with(".json") { continue; }
        count += 1;
        if count > 200 { return Err("Sono presenti più di 200 bozze locali. Nessuna è stata eliminata.".into()); }
        match read_record(&entry.path()) {
            Ok(record) if latest.as_ref().map_or(true, |old| record.checkpoint.saved_at > old.checkpoint.saved_at) => latest = Some(record),
            Ok(_) => {},
            Err(error) => errors.push(error),
        }
    }
    if latest.is_none() && !errors.is_empty() { return Err(errors.remove(0)); }
    Ok(latest)
}

fn write_draft(directory: &Path, state: &RuntimeState, mut checkpoint: Checkpoint) -> Result<DraftRecord, String> {
    checkpoint.validate()?;
    let session = state.draft.lock().map_err(|_| "Draft lock poisoned")?;
    let generation = state.preview_generation.load(Ordering::SeqCst);
    if session.blocked_generation == Some(generation) { return Err("Il backup di questa sessione è stato chiuso.".into()); }
    let root = state.project_root.lock().map_err(|_| "Project root lock poisoned")?.clone().ok_or("Nessun progetto aperto")?;
    if fs::canonicalize(&checkpoint.root).map_err(|error| error.to_string())? != root { return Err("La bozza non appartiene al progetto aperto.".into()); }
    for file in checkpoint.files() { authorized_path(file, state)?; }
    checkpoint.root = path_string(&root);
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let path = record_path(directory, &session.id)?;
    let previous = match read_record(&path) {
        Ok(record) => Some(record),
        Err(_) if !path.exists() => None,
        Err(error) => return Err(error),
    };
    if previous.as_ref().is_some_and(|old| old.checkpoint.saved_at > checkpoint.saved_at) { return Err("Una bozza più recente è già conservata.".into()); }
    let base_source = if let Some(document) = &checkpoint.document {
        if let Some(old) = &previous {
            if old.checkpoint.dirty && checkpoint.dirty && old.checkpoint.document.as_ref().is_some_and(|item| item.file == document.file) {
                old.base_source.clone()
            } else { Some(fs::read_to_string(authorized_path(&document.file, state)?).map_err(|error| error.to_string())?) }
        } else { Some(fs::read_to_string(authorized_path(&document.file, state)?).map_err(|error| error.to_string())?) }
    } else { None };
    let record = DraftRecord { id: session.id.clone(), checkpoint, base_source };
    let text = serde_json::to_string(&record).map_err(|error| error.to_string())?;
    if text.len() as u64 > MAX_BYTES { return Err("La bozza supera 16 MiB: la copia precedente resta conservata.".into()); }
    // Hold the root through the atomic replacement: close/switch cannot publish a late backup.
    let current = state.project_root.lock().map_err(|_| "Project root lock poisoned")?;
    if current.as_ref() != Some(&root) || generation != state.preview_generation.load(Ordering::SeqCst) { return Err("Il progetto è cambiato durante il backup.".into()); }
    write_atomic(&path, &text)?;
    Ok(record)
}
fn clear_draft(directory: &Path, state: &RuntimeState, id: Option<String>, saved_at: Option<u64>) -> Result<(), String> {
    let mut session = state.draft.lock().map_err(|_| "Draft lock poisoned")?;
    let own = id.is_none() || id.as_deref() == Some(&session.id);
    let path = record_path(directory, id.as_deref().unwrap_or(&session.id))?;
    if path.exists() {
        let record = read_record(&path)?;
        if saved_at.is_some_and(|expected| expected != record.checkpoint.saved_at) { return Err("La bozza è cambiata. Rileggila prima di scartarla.".into()); }
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    if own { session.blocked_generation = Some(state.preview_generation.load(Ordering::SeqCst)); }
    Ok(())
}
fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|root| root.join("editor-drafts")).map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) async fn read_editor_draft(app: AppHandle) -> Result<Option<DraftRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || read_latest(&directory(&app)?)).await.map_err(|error| error.to_string())?
}
#[tauri::command]
pub(super) async fn write_editor_draft(app: AppHandle, checkpoint: Checkpoint) -> Result<DraftRecord, String> {
    tauri::async_runtime::spawn_blocking(move || write_draft(&directory(&app)?, &app.state::<RuntimeState>(), checkpoint)).await.map_err(|error| error.to_string())?
}
#[tauri::command]
pub(super) async fn clear_editor_draft(app: AppHandle, id: Option<String>, saved_at: Option<u64>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || clear_draft(&directory(&app)?, &app.state::<RuntimeState>(), id, saved_at)).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, RuntimeState, Checkpoint) {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("panel");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("App.jsx"), "source on disk").unwrap();
        let root = fs::canonicalize(root).unwrap();
        let state = RuntimeState::default();
        super::super::set_project_root(&state, root.clone()).unwrap();
        *state.authorized_root.lock().unwrap() = Some(root.clone());
        let checkpoint = serde_json::from_value(serde_json::json!({
            "version": 1, "savedAt": 1000, "root": path_string(&root),
            "document": { "file": path_string(&root.join("App.jsx")), "source": "dirty draft", "version": 3 },
            "dirty": true, "history": [{ "file": path_string(&root.join("App.jsx")), "source": "before" }], "future": [],
            "pages": [], "routerEditable": false, "previewPath": "/settings", "viewMode": "code", "zoom": 1, "fitCanvas": true
        })).unwrap();
        (directory, state, checkpoint)
    }

    #[test]
    fn a_draft_survives_native_state_recreation_without_reopening_or_writing_sources() {
        let (directory, state, checkpoint) = fixture();
        let backup = directory.path().join("drafts");
        let record = write_draft(&backup, &state, checkpoint.clone()).unwrap();
        drop(state);
        let restarted = RuntimeState::default();
        let recovered = read_latest(&backup).unwrap().unwrap();
        assert_eq!(recovered.id, record.id);
        assert_eq!(recovered.checkpoint.document.unwrap().source, "dirty draft");
        assert_eq!(recovered.checkpoint.history[0].source, "before");
        assert_eq!(recovered.checkpoint.preview_path, "/settings");
        assert_eq!(fs::read_to_string(checkpoint.document.unwrap().file).unwrap(), "source on disk");
        assert!(restarted.project_root.lock().unwrap().is_none());
        assert!(restarted.authorized_root.lock().unwrap().is_none());
        assert!(restarted.preview.lock().unwrap().is_none());
    }

    #[test]
    fn records_from_other_runs_are_not_overwritten_or_deleted() {
        let (directory, first, checkpoint) = fixture();
        let backup = directory.path().join("drafts");
        let a = write_draft(&backup, &first, checkpoint.clone()).unwrap();
        let second = RuntimeState::default();
        *second.project_root.lock().unwrap() = first.project_root.lock().unwrap().clone();
        *second.authorized_root.lock().unwrap() = first.authorized_root.lock().unwrap().clone();
        let mut newer = checkpoint; newer.saved_at += 1;
        let b = write_draft(&backup, &second, newer).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(read_latest(&backup).unwrap().unwrap().id, b.id);
        clear_draft(&backup, &second, Some(b.id), Some(b.checkpoint.saved_at)).unwrap();
        assert_eq!(read_latest(&backup).unwrap().unwrap().id, a.id);
    }

    #[test]
    fn clear_is_revision_checked_and_late_writes_cannot_resurrect_a_discarded_session() {
        let (directory, state, checkpoint) = fixture();
        let backup = directory.path().join("drafts");
        let record = write_draft(&backup, &state, checkpoint.clone()).unwrap();
        assert!(clear_draft(&backup, &state, Some(record.id.clone()), Some(999)).is_err());
        assert!(read_latest(&backup).unwrap().is_some());
        clear_draft(&backup, &state, None, None).unwrap();
        assert!(write_draft(&backup, &state, checkpoint.clone()).is_err());
        assert!(read_latest(&backup).unwrap().is_none());
        let root = state.project_root.lock().unwrap().clone().unwrap();
        super::super::set_project_root(&state, root).unwrap();
        assert!(write_draft(&backup, &state, checkpoint).is_ok());
    }

    #[test]
    fn old_unauthorized_or_closed_project_writes_preserve_the_last_good_copy() {
        let (directory, state, checkpoint) = fixture();
        let backup = directory.path().join("drafts");
        let good = write_draft(&backup, &state, checkpoint.clone()).unwrap();
        let mut old = checkpoint.clone(); old.saved_at = 999;
        assert!(write_draft(&backup, &state, old).is_err());
        let outside = directory.path().join("outside.jsx"); fs::write(&outside, "not authorized").unwrap();
        let mut bad = checkpoint.clone(); bad.document.as_mut().unwrap().file = path_string(&outside);
        assert!(write_draft(&backup, &state, bad).is_err());
        state.project_root.lock().unwrap().take();
        assert!(write_draft(&backup, &state, checkpoint).is_err());
        assert_eq!(read_latest(&backup).unwrap().unwrap().checkpoint.saved_at, good.checkpoint.saved_at);
    }

    #[test]
    fn the_original_disk_revision_is_preserved_until_the_document_is_saved() {
        let (directory, state, mut checkpoint) = fixture();
        let backup = directory.path().join("drafts");
        write_draft(&backup, &state, checkpoint.clone()).unwrap();
        fs::write(&checkpoint.document.as_ref().unwrap().file, "changed externally").unwrap();
        checkpoint.saved_at += 1;
        let dirty = write_draft(&backup, &state, checkpoint.clone()).unwrap();
        assert_eq!(dirty.base_source.as_deref(), Some("source on disk"));
        checkpoint.dirty = false; checkpoint.saved_at += 1;
        assert_eq!(write_draft(&backup, &state, checkpoint).unwrap().base_source.as_deref(), Some("changed externally"));
    }

    #[test]
    fn corrupt_or_oversized_updates_never_replace_the_previous_record() {
        let (directory, state, mut checkpoint) = fixture();
        let backup = directory.path().join("drafts");
        let good = write_draft(&backup, &state, checkpoint.clone()).unwrap();
        checkpoint.document.as_mut().unwrap().source = "x".repeat(MAX_BYTES as usize + 1);
        assert!(write_draft(&backup, &state, checkpoint.clone()).is_err());
        assert_eq!(read_latest(&backup).unwrap().unwrap().checkpoint.document.unwrap().source, "dirty draft");
        let path = record_path(&backup, &good.id).unwrap(); fs::write(&path, "corrupted, keep for investigation").unwrap();
        assert!(read_latest(&backup).is_err());
        assert!(write_draft(&backup, &state, checkpoint).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "corrupted, keep for investigation");
    }

    #[test]
    fn unknown_fields_and_arbitrary_clear_paths_are_rejected() {
        let (directory, state, checkpoint) = fixture();
        let mut value = serde_json::to_value(checkpoint).unwrap();
        value["externalRoots"] = serde_json::json!(["C:/secret"]);
        assert!(serde_json::from_value::<Checkpoint>(value).is_err());
        for id in ["../1-2", "1-2/other", "C:/1-2", "1-2-3", "1-a", ""] {
            assert!(clear_draft(directory.path(), &state, Some(id.into()), None).is_err());
        }
    }

    #[test]
    fn draft_child_process() {
        let Ok(role) = std::env::var("FRAMECRAFT_DRAFT_TEST_ROLE") else { return; };
        let directory = PathBuf::from(std::env::var("FRAMECRAFT_DRAFT_TEST_DIRECTORY").unwrap());
        let backup = directory.join("drafts");
        if role == "reader" {
            let record = read_latest(&backup).unwrap().unwrap();
            assert_eq!(record.checkpoint.document.unwrap().source, "draft from killed process");
            assert_eq!(fs::read_to_string(directory.join("panel/App.jsx")).unwrap(), "source on disk");
            return;
        }
        let checkpoint: Checkpoint = serde_json::from_str(&fs::read_to_string(directory.join("checkpoint.json")).unwrap()).unwrap();
        let state = RuntimeState::default();
        let root = fs::canonicalize(&checkpoint.root).unwrap();
        super::super::set_project_root(&state, root.clone()).unwrap();
        *state.authorized_root.lock().unwrap() = Some(root);
        write_draft(&backup, &state, checkpoint).unwrap();
        fs::write(directory.join("writer-ready"), "ready").unwrap();
        loop { std::thread::sleep(std::time::Duration::from_millis(100)); }
    }

    #[test]
    fn a_separate_process_can_read_the_backup_after_the_writer_is_killed() {
        let (directory, _, mut checkpoint) = fixture();
        checkpoint.document.as_mut().unwrap().source = "draft from killed process".into();
        fs::write(directory.path().join("checkpoint.json"), serde_json::to_string(&checkpoint).unwrap()).unwrap();
        let command = |role: &str| {
            let mut command = std::process::Command::new(std::env::current_exe().unwrap());
            command.args(["--exact", "editor_draft::tests::draft_child_process", "--test-threads=1"])
                .env("FRAMECRAFT_DRAFT_TEST_ROLE", role).env("FRAMECRAFT_DRAFT_TEST_DIRECTORY", directory.path())
                .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
            command
        };
        let mut writer = command("writer").spawn().unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !directory.path().join("writer-ready").is_file() && std::time::Instant::now() < deadline {
            if writer.try_wait().unwrap().is_some() { break; }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        let ready = directory.path().join("writer-ready").is_file();
        let _ = writer.kill(); let _ = writer.wait();
        assert!(ready, "Writer did not publish a complete backup before the deadline");
        let mut reader = command("reader").spawn().unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            if let Some(status) = reader.try_wait().unwrap() { assert!(status.success(), "Reader could not recover the backup"); break; }
            if std::time::Instant::now() >= deadline { let _ = reader.kill(); let _ = reader.wait(); panic!("Reader exceeded deadline"); }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    }
}
