use crate::{
    connection_config::{check_root, read_files, ConfigurationSnapshot},
    opcua_job::OwnedJob,
    RuntimeState,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;
const INPUT_LIMIT: usize = 32 * 1024 * 1024;
const OUTPUT_LIMIT: usize = 4608 * 1024;
const PACK: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/opcua-sdk.pack"));

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    id: String,
    root: String,
    expected: ConfigurationSnapshot,
    connection_id: String,
    query: Value,
    consent: bool,
}
pub(super) struct BrowseJob {
    id: String,
    cancelled: AtomicBool,
}
#[derive(Default)]
pub(super) struct BrowseState {
    active: Option<Arc<BrowseJob>>,
    cancelled: std::collections::VecDeque<String>,
}
fn only_editor(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("OPC_UA_DESKTOP_PERMISSION".into())
    }
}
fn identifier(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
fn valid_query(value: &Value) -> bool {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Query {
        namespace_uri: Option<String>,
        node_id: Option<String>,
        offset: Option<u32>,
        limit: Option<u32>,
        revision: Option<String>,
    }
    let Ok(q) = serde_json::from_value::<Query>(value.clone()) else {
        return false;
    };
    q.namespace_uri.is_some() == q.node_id.is_some()
        && q.namespace_uri.as_ref().is_none_or(|v| {
            !v.trim().is_empty() && v.encode_utf16().count() <= 2048 && !v.chars().any(char::is_control)
        })
        && q.node_id
            .as_ref()
            .is_none_or(|v| !v.is_empty() && v.encode_utf16().count() <= 4096 && !v.chars().any(char::is_control))
        && q.offset.unwrap_or(0) < 5000
        && (1..=100).contains(&q.limit.unwrap_or(100))
        && q.revision
            .as_ref()
            .is_none_or(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
        && (q.offset.unwrap_or(0) == 0 || q.revision.is_some())
}
pub(super) fn cancel_all(state: &RuntimeState) {
    if let Ok(guard) = state.opcua_browse.lock() {
        if let Some(job) = guard.active.as_ref() {
            job.cancelled.store(true, Ordering::SeqCst);
        }
    }
}
fn cancel(id: &str, state: &RuntimeState) -> Result<bool, String> {
    if !identifier(id) {
        return Err("OPC_UA_BROWSE_INPUT".into());
    }
    let mut guard = state
        .opcua_browse
        .lock()
        .map_err(|_| "OPC_UA_BROWSE_BUSY")?;
    if let Some(job) = guard.active.as_ref().filter(|job| job.id == id) {
        job.cancelled.store(true, Ordering::SeqCst);
        return Ok(true);
    }
    if !guard.cancelled.iter().any(|value| value == id) {
        if guard.cancelled.len() >= 64 {
            guard.cancelled.pop_front();
        }
        guard.cancelled.push_back(id.into());
    }
    Ok(false)
}
struct Slot<'a> {
    state: &'a RuntimeState,
    job: Arc<BrowseJob>,
}
impl Drop for Slot<'_> {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.state.opcua_browse.lock() {
            if guard
                .active
                .as_ref()
                .is_some_and(|job| Arc::ptr_eq(job, &self.job))
            {
                guard.active.take();
            }
        }
    }
}
fn claim<'a>(request: &Request, state: &'a RuntimeState) -> Result<Slot<'a>, String> {
    if !identifier(&request.id)
        || !request.consent
        || request.connection_id.trim().is_empty()
        || request.connection_id.encode_utf16().count() > 200
        || request.connection_id.chars().any(char::is_control)
        || request.root.encode_utf16().count() > 32768
        || !valid_query(&request.query)
        || [
            &request.expected.files.connections,
            &request.expected.files.runtime,
            &request.expected.files.plc,
        ]
        .iter()
        .any(|s| s.as_ref().is_some_and(|text| text.len() > 4 * 1024 * 1024))
    {
        return Err("OPC_UA_BROWSE_INPUT".into());
    }
    let mut guard = state
        .opcua_browse
        .lock()
        .map_err(|_| "OPC_UA_BROWSE_BUSY")?;
    if let Some(index) = guard.cancelled.iter().position(|id| id == &request.id) {
        guard.cancelled.remove(index);
        return Err("OPC_UA_BROWSE_CANCELLED".into());
    }
    if guard.active.is_some() {
        return Err("OPC_UA_BROWSE_BUSY".into());
    }
    let job = Arc::new(BrowseJob {
        id: request.id.clone(),
        cancelled: AtomicBool::new(false),
    });
    guard.active = Some(job.clone());
    Ok(Slot { state, job })
}
fn current(request: &Request, state: &RuntimeState) -> Result<PathBuf, String> {
    let guard = state
        .project_root
        .lock()
        .map_err(|_| "OPC_UA_BROWSE_BUSY")?;
    let root = check_root(&request.root, &guard).map_err(|_| "OPC_UA_DESKTOP_CHANGED")?;
    if request.expected.generation != state.project_generation.load(Ordering::SeqCst)
        || read_files(root).map_err(|_| "OPC_UA_DESKTOP_CHANGED")? != request.expected.files
    {
        return Err("OPC_UA_DESKTOP_CHANGED".into());
    }
    Ok(root.to_path_buf())
}
fn profile(request: &Request) -> Result<(), String> {
    let source = request
        .expected
        .files
        .connections
        .as_deref()
        .ok_or("OPC_UA_BROWSE_CONFIG")?;
    if source.len() > 4 * 1024 * 1024 {
        return Err("OPC_UA_BROWSE_CONFIG".into());
    }
    let catalog: Value = serde_json::from_str(source).map_err(|_| "OPC_UA_BROWSE_CONFIG")?;
    let profiles = catalog["connections"]
        .as_array()
        .filter(|v| v.len() <= 1000)
        .ok_or("OPC_UA_BROWSE_CONFIG")?;
    let matches: Vec<_> = profiles
        .iter()
        .filter(|p| p["id"] == request.connection_id)
        .collect();
    if catalog["version"] != 1
        || matches.len() != 1
        || matches[0]["protocol"] != "opcua"
        || matches[0]["enabled"] != true
    {
        return Err("OPC_UA_BROWSE_CONFIG".into());
    }
    Ok(())
}
fn node(project: &Path) -> Result<PathBuf, String> {
    for directory in std::env::split_paths(&std::env::var_os("PATH").ok_or("OPC_UA_DESKTOP_NODE")?)
        .filter(|p| p.is_absolute())
    {
        if let Ok(candidate) =
            fs::canonicalize(directory.join(if cfg!(windows) { "node.exe" } else { "node" }))
        {
            let within = if cfg!(windows) {
                candidate.to_string_lossy().to_lowercase().starts_with(
                    &(project
                        .to_string_lossy()
                        .to_lowercase()
                        .trim_end_matches('\\')
                        .to_string()
                        + "\\"),
                )
            } else {
                candidate.starts_with(project)
            };
            if candidate.is_file() && !within {
                return Ok(candidate);
            }
        }
    }
    Err("OPC_UA_DESKTOP_NODE".into())
}
fn sources() -> Value {
    json!({
        "connection-config.mjs":include_str!("../../runtime/connection-config.mjs"),
        "connection-diagnostics.mjs":include_str!("../../runtime/connection-diagnostics.mjs"),
        "opcua-browse-policy.mjs":include_str!("../../runtime/opcua-browse-policy.mjs"),
        "opcua-browse.mjs":include_str!("../../runtime/opcua-browse.mjs"),
        "opcua-driver.mjs":include_str!("../../runtime/opcua-driver.mjs"),
        "opcua-browser.mjs":include_str!("../../runtime/opcua-browser.mjs")
    })
}
fn program() -> String {
    let template = r#"const input=globalThis.__fcBrowseInput;delete globalThis.__fcBrowseInput;const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const cache=url(__CACHE__);const worker=url(__WORKER__.replaceAll('"./opcua-sdk-cache.mjs"',JSON.stringify(cache)));const{runDesktopOpcUa}=await import(worker);export default await runDesktopOpcUa(input,globalThis.__fcBrowseAbort.signal);"#;
    template
        .replace(
            "__CACHE__",
            &serde_json::to_string(include_str!("../../scripts/opcua-sdk-cache.mjs")).unwrap(),
        )
        .replace(
            "__WORKER__",
            &serde_json::to_string(include_str!("../../scripts/opcua-desktop-worker.mjs")).unwrap(),
        )
}
// The only code accepted by this loader is the embedded app program supplied by Rust.
const BOOTSTRAP: &str = r#"let parts=[],size=0,started=false,header=0,pack=0,control='';globalThis.__fcBrowseAbort=new AbortController();const finish=(data,code)=>process.stdout.write(JSON.stringify(data),()=>process.exit(code));const commands=chunk=>{control+=chunk.toString('utf8');if(control.length>1024)return process.exit(1);let i;while((i=control.indexOf('\n'))>=0){if(control.slice(0,i)==='cancel')globalThis.__fcBrowseAbort.abort();control=control.slice(i+1)}};process.stdin.on('data',chunk=>{if(started)return commands(chunk);size+=chunk.length;if(size>33554432)return process.exit(1);parts.push(chunk);if(!header&&size>=12){const prefix=Buffer.concat(parts,size);if(prefix.subarray(0,4).toString('ascii')!=='FCO1')return process.exit(1);header=prefix.readUInt32LE(4);pack=prefix.readUInt32LE(8);if(!header||header>16777216||pack>10485760)return process.exit(1)}if(!header||size<12+header+pack)return;started=true;try{const bytes=Buffer.concat(parts,size);parts=[];const e=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(12,12+header)));e.input.sdkPack=bytes.subarray(12+header,12+header+pack);globalThis.__fcBrowseInput=e.input;commands(bytes.subarray(12+header+pack));console.log=console.info=console.warn=console.error=()=>{};import('data:text/javascript;base64,'+Buffer.from(e.program).toString('base64')).then(m=>finish({ok:true,data:m.default},0),e=>{const code=globalThis.__fcBrowseAbort.signal.aborted?'OPC_UA_BROWSE_CANCELLED':e.diagnostic?.code??e.code;finish({ok:false,code:typeof code==='string'&&/^(OPC_UA_[A-Z_]+|NETWORK_[A-Z_]+|SECRET_MISSING)$/.test(code)?code:'OPC_UA_DESKTOP_FAILED'},1)});}catch{finish({ok:false,code:'OPC_UA_BROWSE_INPUT'},1)}});"#;
fn execute(root: &Path, request: &Request, cache: &Path, job: &BrowseJob) -> Result<Value, String> {
    execute_with_sdk(
        root,
        request,
        cache,
        job,
        if cfg!(debug_assertions) {
            None
        } else {
            Some(PACK)
        },
    )
}
fn execute_with_sdk(
    root: &Path,
    request: &Request,
    cache: &Path,
    job: &BrowseJob,
    pack: Option<&[u8]>,
) -> Result<Value, String> {
    if job.cancelled.load(Ordering::SeqCst) {
        return Err("OPC_UA_BROWSE_CANCELLED".into());
    }
    let mut input = json!({"root":crate::path_string(root),"connectionId":request.connection_id,"query":request.query,"expectedConfiguration":request.expected.files.connections,"sources":sources(),"sdkCache":crate::path_string(cache)});
    if pack.is_none() {
        input["devSdkRoot"] = json!(Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_string_lossy());
    } else {
        let pack = pack.unwrap();
        if pack.is_empty() {
            return Err("OPC_UA_DESKTOP_SDK".into());
        }
    }
    let header = serde_json::to_vec(&json!({"input":input,"program":program()}))
        .map_err(|_| "OPC_UA_BROWSE_INPUT")?;
    let sdk = pack.unwrap_or(&[]);
    if header.len() > 16*1024*1024 || sdk.len() > 10*1024*1024 { return Err("OPC_UA_BROWSE_INPUT".into()); }
    let mut bytes = Vec::with_capacity(12 + header.len() + sdk.len());
    bytes.extend_from_slice(b"FCO1");
    bytes.extend_from_slice(&(header.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&(sdk.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&header);
    bytes.extend_from_slice(sdk);
    if bytes.len() > INPUT_LIMIT {
        return Err("OPC_UA_BROWSE_INPUT".into());
    }
    let mut child = crate::background_command(node(root)?)
        .args(["--input-type=module", "--eval", BOOTSTRAP])
        .current_dir(std::env::temp_dir())
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env("NODE_NO_WARNINGS", "1")
        .env("UV_THREADPOOL_SIZE", "8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "OPC_UA_DESKTOP_NODE")?;
    let owned = match OwnedJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let stdin = Arc::new(Mutex::new(
        child.stdin.take().ok_or("OPC_UA_DESKTOP_PROCESS")?,
    ));
    let writer_stdin = stdin.clone();
    let stdout = child.stdout.take().ok_or("OPC_UA_DESKTOP_PROCESS")?;
    let writer = thread::spawn(move || {
        let mut pipe = writer_stdin
            .lock()
            .map_err(|_| std::io::Error::other("stdin"))?;
        pipe.write_all(&bytes).and_then(|_| pipe.flush())
    });
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take((OUTPUT_LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let start = Instant::now();
    let mut cancellation = None;
    let mut sent = false;
    let status = loop {
        let abort =
            job.cancelled.load(Ordering::SeqCst) || start.elapsed() > Duration::from_secs(180);
        if abort {
            let since = cancellation.get_or_insert_with(Instant::now);
            if !sent {
                if let Ok(mut pipe) = stdin.try_lock() {
                    let _ = pipe.write_all(b"cancel\n");
                    let _ = pipe.flush();
                    sent = true;
                }
            }
            if since.elapsed() > Duration::from_secs(2) {
                owned.terminate();
                let _ = child.wait();
                break None;
            }
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                owned.terminate();
                let _ = child.wait();
                break None;
            }
        }
    };
    // Also close descendant pipes if the direct child exits unexpectedly before its helpers.
    owned.terminate();
    drop(stdin);
    let written = writer.join().ok().is_some_and(|v| v.is_ok());
    let output = reader
        .join()
        .ok()
        .and_then(Result::ok)
        .filter(|v| v.len() <= OUTPUT_LIMIT)
        .ok_or("OPC_UA_DESKTOP_FAILED")?;
    if job.cancelled.load(Ordering::SeqCst) {
        return Err("OPC_UA_BROWSE_CANCELLED".into());
    }
    if cancellation.is_some() {
        return Err("OPC_UA_DESKTOP_TIMEOUT".into());
    }
    if status.is_none() || !written {
        return Err("OPC_UA_DESKTOP_FAILED".into());
    }
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Reply {
        ok: bool,
        data: Option<Value>,
        code: Option<String>,
    }
    let reply: Reply = serde_json::from_slice(&output).map_err(|_| "OPC_UA_DESKTOP_FAILED")?;
    if !reply.ok {
        let code = reply
            .code
            .filter(|c| c.len() < 80 && c.bytes().all(|b| b.is_ascii_uppercase() || b == b'_'))
            .unwrap_or_else(|| "OPC_UA_DESKTOP_FAILED".into());
        return Err(code);
    }
    let data = reply.data.ok_or("OPC_UA_DESKTOP_FAILED")?;
    if data["version"] != 1
        || data["connectionId"] != request.connection_id
        || data["configurationRevision"]
            .as_str()
            .is_none_or(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err("OPC_UA_DESKTOP_FAILED".into());
    }
    Ok(data)
}
fn browse(request: Request, cache: PathBuf, state: &RuntimeState) -> Result<Value, String> {
    let slot = claim(&request, state)?;
    let root = current(&request, state)?;
    profile(&request)?;
    let result = execute(&root, &request, &cache, &slot.job)?;
    if slot.job.cancelled.load(Ordering::SeqCst) {
        return Err("OPC_UA_BROWSE_CANCELLED".into());
    }
    current(&request, state)?;
    Ok(result)
}
#[tauri::command]
pub async fn browse_opcua(
    request: Request,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    only_editor(window.label())?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| "OPC_UA_DESKTOP_SDK")?
        .join("opcua-sdk");
    tauri::async_runtime::spawn_blocking(move || {
        browse(request, cache, &app.state::<RuntimeState>())
    })
    .await
    .map_err(|_| String::from("OPC_UA_DESKTOP_FAILED"))?
}
#[tauri::command]
pub fn cancel_opcua_browse(
    id: String,
    window: tauri::WebviewWindow,
    state: tauri::State<RuntimeState>,
) -> Result<bool, String> {
    only_editor(window.label())?;
    cancel(&id, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(root: &Path, state: &RuntimeState) -> Request {
        Request {
            id: "a".repeat(32),
            root: crate::path_string(root),
            expected: ConfigurationSnapshot {
                generation: state.project_generation.load(Ordering::SeqCst),
                files: read_files(root).unwrap(),
            },
            connection_id: "synthetic".into(),
            query: json!({}),
            consent: true,
        }
    }
    #[test]
    fn ipc_scope_and_request_shape_reject_privilege_or_program_injection() {
        assert!(only_editor("main").is_ok());
        for label in ["preview", "panel", "main-child", ""] {
            assert!(only_editor(label).is_err());
        }
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        let mut req = request(&root, &state);
        req.consent = false;
        assert!(claim(&req, &state).is_err());
        req.consent = true;
        for query in [
            json!({"url":"opc.tcp://untrusted:4840"}),
            json!({"namespaceUri":"urn:test"}),
            json!({"offset":1}),
            json!({"limit":101}),
            json!({"nodeId":42}),
            json!({"source":"arbitrary program"}),
        ] {
            req.query = query;
            assert!(claim(&req, &state).is_err());
        }
        assert!(serde_json::from_value::<Request>(json!({"id":"a".repeat(32),"root":"x","expected":{"generation":1,"files":{"connections":null,"runtime":null,"plc":null}},"connectionId":"synthetic","query":{},"consent":true,"program":"never"})).is_err());
    }
    #[test]
    fn cancellation_is_owned_bounded_and_also_covers_a_request_not_yet_claimed() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        let req = request(&root, &state);
        assert!(!cancel(&req.id, &state).unwrap());
        assert!(claim(&req, &state).err().unwrap().contains("CANCELLED"));
        let slot = claim(&req, &state).unwrap();
        assert!(claim(&req, &state).is_err());
        assert!(!cancel(&"b".repeat(32), &state).unwrap());
        assert!(!slot.job.cancelled.load(Ordering::SeqCst));
        assert!(cancel(&req.id, &state).unwrap());
        assert!(slot.job.cancelled.load(Ordering::SeqCst));
        drop(slot);
        assert!(state.opcua_browse.lock().unwrap().active.is_none());
        for index in 0..100 {
            cancel(&format!("{index:032x}"), &state).unwrap();
        }
        assert_eq!(state.opcua_browse.lock().unwrap().cancelled.len(), 64);
    }
    #[test]
    fn project_changes_cancel_active_work_and_invalidate_all_three_catalogs() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        let req = request(&root, &state);
        let slot = claim(&req, &state).unwrap();
        assert_eq!(current(&req, &state).unwrap(), root);
        fs::write(root.join("framecraft.plc.json"), "changed").unwrap();
        assert!(current(&req, &state).is_err());
        crate::set_project_root(&state, root).unwrap();
        assert!(slot.job.cancelled.load(Ordering::SeqCst));
        assert!(current(&req, &state).is_err());
    }
    #[test]
    fn embedded_program_has_no_renderer_source_or_project_module_loader() {
        assert!(program().len() < 40000);
        assert!(BOOTSTRAP.encode_utf16().count() < 3000);
        let sources = sources();
        assert_eq!(sources.as_object().unwrap().len(), 6);
        assert!(sources["opcua-browser.mjs"]
            .as_str()
            .unwrap()
            .contains("expectedConfiguration"));
    }
    #[cfg(windows)]
    struct Server {
        child: std::process::Child,
        job: OwnedJob,
        stdin: std::process::ChildStdin,
        output: std::sync::mpsc::Receiver<String>,
        reader: Option<thread::JoinHandle<()>>,
    }
    #[cfg(windows)]
    impl Server {
        fn start(root: &Path) -> (Self, String) {
            let script = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("tests/fixtures/opcua-desktop-server.mjs");
            let mut child = crate::background_command(node(root).unwrap())
                .arg(script)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH")
                .spawn()
                .unwrap();
            let job = OwnedJob::attach(&child).unwrap();
            let mut stdin = child.stdin.take().unwrap();
            let stdout = child.stdout.take().unwrap();
            let (send, output) = std::sync::mpsc::channel();
            let reader = thread::spawn(move || {
                use std::io::BufRead;
                for line in std::io::BufReader::new(stdout).lines() {
                    match line {
                        Ok(line) => {
                            if send.send(line).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
            writeln!(stdin, "{}", json!({"root":crate::path_string(root)})).unwrap();
            let server = Self {
                child,
                job,
                stdin,
                output,
                reader: Some(reader),
            };
            let source = server.output.recv_timeout(Duration::from_secs(40)).unwrap();
            let value: Value = serde_json::from_str(&source).unwrap();
            let endpoint = value["endpoint"].as_str().unwrap().to_owned();
            (server, endpoint)
        }
        fn stats(&mut self) -> Value {
            writeln!(self.stdin, "stats").unwrap();
            serde_json::from_str(&self.output.recv_timeout(Duration::from_secs(10)).unwrap())
                .unwrap()
        }
    }
    #[cfg(windows)]
    impl Drop for Server {
        fn drop(&mut self) {
            self.job.terminate();
            let _ = self.child.wait();
            if let Some(reader) = self.reader.take() {
                let _ = reader.join();
            }
        }
    }
    #[test]
    #[cfg(windows)]
    fn embedded_windows_worker_browses_real_metadata_ignores_project_code_and_closes_sessions() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let (mut server, endpoint) = Server::start(&root);
        fs::create_dir(root.join("runtime")).unwrap();
        fs::write(
            root.join("runtime/opcua-browser.mjs"),
            "throw Error('UNTRUSTED_PROJECT_CODE')",
        )
        .unwrap();
        fs::write(root.join("framecraft.connections.json"),json!({"version":1,"connections":[{"id":"synthetic","protocol":"opcua","enabled":true,"url":endpoint,"securityMode":"None","securityPolicy":"None","allowInsecure":true,"bindings":[{"tag":"NeverDeclared","nodeId":"s=NeverRead","namespaceUri":"urn:synthetic","writeEnabled":true}]}]}).to_string()).unwrap();
        let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        let mut req = request(&root, &state);
        req.query = json!({"namespaceUri":"urn:framecraft:synthetic-desktop","nodeId":"s=Plant","limit":100});
        let first = browse(req, root.join("app-cache"), &state).unwrap();
        assert_eq!(first["page"]["total"], 207);
        assert_eq!(first["page"]["nextOffset"], 100);
        assert_eq!(first["page"]["nodes"].as_array().unwrap().len(), 100);
        let mut req = request(&root, &state);
        req.query = json!({"namespaceUri":"urn:framecraft:synthetic-desktop","nodeId":"s=Plant","offset":100,"limit":100,"revision":first["page"]["revision"]});
        let second = browse(req, root.join("app-cache"), &state).unwrap();
        assert_eq!(second["page"]["offset"], 100);
        let stats = server.stats();
        assert_eq!(stats["reads"], 0);
        assert_eq!(stats["writes"], 0);
        assert_eq!(stats["calls"], 0);
        assert_eq!(stats["sessions"], 0);
        assert!(state.opcua_browse.lock().unwrap().active.is_none());
    }
    #[test]
    #[cfg(windows)]
    fn cancellation_during_worker_startup_returns_no_page_and_reaps_owned_process() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        fs::write(root.join("framecraft.connections.json"),r#"{"version":1,"connections":[{"id":"synthetic","protocol":"opcua","enabled":true,"url":"opc.tcp://127.0.0.1:1","securityMode":"None","securityPolicy":"None","allowInsecure":true,"bindings":[]}]}"#).unwrap();
        let req = request(&root, &state);
        let slot = claim(&req, &state).unwrap();
        let job = slot.job.clone();
        let cancel = thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            job.cancelled.store(true, Ordering::SeqCst);
        });
        let start = Instant::now();
        assert_eq!(
            execute(&root, &req, &root.join("cache"), &slot.job).unwrap_err(),
            "OPC_UA_BROWSE_CANCELLED"
        );
        cancel.join().unwrap();
        assert!(start.elapsed() < Duration::from_secs(10));
    }
    #[test]
    #[cfg(windows)]
    #[ignore = "Build a local release SDK pack and set FRAMECRAFT_TEST_OPCUA_PACK explicitly"]
    fn packaged_sdk_worker_browses_without_project_or_app_node_modules_resolution() {
        let bytes = fs::read(
            std::env::var_os("FRAMECRAFT_TEST_OPCUA_PACK")
                .expect("FRAMECRAFT_TEST_OPCUA_PACK is required"),
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let (mut server, endpoint) = Server::start(&root);
        fs::write(root.join("framecraft.connections.json"),json!({"version":1,"connections":[{"id":"synthetic","protocol":"opcua","enabled":true,"url":endpoint,"securityMode":"None","securityPolicy":"None","allowInsecure":true,"bindings":[]}]}).to_string()).unwrap();
        let state = RuntimeState::default();
        crate::set_project_root(&state, root.clone()).unwrap();
        let mut req = request(&root, &state);
        req.query =
            json!({"namespaceUri":"urn:framecraft:synthetic-desktop","nodeId":"s=Plant","limit":5});
        let slot = claim(&req, &state).unwrap();
        let cache = root.join("app-cache");
        let first = execute_with_sdk(&root, &req, &cache, &slot.job, Some(&bytes)).unwrap();
        assert_eq!(first["page"]["total"], 207);
        assert_eq!(first["page"]["nodes"].as_array().unwrap().len(), 5);
        let second = execute_with_sdk(&root, &req, &cache, &slot.job, Some(&bytes)).unwrap();
        assert_eq!(second["page"]["revision"], first["page"]["revision"]);
        let stats = server.stats();
        assert_eq!(stats["reads"], 0);
        assert_eq!(stats["writes"], 0);
        assert_eq!(stats["calls"], 0);
        assert_eq!(stats["sessions"], 0);
        assert!(fs::read_dir(cache).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("sdk-")));
    }
}
