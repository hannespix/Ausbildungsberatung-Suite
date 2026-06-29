// Smoke: Übersicht-Dashboard (Bereiche-Kacheln, direkter Sprung nach Login).
import { smoke } from "./harness.mjs";

const run = () => smoke("uebersicht", async ({ page, ok }) => {
  // Nach dem Login (harness) muss direkt das Dashboard stehen — ohne manuelles
  // Navigieren. Die Bereiche-Sektion ist der Beleg.
  await page.waitForSelector("#bereiche-h", { timeout: 15000 });
  const h1 = await page.evaluate(() => document.querySelector("#app h1")?.textContent || "");
  ok(h1.includes("Übersicht"), `Dashboard direkt nach Login (h1 war "${h1}")`);

  // Alle Bereiche als Kacheln vorhanden und verlinkt.
  const erwartet = ["prueflinge", "kontakte", "pruefungstag", "planung", "planungsliste",
    "noten", "zeugnisse", "auswertungen", "berichtsheft", "beratung", "rechner", "vorlagen", "suche"];
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".bw-kachel")).map((a) => a.getAttribute("href")));
  ok(links.length === erwartet.length, `${erwartet.length} Bereich-Kacheln (war ${links.length})`);
  const fehlt = erwartet.filter((r) => !links.includes(`#/${r}`));
  ok(fehlt.length === 0, `alle Bereiche verlinkt (fehlt: ${fehlt.join(", ") || "—"})`);

  // Eine Kachel führt in den Bereich (Vorlagen).
  await page.click('.bw-kachel[href="#/vorlagen"]');
  await page.waitForSelector("#vl-auswahl", { timeout: 10000 });
  ok(true, "Kachel öffnet den Bereich (Vorlagen)");

  // Zurück zum Dashboard und Mobile 390px ohne Overflow.
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForSelector("#bereiche-h", { timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `kein Overflow bei 390px (war ${overflow}px)`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("uebersicht.mjs")) run().then((f) => process.exit(f ? 1 : 0));
