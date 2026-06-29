// Smoke: Berichtsheft-Kontrollen aus CSV importieren.
import { smoke } from "./harness.mjs";

const run = () => smoke("bh-import", async ({ page, ok }) => {
  await page.evaluate(() => { location.hash = "#/berichtsheft"; });
  await page.waitForSelector("#bh-import", { timeout: 15000 });

  // Namen der ersten beiden Auszubildenden holen (für gültige Treffer).
  const namen = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    const p = await store.liste("prueflinge");
    return p.slice(0, 2).map((x) => ({ nachname: x.nachname, vorname: x.vorname, id: x.id }));
  });
  ok(namen.length >= 1, "Auszubildende vorhanden");

  const csv = "Nachname;Vorname;Datum;Ausbildungsjahr;Durchsicht-Nr.;Ergebnis;Mängelcodes;Fehltage\r\n"
    + `${namen[0].nachname};${namen[0].vorname};15.06.2026;1;1;in_ordnung;;0\r\n`
    + "Nichtvorhanden;Niemand;01.01.2026;1;1;in_ordnung;;0\r\n";

  // Dialog öffnen und Datei einsetzen.
  await page.click("#bh-import");
  await page.waitForSelector("#bi-datei", { timeout: 10000 });
  await page.setInputFiles("#bi-datei", { name: "kontrollen.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForSelector("#bi-zuordnung:not([hidden])", { timeout: 10000 });
  const infoText = await page.evaluate(() => document.getElementById("bi-info").textContent);
  ok(/2 Zeile/.test(infoText), `2 Datenzeilen erkannt (war "${infoText}")`);

  const vorher = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    return (await store.berichtsheftFuerPruefling((await store.liste("prueflinge"))[0].id)).length;
  });

  await page.click("#bi-import");
  await page.waitForFunction(() => !document.getElementById("dialog"), { timeout: 10000 });

  const nachher = await page.evaluate(async (pid) => {
    const store = await import("/assets/js/store.js");
    return (await store.berichtsheftFuerPruefling(pid)).length;
  }, namen[0].id);
  ok(nachher === vorher + 1, `Kontrolle importiert (vorher ${vorher}, nachher ${nachher})`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("bh-import.mjs")) run().then((f) => process.exit(f ? 1 : 0));
