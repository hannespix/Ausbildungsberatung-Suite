// Unit-Tests der reinen Galabau-Notenlogik (assets/js/galabau.js).
// Läuft ohne Browser/DB in Node und in der CI (Schritt im App-Bundle-Job).
// Aufruf: node tools/test_galabau.mjs

import {
  noteWort, noteAusPunkten, trunc1, zahlOderNull,
  gesamtGalabau, ergaenzteKenntnis, bewertungGruende, pflanzenkenntnisNote,
} from "../assets/js/galabau.js";

let fehler = 0, geprueft = 0;
function ok(bedingung, name) {
  geprueft++;
  if (!bedingung) { fehler++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), `${name} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`); }

// --- trunc1: zur Null hin abschneiden, keine Rundung ---
eq(trunc1(2.19), 2.1, "trunc1 2,19 -> 2,1");
eq(trunc1(2.0999999), 2.0, "trunc1 2,0999 -> 2,0");
eq(trunc1(4.5), 4.5, "trunc1 4,5 -> 4,5");

// --- zahlOderNull: Komma erlaubt, leer -> null ---
eq(zahlOderNull("2,5"), 2.5, "zahlOderNull Komma");
eq(zahlOderNull(""), null, "zahlOderNull leer");
eq(zahlOderNull("x"), null, "zahlOderNull ungültig");

// --- noteWort: Bandgrenzen ---
eq(noteWort(1.4), "sehr gut", "noteWort 1,4");
eq(noteWort(1.5), "gut", "noteWort 1,5");
eq(noteWort(4.4), "ausreichend", "noteWort 4,4");
eq(noteWort(4.5), "mangelhaft", "noteWort 4,5");
eq(noteWort(5.5), "ungenügend", "noteWort 5,5");

// --- noteAusPunkten (100er-Schlüssel) ---
eq(noteAusPunkten(100).note, 1, "punkte 100 -> 1,0");
eq(noteAusPunkten(80).note, 2, "punkte 80 -> 2,0");
eq(noteAusPunkten(50).note, 3.5, "punkte 50 -> 3,5");
eq(noteAusPunkten(0).note, 6, "punkte 0 -> 6,0");
ok(noteAusPunkten(40).ausreichend === true, "punkte 40 ausreichend");

// --- gesamtGalabau: Gewichtung 60/40 + TRUNC ---
let g = gesamtGalabau([2, 2, 2, 2, 2], [3, 3, 3, 3]);
eq(g.praxis, 2, "Praxis-Schnitt 2,0");
eq(g.kenntnis, 3, "Kenntnis-Schnitt 3,0");
eq(g.gesamt, 2.4, "Gesamt 2*0,6+3*0,4=2,4");
ok(g.bestanden === true, "alle gut -> bestanden");

// TRUNC statt Runden: Praxis (2,2,2,2,3)=2,2 ; Gesamt 2,2*0,6+2*0,4=2,12 -> 2,1
g = gesamtGalabau([2, 2, 2, 2, 3], [2, 2, 2, 2]);
eq(g.praxis, 2.2, "Praxis 2,2 (trunc)");
eq(g.gesamt, 2.1, "Gesamt 2,12 -> 2,1 (trunc)");

// Sperrfach: ein Bereich 5,5 -> nicht bestanden, Grund Sperrfach
g = gesamtGalabau([5.5, 2, 2, 2, 2], [2, 2, 2, 2]);
ok(g.bestanden === false, "Sperrfach -> nicht bestanden");
ok(g.gruende.some((x) => /Sperrfach/.test(x)), "Sperrfach-Grund vorhanden");

// Zwei Bereiche >= 4,5 -> nicht bestanden
g = gesamtGalabau([4.5, 4.5, 2, 2, 2], [2, 2, 2, 2]);
ok(g.bestanden === false, "2x>=4,5 -> nicht bestanden");
ok(g.gruende.some((x) => /2 Bereiche/.test(x)), "Grund: 2 Bereiche >= 4,5");

// Genau ein Bereich 4,5 (mangelhaft) bleibt bestanden, wenn Schnitte ok
g = gesamtGalabau([4.5, 2, 2, 2, 2], [2, 2, 2, 2]);
ok(g.bestanden === true, "ein 4,5 allein -> bestanden");

// Unvollständig -> bestanden null
g = gesamtGalabau([2, 2, 2, 2, ""], [2, 2, 2, 2]);
ok(g.bestanden === null && g.gesamt === null, "unvollständig -> null");

// --- ergaenzteKenntnis: (2*schriftlich + 1*mündlich)/3, TRUNC ---
eq(ergaenzteKenntnis([5, 2, 2, 2], "k1", 2)[0], 4, "k1 5 +mündl 2 -> 4,0");
eq(ergaenzteKenntnis([5, 2, 2, 2], "k1", 2)[1], 2, "k2 unverändert");
// ungültiger Bereich/leer -> unverändert
eq(ergaenzteKenntnis([5, 2, 2, 2], "x", 2)[0], 5, "ungültiger Bereich -> unverändert");

// --- bewertungGruende: aus gespeicherter Zeile, inkl. Ergänzung ---
const zeile = { p1: 2, p2: 2, p3: 2, p4: 2, p5: 2, k1: 5, k2: 2, k3: 2, k4: 2, ergaenzung_bereich: "k1", ergaenzung_note: 2 };
eq(bewertungGruende(zeile), [], "Ergänzung k1 5->4 rettet das Bestehen (keine Gründe)");
const zeile2 = { p1: 5.5, p2: 2, p3: 2, p4: 2, p5: 2, k1: 2, k2: 2, k3: 2, k4: 2 };
ok(bewertungGruende(zeile2).some((x) => /Sperrfach/.test(x)), "bewertungGruende Sperrfach");

// --- pflanzenkenntnisNote: (2*schriftl + 1*bestimmung)/3 TRUNC ---
eq(pflanzenkenntnisNote(2, 5), 3, "PK (2*2+5)/3=3,0");
eq(pflanzenkenntnisNote(2, ""), null, "PK unvollständig -> null");

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("GALABAU-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("GALABAU-TESTS OK");
