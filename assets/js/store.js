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
  await _pg.query(`DELETE FROM ${e.key} WHERE id = $1`, [id]);
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
