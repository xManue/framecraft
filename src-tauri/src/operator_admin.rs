use std::{fs, io::{Read, Write}, path::{Path, PathBuf}, process::Stdio, sync::atomic::Ordering, thread, time::{Duration, Instant}};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;
use crate::{RuntimeState, connection_config::{read_one, stage, persist, target}};
const CONFIG: &str = "framecraft.auth.json";
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Account { id: String, username: String, name: String, role: String, disabled: bool, capabilities: Vec<String>, permissions: Vec<String> }
#[derive(Deserialize, Serialize)]
#[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
pub enum ResourceFilter { All, Selected { ids: Vec<String> } }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceLimits { tag_writes: ResourceFilter, alarm_actions: ResourceFilter, recipe_changes: ResourceFilter }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceRule { account_id: String, limits: ResourceLimits }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata { version: Option<u8>, resource_rules: Vec<ResourceRule>, revision: Option<String>, store_id: Option<String>, accounts: Vec<Account> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { generation: u64, configuration: Option<String>, version: Option<u8>, resource_rules: Vec<ResourceRule>, revision: Option<String>, accounts: Vec<Account> }
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Update {
    Add { username: String, name: String, role: String, capabilities: Vec<String>, permissions: Vec<String>, password: String },
    Update { id: String, name: String, role: String, capabilities: Vec<String>, permissions: Vec<String> },
    Password { id: String, password: String },
    Disable { id: String, disabled: bool },
    Resources { id: String, limits: ResourceLimits },
}
// Explicit serialization avoids Debug/error formatting of password-bearing commands.
impl Update {
    fn value(self) -> Value { match self {
        Self::Add { username, name, role, capabilities, permissions, password } => json!({"action":"add","username":username,"name":name,"role":role,"capabilities":capabilities,"permissions":permissions,"password":password}),
        Self::Update { id, name, role, capabilities, permissions } => json!({"action":"update","id":id,"name":name,"role":role,"capabilities":capabilities,"permissions":permissions}),
        Self::Password { id, password } => json!({"action":"password","id":id,"password":password}),
        Self::Disable { id, disabled } => json!({"action":"disable","id":id,"disabled":disabled}),
        Self::Resources { id, limits } => json!({"action":"resources","id":id,"limits":limits}),
    } }
}
fn error(code: &str) -> String {
    match code { "AUTH_INPUT" | "AUTH_STORE" | "AUTH_CONFIG" | "AUTH_CONFLICT" | "AUTH_UNCERTAIN" | "AUTH_BUSY" | "AUTH_NODE" | "AUTH_PERMISSION" => code.to_string(), _ => "AUTH_STORE".into() }
}
fn only_editor(label: &str) -> Result<(), String> { if label == "main" { Ok(()) } else { Err(error("AUTH_PERMISSION")) } }
fn root<'a>(requested: &str, opened: &'a Option<PathBuf>) -> Result<&'a Path, String> {
    let current = opened.as_deref().ok_or_else(|| error("AUTH_CONFIG"))?;
    if fs::canonicalize(requested).map_err(|_| error("AUTH_STORE"))? != current { return Err(error("AUTH_CONFLICT")); } Ok(current)
}
fn system_node(project: &Path) -> Result<PathBuf, String> {
    let paths = std::env::var_os("PATH").ok_or_else(|| error("AUTH_NODE"))?;
    for directory in std::env::split_paths(&paths).filter(|path| path.is_absolute()) {
        let candidate = directory.join(if cfg!(windows) { "node.exe" } else { "node" });
        if let Ok(resolved) = fs::canonicalize(candidate) {
            let inside = if cfg!(windows) { resolved.to_string_lossy().to_lowercase().starts_with(&(project.to_string_lossy().to_lowercase().trim_end_matches('\\').to_string() + "\\")) } else { resolved.starts_with(project) };
            if resolved.is_file() && !inside { return Ok(resolved); }
        }
    }
    Err(error("AUTH_NODE"))
}
fn script() -> String {
    let policy = serde_json::to_string(include_str!("../../runtime/operator-policy.mjs")).unwrap();
    let store = serde_json::to_string(include_str!("../../runtime/operator-store.mjs")).unwrap();
    let admin = serde_json::to_string(include_str!("../../runtime/operator-admin.mjs")).unwrap();
    format!(r#"
let read=false;
try {{
  const input=globalThis.__fcOperatorInput;delete globalThis.__fcOperatorInput;read=input.action==='read';
  const version=process.versions.node.split('.').map(Number);
  if(version[0]<22||version[0]===22&&version[1]<13)throw Object.assign(new Error(),{{code:'AUTH_NODE'}});
  const url=s=>'data:text/javascript,'+encodeURIComponent(s);
  const policy=url({policy});
  const store=url({store}.replaceAll('"./operator-policy.mjs"',JSON.stringify(policy)));
  const admin=url({admin}.replaceAll('"./operator-policy.mjs"',JSON.stringify(policy)).replaceAll('"./operator-store.mjs"',JSON.stringify(store)));
  const mod=await import(admin);const data=await mod.manageLocalOperators(input);process.stdout.write(JSON.stringify({{ok:true,data}}));
}} catch(e) {{ process.stdout.write(JSON.stringify({{ok:false,code:typeof e.code==='string'&&e.code.startsWith('AUTH_')?e.code:read?'AUTH_STORE':'AUTH_UNCERTAIN'}}));process.exitCode=1; }}
"#)
}
// Program bytes come exclusively from include_str! above, never from a renderer command.
// Stdin avoids Windows argv limits and keeps credentials out of the process command line.
const BOOTSTRAP: &str = "let chunks=[],size=0;for await(const c of process.stdin){size+=c.length;if(size>131072)process.exit(1);chunks.push(c)}const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));globalThis.__fcOperatorInput=envelope.input;await import('data:text/javascript,'+encodeURIComponent(envelope.program));";
fn run(root: &Path, mut input: Value) -> Result<Metadata, String> {
    input.as_object_mut().ok_or_else(|| error("AUTH_INPUT"))?.insert("root".into(), Value::String(crate::path_string(root)));
    let read = input["action"] == "read"; let failed = || error(if read { "AUTH_STORE" } else { "AUTH_UNCERTAIN" });
    if serde_json::to_vec(&input).map_err(|_| error("AUTH_INPUT"))?.len() > 32768 { return Err(error("AUTH_INPUT")); }
    let bytes = serde_json::to_vec(&json!({"input":input,"program":script()})).map_err(|_| error("AUTH_INPUT"))?;
    if bytes.len() > 131072 { return Err(error("AUTH_CONFIG")); }
    let mut child = crate::background_command(system_node(root)?).args(["--input-type=module", "--eval", BOOTSTRAP])
        .current_dir(std::env::temp_dir()).env_remove("NODE_OPTIONS").env_remove("NODE_PATH").env("NODE_NO_WARNINGS", "1")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_| error("AUTH_NODE"))?;
    let mut stdin = child.stdin.take().unwrap(); let stdout = child.stdout.take().unwrap();
    let writer = thread::spawn(move || stdin.write_all(&bytes));
    let reader = thread::spawn(move || { let mut bytes = Vec::new(); stdout.take(131073).read_to_end(&mut bytes).map(|_| bytes) });
    let start = Instant::now();
    let status = loop { match child.try_wait() {
        Ok(Some(status)) => break Some(status),
        Ok(None) if start.elapsed() < TIMEOUT => thread::sleep(Duration::from_millis(20)),
        _ => { let _ = child.kill(); let _ = child.wait(); break None; }
    } };
    let written = writer.join().ok().is_some_and(|result| result.is_ok());
    let output = reader.join().ok().and_then(Result::ok).filter(|bytes| bytes.len() <= 131072).ok_or_else(failed)?;
    if status.is_none() || !written { return Err(failed()); }
    #[derive(Deserialize)] #[serde(deny_unknown_fields)] struct Reply { ok: bool, data: Option<Metadata>, code: Option<String> }
    let reply: Reply = serde_json::from_slice(&output).map_err(|_| failed())?;
    if !reply.ok { return Err(error(reply.code.as_deref().unwrap_or("AUTH_STORE"))); }
    if !status.unwrap().success() { return Err(failed()); } reply.data.ok_or_else(failed)
}
fn snapshot(root: &Path, state: &RuntimeState, data: Metadata) -> Result<Snapshot, String> {
    Ok(Snapshot { generation: state.project_generation.load(Ordering::SeqCst), configuration: read_one(root, CONFIG).map_err(|_| error("AUTH_STORE"))?, version: data.version, resource_rules: data.resource_rules, revision: data.revision, accounts: data.accounts })
}
fn read(requested: &str, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.try_lock().map_err(|_| error("AUTH_BUSY"))?; let root = root(requested, &opened)?;
    let data = run(root, json!({"action":"read"}))?; snapshot(root, state, data)
}
fn update(requested: &str, generation: u64, revision: Option<String>, command: Update, state: &RuntimeState) -> Result<Snapshot, String> {
    let opened = state.project_root.try_lock().map_err(|_| error("AUTH_BUSY"))?; let root = root(requested, &opened)?;
    if generation != state.project_generation.load(Ordering::SeqCst) { return Err(error("AUTH_CONFLICT")); }
    let mut input = command.value(); input.as_object_mut().unwrap().insert("expectedRevision".into(), json!(revision));
    let data = run(root, input)?;
    snapshot(root, state, data).map_err(|_| error("AUTH_UNCERTAIN"))
}
fn validate_config(source: &str) -> Result<(), String> {
    if source.len() > 4096 { return Err(error("AUTH_INPUT")); }
    let value: Value = serde_json::from_str(source).map_err(|_| error("AUTH_INPUT"))?;
    let keys = ["version","enabled","namespace","allowHttpLoopback","idleMinutes","absoluteMinutes"];
    let uuid = value["namespace"].as_str().unwrap_or("").as_bytes();
    let valid_uuid = uuid.len() == 36 && uuid.iter().enumerate().all(|(index, b)| if [8,13,18,23].contains(&index) { *b == b'-' } else { b.is_ascii_digit() || (b'a'..=b'f').contains(b) }) && uuid[14] == b'4' && b"89ab".contains(&uuid[19]);
    let idle = value["idleMinutes"].as_u64().unwrap_or(0); let absolute = value["absoluteMinutes"].as_u64().unwrap_or(0);
    if !value.as_object().is_some_and(|object| object.len() == keys.len() && keys.iter().all(|key| object.contains_key(*key))) || value["version"] != 1 || !value["enabled"].is_boolean() || !value["allowHttpLoopback"].is_boolean() || !valid_uuid || !(1..=60).contains(&idle) || absolute < idle || absolute > 480 { return Err(error("AUTH_INPUT")); } Ok(())
}
fn configure(requested: &str, generation: u64, expected: String, source: String, state: &RuntimeState) -> Result<(), String> {
    let opened = state.project_root.try_lock().map_err(|_| error("AUTH_BUSY"))?; let root = root(requested, &opened)?;
    if generation != state.project_generation.load(Ordering::SeqCst) { return Err(error("AUTH_CONFLICT")); }
    validate_config(&source)?;
    if read_one(root, CONFIG).map_err(|_| error("AUTH_STORE"))?.as_deref() != Some(expected.as_str()) { return Err(error("AUTH_CONFLICT")); }
    let staged = stage(root, CONFIG, &source).map_err(|_| error("AUTH_STORE"))?;
    if read_one(root, CONFIG).map_err(|_| error("AUTH_STORE"))?.as_deref() != Some(expected.as_str()) { return Err(error("AUTH_CONFLICT")); }
    persist(staged, &target(root, CONFIG).map_err(|_| error("AUTH_STORE"))?).map_err(|_| error("AUTH_UNCERTAIN"))
}
#[tauri::command]
pub async fn read_operator_accounts(root: String, window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<Snapshot, String> { only_editor(window.label())?; tauri::async_runtime::spawn_blocking(move || read(&root, &app.state::<RuntimeState>())).await.map_err(|_| error("AUTH_STORE"))? }
#[tauri::command]
pub async fn update_operator_accounts(root: String, generation: u64, revision: Option<String>, command: Update, window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<Snapshot, String> { only_editor(window.label())?; tauri::async_runtime::spawn_blocking(move || update(&root, generation, revision, command, &app.state::<RuntimeState>())).await.map_err(|_| error("AUTH_UNCERTAIN"))? }
#[tauri::command]
pub async fn save_operator_configuration(root: String, generation: u64, expected: String, source: String, window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> { only_editor(window.label())?; tauri::async_runtime::spawn_blocking(move || configure(&root, generation, expected, source, &app.state::<RuntimeState>())).await.map_err(|_| error("AUTH_UNCERTAIN"))? }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn only_the_main_editor_can_administer_accounts() { assert!(only_editor("main").is_ok()); for label in ["", "panel", "preview", "main-child"] { assert_eq!(only_editor(label).err().as_deref(), Some("AUTH_PERMISSION")); } }
    #[test] fn bridge_is_embedded_without_secrets_and_bounded_for_windows() { let code = script(); assert!(code.len() < 96000); assert!(BOOTSTRAP.encode_utf16().count() < 1000); assert!(code.contains("data:text/javascript,")); assert!(!code.contains("SYNTHETIC-password")); }
    #[test] fn configuration_validation_and_cas_are_session_scoped() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = crate::path_string(&root);
        let source = r#"{"version":1,"enabled":false,"namespace":"06a94107-d8cd-4b6b-a00e-1c508721cf1c","allowHttpLoopback":false,"idleMinutes":15,"absoluteMinutes":480}"#;
        for bad in ["{}", &source.replace("480", "481"), &source.replace("15", "0")] { assert!(validate_config(bad).is_err()); }
        fs::write(root.join(CONFIG), source).unwrap(); let generation = state.project_generation.load(Ordering::SeqCst);
        assert!(configure(&name, generation + 1, source.into(), source.into(), &state).is_err()); assert!(configure(&name, generation, "stale".into(), source.into(), &state).is_err());
        let next = source.replace("false", "true"); configure(&name, generation, source.into(), next.clone(), &state).unwrap(); assert_eq!(fs::read_to_string(root.join(CONFIG)).unwrap(), next);
    }
    #[test] fn embedded_worker_reads_without_creating_accounts_and_rejects_arbitrary_root() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap();
        let result = read(&crate::path_string(&root), &state).unwrap(); assert!(result.accounts.is_empty()); assert!(result.revision.is_none()); assert!(!root.join(".framecraft-runtime").exists());
        let other = tempfile::tempdir().unwrap(); assert!(read(other.path().to_str().unwrap(), &state).is_err());
        assert!(serde_json::from_value::<Metadata>(json!({"revision":null,"storeId":null,"accounts":[{"password":"never"}]})).is_err());
    }
    #[test] fn native_admin_writes_private_hashes_and_returns_only_metadata_with_cas() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); let name = crate::path_string(&root); let generation = state.project_generation.load(Ordering::SeqCst);
        let password = "SYNTHETIC-native-password-012345";
        let result = update(&name, generation, None, Update::Add { username: "synthetic".into(), name: "Operatore sintetico".into(), role: "Etichetta".into(), capabilities: vec!["recipes.read".into()], permissions: vec![], password: password.into() }, &state).unwrap();
        let response = serde_json::to_string(&result).unwrap(); assert!(!response.contains(password)); assert!(!response.contains("salt")); assert!(!response.contains("scrypt")); assert_eq!(result.accounts.len(), 1);
        let file = root.join(".framecraft-runtime/security/operators.json"); let before = fs::read_to_string(&file).unwrap(); assert!(!before.contains(password)); assert!(before.contains("scrypt"));
        assert_eq!(update(&name, generation, None, Update::Disable { id: result.accounts[0].id.clone(), disabled: true }, &state).err().as_deref(), Some("AUTH_CONFLICT")); assert_eq!(fs::read_to_string(&file).unwrap(), before);
        let changed = update(&name, generation, result.revision, Update::Disable { id: result.accounts[0].id.clone(), disabled: true }, &state).unwrap(); assert!(changed.accounts[0].disabled);
        let migrated = update(&name, generation, changed.revision.clone(), Update::Resources { id: changed.accounts[0].id.clone(), limits: ResourceLimits { tag_writes: ResourceFilter::Selected { ids: vec!["Speed".into()] }, alarm_actions: ResourceFilter::Selected { ids: vec![] }, recipe_changes: ResourceFilter::All } }, &state).unwrap();
        assert_eq!(migrated.version, Some(2)); assert_eq!(migrated.resource_rules.len(), 1);
        let old: Value = serde_json::from_str(&before).unwrap(); let new: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap(); assert_eq!(old["accounts"][0]["password"], new["accounts"][0]["password"]);
        let backup = root.join(format!(".framecraft-runtime/security/operators-v1-{}.json", changed.revision.unwrap())); assert!(backup.is_file());
        let safe = serde_json::to_string(&migrated).unwrap(); assert!(!safe.contains("scrypt")); assert!(safe.contains("Speed"));
    }
    #[test] fn project_runtime_code_is_never_executed_by_administration() {
        let dir = tempfile::tempdir().unwrap(); let root = fs::canonicalize(dir.path()).unwrap(); fs::create_dir(root.join("runtime")).unwrap(); fs::write(root.join("runtime/operator-admin.mjs"), "throw new Error('UNTRUSTED_PROJECT_MODULE');").unwrap();
        let state = RuntimeState::default(); crate::set_project_root(&state, root.clone()).unwrap(); assert!(read(&crate::path_string(&root), &state).is_ok());
    }
    #[test] fn private_accounts_are_excluded_from_code_export() {
        let source = tempfile::tempdir().unwrap(); let destination = tempfile::tempdir().unwrap(); fs::create_dir_all(source.path().join(".framecraft-runtime/security")).unwrap();
        fs::write(source.path().join(".framecraft-runtime/security/operators.json"), "SYNTHETIC_PRIVATE_CREDENTIALS").unwrap(); fs::write(source.path().join("framecraft.auth.json"), "PUBLIC_CONFIGURATION").unwrap();
        let mut warnings = Vec::new(); crate::export_contents(source.path(), destination.path(), &mut warnings).unwrap(); assert!(warnings.is_empty()); assert!(!destination.path().join(".framecraft-runtime").exists()); assert_eq!(fs::read_to_string(destination.path().join("framecraft.auth.json")).unwrap(), "PUBLIC_CONFIGURATION");
    }
}
