import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alarmControl,
  cssColor,
  desktopShell,
  isValidPageNumber,
  menuEntryScript,
  menuSlotNumber,
  menuSlotNumbers,
  mobileSectionMenu,
  nextMenuSlot,
  nextPageNumber,
  pageLoadedScript,
  pageNumber,
  pageNumberParts,
  panelSize,
  plainText,
  sections,
  submenuPanel,
  textIn,
  twoColumnPage,
} from "../src/core/hmiStandard";
import { mobileSectionTiles, submenuPlacement, submenuPlacementNear } from "../src/core/hmiSectionMenu";

describe("la regola di numerazione", () => {
  it("dà i numeri delle voci di menu di una sezione", () => {
    expect(menuSlotNumbers(2).slice(0, 4)).toEqual([2001, 2041, 2081, 2121]);
    expect(menuSlotNumber(1, 0)).toBe(1001);
    expect(menuSlotNumber(7, 2)).toBe(7081);
  });

  it("numera le pagine dentro una voce", () => {
    expect(pageNumber(2, 1, 0)).toBe(2041);
    expect(pageNumber(2, 1, 36)).toBe(2077);
  });

  it("scompone un numero di pagina", () => {
    expect(pageNumberParts(2077)).toEqual({ sectionNumber: 2, slot: 1, page: 36, menuNumber: 2041 });
    expect(pageNumberParts(1081)).toEqual({ sectionNumber: 1, slot: 2, page: 0, menuNumber: 1081 });
  });

  it("rifiuta i numeri che la regola non prevede", () => {
    // 000 non è una pagina: la voce parte da 001. 8 non è una sezione. Oltre lo slot 13 si sfora.
    expect(isValidPageNumber(2000)).toBe(false);
    expect(isValidPageNumber(8001)).toBe(false);
    expect(isValidPageNumber(1561)).toBe(false);
    expect(isValidPageNumber(2041.5)).toBe(false);
  });

  it("trova il primo numero libero dentro una voce", () => {
    expect(nextPageNumber(2, 1, [2041, 2042, 2043])).toBe(2044);
    expect(nextPageNumber(2, 1, [])).toBe(2041);
    const full = Array.from({ length: 40 }, (_, page) => 2041 + page);
    expect(nextPageNumber(2, 1, full)).toBeUndefined();
  });

  it("trova il primo slot di menu libero di una sezione", () => {
    expect(nextMenuSlot(1, [1001, 1041, 1081])).toBe(3);
    // I numeri di un'altra sezione non occupano slot qui.
    expect(nextMenuSlot(3, [1001, 1041])).toBe(0);
  });
});

describe("lo standard vero", () => {
  const indexPath = fileURLToPath(new URL("../standard/index.json", import.meta.url));
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    panels: { screens: { name: string }[] }[];
  };
  const numbers = [...new Set(
    index.panels
      .flatMap((panel) => panel.screens)
      .map((screen) => /^(\d{4})_/.exec(screen.name)?.[1])
      .filter((match): match is string => Boolean(match))
      .map(Number),
  )];

  it("ha estratto dei numeri di pagina dall'export", () => {
    expect(numbers.length).toBeGreaterThan(100);
  });

  it("rispetta la regola su tutte le pagine di contenuto del progetto", () => {
    // 0 e 1 sono i due schermi di avvio (`0000_Layout_*`, `0001_Choice`), fuori dalle sezioni.
    const content = numbers.filter((number) => number > 1);
    expect(content.filter((number) => !isValidPageNumber(number))).toEqual([]);
  });

  it("copre con le sette sezioni tutte quelle usate dalle pagine, tranne i popup 9xxx", () => {
    const used = [...new Set(numbers.filter((number) => number > 1).map((number) => Math.floor(number / 1000)))].sort();
    expect(used).toEqual([...sections.map((section) => section.number), 9]);
  });
});

