import { ActivityBar } from "./ActivityBar";
import { LeftPanel } from "./LeftPanel";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { ConsolePanel } from "./ConsolePanel";
import { Inspector } from "../inspector/Inspector";
import { Workspace } from "./Workspace";
import { useEditorStore } from "../state/editorStore";
import { StandalonePreview } from "../preview/StandalonePreview";

export function AppShell() {
  const consoleOpen = useEditorStore((state) => state.consoleOpen);
  const leftPanelCollapsed = useEditorStore((state) => state.leftPanelCollapsed);
  const standalonePreviewOpen = useEditorStore((state) => state.standalonePreviewOpen);
  return (
    <>
      <main className="app-shell">
        <TopBar />
        <div className={`editor-grid ${leftPanelCollapsed ? "left-collapsed" : ""}`}>
          <ActivityBar />
          {!leftPanelCollapsed && <LeftPanel />}
          <section className="workspace-stack">
            <Workspace />
            {consoleOpen && <ConsolePanel />}
          </section>
          <Inspector />
        </div>
        <StatusBar />
      </main>
      {standalonePreviewOpen && <StandalonePreview />}
    </>
  );
}
