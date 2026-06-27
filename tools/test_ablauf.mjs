// Unit-Tests der reinen Rotations-Ablauflogik (assets/js/ablauf.js).
// Läuft ohne Browser/DB in Node und in der CI. Aufruf: node tools/test_ablauf.mjs

import {
  minZuZeit, normalisiereStationen, prueferProRunde, rotationsplan, prueferVerteilen, kapazitaetProTag,
} from "../assets/js/ablauf.js";

let fehler = 0, geprueft = 0;
function ok(b, name) { geprueft++; if (!b) { fehler++; console.error("FAIL:", name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), `${name} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`); }

// --- minZuZeit ---
eq(minZuZeit(8 * 60), "08:00", "08:00");
eq(minZuZeit(8 * 60 + 50), "08:50", "08:50");
eq(minZuZeit(13 * 60 + 5), "13:05", "13:05");

// --- normalisiereStationen: Defaults + Eigenregie ---
const norm = normalisiereStationen([
  { name: "Pflasterfläche" },
  { name: "Pflanzenerkennung", dauerMin: 20, bewertungMin: 0, eigenregie: true },
  { name: "Naturstein", prueferBedarf: 3 },
]);
eq(norm[0].dauerMin, 60, "Default-Dauer 60");
eq(norm[0].bewertungMin, 10, "Default-Bewertung 10");
eq(norm[0].pruefMin, 50, "Prüfzeit 50");
eq(norm[0].prueferBedarf, 1, "Default-Bedarf 1");
eq(norm[1].prueferBedarf, 0, "Eigenregie -> Bedarf 0");
eq(norm[1].pruefMin, 20, "Pflanzen 20 Min Prüfzeit");
eq(norm[2].prueferBedarf, 3, "Bedarf 3 übernommen");

// --- prueferProRunde: Eigenregie zählt nicht ---
eq(prueferProRunde(norm), 4, "Prüfer/Runde = 1+0+3 = 4");

// --- rotationsplan: Grundfall, eine volle Gruppe (m Prüflinge) ---
const stationen = [
  { name: "S1" }, { name: "S2" }, { name: "S3" },
  { name: "Pflanzen", dauerMin: 20, eigenregie: true },
];
const p4 = rotationsplan(stationen, 4, { startMin: 8 * 60 });
eq(p4.m, 4, "4 Stationen");
eq(p4.gruppen.length, 1, "4 Prüflinge -> 1 Gruppe");
eq(p4.rundenDauer, 60, "Rundenlänge = längste Station (60)");
eq(p4.dauerGesamtMin, 4 * 60, "Dauer = 4 Runden × 60");
eq(p4.prueferProRunde, 3, "Prüfer/Runde = 3 (Pflanzen ohne)");
eq(p4.wartezeitProPruefling, 0, "keine Wartezeit");

// Jeder Prüfling besucht jede Station genau einmal, in 4 verschiedenen Runden.
for (let i = 0; i < 4; i++) {
  const lz = p4.laufzettel[i];
  ok(lz.length === 4, `Prüfling ${i}: 4 Stationen`);
  const stat = new Set(lz.map((x) => x.stationIdx));
  ok(stat.size === 4, `Prüfling ${i}: alle Stationen verschieden`);
  const zeiten = lz.map((x) => x.vonMin);
  ok(new Set(zeiten).size === 4, `Prüfling ${i}: 4 verschiedene Startzeiten`);
}

// In jeder Runde steht an jeder Station genau ein Prüfling, alle verschieden.
for (const g of p4.gruppen) {
  for (const runde of g.runden) {
    const belegt = runde.zellen.map((z) => z.prueflingIdx).filter((x) => x != null);
    ok(belegt.length === 4, `Runde ${runde.nr}: alle 4 Stationen belegt`);
    ok(new Set(belegt).size === 4, `Runde ${runde.nr}: keine Doppelbelegung`);
  }
}

