// Reine, DB-/DOM-freie Logik für den Stationen-Rotations-Ablaufplan des
// praktischen Prüfungstags (Gärtner). Grundgedanke (vom RP vorgegeben):
//
//  • Jede Aufgabe ist eine Station. JEDER Prüfling durchläuft JEDE Station genau
//    einmal.
//  • Eine Station dauert in der Regel 60 Min (50 Min Prüfung + 10 Min Bewertung)
//    — kein 20-Minuten-Raster.
//  • „Pflanzenerkennung" ist eine eigene Station, die das RP selbst betreut
//    (kein zusätzlicher Ausschuss-Prüfer) und 20 Min dauert (20 Pflanzen).
//
// Optimierung (Ziel: wenig Wartezeit, wenig Prüfer):
//  Karussell-Rotation als lateinisches Quadrat. Bei m Stationen bilden je m
//  Prüflinge eine Gruppe; in Runde r steht Prüfling an Position i an Station
//  (i+r) mod m. So ist in jeder Runde jede Station mit genau einem Prüfling
//  belegt und jeder Prüfling immer beschäftigt — keine Leerlauf-Wartezeit.
//  Die nötige Prüferzahl ist die Summe des Prüferbedarfs aller betreuten
//  Stationen (eine Aufstellung genügt für beliebig viele nacheinander laufende
//  Gruppen) — das ist das Minimum. Die Pflanzenerkennung läuft als 20-Min-
//  Station ohne Prüfer mit; ihr 40-Min-Puffer dient zugleich als Verschnaufpause.

export const STD_STATION_DAUER = 60; // Minuten gesamt
export const STD_BEWERTUNG = 10;     // Minuten Bewertung am Ende
export const PFLANZEN_DAUER = 20;    // 20 Pflanzen in 20 Minuten

/** Minuten ab Mitternacht -> "HH:MM" (24h, de-DE-üblich). */
export function minZuZeit(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60) % 24;
  const r = m % 60;
  return String(h).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

/** Ganze Zahl 1..3 (Prüferbedarf) absichern; eigenregie -> 0. */
function bedarf(s) {
  if (s.eigenregie) return 0;
  const n = Math.round(Number(s.prueferBedarf));
  if (!isFinite(n) || n < 0) return 1;
  return Math.min(3, Math.max(0, n));
}

/**
 * Füllt Standardwerte je Station: dauerMin 60, bewertungMin 10, prueferBedarf 1.
 * Eigenregie-Stationen (RP-betreut, z. B. Pflanzenerkennung) haben Prüferbedarf 0.
 */
export function normalisiereStationen(stationen) {
  return (stationen || []).map((s) => {
    const eigenregie = !!s.eigenregie;
    const dauerMin = Math.max(1, Math.round(Number(s.dauerMin) || STD_STATION_DAUER));
    let bewertungMin = s.bewertungMin == null ? STD_BEWERTUNG : Math.round(Number(s.bewertungMin));
    if (!isFinite(bewertungMin) || bewertungMin < 0) bewertungMin = 0;
    if (bewertungMin > dauerMin) bewertungMin = 0;
    return {
      name: String(s.name || "Station"),
      dauerMin,
      bewertungMin,
      pruefMin: dauerMin - bewertungMin,
      prueferBedarf: bedarf(s),
      eigenregie,
      prueferIds: Array.isArray(s.prueferIds) ? s.prueferIds.slice() : [],
    };
  });
}

/** Gleichzeitig nötige Prüfer:innen für eine Aufstellung (Summe Bedarf). */
export function prueferProRunde(stationen) {
  return normalisiereStationen(stationen).reduce((s, x) => s + x.prueferBedarf, 0);
}

/**
 * Wie viele Prüflinge passen an EINEM Prüfungstag durch das Karussell? Eine volle
 * Gruppe (m Prüflinge) braucht m Runden × Rundenlänge; in die Tageslänge passen
 * floor(Tag / (m·Runde)) Gruppen (mindestens eine). Kapazität = Gruppen × m.
 * @param {Array} stationen  Stationsdefinitionen.
 * @param {number} tagMinuten  Verfügbare Tageslänge in Minuten.
 * @returns {number} Maximale Prüflingszahl je Tag (0 ohne Stationen).
 */
export function kapazitaetProTag(stationen, tagMinuten) {
  const st = normalisiereStationen(stationen);
  const m = st.length;
  if (!m) return 0;
  const rundenDauer = Math.max.apply(null, st.map((s) => s.dauerMin));
  const proGruppe = m * rundenDauer;
  const gruppen = Math.max(1, Math.floor((Number(tagMinuten) || 0) / proGruppe));
  return gruppen * m;
}

/**
 * Verteilt verfügbare Prüfer:innen auf die betreuten Stationen: bereits
 * zugeordnete (gültige) Personen bleiben erhalten, der Restbedarf wird der
 * Reihe nach mit noch freien Prüfer:innen aufgefüllt. Jede Person betreut
 * höchstens eine Station (im Karussell laufen alle Stationen gleichzeitig).
 * Eigenregie-Stationen erhalten keine Prüfer:innen.
 * @returns {{stationen:Array, bedarf:number, verteilt:number, fehlen:number, uebrig:number}}
 */
