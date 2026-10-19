use serde_json::{json, Value};
use std::path::Path;

pub(super) const PROFILE: &str = "framecraft-proposal";
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum SourcePolicy { RestrictedReads, NamedProfile }

pub(super) fn supports_profiles(thread: &Value, turn: &Value) -> bool {
    [thread, turn].iter().all(|schema| {
        let types = &schema["properties"]["permissions"]["type"];
        types == "string" || types.as_array().is_some_and(|types| types.iter().any(|value| value == "string"))
    })
}
pub(super) fn profile_config(scratch: &Path) -> Value {
    let mut filesystem = serde_json::Map::new();
    filesystem.insert(":minimal".into(), json!("read"));
    filesystem.insert(scratch.to_string_lossy().into_owned(), json!("read"));
    json!({"filesystem": filesystem, "network": {"enabled": false}})
}
pub(super) fn profile_argument(scratch: &Path) -> String {
    let path = json!(scratch).to_string();
    format!("permissions.{PROFILE}={{filesystem={{\":minimal\"=\"read\",{path}=\"read\"}},network={{enabled=false}}}}")
}
fn without_nulls(value: &Value) -> Value {
    match value {
        Value::Object(entries) => Value::Object(entries.iter().filter(|(_, value)| !value.is_null()).map(|(key, value)| (key.clone(), without_nulls(value))).collect()),
        Value::Array(entries) => Value::Array(entries.iter().map(without_nulls).collect()),
        _ => value.clone(),
    }
}
pub(super) fn verify_profile(config: &Value, scratch: &Path) -> Result<(), String> {
    if without_nulls(&config["config"]["permissions"][PROFILE]) == profile_config(scratch) { Ok(()) }
    else { Err("Il profilo Codex di Framecraft non corrisponde all’isolamento richiesto. Nessun accesso più ampio e nessuna richiesta AI: verifica le impostazioni con chi ti assiste.".into()) }
}
pub(super) fn verify_allowed(profiles: &Value) -> Result<(), String> {
    let matches: Vec<_> = profiles["data"].as_array().into_iter().flatten().filter(|profile| profile["id"] == PROFILE).collect();
    if matches.len() == 1 && matches[0]["allowed"] == true { Ok(()) }
    else { Err("Il profilo isolato di Framecraft non è disponibile o non è consentito dalle regole del computer. Chiedi all’IT; nessuna richiesta AI inviata e nessuna restrizione rimossa.".into()) }
}
pub(super) fn verify_windows_readiness(readiness: &Value) -> Result<(), String> {
    match readiness["status"].as_str() {
        Some("ready") => Ok(()),
        Some("notConfigured" | "updateRequired") => Err("Isolamento Windows di Codex da configurare o aggiornare. L’account resta collegato, ma le modifiche AI ai sorgenti non sono ancora disponibili. Serve il setup Windows autorizzato da te o dall’IT; aggiornare la CLI o premere Riprova non basta. Nessuna richiesta AI inviata.".into()),
        _ => Err("Non posso verificare l’isolamento Windows di Codex. Nessuna richiesta AI inviata: controlla la configurazione con chi ti assiste.".into()),
    }
}
pub(super) fn select_thread(params: &mut Value, mode: SourcePolicy) {
    if mode != SourcePolicy::NamedProfile { return; }
    params.as_object_mut().expect("thread parameters").remove("sandbox");
    params["permissions"] = json!(PROFILE);
    #[cfg(windows)]
    { params["config"] = json!({"windows.sandbox": "elevated"}); }
}
pub(super) fn select_turn(params: &mut Value, mode: SourcePolicy) {
    if mode != SourcePolicy::NamedProfile { return; }
    params.as_object_mut().expect("turn parameters").remove("sandboxPolicy");
    params["permissions"] = json!(PROFILE);
}
pub(super) fn verify_started(started: &Value, mode: SourcePolicy) -> Result<(), String> {
    if mode != SourcePolicy::NamedProfile || started["activePermissionProfile"]["id"] == PROFILE && started["activePermissionProfile"]["extends"].is_null() && started["approvalPolicy"] == "never" { Ok(()) }
    else { Err("Codex non ha attivato il profilo isolato richiesto. La sessione è stata fermata prima di inviare il contesto al modello; nessuna modifica applicata.".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    const SCRATCH: &str = "C:/synthetic proposal workspace";
    fn config() -> Value { json!({"config": {"permissions": {(PROFILE): profile_config(Path::new(SCRATCH))}}}) }
    #[test]
    fn profiles_must_be_declared_for_both_thread_and_turn() {
        let supported = json!({"properties":{"permissions":{"type":["string","null"]}}});
        assert!(supports_profiles(&supported, &supported));
        for unsupported in [json!({}), json!({"properties":{"permissions":{"type":"object"}}})] {
            assert!(!supports_profiles(&supported, &unsupported)); assert!(!supports_profiles(&unsupported, &supported));
        }
    }
    #[test]
    fn only_scratch_and_minimal_platform_paths_are_readable() {
        let expected = config(); assert!(verify_profile(&expected, Path::new(SCRATCH)).is_ok());
        for changed in [json!({"config":{"permissions":{(PROFILE):{"filesystem":{":root":"read"},"network":{"enabled":false}}}}}), json!({})] { assert!(verify_profile(&changed, Path::new(SCRATCH)).is_err()); }
        let mut extra = expected.clone(); extra["config"]["permissions"][PROFILE]["filesystem"]["C:/private"] = json!("read"); assert!(verify_profile(&extra, Path::new(SCRATCH)).is_err());
        extra = expected.clone(); extra["config"]["permissions"][PROFILE]["filesystem"][SCRATCH] = json!("write"); assert!(verify_profile(&extra, Path::new(SCRATCH)).is_err());
        extra = expected.clone(); extra["config"]["permissions"][PROFILE]["network"]["enabled"] = json!(true); assert!(verify_profile(&extra, Path::new(SCRATCH)).is_err());
        extra = expected.clone(); extra["config"]["permissions"][PROFILE]["extends"] = json!(":read-only"); assert!(verify_profile(&extra, Path::new(SCRATCH)).is_err());
        extra = expected; extra["config"]["permissions"][PROFILE]["description"] = Value::Null; extra["config"]["permissions"][PROFILE]["filesystem"]["glob_scan_max_depth"] = Value::Null; assert!(verify_profile(&extra, Path::new(SCRATCH)).is_ok());
    }
    #[test]
    fn disabled_missing_duplicate_or_unknown_profiles_never_pass() {
        assert!(verify_allowed(&json!({"data":[{"id":PROFILE,"allowed":true}]})).is_ok());
        for bad in [json!({}), json!({"data":[{"id":PROFILE,"allowed":false}]}), json!({"data":[{"id":PROFILE,"allowed":true},{"id":PROFILE,"allowed":true}]}), json!({"data":[{"id":":read-only","allowed":true}]})] { assert!(verify_allowed(&bad).is_err()); }
    }
    #[test]
    fn windows_setup_is_never_assumed_or_started() {
        assert!(verify_windows_readiness(&json!({"status":"ready"})).is_ok());
        for status in ["updateRequired", "notConfigured", "unexpected"] { assert!(verify_windows_readiness(&json!({"status":status})).is_err()); }
        assert!(verify_windows_readiness(&json!({"status":"updateRequired"})).unwrap_err().contains("setup Windows autorizzato"));
    }
    #[test]
    fn named_thread_and_turn_never_mix_legacy_sandbox_fields() {
        let mut thread = json!({"sandbox":"read-only","approvalPolicy":"never","model":"chosen"});
        select_thread(&mut thread, SourcePolicy::NamedProfile); assert!(thread.get("sandbox").is_none()); assert_eq!(thread["permissions"], PROFILE); assert_eq!(thread["model"], "chosen"); assert_eq!(thread["approvalPolicy"], "never");
        let mut turn = json!({"sandboxPolicy":{"type":"readOnly"},"outputSchema":{"type":"object"},"effort":"high"});
        select_turn(&mut turn, SourcePolicy::NamedProfile); assert!(turn.get("sandboxPolicy").is_none()); assert_eq!(turn["permissions"], PROFILE); assert_eq!(turn["effort"], "high"); assert_eq!(turn["outputSchema"]["type"], "object");
    }
    #[test]
    fn legacy_policy_remains_restricted_and_provenance_is_checked() {
        let mut turn = json!({"sandboxPolicy":{"type":"readOnly","access":{"type":"restricted"},"networkAccess":false}});
        let original = turn.clone(); select_turn(&mut turn, SourcePolicy::RestrictedReads); assert_eq!(turn, original);
        let valid = json!({"activePermissionProfile":{"id":PROFILE,"extends":null},"approvalPolicy":"never"}); assert!(verify_started(&valid, SourcePolicy::NamedProfile).is_ok());
        for invalid in [json!({}), json!({"activePermissionProfile":{"id":":read-only"},"approvalPolicy":"never"}), json!({"activePermissionProfile":{"id":PROFILE,"extends":":workspace"},"approvalPolicy":"never"}), json!({"activePermissionProfile":{"id":PROFILE},"approvalPolicy":"onRequest"})] { assert!(verify_started(&invalid, SourcePolicy::NamedProfile).is_err()); }
    }
    #[test]
    fn config_argument_quotes_paths_without_shell_interpolation() {
        let value = profile_argument(Path::new("C:/folder with spaces/proposals")); assert!(value.contains("\"C:/folder with spaces/proposals\"=\"read\"")); assert!(!value.contains(":root")); assert!(!value.contains("write")); assert!(value.contains("enabled=false"));
    }
}
