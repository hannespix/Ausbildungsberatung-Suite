// Smoke: Auswertungen zeigen bereichsübergreifende Kennzahlen (Berichtsheft & Beratung).
import { smoke } from "./harness.mjs";

const run = () => smoke("auswertungen-ueber", async ({ page, ok }) => {
  // Etwas Berichtsheft-/Beratungsdaten setzen, damit Zahlen > 0 sind.
  await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    const p = (await store.liste("prueflinge"))[0];
    await store.beratungAnlegen({ prueflingId: p.id, titel: "Smoke-Ausw-Fall", kategorie: "Berichtsheft", status: "offen" });
    await store.berichtsheftKwSetzen(p.id, 1, 36, { maengel: "A", geprueft: true });
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => { location.hash = "#/auswertungen"; });
  await page.waitForSelector("#ueber-h", { timeout: 15000 });

  const text = await page.evaluate(() => document.getElementById("ueber-h").closest("section").textContent);
  ok(/Azubis kontrolliert/.test(text), "Kennzahl Azubis kontrolliert vorhanden");
  ok(/offene Raster-Mängel/.test(text), "Kennzahl offene Raster-Mängel vorhanden");
  ok(/Beratungsfälle offen/.test(text), "Kennzahl Beratungsfälle offen vorhanden");

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#ueber-h ~ * a[href="#/berichtsheft"], #ueber-h ~ * a[href="#/beratung"]')).length);
  ok(links >= 2, `Verlinkung zu Berichtsheft/Beratung (war ${links})`);

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `kein Overflow bei 390px (war ${overflow}px)`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("auswertungen-ueber.mjs")) run().then((f) => process.exit(f ? 1 : 0));