export function prueferVerteilen(stationen, prueferIds) {
  const st = normalisiereStationen(stationen);
  const alle = (prueferIds || []).map(Number).filter((x) => x > 0);
  const benutzt = new Set();
  // 1) Vorhandene, gültige Zuordnungen behalten (bis Bedarf), ohne Doppelung.
  const ergebnis = st.map((s) => {
    if (s.eigenregie) return { ...s, prueferIds: [] };
    const behalten = (s.prueferIds || [])
      .map(Number)
      .filter((id) => alle.includes(id) && !benutzt.has(id))
      .slice(0, s.prueferBedarf);
    behalten.forEach((id) => benutzt.add(id));
    return { ...s, prueferIds: behalten };
  });
  // 2) Restbedarf mit noch freien Prüfer:innen auffüllen.
  const frei = alle.filter((id) => !benutzt.has(id));
  let fi = 0;
  ergebnis.forEach((s) => {
    if (s.eigenregie) return;
    while (s.prueferIds.length < s.prueferBedarf && fi < frei.length) s.prueferIds.push(frei[fi++]);
  });
  const bedarf = ergebnis.reduce((n, s) => n + (s.eigenregie ? 0 : s.prueferBedarf), 0);
  const verteilt = ergebnis.reduce((n, s) => n + s.prueferIds.length, 0);
  return { stationen: ergebnis, bedarf, verteilt, fehlen: Math.max(0, bedarf - verteilt), uebrig: Math.max(0, alle.length - verteilt) };
}

/**
 * Baut den optimierten Rotations-Ablaufplan.
 * @param {Array} stationen  Stationsdefinitionen (siehe normalisiereStationen).
 * @param {number|Array} prueflinge  Anzahl oder Liste {id,name,...}.
 * @param {{startMin?:number, pauseNachRunde?:number, pauseMin?:number}} opts
 *   Tagesbeginn in Minuten (Default 08:00); optional Mittagspause nach der
 *   n-ten Runde mit Dauer in Minuten (n zwischen 1 und Stationszahl-1).
 * @returns {object} Plan mit Gruppen, Stationsraster, Laufzetteln und Kennzahlen.
 */
export function rotationsplan(stationen, prueflinge, opts = {}) {
  const st = normalisiereStationen(stationen);
  const m = st.length;
  const liste = Array.isArray(prueflinge)
    ? prueflinge
    : Array.from({ length: Math.max(0, Math.round(prueflinge) || 0) }, (_, i) => ({ name: "Prüfling " + (i + 1) }));
  const startMin = opts.startMin == null ? 8 * 60 : Math.round(opts.startMin);

  const leer = {
    stationen: st, m, anzahl: liste.length, rundenDauer: 0,
    prueferProRunde: prueferProRunde(st), gruppen: [], laufzettel: [],
    startMin, endeMin: startMin, dauerGesamtMin: 0, wartezeitProPruefling: 0,
  };
  if (m === 0 || liste.length === 0) return leer;

  // Synchrone Runden: alle rotieren gemeinsam, Rundenlänge = längste Station.
  const rundenDauer = Math.max.apply(null, st.map((s) => s.dauerMin));
  // Optionale Mittagspause nach der n-ten Runde (nur sinnvoll innerhalb des Tags).
  const pauseNachRunde = Math.max(0, Math.round(opts.pauseNachRunde || 0));
  const pauseMin = Math.max(0, Math.round(opts.pauseMin || 0));
  const pauseAktiv = pauseNachRunde > 0 && pauseNachRunde < m && pauseMin > 0;
  const pauseBeitrag = pauseAktiv ? pauseMin : 0;
  const gruppenAnzahl = Math.ceil(liste.length / m);
  const gruppenDauer = m * rundenDauer + pauseBeitrag;
  const gruppen = [];
  const laufzettel = liste.map(() => []);

  for (let g = 0; g < gruppenAnzahl; g++) {
    const von = g * m;
    const mitglieder = liste.slice(von, von + m); // bis zu m Prüflinge
    const gStart = startMin + g * gruppenDauer;
    const runden = [];
    for (let r = 0; r < m; r++) {
      // Runden nach der Pause sind um die Pausendauer nach hinten versetzt.
      const versatz = (pauseAktiv && r >= pauseNachRunde) ? pauseMin : 0;
      const rVon = gStart + r * rundenDauer + versatz;
      const zellen = st.map((station, sIdx) => {
        // An Station sIdx steht in Runde r die Position i mit (i+r)%m == sIdx.
        const pos = ((sIdx - r) % m + m) % m;
        const prueflingIdx = pos < mitglieder.length ? von + pos : null;
        if (prueflingIdx != null) {
          laufzettel[prueflingIdx].push({
            rundeNr: r + 1, vonMin: rVon, bisMin: rVon + station.dauerMin,
            stationIdx: sIdx, station,
          });
        }
        return { stationIdx: sIdx, position: prueflingIdx == null ? null : pos, prueflingIdx };
      });
      runden.push({ nr: r + 1, vonMin: rVon, bisMin: rVon + rundenDauer, zellen });
    }
    const pause = pauseAktiv
      ? { nachRunde: pauseNachRunde, dauerMin: pauseMin, vonMin: gStart + pauseNachRunde * rundenDauer, bisMin: gStart + pauseNachRunde * rundenDauer + pauseMin }
      : null;
    gruppen.push({ nr: g + 1, startMin: gStart, mitglieder, von, anzahl: mitglieder.length, runden, pause });
  }
  // Laufzettel je Prüfling nach Uhrzeit ordnen (Position bestimmt Startstation).
  laufzettel.forEach((eintraege) => eintraege.sort((a, b) => a.vonMin - b.vonMin));

  const dauerGesamtMin = gruppenAnzahl * gruppenDauer;
  return {
    stationen: st, m, anzahl: liste.length, rundenDauer,
    prueferProRunde: prueferProRunde(st),
    gruppen, laufzettel, startMin,
    endeMin: startMin + dauerGesamtMin, dauerGesamtMin,
    pauseNachRunde: pauseAktiv ? pauseNachRunde : 0, pauseMin: pauseAktiv ? pauseMin : 0,
    wartezeitProPruefling: 0,
  };
}
