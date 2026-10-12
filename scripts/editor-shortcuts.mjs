export const editorCommands = [
  { id: "commands", label: "Cerca un comando", group: "Comandi", description: "Trova ed esegui un comando senza cercarlo nei menu", defaults: ["Mod+K"], typing: true },
  { id: "settings", label: "Impostazioni e scorciatoie", group: "Comandi", description: "Personalizza i comandi da tastiera dell’editor", defaults: ["Mod+Shift+K"] },
  { id: "open", label: "Apri un altro progetto", group: "File", description: "Scegli una cartella di lavoro", defaults: ["Mod+O"] },
  { id: "save", label: "Salva la modifica corrente", group: "File", description: "Salva la pagina su disco", defaults: ["Mod+S"], typing: true },
  { id: "export", label: "Esporta una copia", group: "File", description: "Scegli la cartella della copia finale", defaults: ["Mod+Shift+S"], typing: true },
  { id: "undo", label: "Annulla ultima modifica", group: "Modifica", description: "Torna alla modifica precedente", defaults: ["Mod+Z"], edit: true },
  { id: "redo", label: "Ripristina modifica", group: "Modifica", description: "Ripeti una modifica annullata", defaults: ["Mod+Shift+Z", "Mod+Y"], edit: true },
  { id: "duplicate", label: "Duplica elemento", group: "Modifica", description: "Crea una copia dell’elemento selezionato", defaults: ["Mod+D"], edit: true },
  { id: "delete", label: "Elimina selezione", group: "Modifica", description: "Rimuovi gli elementi selezionati", defaults: ["Delete", "Backspace"], edit: true },
  { id: "visual", label: "Torna alla grafica", group: "Visualizza", description: "Mostra solo il pannello grafico", defaults: ["Mod+1"] },
  { id: "split", label: "Grafica e codice affiancati", group: "Visualizza", description: "Mostra la pagina insieme al suo codice", defaults: ["Mod+2"] },
  { id: "code", label: "Mostra codice", group: "Visualizza", description: "Apri il codice della pagina", defaults: ["Mod+3"] },
  { id: "edit", label: "Modifica il pannello", group: "Visualizza", description: "Seleziona e modifica gli elementi", defaults: ["Mod+Shift+E"] },
  { id: "use", label: "Usa il pannello", group: "Visualizza", description: "Prova pulsanti e navigazione nell’editor", defaults: ["Mod+Shift+U"] },
  { id: "pages", label: "Apri Pagine", group: "Strumenti", description: "Scegli e organizza le pagine", defaults: ["F6"] },
  { id: "components", label: "Aggiungi componenti", group: "Strumenti", description: "Apri i componenti da inserire", defaults: ["F7"] },
  { id: "plc", label: "Variabili PLC e prova locale", group: "Strumenti", description: "Apri il catalogo e i valori manuali", defaults: ["F8"] },
  { id: "diagnostics", label: "Apri o chiudi diagnostica", group: "Strumenti", description: "Mostra o nascondi i messaggi dell’editor", defaults: ["Mod+Shift+L"] },
  { id: "check", label: "Controlla il pannello", group: "Strumenti", description: "Cerca tag mancanti ed errori di configurazione", defaults: [] },
  { id: "preview", label: "Prova pannello", group: "Strumenti", description: "Apri il pannello senza strumenti di modifica", defaults: [] },
  { id: "zoom-in", label: "Aumenta zoom", group: "Zoom e guide", description: "Ingrandisci il disegno", defaults: ["Mod+Plus", "Mod+Shift+Plus"] },
  { id: "zoom-out", label: "Riduci zoom", group: "Zoom e guide", description: "Riduci il disegno", defaults: ["Mod+Minus"] },
  { id: "zoom-reset", label: "Zoom 100%", group: "Zoom e guide", description: "Mostra il pannello nelle dimensioni originali", defaults: ["Mod+0"] },
  { id: "zoom-fit", label: "Adatta allo spazio", group: "Zoom e guide", description: "Adatta il pannello al canvas", defaults: ["Mod+Shift+F"] },
  { id: "snap", label: "Attiva o disattiva le guide", group: "Zoom e guide", description: "Cambia l’aggancio a bordi e griglia", defaults: ["Mod+Shift+G"] },
];

export function defaultEditorShortcuts() {
  return Object.fromEntries(editorCommands.map(command => [command.id, [...command.defaults]]));
}

