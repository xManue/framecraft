import { Check, Image as ImageIcon, LoaderCircle, Monitor, Smartphone, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { desktopAvailable, desktopBridge } from "../filesystem/desktopBridge";
import { standardProjectPageCount, standardProjectSectionChoices } from "../core/standardProjectChoices";
import type { StandardProjectConfig, StandardProjectSectionId } from "../core/standardProject";
import { settingsProgramChoices, type SettingsProgram } from "../core/hmiSectionMenu";
import { useEditorStore } from "../state/editorStore";
import { useEditorAi } from "../state/editorAi";

export function StandardProjectWizard({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  const [method, setMethod] = useState<"manual" | undefined>();
  const create = useEditorStore((state) => state.createStandardProject);
  const [machineName, setMachineName] = useState("Nuovo pannello operatore");
  const [layout, setLayout] = useState<StandardProjectConfig["layout"]>("desktop-mobile");
  const [selected, setSelected] = useState<StandardProjectSectionId[]>(() => standardProjectSectionChoices.map((section) => section.id));
  const [settingsProgram, setSettingsProgram] = useState<SettingsProgram>("robot");
  const [machineImage, setMachineImage] = useState<string | undefined>(undefined);
  const chooseMachineImage = async () => {
    try {
      const chosen = await desktopBridge.chooseImage();
      if (chosen) setMachineImage(chosen);
    } catch { /* la finestra di scelta si e' chiusa: non e' un errore da mostrare */ }
  };
  const valid = machineName.trim().length > 0 && selected.length > 0;
  const toggle = (id: StandardProjectSectionId) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loading, onClose]);

  if (!method) return <div className="standard-project-backdrop">
    <section className="standard-project-wizard" role="dialog" aria-modal="true" aria-labelledby="new-project-method-title">
      <header><div><span className="eyebrow">NUOVO PROGETTO</span><h2 id="new-project-method-title">Come vuoi costruire il pannello?</h2><p>In entrambi i casi il progetto rimane modificabile normalmente nell’editor.</p></div><button type="button" onClick={onClose} aria-label="Chiudi procedura"><X size={18} /></button></header>
      <div className="standard-project-body ai-project-methods">
        <button type="button" className="button primary" autoFocus onClick={() => { onClose(); useEditorAi.getState().show("create"); }}><Sparkles size={20} /><span><strong>Con AI, tramite domande guidate</strong><small>Scegli quante pagine, quali funzioni, immagini e liste tag/allarmi. Controlli il piano prima di creare.</small></span></button>
        <button type="button" className="button secondary" onClick={() => setMethod("manual")}><Monitor size={20} /><span><strong>Senza AI, dallo standard</strong><small>Scegli le sezioni complete già disponibili e adattale a mano. Non serve un account ChatGPT.</small></span></button>
      </div>
    </section>
  </div>;
  return <div className="standard-project-backdrop" role="presentation">
    <section className="standard-project-wizard" role="dialog" aria-modal="true" aria-labelledby="standard-project-title">
      <header><div><span className="eyebrow">NUOVO PROGETTO</span><h2 id="standard-project-title">Crea un pannello HMI standard</h2><p>Framecraft prepara struttura, navigazione e pagine. Tu dovrai soltanto adattare contenuti e variabili della macchina.</p></div><button type="button" onClick={onClose} disabled={loading} aria-label="Chiudi procedura"><X size={18} /></button></header>
      <div className="standard-project-body">
        <label className="standard-project-name"><span>Nome macchina o linea</span><input autoFocus value={machineName} onChange={(event) => setMachineName(event.target.value)} placeholder="es. Linea palletizzazione 1" /></label>
        <fieldset><legend>Immagine della macchina <small>facoltativa</small></legend><div className="standard-project-image">
          <button type="button" onClick={() => void chooseMachineImage()} disabled={!desktopAvailable || loading}><ImageIcon size={17} /><span><strong>{machineImage ? machineImage.split(/[\\/]/).at(-1) : "Scegli la foto o il rendering"}</strong><small>{machineImage ?? "Finisce nelle pagine che mostrano la macchina intera: 1001, 1081, 4001 e 5001. Gli screen delle singole parti si scelgono dopo, dalla pagina."}</small></span></button>
          {machineImage && <button type="button" className="standard-project-image-clear" onClick={() => setMachineImage(undefined)} aria-label="Togli l'immagine scelta"><X size={15} /></button>}
        </div></fieldset>
        <fieldset><legend>Su quali pannelli deve funzionare?</legend><div className="standard-layout-options">
          <button type="button" className={layout === "desktop" ? "active" : ""} aria-pressed={layout === "desktop"} onClick={() => setLayout("desktop")}><Monitor size={21} /><span><strong>Solo desktop</strong><small>Layout PC fisso 1280×800</small></span>{layout === "desktop" && <Check size={16} />}</button>
          <button type="button" className={layout === "desktop-mobile" ? "active" : ""} aria-pressed={layout === "desktop-mobile"} onClick={() => setLayout("desktop-mobile")}><Smartphone size={21} /><span><strong>Desktop + mobile</strong><small>Include navigatore e low bar mobile</small></span>{layout === "desktop-mobile" && <Check size={16} />}</button>
        </div></fieldset>
        <fieldset><legend>Quali sezioni vuoi già pronte? <small>{selected.length} di {standardProjectSectionChoices.length}</small></legend><div className="standard-section-options">
          {standardProjectSectionChoices.map((section) => {
            const active = selected.includes(section.id);
            return <button key={section.id} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => toggle(section.id)}><span className="standard-section-check">{active && <Check size={13} />}</span><span><strong>{section.label}</strong><small>{section.description}</small></span></button>;
          })}
        </div>{!selected.length && <p className="standard-project-validation" role="alert">Scegli almeno una sezione da creare.</p>}</fieldset>
        {selected.includes("settings") && <fieldset><legend>Quale Program Modification usa la macchina?</legend><p className="standard-project-field-help">Nel progetto standard queste sessioni sono alternative e riutilizzano gli stessi numeri pagina. Ne viene generata una sola.</p><div className="standard-program-options">
          {settingsProgramChoices.map((choice) => <button key={choice.id} type="button" className={settingsProgram === choice.id ? "active" : ""} aria-pressed={settingsProgram === choice.id} onClick={() => setSettingsProgram(choice.id)}><span><strong>{choice.label}</strong><small>{choice.description} · {choice.pages} pagine</small></span>{settingsProgram === choice.id && <Check size={15} />}</button>)}
        </div></fieldset>}
      </div>
      <footer><div><strong>{standardProjectPageCount(selected, settingsProgram)} pagine iniziali</strong><small>Numerate, collegate al router e registrate nel manifesto.</small></div><button type="button" className="button secondary" onClick={onClose} disabled={loading}>Annulla</button><button type="button" className="button primary" disabled={!valid || loading} onClick={() => void create({ machineName: machineName.trim(), layout, sections: selected, machineImage, settingsProgram })}>{loading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{loading ? "Creazione in corso…" : "Scegli cartella e crea"}</button></footer>
    </section>
  </div>;
}
