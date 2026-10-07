import { describe, expect, it } from "vitest";
import { parse } from "@babel/parser";
import { standardProjectFiles } from "../src/core/standardProject";
import { categorySection, newPageCategory, readPageCategories, withCategoryPage, withPageCategories } from "../src/core/pageNavigation";
import { collectPageNumbers, planPageNumber } from "../src/core/hmiPages";
import { isPaletteProjectComponent } from "../src/components/paletteItems";
import { pageTemplateGroups } from "../src/editor/PageTemplateIcon";
import { standardPageTemplates } from "../src/core/hmiPages";
const source = standardProjectFiles({ machineName: "Synthetic", layout: "desktop-mobile", sections: ["main", "settings"] }).find((item) => item.path === "src/App.tsx")!.content;
const categories = readPageCategories(source);
describe("categorie e catalogo pagine", () => {
  it("legge le categorie effettive del progetto generato, non tutte le sezioni globali", () => {
    expect(categories.map((item) => item.id)).toEqual(["main", "settings"]);
    expect(categories.map((item) => item.number)).toEqual([1, 2]);
  });
  it("aggiunge una categoria senza toccare pagine, handler e router esistenti", () => {
    const next = [...categories, newPageCategory(categories, "Manutenzione")];
    const changed = withPageCategories(source, next);
    expect(readPageCategories(changed)).toEqual(next);
    expect(changed).toContain("navigate(route)");
    expect(changed.includes('<Route path="/"')).toBe(true);
    expect(() => parse(changed, { sourceType: "module", plugins: ["jsx", "typescript"] })).not.toThrow();
  });
  it("non esegue né sovrascrive codice dinamico nella navigazione", () => {
    expect(() => readPageCategories('const panelSections = [danger()];')).toThrow(/dinamico/);
    expect(readPageCategories('const panelSections = loadMenu();')).toEqual([]);
    expect(() => withPageCategories('const menu = [];', [])).toThrow(/non usa/);
  });
  it("assegna numeri univoci oltre le sette sezioni e lascia 9 ai popup", () => {
    const first = newPageCategory(categories, "Manutenzione"), second = newPageCategory([...categories, first], "Ricette");
    expect(first.number).toBe(10); expect(second.number).toBe(11);
    const section = categorySection(first);
    expect(planPageNumber(first.id, [], { section })).toMatchObject({ number: 10001, slot: 0 });
    expect(planPageNumber(first.id, [10001], { section })).toMatchObject({ number: 10041, slot: 1 });
    expect(collectPageNumbers(['<section data-page-number={10001} />'])).toEqual([10001]);
  });
  it("collega la nuova pagina alla categoria e al suo menu, compresa la voce libera", () => {
    const category = newPageCategory(categories, "Manutenzione");
    const next = withCategoryPage([...categories, category], category.id, { route: "/motori", label: "Motori", slot: 0 });
    expect(next.at(-1)).toMatchObject({ route: "/motori", pages: ["/motori"], entries: [{ label: "Motori", icon: "screen", route: "/motori" }], menu: { panel: { height: 50 } } });
    expect(() => withCategoryPage(next, category.id, { route: "/altro", label: "Altro", slot: 0 })).toThrow(/occupata/);
  });
  it("rifiuta duplicati, nomi vuoti e numeri riservati", () => {
    expect(() => newPageCategory(categories, " MAIN ")).toThrow(/già/);
    expect(() => newPageCategory(categories, "")).toThrow(/nome/);
    expect(() => readPageCategories('const panelSections = [{ id: "oops", label: "O", number: 9, route: "", pages: [], entries: [], menu: null }];')).toThrow(/popup/);
  });
  it("non ripete le pagine nella palette ma conserva i componenti riusabili dello stesso file", () => {
    const item = { name: "MainPage", file: "C:\\panel\\Main.tsx" } as Parameters<typeof isPaletteProjectComponent>[0];
    const pages = [{ id: "main", route: "/", name: "Main", file: "C:/panel/Main.tsx", componentName: "MainPage" }];
    expect(isPaletteProjectComponent(item, pages)).toBe(false);
    expect(isPaletteProjectComponent({ ...item, name: "MotorCard" }, pages)).toBe(true);
    expect(isPaletteProjectComponent({ ...item, name: "MotorCard", file: "C:/panel/App.tsx" }, [{ ...pages[0], file: "C:/panel/App.tsx", componentName: undefined, stateValue: "machine" }])).toBe(true);
  });
  it("raggruppa solo le basi vuote e non perde nessuna variante vera", () => {
    const groups = pageTemplateGroups(standardPageTemplates);
    expect(groups.length).toBe(standardPageTemplates.length - 5);
    expect(groups.flatMap((group) => group.variants.map((item) => item.id)).sort()).toEqual(standardPageTemplates.map((item) => item.id).sort());
    expect(groups.filter((group) => group.variants.length > 1)).toHaveLength(1);
  });
});
