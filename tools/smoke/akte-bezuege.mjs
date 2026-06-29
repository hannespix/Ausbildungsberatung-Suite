// Smoke: Prüflings-Akte zeigt Berichtsheft & Beratung (Modul-Verknüpfung).
import { smoke } from "./harness.mjs";

const run = () => smoke("akte-bezuege", async ({ page, ok }) => {
  // Ersten Prüfling holen, einen Beratungsfall und einen Raster-Mangel setzen.
  const id = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    const p = (await store.liste("prueflinge"))[0];
    await store.beratungAnlegen({ prueflingId: p.id, titel: "Smoke-Beratungsfall", kategorie: "Berichtsheft", status: "offen" });
    await store.berichtsheftKwSetzen(p.id, 1, 36, { maengel: "A", geprueft: true });
    return p.id;
  });

  await page.evaluate((i) => { location.hash = `#/pruefling/${i}`; }, id);
  await page.waitForSelector("#akte-bezuege", { timeout: 15000 });

  const text = await page.evaluate(() => {
    const sec = document.getElementById("akte-bezuege").closest("section");
    return sec ? sec.textContent : "";
  });
  ok(/offene Raster-Mängel/.test(text), "offene Raster-Mängel im Akte-Abschnitt");
  ok(text.includes("Smoke-Beratungsfall"), "Beratungsfall in der Akte verlinkt");

  const linkRaster = await page.evaluate((i) => !!document.querySelector(`#akte-bezuege ~ * a[href="#/berichtsheft/${i}"], section a[href="#/berichtsheft/${i}"]`), id);
  ok(linkRaster, "Link zum Wochenraster vorhanden");

  const linkFall = await page.evaluate(() => !!document.querySelector('a.bw-btn[href^="#/beratung/"]'));
  ok(linkFall, "Öffnen-Link zum Beratungsfall vorhanden");

  // „Schreiben erstellen" verlinkt die Vorlagen (mit Empfänger, falls E-Mail da).
  const schreiben = await page.evaluate(() => {
    const a = document.querySelector('a.bw-btn[href^="#/vorlagen"]');
    return a ? a.getAttribute("href") : null;
  });
  ok(schreiben && schreiben.startsWith("#/vorlagen"), `Schreiben-erstellen-Knopf verlinkt Vorlagen (war ${schreiben})`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("akte-bezuege.mjs")) run().then((f) => process.exit(f ? 1 : 0));
