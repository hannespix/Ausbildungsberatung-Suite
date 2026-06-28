// Wiederverwendbares Smoke-Harness (Chromium) für die Ausbildungsberatung-Suite.
//
// Lokaler Browser-Test gegen das Projektverzeichnis. NICHT für CI gedacht
// (GitHub Actions hat keinen vorinstallierten Chromium-Pfad); dient als
// dauerhafte, jederzeit ausführbare Regressionsprüfung:
//
//   node tools/smoke/run.mjs            # alle Smokes
//   node tools/smoke/<name>.mjs         # einzelner Smoke
//
// Chromium-Pfad: $CHROMIUM_PATH, sonst Auto-Suche unter /opt/pw-browsers.
import { chromium } from "playwright-core";
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png",
  ".ico": "image/x-icon", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};

/** Lokalen Webserver mit COOP/COEP-Headern (für PGlite/WASM) starten. */
export async function serve(root = process.cwd()) {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ""));
      const buf = await readFile(file);
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Content-Type", MIME[extname(file)] || "application/octet-stream");
      res.end(buf);
    } catch { res.statusCode = 404; res.end("404"); }
  });
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://localhost:${server.address().port}` };
}

/** Chromium-Executable ermitteln ($CHROMIUM_PATH oder /opt/pw-browsers/chromium-*). */
async function chromiumPfad() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    const dirs = (await readdir(root)).filter((d) => d.startsWith("chromium-") && !d.includes("headless"));
    for (const d of dirs.sort().reverse()) {
      const p = join(root, d, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  }
  return undefined; // playwright-core entscheidet selbst (ggf. Fehler -> sichtbar)
}

/** Browser starten (headless, --no-sandbox). */
export async function launch() {
  return chromium.launch({ executablePath: await chromiumPfad(), args: ["--no-sandbox"] });
}

/** Standard-Admin anmelden und warten, bis die Navigation steht. */
export async function login(page, base) {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("#login-name", { timeout: 20000 });
  await page.fill("#login-name", "admin");
  await page.fill("#login-pass", "azubi2027");
  await page.click(".bw-btn");
  await page.waitForFunction(
    () => document.getElementById("navlinks")?.textContent?.includes("Berichtsheft"),
    { timeout: 20000 }
  );
}

/**
 * Einen Smoke ausführen: Server + Browser + eingeloggte Seite bereitstellen,
 * Zähler (ok/eq) reichen, am Ende aufräumen. Gibt die Fehleranzahl zurück.
 * @param {string} name
 * @param {(ctx:{page:any,base:string,ok:Function,eq:Function}) => Promise<void>} fn
 */
export async function smoke(name, fn) {
  const { server, base } = await serve();
  const browser = await launch();
  let fehler = 0;
  const ok = (b, n) => { if (b) console.log("OK:", n); else { fehler++; console.error("FAIL:", n); } };
  const eq = (a, b, n) => ok(a === b, `${n} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`);
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => { fehler++; console.error("PAGEERROR:", e.message); });
    await login(page, base);
    await fn({ page, base, ok, eq });
  } catch (e) {
    fehler++; console.error("SMOKE-FEHLER:", e && e.message);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fehler ? `\n${name}: ${fehler} FEHLER` : `\n${name}: OK`);
  return fehler;
}
