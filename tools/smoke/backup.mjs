// Smoke: Datensicherung erfasst alle neuen Tabellen; Reset räumt sie;
// Wiederherstellung stellt sie zurück (Round-Trip über die Store-Schicht).
import { smoke } from "./harness.mjs";

const run = () => smoke("backup", async ({ page, ok }) => {
  const r = await page.evaluate(async () => {
    const store = await import("/assets/js/store.js"); // gleiche Modul-Instanz wie die App
    const ps = await store.liste("prueflinge");
    const pid = ps[0].id;
    await store.beratungAnlegen({ titel: "Backup-Test-Fall", status: "offen" });
    await store.berichtsheftSpeichern({ prueflingId: pid, datum: "2026-06-01", ausbildungsjahr: 1, durchsichtNr: 1, ergebnis: "in_ordnung" });
    await store.berichtsheftKwSetzen(pid, 1, 36, { maengel: "A", fehltage: 0, geprueft: true });
    await store.berichtsheftTerminAnlegen({ datum: "2026-09-15", betrieb: "Backup GmbH" });
    const sich = await store.sicherungErstellen();
    await store.alleLoeschen();
    const nachLoesch = {
      faelle: (await store.beratungFaelle()).length,
      kw: (await store.berichtsheftKwLaden(pid)).length,
      termine: (await store.berichtsheftTermine()).length,
    };
    await store.sicherungEinspielen(sich);
    const nachRestore = {
      faelle: (await store.beratungFaelle()).length,
      kw: (await store.berichtsheftKwLaden(pid)).length,
      kontrollen: (await store.berichtsheftFuerPruefling(pid)).length,
      termine: (await store.berichtsheftTermine()).length,
    };
    return {
      bFaelle: (sich.tabellen.beratungsfaelle || []).length,
      bKw: (sich.tabellen.berichtsheft_kw || []).length,
      bTermine: (sich.tabellen.berichtsheft_termine || []).length,
      nachLoesch, nachRestore,
    };
  });
  ok(r.bFaelle >= 1 && r.bKw >= 1 && r.bTermine >= 1, "Sicherung enthält Beratung/KW/Termine");
  ok(r.nachLoesch.faelle === 0 && r.nachLoesch.kw === 0 && r.nachLoesch.termine === 0, "alleLoeschen räumt die neuen Tabellen");
  ok(r.nachRestore.faelle >= 1 && r.nachRestore.kw >= 1 && r.nachRestore.kontrollen >= 1 && r.nachRestore.termine >= 1, "Wiederherstellung stellt alle Daten zurück");
});

export default run;
if (process.argv[1] && process.argv[1].endsWith("backup.mjs")) run().then((f) => process.exit(f ? 1 : 0));
