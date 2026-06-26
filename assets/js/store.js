// store.js — Persistenz- und CRUD-Schicht über PGlite (db.js).
//
// Baut die Tabellen generisch aus model.js, kapselt Anlegen/Ändern/Löschen/
// Suchen. Die globale Fuzzy-Suche läuft DB-seitig (globaleSuche aus db.js).
// Persistenz in OPFS; fällt automatisch auf IndexedDB bzw. In-Memory zurück,
// wenn die Umgebung OPFS nicht erlaubt (Barrierefreiheit: nie weißer Schirm).

import { initDB, createTable, globaleSuche } from "./db.js";
import { ENTITAETEN, suchspalten } from "./model.js";

const ABLAGEN = [
  { uri: "opfs-ahp://rpf-ausbildungspruefung", modus: "OPFS", persistent: true },
  { uri: "idb://rpf-ausbildungspruefung",      modus: "IndexedDB", persistent: true },
  { uri: "memory://",                          modus: "Arbeitsspeicher", persistent: false },
];

let _pg = null;
let _modus = null;

/** Öffnet die DB (erste verfügbare Ablage) und legt alle Tabellen an. */
export async function oeffnen() {
  if (_pg) return { pg: _pg, modus: _modus };
  let letzterFehler;
  for (const a of ABLAGEN) {
    try {
      const pg = await initDB(a.uri);
      _pg = pg;
      _modus = a;
      break;
    } catch (e) {
      letzterFehler = e;
      console.warn("DB-Ablage nicht verfügbar:", a.uri, e);
    }
  }
  if (!_pg) throw new Error("Keine Datenbank verfügbar: " + (letzterFehler && letzterFehler.message));

  for (const e of Object.values(ENTITAETEN)) {
    await createTable(
      _pg,
      e.key,
      e.felder.map((f) => ({ name: f.name, typ: f.typ })),
      suchspalten(e)
    );
  }

  // Zuteilung Prüfling <-> Prüfungstermin (Join, m:n) für die Tagesplanung.
  await _pg.exec(`
    CREATE TABLE IF NOT EXISTS zuteilungen (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pruefung_id  bigint NOT NULL,
      pruefling_id bigint NOT NULL,
      slot text,
      reihenfolge int DEFAULT 0,
      UNIQUE (pruefung_id, pruefling_id)
    );
  `);
  // Zuteilung Prüfer:in <-> Prüfungstermin (Ausschuss je Termin).
  await _pg.exec(`
    CREATE TABLE IF NOT EXISTS pruefer_zuteilungen (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pruefung_id bigint NOT NULL,
      pruefer_id  bigint NOT NULL,
      rolle text,
      UNIQUE (pruefung_id, pruefer_id)
    );
  `);
  // Gesamtbewertung je Prüfling (Punkte -> Dezimalnote über linearen Schlüssel).
  await _pg.exec(`
    CREATE TABLE IF NOT EXISTS bewertungen (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pruefling_id bigint NOT NULL UNIQUE,
      punkte int,
      max_punkte int DEFAULT 100,
      note numeric,
      note_wort text,
      status text,
      bemerkung text
    );
    -- Migration bestehender Datenbanken auf das lineare Dezimal-Schema
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS max_punkte int DEFAULT 100;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS note_wort text;
    ALTER TABLE bewertungen ALTER COLUMN note TYPE numeric USING note::numeric;
  `);
  return { pg: _pg, modus: _modus };
}

function ent(key) {
  const e = ENTITAETEN[key];
  if (!e) throw new Error("Unbekannte Entität: " + key);
  return e;
}

/** Alle Datensätze einer Entität, in fachlicher Ordnung. */
export async function liste(key) {
  const e = ent(key);
  const res = await _pg.query(`SELECT * FROM ${e.key} ORDER BY ${e.ordnung}`);
  return res.rows;
}

