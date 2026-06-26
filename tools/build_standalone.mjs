// build_standalone.mjs — erzeugt die doppelklickbare Einzeldatei
// download/Ausbildungsberatung-Suite.html (offline, file://, kein Server).
//
// Bündelt App + PGlite (npm-Paket) mit esbuild, bettet WASM/Daten/Extension-
// Tarballs ein, inlinet Theme + Schriften + Logo als data:-URIs.
//
// Voraussetzung: in diesem Verzeichnis erreichbares node_modules mit
//   @electric-sql/pglite (gleiche Version wie assets/vendor/pglite) und esbuild.
// Aufruf (Repo-Wurzel):  node tools/build_standalone.mjs
import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const REPO = process.cwd();
const STANDALONE = path.join(REPO, "tools", "standalone");
const PGBIN = path.join(STANDALONE, "pgbin");
const PGDIST = path.join(REPO, "node_modules", "@electric-sql", "pglite", "dist");
const OUT = path.join(REPO, "download", "Ausbildungsberatung-Suite.html");

const FONT_MIME = { ".woff2": "font/woff2", ".woff": "font/woff" };

async function dataUri(file, mime) {
  const buf = await readFile(file);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  // 1) PGlite-Binärdateien neben die Standalone-DB legen (Versionsgleichheit)
  await mkdir(PGBIN, { recursive: true });
  for (const f of ["pglite.wasm", "initdb.wasm", "pglite.data",
                   "pg_trgm.tar.gz", "unaccent.tar.gz", "fuzzystrmatch.tar.gz"]) {
    await copyFile(path.join(PGDIST, f), path.join(PGBIN, f));
  }

  // 2) App + PGlite bündeln; store.js -> ./db.js auf db.standalone.js umleiten
  const redirectDb = {
    name: "redirect-db",
    setup(b) {
      b.onResolve({ filter: /(^|\/)db\.js$/ }, (args) => {
        const imp = args.importer.replace(/\\/g, "/");
        if (imp.endsWith("assets/js/store.js")) {
          return { path: path.join(STANDALONE, "db.standalone.js") };
        }
        return undefined;
      });
    },
  };

  const result = await build({
    entryPoints: [path.join(STANDALONE, "entry.js")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    write: false,
    plugins: [redirectDb],
    loader: {
      ".wasm": "binary",
      ".data": "binary",
      ".tar.gz": "dataurl",
    },
    logLevel: "error",
  });
  const js = result.outputFiles[0].text;

  // 3) Theme inline, Schriften als data:-URI
  let css = await readFile(path.join(REPO, "bw-theme.css"), "utf8");
  const fontRefs = [...css.matchAll(/url\("assets\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  for (const f of new Set(fontRefs)) {
    const mime = FONT_MIME[path.extname(f)] || "application/octet-stream";
    const uri = await dataUri(path.join(REPO, "assets", "fonts", f), mime);
    css = css.split(`url("assets/fonts/${f}")`).join(`url("${uri}")`);
  }

  // 4) Logo als data:-URI
  const logo = await dataUri(path.join(REPO, "assets", "logo", "rpf-logo.png"), "image/png");
  const logoNeg = await dataUri(path.join(REPO, "assets", "logo", "rpf-logo-negativ.png"), "image/png");

  // 5) Grundgerüst aus index.html übernehmen, externe Verweise entfernen
  let html = await readFile(path.join(REPO, "index.html"), "utf8");
  html = html
    .replace(/^\s*<link[^>]*>\s*$/gim, "")                 // favicons, manifest, stylesheet
    .replace(/<!--[^]*?-->/g, "")                          // HTML-Kommentare
    .replace(/^\s*<script[^>]*src=[^>]*><\/script>\s*$/gim, "") // externe Skripte
    .replace(/<noscript>[^]*?<\/noscript>/gi, "")
    .split("assets/logo/rpf-logo-negativ.png").join(logoNeg)
    .split("assets/logo/rpf-logo.png").join(logo)
    // Funktions-Replacer: verhindert, dass $-Sequenzen in CSS/JS als
    // Ersetzungsmuster interpretiert werden.
    .replace(/<\/head>/i, () => `<style>\n${css}\n</style>\n</head>`)
    .replace(/<\/body>/i, () => `<script type="module">\n${js}\n</script>\n</body>`);

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, html, "utf8");
  const kb = Math.round((Buffer.byteLength(html) / 1024 / 1024) * 10) / 10;
  console.log(`OK -> ${path.relative(REPO, OUT)} (${kb} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