export function normalizeEditorShortcut(value) {
  if (typeof value !== "string" || value.length > 70) return undefined;
  const parts = value.split("+").map(part => part.trim()), key = parts.pop();
  const modifiers = parts.map(part => /^(ctrl|cmd|meta|mod)$/i.test(part) ? "Mod" : /^alt$/i.test(part) ? "Alt" : /^shift$/i.test(part) ? "Shift" : undefined);
  if (modifiers.some(part => !part) || new Set(modifiers).size !== modifiers.length || !key) return undefined;
  const aliases = { del: "Delete", delete: "Delete", backspace: "Backspace", escape: "Escape", esc: "Escape", enter: "Enter", tab: "Tab", space: "Space", plus: "Plus", minus: "Minus", arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight", home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown" };
  const normalizedKey = /^[a-z0-9]$/i.test(key) || /^f(?:[1-9]|1[0-2])$/i.test(key) ? key.toUpperCase() : aliases[key.toLowerCase()];
  if (!normalizedKey) return undefined;
  return [...["Mod", "Alt", "Shift"].filter(modifier => modifiers.includes(modifier)), normalizedKey].join("+");
}

export function editorShortcutIssue(value) {
  const shortcut = normalizeEditorShortcut(value);
  if (!shortcut) return "Premi Ctrl o Alt insieme a un tasto, oppure usa un tasto funzione.";
  const reserved = ["Escape", "Tab", "Enter", "Space", "F5", "F11", "F12", "Alt+F4", "Alt+Tab", "Mod+L", "Mod+R", "Mod+Shift+R", "Mod+F5", "Shift+F5", "Mod+W", "Mod+Shift+W", "Mod+T", "Mod+Shift+T", "Mod+N", "Mod+Shift+N", "Mod+Shift+I", "Mod+Shift+J", "Mod+Alt+Delete", "Mod+Q", "Mod+H", "Mod+C", "Mod+V", "Mod+X", "Mod+A", "Mod+Shift+V", "Mod+Insert", "Mod+Enter"];
  if (reserved.includes(shortcut)) return "Questa combinazione è riservata alla finestra o al sistema. Scegline un’altra.";
  if (!shortcut.includes("Mod+") && !shortcut.includes("Alt+") && !/^(?:F\d{1,2}|Delete|Backspace)$/.test(shortcut)) return "Aggiungi Ctrl o Alt: i tasti da soli servono per scrivere e spostare gli elementi.";
  return undefined;
}

export function editorShortcutsIssue(bindings) {
  const used = new Map();
  for (const command of editorCommands) {
    const values = bindings?.[command.id];
    if (!Array.isArray(values) || values.length > 3) return "Ogni comando può avere fino a tre combinazioni.";
    for (const value of values) {
      const issue = editorShortcutIssue(value); if (issue) return issue;
      const shortcut = normalizeEditorShortcut(value);
      if (used.has(shortcut)) return `Questa combinazione è già assegnata a «${used.get(shortcut)}». Rimuovila prima da quel comando.`;
      used.set(shortcut, command.label);
    }
  }
  return undefined;
}

export function parseEditorShortcuts(raw) {
  const defaults = defaultEditorShortcuts();
  try {
    const stored = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (stored?.version !== 1 || !stored.bindings || typeof stored.bindings !== "object" || Array.isArray(stored.bindings)) return defaults;
    const bindings = Object.fromEntries(editorCommands.map(command => [command.id, command.id in stored.bindings ? stored.bindings[command.id]?.map?.(normalizeEditorShortcut) : [...command.defaults]]));
    return editorShortcutsIssue(bindings) ? defaults : bindings;
  } catch { return defaults; }
}

export function editorShortcutFromEvent(event) {
  if (event.isComposing || event.repeat || event.getModifierState?.("AltGraph")) return undefined;
  const key = event.key === " " ? "Space" : event.key === "+" ? "Plus" : event.key === "-" ? "Minus" : event.key;
  return normalizeEditorShortcut([...(event.ctrlKey || event.metaKey ? ["Mod"] : []), ...(event.altKey ? ["Alt"] : []), ...(event.shiftKey ? ["Shift"] : []), key].join("+"));
}

export function editorCommandForShortcut(bindings, shortcut, context = {}) {
  if (typeof shortcut !== "string") return undefined;
  return editorCommands.find(command => bindings[command.id]?.includes(shortcut)
    && (!command.edit || context.mode !== "navigate")
    && (!context.editing || command.typing && shortcut.includes("Mod+")))?.id;
}

export function formatEditorShortcut(shortcut, mac = false) {
  if (!shortcut) return "Non assegnata";
  const labels = { Mod: mac ? "⌘" : "Ctrl", Shift: "Shift", Alt: mac ? "⌥" : "Alt", Delete: "Canc", Backspace: "Backspace", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Plus: "+", Minus: "−", Space: "Spazio" };
  return shortcut.split("+").map(part => labels[part] ?? part).join(" + ");
}