/** Globale, multitokenbasierte Fuzzy-Suche (DB-seitig). Leerer Query => Liste. */
export async function suche(key, query) {
  const e = ent(key);
  if (!String(query || "").trim()) return liste(key);
  return globaleSuche(_pg, e.key, query, { limit: 200 });
}

export async function holen(key, id) {
  const e = ent(key);
  const res = await _pg.query(`SELECT * FROM ${e.key} WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

/** Wert für die Persistenz aufbereiten (leere Strings -> NULL). */
function wert(feld, daten) {
  let v = daten[feld.name];
  if (v === undefined || v === "" || v === null) return null;
  if (feld.typ === "integer") {
    const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  if (feld.typ === "numeric") {
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return v;
}

export async function anlegen(key, daten) {
  const e = ent(key);
  const cols = e.felder.map((f) => f.name);
  const params = e.felder.map((f) => wert(f, daten));
  const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
  const res = await _pg.query(
    `INSERT INTO ${e.key} (${cols.join(", ")}) VALUES (${ph}) RETURNING id`,
    params
  );
  return res.rows[0].id;
}

export async function aendern(key, id, daten) {
  const e = ent(key);
  const sets = e.felder.map((f, i) => `${f.name} = $${i + 1}`).join(", ");
  const params = e.felder.map((f) => wert(f, daten));
  params.push(id);
  await _pg.query(`UPDATE ${e.key} SET ${sets} WHERE id = $${params.length}`, params);
  return id;
}

export async function loeschen(key, id) {
  const e = ent(key);
  // abhängige Zuteilungen mitentfernen (kein Datenmüll)
  if (key === "prueflinge") {
    await _pg.query(`DELETE FROM zuteilungen WHERE pruefling_id = $1`, [id]);
    await _pg.query(`DELETE FROM bewertungen WHERE pruefling_id = $1`, [id]);
  }
  if (key === "pruefer")    await _pg.query(`DELETE FROM pruefer_zuteilungen WHERE pruefer_id = $1`, [id]);
  if (key === "pruefungen") {
    await _pg.query(`DELETE FROM zuteilungen WHERE pruefung_id = $1`, [id]);
    await _pg.query(`DELETE FROM pruefer_zuteilungen WHERE pruefung_id = $1`, [id]);
  }
  await _pg.query(`DELETE FROM ${e.key} WHERE id = $1`, [id]);
}

/* ------------------------------------------------------- Zuteilung/Planung */

/** Einem Prüfungstermin zugeteilte Prüflinge (mit Slot), sortiert. */
export async function zuteilungenFuer(pruefungId) {
  const res = await _pg.query(
    `SELECT z.id AS zuteilung_id, z.slot, z.reihenfolge, p.*
       FROM zuteilungen z JOIN prueflinge p ON p.id = z.pruefling_id
      WHERE z.pruefung_id = $1
      ORDER BY z.slot NULLS LAST, z.reihenfolge, p.nachname, p.vorname`,
    [pruefungId]
  );
  return res.rows;
}

/** Prüflinge, die diesem Termin noch nicht zugeteilt sind. */
export async function nichtZugeteilt(pruefungId) {
  const res = await _pg.query(
    `SELECT * FROM prueflinge
      WHERE id NOT IN (SELECT pruefling_id FROM zuteilungen WHERE pruefung_id = $1)
      ORDER BY nachname, vorname`,
    [pruefungId]
  );
  return res.rows;
}

/** Teilt einen Prüfling einem Termin zu (idempotent; aktualisiert ggf. Slot). */
export async function zuteilen(pruefungId, prueflingId, slot = null) {
  await _pg.query(
    `INSERT INTO zuteilungen (pruefung_id, pruefling_id, slot) VALUES ($1, $2, $3)
       ON CONFLICT (pruefung_id, pruefling_id) DO UPDATE SET slot = EXCLUDED.slot`,
    [pruefungId, prueflingId, slot || null]
  );
}

export async function entferneZuteilung(zuteilungId) {
  await _pg.query(`DELETE FROM zuteilungen WHERE id = $1`, [zuteilungId]);
}

/**
 * Terminkonflikte: andere Prüfungstermine am selben Datum, denen dieser
 * Prüfling ebenfalls zugeteilt ist (Doppelbelegung am selben Tag).
 */
export async function terminkonflikte(prueflingId, pruefungId) {
  const res = await _pg.query(
    `SELECT pr.titel, pr.datum
       FROM zuteilungen z
       JOIN pruefungen pr ON pr.id = z.pruefung_id
      WHERE z.pruefling_id = $1
        AND z.pruefung_id <> $2
        AND pr.datum = (SELECT datum FROM pruefungen WHERE id = $2)`,
    [prueflingId, pruefungId]
  );
  return res.rows;
}

/** Einem Prüfungstermin zugeteilte Prüfer:innen (mit Rolle), sortiert. */
export async function prueferFuer(pruefungId) {
  const res = await _pg.query(
    `SELECT pz.id AS zuteilung_id, pz.rolle, p.*
       FROM pruefer_zuteilungen pz JOIN pruefer p ON p.id = pz.pruefer_id
      WHERE pz.pruefung_id = $1
      ORDER BY pz.rolle NULLS LAST, p.nachname, p.vorname`,
    [pruefungId]
  );
  return res.rows;
}

/** Prüfer:innen, die diesem Termin noch nicht zugeteilt sind. */
export async function prueferOffen(pruefungId) {
  const res = await _pg.query(
    `SELECT * FROM pruefer
      WHERE id NOT IN (SELECT pruefer_id FROM pruefer_zuteilungen WHERE pruefung_id = $1)
      ORDER BY nachname, vorname`,
    [pruefungId]
  );
  return res.rows;
}

export async function prueferZuteilen(pruefungId, prueferId, rolle = null) {
  await _pg.query(
    `INSERT INTO pruefer_zuteilungen (pruefung_id, pruefer_id, rolle) VALUES ($1, $2, $3)
       ON CONFLICT (pruefung_id, pruefer_id) DO UPDATE SET rolle = EXCLUDED.rolle`,
    [pruefungId, prueferId, rolle || null]
  );
}

export async function entfernePrueferZuteilung(zuteilungId) {
  await _pg.query(`DELETE FROM pruefer_zuteilungen WHERE id = $1`, [zuteilungId]);
}

/* ------------------------------------------------------------ Notenberechnung */

/** Zulässige Maximalpunktzahlen (eigener Schlüssel je Bereich). */
export const MAX_PUNKTZAHLEN = [40, 60, 80, 100, 120, 150, 200];

/** Wortstufe zur Dezimalnote (offizielle Bänder, linearer Schlüssel BW). */
function noteWort(note) {
  if (note <= 1.4) return "sehr gut";
  if (note <= 2.4) return "gut";
  if (note <= 3.4) return "befriedigend";
  if (note <= 4.4) return "ausreichend";
  if (note <= 5.4) return "mangelhaft";
  return "ungenügend";
}

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

/** Setzt/aktualisiert die Gesamtbewertung eines Prüflings. */
export async function setzeBewertung(prueflingId, punkte, max = 100, bemerkung = null) {
  const r = noteAusPunkten(punkte, max);
  const status = r.ausreichend ? "ausreichend" : "nicht bestanden";
  await _pg.query(
    `INSERT INTO bewertungen (pruefling_id, punkte, max_punkte, note, note_wort, status, bemerkung)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pruefling_id) DO UPDATE
         SET punkte = EXCLUDED.punkte, max_punkte = EXCLUDED.max_punkte,
             note = EXCLUDED.note, note_wort = EXCLUDED.note_wort,
             status = EXCLUDED.status, bemerkung = EXCLUDED.bemerkung`,
    [prueflingId, r.punkte, r.max, r.note, r.wort, status, bemerkung || null]
  );
  return r;
}

/** Alle Prüflinge mit (optionaler) Bewertung, fachlich sortiert. */
export async function bewertungenListe() {
  const res = await _pg.query(
    `SELECT p.id AS pruefling_id, p.nachname, p.vorname, p.beruf,
            b.punkte, b.max_punkte, b.note, b.note_wort, b.status, b.bemerkung
       FROM prueflinge p LEFT JOIN bewertungen b ON b.pruefling_id = p.id
      ORDER BY p.nachname, p.vorname`
  );
  return res.rows;
}

/** Alle Daten für ein Zeugnis: Prüfling + Bewertung + (erster) Prüfungstermin. */
export async function zeugnisDaten(prueflingId) {
  const p = (await _pg.query(
    `SELECT p.*, b.punkte, b.max_punkte, b.note, b.note_wort, b.status
       FROM prueflinge p LEFT JOIN bewertungen b ON b.pruefling_id = p.id
      WHERE p.id = $1`,
    [prueflingId]
  )).rows[0];
  if (!p) return null;
  const t = (await _pg.query(
    `SELECT pr.titel, pr.datum, pr.ort
       FROM zuteilungen z JOIN pruefungen pr ON pr.id = z.pruefung_id
      WHERE z.pruefling_id = $1 ORDER BY pr.datum LIMIT 1`,
    [prueflingId]
  )).rows[0] || null;
  return { ...p, termin: t };
}

/** Notenverteilung nach Wortstufe für Auswertungen/Diagramme. */
export async function notenVerteilung() {
  const res = await _pg.query(
    `SELECT note_wort, count(*)::int AS wert FROM bewertungen
      WHERE note_wort IS NOT NULL GROUP BY note_wort`
  );
  const map = {};
  res.rows.forEach((r) => { map[r.note_wort] = r.wert; });
  const stufen = ["sehr gut", "gut", "befriedigend", "ausreichend", "mangelhaft", "ungenügend"];
  return stufen.map((s) => ({ label: s, wert: map[s] || 0 }));
}

export async function anzahl(key) {
  const e = ent(key);
  const res = await _pg.query(`SELECT count(*)::int AS n FROM ${e.key}`);
  return res.rows[0].n;
}

/** Häufigkeiten einer Spalte (für Auswertungen/Diagramme). */
export async function gruppiert(key, spalte) {
  const e = ent(key);
  const res = await _pg.query(
    `SELECT coalesce(nullif(${spalte}::text, ''), '—') AS label, count(*)::int AS wert
       FROM ${e.key} GROUP BY 1 ORDER BY wert DESC, label`
  );
  return res.rows;
}

/** Distinkte, nicht-leere Werte einer Spalte (für Vorschlagslisten/datalist). */
export async function werteFuer(key, feld) {
  const e = ent(key);
  const res = await _pg.query(
    `SELECT DISTINCT ${feld} AS v FROM ${e.key}
       WHERE ${feld} IS NOT NULL AND btrim(${feld}::text) <> '' ORDER BY 1`
  );
  return res.rows.map((r) => r.v);
}

/**
 * Sucht mögliche Dubletten anhand der Identitätsfelder (case-insensitive,
 * exakt nach Trimmen). Optional eine id ausschließen (beim Bearbeiten).
 */
export async function findeDubletten(key, daten, ausschlussId = null) {
  const e = ent(key);
  const felder = e.dublette;
  if (!felder || !felder.length) return [];
  const teile = felder.map((f, i) => `lower(btrim(${f}::text)) = lower(btrim($${i + 1}))`);
  const params = felder.map((f) => String(daten[f] == null ? "" : daten[f]));
  let sql = `SELECT * FROM ${e.key} WHERE ${teile.join(" AND ")}`;
  if (ausschlussId != null) { params.push(ausschlussId); sql += ` AND id <> $${params.length}`; }
  const res = await _pg.query(sql, params);
  return res.rows;
}

/**
 * Legt einmalig fiktive Beispieldaten an (nur wenn alle Tabellen leer sind).
 * Bewusst erfundene Daten — keine echten personenbezogenen Daten im Repo.
 */
export async function beispieldatenEinmalig() {
  const summe =
    (await anzahl("prueflinge")) +
    (await anzahl("betriebe")) +
    (await anzahl("pruefer")) +
    (await anzahl("pruefungen"));
  if (summe > 0) return false;

  const betriebe = [
    { name: "Weingut am Kaiserstuhl", strasse: "Rebenweg 3", plz: "79206", ort: "Breisach", ansprechpartner: "C. Vogt", email: "ausbildung@weingut-kaiserstuhl.example", telefon: "07667 1234" },
    { name: "Gärtnerei Ihringen",     strasse: "Blumenstr. 12", plz: "79241", ort: "Ihringen", ansprechpartner: "M. Bauer", email: "info@gaertnerei-ihringen.example", telefon: "07668 5678" },
    { name: "Schäfer & Söhne GbR",    strasse: "Feldweg 8", plz: "79379", ort: "Müllheim", ansprechpartner: "T. Schäfer", email: "kontakt@schaefer-soehne.example", telefon: "07631 4321" },
    { name: "Hof Sonnenhalde",        strasse: "Sonnenhalde 1", plz: "79249", ort: "Merzhausen", ansprechpartner: "A. Lehmann", email: "hof@sonnenhalde.example", telefon: "0761 99887" },
  ];
  for (const b of betriebe) await anlegen("betriebe", b);

  const prueflinge = [
    { nachname: "Albrecht", vorname: "Lena", beruf: "Winzer/in", betrieb: "Weingut am Kaiserstuhl", pruefungsjahr: 2026, status: "zugelassen" },
    { nachname: "Brenner",  vorname: "Tim",  beruf: "Gärtner/in", betrieb: "Gärtnerei Ihringen", pruefungsjahr: 2026, status: "angemeldet" },
    { nachname: "Conrad",   vorname: "Sara", beruf: "Landwirt/in", betrieb: "Schäfer & Söhne GbR", pruefungsjahr: 2026, status: "zugelassen" },
    { nachname: "Dietz",    vorname: "Jonas",beruf: "Winzer/in", betrieb: "Weingut am Kaiserstuhl", pruefungsjahr: 2025, status: "bestanden" },
    { nachname: "Engel",    vorname: "Mara", beruf: "Hauswirtschafter/in", betrieb: "Hof Sonnenhalde", pruefungsjahr: 2026, status: "angemeldet" },
    { nachname: "Fischer",  vorname: "Noah", beruf: "Gärtner/in", betrieb: "Gärtnerei Ihringen", pruefungsjahr: 2026, status: "zugelassen" },
  ];
  for (const p of prueflinge) await anlegen("prueflinge", p);

  const pruefer = [
    { nachname: "Wagner",  vorname: "Petra",  organisation: "RP Freiburg", funktion: "Vorsitz", email: "p.wagner@rpf.example", telefon: "0761 2080" },
    { nachname: "Keller",  vorname: "Bernd",  organisation: "Kreis Emmendingen", funktion: "Beisitz Arbeitgeber", email: "b.keller@lkemmendingen.example", telefon: "07641 1110" },
    { nachname: "Hoffmann",vorname: "Ute",    organisation: "GBA Freiburg", funktion: "Lehrkraft", email: "u.hoffmann@gba-fr.example", telefon: "0761 3330" },
  ];
  for (const p of pruefer) await anlegen("pruefer", p);

  const pruefungen = [
    { titel: "Praktische AP Winzer/in", beruf: "Winzer/in", datum: "2026-07-14", zeit_von: "08:00", zeit_bis: "16:00", ort: "Weingut am Kaiserstuhl", raum: "Kelterhalle" },
    { titel: "Praktische AP Gärtner/in", beruf: "Gärtner/in", datum: "2026-07-16", zeit_von: "08:30", zeit_bis: "15:30", ort: "Gärtnerei Ihringen", raum: "Gewächshaus 2" },
  ];
  for (const p of pruefungen) await anlegen("pruefungen", p);

  return true;
}
