import {
  cssColor,
  menuSlotNumber,
  nextMenuSlot,
  nextPageNumber,
  pageCanvas,
  pageFrame,
  pageLoadedScript,
  pageNumberParts,
  palette,
  pagePalette,
  popupSectionNumber,
  sectionById,
  sectionByNumber,
  shellTags,
  typography,
  type StandardSection,
} from "./hmiStandard";
import {
  standardPageTemplate,
  standardPageTemplateBody,
  templateFolderTabs,
  templateImports,
  templateNeedsNavigation,
  templatePreamble,
  type StandardPageTemplateId,
} from "./hmiPageTemplates";

export { standardPageTemplates, standardPageTemplate, type StandardPageTemplate, type StandardPageTemplateId } from "./hmiPageTemplates";

/** Numerare una pagina come lo standard, dall'editor.
 *
 * Nel progetto vero il numero non è un'etichetta: è la posizione della pagina nel menu. La regola
 * (`N000 + 1 + 40k`) dice a quale sezione appartiene, quale voce del sottomenu si accende e quale
 * numero finisce in `Actual_Page_Number` e nel PLC. Sbagliarlo vuol dire una pagina che esiste ma
 * che il menu non illumina.
 *
 * Qui c'è solo il calcolo, senza niente attorno: si prova senza aprire l'editor, e serve sia alla
 * creazione di una pagina sia a chi domani vorrà rinumerare. Le misure e i colori vengono da
 * `hmiStandard`, unico posto dove stanno. */

/** L'attributo con cui il numero viaggia nel JSX. È anche come lo si ritrova rileggendo il progetto. */
export const pageNumberAttribute = "data-page-number";

