// store.js — Persistenz- und CRUD-Schicht über PGlite (db.js).
//
// Baut die Tabellen generisch aus model.js, kapselt Anlegen/Ändern/Löschen/
// Suchen. Die globale Fuzzy-Suche läuft DB-seitig (globaleSuche aus db.js).
// Persistenz in OPFS; fällt automatisch auf IndexedDB bzw. In-Memory zurück,
// wenn die Umgebung OPFS nicht erlaubt (Barrierefreiheit: nie weißer Schirm).

import { initDB, createTable, globaleSuche } from "./db.js";
import { ENTITAETEN, suchspalten } from "./model.js";

const ABLAGEN = [
  { uri: "idb://rpf-ausbildungspruefung",      modus: "IndexedDB", persistent: true },
  { uri: "opfs-ahp://rpf-ausbildungspruefung", modus: "OPFS", persistent: true },
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
      status text DEFAULT 'offen',
      UNIQUE (pruefung_id, pruefer_id)
    );
    ALTER TABLE pruefer_zuteilungen ADD COLUMN IF NOT EXISTS status text DEFAULT 'offen';
  `);
  // Abwesenheiten je Prüfer:in (einzelne Tage) — die Auto-Planung besetzt an
  // diesen Tagen keinen Ausschuss mit dieser Person.
  await _pg.exec(`
    CREATE TABLE IF NOT EXISTS pruefer_abwesenheit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pruefer_id bigint NOT NULL,
      datum date NOT NULL,
      UNIQUE (pruefer_id, datum)
    );
  `);
  // Bewertung je Prüfling nach dem Galabau-Sammelbewertungsbogen:
  // 5 praktische Bereiche (p1..p5) + 4 Kenntnisbereiche (k1..k4) als Dezimalnoten,
  // dazu die berechneten Schnitte und das Gesamtergebnis.
  await _pg.exec(`
    CREATE TABLE IF NOT EXISTS bewertungen (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pruefling_id bigint NOT NULL UNIQUE,
      p1 numeric, p2 numeric, p3 numeric, p4 numeric, p5 numeric,
      k1 numeric, k2 numeric, k3 numeric, k4 numeric,
      praxis numeric, kenntnis numeric, gesamt numeric, bestanden boolean,
      bemerkung text
    );
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS p1 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS p2 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS p3 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS p4 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS p5 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS k1 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS k2 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS k3 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS k4 numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS praxis numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS kenntnis numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS gesamt numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS bestanden boolean;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS pk_schriftlich numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS pk_bestimmung numeric;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS ergaenzung_bereich text;
    ALTER TABLE bewertungen ADD COLUMN IF NOT EXISTS ergaenzung_note numeric;
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

/**
 * Schnellsuche über alle Stammdaten zugleich (Prüflinge, Betriebe, Prüfer:innen,
 * Termine). DB-seitige Trigramm-Fuzzy-Suche je Entität, wenige Treffer je Gruppe.
 * @returns {{prueflinge:Array,betriebe:Array,pruefer:Array,pruefungen:Array}}
 */