// Startzeiten: erste Runde 08:00, zweite 09:00, ...
eq(minZuZeit(p4.gruppen[0].runden[0].vonMin), "08:00", "Runde 1 ab 08:00");
eq(minZuZeit(p4.gruppen[0].runden[1].vonMin), "09:00", "Runde 2 ab 09:00");

// --- Mehrere Gruppen (nicht teilbar): 7 Prüflinge, 3 Stationen ---
const p7 = rotationsplan([{ name: "A" }, { name: "B" }, { name: "C" }], 7);
eq(p7.gruppen.length, 3, "7 Prüflinge / 3 Stationen -> 3 Gruppen");
eq(p7.gruppen[2].anzahl, 1, "letzte Gruppe hat 1 Prüfling");
// In der Restgruppe ist je Runde nur eine Station belegt.
for (const runde of p7.gruppen[2].runden) {
  const belegt = runde.zellen.filter((z) => z.prueflingIdx != null).length;
  ok(belegt === 1, `Restgruppe Runde ${runde.nr}: genau 1 belegt`);
}
// Auch in der Restgruppe besucht der Prüfling jede Station genau einmal.
const lzRest = p7.laufzettel[6];
ok(lzRest.length === 3 && new Set(lzRest.map((x) => x.stationIdx)).size === 3, "Restprüfling: alle 3 Stationen");
// Zweite Gruppe startet nach der ersten (3 Runden × 60).
eq(minZuZeit(p7.gruppen[1].startMin), "11:00", "Gruppe 2 ab 11:00");

// --- Randfälle ---
eq(rotationsplan([], 10).gruppen.length, 0, "keine Stationen -> kein Plan");
eq(rotationsplan([{ name: "X" }], 0).gruppen.length, 0, "keine Prüflinge -> kein Plan");

// Prüf-/Bewertungsfenster am Laufzettel: erste Station 08:00, Dauer 60.
eq(p4.laufzettel[0][0].vonMin, 8 * 60, "Laufzettel beginnt 08:00");
eq(p4.laufzettel[0][0].bisMin - p4.laufzettel[0][0].vonMin, 60, "erste Station 60 Min");

// --- prueferVerteilen: Restbedarf auffüllen, Eigenregie leer, Knappheit ---
const vStat = [
  { name: "S1", prueferBedarf: 1 },
  { name: "S2", prueferBedarf: 2 },
  { name: "Pflanzen", dauerMin: 20, eigenregie: true },
];
// Genug Prüfer:innen (3 für Bedarf 3): voll besetzt, Eigenregie leer.
let v = prueferVerteilen(vStat, [10, 11, 12]);
eq(v.bedarf, 3, "Bedarf 1+2 = 3");
eq(v.verteilt, 3, "alle 3 verteilt");
eq(v.fehlen, 0, "nichts fehlt");
eq(v.stationen[0].prueferIds, [10], "S1 bekommt 1");
eq(v.stationen[1].prueferIds, [11, 12], "S2 bekommt 2");
eq(v.stationen[2].prueferIds, [], "Eigenregie ohne Prüfer");
// Jede Person nur an einer Station.
const flach = v.stationen.flatMap((s) => s.prueferIds);
ok(new Set(flach).size === flach.length, "keine Person doppelt verteilt");

// Knappheit: nur 2 Prüfer:innen für Bedarf 3 -> einer fehlt.
v = prueferVerteilen(vStat, [10, 11]);
eq(v.verteilt, 2, "2 von 3 verteilt");
eq(v.fehlen, 1, "1 fehlt");

// Bestehende gültige Zuordnung bleibt erhalten, Rest wird aufgefüllt.
const vorbelegt = [
  { name: "S1", prueferBedarf: 1, prueferIds: [11] },
  { name: "S2", prueferBedarf: 2, prueferIds: [] },
];
v = prueferVerteilen(vorbelegt, [10, 11, 12]);
eq(v.stationen[0].prueferIds, [11], "vorhandene Zuordnung bleibt");
ok(v.stationen[1].prueferIds.length === 2 && !v.stationen[1].prueferIds.includes(11), "S2 mit anderen aufgefüllt");

