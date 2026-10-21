export const workspaceActivityWidth = 52;
export const workspaceCanvasMinimum = 240;

/** Fit the chrome to the available editor pixels, without overwriting saved pane widths. */
export function fitWorkspacePanes(panes: { left: number; inspector: number }, width: number, collapsed: boolean, inspectorVisible = true) {
  const requestedLeft = collapsed ? 0 : panes.left;
  const requestedInspector = inspectorVisible ? panes.inspector : 0;
  const budget = Math.max(0, width - workspaceActivityWidth - workspaceCanvasMinimum);
  const total = requestedLeft + requestedInspector;
  if (total <= budget) return { left: requestedLeft, inspector: requestedInspector };
  const left = Math.floor(budget * requestedLeft / total);
  return { left, inspector: Math.floor(budget - left) };
}
