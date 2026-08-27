import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FileJson2, FileText, Folder, FolderOpen } from "lucide-react";
import type { FileEntry } from "../core/types";
import { useEditorStore } from "../state/editorStore";

function FileIcon({ entry, open }: { entry: FileEntry; open?: boolean }) {
  if (entry.kind === "directory") return open ? <FolderOpen size={14} /> : <Folder size={14} />;
  if (/\.[jt]sx?$/.test(entry.name)) return <FileCode2 size={14} />;
  if (/\.json$/.test(entry.name)) return <FileJson2 size={14} />;
  return <FileText size={14} />;
}

function TreeItem({ entry, depth = 0 }: { entry: FileEntry; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const activeFile = useEditorStore((state) => state.document?.file);
  const openFile = useEditorStore((state) => state.openFile);
  const directory = entry.kind === "directory";
  return <div>
    <button
      className={`tree-row ${activeFile === entry.path ? "selected" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => directory ? setOpen(!open) : void openFile(entry.path)}
      title={entry.path}
    >
      <span className="tree-chevron">{directory ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}</span>
      <FileIcon entry={entry} open={open} /><span>{entry.name}</span>
    </button>
    {directory && open && entry.children?.map((child) => <TreeItem key={child.path} entry={child} depth={depth + 1} />)}
  </div>;
}

export function ProjectExplorer() {
  const project = useEditorStore((state) => state.project)!;
  return <div className="panel-content">
    <div className="panel-title"><span>PROJECT</span></div>
    <div className="project-meta"><strong>{project.name}</strong><span>{project.framework} · {project.language}</span></div>
    <div className="tree" role="tree">{project.files.map((entry) => <TreeItem key={entry.path} entry={entry} />)}</div>
  </div>;
}
