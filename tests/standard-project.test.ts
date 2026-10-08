import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import { manifestPage, parsePanelManifest } from "../src/core/panelManifest";
import { detectPages } from "../src/core/pages";
import { cssColor, desktopShell, lateralBar, pageCanvas, panelSize, sections, submenuPanel } from "../src/core/hmiStandard";
import { submenuPlacement } from "../src/core/hmiSectionMenu";
import { standardProjectFiles, standardProjectPageCount, standardProjectSectionChoices } from "../src/core/standardProject";

describe("generatore nuovo pannello standard", () => {
  it("inserisce la scelta iniziale nel progetto HMI desktop+mobile, non nei pannelli solo desktop", () => {
    const files = standardProjectFiles({ machineName: "Linea {A} <test>", layout: "desktop-mobile", sections: ["main"] });
    const app = files.find((file) => file.path === "src/App.tsx")!.content, styles = files.find((file) => file.path === "src/styles.css")!.content;
    expect(() => parse(app, { sourceType: "module", plugins: ["jsx", "typescript"] })).not.toThrow();
    expect(app).toContain('className="hmi-start"'); expect(app).toContain('data-panel-start-mode="desktop"'); expect(app).toContain('data-panel-start-mode="mobile"');
    expect(app).toContain('data-panel-return=""'); expect(app).toContain("sessionStorage.removeItem(layoutPreferenceKey)");
    expect(app).not.toContain("hmi-layout-switch"); expect(app).not.toContain('"auto"');
    expect(app).toContain('{"Linea {A} test"}'); expect(styles).toContain("@media (max-width: 600px)");
    const sources = Object.fromEntries(files.filter((file) => file.path.endsWith(".tsx")).map((file) => [file.path, file.content]));
    expect(detectPages(sources).pages).toHaveLength(files.filter((file) => file.path.startsWith("src/pages/")).length);
    const desktop = standardProjectFiles({ machineName: "Desktop", layout: "desktop", sections: ["main"] });
    expect(desktop.find((file) => file.path === "src/App.tsx")!.content).not.toContain('className="hmi-start"');
    expect(desktop.find((file) => file.path === "src/App.tsx")!.content).not.toContain("data-panel-return");
    expect(desktop.find((file) => file.path === "src/styles.css")!.content).not.toContain(".hmi-start");
    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(desktop.filter((file) => file.path.startsWith("src/pages/")).length);
  });
  it("genera un guscio mobile adattabile mantenendo la tela macchina e comandi touch", () => {
    const files = standardProjectFiles({ machineName: "Mobile", layout: "desktop-mobile", sections: ["main"] });
    const app = files.find((file) => file.path === "src/App.tsx")!.content, css = files.find((file) => file.path === "src/styles.css")!.content;
    expect(app).toContain('const mobileLayout = layoutMode === "mobile"');
    expect(app).not.toContain("window.matchMedia"); expect(css).not.toContain("hmi-layout-switch");
    expect(app.includes("Adatta disegno")).toBe(true); expect(app.includes('data-mobile-fit={mobileFit}')).toBe(true);
    expect(css.includes(".hmi-shell.mobile { width: 100%" )).toBe(true); expect(css.includes("height: calc(100dvh - 172px - env(")).toBe(true);
    expect(css.includes("zoom: var(--mobile-scale)")).toBe(true); expect(css.includes("min-height: 44px")).toBe(true);
    expect(css.includes(".hmi-shell.mobile .hmi-user { position: static")).toBe(true);
    expect(css.includes(".hmi-submenu-panel li { height: 48px !important")).toBe(true);
    expect(files.find((file) => file.path.startsWith("src/pages/") && file.content.includes("data-page-number={1001}"))?.content.includes("width: 1280")).toBe(true);
  });
  it("crea guscio, tutte le pagine delle sezioni, manifesto e catalogo PLC", () => {
    const files = standardProjectFiles({
      machineName: "Linea palletizzazione 1",
      layout: "desktop-mobile",
      sections: standardProjectSectionChoices.map((section) => section.id),
    });
    expect(files.find((file) => file.path === "src/App.tsx")?.content).toContain('data-panel-layout={mobileLayout ? "mobile" : "desktop"}');
    // Sette sezioni, ognuna con tutte le pagine del suo menu, sorelle comprese: Main nove
    // (1001-1241), Settings cinquantaquattro (le dieci linguette di Program Settings, l'indice
    // encoder con le due pagine di ognuno dei diciotto, le tre dell'Infeed Guide, il resto una
    // per voce), Alarms quattro, Statistics tre, Manuals sette, Diagnostic sette, Formats tre.
    // Le voci "Free" senza schermata nell'export non diventano pagine.
    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(87);
    expect(files.find((file) => file.path === "src/styles.css")?.content).toContain("width: 1280px");
    expect(files.find((file) => file.path === "src/styles.css")?.content).toContain("height: 800px");
    expect(files.find((file) => file.path === "public/placeholder.svg")?.content).toContain("Sostituisci immagine nell'Inspector");
    expect(JSON.parse(files.find((file) => file.path === "framecraft.plc.json")!.content).variables).toEqual([]);
    expect(JSON.parse(files.find((file) => file.path === "framecraft.resources.json")!.content)).toMatchObject({
      version: 1, defaultLanguage: "it-IT", activeLanguage: "it-IT", bitSelection: "ExactMatch", multilingualTexts: [], textLists: [], graphicLists: [],
    });
    expect(JSON.parse(files.find((file) => file.path === "framecraft.scripts.json")!.content)).toEqual({ version: 1, globalModules: [], localDefinitions: [], scheduledTasks: [] });
    expect(JSON.parse(files.find((file) => file.path === "framecraft.logs.json")!.content)).toEqual({ version: 1, projectKey: "linea-palletizzazione-1", logs: [] });
    expect(JSON.parse(files.find((file) => file.path === "framecraft.connections.json")!.content)).toEqual({ version: 1, connections: [] });
    expect(JSON.parse(files.find((file) => file.path === "runtime/package.json")!.content)).toMatchObject({ scripts: { mqtt: "node start-mqtt.mjs" }, dependencies: { mqtt: "5.16.0" } });
    expect(files.find((file) => file.path === "runtime/mqtt-driver.mjs")!.content).toContain('import { connect } from "mqtt"');
    expect(files.find((file) => file.path === "runtime/gateway.mjs")!.content).toContain("export function createMqttGateway");
    expect(files.find((file) => file.path === "runtime/connection-diagnostics.mjs")!.content).toContain("Come risolvere:");
    expect(files.find((file) => file.path === "runtime/connection-diagnostics.d.mts")!.content).toContain("ConnectionDiagnostic");
    expect(files.find((file) => file.path === "runtime/runtime-log.mjs")!.content).toContain("export function createRuntimeLogger");
    expect(files.find((file) => file.path === "runtime/runtime-log.d.mts")!.content).toContain("createRuntimeLogger");
    expect(files.find((file) => file.path === "src/framecraftGateway.ts")!.content).toContain('from "../runtime/connection-diagnostics.mjs"');
    expect(files.find((file) => file.path === "src/framecraftGateway.ts")!.content).not.toContain("../../runtime/");
    expect(files.find((file) => file.path === ".gitignore")!.content).toContain(".framecraft-runtime/");
    expect(files.find((file) => file.path === ".gitignore")!.content).toContain("*.key");
    expect(files.find((file) => file.path === "src/App.tsx")!.content).toContain("Guida rapida e posizione dei log");
    expect(files.find((file) => file.path === "src/framecraftHmiRuntime.ts")!.content).toContain("timeoutMs: gatewayConfig.timeoutMs");
    expect(JSON.parse(files.find((file) => file.path === "framecraft.runtime.json")!.content).gateway).toMatchObject({ enabled: false });
    expect(files.find((file) => file.path === "vite.config.ts")!.content).toContain("framecraftGatewayProxy");
    expect(JSON.parse(files.find((file) => file.path === "framecraft.faceplates.json")!.content)).toMatchObject({
      version: 1,
      types: [
        { id: "pack", name: "Pack", version: "0.0.8", status: "released", visualization: [{ id: "Body" }, { id: "Group" }] },
        { id: "slider-v1", name: "Slider V1", version: "0.0.28", status: "released", visualization: [{ id: "Track" }, { id: "Value" }, { id: "Readout" }] },
        { id: "slider-v2", name: "Slider V2", version: "0.0.5", status: "released", visualization: [{ id: "Track" }, { id: "Value" }, { id: "Readout" }] },
      ],
    });
    const scriptRuntime = files.find((file) => file.path === "src/framecraftScriptRuntime.ts")!.content;
    const hmiFlashing = files.find((file) => file.path === "src/framecraftHmiFlashing.ts")!.content;
    const scriptModules = files.find((file) => file.path === "src/framecraftScriptModules.ts")!.content;
    const hmiSchedule = files.find((file) => file.path === "src/framecraftHmiSchedule.ts")!.content;
    const hmiTimers = files.find((file) => file.path === "src/framecraftHmiTimers.ts")!.content;
    const hmiFaceplateVisuals = files.find((file) => file.path === "src/framecraftHmiFaceplateVisuals.ts")!.content;
    const hmiTrend = files.find((file) => file.path === "src/framecraftHmiTrend.ts")!.content;
    const hmiFunctionTrend = files.find((file) => file.path === "src/framecraftHmiFunctionTrend.ts")!.content;
    const hmiDataLogs = files.find((file) => file.path === "src/framecraftHmiDataLogs.ts")!.content;
    const hmiRuntime = files.find((file) => file.path === "src/framecraftHmiRuntime.ts")!.content;
    expect(() => parse(scriptRuntime, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiFlashing, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(scriptModules, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiSchedule, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiTimers, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiFaceplateVisuals, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiTrend, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiFunctionTrend, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiDataLogs, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(() => parse(hmiRuntime, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
    expect(scriptRuntime).not.toMatch(/\beval\s*\(/);
    expect(hmiRuntime).toContain('querySelectorAll("[data-hmi-dynamizations]")');
    expect(hmiRuntime).toContain("__framecraftEditorPreview");
    expect(hmiRuntime).toContain("createHmiScriptContextManager");
    expect(hmiRuntime).toContain('scriptContexts.options(scriptCatalog, window.location.pathname, "dynamizations")');
    expect(hmiRuntime).toContain('scriptContexts.options(scriptCatalog, undefined, "scheduler")');
    expect(hmiRuntime).toContain("inspectHmiScriptProgram");
    expect(hmiRuntime).toContain("createHmiTimerManager");
    expect(hmiRuntime).toContain("nextHmiCalendarDue");
    expect(hmiRuntime).toContain("notifyRuntimeAlarm");
    expect(hmiRuntime).toContain("resolveHmiFlashing");
    expect(hmiRuntime).toContain("hmiFlashingInlineStyle");
    expect(hmiRuntime).toContain("renderHmiFaceplates");
    expect(hmiRuntime).toContain("renderHmiTrendControls");
    expect(hmiRuntime).toContain("createHmiDataLogRuntime");
    expect(hmiRuntime).toContain("requestRuntimeDataLog");
    expect(hmiFaceplateVisuals).toContain("data-hmi-faceplate-visual-root");
    expect(hmiTrend).toContain("data-hmi-trend-root");
    expect(hmiFlashing).toContain("prefers-reduced-motion: reduce");
    expect(hmiFlashing).toContain("framecraft-hmi-flash-background");
    expect(files.find((file) => file.path === "src/App.tsx")!.content).toContain("installFramecraftHmiRuntime");
    expect(files.find((file) => file.path === "src/App.tsx")!.content).toContain('screenRoutes[target.match(/^\\d{4,5}/)?.[0] ?? ""]');
    expect(files.find((file) => file.path === "src/App.tsx")!.content).toContain("__framecraftSetPage");

    const manifest = parsePanelManifest(files.find((file) => file.path === "panel.json")!.content)!;
    expect(manifest.pages.map((page) => page.pageNumber)).toEqual([
      1001, 1002, 1041, 1042, 1081, 1121, 1161, 1201, 1241,
      2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
      2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055,
      2056, 2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067, 2068, 2069, 2070,
      2071, 2072, 2073, 2074, 2075, 2076, 2077,
      2081, 2121, 2161, 2201, 2202, 2203, 2241,
      3001, 3041, 3081, 3121,
      4001, 4041, 4081,
      5001, 5041, 5081, 5121, 5161, 5201, 5241,
      6001, 6041, 6081, 6121, 6161, 6201, 6241,
      7001, 7041, 7081,
    ]);
    expect(standardProjectPageCount(standardProjectSectionChoices.map((section) => section.id))).toBe(87);
  });

  it("riproduce il guscio dello standard, non una barra inventata", () => {
    const files = standardProjectFiles({
      machineName: "Linea palletizzazione 1",
      layout: "desktop-mobile",
      sections: standardProjectSectionChoices.map((section) => section.id),
    });
    const app = files.find((file) => file.path === "src/App.tsx")!.content;
    expect(app).toContain('import resourceCatalogJson from "../framecraft.resources.json"');
    expect(app).toContain('const resourceCatalog = resourceCatalogJson as RuntimeResourceCatalog');
    expect(app).toContain('window.addEventListener("framecraft:set-language"');
    expect(app).toContain('document.querySelectorAll("[data-hmi-text]")');
    const styles = files.find((file) => file.path === "src/styles.css")!.content;

    // Le schede della barra alta: primo allarme, collegamento PLC, utente, linea, OMAC, velocita'.
    for (const marker of ["First Fault", "PLC Connection", "User LogIn", "Format Running", "OMAC", "Speed"]) {
      expect(app, marker).toContain(marker);
    }
    // Le sette voci laterali, con il nome dello standard.
    for (const section of sections) expect(app).toContain(`label: "${section.label}"`);

    // Le misure rilevate: barra alta 151, laterale 80x649, finestra della pagina 1200x649 ridotta.
    expect(styles).toContain("height: 151px");
    expect(styles).toContain("width: 80px; height: 649px");
    expect(styles).toContain("width: 1200px; height: 649px");
    expect(styles).toContain(`transform: scale(${(1200 / pageCanvas.width).toFixed(4)})`);
    // La tessera prende il colore della sezione e sbiadisce quando non e' la pagina aperta.
    expect(styles).toContain(`linear-gradient(180deg, ${cssColor(sections[0].color.top)} 0%, ${cssColor(sections[0].color.bottom)} 100%)`);
    expect(styles).toContain(`opacity: ${lateralBar.inactiveOpacity}`);
    // Il layout mobile: barra compatta, navigatore a linguette, pagina a grandezza naturale.
    expect(styles).toContain(".hmi-shell.mobile .hmi-screen { left: 0; top: 105px;");
    expect(styles).toContain(".hmi-shell.mobile .hmi-screen .hmi-page { transform: none; }");
  });

  it("apre ogni sezione sulla sua pagina vera", () => {
    const files = standardProjectFiles({
      machineName: "Linea",
      layout: "desktop",
      sections: standardProjectSectionChoices.map((section) => section.id),
    });
    const titles = standardProjectSectionChoices.map((section) => section.pageTitle);
    expect(titles).toEqual(["Upstair", "Program Modification", "Alarm", "Statistics", "Manual General", "Synoptic", "Formats"]);
    for (const section of standardProjectSectionChoices) {
      const page = files.find((file) => file.path === `src/pages/${section.componentName}.tsx`)!.content;
      expect(page, section.id).toContain(section.pageTitle);
    }
  });

  it("genera JSX valido e pagine che il pannello Pagine riconosce", () => {
    const root = "C:/generated/panel";
    const files = standardProjectFiles({ machineName: "HMI", layout: "desktop", sections: ["main", "alarms", "diagnostic"] });
    const sources: Record<string, string> = {};
    for (const file of files.filter((item) => /\.(tsx|jsx)$/.test(item.path))) {
      expect(() => parse(file.content, { sourceType: "module", plugins: ["jsx", "typescript"] }), file.path).not.toThrow();
      sources[`${root}/${file.path}`] = file.content;
    }
    const detected = detectPages(sources);
    expect(detected.routerEditable).toBe(true);
    expect(detected.pages.map((page) => page.route)).toEqual([
      "/", "/alarms", "/alarms/by-zone", "/alarms/history", "/alarms/media",
      "/collector-counters", "/counters", "/counters-robot",
      "/diagnostic", "/diagnostic/by-device", "/diagnostic/by-zone", "/diagnostic/free",
      "/diagnostic/preventive-maintenance", "/diagnostic/profinet", "/diagnostic/robot",
      "/downstair", "/free", "/maintenance", "/packml", "/special-function",
    ]);
  });

  it("apre il sottomenu della sezione, come fa il pannello vero", () => {
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: ["main", "alarms"] });
    const app = files.find((file) => file.path === "src/App.tsx")!.content;
    const styles = files.find((file) => file.path === "src/styles.css")!.content;

    // L'icona non naviga: apre le sette voci del menu Main, e sono le voci a cambiare pagina.
    for (const entry of ["Machine View", "Counter Machine", "Special Function", "Collector Counters", "Free", "PackML", "Maintenance"]) {
      expect(app, entry).toContain(`label: "${entry}"`);
    }
    expect(app).toContain('entries.length > 1');
    expect(app).toContain("setOpenMenu");
    expect(app).toContain('route: "/packml"');
    const special = files.find((file) => file.path === "src/pages/SpecialFunctionPage.tsx")!.content;
    expect(special.match(/data-framecraft-slot="special-function-row"/g)).toHaveLength(7);
    expect(special).toContain('data-framecraft-next="add-machine-zones"');
    expect(special).not.toContain("M3031");
    expect(special).not.toContain('data-hmi-type="HmiPolygon"');
    // Il pannello del sottomenu sta dove lo mette lo standard: 210 di larghezza a x=131.
    const placement = submenuPlacement(0, 7);
    expect(placement.panel.left).toBe(submenuPanel.panel.left);
    expect(placement.panel.width).toBe(submenuPanel.panel.width);
    expect(app).toContain(`menu: { panel: { left: ${placement.panel.left}, top: ${placement.panel.top}`);
    expect(styles).toContain(".hmi-submenu-panel");
    expect(styles).toContain(".hmi-submenu-pointer");

    // Anche la sezione accanto ha il suo menu: l'icona non salta piu' dritta alla pagina.
    expect(app).toContain('{ id: "alarms", label: "Alarms", route: "/alarms"');
    expect(app).toContain('label: "Alarms By Zone"');
  });

  it("apre i menu delle altre cinque sezioni, con le voci riservate al loro posto", () => {
    const files = standardProjectFiles({
      machineName: "Linea",
      layout: "desktop",
      sections: ["alarms", "statistics", "manuals", "diagnostic", "formats"],
    });
    const app = files.find((file) => file.path === "src/App.tsx")!.content;
    const pages = files.filter((file) => file.path.startsWith("src/pages/")).map((file) => file.path);

    // Le voci sono quelle delle foto dei `Nxxxx_<Sezione>_Template`.
    const menus = [
      ["Alarms", "Alarms By Zone", "History", "Media Mngmnt"],
      ["Statistics", "Production", "Availability"],
      ["General", "Infeed", "Preforming", "Layer Pusher", "Lifter", "Tie Sheet", "Pallet Conveyor"],
      ["Synoptic", "Robot", "Diagnostic Zone", "Diagnostic Device", "Prev. Maintenance", "Profinet"],
      ["Format Selection", "Formats Copy", "Pallet Store Select"],
    ];
    for (const entry of menus.flat()) expect(app, entry).toContain(`label: "${entry}"`);

    // Le "Free" senza schermata restano nel menu senza rotta, e il pulsante non porta da nessuna
    // parte: sono i posti che lo standard tiene liberi.
    expect(app).toContain('{ label: "Free", icon: "chat", route: "" }');
    expect(app).toContain("disabled={!entry.route}");

    // Manuals e' l'unica sezione con otto voci: il pannello si allunga e resta dentro lo schermo.
    const manuals = submenuPlacement(4, 8);
    const alarms = submenuPlacement(2, 7);
    expect(manuals.panel.height).toBeGreaterThan(alarms.panel.height);
    expect(manuals.panel.top + manuals.panel.height).toBeLessThanOrEqual(panelSize.height);

    // Le sei stazioni manuali e le sette pagine della Diagnostic ci sono davvero.
    expect(pages).toContain("src/pages/ManualPalletConveyorPage.tsx");
    expect(pages).toContain("src/pages/DiagnosticByDevicePage.tsx");
    expect(pages).toContain("src/pages/PalletStorePage.tsx");
    expect(pages).toHaveLength(24);
  });

  it("inserisce nella pipeline i sette template Diagnostic reali", () => {
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop-mobile", sections: ["diagnostic"] });
    const page = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;

    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(7);
    expect(page("DiagnosticPage")).toContain("base 6001_Synoptic");
    expect(page("DiagnosticPage")).toContain('data-framecraft-slot="machine-part-screen"');
    expect(page("DiagnosticPage")).not.toContain('data-hmi-popup-faceplate="Tracking_V_0_0_8"');
    expect(page("DiagnosticRobotPage")).toContain("base 6041_Robot");
    expect(page("DiagnosticByZonePage")).toContain("base 6081_Diagnostic_By_Zone");
    expect(page("DiagnosticByZonePage").match(/openPage\("\/diagnostic\/by-device"\)/g)).toHaveLength(3);
    expect(page("DiagnosticByDevicePage")).toContain("base 6121_Diagnostic_By_Device");
    expect(page("DiagnosticByDevicePage")).toContain('data-framecraft-next="add-machine-callouts"');
    expect(page("DiagnosticByDevicePage")).not.toContain('data-hmi-popup-screen="9002_Popup_Diag_By_Device"');
    expect(page("PreventiveMaintenancePage")).toContain("base 6161_Preventive_Maintenance");
    expect(page("ProfinetPage")).toContain("base 6201_Profinet");
    expect(page("DiagnosticFreePage")).toContain("base 6241");

    for (const name of ["DiagnosticRobotPage", "PreventiveMaintenancePage", "ProfinetPage", "DiagnosticFreePage"]) {
      expect(page(name), name).not.toContain('data-hmi-type="HmiGraphicView"');
      expect(page(name), name).not.toContain('background: "#FFFFFF"');
    }
  });

  it("mette la foto della macchina dove va, e solo li'", () => {
    const source = "C:/foto/Linea Palletizzazione.PNG";
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: ["main", "statistics"], machineImage: source });

    // La foto entra nel progetto come file copiato, non come testo.
    const asset = files.find((file) => file.source);
    expect(asset?.path).toBe("public/framecraft-assets/linea-palletizzazione.png");
    expect(asset?.source).toBe(source);

    const upstair = files.find((file) => file.path === "src/pages/UpstairPage.tsx")!.content;
    const downstair = files.find((file) => file.path === "src/pages/DownstairPage.tsx")!.content;
    const statistics = files.find((file) => file.path === "src/pages/StatisticsPage.tsx")!.content;
    expect(upstair).toContain('data-image-role="machine" src="/framecraft-assets/linea-palletizzazione.png"');
    expect(statistics).toContain('data-image-role="machine" src="/framecraft-assets/linea-palletizzazione.png"');
    expect(downstair).not.toContain("/framecraft-assets/linea-palletizzazione.png");
    expect(downstair).not.toContain('data-hmi-type="HmiGraphicView"');
    // La figura dell'operatore e' un pezzo, non la macchina: resta segnaposto.
    expect(upstair).toContain('data-image-role="detail" src="/placeholder.svg"');

    // Senza foto il progetto nasce come prima, tutto segnaposto.
    const plain = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: ["main"] });
    expect(plain.some((file) => file.source)).toBe(false);
    expect(plain.find((file) => file.path === "src/pages/UpstairPage.tsx")!.content).toContain('data-image-role="machine" src="/placeholder.svg"');
  });

  it("mantiene vuote le cinque pagine Main che sono vuote nell'export", () => {
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop-mobile", sections: ["main"] });
    const page = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;

    expect(page("DownstairPage")).toContain("base 1002_Downstair");
    expect(page("DownstairPage")).toContain('data-hmi-swipe-down="1001_Upstair"');
    expect(page("CountersPage")).toContain('data-hmi-swipe-right="1001_Upstair"');
    expect(page("CountersPage")).toContain('data-hmi-swipe-left="1081_Special"');
    expect(page("CollectorCountersPage")).toContain('data-hmi-swipe-right="1081_Special"');
    expect(page("CollectorCountersPage")).toContain('data-hmi-swipe-left="1201_Omac"');
    expect(page("FreePage")).toContain('data-hmi-swipe-right="1041_Counters"');
    expect(page("FreePage")).toContain('data-hmi-swipe-left="1201_Omac"');
    expect(page("MaintenancePage")).toContain('data-hmi-swipe-right="1201_Omac"');
    for (const name of ["DownstairPage", "CountersPage", "CollectorCountersPage", "FreePage", "MaintenancePage"]) {
      expect(page(name), name).not.toContain('data-hmi-type="HmiGraphicView"');
      expect(page(name), name).not.toContain('background: "#FFFFFF"');
    }
  });

  it("apre il menu Settings sulle sue sette voci, senza uscire dallo schermo", () => {
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: ["settings"] });
    const app = files.find((file) => file.path === "src/App.tsx")!.content;
    const pages = files.filter((file) => file.path.startsWith("src/pages/")).map((file) => file.path);

    for (const entry of ["Program Settings", "Encoders", "Motor Speed", "Robot Function", "Lubrication", "Infeed Guide", "System Function"]) {
      expect(app, entry).toContain(`label: "${entry}"`);
    }
    const robotFunction = files.find((file) => file.path === "src/pages/RobotFunctionPage.tsx")!.content;
    expect(robotFunction.match(/data-framecraft-next="configure-command"/g)).toHaveLength(4);
    expect(robotFunction).toContain('data-hmi-graphic-options="Fanuc,Manipolatore,Kuka,IRB_5720_9"');
    const lubrication = files.find((file) => file.path === "src/pages/LubricationPage.tsx")!.content;
    expect(lubrication).toContain('data-plc-variable="DB_Lubrication_TEST_Cmd" data-plc-write="set-bit-0-on-down-reset-on-up"');
    expect(lubrication).toContain('data-plc-variable="DB_Lubrication_SET_CyclesNumber"');
    expect(lubrication).toContain('data-framecraft-slot="machine-part-screen"');
    const motorSpeed = files.find((file) => file.path === "src/pages/MotorSpeedPage.tsx")!.content;
    expect(motorSpeed).toContain('data-hmi-graphic="Motor_Speed"');
    expect(motorSpeed).toContain('data-framecraft-next="add-machine-callouts"');
    expect(motorSpeed).not.toContain('data-hmi-type="HmiLine"');
    expect(motorSpeed).not.toMatch(/>M\d{4}</);
    // Le voci con piu' linguette portano tutte le loro pagine: le dieci di Program Settings, le due
    // di ognuno dei diciotto encoder, le tre dell'Infeed Guide.
    expect(pages).toContain("src/pages/InfeedMotorPage.tsx");
    const guide = files.find((file) => file.path === "src/pages/InfeedGuidePage.tsx")!.content;
    expect(guide.match(/data-hmi-action="select-guide-motor"/g)).toHaveLength(14);
    expect(guide.match(/data-framecraft-slot="machine-part-screen"/g)).toHaveLength(2);
    expect(guide).toContain('data-plc-variable="MMC_Guide.InUse" data-plc-write="invert-bit-0"');
    const motorBox = files.find((file) => file.path === "src/pages/InfeedMotorBoxPage.tsx")!.content;
    expect(motorBox).toContain('data-hmi-graphic="Ciabatta Infeed Guide"');
    expect(motorBox.match(/data-hmi-action="select-mmc-motor"/g)).toHaveLength(8);
    expect(motorBox).toContain('data-hmi-swipe-up="2203_MMC_Motor"');
    const motor = files.find((file) => file.path === "src/pages/InfeedMotorPage.tsx")!.content;
    expect(motor).toContain('data-framecraft-slot="machine-part-screen"');
    expect(motor).toContain('data-plc-variable="MMC_HMI_Motor.Command.TargetPosition"');
    expect(motor).toContain('data-plc-variable="MMC_HMI_Motor.Status.RunningForward"');
    expect(pages).toContain("src/pages/EncoderLifter2Page.tsx");
    expect(pages).toContain("src/pages/EncoderPadStoreBackGuide2Page.tsx");
    expect(pages).toContain("src/pages/ProgramSquaring2Page.tsx");
    expect(pages).toHaveLength(54);
    const system = files.find((file) => file.path === "src/pages/SystemFunctionPage.tsx")!.content;
    expect(system).toContain('data-hmi-language-code="1033"');
    expect(system).toContain('data-hmi-action="stop-runtime"');
    expect(system).toContain('data-hmi-action="import-user-administration"');

    // Il pannello scende con l'icona della sezione ma resta dentro il pannello: l'ultima sezione lo
    // tiene appoggiato al fondo, come nel `7xxxx_Formats_Template` dell'export.
    const settings = submenuPlacement(1, 7);
    const formats = submenuPlacement(6, 7);
    expect(settings.panel.top).toBeGreaterThan(desktopShell.content.top);
    expect(settings.panel.top).toBeLessThan(formats.panel.top);
    expect(formats.panel.top + formats.panel.height).toBeLessThanOrEqual(panelSize.height - 8);
    expect(settings.pointer.top).toBeGreaterThan(settings.panel.top);
  });

  it("genera una sola sessione Program Modification usando numeri e tag dei JSON reali", () => {
    const cases = [
      { id: "robot" as const, count: 54, numbers: [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010] },
      { id: "classic" as const, count: 54, numbers: [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030] },
      { id: "nemo" as const, count: 47, numbers: [2001, 2002, 2003] },
      { id: "sweep" as const, count: 46, numbers: [2001, 2002] },
      { id: "pouches" as const, count: 47, numbers: [2001, 2002, 2003] },
    ];

    for (const item of cases) {
      const files = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: ["settings"], settingsProgram: item.id });
      const pageFiles = files.filter((file) => file.path.startsWith("src/pages/"));
      const manifestJson = JSON.parse(files.find((file) => file.path === "panel.json")!.content);
      const numbers = manifestJson.editor.pages.map((page: { pageNumber: number }) => page.pageNumber);
      expect(pageFiles, item.id).toHaveLength(item.count);
      expect(numbers.slice(0, item.numbers.length), item.id).toEqual(item.numbers);
      expect(new Set(numbers).size, item.id).toBe(numbers.length);
      expect(manifestJson.standard.settingsProgram).toBe(item.id);
      expect(standardProjectPageCount(["settings"], item.id)).toBe(item.count);
    }

    const classic = standardProjectFiles({ machineName: "Classic", layout: "desktop", sections: ["settings"], settingsProgram: "classic" });
    const classicLayer = classic.find((file) => file.path === "src/pages/Classic2Page.tsx")!.content;
    expect(classicLayer).toContain("base 2022_Classic_Program_Modification_2");
    expect(classicLayer).toContain('data-plc-variable="ProgModN.PV.Prog_In_Mod.Timer_Spacer[1]"');
    expect(classicLayer).toContain('openPage("/settings/program/classic/3")');

    const nemo = standardProjectFiles({ machineName: "Nemo", layout: "desktop", sections: ["settings"], settingsProgram: "nemo" });
    const nemoProduct = nemo.find((file) => file.path === "src/pages/Nemo1Page.tsx")!.content;
    expect(nemoProduct).toContain("base 2011_Robot_Program_Modification_1");
    expect(nemoProduct).toContain('data-plc-variable="ProgMod_Cans[1].Prog_In_Mod_N"');

    const sweep = standardProjectFiles({ machineName: "Sweep", layout: "desktop", sections: ["settings"], settingsProgram: "sweep" });
    expect(sweep.find((file) => file.path === "src/pages/Sweep2Page.tsx")!.content).toContain("base 2022_Robot_Program_Modification_2");

    const pouches = standardProjectFiles({ machineName: "Pouches", layout: "desktop", sections: ["settings"], settingsProgram: "pouches" });
    expect(pouches.find((file) => file.path === "src/pages/Pouches3Page.tsx")!.content).toContain("base 2033_Robot_Program_Modification_3");
  });

  it("le linguette numerate portano alle pagine sorelle, e la 2002 muove i pacchi davvero", () => {
    const files = standardProjectFiles({ machineName: "Linea", layout: "desktop", sections: ["settings", "main"] });
    const source = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;

    // Nell'export ogni linguetta ha lo script `ChangeScreen`: qui apre la pagina sorella. La prima
    // linguetta della 2001 e' quella aperta, quindi non porta a se stessa.
    const settings = source("SettingsPage");
    expect(settings).toContain('onClick={() => openPage("/settings/program/layer")}');
    expect(settings).toContain('onClick={() => openPage("/settings/program/dimension")}');
    expect(settings).not.toContain('openPage("/settings")');
    // E la seconda pagina riporta alla prima.
    expect(source("ProgramLayerPage")).toContain('onClick={() => openPage("/settings")}');
    // Anche le due dell'ultimo encoder si scambiano il posto.
    expect(source("EncoderPadStoreBackGuidePage")).toContain('openPage("/settings/encoders/pad-store-back-guide-2")');
    // La 1042 ha dieci linguette e una schermata sola: quelle restano ferme, com'erano.
    expect(source("RobotPopupPage")).not.toContain("openPage(");

    // La 2002: i quattro pulsanti a passo scrivono i tag dell'export, e i trenta pacchi ci sono
    // tutti, ognuno con il legame ai suoi PatternDisplay_Pack.
    const layer = source("ProgramLayerPage");
    expect(layer).toContain('import { useState } from "react";');
    expect(layer).toContain('data-plc-variable="ProgModR.PV.DATA_DistanceBeetweenPack" data-plc-write="increase" data-plc-step="10"');
    expect(layer).toContain('data-plc-variable="ProgModR.PV.DATA_GroupInfo.Doser.Line_1" data-plc-write="invert"');
    expect(layer).toContain('data-plc-variable="ProgModR.PV.Save_Program" data-plc-write="set"');
    expect(layer).toContain('aria-label="Pack 30"');
    expect(layer.match(/aria-label="Pack \d+"/g)).toHaveLength(30);
    expect(layer).toContain('"tag":"ProgModR.PV.PatternDisplay_Pack[7].Pos_Y"');
    expect(layer).toContain('data-hmi-faceplate=\'{"typeId":"pack","version":"0.0.8"');
    expect(layer).toContain('"Group_Selected":"ProgModR.PV.GroupN"');
    expect(layer).toContain("style={{ ...pack(29)");
  });

  it("genera soltanto le sezioni scelte e collega il manifesto alla route rilevata", () => {
    const files = standardProjectFiles({ machineName: "Solo allarmi", layout: "desktop", sections: ["alarms"] });
    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(4);
    const app = files.find((file) => file.path === "src/App.tsx")!.content;
    expect(app).toContain("AlarmsPage");
    expect(app).not.toContain("SettingsPage");
    expect(app).not.toContain("layout-switch");
    const manifest = parsePanelManifest(files.find((file) => file.path === "panel.json")!.content)!;
    expect(manifestPage(manifest, "C:/copy/src/App.tsx:/alarms")?.section).toBe("alarms");

    const page = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;
    expect(page("AlarmsPage")).toContain('data-hmi-selection-tags="AlarmTextTroubleshooting,AlarmID"');
    expect(page("AlarmsPage")).toContain('data-plc-variable="Start_Copy" data-plc-write="set"');
    expect(page("AlarmsByZonePage")).toContain('data-hmi-filter="AlarmClassName = \'Alarm_CTH\'"');
    expect(page("AlarmsHistoryPage")).toContain('data-hmi-action="clear-alarm-log"');
    expect(page("AlarmsHistoryPage")).toContain('data-hmi-alarm-log="Alarm_History_Log"');
    expect(page("MediaManagementPage")).toContain('data-hmi-type="HmiWebControl"');
    expect(page("MediaManagementPage")).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/filebrowser"');
  });

  it("inserisce le tre Statistics reali nel nuovo pannello standard", () => {
    const files = standardProjectFiles({ machineName: "Solo statistiche", layout: "desktop-mobile", sections: ["statistics"] });
    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(3);
    const page = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;

    expect(page("StatisticsPage")).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/statisticbase"');
    expect(page("StatisticsPage")).toContain('data-plc-variable="Alarms_Trigger[65]"');
    expect(page("ProductionPage")).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/pageN"');
    expect(page("AvailabilityPage")).toContain('data-hmi-url="https://10.14.1.228:1880/dashboard/Availabilty"');
    expect(page("ProductionPage")).not.toContain("Contenuto caricato dal controllo a runtime");
  });

  it("inserisce nella pipeline le sette pagine Manuals distinte", () => {
    const files = standardProjectFiles({ machineName: "Solo manuali", layout: "desktop-mobile", sections: ["manuals"] });
    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(7);
    const page = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;

    expect(page("ManualsPage")).toContain('data-hmi-graphic="Manual_TopView"');
    for (const name of ["ManualInfeedPage", "ManualPreformingPage", "ManualLayerPusherPage", "ManualLifterPage", "ManualTieSheetPage", "ManualPalletConveyorPage"]) {
      expect(page(name), name).toContain('data-framecraft-slot="machine-part-screen"');
      expect(page(name), name).toContain('data-framecraft-next="add-machine-callouts"');
      expect(page(name), name).not.toContain('data-hmi-action="select-manual"');
      expect(page(name), name).not.toMatch(/>M\d{4}</);
    }
  });

  it("inserisce nella pipeline i tre template Formats con i tag reali", () => {
    const files = standardProjectFiles({ machineName: "Solo formati", layout: "desktop-mobile", sections: ["formats"] });
    const page = (name: string) => files.find((file) => file.path === `src/pages/${name}.tsx`)!.content;

    expect(files.filter((file) => file.path.startsWith("src/pages/"))).toHaveLength(3);
    expect(page("FormatsPage")).toContain('data-hmi-action="select-format"');
    expect(page("FormatsPage")).toContain('data-plc-variable="Confirm_Change_Pressed"');
    expect(page("FormatCopyPage")).toContain('data-plc-variable="Program_Copy_Source"');
    expect(page("FormatCopyPage")).toContain('data-plc-variable="Program_Copy_Destination"');
    expect(page("FormatCopyPage")).toContain('data-plc-variable="Program_Copy_Start_Copy"');
    expect(page("PalletStorePage")).toContain('data-plc-variable="Pallet_Type_Store_N1"');
    expect(page("PalletStorePage")).toContain('data-plc-variable="Pallet_Type_Store_N2"');
  });

  it("mantiene valido il JSX anche con un nome macchina contenente parentesi graffe", () => {
    const app = standardProjectFiles({ machineName: "Linea {A} <test>", layout: "desktop", sections: ["main"] })
      .find((file) => file.path === "src/App.tsx")!.content;
    expect(() => parse(app, { sourceType: "module", plugins: ["jsx", "typescript"] })).not.toThrow();
    expect(app).toContain('{"Linea {A} test"}');
  });
});