const attributeNumber = /data-page-number\s*=\s*(?:\{\s*(\d{3,5})\s*\}|["'](\d{3,5})["'])/g;
const propertyNumber = /\bpageNumber\s*:\s*(\d{3,5})\b/g;

/** I numeri già usati, letti dai sorgenti del progetto. Tiene solo quelli che rispettano la regola:
 * un `pageNumber: 12` di un'altra cosa non è un numero di pagina. */
export function collectPageNumbers(sources: Iterable<string>): number[] {
  const found = new Set<number>();
  for (const source of sources) {
    for (const pattern of [attributeNumber, propertyNumber]) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
        const number = Number(match[1] ?? match[2]);
        if (pageNumberParts(number)) found.add(number);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

export interface StandardPagePlan {
  section: StandardSection;
  /** La voce di sottomenu, 0..13. */
  slot: number;
  /** La posizione dentro la voce, 0..39. */
  page: number;
  number: number;
  /** Vero se la pagina è la voce di menu stessa, e non una sua sottopagina. */
  isMenuEntry: boolean;
}

/** Il numero da dare alla prossima pagina di una sezione.
 *
 * Senza `slot` apre una **voce di menu nuova** (la prima libera): è quello che si vuole creando una
 * pagina dal pannello Pagine. Con `slot` mette invece la pagina **sotto** quella voce, che è come
 * nascono le pagine 2042, 2043… di `Encoders`. `undefined` vuol dire sezione piena: 14 voci, 40
 * pagine per voce. */
export function planPageNumber(
  sectionId: string,
  taken: Iterable<number>,
  options: { slot?: number; section?: StandardSection } = {},
): StandardPagePlan | undefined {
  const section = options.section?.id === sectionId ? options.section : sectionById(sectionId);
  if (!section) return undefined;
  const used = [...taken];

  if (options.slot === undefined) {
    const slot = nextMenuSlot(section.number, used);
    if (slot === undefined) return undefined;
    return { section, slot, page: 0, number: menuSlotNumber(section.number, slot), isMenuEntry: true };
  }

  const number = nextPageNumber(section.number, options.slot, used);
  if (number === undefined) return undefined;
  const parts = pageNumberParts(number);
  if (!parts) return undefined;
  return { section, slot: parts.slot, page: parts.page, number, isMenuEntry: parts.page === 0 };
}

/** Come si legge un numero, per dirlo all'utente senza fargli fare i conti. */
export function describePageNumber(number: number): string | undefined {
  const parts = pageNumberParts(number);
  if (!parts) return undefined;
  const name = sectionByNumber(parts.sectionNumber)?.label ?? (parts.sectionNumber === popupSectionNumber ? "Popup" : `${parts.sectionNumber}`);
  return parts.page === 0
    ? `sezione ${parts.sectionNumber} ${name}, voce di menu ${parts.slot + 1}`
    : `sezione ${parts.sectionNumber} ${name}, voce di menu ${parts.slot + 1} (${parts.menuNumber}), pagina ${parts.page + 1}`;
}

export interface StandardPageSourceOptions {
  componentName: string;
  /** Il titolo che si legge nell'intestazione. */
  title: string;
  plan: StandardPagePlan;
  templateId?: StandardPageTemplateId;
  /** Quale linguetta e' aperta: la 1002 Downstair e' la seconda della sua voce. */
  folderTab?: number;
  /** Dove portano le linguette: sono le pagine sorelle, una per linguetta, nell'ordine. Vuoto vuol
   * dire linguette che restano ferme, come nella 1042 che ne ha dieci e una schermata sola. */
  folderRoutes?: readonly string[];
}

/** Il sorgente di una pagina nuova già allo standard: tela 1280x694, cornice, intestazione, e il
 * numero attaccato all'elemento. Le tre righe dell'`onLoaded` di WinCC restano scritte nel commento:
 * sono quelle che dovrà emettere chi genererà il progetto TIA. */
export function standardPageSource({ componentName, title, plan, templateId = "blank", folderTab = 0, folderRoutes = [] }: StandardPageSourceOptions): string {
  const { frame } = pageFrame;
  const template = standardPageTemplate(templateId);
  const body = standardPageTemplateBody(template.id, title);
  // Le linguette stanno fuori dalla cornice e prendono il colore della sezione: le pilota Folder_Vis,
  // e dove la pagina sorella esiste portano da lei, come lo `ChangeScreen` dell'export.
  const tabs = templateFolderTabs(plan.section.id, template.id, folderTab, folderRoutes);
  const navigationHelper = templateNeedsNavigation(template.id) || folderRoutes.length > 1
    ? `  function openPage(path = "/") {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

`
    : "";
  const script = pageLoadedScript(plan.number)
    .split("\n")
    .map((line) => ` *   ${line}`)
    .join("\n");

  return `/** ${title} — pagina ${plan.number} dello standard, base ${template.sourceScreen}.
 *
 * ${describePageNumber(plan.number) ?? ""}.
 * Il numero non è un'etichetta: è come il menu sa dove sei. Nella schermata WinCC corrispondente
 * l'\`onLoaded\` deve fare esattamente questo:
${script}
 */
${templateImports(template.id)}export function ${componentName}() {
${navigationHelper}${templatePreamble(template.id)}  return (
    <section
      className="hmi-page"
      ${pageNumberAttribute}={${plan.number}}
      data-hmi-tag="${shellTags.actualPageNumber}"
      style={{
        position: "relative",
        width: ${pageCanvas.width},
        height: ${pageCanvas.height},
        background: "${cssColor(pagePalette.canvas)}",
        color: "${cssColor(pagePalette.text)}",
        fontFamily: ${JSON.stringify(typography.cssFamily)},
        fontSize: ${typography.body.size},
      }}
    >
      {/* La cornice della pagina: ${frame.width}x${frame.height} a (${frame.left},${frame.top}).
          Il titolo non sta qui: ogni famiglia lo mette dove lo mette la schermata vera. */}
      <div
        style={{
          position: "absolute",
          left: ${frame.left},
          top: ${frame.top},
          width: ${frame.width},
          height: ${frame.height},
          border: "1px solid ${cssColor(pagePalette.borderStrong)}",
          borderRadius: 14,
          background: "${cssColor(pagePalette.canvas)}",
          pointerEvents: "none",
        }}
      />
${body}${tabs}    </section>
  );
}
`;
}
