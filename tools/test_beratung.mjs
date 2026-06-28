// Unit-Tests der Beratungs-Logik (assets/js/beratung.js).
import {
  STATUS, statusLabel, KATEGORIEN, EINTRAG_ARTEN, artLabel,
  standardWiedervorlage, fallAmpel, istOffen,
} from "../assets/js/beratung.js";

let fehler = 0, geprueft = 0;
function ok(b, n) { geprueft++; if (!b) { fehler++; console.error("FAIL:", n); } }
function eq(a, b, n) { ok(a === b, `${n} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`); }

eq(STATUS.length, 3, "3 Status");
eq(statusLabel("in_bearbeitung"), "In Bearbeitung", "Status-Label");
ok(KATEGORIEN.length >= 6, "Kategorien vorhanden");
eq(artLabel("telefonat"), "Telefonat", "Eintragsart-Label");
ok(EINTRAG_ARTEN.length >= 4, "Eintragsarten vorhanden");

eq(standardWiedervorlage("2026-06-27", 14), "2026-07-11", "Standard-Wiedervorlage heute+14");

eq(fallAmpel({ status: "geloest" }, "2026-06-27").farbe, "gruen", "gelöst -> grün");
eq(fallAmpel({ status: "offen" }, "2026-06-27").farbe, "gelb", "offen -> gelb");
eq(fallAmpel({ status: "in_bearbeitung" }, "2026-06-27").farbe, "gelb", "in Bearbeitung -> gelb");
eq(fallAmpel({ status: "offen", wiedervorlage: "2026-06-01" }, "2026-06-27").farbe, "rot", "WV vergangen -> rot");
eq(fallAmpel({ status: "offen", wiedervorlage: "2026-07-30" }, "2026-06-27").farbe, "gelb", "WV in Zukunft -> gelb");
eq(fallAmpel({ status: "geloest", wiedervorlage: "2026-06-01" }, "2026-06-27").farbe, "gruen", "gelöst schlägt WV");

eq(istOffen({ status: "offen" }), true, "offen ist offen");
eq(istOffen({ status: "geloest" }), false, "gelöst nicht offen");

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("BERATUNG-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("BERATUNG-TESTS OK");
