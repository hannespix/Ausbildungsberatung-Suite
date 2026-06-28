// Smoke: Berichtsheft-Mängel-Auswertung (Häufung der Codes + Fehltage-Kennzahlen).
import { smoke } from "./harness.mjs";

const run = () => smoke("maengel", async ({ page, ok }) => {
  // Zur Berichtsheftkontrolle, erste:n Auszubildende:n aus dem Raster-Link ziehen.
  await page.evaluate(() => { location.hash = "#/berichtsheft"; });
  await page.waitForSelector("#bh-tbody a[href^='#/berichtsheft/']", { timeout: 15000 });
  const pid = await page.evaluate(() =>
    Number(document.querySelector("#bh-tbody a[href^='#/berichtsheft/']").getAttribute("href").split("/").pop()));

  // Rasterzellen mit Mängeln/Fehltagen über dieselbe Store-Instanz setzen.
  await page.evaluate(async (id) => {
    const store = await import("/assets/js/store.js");
    await store.berichtsheftKwSetzen(id, 1, 36, { maengel: "A,D", fehltage: 0, geprueft: true });
    await store.berichtsheftKwSetzen(id, 1, 37, { maengel: "A", fehltage: 2, geprueft: true });
    await store.berichtsheftKwSetzen(id, 1, 38, { maengel: "H", fehltage: 3, geprueft: true });
    await store.berichtsheftKwSetzen(id, 1, 39, { maengel: "C", fehltage: 0, geprueft: true });
  }, pid);

  // Reload erzwingt frische DB-Lesung; danach Dashboard prüfen.
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => { location.hash = "#/berichtsheft"; });
  await page.waitForSelector("#bh-maengel-diagramm svg, #bh-maengel-diagramm .bw-bar", { timeout: 15000 });

  const balken = await page.evaluate(() => document.querySelectorAll("#bh-maengel-diagramm .bw-bar, #bh-maengel-diagramm rect").length);
  ok(balken >= 3, `mind. 3 Balken (A, C, D), war ${balken}`);

  // A ist häufigster Code -> erste Tabellenzeile, Anzahl 2.
  const ersteZeile = await page.evaluate(() => {
    const tr = document.querySelector("#bh-ausw-h ~ .bw-tablewrap tbody tr");
    return tr ? Array.from(tr.children).map((td) => td.textContent.trim()) : null;
  });
  ok(ersteZeile && ersteZeile[0] === "A" && ersteZeile[2] === "2", `häufigster Mangel A = 2 (war ${JSON.stringify(ersteZeile)})`);

  // H darf nicht als Mangel-Zeile auftauchen.
  const hatH = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#bh-ausw-h ~ .bw-tablewrap tbody tr td:first-child")).some((td) => td.textContent.trim() === "H"));
  ok(!hatH, "H (reine Fehltage) erscheint nicht als Mangel");

  // Fehltage-Kennzahl = 5 (2 + 3).
  const fehltage = await page.evaluate(() => {
    const kacheln = Array.from(document.querySelectorAll("#bh-ausw-h ~ .bw-flaechen .bw-card"));
    const k = kacheln.find((c) => c.textContent.includes("Fehltage gesamt"));
    return k ? k.querySelector("div:last-child").textContent.trim() : null;
  });
  ok(fehltage === "5", `Fehltage gesamt = 5 (war ${fehltage})`);

  // Mobile 390px: kein horizontaler Überlauf der Seite.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `kein Overflow bei 390px (war ${overflow}px)`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("maengel.mjs")) run().then((f) => process.exit(f ? 1 : 0));
