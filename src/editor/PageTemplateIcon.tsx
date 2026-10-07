import { Activity, AlertTriangle, ArrowDown, BarChart3, Bot, Boxes, CircleGauge, Copy, Droplets, FileText, Frame, Globe, History, Languages, Layers, LayoutGrid, ListChecks, ListTree, Map, MapPin, Ruler, Settings, SlidersHorizontal, Square, Table2, Video, Workflow, Wrench } from "lucide-react";
import { standardPageTemplates, type StandardPageTemplate, type StandardPageTemplateId } from "../core/hmiPages";

const emptyVariants = new Set<StandardPageTemplateId>(["blank", "machine-downstair", "main-counters", "main-collector-counters", "main-free", "main-maintenance"]);
export function pageTemplateGroups(templates: readonly StandardPageTemplate[]) {
  const empty = templates.filter((item) => emptyVariants.has(item.id));
  return templates.flatMap((item) => emptyVariants.has(item.id)
    ? item === empty[0] ? [{ template: item, variants: empty, name: "Pagina vuota e basi Main" }] : []
    : [{ template: item, variants: [item], name: item.name }]);
}
export function PageTemplateIcon({ template }: { template: StandardPageTemplate }) {
  const id = template.id;
  const exactIcons: Partial<Record<StandardPageTemplateId, typeof Frame>> = {
    "data-board": Table2, "program-modification": Ruler, "program-layer": Boxes, "program-pallet": Layers,
    "program-callouts": MapPin, "program-infeed": ArrowDown, "program-robot": Bot, "program-quotes": Ruler, "program-squaring": Square,
    "encoder-index": ListTree, "encoder-drawing": Map, "motor-speed": CircleGauge, "robot-function": Bot, "lubrification": Droplets,
    "system-function": Languages, "alarm-history": History, "alarm-zone": MapPin, "media": Video, "format-copy": Copy,
  };
  const Icon = exactIcons[id] ?? (emptyVariants.has(id) ? Frame
    : /alarm/.test(id) ? AlertTriangle : /statistics/.test(id) ? BarChart3
    : /production-overview/.test(id) ? Workflow : /encoder/.test(id) ? CircleGauge
    : /motor|lubrification|device-control/.test(id) ? Wrench : /program-layer|program-pallet|pallet-selection/.test(id) ? Boxes
    : /machine|synoptic|manual/.test(id) ? Map : /web|media/.test(id) ? Globe
    : /format/.test(id) ? FileText : /diagnostic/.test(id) ? Activity
    : /program|clv|special/.test(id) ? SlidersHorizontal : /command/.test(id) ? LayoutGrid
    : /system/.test(id) ? Settings : ListChecks);
  return <span className="page-template-icon" data-family={Icon.displayName} aria-hidden="true"><Icon size={34} /><small>{template.recommendedSection ?? "libera"}</small></span>;
}
export const pageCatalogCount = pageTemplateGroups(standardPageTemplates).length;
