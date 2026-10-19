use serde_json::{json, Value};

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Phase { #[default] Idle, Running, Completed, Failed, Uncertain }

#[derive(Default)]
pub(super) struct Setup { pub phase: Phase }
impl Setup {
    pub fn pending(&self) -> bool { matches!(self.phase, Phase::Running | Phase::Uncertain) }
    pub fn begin(&mut self, approved: bool, active: bool) -> Result<(), String> {
        if !approved { return Err("Autorizza esplicitamente la configurazione Windows prima di avviarla.".into()); }
        if self.pending() { return Err("Configurazione Windows già avviata o con esito incerto. Non ripeterla: verifica la finestra Windows o chiedi all’IT.".into()); }
        if active { return Err("Attendi o annulla la richiesta AI prima di configurare Windows.".into()); }
        self.phase = Phase::Running;
        Ok(())
    }
    pub fn interrupted(&mut self) { if self.phase == Phase::Running { self.phase = Phase::Uncertain; } }
    pub fn acknowledge(&mut self, response: &Value) { if response["started"] != true { self.interrupted(); } }
    pub fn complete(&mut self, params: &Value) -> bool {
        if !self.pending() || params["mode"] != "elevated" { return false; }
        match params["success"].as_bool() {
            Some(true) if params["error"].is_null() => self.phase = Phase::Completed,
            Some(false) => self.phase = Phase::Failed,
            _ => self.interrupted(),
        }
        true
    }
    pub fn snapshot(&self, readiness: &Value) -> Value {
        let status = match readiness["status"].as_str() { Some("ready") => "ready", Some("notConfigured") => "notConfigured", Some("updateRequired") => "updateRequired", Some("notRequired") => "notRequired", _ => "unknown" };
        json!({"status": status, "phase": self.phase})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_consent_and_no_ai_job_are_required() {
        let mut setup = Setup::default();
        assert!(setup.begin(false, false).is_err()); assert_eq!(setup.phase, Phase::Idle);
        assert!(setup.begin(true, true).is_err()); assert_eq!(setup.phase, Phase::Idle);
        assert!(setup.begin(true, false).is_ok()); assert!(setup.pending());
        assert!(setup.begin(true, false).is_err());
    }
    #[test]
    fn acknowledgement_is_not_completion() {
        let mut setup = Setup::default(); setup.begin(true, false).unwrap();
        setup.acknowledge(&json!({"started":true})); assert_eq!(setup.phase, Phase::Running);
        setup.acknowledge(&json!({})); assert_eq!(setup.phase, Phase::Uncertain);
        assert!(setup.begin(true, false).is_err());
    }
    #[test]
    fn completion_can_arrive_before_ack_or_after_an_uncertain_response() {
        for interrupt in [false, true] {
            let mut setup = Setup::default(); setup.begin(true, false).unwrap(); if interrupt { setup.interrupted(); }
            assert!(setup.complete(&json!({"mode":"elevated","success":true,"error":null})));
            setup.acknowledge(&json!({"started":true})); setup.interrupted();
            assert_eq!(setup.phase, Phase::Completed); assert!(!setup.pending());
        }
    }
    #[test]
    fn unrelated_or_malformed_notifications_do_not_report_success() {
        let mut setup = Setup::default(); assert!(!setup.complete(&json!({"mode":"elevated","success":true})));
        setup.begin(true, false).unwrap(); assert!(!setup.complete(&json!({"mode":"unelevated","success":true}))); assert_eq!(setup.phase, Phase::Running);
        setup.complete(&json!({"mode":"elevated","success":true,"error":"SECRET"})); assert_eq!(setup.phase, Phase::Uncertain);
        setup.complete(&json!({"mode":"elevated","success":false,"error":"SECRET"})); assert_eq!(setup.phase, Phase::Failed);
        assert!(!setup.snapshot(&json!({"status":"updateRequired","token":"SECRET"})).to_string().contains("SECRET"));
        assert!(setup.begin(false, false).is_err()); assert!(setup.begin(true, false).is_ok());
    }
    #[test]
    fn snapshots_never_treat_setup_completion_as_readiness() {
        let setup = Setup { phase: Phase::Completed };
        assert_eq!(setup.snapshot(&json!({"status":"updateRequired"})), json!({"status":"updateRequired","phase":"completed"}));
        assert_eq!(setup.snapshot(&json!({"status":"future-value"}))["status"], "unknown");
        assert_eq!(setup.snapshot(&Value::Null), json!({"status":"unknown","phase":"completed"}));
        assert_eq!(Setup { phase: Phase::Failed }.snapshot(&Value::Null), json!({"status":"unknown","phase":"failed"}));
    }
}
