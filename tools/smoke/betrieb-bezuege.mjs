// Smoke: Betriebs-Akte zeigt Berichtsheft & Beratung der Azubis.
import { smoke } from "./harness.mjs";

const run = () => smoke("betrieb-bezuege", async ({ page, ok }) => {
  // Einen Betrieb mit Prüfling wählen, dort Fall + Raster-Mangel setzen.
  const betriebId = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    const betriebe = await store.liste("betriebe");
    const prueflinge = await store.liste("prueflinge");
    // Betrieb mit mindestens einem Prüfling finden.
    for (const b of betriebe) {
      const p = prueflinge.find((x) => (x.betrieb || "").trim().toLowerCase() === (b.name || "").trim().toLowerCase());
      if (p) {
        await store.beratungAnlegen({ prueflingId: p.id, titel: "Smoke-Betriebsfall", kategorie: "Berichtsheft", status: "offen" });
        await store.berichtsheftKwSetzen(p.id, 1, 36, { maengel: "A", geprueft: true });
        return b.id;
      }
    }
    return null;
  });
  ok(betriebId != null, "Betrieb mit Prüfling gefunden");
  if (betriebId == null) return;

  await page.evaluate((i) => { location.hash = `#/betrieb/${i}`; }, betriebId);
  await page.waitForSelector("#betrieb-bezuege", { timeout: 15000 });
  const text = await page.evaluate(() => document.getElementById("betrieb-bezuege").closest("section").textContent);
  ok(/offene Raster-Mängel/.test(text), "offene Raster-Mängel im Betriebs-Abschnitt");
  ok(text.includes("Smoke-Betriebsfall"), "Beratungsfall des Betriebs verlinkt");
  const linkFall = await page.evaluate(() => !!document.querySelector('#betrieb-bezuege ~ * a[href^="#/beratung/"], section a.bw-btn[href^="#/beratung/"]'));
  ok(linkFall, "Öffnen-Link zum Beratungsfall vorhanden");
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("betrieb-bezuege.mjs")) run().then((f) => process.exit(f ? 1 : 0));
