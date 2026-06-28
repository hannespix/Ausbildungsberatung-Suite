// Führt alle Smoke-Tests nacheinander aus. Lokal:  node tools/smoke/run.mjs
// (Benötigt einen lokalen Chromium; siehe harness.mjs. Nicht Teil der CI.)
import raster from "./raster.mjs";
import backup from "./backup.mjs";

const smokes = [["raster", raster], ["backup", backup]];
let fehler = 0;
for (const [name, fn] of smokes) {
  console.log(`\n=== Smoke: ${name} ===`);
  fehler += await fn();
}
console.log(fehler ? `\nSMOKES FEHLGESCHLAGEN (${fehler})` : "\nALLE SMOKES OK");
process.exit(fehler ? 1 : 0);
