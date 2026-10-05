/** Renderizza il pannello che genera il flusso "crea pannello standard", per guardarlo.
 *
 * Fa esattamente quello che fa l'editor quando crei un progetto nuovo: chiama `standardProjectFiles`,
 * scrive i file in `.hmi-preview/panel/` e poi monta `src/App.tsx` nel browser. Serve a confrontare
 * il guscio generato con le foto in `FotoStandardManu` (barra alta 151, tessere laterali, sottomenu
 * della sezione, finestra della pagina a 1200x649) invece di fidarsi del codice.
 *
 *   node scripts/hmi-panel-preview.mjs             genera, impacchetta e apre il server su :4174
 *   node scripts/hmi-panel-preview.mjs --no-serve  genera e impacchetta soltanto
 *
 * Il pannello e' vivo: si clicca la sezione, si apre il suo sottomenu e le voci cambiano pagina.
 * `react-router-dom` e' una dipendenza del pannello generato, non dell'editor: qui lo sostituisce un
 * router finto di venti righe, che tiene il percorso in uno stato React. */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".hmi-preview");
const panelDir = path.join(out, "panel");
const modules = path.join(root, "node_modules");

const esbuild = await import(pathToFileURL(path.join(modules, "esbuild/lib/main.js")).href);
const serve = !process.argv.includes("--no-serve");
// `--image=<percorso>` prova il pannello con la foto della macchina, come quando la scegli nel
// flusso "crea pannello standard".
const machineImage = process.argv.find((argument) => argument.startsWith("--image="))?.slice("--image=".length);
mkdirSync(panelDir, { recursive: true });

// 1. i file del progetto, generati dalle stesse funzioni dell'editor
const bundle = path.join(out, "standardProject.mjs");
await esbuild.build({
  entryPoints: [path.join(root, "src/core/standardProject.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "warning",
});
const { standardProjectFiles, standardProjectSectionChoices } = await import(pathToFileURL(bundle).href);

const files = standardProjectFiles({
  machineName: "Linea Demo",
  layout: "desktop-mobile",
  sections: standardProjectSectionChoices.map((section) => section.id),
  machineImage,
});
for (const file of files) {
  const target = path.join(panelDir, file.path);
  mkdirSync(path.dirname(target), { recursive: true });
  // I file con `source` sono immagini: si copiano, non si scrivono.
  if (file.source) copyFileSync(file.source, target);
  else writeFileSync(target, file.content, "utf8");
}
console.log("scritti", files.length, "file in", path.relative(root, panelDir));

// 2. il router finto: il percorso sta in uno stato, cosi' le voci del sottomenu navigano davvero
const routerStub = `
import React from "react";
const RouterContext = React.createContext(["/", () => {}]);
export function RouterProvider({ children }) {
  const state = React.useState("/");
  // Le pagine che aprono un'altra pagina col doppio click usano history.pushState piu' popstate,
  // come farebbero con il router vero: qui il finto router lo ascolta allo stesso modo.
  React.useEffect(() => {
    const follow = () => state[1](window.location.pathname);
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);
  return React.createElement(RouterContext.Provider, { value: state }, children);
}
export function useLocation() { return { pathname: React.useContext(RouterContext)[0] }; }
export function useNavigate() { const set = React.useContext(RouterContext)[1]; return (to) => set(to); }
export function Routes({ children }) {
  const pathname = React.useContext(RouterContext)[0];
  const routes = React.Children.toArray(children);
  const match = routes.find((route) => route.props.path === pathname) ?? routes.find((route) => route.props.path === "*");
  return match ? match.props.element : null;
}
export function Route() { return null; }
export function Navigate({ to }) {
  const set = React.useContext(RouterContext)[1];
  React.useEffect(() => set(to), [to]);
  return null;
}
export function NavLink({ to, className, children, end, ...rest }) {
  const [pathname, set] = React.useContext(RouterContext);
  const active = pathname === to;
  const name = typeof className === "function" ? className({ isActive: active }) : className;
  return React.createElement("a", { href: to, className: name, onClick: (event) => { event.preventDefault(); set(to); }, ...rest }, children);
}
`;

const stubPlugin = {
  name: "router-stub",
  setup(build) {
    build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "router-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: routerStub, loader: "js", resolveDir: modules }));
  },
};

await esbuild.build({
  stdin: {
    contents: `import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { App } from "./panel/src/App";
createRoot(document.getElementById("root")).render(<RouterProvider><App /></RouterProvider>);`,
    resolveDir: out,
    loader: "jsx",
    sourcefile: "preview-entry.jsx",
  },
  outfile: path.join(out, "panel.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [stubPlugin],
  logLevel: "warning",
});

// 3. la pagina che lo monta, con lo stesso styles.css del progetto generato
const styles = files.find((file) => file.path === "src/styles.css").content;
writeFileSync(path.join(out, "placeholder.svg"), files.find((file) => file.path === "public/placeholder.svg").content, "utf8");
writeFileSync(path.join(out, "panel-desktop.html"), [
  '<!doctype html><meta charset="utf-8"><title>pannello generato</title>',
  "<style>" + styles + "</style>",
  '<div id="root"></div>',
  '<script src="/panel.js"></scr' + "ipt>",
].join(""), "utf8");
console.log("impacchettato panel.js e reso panel-desktop.html");

if (!serve) process.exit(0);

const types = { ".svg": "image/svg+xml", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const port = Number(process.env.PORT ?? 4174);
createServer((request, response) => {
  const name = decodeURIComponent(request.url ?? "/").replace(/^\//, "").split("?")[0] || "panel-desktop.html";
  // Le immagini stanno in `panel/public`, il resto qui: si cerca in tutti e due, per nome.
  const candidates = [path.join(out, path.basename(name)), path.join(panelDir, "public", "framecraft-assets", path.basename(name))];
  try {
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) throw new Error("non c'e'");
    const body = readFileSync(found);
    response.writeHead(200, { "content-type": types[path.extname(name)] ?? "text/html; charset=utf-8" });
    response.end(body);
  } catch {
    response.writeHead(404).end("non c'e'");
  }
}).listen(port, () => console.log("guscio su http://localhost:" + port + "/panel-desktop.html"));
