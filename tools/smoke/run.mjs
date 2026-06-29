// Führt alle Smoke-Tests nacheinander aus. Lokal:  node tools/smoke/run.mjs
// (Benötigt einen lokalen Chromium; siehe harness.mjs. Nicht Teil der CI.)
import raster from "./raster.mjs";
import backup from "./backup.mjs";
import maengel from "./maengel.mjs";
import vorlagen from "./vorlagen.mjs";
import uebersicht from "./uebersicht.mjs";
import bhBeratung from "./bh-beratung.mjs";
import akteBezuege from "./akte-bezuege.mjs";

const smokes = [["raster", raster], ["backup", backup], ["maengel", maengel], ["vorlagen", vorlagen], ["uebersicht", uebersicht], ["bh-beratung", bhBeratung], ["akte-bezuege", akteBezuege]];
let fehler = 0;
for (const [name, fn] of smokes) {
  console.log(`\n=== Smoke: ${name} ===`);
  fehler += await fn();
}
console.log(fehler ? `\nSMOKES FEHLGESCHLAGEN (${fehler})` : "\nALLE SMOKES OK");
process.exit(fehler ? 1 : 0);