describe("gli script del guscio", () => {
  it("scrive l'onLoaded obbligatorio di una pagina", () => {
    expect(pageLoadedScript(1081)).toBe([
      'HMIRuntime.Tags.SysFct.SetTagValue("Actual_Page_Number", 1081);',
      'Tags("PV_ActualPageNumber_For_PLC["+ Tags("Enable_Session_Index").Read() +"]").Write(1081);',
      'HMIRuntime.Tags.SysFct.SetTagValue("Folder_Vis", 1);',
    ].join("\n"));
  });

  it("una voce di menu cambia schermata due volte, una per layout", () => {
    const script = menuEntryScript("2041_Encoders_Main", "2xxxx_Settings_Template_Navigator");
    expect(script).toContain('ChangeScreen("2041_Encoders_Main", "../SW_Screen")');
    expect(script).toContain('ChangeScreen("2xxxx_Settings_Template_Navigator", "../SW_Navigator")');
  });
});

describe("colori e testi", () => {
  it("traduce #AARRGGBB in CSS", () => {
    expect(cssColor("#FF00A1D1")).toBe("#00A1D1");
    expect(cssColor("#00F2F4FF")).toBe("rgba(242, 244, 255, 0)");
    expect(cssColor("#8048494E")).toBe("rgba(72, 73, 78, 0.502)");
    expect(cssColor("#00A1D1")).toBe("#00A1D1");
  });

  it("estrae il testo dal frammento XHTML di Openness", () => {
    expect(plainText("<body><p>Encoders</p></body>")).toBe("Encoders");
    expect(plainText("<body><p>Riga 1<br/>Riga 2</p></body>")).toBe("Riga 1\nRiga 2");
  });

  it("prende la lingua chiesta, o la prima che c'è", () => {
    const texts = { "it-IT": "<body><p>Impostazioni</p></body>", "en-US": "<body><p>Settings</p></body>" };
    expect(textIn(texts)).toBe("Impostazioni");
    expect(textIn(texts, "en-US")).toBe("Settings");
    expect(textIn(texts, "de-DE")).toBe("Impostazioni");
    expect(textIn(undefined)).toBe("");
  });
});

interface Item {
  _type: string;
  Name?: string;
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  AlarmView?: { RowHeight?: number; Columns?: { Width: number; Visible: boolean }[] };
}

const itemsOf = (path: string) =>
  (JSON.parse(readFileSync(fileURLToPath(new URL(`../standard/screens/${path}`, import.meta.url)), "utf8")) as {
    ScreenItems: Item[];
  }).ScreenItems;

const box = (item: Item) => [item.Left, item.Top, item.Width, item.Height];

