import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FileImage, FileJson2, FileText, Folder, FolderOpen, Search } from "lucide-react";
import type { FileEntry } from "../core/types";
import { useEditorStore } from "../state/editorStore";
import { filterProjectFiles, projectFileKind } from "../core/projectFiles";
import { ProjectFileViewer } from "./ProjectFileViewer";
import { MessageNotice } from "../editor/MessageNotice";

function FileIcon({ entry, open }: { entry: FileEntry; open?: boolean }) {
  if (entry.kind === "directory") return open ? <FolderOpen size={14} /> : <Folder size={14} />;
  if (/\.[jt]sx?$/.test(entry.name)) return <FileCode2 size={14} />;
  if (/\.json$/.test(entry.name)) return <FileJson2 size={14} />;
  if (projectFileKind(entry.path) === "image") return <FileImage size={14} />;
  return <FileText size={14} />;
}

function TreeItem({ entry, depth = 0, searching, opening, onOpen }: { entry: FileEntry; depth?: number; searching: boolean; opening?: string; onOpen(entry: FileEntry): void }) {
  const [open, setOpen] = useState(depth < 2);
  const activeFile = useEditorStore((state) => state.document?.file);
  const directory = entry.kind === "directory";
  const expanded = searching || open;
  return <div>
    <button
      className={`tree-row ${activeFile === entry.path ? "selected" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => directory ? setOpen(!open) : onOpen(entry)}
      title={entry.path}
      disabled={!!opening}
      aria-expanded={directory ? expanded : undefined}
    >
      <span className="tree-chevron">{directory ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}</span>
      <FileIcon entry={entry} open={expanded} /><span className="tree-name">{entry.name}</span>
      {!directory && <small>{opening === entry.path ? "Apro…" : projectFileKind(entry.path) === "source" ? "Codice" : projectFileKind(entry.path) === "image" ? "Immagine" : "Leggi"}</small>}
    </button>
    {directory && expanded && entry.children?.map((child) => <TreeItem key={child.path} entry={child} depth={depth + 1} searching={searching} opening={opening} onOpen={onOpen} />)}
  </div>;
}

export function ProjectExplorer() {
  const project = useEditorStore((state) => state.project)!;
  const openFile = useEditorStore((state) => state.openFile);
  const [search, setSearch] = useState("");
  const [viewedFile, setViewedFile] = useState<FileEntry>();
  const [opening, setOpening] = useState<string>();
  const [openingError, setOpeningError] = useState("");
  const openingRef = useRef(false);
  const entries = useMemo(() => filterProjectFiles(project.files, search), [project.files, search]);
  async function open(entry: FileEntry) {
    if (projectFileKind(entry.path) !== "source") { setViewedFile(entry); return; }
    if (openingRef.current) return;
    openingRef.current = true; setOpening(entry.path); setOpeningError("");
    try {
      await openFile(entry.path);
      const state = useEditorStore.getState();
      if (state.project === project && state.document?.file === entry.path && state.viewMode === "visual") state.setViewMode("split");
    } catch (error) { setOpeningError(error instanceof Error ? error.message : String(error)); }
    finally { openingRef.current = false; setOpening(undefined); }
  }
  return <div className="panel-content project-explorer">
    <div className="panel-title"><span>FILE DEL PROGETTO</span></div>
    <div className="project-meta"><strong>{project.name}</strong><span>{project.framework} · {project.language}</span></div>
    <p className="panel-help">Clicca un sorgente per aprire il codice accanto alla grafica. Gli altri file si consultano in sola lettura; per modificare il pannello usa Pagine o clicca gli elementi.</p>
    <label className="search-field"><Search size={14} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Cerca file" placeholder="Cerca un file…" /></label>
    {openingError && <div role="alert"><MessageNotice raw={openingError} /></div>}
    <div className="tree">{entries.map((entry) => <TreeItem key={entry.path} entry={entry} searching={!!search.trim()} opening={opening} onOpen={(file) => void open(file)} />)}
      {!entries.length && <p className="panel-help">{search ? "Nessun file corrisponde alla ricerca." : "Nessun file presente nel progetto."}</p>}
    </div>
    {viewedFile && <ProjectFileViewer key={viewedFile.path} file={viewedFile} onClose={() => setViewedFile(undefined)} />}
  </div>;
}
