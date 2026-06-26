// galabau.js — reine Notenlogik der Gärtner-Abschlussprüfung (BW).
//
// Bewusst frei von DB-/Browser-Abhängigkeiten, damit dieser rechtlich kritische
// Kern isoliert (auch in Node) unit-getestet werden kann (tools/test_galabau.mjs).
// store.js importiert und re-exportiert diese Funktionen.

/** Zulässige Maximalpunktzahlen (eigener Schlüssel je Bereich). */
export const MAX_PUNKTZAHLEN = [40, 60, 80, 100, 120, 150, 200];

/** Wortstufe zur Dezimalnote (offizielle Bänder, linearer Schlüssel BW). */
export function noteWort(note) {
  if (note <= 1.4) return "sehr gut";
  if (note <= 2.4) return "gut";
  if (note <= 3.4) return "befriedigend";
  if (note <= 4.4) return "ausreichend";
  if (note <= 5.4) return "mangelhaft";
  return "ungenügend";
}

/** Wortstufe öffentlich (für UI). */
export const wortStufe = noteWort;

/**
 * Linearer Punkteschlüssel (Abschlussprüfung BW, grüne Berufe): Dezimalnote
 * Note = 6 − 5 · (Punkte / Maximalpunktzahl), auf 2 Nachkommastellen, 1,0–6,0.
 * Beispiel 100er: 100→1,0 · 80→2,0 · 50→3,5 · 40→4,0 · 0→6,0.
 * „ausreichend" (Bereich erreicht) bis Note 4,4. Das offizielle Gesamtergebnis
 * (Gewichtung, Sperrfach/Bestehensregeln) ist eine Fachentscheidung und folgt
 * mit dem Gärtner-Gesamtschema.
 */
export function noteAusPunkten(punkte, max = 100) {
  const m = Number(max) > 0 ? Number(max) : 100;
  const p = Math.max(0, Math.min(m, Math.round(Number(punkte) || 0)));
  const note = Math.max(1, Math.min(6, Math.round((6 - 5 * (p / m)) * 100) / 100));
  const wort = noteWort(note);
  return { punkte: p, max: m, note, wort, ausreichend: note <= 4.4 };
}

/** TRUNC(x, 1) wie in Excel: zur Null hin auf 1 Nachkommastelle abschneiden. */
export function trunc1(x) {
  return Math.trunc(x * 10 + (x >= 0 ? 1e-9 : -1e-9)) / 10;
}

/** Wert robust in Zahl wandeln (Komma erlaubt); leer/ungültig → null. */
export function zahlOderNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Galabau-Gesamtbewertung nach dem Sammelbewertungsbogen
 * „Abschlussprüfung Gärtner/in BW, FR Garten- und Landschaftsbau":
 *  - Praxis-Schnitt  O  = TRUNC(Mittel der 5 praktischen Bereiche, 1)
 *  - Kenntnis-Schnitt AA = TRUNC(Mittel der 4 Kenntnisbereiche, 1)
 *  - GESAMTNOTE      AB = TRUNC(O·0,6 + AA·0,4, 1)   (Praxis 60 %, Kenntnis 40 %)
 *  - bestanden = Nein, wenn O≥4,5 ODER AA≥4,5 ODER AB≥4,5
 *    ODER ein Bereich ≥5,5 (Sperrfach) ODER ≥2 Bereiche ≥4,5.
 * @param praxis   Array[5] Dezimalnoten (oder null)
 * @param kenntnis Array[4] Dezimalnoten (oder null)
 */
export function gesamtGalabau(praxis, kenntnis) {
  const P = praxis.map(zahlOderNull);
  const K = kenntnis.map(zahlOderNull);
  const pVoll = P.every((n) => n !== null);
  const kVoll = K.every((n) => n !== null);
  const O = pVoll ? trunc1(P.reduce((a, b) => a + b, 0) / 5) : null;
  const AA = kVoll ? trunc1(K.reduce((a, b) => a + b, 0) / 4) : null;
  const AB = O !== null && AA !== null ? trunc1(O * 0.6 + AA * 0.4) : null;

  const bereiche = [...P, ...K].filter((n) => n !== null);
  const anzahl55 = bereiche.filter((n) => n >= 5.5).length;
  const anzahl45 = bereiche.filter((n) => n >= 4.5).length;

  let bestanden = null;
  const gruende = [];
  if (O !== null && AA !== null && AB !== null) {
    if (O >= 4.5) gruende.push("Praxis-Schnitt ≥ 4,5");
    if (AA >= 4.5) gruende.push("Kenntnis-Schnitt ≥ 4,5");
    if (AB >= 4.5) gruende.push("Gesamtnote ≥ 4,5");
    if (anzahl55 >= 1) gruende.push("Sperrfach: Bereich ≥ 5,5 (ungenügend)");
    if (anzahl45 >= 2) gruende.push("≥ 2 Bereiche ≥ 4,5 (mangelhaft)");
    bestanden = gruende.length === 0;
  }
  return { praxis: O, kenntnis: AA, gesamt: AB, bestanden, anzahl55, anzahl45, gruende };
}

const _ERG_INDEX = { k1: 0, k2: 1, k3: 2, k4: 3 };

/**
 * Wendet eine mündliche Ergänzungsprüfung auf EINEN Kenntnisbereich an: die
 * Bereichsnote wird zu TRUNC((2·schriftlich + 1·mündlich)/3, 1) gewichtet
 * (schriftlich zählt doppelt). Gibt ein neues Notenarray zurück; ungültige oder
 * unvollständige Eingaben lassen das Array unverändert. Ob eine Ergänzung
 * zulässig ist, entscheidet der Prüfungsausschuss — hier wird nur gerechnet.
 */
export function ergaenzteKenntnis(kenntnis, bereichKey, muendlich) {
  const K = kenntnis.map(zahlOderNull);
  const idx = _ERG_INDEX[bereichKey];
  const m = zahlOderNull(muendlich);
  if (idx === undefined || m === null || K[idx] === null) return K;
  const out = K.slice();
  out[idx] = trunc1((2 * K[idx] + m) / 3);
  return out;
}

/**
 * Gründe des Nichtbestehens (oder []) zu einer gespeicherten Bewertungszeile:
 * rekonstruiert die Bereichsnoten und wendet eine evtl. mündliche Ergänzung an,
 * sodass der Grund überall identisch zur Live-Vorschau im Bewerten-Dialog ist.
 * So muss der Grund nicht zusätzlich gespeichert werden (eine Quelle, kein
 * Doppelstand). Felder p1..p5 / k1..k4 müssen in der Zeile enthalten sein.
 */
export function bewertungGruende(b) {
  if (!b) return [];
  const praxis = [b.p1, b.p2, b.p3, b.p4, b.p5];
  const kenntnis = [b.k1, b.k2, b.k3, b.k4];
  const kEff = (b.ergaenzung_bereich && b.ergaenzung_note != null)
    ? ergaenzteKenntnis(kenntnis, b.ergaenzung_bereich, b.ergaenzung_note)
    : kenntnis;
  return gesamtGalabau(praxis, kEff).gruende;
}

/**
 * Pflanzenkenntnisse-Teilnote nach offiziellem Schlüssel:
 * TRUNC((2·schriftliche PK + 1·Pflanzenbestimmung)/3, 1). Null, wenn unvollständig.
 */
export function pflanzenkenntnisNote(schriftlich, bestimmung) {
  const s = zahlOderNull(schriftlich), b = zahlOderNull(bestimmung);
  if (s === null || b === null) return null;
  return trunc1((2 * s + b) / 3);
}
