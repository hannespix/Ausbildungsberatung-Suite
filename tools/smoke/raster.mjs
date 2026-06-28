// Smoke: Berichtsheft-Wochenraster (Tastatur-Schnellkontrolle + Persistenz).
import { smoke } from "./harness.mjs";

const run = () => smoke("raster", async ({ page, ok }) => {
  await page.evaluate(() => { location.hash = "#/berichtsheft"; });
  await page.waitForSelector("#bh-tbody a[href^='#/berichtsheft/']", { timeout: 15000 });
  const href = await page.evaluate(() => document.querySelector("#bh-tbody a[href^='#/berichtsheft/']").getAttribute("href"));
  await page.evaluate((h) => { location.hash = h; }, href);
  await page.waitForSelector("#bh-raster .bw-kw", { timeout: 15000 });

  const zellen = await page.evaluate(() => document.querySelectorAll("#bh-raster .bw-kw").length);
  ok(zellen === 156, `156 Zellen (3 AJ × 52 KW), war ${zellen}`);

  await page.click('#bh-raster .bw-kw[data-idx="0"]');
  await page.keyboard.press("a");
  await page.waitForFunction(() => document.querySelector('#bh-raster .bw-kw[data-idx="0"]')?.classList.contains("bw-kw--issue"), { timeout: 5000 });
  ok(true, "Taste A -> Mangel, Zelle rot");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("3");
  await page.waitForFunction(() => document.querySelector('#bh-raster .bw-kw[data-idx="1"]')?.classList.contains("bw-kw--fehltage"), { timeout: 5000 });
  ok(true, "Pfeil + Ziffer -> Fehltage gelb");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("o");
  await page.waitForFunction(() => document.querySelector('#bh-raster .bw-kw[data-idx="2"]')?.classList.contains("bw-kw--ok"), { timeout: 5000 });
  ok(true, "Taste O -> grün");

  // Persistenz nach Reload
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate((h) => { location.hash = h; }, href);
  await page.waitForSelector("#bh-raster .bw-kw", { timeout: 15000 });
  const fehl = await page.evaluate(() => document.querySelector('#bh-raster .bw-kw[data-idx="1"] .bw-kw__fehl')?.textContent);
  ok(fehl === "3", `Fehltage nach Reload erhalten (war ${fehl})`);
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("raster.mjs")) run().then((f) => process.exit(f ? 1 : 0));