describe("le misure prese dalle schermate, non a occhio", () => {
  const alarms = itemsOf("3000_Alarms&Events/3001_Alarms/3001_Alarms.json");

  it("il controllo allarmi sta dove dice `alarmControl`", () => {
    const control = alarms.find((item) => item._type === "HmiAlarmControl")!;
    expect(box(control)).toEqual([alarmControl.left, alarmControl.top, alarmControl.width, alarmControl.height]);
    expect(control.AlarmView?.RowHeight).toBe(alarmControl.row);

    // Le sei colonne accese sono quelle di `alarmControl.columns`, tolta la prima che è
    // l'intestazione di riga del controllo e non sta fra le colonne del JSON.
    const visible = (control.AlarmView?.Columns ?? []).filter((column) => column.Visible).map((column) => column.Width);
    expect(visible).toEqual(alarmControl.columns.slice(1).map((column) => column.width));
    // Le sette larghezze insieme fanno la larghezza del controllo: la prima è quello che avanza.
    expect(alarmControl.columns.reduce((sum, column) => sum + column.width, 0)).toBe(alarmControl.width);
  });

  it("la barra del titolo e i due comandi della pagina allarmi stanno dove dice `alarmControl`", () => {
    const board = alarms.find((item) => item.Name === "recContentboard2_1")!;
    const { board: expected, troubleshooting } = alarmControl;
    expect(box(board)).toEqual([expected.left, expected.top, expected.width, expected.height]);
    expect(alarms.find((item) => item.Name === "Text box_4")!.Left).toBe(expected.titleLeft);
    expect(box(alarms.find((item) => item.Name === "Text box_5")!)).toEqual([
      troubleshooting.label.left, troubleshooting.label.top, troubleshooting.label.width, troubleshooting.label.height,
    ]);
    expect(box(alarms.find((item) => item.Name === "btnNok_1")!)).toEqual([
      troubleshooting.button.left, troubleshooting.button.top, troubleshooting.button.width, troubleshooting.button.height,
    ]);

    // Lo storico è la stessa pagina: cambia solo il comando in alto a destra.
    const history = itemsOf("3000_Alarms&Events/3081_History/3081_Alarms_History.json");
    const command = alarmControl.historyCommand;
    expect(box(history.find((item) => item.Name === "Button_2")!)).toEqual([
      command.left, command.top, command.width, command.height,
    ]);
  });

  it("la pagina a due colonne ha le misure di `2285_CLV_User_Doser_Config`", () => {
    const items = itemsOf("2000_Settings/2281_CLV_User/2285_CLV_User_Doser_Config.json");
    const { header, column, row } = twoColumnPage;
    expect(box(items.find((item) => item.Name === "recContentboard2_1")!)).toEqual([
      header.left, header.top, header.width, header.height,
    ]);
    expect(items.find((item) => item.Name === "Text box_4")!.Left).toBe(header.titleLeft);

    // Le due testate e i due corpi: stesse misure, solo il `left` cambia.
    for (const [index, name] of [[0, "recContentboard2_3"], [1, "recContentboard2_4"]] as const) {
      expect(box(items.find((item) => item.Name === name)!)).toEqual([
        column.lefts[index], column.top, column.width, column.head,
      ]);
    }
    for (const [index, name] of [[0, "recContentboard2_2"], [1, "recContentboard2"]] as const) {
      expect(box(items.find((item) => item.Name === name)!)).toEqual([
        column.lefts[index], column.bodyTop, column.width, column.bodyHeight,
      ]);
    }

    // I campi della colonna di sinistra: 88x33 a 263 dal bordo, passo 59 dalla prima a 27.
    const fields = items
      .filter((item) => item._type === "HmiIOField" && item.Left === column.lefts[0] + row.field.left)
      .map((item) => item.Top!)
      .sort((first, second) => first - second);
    expect(fields).toHaveLength(6);
    expect(fields[0]).toBe(column.bodyTop + row.firstTop);
    expect(fields.map((top) => top - fields[0])).toEqual([0, 1, 2, 3, 4, 5].map((step) => step * row.pitch));
  });

  it("il sottomenu di sezione ha le misure dei sette `Template Desktop`", () => {
    const { panel, pointer, entry, separator } = submenuPanel;
    // Le sette schermate sono la stessa cosa spostata piu' in basso: quello che deve tornare e' la
    // forma del pannello, non dove l'ha messo a mano chi ha disegnato quella singola schermata.
    for (const section of sections) {
      const items = itemsOf(`Template Desktop/${section.submenuScreen}.json`);
      const board = items.filter((item) => item._type === "HmiRectangle" && item.Width === panel.width)[0]!;
      expect(board.Width).toBe(panel.width);

      const voices = items
        .filter((item) => item._type === "HmiButton" && item.Width === entry.width)
        .sort((first, second) => first.Top! - second.Top!);
      expect(voices.length).toBeGreaterThanOrEqual(submenuPanel.maxEntries);
      expect(voices.every((voice) => voice.Height === entry.height)).toBe(true);
      // La prima voce sta `first` sotto il bordo del pannello, e le voci si susseguono col passo
      // dello standard. Nell'export il passo slitta di un pixel ogni tre (40, 40, 41) e in due
      // schermate una voce e' stata aggiunta dopo, a mano: da qui la tolleranza.
      expect(Math.abs(voices[0].Top! - (board.Top! + entry.first))).toBeLessThanOrEqual(5);
      const steps = voices.slice(1, submenuPanel.maxEntries).map((voice, index) => voice.Top! - voices[index].Top!);
      expect(steps.every((step) => Math.abs(step - entry.pitch) <= 4)).toBe(true);

      // Il triangolino punta all'icona della sezione, il filo e' largo 200x2.
      const arrow = items.find((item) => item._type === "HmiPolygon")!;
      expect([arrow.Width, arrow.Height]).toEqual([pointer.width, pointer.height]);
      const lines = items.filter((item) => item._type === "HmiRectangle" && item.Height === separator.height);
      expect(lines.every((line) => Math.abs(line.Width! - separator.width) <= 10)).toBe(true);
    }
  });

  it("`submenuPlacement` rimette il pannello dove sta nell'export", () => {
    // Il pannello sta 38 sopra l'icona, mai sopra la pagina, mai fuori dal fondo. Main e Diagnostic
    // tornano al pixel perche' sono i due che finiscono contro un bordo; gli altri restano vicini,
    // perche' nelle schermate del sottomenu la fila di icone e' ridisegnata 5 px piu' in basso di
    // quella del guscio, e perche' quattro pannelli su sette sono stati piazzati a mano in TIA.
    const measured: Record<number, number> = { 0: 160, 1: 229, 2: 314, 3: 407, 5: 500, 6: 483 };
    for (const [slot, top] of Object.entries(measured)) {
      const placement = submenuPlacement(Number(slot), submenuPanel.maxEntries);
      expect(Math.abs(placement.panel.top - top)).toBeLessThanOrEqual(20);
      expect(placement.panel.top).toBeGreaterThanOrEqual(desktopShell.content.top);
      expect(placement.panel.top + placement.panel.height).toBeLessThanOrEqual(panelSize.height);
    }
    expect(submenuPlacement(0, submenuPanel.maxEntries).panel.top).toBe(160);
    expect(submenuPlacement(5, submenuPanel.maxEntries).panel.top).toBe(500);
    // Con meno voci il pannello si accorcia invece di restare mezzo vuoto.
    expect(submenuPlacement(2, 2).panel.height).toBe(submenuPanel.entry.first + 2 * submenuPanel.entry.pitch + 2);
  });
  it("il menu delle sezioni mobile ha i nove quadrati dei sette `Template Mobile`", () => {
    const { size, columns, rows } = mobileSectionMenu;
    for (const section of sections) {
      const items = itemsOf(`Template Mobile/${section.submenuScreen}_1.json`);
      const tiles = items
        .filter((item) => item.Width === size && item.Height === size)
        .map((item) => [item.Left!, item.Top!] as const);
      expect(tiles).toHaveLength(columns.length * rows.length);
      // Le nove posizioni sono le stesse in tutte e sette le schermate: sette sezioni piu' l'utente
      // e il cambio layout.
      const wanted = rows.flatMap((top) => columns.map((left) => `${left},${top}`)).sort();
      expect([...tiles].map(([left, top]) => `${left},${top}`).sort()).toEqual(wanted);
    }
  });

  it("`submenuPlacementNear` rimette il pannello dove sta nei `Template Mobile`", () => {
    // Il pannello del sottomenu e' lo stesso del desktop: cambia solo che si apre di fianco al
    // quadrato, e da che parte guarda il triangolino. Qui il confronto e' con il pannello e il
    // triangolino misurati nelle sette schermate, quadrato per quadrato.
    const measured = [
      { tile: 0, entries: 7, panel: [198, 188], pointer: [407, 231] },
      { tile: 1, entries: 7, panel: [718, 194], pointer: [689, 236] },
      { tile: 2, entries: 4, panel: [870, 187], pointer: [841, 229] },
      { tile: 3, entries: 3, panel: [201, 343], pointer: [411, 385] },
      { tile: 4, entries: 7, panel: [722, 340], pointer: [693, 382] },
      { tile: 6, entries: 3, panel: [201, 320], pointer: [410, 528] },
    ] as const;
    const tiles = mobileSectionTiles();
    for (const { tile, entries, panel, pointer } of measured) {
      const placement = submenuPlacementNear(tiles[tile], entries);
      // Il triangolino cade entro quattro pixel dappertutto, il pannello in cinque casi su sette:
      // in Diagnostic e Formats e' stato tirato su a mano in TIA lasciando il triangolino sul
      // quadrato, e infatti qui si controlla solo il `left` del pannello di Formats.
      expect(Math.abs(placement.pointer.left - pointer[0])).toBeLessThanOrEqual(4);
      expect(Math.abs(placement.pointer.top - pointer[1])).toBeLessThanOrEqual(4);
      expect(Math.abs(placement.panel.left - panel[0])).toBeLessThanOrEqual(4);
      if (tile !== 6) expect(Math.abs(placement.panel.top - panel[1])).toBeLessThanOrEqual(4);
      // La prima colonna apre a sinistra con il triangolino a destra, le altre due il contrario.
      expect(placement.pointer.side).toBe(tile % 3 === 0 ? "left" : "right");
      expect(placement.panel.height).toBe(submenuPanel.entry.first + entries * submenuPanel.entry.pitch + 2);
    }
  });
});
