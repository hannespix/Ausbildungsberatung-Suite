// db.js — Datenbankschicht für DB-basierte Tools.
//
// VORGABE: Datenhaltung über PGlite (Postgres als WebAssembly), persistent in
// OPFS. PGlite wird LOKAL eingebunden (vendored), niemals von einem CDN
// (Zero-Trust). Erwartete Ablage: assets/vendor/pglite/ (per npm-Paket
// @electric-sql/pglite dorthin kopieren).
//
// Diese Datei ist ein ES-Modul: <script type="module" src="assets/js/db.js">
// bzw. import { initDB, globaleSuche } from "./assets/js/db.js".

import { PGlite } from "../vendor/pglite/index.js";
import { pg_trgm }     from "../vendor/pglite/contrib/pg_trgm.js";
import { unaccent }    from "../vendor/pglite/contrib/unaccent.js";
import { fuzzystrmatch } from "../vendor/pglite/contrib/fuzzystrmatch.js";

/**
 * Initialisiert die Datenbank.
 * @param {string} ablage  OPFS-Pfad, Phase 1: lokal/Netzlaufwerk-Ablage.
 *                         (Produktiv mit Personenbezug: Phase 2 BITBW/LVN.)
 */
export async function initDB(ablage = "opfs-ahp://rpf-tool") {
  const pg = new PGlite(ablage, {
    extensions: { pg_trgm, unaccent, fuzzystrmatch },
  });
  await pg.exec(`
    CREATE EXTENSION IF NOT EXISTS unaccent;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
    -- diakritika- und groß/kleinschreibungs-unempfindlich normalisieren
    -- (IMMUTABLE-Wrapper, damit als generierte Spalte/Index nutzbar)
    CREATE OR REPLACE FUNCTION bw_norm(t text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
      $$ SELECT lower(unaccent(coalesce(t,''))) $$;
  `);
  return pg;
}

/**
 * Legt eine Tabelle mit globaler Suchspalte + Trigramm-Index an.
 * @param pg          PGlite-Instanz
 * @param tabelle     Tabellenname
 * @param spalten     [{name, typ}] der fachlichen Spalten
 * @param suchspalten Namen der in die globale Suche eingehenden Textspalten
 */
export async function createTable(pg, tabelle, spalten, suchspalten) {
  const cols = spalten.map((c) => `${c.name} ${c.typ}`).join(",\n  ");
  const concat = suchspalten.map((s) => `coalesce(${s}::text,'')`).join(" || ' ' || ");
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS ${tabelle} (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ${cols},
      such_text text GENERATED ALWAYS AS ( bw_norm(${concat}) ) STORED
    );
    CREATE INDEX IF NOT EXISTS ${tabelle}_such_trgm
      ON ${tabelle} USING gin (such_text gin_trgm_ops);
  `);
}

/**
 * Intelligente, multitokenbasierte, globale Fuzzy-Suche in der Datenbank.
 * - global: durchsucht die zusammengeführte such_text-Spalte (alle Felder)
 * - multitoken: jedes Wort der Eingabe muss matchen (UND), Reihenfolge egal
 * - fuzzy: pg_trgm (typo-tolerant), diakritikatolerant über bw_norm/unaccent
 * - Ranking: Summe der word_similarity je Token, Treffer-Reihenfolge
 *
 * @returns Array der Datensätze, nach Relevanz sortiert
 */
export async function globaleSuche(pg, tabelle, query, { limit = 50, schwelle = 0.3 } = {}) {
  const tokens = String(query || "")
    .toLowerCase().replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    const all = await pg.query(`SELECT * FROM ${tabelle} ORDER BY id LIMIT $1`, [limit]);
    return all.rows;
  }

  // jedes Token: exakter Teilstring ODER Trigramm-Ähnlichkeit über der Schwelle
  const bedingungen = tokens
    .map((_, i) => `(such_text LIKE '%' || $${i + 1} || '%' OR word_similarity($${i + 1}, such_text) >= $${tokens.length + 1})`)
    .join(" AND ");
  const score = tokens.map((_, i) => `word_similarity($${i + 1}, such_text)`).join(" + ");

  const sql = `
    SELECT *, (${score}) AS relevanz
    FROM ${tabelle}
    WHERE ${bedingungen}
    ORDER BY relevanz DESC, id
    LIMIT ${Number(limit)}
  `;
  const res = await pg.query(sql, [...tokens, schwelle]);
  return res.rows;
}