// Überzählige Prüfer:innen werden als 'uebrig' gemeldet.
v = prueferVerteilen([{ name: "S1", prueferBedarf: 1 }], [10, 11, 12]);
eq(v.uebrig, 2, "2 übrig bei Bedarf 1");

// --- kapazitaetProTag: Gruppen aus Tageslänge ---
const sechs = Array.from({ length: 6 }, (_, i) => ({ name: "S" + i })); // 6 Stationen × 60 Min
eq(kapazitaetProTag(sechs, 8 * 60), 6, "08–16 Uhr (480) -> 1 Gruppe -> 6");
eq(kapazitaetProTag(sechs, 12 * 60), 12, "720 Min -> 2 Gruppen -> 12");
eq(kapazitaetProTag(sechs, 60), 6, "zu kurzer Tag -> mind. 1 Gruppe -> 6");
eq(kapazitaetProTag([], 480), 0, "keine Stationen -> 0");
// Mit kürzerer Eigenregie-Station bleibt die Rundenlänge 60 (Max).
eq(kapazitaetProTag(sechs.concat([{ name: "Pflanzen", dauerMin: 20, eigenregie: true }]), 7 * 60), 7, "7 Stationen, 420 Min -> 1 Gruppe -> 7");

// --- Mittagspause: Runden nach der Pause verschieben sich ---
const pst = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]; // 4 Stationen × 60
let pp = rotationsplan(pst, 4, { startMin: 8 * 60, pauseNachRunde: 2, pauseMin: 30 });
eq(pp.pauseNachRunde, 2, "Pause nach Runde 2 aktiv");
eq(minZuZeit(pp.gruppen[0].runden[0].vonMin), "08:00", "Runde 1 08:00");
eq(minZuZeit(pp.gruppen[0].runden[1].vonMin), "09:00", "Runde 2 09:00");
eq(minZuZeit(pp.gruppen[0].runden[2].vonMin), "10:30", "Runde 3 nach Pause 10:30");
eq(minZuZeit(pp.gruppen[0].runden[3].vonMin), "11:30", "Runde 4 11:30");
eq(minZuZeit(pp.gruppen[0].pause.vonMin), "10:00", "Pause beginnt 10:00");
eq(minZuZeit(pp.gruppen[0].pause.bisMin), "10:30", "Pause endet 10:30");
eq(pp.dauerGesamtMin, 4 * 60 + 30, "Tagesdauer inkl. Pause");
eq(minZuZeit(pp.endeMin), "12:30", "Ende 12:30 inkl. Pause");
// Jeder Prüfling besucht weiter jede Station genau einmal (Pause ändert nur Zeiten).
for (let i = 0; i < 4; i++) ok(new Set(pp.laufzettel[i].map((x) => x.stationIdx)).size === 4, `Pause: Prüfling ${i} alle Stationen`);
// Zweite Gruppe startet nach erster inkl. Pausenversatz (4*60+30 = 270).
pp = rotationsplan(pst, 8, { startMin: 8 * 60, pauseNachRunde: 2, pauseMin: 30 });
eq(minZuZeit(pp.gruppen[1].startMin), "12:30", "Gruppe 2 ab 12:30 (mit Pausenversatz)");
// Ungültige Pause (nachRunde >= Stationszahl) -> inaktiv.
pp = rotationsplan(pst, 4, { startMin: 8 * 60, pauseNachRunde: 4, pauseMin: 30 });
eq(pp.pauseNachRunde, 0, "Pause am/über Tagesende -> inaktiv");
eq(pp.gruppen[0].pause, null, "keine Pause-Markierung wenn inaktiv");

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("ABLAUF-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("ABLAUF-TESTS OK");
