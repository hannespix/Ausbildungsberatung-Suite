// Smoke: Vorlagen — Anlagen mitschicken + E-Mail-Entwurf (.eml) mit Anhang.
import { smoke } from "./harness.mjs";
import { readFile } from "node:fs/promises";

const run = () => smoke("vorlagen", async ({ page, ok }) => {
  await page.evaluate(() => { location.hash = "#/vorlagen"; });
  await page.waitForSelector("#vl-auswahl", { timeout: 15000 });

  // Vorlage mit Checkliste: {{checkliste}} muss ersetzt sein (kein Platzhalter mehr).
  await page.selectOption("#vl-auswahl", { label: "Ausbildereignung — Nachweis anfordern" });
  const txtEignung = await page.inputValue("#vl-text");
  ok(txtEignung.includes("Tabellarischer Lebenslauf"), "Checkliste in den Text eingesetzt");
  ok(!txtEignung.includes("{{checkliste}}"), "kein {{checkliste}}-Platzhalter mehr");

  // Vorlage mit Anlage: Berufsausbildungsvertrag-Vordruck zusenden.
  await page.selectOption("#vl-auswahl", { label: "Berufsausbildungsvertrag — Vordruck zusenden" });
  await page.waitForSelector("#vl-anlagen fieldset", { timeout: 5000 });
  const anlageDa = await page.evaluate(() => !!document.querySelector('#vl-anlagen [data-anl="bav"]'));
  ok(anlageDa, "Anlage BAV im Vordruck angeboten");
  const checked = await page.isChecked('#vl-anl-bav');
  ok(checked, "Anlage standardmäßig angehakt");

  await page.fill("#vl-empf", "betrieb@example.de");

  // E-Mail-Entwurf herunterladen und Inhalt prüfen.
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click("#vl-eml"),
  ]);
  ok(dl.suggestedFilename().endsWith(".eml"), `Download ist .eml (war ${dl.suggestedFilename()})`);
  const pfad = await dl.path();
  const eml = await readFile(pfad, "utf8");
  ok(eml.includes("X-Unsent: 1"), "Entwurf als Outlook-Entwurf (X-Unsent)");
  ok(eml.includes("To: betrieb@example.de"), "Empfänger im Entwurf");
  ok(eml.includes("multipart/mixed"), "multipart mit Anhang");
  ok(eml.includes('filename="Berufsausbildungsvertrag-gruene-Berufe.pdf"'), "BAV als Anhang eingebettet");
  ok(/Content-Type: application\/pdf/.test(eml), "Anhang ist PDF");

  // Einzel-Download der Anlage funktioniert ebenfalls.
  const [dl2] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click('[data-anl-dl="bav"]'),
  ]);
  ok(dl2.suggestedFilename() === "Berufsausbildungsvertrag-gruene-Berufe.pdf", `Anlage einzeln geladen (war ${dl2.suggestedFilename()})`);

  // Vorlage ohne Anlage: kein Anlagen-Block.
  await page.selectOption("#vl-auswahl", { label: "Einladung zum Beratungsgespräch" });
  const leer = await page.evaluate(() => document.getElementById("vl-anlagen").innerHTML.trim());
  ok(leer === "", "ohne Anlage kein Anlagen-Block");

  // Mobile 390px: kein horizontaler Überlauf.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `kein Overflow bei 390px (war ${overflow}px)`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("vorlagen.mjs")) run().then((f) => process.exit(f ? 1 : 0));
