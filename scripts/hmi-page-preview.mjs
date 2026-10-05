/** Renderizza le famiglie di pagina dello standard e le serve nel browser.
 *
 * Serve a una cosa sola: **guardare** il template accanto alla foto in `FotoStandardManu`, invece di
 * fidarsi del codice. Le pagine sono generate dalle stesse funzioni che usa l'editor
 * (`standardPageSource`), compilate con esbuild e rese con React, cosi' quello che si vede e'
 * esattamente quello che l'editor scrive nel progetto.
 *
 *   node scripts/hmi-page-preview.mjs                  tutte le famiglie, poi apre il server
 *   node scripts/hmi-page-preview.mjs alarms encoder-settings   solo queste
 *   node scripts/hmi-page-preview.mjs --no-serve       genera i file e basta
 *
 * L'output finisce in `.hmi-preview/`, che non entra in git. */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".hmi-preview");
const modules = path.join(root, "node_modules");

const esbuild = await import(pathToFileURL(path.join(modules, "esbuild/lib/main.js")).href);
const React = (await import(pathToFileURL(path.join(modules, "react/index.js")).href)).default;
const server = await import(pathToFileURL(path.join(modules, "react-dom/server.node.js")).href);
const renderToStaticMarkup = server.renderToStaticMarkup ?? server.default.renderToStaticMarkup;

const args = process.argv.slice(2);
const serve = !args.includes("--no-serve");
const wanted = args.filter((value) => !value.startsWith("--"));

mkdirSync(path.join(out, "preview"), { recursive: true });

// Le pagine chiedono /placeholder.svg dove va l'immagine della macchina: senza, si vedrebbe
// l'icona di immagine rotta e non si capirebbe piu' niente del confronto.
writeFileSync(path.join(out, "preview", "placeholder.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#ececec"/><rect x="12" y="12" width="776" height="476" rx="10" fill="none" stroke="#8b8b8b" stroke-width="3" stroke-dasharray="12 10"/><path d="M280 318l78-88 62 62 46-48 76 74H280z" fill="#b9b9b9"/><circle cx="360" cy="180" r="30" fill="#b9b9b9"/></svg>', "utf8");

// I moduli dell'editor sono TypeScript: esbuild li mette in un solo file che node sa importare.
const bundle = path.join(out, "hmiPages.mjs");
await esbuild.build({
  entryPoints: [path.join(root, "src/core/hmiPages.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "warning",
});
const { standardPageSource, planPageNumber, standardPageTemplates } = await import(pathToFileURL(bundle).href);

/** Il titolo che ha la schermata vera, dove la foto lo dice. */
const realTitle = {
  "machine-render": "Upstair",
  "special-function": "Machine Special Functions",
  "production-overview": "OMAC - Machine",
  "encoder-settings": "ENCODER - Lifter",
  "device-control": "Infeed Guide",
  "alarms": "Alarm",
  "alarm-history": "Alarm History",
};

const chosen = standardPageTemplates.filter((template) => wanted.length === 0 || wanted.includes(template.id));
if (chosen.length === 0) {
  console.error("nessuna famiglia con questo nome. Ci sono:", standardPageTemplates.map((template) => template.id).join(", "));
  process.exit(1);
}

for (const template of chosen) {
  const plan = planPageNumber(template.recommendedSection ?? "main", []);
  const source = standardPageSource({
    componentName: "Page",
    title: realTitle[template.id] ?? template.name,
    plan,
    templateId: template.id,
  });

  const compiled = await esbuild.transform(source, {
    // Le pagine che scrive l'editor sono .tsx: la 2002 tiene lo stato dei tag a passo e ha le sue
    // annotazioni di tipo, quindi qui va compilata come tsx e non come jsx.
    loader: "tsx",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    format: "esm",
  });
  const moduleFile = path.join(out, "preview", template.id + ".mjs");
  const reactUrl = pathToFileURL(path.join(modules, "react/index.js")).href;
  // Il modulo si importa da file, quindi anche `import { useState } from "react"` va risolto
  // a mano: la 2002 e' l'unica pagina che importa qualcosa.
  const code = compiled.code.replace(/from "react"/g, 'from "' + reactUrl + '"');
  writeFileSync(moduleFile, 'import React from "' + reactUrl + '";\n' + code, "utf8");
  const { Page } = await import(pathToFileURL(moduleFile).href);

  // La pagina sta dentro SW_Screen: 1200x649 a (80,151), con il contenuto rimpicciolito di 0.9375.
  const markup = renderToStaticMarkup(React.createElement(Page));
  const html = [
    '<!doctype html><meta charset="utf-8"><title>' + template.id + " &mdash; " + template.sourceScreen + "</title>",
    '<style>body{margin:0;background:#000;font-family:"Siemens Sans","Segoe UI",Arial,sans-serif}',
    ".panel{position:relative;width:1280px;height:800px;overflow:hidden}",
    ".screen{position:absolute;left:80px;top:151px;width:1200px;height:649px;overflow:hidden}",
    ".screen>*{transform:scale(.9375);transform-origin:0 0}</style>",
    '<div class="panel"><div class="screen">' + markup + "</div></div>",
    "<script>const fit=()=>document.body.style.zoom=Math.min(1,innerWidth/1280);fit();onresize=fit;</scr" + "ipt>",
  ].join("");
  writeFileSync(path.join(out, "preview", template.id + ".html"), html, "utf8");
  console.log("reso", template.id, "(" + template.sourceScreen + ")");
}

if (!serve) process.exit(0);

const dir = path.join(out, "preview");
const port = Number(process.env.PORT ?? 4173);
createServer((request, response) => {
  const name = decodeURIComponent(request.url ?? "/").replace(/^\//, "").split("?")[0];
  if (!name) {
    const rows = standardPageTemplates
      .filter((template) => readdirSync(dir).includes(template.id + ".html"))
      .map((template) => '<p><a href="/' + template.id + '.html">' + template.id + "</a> &mdash; " + template.sourceScreen + " (" + template.visualStatus + ")</p>");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end('<body style="font-family:sans-serif">' + rows.join(""));
    return;
  }
  try {
    const page = readFileSync(path.join(dir, path.basename(name)));
    const type = name.endsWith(".svg") ? "image/svg+xml" : "text/html; charset=utf-8";
    response.writeHead(200, { "content-type": type });
    response.end(page);
  } catch {
    response.writeHead(404).end("non c'e'");
  }
}).listen(port, () => console.log("confronto su http://localhost:" + port));
