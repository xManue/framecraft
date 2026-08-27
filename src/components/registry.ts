import type { LucideIcon } from "lucide-react";
import { AlignLeft, Box, CheckSquare, CircleDot, Columns3, Heading, Image, Link, ListTree, Minus, LayoutPanelTop, MousePointerClick, Rows3, TextCursorInput, Type } from "lucide-react";

export type ComponentCategory = "Basic" | "Form" | "Layout" | "Data display";

export interface EditorComponentDefinition {
  type: string;
  name: string;
  category: ComponentCategory;
  icon: LucideIcon;
  defaultProps: Record<string, unknown>;
  createJsx: () => string;
}

const definitions: EditorComponentDefinition[] = [
  { type: "text", name: "Text", category: "Basic", icon: Type, defaultProps: {}, createJsx: () => "  <span>New text</span>" },
  { type: "heading", name: "Heading", category: "Basic", icon: Heading, defaultProps: {}, createJsx: () => "  <h2>New heading</h2>" },
  { type: "button", name: "Button", category: "Basic", icon: MousePointerClick, defaultProps: { type: "button" }, createJsx: () => "  <button type=\"button\">Button</button>" },
  { type: "image", name: "Image", category: "Basic", icon: Image, defaultProps: { alt: "" }, createJsx: () => "  <img src=\"/placeholder.svg\" alt=\"\" />" },
  { type: "input", name: "Input", category: "Form", icon: TextCursorInput, defaultProps: { placeholder: "Enter value" }, createJsx: () => "  <input placeholder=\"Enter value\" />" },
  { type: "textarea", name: "Textarea", category: "Form", icon: AlignLeft, defaultProps: {}, createJsx: () => "  <textarea placeholder=\"Enter text\"></textarea>" },
  { type: "select", name: "Select", category: "Form", icon: ListTree, defaultProps: {}, createJsx: () => "  <select><option>Choose an option</option></select>" },
  { type: "checkbox", name: "Checkbox", category: "Form", icon: CheckSquare, defaultProps: {}, createJsx: () => "  <label><input type=\"checkbox\" /> Option</label>" },
  { type: "radio", name: "Radio", category: "Form", icon: CircleDot, defaultProps: {}, createJsx: () => "  <label><input type=\"radio\" name=\"option\" /> Option</label>" },
  { type: "link", name: "Link", category: "Basic", icon: Link, defaultProps: {}, createJsx: () => "  <a href=\"#\">New link</a>" },
  { type: "divider", name: "Divider", category: "Basic", icon: Minus, defaultProps: {}, createJsx: () => "  <hr />" },
  { type: "container", name: "Container", category: "Layout", icon: Box, defaultProps: {}, createJsx: () => "  <div className=\"container\">Container</div>" },
  { type: "row", name: "Row", category: "Layout", icon: Rows3, defaultProps: {}, createJsx: () => "  <div style={{ display: \"flex\", gap: 16 }}>Row</div>" },
  { type: "columns", name: "Columns", category: "Layout", icon: Columns3, defaultProps: {}, createJsx: () => "  <div style={{ display: \"grid\", gridTemplateColumns: \"1fr 1fr\", gap: 16 }}>Columns</div>" },
  { type: "card", name: "Card", category: "Data display", icon: LayoutPanelTop, defaultProps: {}, createJsx: () => "  <article>Card</article>" },
];

export const componentRegistry = {
  all: () => definitions,
  categories: () => [...new Set(definitions.map((item) => item.category))],
  get: (type: string) => definitions.find((item) => item.type === type),
};