export async function schnellsuche(query, { proGruppe = 8 } = {}) {
  const q = String(query || "").trim();
  const leer = { prueflinge: [], betriebe: [], pruefer: [], pruefungen: [] };
  if (!q) return leer;
  for (const key of Object.keys(leer)) {
    leer[key] = await globaleSuche(_pg, ENTITAETEN[key].key, q, { limit: proGruppe });
  }
  return leer;
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
  if (key === "pruefer") {
    await _pg.query(`DELETE FROM pruefer_zuteilungen WHERE pruefer_id = $1`, [id]);
    await _pg.query(`DELETE FROM pruefer_abwesenheit WHERE pruefer_id = $1`, [id]);
  }
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

/**
 * Ergebnisliste eines Prüfungstermins: zugeteilte Prüflinge in Slot-Reihenfolge
 * samt Bewertung (für die druckbare Niederschrift). Verknüpft Planung und Noten.
 */
export async function terminErgebnisse(pruefungId) {
  const res = await _pg.query(
    `SELECT z.slot, p.nachname, p.vorname, p.betrieb,
            b.praxis, b.kenntnis, b.gesamt, b.bestanden,
            b.p1, b.p2, b.p3, b.p4, b.p5, b.k1, b.k2, b.k3, b.k4,
            b.ergaenzung_bereich, b.ergaenzung_note
       FROM zuteilungen z JOIN prueflinge p ON p.id = z.pruefling_id
       LEFT JOIN bewertungen b ON b.pruefling_id = p.id
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
 * Teilt alle noch nicht zugeteilten Prüflinge der Termin-Fachrichtung diesem
 * Termin zu (alphabetische Reihenfolge). Uhrzeiten bleiben offen und werden
 * manuell oder später per Tagesraster vergeben.
 * @returns {{zugeteilt:number}}
 */
export async function autoZuteilenNachFachrichtung(pruefungId) {
  const t = (await _pg.query(`SELECT beruf FROM pruefungen WHERE id = $1`, [pruefungId])).rows[0];
  if (!t || !t.beruf) return { zugeteilt: 0 };
  const res = await _pg.query(
    `INSERT INTO zuteilungen (pruefung_id, pruefling_id, slot, reihenfolge)
     SELECT $1::bigint, x.id, NULL, x.rn
     FROM (
       SELECT p.id, row_number() OVER (ORDER BY p.nachname, p.vorname) AS rn
         FROM prueflinge p
        WHERE p.beruf = $2
          AND p.id NOT IN (SELECT pruefling_id FROM zuteilungen WHERE pruefung_id = $1)
     ) x
     ON CONFLICT (pruefung_id, pruefling_id) DO NOTHING
     RETURNING pruefling_id`,
    [pruefungId, t.beruf]
  );
  return { zugeteilt: res.rows.length };
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
    `SELECT pz.id AS zuteilung_id, pz.rolle, pz.status, p.*
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

/** Datum (Date oder String) auf "YYYY-MM-DD" normalisieren. */
function isoDatum(d) {
  if (d instanceof Date && !isNaN(d)) {
    return String(d.getFullYear()) + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  return String(d || "").slice(0, 10);
}

/** Abwesenheitstage einer Prüferin/eines Prüfers. */
export async function abwesenheitenFuer(prueferId) {
  const r = await _pg.query(
    `SELECT id, datum FROM pruefer_abwesenheit WHERE pruefer_id = $1 ORDER BY datum`, [prueferId]
  );
  return r.rows;
}

/** Einen Abwesenheitstag setzen (idempotent). */
export async function abwesenheitSetzen(prueferId, datum) {
  if (!datum) return;
  await _pg.query(
    `INSERT INTO pruefer_abwesenheit (pruefer_id, datum) VALUES ($1, $2)
       ON CONFLICT (pruefer_id, datum) DO NOTHING`, [prueferId, datum]
  );
}

/** Einen Abwesenheitstag entfernen. */
export async function abwesenheitEntfernen(id) {
  await _pg.query(`DELETE FROM pruefer_abwesenheit WHERE id = $1`, [id]);
}

/** Zusage-Status einer Prüfer-Zuteilung setzen (offen/angefragt/zugesagt/abgesagt). */
export async function setzePrueferStatus(zuteilungId, status) {
  await _pg.query(`UPDATE pruefer_zuteilungen SET status = $2 WHERE id = $1`, [zuteilungId, status]);
}

/** Alle „offenen" Prüfer eines Termins auf „angefragt" setzen. */
export async function anfrageStellen(pruefungId) {
  const res = await _pg.query(
    `UPDATE pruefer_zuteilungen SET status = 'angefragt'
      WHERE pruefung_id = $1 AND coalesce(status,'offen') = 'offen' RETURNING id`,
    [pruefungId]
  );
  return res.rows.length;
}

/**
 * Intelligente Gesamtplanung (ersetzt vorhandene Zuteilungen):
 * Verteilt je Fachrichtung alle Prüflinge möglichst gleichmäßig auf passend
 * viele Prüfungstermine (Kapazität je Tag), nach PLZ des Betriebs geclustert,
 * legt fehlende Termine automatisch an und besetzt je Termin einen Ausschuss
 * (Vorsitz + 2 Beisitz) aus dem Prüfer-Pool (Last ausgeglichen).
 */
/** Addiert Minuten auf eine "HH:MM"-Zeit (24-h, ohne Datum). */
function _addMinuten(hhmm, minuten) {
  const teile = String(hhmm || "08:00").split(":");
  const h = parseInt(teile[0], 10) || 0;
  const m = parseInt(teile[1], 10) || 0;
  const total = h * 60 + m + Math.round(minuten);
  const hh = Math.floor(total / 60) % 24;
  const mm = ((total % 60) + 60) % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

const ZEITRASTER_MINUTEN = 20; // Standard-Taktung je Prüfling

/**
 * Vergibt fortlaufende Uhrzeit-Slots an alle Prüflinge eines Termins (in der
 * vorhandenen Reihenfolge). Verbindet Planung und Tagesablauf: aus einer Aktion
 * entsteht der komplette Zeitplan des Prüfungstags.
 * @returns {{anzahl:number, beginn:string, minuten:number}}
 */
export async function zeitrasterVergeben(pruefungId, start = null, minuten = ZEITRASTER_MINUTEN) {
  const t = (await _pg.query(`SELECT zeit_von FROM pruefungen WHERE id = $1`, [pruefungId])).rows[0];
  const beginn = start || (t && t.zeit_von) || "08:00";
  const step = Math.max(1, Number(minuten) || ZEITRASTER_MINUTEN);
  const rows = (await _pg.query(
    `SELECT id FROM zuteilungen WHERE pruefung_id = $1 ORDER BY reihenfolge, slot NULLS LAST, id`,
    [pruefungId]
  )).rows;
  for (let i = 0; i < rows.length; i++) {
    await _pg.query(`UPDATE zuteilungen SET slot = $2 WHERE id = $1`, [rows[i].id, _addMinuten(beginn, i * step)]);
  }
  return { anzahl: rows.length, beginn, minuten: step };
}

/** Löscht die Uhrzeit-Slots eines Termins (Reihenfolge bleibt erhalten). */
export async function zeitrasterLoeschen(pruefungId) {
  await _pg.query(`UPDATE zuteilungen SET slot = NULL WHERE pruefung_id = $1`, [pruefungId]);
}

export async function planungAutomatisch(kapazitaet = 12) {
  const cap = Math.max(1, Number(kapazitaet) || 12);
  await _pg.exec(`TRUNCATE zuteilungen RESTART IDENTITY; TRUNCATE pruefer_zuteilungen RESTART IDENTITY;`);

  const pruefer = (await _pg.query(`SELECT id FROM pruefer ORDER BY nachname, vorname`)).rows;
  // Abwesenheiten je Tag: an diesen Tagen wird die Person nicht eingeteilt.
  const abwesend = new Map(); // "YYYY-MM-DD" -> Set(pruefer_id)
  (await _pg.query(`SELECT pruefer_id, datum FROM pruefer_abwesenheit`)).rows.forEach((r) => {
    const k = isoDatum(r.datum);
    if (!abwesend.has(k)) abwesend.set(k, new Set());
    abwesend.get(k).add(r.pruefer_id);
  });
  let prCursor = 0;
  // Belegung je Prüfungstag: verhindert Doppelbelegung einer Prüferin/eines
  // Prüfers am selben Datum (auch fachrichtungsübergreifend).
  const tagBelegung = new Map();
  const naechstePruefer = (n, datum) => {
    const tagSet = tagBelegung.get(datum) || new Set();
    const abw = abwesend.get(datum) || new Set();
    const out = [], imAusschuss = new Set();
    // 1. Durchgang: bevorzugt am selben Tag noch freie, nicht abwesende Prüfer:innen.
    let versuche = 0;
    while (out.length < n && pruefer.length && versuche < pruefer.length) {
      const pr = pruefer[prCursor++ % pruefer.length];
      versuche++;
      if (imAusschuss.has(pr.id) || tagSet.has(pr.id) || abw.has(pr.id)) continue;
      out.push(pr.id); imAusschuss.add(pr.id);
    }
    // 2. Durchgang: notfalls auffüllen (Tageskonflikt in Kauf nehmen) — Abwesende
    // bleiben aber ausgeschlossen.
    versuche = 0;
    while (out.length < n && pruefer.length && versuche < pruefer.length * 2) {
      const pr = pruefer[prCursor++ % pruefer.length];
      versuche++;
      if (imAusschuss.has(pr.id) || abw.has(pr.id)) continue;
      out.push(pr.id); imAusschuss.add(pr.id);
    }
    out.forEach((id) => tagSet.add(id));
    tagBelegung.set(datum, tagSet);
    return out;
  };

  const berufe = (await _pg.query(
    `SELECT DISTINCT beruf FROM prueflinge WHERE beruf IS NOT NULL AND btrim(beruf) <> '' ORDER BY beruf`
  )).rows.map((r) => r.beruf);

  const zRows = [], pzRows = [];
  let summeTermine = 0;
  const ROLLEN = ["Vorsitz", "Beisitz Arbeitgeber", "Beisitz Arbeitnehmer"];

  for (const beruf of berufe) {
    const pl = (await _pg.query(
      `SELECT p.id, coalesce(b.plz,'') AS plz
         FROM prueflinge p LEFT JOIN betriebe b ON b.name = p.betrieb
        WHERE p.beruf = $1
        ORDER BY b.plz NULLS LAST, b.ort NULLS LAST, p.nachname, p.vorname`,
      [beruf]
    )).rows;
    if (!pl.length) continue;

    const needed = Math.ceil(pl.length / cap);
    let termine = (await _pg.query(
      `SELECT id, zeit_von, datum FROM pruefungen WHERE beruf = $1 ORDER BY datum, id`, [beruf]
    )).rows;

    if (termine.length < needed) {
      const vorlage = (await _pg.query(
        `SELECT datum, ort, zeit_von, zeit_bis FROM pruefungen WHERE beruf = $1 ORDER BY datum DESC, id DESC LIMIT 1`, [beruf]
      )).rows[0] || { datum: "2026-07-13", ort: "Übungsgelände GBA Freiburg", zeit_von: "08:00", zeit_bis: "16:00" };
      const basis = new Date(vorlage.datum || "2026-07-13");
      const neu = [];
      for (let i = termine.length; i < needed; i++) {
        const d = new Date(basis);
        d.setDate(d.getDate() + (i - termine.length + 1));
        neu.push({
          titel: `Praktische AP ${beruf} (Gruppe ${i + 1})`, beruf,
          datum: d.toISOString().slice(0, 10),
          zeit_von: vorlage.zeit_von || "08:00", zeit_bis: vorlage.zeit_bis || "16:00",
          ort: vorlage.ort || "Übungsgelände GBA Freiburg", raum: `Gruppe ${i + 1}`,
        });
      }
      await bulkInsert("pruefungen", ["titel", "beruf", "datum", "zeit_von", "zeit_bis", "ort", "raum"], neu);
      termine = (await _pg.query(`SELECT id, zeit_von, datum FROM pruefungen WHERE beruf = $1 ORDER BY datum, id`, [beruf])).rows;
    }
    summeTermine += needed;

    // gleichmäßige, PLZ-zusammenhängende Gruppen (Größen unterscheiden sich um ≤1)
    const base = Math.floor(pl.length / needed), extra = pl.length % needed;
    let idx = 0;
    for (let g = 0; g < needed; g++) {
      const size = base + (g < extra ? 1 : 0);
      const termin = termine[g];
      const beginn = termin.zeit_von || "08:00";
      for (let k = 0; k < size; k++, idx++) {
        zRows.push({
          pruefung_id: termin.id, pruefling_id: pl[idx].id,
          slot: _addMinuten(beginn, k * ZEITRASTER_MINUTEN), reihenfolge: k + 1,
        });
      }
      const ausschuss = naechstePruefer(ROLLEN.length, termin.datum ? isoDatum(termin.datum) : ("g" + g));
      ausschuss.forEach((prId, i) =>
        pzRows.push({ pruefung_id: termin.id, pruefer_id: prId, rolle: ROLLEN[i] || "Beisitz", status: "offen" })
      );
    }
  }

  await bulkInsert("zuteilungen", ["pruefung_id", "pruefling_id", "slot", "reihenfolge"], zRows);
  await bulkInsert("pruefer_zuteilungen", ["pruefung_id", "pruefer_id", "rolle", "status"], pzRows);
  // Ohne Fachrichtung lässt sich kein:e Prüfling einplanen — Zahl zurückgeben,
  // damit die Oberfläche es transparent meldet (kein stilles Übergehen).
  const uebersprungen = (await _pg.query(
    `SELECT count(*)::int AS n FROM prueflinge
      WHERE (beruf IS NULL OR btrim(beruf) = '')
        AND lower(coalesce(status,'')) <> 'zurückgezogen'`
  )).rows[0].n;
  return { termine: summeTermine, zuteilungen: zRows.length, prueferZuteilungen: pzRows.length, uebersprungen };
}

/** Planungs-/Zusageliste: je Termin Eckdaten, Prüflingszahl und Prüfer mit Status. */
export async function planungsListe() {
  const termine = (await _pg.query(
    `SELECT pr.id, pr.titel, pr.beruf, pr.datum, pr.ort, pr.raum, pr.zeit_von,
            (SELECT count(*)::int FROM zuteilungen z WHERE z.pruefung_id = pr.id) AS anzahl_prueflinge
       FROM pruefungen pr ORDER BY pr.beruf, pr.datum, pr.id`
  )).rows;
  const pruefer = (await _pg.query(
    `SELECT pz.id AS zuteilung_id, pz.pruefung_id, pz.rolle, coalesce(pz.status,'offen') AS status,
            p.nachname, p.vorname, p.email, p.organisation
       FROM pruefer_zuteilungen pz JOIN pruefer p ON p.id = pz.pruefer_id
      ORDER BY pz.rolle NULLS LAST, p.nachname`
  )).rows;
  const map = {};
  pruefer.forEach((p) => { (map[p.pruefung_id] || (map[p.pruefung_id] = [])).push(p); });
  return termine.map((t) => ({ ...t, pruefer: map[t.id] || [] }));
}

/** Zähler über alle Zusage-Status (für die Übersicht). */
export async function zusageZaehler() {
  const res = await _pg.query(
    `SELECT coalesce(status,'offen') AS status, count(*)::int AS n FROM pruefer_zuteilungen GROUP BY 1`
  );
  const z = { offen: 0, angefragt: 0, zugesagt: 0, abgesagt: 0 };
  res.rows.forEach((r) => { z[r.status] = r.n; });
  return z;
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

/** Wortstufe öffentlich (für UI). */
export const wortStufe = noteWort;

/** TRUNC(x, 1) wie in Excel: zur Null hin auf 1 Nachkommastelle abschneiden. */
function trunc1(x) {
  return Math.trunc(x * 10 + (x >= 0 ? 1e-9 : -1e-9)) / 10;
}

function zahlOderNull(v) {
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
 * Setzt/aktualisiert die Galabau-Bewertung eines Prüflings.
 * @param extra optional { pk_schriftlich, pk_bestimmung } — Teilnoten der
 *              Pflanzenkenntnisse (nur zur Nachvollziehbarkeit gespeichert).
 */
export async function setzeBewertung(prueflingId, praxis, kenntnis, bemerkung = null, extra = {}) {
  const ergN = zahlOderNull(extra && extra.ergaenzung_note);
  // Bereich nur merken, wenn auch eine mündliche Note vorliegt (saubere Daten).
  const ergB = (extra && extra.ergaenzung_bereich && ergN !== null) ? extra.ergaenzung_bereich : null;
  // Mündliche Ergänzung fließt nur in die abgeleiteten Werte (Schnitt/Gesamt/
  // Ergebnis) ein; die schriftlichen Bereichsnoten k1..k4 bleiben dokumentiert.
  const kEff = (ergB && ergN !== null) ? ergaenzteKenntnis(kenntnis, ergB, ergN) : kenntnis;
  const g = gesamtGalabau(praxis, kEff);
  const P = praxis.map(zahlOderNull);
  const K = kenntnis.map(zahlOderNull);
  const pkS = zahlOderNull(extra && extra.pk_schriftlich);
  const pkB = zahlOderNull(extra && extra.pk_bestimmung);
  await _pg.query(
    `INSERT INTO bewertungen
       (pruefling_id, p1,p2,p3,p4,p5, k1,k2,k3,k4, praxis,kenntnis,gesamt,bestanden, bemerkung, pk_schriftlich, pk_bestimmung, ergaenzung_bereich, ergaenzung_note)
       VALUES ($1, $2,$3,$4,$5,$6, $7,$8,$9,$10, $11,$12,$13,$14, $15, $16, $17, $18, $19)
       ON CONFLICT (pruefling_id) DO UPDATE SET
         p1=EXCLUDED.p1,p2=EXCLUDED.p2,p3=EXCLUDED.p3,p4=EXCLUDED.p4,p5=EXCLUDED.p5,
         k1=EXCLUDED.k1,k2=EXCLUDED.k2,k3=EXCLUDED.k3,k4=EXCLUDED.k4,
         praxis=EXCLUDED.praxis,kenntnis=EXCLUDED.kenntnis,gesamt=EXCLUDED.gesamt,
         bestanden=EXCLUDED.bestanden,bemerkung=EXCLUDED.bemerkung,
         pk_schriftlich=EXCLUDED.pk_schriftlich,pk_bestimmung=EXCLUDED.pk_bestimmung,
         ergaenzung_bereich=EXCLUDED.ergaenzung_bereich,ergaenzung_note=EXCLUDED.ergaenzung_note`,
    [prueflingId, ...P, ...K, g.praxis, g.kenntnis, g.gesamt, g.bestanden, bemerkung || null, pkS, pkB, ergB, ergN]
  );
  // Bewertung treibt automatisch den Status des Prüflings (eine Aktion, alle
  // Ansichten aktuell) — ein bewusst zurückgezogener Status bleibt erhalten.
  await _pg.query(
    `UPDATE prueflinge SET status = $2
       WHERE id = $1 AND lower(coalesce(status,'')) <> 'zurückgezogen'`,
    [prueflingId, g.bestanden ? "bestanden" : "nicht bestanden"]
  );
  return g;
}

/**
 * Alle Prüflinge mit (optionaler) Bewertung. Ohne Argument fachlich (Name)
 * sortiert; mit pruefungId nur die diesem Termin zugeteilten Prüflinge in
 * Uhrzeit-/Slot-Reihenfolge (Schnellerfassung am Prüfungstag). Verknüpft
 * Planung und Noten.
 */
export async function bewertungenListe(pruefungId = null) {
  const res = await _pg.query(
    `SELECT p.id AS pruefling_id, p.nachname, p.vorname, p.beruf,
            b.p1,b.p2,b.p3,b.p4,b.p5, b.k1,b.k2,b.k3,b.k4,
            b.praxis, b.kenntnis, b.gesamt, b.bestanden, b.bemerkung,
            b.pk_schriftlich, b.pk_bestimmung, b.ergaenzung_bereich, b.ergaenzung_note,
            z.slot
       FROM prueflinge p
       LEFT JOIN bewertungen b ON b.pruefling_id = p.id
       LEFT JOIN zuteilungen z ON z.pruefling_id = p.id AND z.pruefung_id = $1::int
      WHERE ($1::int IS NULL OR z.pruefung_id = $1::int)
      ORDER BY z.slot NULLS LAST, p.nachname, p.vorname`,
    [pruefungId]
  );
  return res.rows;
}

/** Alle Daten für ein Zeugnis: Prüfling + Bewertung + (erster) Prüfungstermin. */
export async function zeugnisDaten(prueflingId) {
  const p = (await _pg.query(
    `SELECT p.*, b.p1,b.p2,b.p3,b.p4,b.p5, b.k1,b.k2,b.k3,b.k4,
            b.praxis, b.kenntnis, b.gesamt, b.bestanden, b.ergaenzung_bereich, b.ergaenzung_note
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

/** Daten aller bewerteten Prüflinge für den Serien-Zeugnisdruck. */
export async function alleZeugnisDaten(pruefungId = null) {
  const rows = (await _pg.query(
    `SELECT p.*, b.p1,b.p2,b.p3,b.p4,b.p5, b.k1,b.k2,b.k3,b.k4,
            b.praxis, b.kenntnis, b.gesamt, b.bestanden, b.ergaenzung_bereich, b.ergaenzung_note
       FROM prueflinge p JOIN bewertungen b ON b.pruefling_id = p.id
      WHERE b.gesamt IS NOT NULL
        AND ($1::int IS NULL OR p.id IN (SELECT pruefling_id FROM zuteilungen WHERE pruefung_id = $1::int))
      ORDER BY p.beruf, p.nachname, p.vorname`,
    [pruefungId]
  )).rows;
  for (const d of rows) {
    d.termin = (await _pg.query(
      `SELECT pr.titel, pr.datum, pr.ort FROM zuteilungen z JOIN pruefungen pr ON pr.id = z.pruefung_id
        WHERE z.pruefling_id = $1 ORDER BY pr.datum LIMIT 1`, [d.id]
    )).rows[0] || null;
  }
  return rows;
}

/**
 * Verteilung der GESAMTNOTE nach Wortstufe (Notenspiegel). Optional auf ein
 * Prüfungsjahr (über den Prüfling) eingeschränkt.
 */
export async function notenVerteilung(jahr = null) {
  const res = await _pg.query(
    `SELECT b.gesamt FROM bewertungen b JOIN prueflinge p ON p.id = b.pruefling_id
      WHERE b.gesamt IS NOT NULL AND ($1::int IS NULL OR p.pruefungsjahr = $1::int)`,
    [jahr]
  );
  const stufen = ["sehr gut", "gut", "befriedigend", "ausreichend", "mangelhaft", "ungenügend"];
  const map = {};
  res.rows.forEach((r) => {
    const w = noteWort(Number(r.gesamt));
    map[w] = (map[w] || 0) + 1;
  });
  return stufen.map((s) => ({ label: s, wert: map[s] || 0 }));
}

/**
 * Durchschnittsnote je Prüfungsbereich (5 Praxis- + 4 Kenntnisbereiche) über
 * alle bewerteten Prüflinge — zeigt der Ausbildungsberatung, wo systematisch
 * Schwächen liegen (höherer Schnitt = schlechter). Optionaler Prüfungsjahr-
 * Filter (Join über den Prüfling). Labels setzt die UI aus GALABAU_BEREICHE;
 * hier nur Schlüssel, Gruppe und Index (Trennung von Daten und Beschriftung).
 * @returns {Array<{key,kurz,gruppe,idx,schnitt,anzahl}>}
 */
export async function bereichsDurchschnitte(jahr = null) {
  const res = await _pg.query(
    `SELECT
        avg(b.p1) AS p1, avg(b.p2) AS p2, avg(b.p3) AS p3, avg(b.p4) AS p4, avg(b.p5) AS p5,
        avg(b.k1) AS k1, avg(b.k2) AS k2, avg(b.k3) AS k3, avg(b.k4) AS k4,
        count(b.p1) AS np1, count(b.p2) AS np2, count(b.p3) AS np3, count(b.p4) AS np4, count(b.p5) AS np5,
        count(b.k1) AS nk1, count(b.k2) AS nk2, count(b.k3) AS nk3, count(b.k4) AS nk4
       FROM bewertungen b JOIN prueflinge p ON p.id = b.pruefling_id
      WHERE ($1::int IS NULL OR p.pruefungsjahr = $1::int)`,
    [jahr]
  );
  const r = res.rows[0] || {};
  const defs = [
    ["p1", "I", "praxis", 0], ["p2", "II", "praxis", 1], ["p3", "III", "praxis", 2],
    ["p4", "IV", "praxis", 3], ["p5", "V", "praxis", 4],
    ["k1", "K1", "kenntnis", 0], ["k2", "K2", "kenntnis", 1],
    ["k3", "K3", "kenntnis", 2], ["k4", "K4", "kenntnis", 3],
  ];
  return defs.map(([key, kurz, gruppe, idx]) => {
    const v = r[key];
    return {
      key, kurz, gruppe, idx,
      schnitt: v == null ? null : Math.round(Number(v) * 10) / 10,
      anzahl: Number(r["n" + key] || 0),
    };
  });
}

export async function anzahl(key) {
  const e = ent(key);
  const res = await _pg.query(`SELECT count(*)::int AS n FROM ${e.key}`);
  return res.rows[0].n;
}

/* -------------------------------------------------- Auswertungen / Dashboard
   Oversight über vorhandene Daten — keine neue Eingabe, alles abgeleitet. */

/** Distinkte Prüfungsjahre (aus den Prüflingen), neueste zuerst. */
export async function pruefungsjahre() {
  const res = await _pg.query(
    `SELECT DISTINCT pruefungsjahr AS jahr FROM prueflinge
      WHERE pruefungsjahr IS NOT NULL ORDER BY pruefungsjahr DESC`
  );
  return res.rows.map((r) => r.jahr);
}

/**
 * Auslastung je Prüfungstermin: zugeteilte Prüflinge und Ausschussgröße.
 * @param jahr optional — nur Termine dieses Kalenderjahres (aus dem Datum).
 */
export async function auslastung(jahr = null) {
  const j = jahr ? Number(jahr) : null;
  const res = await _pg.query(
    `SELECT pr.id, pr.titel, pr.beruf, pr.datum, pr.zeit_von, pr.ort,
            (SELECT count(*)::int FROM zuteilungen z      WHERE z.pruefung_id  = pr.id) AS prueflinge,
            (SELECT count(*)::int FROM pruefer_zuteilungen pz WHERE pz.pruefung_id = pr.id) AS ausschuss
       FROM pruefungen pr
      WHERE ($1::int IS NULL OR extract(year FROM pr.datum)::int = $1)
      ORDER BY pr.datum NULLS LAST, pr.zeit_von NULLS LAST, pr.id`,
    [j]
  );
  return res.rows;
}

/**
 * Doppelbelegungen: Prüfer:innen, die am selben Datum mehreren Terminen
 * zugeteilt sind. Solche Konflikte gilt es bei der Ausschuss-Besetzung zu
 * vermeiden; die Auto-Planung minimiert sie bereits aktiv.
 * @returns {Array<{pruefer_id, name, datum, anzahl, termine}>}
 */
export async function prueferKonflikte() {
  const res = await _pg.query(
    `SELECT pz.pruefer_id, pr.datum,
            count(*)::int AS anzahl,
            string_agg(pr.titel, ' / ' ORDER BY pr.zeit_von NULLS LAST, pr.titel) AS termine,
            (SELECT pp.nachname || ', ' || coalesce(pp.vorname,'') FROM pruefer pp WHERE pp.id = pz.pruefer_id) AS name
       FROM pruefer_zuteilungen pz JOIN pruefungen pr ON pr.id = pz.pruefung_id
      WHERE pr.datum IS NOT NULL
      GROUP BY pz.pruefer_id, pr.datum
     HAVING count(*) > 1
      ORDER BY pr.datum, name`
  );
  return res.rows;
}

/**
 * Ausschuss-Zuteilungen, die einer hinterlegten Abwesenheit der Prüfer:in am
 * Termin-Datum widersprechen (z. B. nach manueller Zuteilung).
 */
export async function prueferAbwesenheitsKonflikte() {
  const res = await _pg.query(
    `SELECT pz.pruefer_id, pr.datum, pr.titel,
            (pp.nachname || ', ' || coalesce(pp.vorname,'')) AS name
       FROM pruefer_zuteilungen pz
       JOIN pruefungen pr ON pr.id = pz.pruefung_id
       JOIN pruefer pp ON pp.id = pz.pruefer_id
       JOIN pruefer_abwesenheit a ON a.pruefer_id = pz.pruefer_id AND a.datum = pr.datum
      ORDER BY pr.datum, name`
  );
  return res.rows;
}

/**
 * Einsatzübersicht je Prüfer:in: Anzahl Ausschuss-Zuteilungen (Einsätze),
 * verschiedene Prüfungstage und Zusagestatus — für eine faire Lastverteilung.
 * Optional auf ein Prüfungsjahr (Termin-Jahr) eingeschränkt. Nur Prüfer:innen
 * mit mindestens einem Einsatz. Verknüpft Prüfer-Stammdaten und Planung.
 * @returns {Array<{pruefer_id,name,organisation,einsaetze,tage,zugesagt,offen,abgesagt}>}
 */
export async function prueferEinsaetze(jahr = null) {
  const res = await _pg.query(
    `SELECT p.id AS pruefer_id,
            (p.nachname || ', ' || coalesce(p.vorname,'')) AS name,
            coalesce(p.organisation,'') AS organisation,
            count(*)::int AS einsaetze,
            count(DISTINCT pr.datum)::int AS tage,
            count(*) FILTER (WHERE lower(coalesce(pz.status,'offen')) = 'zugesagt')::int AS zugesagt,
            count(*) FILTER (WHERE lower(coalesce(pz.status,'offen')) IN ('offen','angefragt'))::int AS offen,
            count(*) FILTER (WHERE lower(coalesce(pz.status,'offen')) = 'abgesagt')::int AS abgesagt
       FROM pruefer_zuteilungen pz
       JOIN pruefer p ON p.id = pz.pruefer_id
       JOIN pruefungen pr ON pr.id = pz.pruefung_id
      WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM pr.datum)::int = $1::int)
      GROUP BY p.id, name, organisation
      ORDER BY einsaetze DESC, name`,
    [jahr]
  );
  return res.rows;
}

/** Setzt den Status eines einzelnen Prüflings (Schnellaktion in der Akte). */
export async function setzeStatus(prueflingId, status) {
  await _pg.query(`UPDATE prueflinge SET status = $2 WHERE id = $1`, [Number(prueflingId), status]);
}

/** Ist die Prüfer:in am gegebenen Datum als abwesend hinterlegt? */
export async function istAbwesend(prueferId, datum) {
  if (!datum) return false;
  const r = await _pg.query(
    `SELECT 1 FROM pruefer_abwesenheit WHERE pruefer_id = $1 AND datum = $2 LIMIT 1`,
    [prueferId, isoDatum(datum)]
  );
  return r.rows.length > 0;
}

/* ----------------------------------------------------- Datensicherung -------
   Vollständige Sicherung/Wiederherstellung als JSON-Datei („DB-Datei daneben").
   Bewahrt IDs (für die Beziehungen) über OVERRIDING SYSTEM VALUE; generierte
   Spalten (such_text) werden ausgelassen und automatisch neu berechnet. */

const SICHERUNG_TABELLEN = {
  prueflinge: null, betriebe: null, pruefer: null, pruefungen: null,
  zuteilungen: ["pruefung_id", "pruefling_id", "slot", "reihenfolge"],
  pruefer_zuteilungen: ["pruefung_id", "pruefer_id", "rolle", "status"],
  pruefer_abwesenheit: ["pruefer_id", "datum"],
  bewertungen: ["pruefling_id", "p1", "p2", "p3", "p4", "p5", "k1", "k2", "k3", "k4",
                "praxis", "kenntnis", "gesamt", "bestanden", "bemerkung", "pk_schriftlich", "pk_bestimmung",
                "ergaenzung_bereich", "ergaenzung_note"],
};
function sicherungSpalten(tab) {
  return SICHERUNG_TABELLEN[tab] || ENTITAETEN[tab].felder.map((f) => f.name);
}

/** Komplette Sicherung aller fachlichen Tabellen (für Datei-Export). */
export async function sicherungErstellen() {
  const tabellen = {};
  for (const tab of Object.keys(SICHERUNG_TABELLEN)) {
    const cols = ["id", ...sicherungSpalten(tab)];
    const res = await _pg.query(`SELECT ${cols.join(", ")} FROM ${tab} ORDER BY id`);
    tabellen[tab] = res.rows;
  }
  return { app: "Ausbildungsberatung-Suite", version: 1, erstellt: new Date().toISOString(), tabellen };
}

/** Spielt eine Sicherung ein (ersetzt alle Daten). */
export async function sicherungEinspielen(daten) {
  if (!daten || daten.app !== "Ausbildungsberatung-Suite" || !daten.tabellen)
    throw new Error("Keine gültige Sicherungsdatei der Ausbildungsberatung-Suite.");
  const tabs = Object.keys(SICHERUNG_TABELLEN);
  await _pg.exec("TRUNCATE " + tabs.join(", ") + " RESTART IDENTITY;");
  let gesamt = 0;
  for (const tab of tabs) {
    const rows = daten.tabellen[tab] || [];
    if (!rows.length) continue;
    const cols = ["id", ...sicherungSpalten(tab)];
    const CHUNK = 200;
    for (let off = 0; off < rows.length; off += CHUNK) {
      const teil = rows.slice(off, off + CHUNK);
      const werte = [], params = [];
      teil.forEach((r, ri) => {
        werte.push("(" + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",") + ")");
        cols.forEach((c) => params.push(r[c] === undefined ? null : r[c]));
      });
      await _pg.query(
        `INSERT INTO ${tab} (${cols.join(",")}) OVERRIDING SYSTEM VALUE VALUES ${werte.join(",")}`,
        params
      );
    }
    await _pg.query(
      `SELECT setval(pg_get_serial_sequence('${tab}','id'), GREATEST((SELECT coalesce(max(id),0) FROM ${tab}), 1))`
    );
    gesamt += rows.length;
  }
  return { tabellen: tabs.length, zeilen: gesamt };
}

/**
 * Importiert Prüflinge aus aufbereiteten Datensätzen (z. B. CSV). Dubletten
 * (gleicher Nach-/Vorname, case-insensitiv) werden übersprungen; leere Zeilen
 * (ohne Namen) ignoriert.
 * @returns {{angelegt:number, uebersprungen:number}}
 */
/**
 * Generischer CSV-/Datensatz-Import für eine beliebige Stammdaten-Entität.
 * Dublettenschutz über die im Modell hinterlegten `dublette`-Felder; leere
 * Datensätze (kein Dublettenfeld gefüllt) werden übersprungen.
 * @returns {{angelegt:number, uebersprungen:number}}
 */
export async function datensaetzeImportieren(key, saetze, { dubletten = "ueberspringen" } = {}) {
  const e = ent(key); // wirft bei unbekannter Entität (schützt die Tabellen-Interpolation)
  const dub = e.dublette || [];
  const schluessel = (obj) => dub.map((f) => String(obj[f] || "").trim().toLowerCase()).join("|");
  let vorhanden = new Set();
  if (dub.length) {
    const expr = dub.map((f) => `lower(btrim(coalesce(${f}::text,'')))`).join(" || '|' || ");
    vorhanden = new Set((await _pg.query(`SELECT ${expr} AS k FROM ${e.key}`)).rows.map((r) => r.k));
  }
  let angelegt = 0, uebersprungen = 0;
  const neu = [];
  for (const s of saetze || []) {
    const hatInhalt = dub.length
      ? dub.some((f) => String(s[f] || "").trim())
      : Object.values(s).some((v) => String(v || "").trim());
    if (!hatInhalt) { uebersprungen++; continue; }
    if (dub.length) {
      const k = schluessel(s);
      if (dubletten === "ueberspringen" && vorhanden.has(k)) { uebersprungen++; continue; }
      vorhanden.add(k);
    }
    neu.push(s);
  }
  for (const s of neu) { await anlegen(key, s); angelegt++; }
  return { angelegt, uebersprungen };
}

/** Rückwärtskompatibel: Prüflings-Import über den generischen Importer. */
export async function prueflingeImportieren(saetze, opts = {}) {
  return datensaetzeImportieren("prueflinge", saetze, opts);
}

/**
 * Termine mit allen Eckdaten für den Kalender-Export (ICS): Zeiten, Ort/Raum,
 * Fachrichtung, Prüflingszahl und Ausschuss. Nur Termine mit Datum.
 */
export async function kalenderDaten() {
  const res = await _pg.query(
    `SELECT pr.id, pr.titel, pr.beruf, pr.datum, pr.zeit_von, pr.zeit_bis, pr.ort, pr.raum,
            (SELECT count(*)::int FROM zuteilungen z WHERE z.pruefung_id = pr.id) AS prueflinge,
            (SELECT string_agg(pp.nachname || ', ' || coalesce(pp.vorname,''), '; '
                       ORDER BY pz.rolle NULLS LAST, pp.nachname)
               FROM pruefer_zuteilungen pz JOIN pruefer pp ON pp.id = pz.pruefer_id
              WHERE pz.pruefung_id = pr.id) AS ausschuss
       FROM pruefungen pr
      WHERE pr.datum IS NOT NULL
      ORDER BY pr.datum, pr.zeit_von NULLS LAST, pr.id`
  );
  return res.rows;
}

/**
 * Bestehensquote und Notenschnitt je Gärtner-Fachrichtung.
 * @returns {Array<{beruf,gesamt,bewertet,bestanden,durchgefallen,quote,schnitt}>}
 */
export async function quoteJeFachrichtung(jahr = null) {
  const j = jahr ? Number(jahr) : null;
  const res = await _pg.query(
    `SELECT p.beruf,
            count(*)::int AS gesamt,
            count(b.gesamt)::int AS bewertet,
            count(*) FILTER (WHERE b.bestanden IS TRUE)::int  AS bestanden,
            count(*) FILTER (WHERE b.bestanden IS FALSE)::int AS durchgefallen,
            avg(b.gesamt) AS schnitt
       FROM prueflinge p LEFT JOIN bewertungen b ON b.pruefling_id = p.id
      WHERE p.beruf IS NOT NULL AND btrim(p.beruf) <> ''
        AND ($1::int IS NULL OR p.pruefungsjahr = $1)
      GROUP BY p.beruf ORDER BY p.beruf`,
    [j]
  );
  return res.rows.map((r) => ({
    ...r,
    quote: r.bewertet ? Math.round((r.bestanden / r.bewertet) * 100) : null,
    schnitt: r.schnitt == null ? null : Number(r.schnitt),
  }));
}

/**
 * Offene Aufgaben („Was ist zu tun?"): erkennt automatisch Handlungsbedarf über
 * alle Stationen und verlinkt dorthin. Nur Punkte mit Bedarf werden geliefert.
 * @returns {Array<{key,n,text,route,art}>}
 */
export async function hinweise() {
  const items = [];

  const ohneAusschuss = (await _pg.query(
    `SELECT count(*)::int AS n FROM pruefungen pr
      WHERE (SELECT count(*) FROM zuteilungen z WHERE z.pruefung_id = pr.id) > 0
        AND (SELECT count(*) FROM pruefer_zuteilungen pz WHERE pz.pruefung_id = pr.id) = 0`
  )).rows[0].n;
  if (ohneAusschuss) items.push({ key: "ausschuss", n: ohneAusschuss, route: "#/planung", art: "fehler",
    text: `${ohneAusschuss} belegte(r) Prüfungstermin(e) ohne Ausschuss` });

  const k = (await prueferKonflikte()).length;
  if (k) items.push({ key: "konflikt", n: k, route: "#/auswertungen", art: "fehler",
    text: `${k} Prüfer-Doppelbelegung(en) am selben Tag` });

  const aKonf = (await prueferAbwesenheitsKonflikte()).length;
  if (aKonf) items.push({ key: "abwesenheit", n: aKonf, route: "#/planung", art: "fehler",
    text: `${aKonf} Ausschuss-Zuteilung(en) an einem Abwesenheitstag der Prüfer:in` });

  // Datenqualität: ohne Fachrichtung lässt sich kein:e Prüfling einplanen.
  const ohneFach = (await _pg.query(
    `SELECT count(*)::int AS n FROM prueflinge
      WHERE (beruf IS NULL OR btrim(beruf) = '')
        AND lower(coalesce(status,'')) <> 'zurückgezogen'`
  )).rows[0].n;
  if (ohneFach) items.push({ key: "ohne_fach", n: ohneFach, route: "#/prueflinge", art: "fehler",
    text: `${ohneFach} Prüfling(e) ohne Fachrichtung — werden nicht automatisch eingeplant` });

  // Überfällig: Prüfungstage in der Vergangenheit mit noch unbewerteten Prüflingen.
  const ueberfaellig = (await _pg.query(
    `SELECT count(*)::int AS n FROM pruefungen pr
      WHERE pr.datum IS NOT NULL AND pr.datum < CURRENT_DATE
        AND EXISTS (SELECT 1 FROM zuteilungen z
                      LEFT JOIN bewertungen b ON b.pruefling_id = z.pruefling_id
                     WHERE z.pruefung_id = pr.id AND b.gesamt IS NULL)`
  )).rows[0].n;
  if (ueberfaellig) items.push({ key: "ueberfaellig", n: ueberfaellig, route: "#/noten", art: "fehler",
    text: `${ueberfaellig} vergangene(r) Prüfungstag(e) mit noch unbewerteten Prüflingen` });

  const z = await zusageZaehler();
  const offen = (z.offen || 0) + (z.angefragt || 0);
  if (offen) items.push({ key: "zusagen", n: offen, route: "#/planungsliste", art: "hinweis",
    text: `${offen} Prüfer-Zusage(n) noch offen oder angefragt` });

  const unbewertet = (await _pg.query(
    `SELECT count(DISTINCT z.pruefling_id)::int AS n
       FROM zuteilungen z LEFT JOIN bewertungen b ON b.pruefling_id = z.pruefling_id
      WHERE b.gesamt IS NULL`
  )).rows[0].n;
  if (unbewertet) items.push({ key: "unbewertet", n: unbewertet, route: "#/noten", art: "hinweis",
    text: `${unbewertet} eingeplante(r) Prüfling(e) noch nicht bewertet` });

  // Vorbereitung: anstehende/undatierte Termine mit Prüflingen, aber ohne
  // (vollständiges) Zeitraster — ohne Uhrzeiten fehlen Slots in Tagesablauf,
  // Einladung und Anwesenheitsliste. Vergangene Termine bleiben außen vor.
  const ohneUhrzeit = (await _pg.query(
    `SELECT count(*)::int AS n FROM pruefungen pr
      WHERE (pr.datum IS NULL OR pr.datum >= CURRENT_DATE)
        AND EXISTS (SELECT 1 FROM zuteilungen z WHERE z.pruefung_id = pr.id)
        AND EXISTS (SELECT 1 FROM zuteilungen z
                     WHERE z.pruefung_id = pr.id AND (z.slot IS NULL OR btrim(z.slot) = ''))`
  )).rows[0].n;
  if (ohneUhrzeit) items.push({ key: "ohne_uhrzeit", n: ohneUhrzeit, route: "#/planung", art: "hinweis",
    text: `${ohneUhrzeit} anstehende(r) Prüfungstermin(e) mit Prüflingen ohne Uhrzeit (Zeitraster erzeugen)` });

  const offeneTermine = (await _pg.query(
    `SELECT count(*)::int AS n FROM pruefungen pr
      WHERE (SELECT count(*) FROM zuteilungen z WHERE z.pruefung_id = pr.id) = 0`
  )).rows[0].n;
  if (offeneTermine) items.push({ key: "leer", n: offeneTermine, route: "#/planung", art: "hinweis",
    text: `${offeneTermine} Prüfungstermin(e) ohne zugeteilte Prüflinge` });

  return items;
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

/* ------------------------------------------------ Prüfungs-Fortschritt -----
   Ein automatisch abgeleiteter Lebenslauf je Prüfling, der Zulassung (Status),
   Tagesplanung (Zuteilung) und Bewertung zu EINER Phase zusammenführt — die
   verbindende Klammer über alle Stationen, ohne manuelle Pflege. */

export const FORTSCHRITT_STUFEN = [
  { key: "angemeldet",      label: "Angemeldet" },
  { key: "zugelassen",      label: "Zugelassen" },
  { key: "eingeplant",      label: "Eingeplant" },
  { key: "bestanden",       label: "Bestanden" },
  { key: "nicht_bestanden", label: "Nicht bestanden" },
  { key: "zurueckgezogen",  label: "Zurückgezogen" },
];
const _FORTSCHRITT_KERN = ["angemeldet", "zugelassen", "eingeplant", "bestanden"];

// Priorität (höchste zuerst): Bewertung schlägt Planung schlägt Zulassung.
const _FORTSCHRITT_CASE = `
  CASE
    WHEN lower(coalesce(p.status,'')) = 'zurückgezogen' THEN 'zurueckgezogen'
    WHEN b.bestanden IS TRUE  THEN 'bestanden'
    WHEN b.bestanden IS FALSE THEN 'nicht_bestanden'
    WHEN (SELECT count(*) FROM zuteilungen z WHERE z.pruefling_id = p.id) > 0 THEN 'eingeplant'
    WHEN lower(coalesce(p.status,'')) IN ('zugelassen','geprüft','geprueft') THEN 'zugelassen'
    ELSE 'angemeldet'
  END`;

/** Abgeleitete Phase je Prüfling: [{ id, phase }] für die Liste/Anzeige. */
export async function fortschrittAlle() {
  const res = await _pg.query(
    `SELECT p.id, ${_FORTSCHRITT_CASE} AS phase
       FROM prueflinge p LEFT JOIN bewertungen b ON b.pruefling_id = p.id`
  );
  return res.rows;
}

/**
 * Setzt den Status mehrerer Prüflinge auf einmal (z. B. Sammel-Zulassung).
 * „Zurückgezogen" bleibt unangetastet (bewusste Entscheidung). Gibt die Zahl
 * der geänderten Datensätze zurück.
 */
export async function setzeStatusViele(ids, status) {
  const liste = (ids || []).map(Number).filter((n) => Number.isFinite(n));
  if (!liste.length) return 0;
  const res = await _pg.query(
    `UPDATE prueflinge SET status = $2
       WHERE id = ANY($1) AND lower(coalesce(status,'')) <> 'zurückgezogen'`,
    [liste, status]
  );
  return res.affectedRows ?? liste.length;
}

/**
 * Prüfer-Akte: Stammdaten, alle Ausschuss-Einsätze (Termin, Rolle, Zusage) und
 * hinterlegte Abwesenheiten — verbindet Prüfer:innen, Planung und Abwesenheiten.
 */
export async function prueferAkte(prueferId) {
  const p = (await _pg.query(`SELECT * FROM pruefer WHERE id = $1`, [prueferId])).rows[0];
  if (!p) return null;
  const einsaetze = (await _pg.query(
    `SELECT pz.id AS zuteilung_id, pz.rolle, coalesce(pz.status,'offen') AS status,
            pr.id AS pruefung_id, pr.titel, pr.datum, pr.zeit_von, pr.ort, pr.beruf
       FROM pruefer_zuteilungen pz JOIN pruefungen pr ON pr.id = pz.pruefung_id
      WHERE pz.pruefer_id = $1
      ORDER BY pr.datum NULLS LAST, pr.zeit_von NULLS LAST, pr.id`,
    [prueferId]
  )).rows;
  const abwesenheiten = (await _pg.query(
    `SELECT id, datum FROM pruefer_abwesenheit WHERE pruefer_id = $1 ORDER BY datum`,
    [prueferId]
  )).rows;
  return { pruefer: p, einsaetze, abwesenheiten };
}

/**
 * Betriebs-Akte: Stammdaten des Ausbildungsbetriebs und alle ihm zugeordneten
 * Prüflinge (Name über das Betriebsfeld verknüpft) samt abgeleiteter Phase und
 * Bestehensstatus — verbindet Betriebe und Prüflinge in einer Ansicht.
 */
export async function betriebAkte(betriebId) {
  const b = (await _pg.query(`SELECT * FROM betriebe WHERE id = $1`, [betriebId])).rows[0];
  if (!b) return null;
  const prueflinge = (await _pg.query(
    `SELECT p.id, p.nachname, p.vorname, p.beruf, p.pruefungsjahr, p.status,
            ${_FORTSCHRITT_CASE} AS phase, b.gesamt, b.bestanden
       FROM prueflinge p LEFT JOIN bewertungen b ON b.pruefling_id = p.id
      WHERE lower(btrim(coalesce(p.betrieb,''))) = lower(btrim($1))
      ORDER BY p.nachname, p.vorname`,
    [b.name]
  )).rows;
  return { betrieb: b, prueflinge };
}

/**
 * Gesamtakte eines Prüflings: Stammdaten, zugeteilte Termine (mit Slot und
 * Ausschuss), Bewertung und abgeleitete Phase — die verbindende Klammer über
 * Stammdaten, Planung, Noten und Zeugnis in einer Ansicht.
 */
export async function prueflingAkte(prueflingId) {
  const p = (await _pg.query(`SELECT * FROM prueflinge WHERE id = $1`, [prueflingId])).rows[0];
  if (!p) return null;
  const termine = (await _pg.query(
    `SELECT pr.id, pr.titel, pr.beruf, pr.datum, pr.zeit_von, pr.ort, pr.raum, z.slot, z.id AS zuteilung_id
       FROM zuteilungen z JOIN pruefungen pr ON pr.id = z.pruefung_id
      WHERE z.pruefling_id = $1
      ORDER BY pr.datum NULLS LAST, z.slot NULLS LAST, pr.id`,
    [prueflingId]
  )).rows;
  // Passende, noch nicht zugeteilte Termine (gleiche Fachrichtung) für die
  // direkte Zuteilung aus der Akte.
  const passend = (await _pg.query(
    `SELECT pr.id, pr.titel, pr.datum, pr.zeit_von, pr.ort
       FROM pruefungen pr
      WHERE coalesce(pr.beruf,'') = coalesce($2,'')
        AND pr.id NOT IN (SELECT pruefung_id FROM zuteilungen WHERE pruefling_id = $1)
      ORDER BY pr.datum NULLS LAST, pr.zeit_von NULLS LAST, pr.id`,
    [prueflingId, p.beruf]
  )).rows;
  for (const t of termine) {
    t.ausschuss = (await _pg.query(
      `SELECT pz.rolle, coalesce(pz.status,'offen') AS status, pp.nachname, pp.vorname
         FROM pruefer_zuteilungen pz JOIN pruefer pp ON pp.id = pz.pruefer_id
        WHERE pz.pruefung_id = $1
        ORDER BY pz.rolle NULLS LAST, pp.nachname`,
      [t.id]
    )).rows;
  }
  const bewertung = (await _pg.query(`SELECT * FROM bewertungen WHERE pruefling_id = $1`, [prueflingId])).rows[0] || null;
  const ph = (await _pg.query(
    `SELECT ${_FORTSCHRITT_CASE} AS phase
       FROM prueflinge p LEFT JOIN bewertungen b ON b.pruefling_id = p.id WHERE p.id = $1`,
    [prueflingId]
  )).rows[0];
  // Betriebs-Id (über den Namen), damit die Akte direkt zur Betriebs-Akte verlinkt.
  let betriebId = null;
  if (p.betrieb && String(p.betrieb).trim()) {
    const br = (await _pg.query(
      `SELECT id FROM betriebe WHERE lower(btrim(name)) = lower(btrim($1)) ORDER BY id LIMIT 1`,
      [p.betrieb]
    )).rows[0];
    betriebId = br ? br.id : null;
  }
  return { pruefling: p, termine, passend, bewertung, betriebId, phase: ph ? ph.phase : "angemeldet" };
}

/**
 * Einladungs-Daten: jede Prüfling-Termin-Zuteilung mit Name, Betrieb und allen
 * Termindetails (inkl. persönlicher Uhrzeit/Slot). Verknüpft Stammdaten und
 * Planung für den Einladungsdruck. Mit prueflingId nur dessen Zuteilungen,
 * sonst alle (Serien-Druck), in Termin-/Uhrzeit-/Namensreihenfolge.
 * @returns {Array<{pruefling_id,nachname,vorname,beruf,betrieb,titel,datum,
 *   zeit_von,zeit_bis,ort,raum,slot}>}
 */
export async function einladungsListe(prueflingId = null) {
  const res = await _pg.query(
    `SELECT p.id AS pruefling_id, p.nachname, p.vorname, p.beruf, p.betrieb,
            pr.titel, pr.datum, pr.zeit_von, pr.zeit_bis, pr.ort, pr.raum, z.slot
       FROM zuteilungen z
       JOIN prueflinge p ON p.id = z.pruefling_id
       JOIN pruefungen pr ON pr.id = z.pruefung_id
      WHERE ($1::int IS NULL OR p.id = $1::int)
      ORDER BY pr.datum NULLS LAST, z.slot NULLS LAST, p.nachname, p.vorname`,
    [prueflingId]
  );
  return res.rows;
}

/**
 * Funnel der Prüfungs-Fortschritte in fachlicher Reihenfolge. Kernstufen werden
 * immer gezeigt, Sonderstufen (nicht bestanden, zurückgezogen) nur bei Bedarf.
 * @returns {Array<{key:string,label:string,wert:number}>}
 */
export async function fortschrittVerteilung() {
  const rows = await fortschrittAlle();
  const z = {};
  rows.forEach((r) => { z[r.phase] = (z[r.phase] || 0) + 1; });
  return FORTSCHRITT_STUFEN
    .map((s) => ({ key: s.key, label: s.label, wert: z[s.key] || 0 }))
    .filter((s) => s.wert > 0 || _FORTSCHRITT_KERN.includes(s.key));
}

/**
 * Konsolidierte Adress-/Telefonliste über Betriebe und Prüfer:innen.
 * DB-seitige, multitokenbasierte Fuzzy-Suche (Trigramm) über die jeweilige
 * such_text-Spalte; leere Eingabe -> gesamte Liste.
 */
export async function kontakteSuche(query, { limit = 400 } = {}) {
  const tokens = String(query || "")
    .toLowerCase().replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/\s+/).filter(Boolean);

  const quelle = `(
      SELECT 'Betrieb'::text AS typ, id,
             name AS bezeichnung,
             coalesce(ort, '') AS zusatz,
             coalesce(ansprechpartner, '') AS person,
             telefon, email, such_text
        FROM betriebe
      UNION ALL
      SELECT 'Prüfer:in'::text AS typ, id,
             (nachname || ', ' || coalesce(vorname, '')) AS bezeichnung,
             coalesce(organisation, '') AS zusatz,
             coalesce(funktion, '') AS person,
             telefon, email, such_text
        FROM pruefer
    ) AS k`;

  if (!tokens.length) {
    const r = await _pg.query(`SELECT * FROM ${quelle} ORDER BY typ, bezeichnung LIMIT ${Number(limit)}`);
    return r.rows;
  }
  const bedingungen = tokens
    .map((_, i) => `(such_text LIKE '%' || $${i + 1} || '%' OR word_similarity($${i + 1}, such_text) >= 0.3)`)
    .join(" AND ");
  const score = tokens.map((_, i) => `word_similarity($${i + 1}, such_text)`).join(" + ");
  const r = await _pg.query(
    `SELECT *, (${score}) AS relevanz FROM ${quelle}
      WHERE ${bedingungen} ORDER BY relevanz DESC, bezeichnung LIMIT ${Number(limit)}`,
    tokens
  );
  return r.rows;
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
    { name: "Grünwerk Garten- und Landschaftsbau GmbH", strasse: "Industriestr. 7", plz: "79108", ort: "Freiburg", ansprechpartner: "C. Vogt", email: "ausbildung@gruenwerk.example", telefon: "0761 12340" },
    { name: "Baumschule Ihringen",     strasse: "Blumenstr. 12", plz: "79241", ort: "Ihringen", ansprechpartner: "M. Bauer", email: "info@baumschule-ihringen.example", telefon: "07668 5678" },
    { name: "GaLaBau Schäfer & Söhne GbR", strasse: "Feldweg 8", plz: "79379", ort: "Müllheim", ansprechpartner: "T. Schäfer", email: "kontakt@galabau-schaefer.example", telefon: "07631 4321" },
    { name: "Stadtgärtnerei Merzhausen", strasse: "Sonnenhalde 1", plz: "79249", ort: "Merzhausen", ansprechpartner: "A. Lehmann", email: "gaertnerei@merzhausen.example", telefon: "0761 99887" },
  ];
  for (const b of betriebe) await anlegen("betriebe", b);

  const prueflinge = [
    { nachname: "Albrecht", vorname: "Lena", beruf: "Garten- und Landschaftsbau", betrieb: "Grünwerk Garten- und Landschaftsbau GmbH", pruefungsjahr: 2026, status: "zugelassen" },
    { nachname: "Brenner",  vorname: "Tim",  beruf: "Baumschule", betrieb: "Baumschule Ihringen", pruefungsjahr: 2026, status: "angemeldet" },
    { nachname: "Conrad",   vorname: "Sara", beruf: "Garten- und Landschaftsbau", betrieb: "GaLaBau Schäfer & Söhne GbR", pruefungsjahr: 2026, status: "zugelassen" },
    { nachname: "Dietz",    vorname: "Jonas",beruf: "Garten- und Landschaftsbau", betrieb: "Grünwerk Garten- und Landschaftsbau GmbH", pruefungsjahr: 2026, status: "zugelassen" },
    { nachname: "Engel",    vorname: "Mara", beruf: "Zierpflanzenbau", betrieb: "Stadtgärtnerei Merzhausen", pruefungsjahr: 2026, status: "angemeldet" },
    { nachname: "Fischer",  vorname: "Noah", beruf: "Garten- und Landschaftsbau", betrieb: "GaLaBau Schäfer & Söhne GbR", pruefungsjahr: 2026, status: "zugelassen" },
  ];
  for (const p of prueflinge) await anlegen("prueflinge", p);

  const pruefer = [
    { nachname: "Wagner",  vorname: "Petra",  organisation: "RP Freiburg", funktion: "Vorsitz", email: "p.wagner@rpf.example", telefon: "0761 2080" },
    { nachname: "Keller",  vorname: "Bernd",  organisation: "Kreis Emmendingen", funktion: "Beisitz Arbeitgeber", email: "b.keller@lkemmendingen.example", telefon: "07641 1110" },
    { nachname: "Hoffmann",vorname: "Ute",    organisation: "GBA Freiburg", funktion: "Lehrkraft", email: "u.hoffmann@gba-fr.example", telefon: "0761 3330" },
  ];
  for (const p of pruefer) await anlegen("pruefer", p);

  const pruefungen = [
    { titel: "Praktische AP GaLaBau", beruf: "Garten- und Landschaftsbau", datum: "2026-07-14", zeit_von: "08:00", zeit_bis: "16:00", ort: "Übungsgelände GBA Freiburg", raum: "Freifläche A" },
    { titel: "Praktische AP Zierpflanzenbau", beruf: "Zierpflanzenbau", datum: "2026-07-16", zeit_von: "08:30", zeit_bis: "15:30", ort: "Stadtgärtnerei Merzhausen", raum: "Gewächshaus 2" },
  ];
  for (const p of pruefungen) await anlegen("pruefungen", p);

  return true;
}

/* ----------------------------------------------- Großer Beispieldatensatz */

const DEMO_VORNAMEN = ["Lena","Tim","Sara","Jonas","Mara","Noah","Emma","Luca","Mia","Paul",
  "Lea","Finn","Hannah","Ben","Lisa","Jan","Nele","Tom","Marie","Max","Sophie","Leon","Anna",
  "Felix","Laura","Niklas","Julia","David","Clara","Erik","Pia","Moritz","Johanna","Simon",
  "Greta","Jakob","Ida","Elias","Frieda","Linus","Mira","Aaron","Helena","Theo","Romy"];
const DEMO_NACHNAMEN = ["Albrecht","Brenner","Conrad","Dietz","Engel","Fischer","Graf","Huber",
  "Imhof","Jung","Keller","Lang","Maier","Naumann","Ott","Pfeiffer","Quandt","Reber","Schmid",
  "Trapp","Ulrich","Vogt","Weber","Xander","Zimmermann","Bauer","Schäfer","Wolf","Krause","Lehmann",
  "Sommer","Winkler","Hofmann","Bayer","Roth","Seitz","Frey","Kaiser","Arnold","Busch","Decker"];
const DEMO_ORTE = [["Freiburg","79098"],["Emmendingen","79312"],["Lahr","77933"],["Offenburg","77652"],
  ["Müllheim","79379"],["Breisach","79206"],["Waldkirch","79183"],["Kehl","77694"],["Lörrach","79539"],
  ["Bad Säckingen","79713"],["Titisee-Neustadt","79822"],["Ihringen","79241"],["Merzhausen","79249"],
  ["Gundelfingen","79194"],["Bahlingen","79353"]];
const DEMO_STATUS = ["angemeldet","zugelassen","zugelassen","zugelassen"];

/** Fachrichtung -> {anzahl, betriebTyp} für den großen Beispieldatensatz. */
const DEMO_VERTEILUNG = [
  { beruf: "Garten- und Landschaftsbau", anzahl: 100, typ: "GaLaBau" },
  { beruf: "Gemüsebau",          anzahl: 20, typ: "Gemüsebau" },
  { beruf: "Zierpflanzenbau",    anzahl: 10, typ: "Zierpflanzengärtnerei" },
  { beruf: "Baumschule",         anzahl: 10, typ: "Baumschule" },
  { beruf: "Friedhofsgärtnerei", anzahl: 5,  typ: "Friedhofsgärtnerei" },
  { beruf: "Obstbau",            anzahl: 5,  typ: "Obstbau" },
  { beruf: "Staudengärtnerei",   anzahl: 5,  typ: "Staudengärtnerei" },
];

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

async function bulkInsert(table, cols, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const teil = rows.slice(i, i + 200);
    const ph = teil.map((_, r) => "(" + cols.map((_, c) => `$${r * cols.length + c + 1}`).join(",") + ")").join(",");
    const params = teil.flatMap((row) => cols.map((c) => (row[c] === undefined ? null : row[c])));
    await _pg.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${ph}`, params);
  }
}

/** Löscht alle fachlichen Daten (Reset). */
export async function alleLoeschen() {
  await _pg.exec(`
    TRUNCATE bewertungen, zuteilungen, pruefer_zuteilungen RESTART IDENTITY;
    TRUNCATE prueflinge RESTART IDENTITY;
    TRUNCATE betriebe RESTART IDENTITY;
    TRUNCATE pruefer RESTART IDENTITY;
    TRUNCATE pruefungen RESTART IDENTITY;
  `);
}

/**
 * Erzeugt einen großen, fiktiven Beispieldatensatz (ersetzt vorhandene Daten):
 * ~155 Prüflinge nach Fachrichtungs-Verteilung, Betriebe mit 1–10 Azubis je
 * Betrieb, passende Prüfer:innen und je Fachrichtung Prüfungstermine.
 * Keine echten personenbezogenen Daten.
 */
export async function demodatenGenerieren() {
  await alleLoeschen();
  const rng = rngFactory(20260701);
  const wahl = (arr) => arr[Math.floor(rng() * arr.length)];
  const tel = () => "07" + String(600 + Math.floor(rng() * 99)) + " " + String(1000 + Math.floor(rng() * 8999));

  const betriebe = [];
  const prueflinge = [];
  let bIdx = 0;

  for (const fr of DEMO_VERTEILUNG) {
    let rest = fr.anzahl;
    while (rest > 0) {
      const groesse = Math.min(rest, 1 + Math.floor(rng() * 10)); // 1..10 Azubis
      rest -= groesse;
      bIdx += 1;
      const [ort, plz] = wahl(DEMO_ORTE);
      const name = `${fr.typ} ${["Betrieb","GmbH","Hof","Gärtnerei","& Co. KG","Anlagen"][bIdx % 6]} ${ort} ${bIdx}`;
      const ap = `${wahl(DEMO_VORNAMEN)[0]}. ${wahl(DEMO_NACHNAMEN)}`;
      betriebe.push({
        name, strasse: `${wahl(["Garten","Feld","Industrie","Ringstr.","Talweg","Au"])}str. ${1 + Math.floor(rng() * 80)}`,
        plz, ort, ansprechpartner: ap,
        email: `ausbildung@betrieb${bIdx}.example`, telefon: tel(),
      });
      for (let a = 0; a < groesse; a++) {
        prueflinge.push({
          nachname: wahl(DEMO_NACHNAMEN), vorname: wahl(DEMO_VORNAMEN),
          beruf: fr.beruf, betrieb: name, pruefungsjahr: 2026, status: wahl(DEMO_STATUS),
          email: "", telefon: tel(),
        });
      }
    }
  }

  // Prüfer:innen — Ausschuss-Pool (Vorsitz/Beisitz/Lehrkraft), ~1 je 5 Prüflinge.
  const ROLLEN = ["Vorsitz", "Beisitz Arbeitgeber", "Beisitz Arbeitnehmer", "Lehrkraft", "Stv. Vorsitz"];
  const ORGAS = ["RP Freiburg", "GBA Freiburg", "Kreis Emmendingen", "Kreis Breisgau-Hochschwarzwald", "GaLaBau-Verband", "Ortenaukreis"];
  const prueferN = Math.max(15, Math.ceil(prueflinge.length / 5));
  const pruefer = Array.from({ length: prueferN }, (_, i) => ({
    nachname: wahl(DEMO_NACHNAMEN), vorname: wahl(DEMO_VORNAMEN),
    organisation: wahl(ORGAS), funktion: ROLLEN[i % ROLLEN.length],
    email: `pruefer${i + 1}@rpf.example`, telefon: tel(),
  }));

  // Prüfungstermine je Fachrichtung (Vorbereitung der Tagesplanung).
  const pruefungen = [];
  DEMO_VERTEILUNG.forEach((fr, i) => {
    const tag = 13 + i; // Juli 2026
    pruefungen.push({
      titel: `Praktische AP ${fr.beruf}`, beruf: fr.beruf,
      datum: `2026-07-${String(tag).padStart(2, "0")}`, zeit_von: "08:00", zeit_bis: "16:00",
      ort: "Übungsgelände GBA Freiburg", raum: `Bereich ${i + 1}`,
    });
  });

  await bulkInsert("betriebe", ["name", "strasse", "plz", "ort", "ansprechpartner", "email", "telefon"], betriebe);
  await bulkInsert("prueflinge", ["nachname", "vorname", "beruf", "betrieb", "pruefungsjahr", "status", "email", "telefon"], prueflinge);
  await bulkInsert("pruefer", ["nachname", "vorname", "organisation", "funktion", "email", "telefon"], pruefer);
  await bulkInsert("pruefungen", ["titel", "beruf", "datum", "zeit_von", "zeit_bis", "ort", "raum"], pruefungen);

  return { betriebe: betriebe.length, prueflinge: prueflinge.length, pruefer: pruefer.length, pruefungen: pruefungen.length };
}
