import { ComponentPalette } from "../components/ComponentPalette";
import { ProjectExplorer } from "../project-manager/ProjectExplorer";
import { useEditorStore } from "../state/editorStore";
import { PagesPanel } from "./PagesPanel";
import { PanelLeftClose } from "lucide-react";
import { PlcVariablesPanel } from "./PlcVariablesPanel";
import { PageAffordancePanel } from "./PageAffordancePanel";
import { ResourcesPanel } from "./ResourcesPanel";
import { ScriptModulesPanel } from "./ScriptModulesPanel";
import { FaceplatesPanel } from "./FaceplatesPanel";
import { DataLogsPanel } from "./DataLogsPanel";

export function LeftPanel() {
  const panel = useEditorStore((state) => state.leftPanel);
  const collapse = useEditorStore((state) => state.toggleLeftPanel);
  return <aside className="left-panel">
    <button className="panel-collapse-button" onClick={collapse} title="Riduci pannello" aria-label="Riduci pannello"><PanelLeftClose size={14} /></button>
    {panel === "project" && <ProjectExplorer />}
    {panel === "components" && <ComponentPalette />}
    {panel === "pages" && <PagesPanel />}
    {panel === "plc" && <PlcVariablesPanel />}
    {panel === "resources" && <ResourcesPanel />}
    {panel === "scripts" && <ScriptModulesPanel />}
    {panel === "faceplates" && <FaceplatesPanel />}
    {panel === "logs" && <DataLogsPanel />}
    {panel === "page" && <PageAffordancePanel />}
  </aside>;
}
