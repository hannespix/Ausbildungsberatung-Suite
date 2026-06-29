// Smoke: Beratungsfall aus dem Berichtsheft anlegen (Modul-Verknüpfung).
import { smoke } from "./harness.mjs";

const run = () => smoke("bh-beratung", async ({ page, ok }) => {
  await page.evaluate(() => { location.hash = "#/berichtsheft"; });
  await page.waitForSelector("#bh-tbody [data-beratung]", { timeout: 15000 });

  const vorher = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    return (await store.beratungFaelle()).length;
  });

  // Beratungsfall-Knopf der ersten Zeile öffnet den vorausgefüllten Dialog.
  await page.click("#bh-tbody [data-beratung]");
  await page.waitForSelector("#dialog #bd-titel", { timeout: 10000 });
  const titel = await page.inputValue("#dialog #bd-titel");
  ok(titel.startsWith("Berichtsheft:"), `Titel vorausgefüllt (war "${titel}")`);
  const kat = await page.inputValue("#dialog #bd-kategorie");
  ok(kat === "Berichtsheft", `Kategorie „Berichtsheft" vorgewählt (war "${kat}")`);
  const pruefling = await page.inputValue("#dialog #bd-pruefling");
  ok(pruefling !== "", "Auszubildende:r vorgewählt");
  const h2 = await page.evaluate(() => document.querySelector("#dialog h2")?.textContent || "");
  ok(h2.includes("Neuer Beratungsfall"), `als neuer Fall (war "${h2}")`);

  // Speichern legt genau einen neuen Fall an.
  await page.click("#dialog #bd-speichern");
  await page.waitForFunction(() => !document.getElementById("dialog"), { timeout: 10000 });
  const nachher = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    const faelle = await store.beratungFaelle();
    return { n: faelle.length, hatTitel: faelle.some((f) => String(f.titel || "").startsWith("Berichtsheft:")) };
  });
  ok(nachher.n === vorher + 1, `genau ein neuer Fall (vorher ${vorher}, nachher ${nachher.n})`);
  ok(nachher.hatTitel, "Fall trägt den Berichtsheft-Titel");

  // Fall-Akte öffnen und die Rückverlinkung (Prüfling-Akte + Berichtsheft) prüfen.
  const fid = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js");
    const f = (await store.beratungFaelle()).find((x) => String(x.titel || "").startsWith("Berichtsheft:"));
    return f ? f.id : null;
  });
  if (fid != null) {
    await page.evaluate((i) => { location.hash = `#/beratung/${i}`; }, fid);
    await page.waitForSelector("#bf-bearbeiten", { timeout: 10000 });
    const hatBhLink = await page.evaluate(() => !!document.querySelector('a[href^="#/berichtsheft/"]'));
    const hatAkteLink = await page.evaluate(() => !!document.querySelector('a[href^="#/pruefling/"]'));
    ok(hatBhLink, "Fall-Akte verlinkt zum Berichtsheft-Raster");
    ok(hatAkteLink, "Fall-Akte verlinkt zur Prüfling-Akte");
  }
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("bh-beratung.mjs")) run().then((f) => process.exit(f ? 1 : 0));
