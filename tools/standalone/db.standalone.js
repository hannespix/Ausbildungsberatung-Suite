// db.standalone.js — Datenbankschicht für den Single-File-Build (Doppelklick,
// file://, kein Server). Gleiche API wie assets/js/db.js, aber:
//  - PGlite + Extensions aus dem npm-Paket (sauberes Bündeln),
//  - WASM/Daten EINGEBETTET über Provisioning (pgliteWasmModule/initdbWasmModule/
//    fsBundle) -> kein fetch unter file://,
//  - Extension-Tarballs als data:-URL (bundlePath überschrieben) -> Browser-
//    Dekomprimierung, kein Node-Zweig,
//  - Persistenz in IndexedDB (idb://) statt OPFS (file:// ist kein secure context).
// Der Build (tools/build_standalone.mjs) leitet die ./db.js-Importe hierher um
// und legt die Binärdateien unter ./pgbin/ ab.

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";

import pgliteWasm from "./pgbin/pglite.wasm";
import initdbWasm from "./pgbin/initdb.wasm";
import pgData from "./pgbin/pglite.data";
import trgmTar from "./pgbin/pg_trgm.tar.gz";
import unaccentTar from "./pgbin/unaccent.tar.gz";
import fuzzyTar from "./pgbin/fuzzystrmatch.tar.gz";

// Extension so umhüllen, dass das Bundle aus einer eingebetteten data:-URL kommt.
const mitBundle = (ext, dataUrl) => ({
  name: ext.name,
  setup: async () => ({ bundlePath: new URL(dataUrl) }),
});

export async function initDB(ablage = "idb://rpf-ausbildungspruefung") {
  const pg = new PGlite({
    dataDir: ablage,
    pgliteWasmModule: await WebAssembly.compile(pgliteWasm),
    initdbWasmModule: await WebAssembly.compile(initdbWasm),
    fsBundle: new Blob([pgData], { type: "application/octet-stream" }),
    extensions: {
      pg_trgm: mitBundle(pg_trgm, trgmTar),
      unaccent: mitBundle(unaccent, unaccentTar),
      fuzzystrmatch: mitBundle(fuzzystrmatch, fuzzyTar),
    },
  });
  await pg.exec(`
    CREATE EXTENSION IF NOT EXISTS unaccent;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
    CREATE OR REPLACE FUNCTION bw_norm(t text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
      $$ SELECT lower(unaccent(coalesce(t,''))) $$;
  `);
  return pg;
}

// --- ab hier identisch zu assets/js/db.js -------------------------------------

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

export async function globaleSuche(pg, tabelle, query, { limit = 50, schwelle = 0.3 } = {}) {
  const tokens = String(query || "")
    .toLowerCase().replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    const all = await pg.query(`SELECT * FROM ${tabelle} ORDER BY id LIMIT $1`, [limit]);
    return all.rows;
  }

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
