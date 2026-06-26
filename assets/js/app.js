// app.js — Oberfläche der Ausbildungsberatung-Suite (Vanilla JS, ES-Modul).
//
// Router (Hash) -> Übersicht / generische Listenansichten mit DB-seitiger
// Fuzzy-Suche und CRUD-Dialogen. Datenmodell: model.js, Persistenz: store.js.
// Design ausschließlich über bw-theme.css (--bw-*-Tokens), Texte deutsch.

import * as store from "./store.js";
import { ENTITAETEN, NAV_REIHENFOLGE, GALABAU_BEREICHE } from "./model.js";

let DB_MODUS = null;
const appEl = () => document.getElementById("app");
const meldungEl = () => document.getElementById("meldung");

/* ----------------------------------------------------------- Hilfsfunktionen */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function hl(text, query) {
  if (window.bwSearch && query) return window.bwSearch.highlight(text == null ? "" : String(text), query);
  return esc(text);
}

function formatWert(feld, value) {
  if (value == null || value === "") return "";
  if (feld.typ === "date") {
    const d = new Date(value);
    if (!isNaN(d)) return d.toLocaleDateString("de-DE");
  }
  if (feld.typ === "integer" || feld.typ === "numeric") {
    return Number(value).toLocaleString("de-DE");
  }
  return String(value);
}

function zahl(n) { return Number(n || 0).toLocaleString("de-DE"); }

function meldung(text, art = "erfolg") {
  const m = meldungEl();
  if (!m) return;
  m.className = "bw-hinweis bw-hinweis--" + art;
  m.textContent = text;
  m.hidden = false;
  clearTimeout(meldung._t);
  meldung._t = setTimeout(() => { m.hidden = true; }, 4000);
}

function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* --------------------------------------------------------------- Navigation */

function aktiveRoute() {
  const h = location.hash.replace(/^#\/?/, "").trim();
  return h || "uebersicht";
}

function navAufbauen() {
  const ul = document.getElementById("navlinks");
  if (!ul) return;
  const route = aktiveRoute();
  const punkte = [{ key: "uebersicht", label: "Übersicht" }]
    .concat(NAV_REIHENFOLGE.map((k) => ({ key: k, label: ENTITAETEN[k].plural })))
    .concat([{ key: "planung", label: "Planung" }, { key: "planungsliste", label: "Prüfer-Plan" }, { key: "noten", label: "Noten" }, { key: "zeugnisse", label: "Zeugnisse" }, { key: "auswertungen", label: "Auswertungen" }, { key: "kontakte", label: "Adressliste" }]);
  ul.innerHTML = punkte.map((p) => {
    const aktiv = p.key === route ? ' aria-current="page"' : "";
    return `<li><a href="#/${p.key === "uebersicht" ? "" : p.key}"${aktiv}>${esc(p.label)}</a></li>`;
  }).join("");
}

/* ----------------------------------------------------------------- Übersicht */

async function renderUebersicht() {
  const stats = [];
  for (const k of NAV_REIHENFOLGE) {
    stats.push({ key: k, label: ENTITAETEN[k].plural, n: await store.anzahl(k) });
  }
  const fortschritt = await store.fortschrittVerteilung();
  const fGesamt = fortschritt.reduce((s, r) => s + r.wert, 0);
  let hinweise = [];
  try { hinweise = await store.hinweise(); } catch (e) { console.warn("Hinweise nicht verfügbar:", e); }
  const fBestanden = (fortschritt.find((r) => r.key === "bestanden") || {}).wert || 0;
  const fNicht = (fortschritt.find((r) => r.key === "nicht_bestanden") || {}).wert || 0;
  const fBewertet = fBestanden + fNicht;
  const quote = fBewertet ? Math.round((fBestanden / fBewertet) * 100) : null;

  appEl().innerHTML = `
    <h1>Übersicht</h1>
    <p class="bw-unterzeile">Abschlussprüfung Gärtner/in — Planung, Verwaltung, Notenberechnung und Zeugnis</p>

    <section aria-labelledby="kennzahlen-h">
      <h2 id="kennzahlen-h">Kennzahlen</h2>
      <div class="bw-flaechen bw-stat-grid">
        ${stats.map((s) => `
          <a class="bw-card bw-stat" href="#/${s.key}">
            <span class="bw-stat__zahl">${zahl(s.n)}</span>
            <span class="bw-stat__label">${esc(s.label)}</span>
          </a>`).join("")}
      </div>
    </section>

    <section aria-labelledby="todo-h" style="margin-top:var(--bw-space-4)">
      <h2 id="todo-h">Was ist zu tun?</h2>
      ${hinweise.length ? `
        <ul class="bw-trefferliste">
          ${hinweise.map((h) => `
            <li>
              <span>${h.art === "fehler" ? '<span class="bw-status-dont">●</span> ' : ""}${esc(h.text)}</span>
              <a class="bw-btn bw-btn--sekundaer" href="${h.route}" style="margin-left:auto">Öffnen</a>
            </li>`).join("")}
        </ul>`
        : '<p class="bw-hinweis bw-hinweis--erfolg">Alles erledigt — keine offenen Aufgaben.</p>'}
    </section>

    <section aria-labelledby="diagramm-h" style="margin-top:var(--bw-space-4)">
      <h2 id="diagramm-h">Prüfungsfortschritt</h2>
      <p class="bw-klein bw-leise" id="fortschritt-summe">
        Automatisch aus Zulassung, Tagesplanung (<a href="#/planung">Planung</a>) und
        Bewertung (<a href="#/noten">Noten</a>) abgeleitet — keine manuelle Pflege nötig.${
          fBewertet
            ? ` Bewertet: ${zahl(fBewertet)} von ${zahl(fGesamt)} · bestanden ${zahl(fBestanden)}${quote !== null ? ` (Quote ${zahl(quote)} %)` : ""}.`
            : ""
        }
      </p>
      <div id="diagramm" class="bw-card"></div>
      <ul class="bw-legend">
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Anzahl je Phase</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> größter Wert</li>
      </ul>
    </section>

    <section aria-labelledby="demo-h" style="margin-top:var(--bw-space-4)">
      <h2 id="demo-h">Beispieldaten</h2>
      <div class="bw-card">
        <p class="bw-klein bw-leise">Fiktiver Datensatz zum Ausprobieren: ~155 Prüflinge über alle Gärtner-Fachrichtungen, Betriebe mit 1–10 Azubis, Prüfer:innen und Prüfungstermine.</p>
        <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
          <button class="bw-btn bw-btn--gelb" type="button" id="demo-erzeugen">Beispieldatensatz erzeugen</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="demo-loeschen">Alle Daten löschen</button>
        </div>
      </div>
    </section>

    <section aria-labelledby="autoplan-h" style="margin-top:var(--bw-space-4)">
      <h2 id="autoplan-h">Automatische Prüfungsplanung</h2>
      <div class="bw-card">
        <p class="bw-klein bw-leise">Verteilt alle Prüflinge je Fachrichtung gleichmäßig auf passend viele Prüfungstermine (Kapazität je Tag), nach PLZ geclustert, legt fehlende Termine an, vergibt Uhrzeiten (20-Minuten-Takt) und besetzt je Termin einen Ausschuss. Ergebnis im <a href="#/planungsliste">Prüfer-Plan</a> und in der <a href="#/planung">Planung</a>.</p>
        <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
          <button class="bw-btn bw-btn--gelb" type="button" id="autoplan-btn">Jetzt automatisch planen</button>
        </div>
      </div>
    </section>

    <section aria-labelledby="sicherung-h" style="margin-top:var(--bw-space-4)">
      <h2 id="sicherung-h">Datensicherung</h2>
      <div class="bw-card">
        <p class="bw-klein bw-leise">Alle Daten als Datei sichern und auf einem anderen Rechner oder im selben Browser wiederherstellen — vollständig offline. Empfohlen als regelmäßige Sicherung „daneben", da die Daten sonst nur im Browser dieses Geräts liegen.</p>
        <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
          <button class="bw-btn bw-btn--sekundaer" type="button" id="sicherung-export">Sicherung speichern (.json)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="sicherung-import-btn">Sicherung einlesen…</button>
          <input type="file" id="sicherung-datei" accept="application/json,.json" hidden>
        </div>
      </div>
    </section>
  `;

  document.getElementById("demo-erzeugen").addEventListener("click", async () => {
    if (!confirm("Großen Beispieldatensatz erzeugen? Vorhandene Daten werden dabei ersetzt.")) return;
    meldung("Beispieldaten werden erzeugt…");
    try {
      const n = await store.demodatenGenerieren();
      meldung(`Beispieldaten erzeugt: ${zahl(n.prueflinge)} Prüflinge, ${zahl(n.betriebe)} Betriebe, ${zahl(n.pruefer)} Prüfer:innen.`);
      renderUebersicht();
    } catch (e) { console.error(e); meldung("Erzeugen fehlgeschlagen: " + e.message, "fehler"); }
  });
  document.getElementById("demo-loeschen").addEventListener("click", async () => {
    if (!confirm("Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.")) return;
    try { await store.alleLoeschen(); meldung("Alle Daten gelöscht."); renderUebersicht(); }
    catch (e) { console.error(e); meldung("Löschen fehlgeschlagen: " + e.message, "fehler"); }
  });
  document.getElementById("autoplan-btn").addEventListener("click", async () => {
    const eingabe = prompt("Kapazität je Prüfungstermin (Prüflinge pro Tag):", "12");
    if (eingabe === null) return;
    const cap = Math.max(1, parseInt(eingabe, 10) || 12);
    if (!confirm(`Alle Prüflinge automatisch auf Termine (max. ${cap} je Termin) verteilen und Ausschüsse besetzen? Bestehende Zuteilungen werden ersetzt.`)) return;
    meldung("Planung wird erstellt…");
    try {
      const r = await store.planungAutomatisch(cap);
      meldung(`Geplant: ${zahl(r.zuteilungen)} Prüflinge auf ${zahl(r.termine)} Termine, ${zahl(r.prueferZuteilungen)} Prüfer-Zuteilungen.`);
      location.hash = "#/planungsliste";
    } catch (e) { console.error(e); meldung("Planung fehlgeschlagen: " + e.message, "fehler"); }
  });

  document.getElementById("sicherung-export").addEventListener("click", async () => {
    try {
      const daten = await store.sicherungErstellen();
      const heute = new Date().toISOString().slice(0, 10);
      dateiDownload(`Ausbildungsberatung-Sicherung-${heute}.json`, JSON.stringify(daten), "application/json;charset=utf-8");
      const n = Object.values(daten.tabellen).reduce((s, a) => s + a.length, 0);
      meldung(`Sicherung gespeichert: ${zahl(n)} Datensätze. Datei sicher ablegen.`);
    } catch (e) { console.error(e); meldung("Sicherung fehlgeschlagen: " + e.message, "fehler"); }
  });
  const dateiInput = document.getElementById("sicherung-datei");
  document.getElementById("sicherung-import-btn").addEventListener("click", () => dateiInput.click());
  dateiInput.addEventListener("change", async () => {
    const datei = dateiInput.files && dateiInput.files[0];
    if (!datei) return;
    if (!confirm("Sicherung einlesen? ALLE aktuellen Daten werden dabei ersetzt.")) { dateiInput.value = ""; return; }
    meldung("Sicherung wird eingelesen…");
    try {
      const text = await datei.text();
      const daten = JSON.parse(text);
      const r = await store.sicherungEinspielen(daten);
      meldung(`Sicherung eingelesen: ${zahl(r.zeilen)} Datensätze wiederhergestellt.`);
      renderUebersicht();
    } catch (e) {
      console.error(e);
      meldung("Einlesen fehlgeschlagen: " + e.message, "fehler");
    } finally { dateiInput.value = ""; }
  });

  if (window.bwChart && fGesamt) {
    const maxWert = Math.max.apply(null, fortschritt.map((r) => r.wert));
    window.bwChart.bars(
      document.getElementById("diagramm"),
      fortschritt.map((r) => ({ label: r.label, value: r.wert, highlight: r.wert === maxWert })),
      { titel: "Prüflinge je Phase" }
    );
  } else {
    document.getElementById("diagramm").innerHTML =
      '<p class="bw-leise">Noch keine Prüflinge erfasst.</p>';
  }
}

/* ----------------------------------------------------------- Listenansichten */

function tabellenSpalten(ent) { return ent.felder.filter((f) => f.tabelle); }

const FORTSCHRITT_LABELS = {
  angemeldet: "Angemeldet", zugelassen: "Zugelassen", eingeplant: "Eingeplant",
  bestanden: "Bestanden", nicht_bestanden: "Nicht bestanden", zurueckgezogen: "Zurückgezogen",
};
/** CI-konformes Status-Pill für eine abgeleitete Prüfungs-Phase. */
function fortschrittTag(phase) {
  const cls = phase === "bestanden" ? " bw-tag--ok"
    : phase === "nicht_bestanden" ? " bw-tag--fehler"
    : phase === "eingeplant" ? " bw-tag--aktiv" : "";
  return `<span class="bw-tag${cls}">${esc(FORTSCHRITT_LABELS[phase] || phase)}</span>`;
}

function zeileHtml(ent, row, query, phase) {
  const tds = tabellenSpalten(ent).map((f) => {
    const roh = formatWert(f, row[f.name]);
    return `<td>${f.such ? hl(roh, query) : esc(roh)}</td>`;
  }).join("");
  const fortschrittTd = phase !== undefined ? `<td>${fortschrittTag(phase)}</td>` : "";
  const akte = ent.key === "prueflinge"
    ? `<a class="bw-iconbtn" href="#/pruefling/${row.id}" aria-label="Akte von ${esc((row.vorname || "") + " " + (row.nachname || ""))} öffnen" title="Akte öffnen">📋</a>`
    : "";
  const abw = ent.key === "pruefer"
    ? `<button class="bw-iconbtn" type="button" data-abwesenheit="${row.id}" aria-label="Abwesenheiten von ${esc((row.vorname || "") + " " + (row.nachname || ""))}" title="Abwesenheiten">📅</button>`
    : "";
  return `<tr>${tds}${fortschrittTd}
    <td class="bw-actions">
      ${akte}${abw}
      <button class="bw-iconbtn" type="button" data-edit="${row.id}" aria-label="${esc(ent.singular)} bearbeiten" title="Bearbeiten">✎</button>
      <button class="bw-iconbtn" type="button" data-del="${row.id}" aria-label="${esc(ent.singular)} löschen" title="Löschen">🗑</button>
    </td></tr>`;
}

/** Typbewusster Vergleich zweier Datensätze nach Feld f (leere Werte ans Ende). */
function vergleichWert(f, a, b) {
  const x = a[f.name], y = b[f.name];
  const leerX = x == null || x === "", leerY = y == null || y === "";
  if (leerX && leerY) return 0;
  if (leerX) return 1;
  if (leerY) return -1;
  if (f.typ === "integer" || f.typ === "numeric") return Number(x) - Number(y);
  if (f.typ === "date") return new Date(x) - new Date(y);
  return String(x).localeCompare(String(y), "de", { sensitivity: "base", numeric: true });
}

async function renderListe(key) {
  const ent = ENTITAETEN[key];
  if (!ent) { location.hash = "#/"; return; }
  const spalten = tabellenSpalten(ent);
  const zeigtFortschritt = key === "prueflinge";
  let sortName = null, sortDir = 1;

  const kopfRow = () => spalten.map((f) => {
    const aktiv = f.name === sortName;
    const marker = aktiv ? (sortDir === 1 ? " ▲" : " ▼") : "";
    const aria = aktiv ? (sortDir === 1 ? "ascending" : "descending") : "none";
    return `<th class="bw-th-sort" data-sort="${f.name}" role="button" tabindex="0" aria-sort="${aria}"
                title="Nach ${esc(f.label)} sortieren">${esc(f.label)}<span aria-hidden="true">${marker}</span></th>`;
  }).join("") + `${zeigtFortschritt ? "<th>Fortschritt</th>" : ""}<th>Aktionen</th>`;

  appEl().innerHTML = `
    <h1>${esc(ent.plural)}</h1>
    <div class="bw-toolbar">
      <div class="bw-search">
        <label for="modulsuche" class="bw-skip-link">${esc(ent.plural)} durchsuchen</label>
        <input id="modulsuche" type="search" placeholder="Suchen… (tippfehler­tolerant, alle Felder)"
               aria-label="${esc(ent.plural)} durchsuchen" autocomplete="off">
        <button type="button" id="suche-btn">Suchen</button>
      </div>
      ${key === "prueflinge" ? '<button class="bw-btn bw-btn--sekundaer" type="button" id="csv-btn">CSV importieren</button>' : ""}
      <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-export-btn">CSV exportieren</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="drucken-btn">Liste drucken</button>
      <button class="bw-btn bw-btn--gelb" type="button" id="neu-btn">＋ Neuer Eintrag</button>
    </div>

    <div id="liste-bereich" aria-live="polite">
      <table class="bw-table">
        <thead><tr id="kopf">${kopfRow()}</tr></thead>
        <tbody id="zeilen"></tbody>
      </table>
      <p id="leer" class="bw-hinweis" hidden></p>
    </div>
  `;

  const eingabe = document.getElementById("modulsuche");
  let aktuelleRows = [], aktuellePhasen = null;
  const zeichne = async () => {
    const q = eingabe.value;
    let rows;
    try { rows = await store.suche(key, q); }
    catch (e) { console.error(e); meldung("Suche fehlgeschlagen: " + e.message, "fehler"); return; }
    if (sortName) {
      const f = spalten.find((s) => s.name === sortName);
      if (f) rows = rows.slice().sort((a, b) => vergleichWert(f, a, b) * sortDir);
    }
    document.getElementById("kopf").innerHTML = kopfRow();
    let phaseMap = null;
    if (zeigtFortschritt) {
      try {
        const ph = await store.fortschrittAlle();
        phaseMap = new Map(ph.map((r) => [String(r.id), r.phase]));
      } catch (e) { console.warn("Fortschritt nicht verfügbar:", e); }
    }
    aktuelleRows = rows; aktuellePhasen = phaseMap;
    document.getElementById("zeilen").innerHTML = rows
      .map((r) => zeileHtml(ent, r, q, phaseMap ? (phaseMap.get(String(r.id)) || "angemeldet") : undefined))
      .join("");
    const leer = document.getElementById("leer");
    if (!rows.length) {
      leer.hidden = false;
      leer.textContent = q
        ? `Keine Treffer für „${q}". Suchbegriff ändern oder neuen Eintrag anlegen.`
        : `Noch keine ${ent.plural} erfasst. Mit „Neuer Eintrag" beginnen.`;
    } else {
      leer.hidden = true;
    }
  };

  eingabe.addEventListener("input", debounce(zeichne, 180));
  document.getElementById("suche-btn").addEventListener("click", zeichne);
  document.getElementById("neu-btn").addEventListener("click", () => formularOeffnen(key, null, zeichne));
  document.getElementById("csv-btn")?.addEventListener("click", () => csvImportDialog(zeichne));

  // Spalten der aktuellen Liste (sichtbare Felder + ggf. Fortschritt) für Export/Druck.
  const exportKopf = () => spalten.map((f) => f.label).concat(zeigtFortschritt ? ["Fortschritt"] : []);
  const exportZeile = (r) => spalten.map((f) => formatWert(f, r[f.name]))
    .concat(zeigtFortschritt ? [FORTSCHRITT_LABELS[(aktuellePhasen && aktuellePhasen.get(String(r.id))) || "angemeldet"] || ""] : []);

  document.getElementById("csv-export-btn").addEventListener("click", () => {
    if (!aktuelleRows.length) { meldung("Keine Einträge zum Exportieren.", "fehler"); return; }
    dateiDownload(`${ent.plural}.csv`, csvText(exportKopf(), aktuelleRows.map(exportZeile)), "text/csv;charset=utf-8");
    meldung(`CSV exportiert: ${zahl(aktuelleRows.length)} ${ent.plural}.`);
  });
  document.getElementById("drucken-btn").addEventListener("click", () => {
    if (!aktuelleRows.length) { meldung("Keine Einträge zum Drucken.", "fehler"); return; }
    const kopf = exportKopf();
    druckbereich().innerHTML = `
      <h1>${esc(ent.plural)} (${zahl(aktuelleRows.length)})</h1>
      <table class="bw-table">
        <thead><tr>${kopf.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${aktuelleRows.map((r) => `<tr>${exportZeile(r).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
    window.print();
  });

  const sortieren = (name) => {
    if (sortName === name) sortDir = -sortDir; else { sortName = name; sortDir = 1; }
    zeichne();
  };
  document.getElementById("kopf").addEventListener("click", (ev) => {
    const th = ev.target.closest("[data-sort]");
    if (th) sortieren(th.getAttribute("data-sort"));
  });
  document.getElementById("kopf").addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const th = ev.target.closest("[data-sort]");
    if (th) { ev.preventDefault(); sortieren(th.getAttribute("data-sort")); }
  });

  document.getElementById("zeilen").addEventListener("click", async (ev) => {
    const editId = ev.target.closest("[data-edit]")?.getAttribute("data-edit");
    const delId = ev.target.closest("[data-del]")?.getAttribute("data-del");
    const abwId = ev.target.closest("[data-abwesenheit]")?.getAttribute("data-abwesenheit");
    if (abwId) {
      const rec = await store.holen("pruefer", Number(abwId));
      abwesenheitDialog(Number(abwId), rec ? `${rec.vorname || ""} ${rec.nachname || ""}`.trim() : "Prüfer:in");
      return;
    }
    if (editId) {
      const rec = await store.holen(key, Number(editId));
      formularOeffnen(key, rec, zeichne);
    } else if (delId) {
      const rec = await store.holen(key, Number(delId));
      const name = rec ? (rec.name || `${rec.vorname || ""} ${rec.nachname || ""}`.trim() || rec.titel || "Eintrag") : "Eintrag";
      if (confirm(`„${name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
        await store.loeschen(key, Number(delId));
        meldung(`${ent.singular} gelöscht.`);
        zeichne();
      }
    }
  });

  zeichne();
}

/* ----------------------------------------------------- Prüfungstag-Planung */

function terminLabel(t) {
  const datum = t.datum ? new Date(t.datum).toLocaleDateString("de-DE") : "ohne Datum";
  return `${t.titel} — ${datum}${t.ort ? " · " + t.ort : ""}`;
}

/* --------------------------------------------------- Kalender-Export (ICS)
   Erzeugt offline eine iCalendar-Datei (RFC 5545) – ohne externe Requests,
   in Outlook/Thunderbird/Apple Kalender importierbar. */

function icsEscape(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
/** Datum (Date oder "YYYY-MM-DD") -> "YYYYMMDD". */
function icsDatum(datum) {
  if (datum instanceof Date && !isNaN(datum)) {
    return String(datum.getFullYear()) +
      String(datum.getMonth() + 1).padStart(2, "0") +
      String(datum.getDate()).padStart(2, "0");
  }
  return String(datum).slice(0, 10).replace(/-/g, "");
}
/** Datum(+ "HH:MM") -> "YYYYMMDD" bzw. "YYYYMMDDTHHMMSS" (lokale Zeit). */
function icsZeit(datum, zeit) {
  const d = icsDatum(datum);
  if (!zeit) return d;
  const t = String(zeit).slice(0, 5).replace(":", "") + "00";
  return d + "T" + t;
}
/** Faltet ICS-Zeilen auf max. 75 Oktette (vereinfachte UTF-Annäherung). */
function icsFold(zeile) {
  if (zeile.length <= 75) return zeile;
  const teile = [];
  let rest = zeile;
  teile.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) { teile.push(" " + rest.slice(0, 74)); rest = rest.slice(74); }
  return teile.join("\r\n");
}

/** Baut ein VCALENDAR aus Termin-Datensätzen (store.kalenderDaten()). */
function icsBauen(termine) {
  const stempel = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RP Freiburg//Ausbildungsberatung-Suite//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  termine.forEach((t) => {
    const beschreibung = [
      t.beruf ? "Fachrichtung: " + t.beruf : "",
      t.prueflinge != null ? "Prüflinge: " + t.prueflinge : "",
      t.ausschuss ? "Ausschuss: " + t.ausschuss : "",
    ].filter(Boolean).join("\n");
    const ort = [t.ort, t.raum].filter(Boolean).join(", ");
    zeilen.push("BEGIN:VEVENT");
    zeilen.push("UID:rpf-termin-" + t.id + "@ausbildungsberatung");
    zeilen.push("DTSTAMP:" + stempel);
    if (t.zeit_von) {
      zeilen.push("DTSTART:" + icsZeit(t.datum, t.zeit_von));
      zeilen.push("DTEND:" + icsZeit(t.datum, t.zeit_bis || t.zeit_von));
    } else {
      zeilen.push("DTSTART;VALUE=DATE:" + icsZeit(t.datum));
    }
    zeilen.push("SUMMARY:" + icsEscape(t.titel || "Prüfungstermin"));
    if (ort) zeilen.push("LOCATION:" + icsEscape(ort));
    if (beschreibung) zeilen.push("DESCRIPTION:" + icsEscape(beschreibung));
    zeilen.push("END:VEVENT");
  });
  zeilen.push("END:VCALENDAR");
  return zeilen.map(icsFold).join("\r\n") + "\r\n";
}

/** Lädt einen Text als Datei herunter (offline, ohne externe Requests). */
function dateiDownload(dateiname, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function icsDownload(dateiname, text) {
  dateiDownload(dateiname, text, "text/calendar;charset=utf-8");
}

/** Liefert (und erzeugt bei Bedarf) den nur beim Drucken sichtbaren Bereich. */
function druckbereich() {
  let root = document.getElementById("druckbereich");
  if (!root) {
    root = document.createElement("div");
    root.className = "bw-druck";
    root.id = "druckbereich";
    document.body.appendChild(root);
  }
  return root;
}

/** Baut einen druckbaren Tagesablauf (nur beim Drucken sichtbar) und druckt. */
/**
 * Fester Ablauf des handlungsorientierten Prüfungstags im GaLaBau
 * (Grundlage: Präsentation „Handlungsorientierte Prüfung im GaLaBau", RPF).
 */
const GALABAU_TAGESPHASEN = [
  { phase: "Praktische Prüfung (Gewerk)", dauer: "4,5 Std." },
  { phase: "Fachgespräch", dauer: "10 Min. je Prüfling" },
  { phase: "Mittagspause", dauer: "" },
  { phase: "Pflanzenbestimmung", dauer: "20 Pflanzen / 20 Min." },
  { phase: "Zeugnisübergabe", dauer: "" },
];

function tagesablaufDrucken(termin, zugeteilt, prueferZug) {
  const root = druckbereich();
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const kopf = [
    datum,
    termin.zeit_von ? esc(termin.zeit_von) + (termin.zeit_bis ? "–" + esc(termin.zeit_bis) : "") : "",
    termin.ort ? esc(termin.ort) + (termin.raum ? ", " + esc(termin.raum) : "") : "",
    termin.beruf ? esc(termin.beruf) : "",
  ].filter(Boolean).join(" · ");
  const istGalabau = termin.beruf === "Garten- und Landschaftsbau";

  root.innerHTML = `
    <h1>Tagesablauf — ${esc(termin.titel)}</h1>
    <p>${kopf}</p>
    ${istGalabau ? `
    <h2>Ablauf des Prüfungstags</h2>
    <table class="bw-table">
      <thead><tr><th>Phase</th><th>Richtwert</th></tr></thead>
      <tbody>${GALABAU_TAGESPHASEN.map((x) => `<tr><td>${esc(x.phase)}</td><td>${esc(x.dauer || "—")}</td></tr>`).join("")}</tbody>
    </table>` : ""}
    <h2>Prüflinge (${zahl(zugeteilt.length)})</h2>
    <table class="bw-table">
      <thead><tr><th>Uhrzeit</th><th>Name</th><th>Beruf</th><th>Betrieb</th></tr></thead>
      <tbody>${zugeteilt.map((z) => `<tr><td>${esc(z.slot || "—")}</td><td>${esc((z.nachname || "") + ", " + (z.vorname || ""))}</td><td>${esc(z.beruf || "")}</td><td>${esc(z.betrieb || "")}</td></tr>`).join("")}</tbody>
    </table>
    <h2>Ausschuss (${zahl(prueferZug.length)})</h2>
    <table class="bw-table">
      <thead><tr><th>Rolle</th><th>Name</th><th>Organisation</th></tr></thead>
      <tbody>${prueferZug.map((p) => `<tr><td>${esc(p.rolle || "—")}</td><td>${esc((p.nachname || "") + ", " + (p.vorname || ""))}</td><td>${esc(p.organisation || "")}</td></tr>`).join("")}</tbody>
    </table>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>
  `;
  window.print();
}

/** Druckbare Ergebnis-Niederschrift je Termin: Prüflinge mit Note + Ergebnis. */
function niederschriftDrucken(termin, ergebnisse, prueferZug) {
  const root = druckbereich();
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const kopf = [
    datum,
    termin.ort ? esc(termin.ort) + (termin.raum ? ", " + esc(termin.raum) : "") : "",
    termin.beruf ? esc(termin.beruf) : "",
  ].filter(Boolean).join(" · ");
  const bestanden = ergebnisse.filter((r) => r.bestanden === true).length;
  const bewertet = ergebnisse.filter((r) => r.gesamt != null).length;

  root.innerHTML = `
    <h1>Ergebnis-Niederschrift — ${esc(termin.titel)}</h1>
    <p>${kopf}</p>
    <p class="bw-klein">Praktische Abschlussprüfung Gärtner/in · ${zahl(ergebnisse.length)} Prüflinge · ${zahl(bewertet)} bewertet · ${zahl(bestanden)} bestanden</p>

    <table class="bw-table">
      <thead><tr><th>Uhrzeit</th><th>Name</th><th>Betrieb</th><th>Praxis</th><th>Kenntnis</th><th>Gesamtnote</th><th>Ergebnis</th></tr></thead>
      <tbody>${ergebnisse.map((r) => `
        <tr>
          <td>${esc(r.slot || "—")}</td>
          <td>${esc((r.nachname || "") + ", " + (r.vorname || ""))}</td>
          <td>${esc(r.betrieb || "")}</td>
          <td>${formatNote(r.praxis)}</td>
          <td>${formatNote(r.kenntnis)}</td>
          <td><strong>${formatNote(r.gesamt)}</strong></td>
          <td>${r.bestanden === true ? "bestanden" : r.bestanden === false ? "nicht bestanden" : "—"}</td>
        </tr>`).join("")}</tbody>
    </table>

    <h2>Prüfungsausschuss</h2>
    <table class="bw-table">
      <thead><tr><th>Rolle</th><th>Name</th><th>Unterschrift</th></tr></thead>
      <tbody>${(prueferZug.length ? prueferZug : [{}, {}, {}]).map((p) => `
        <tr><td>${esc(p.rolle || "—")}</td><td>${esc(((p.nachname || "") + (p.vorname ? ", " + p.vorname : "")) || "—")}</td><td style="min-width:8rem"> </td></tr>`).join("")}</tbody>
    </table>
    <p>Ort, Datum: ${esc(termin.ort || "")}${termin.ort ? ", " : ""}den ${esc(datum)}</p>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>
  `;
  window.print();
}

async function renderPlanung() {
  const termine = await store.liste("pruefungen");
  if (!termine.length) {
    appEl().innerHTML = `
      <h1>Prüfungstag-Planung</h1>
      <p class="bw-hinweis">Noch keine Prüfungstermine vorhanden.
        Bitte zuerst unter <a href="#/pruefungen">Prüfungstermine</a> einen Termin anlegen.</p>`;
    return;
  }

  appEl().innerHTML = `
    <h1>Prüfungstag-Planung</h1>
    <p class="bw-unterzeile">Prüflinge den Prüfungsterminen zuteilen und den Tagesablauf planen</p>
    <div class="bw-toolbar">
      <div class="bw-field" style="max-width:36rem;flex:1 1 24rem;margin:0">
        <label for="pruefungswahl">Prüfungstermin</label>
        <select id="pruefungswahl">
          ${termine.map((t) => `<option value="${t.id}">${esc(terminLabel(t))}</option>`).join("")}
        </select>
      </div>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="ics-alle">Alle Termine als Kalender (.ics)</button>
    </div>
    <div id="plan" aria-live="polite"></div>
  `;

  const wahl = document.getElementById("pruefungswahl");

  document.getElementById("ics-alle").addEventListener("click", async () => {
    try {
      const daten = await store.kalenderDaten();
      if (!daten.length) { meldung("Keine Termine mit Datum für den Kalender-Export.", "fehler"); return; }
      icsDownload("Pruefungstermine-Gaertner.ics", icsBauen(daten));
      meldung(`Kalender exportiert: ${zahl(daten.length)} Termine (.ics). In Outlook über „Datei → Öffnen/Importieren" einlesen.`);
    } catch (e) { console.error(e); meldung("Kalender-Export fehlgeschlagen: " + e.message, "fehler"); }
  });

  async function planZeichnen() {
    const id = Number(wahl.value);
    const termin = termine.find((t) => t.id === id);
    const zugeteilt = await store.zuteilungenFuer(id);
    const offen = await store.nichtZugeteilt(id);
    const prueferZug = await store.prueferFuer(id);
    const prueferOff = await store.prueferOffen(id);
    const ROLLEN = (ENTITAETEN.pruefer.felder.find((f) => f.name === "funktion") || {}).optionen || [];

    document.getElementById("plan").innerHTML = `
      <div class="bw-card bw-toolbar" style="margin-bottom:var(--bw-space-3)">
        <div>
          <strong>${esc(termin.titel)}</strong>
          <div class="bw-klein bw-leise">
            ${termin.datum ? esc(new Date(termin.datum).toLocaleDateString("de-DE")) : "ohne Datum"}
            ${termin.zeit_von ? " · " + esc(termin.zeit_von) + (termin.zeit_bis ? "–" + esc(termin.zeit_bis) : "") : ""}
            ${termin.ort ? " · " + esc(termin.ort) : ""}${termin.raum ? ", " + esc(termin.raum) : ""}
            ${termin.beruf ? " · " + esc(termin.beruf) : ""}
          </div>
        </div>
        <div class="bw-toolbar" style="margin:0">
          <button class="bw-btn bw-btn--sekundaer" type="button" id="ics-termin"
                  ${termin.datum ? "" : "disabled title=\"Termin ohne Datum\""}>Termin als .ics</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="drucken-btn"
                  ${zugeteilt.length || prueferZug.length ? "" : "disabled"}>Tagesablauf drucken</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="niederschrift-btn"
                  ${zugeteilt.length ? "" : "disabled title=\"Keine Prüflinge zugeteilt\""}>Ergebnis-Niederschrift</button>
        </div>
      </div>

      <h2>Zugeteilte Prüflinge (${zahl(zugeteilt.length)})</h2>
      <div class="bw-toolbar" style="margin-bottom:var(--bw-space-2)"${zugeteilt.length ? "" : " hidden"}>
        <div class="bw-field" style="margin:0">
          <label for="raster-start" class="bw-skip-link">Beginn</label>
          <input id="raster-start" type="time" value="${esc(termin.zeit_von || "08:00")}" aria-label="Beginn des Zeitrasters">
        </div>
        <div class="bw-field" style="margin:0">
          <label for="raster-takt" class="bw-skip-link">Minuten je Prüfling</label>
          <input id="raster-takt" type="number" min="1" max="120" value="20" inputmode="numeric"
                 aria-label="Minuten je Prüfling" style="width:6rem">
        </div>
        <button class="bw-btn bw-btn--sekundaer" type="button" id="raster-btn">Zeitraster erzeugen</button>
        <button class="bw-btn bw-btn--sekundaer" type="button" id="raster-loeschen">Uhrzeiten löschen</button>
        <span class="bw-klein bw-leise"> — vergibt fortlaufende Uhrzeiten in Reihenfolge.</span>
      </div>
      <table class="bw-table">
        <thead><tr><th>Uhrzeit</th><th>Name</th><th>Beruf</th><th>Betrieb</th><th>Aktion</th></tr></thead>
        <tbody>
          ${zugeteilt.map((z) => `
            <tr>
              <td>${esc(z.slot || "—")}</td>
              <td>${esc((z.nachname || "") + ", " + (z.vorname || ""))}</td>
              <td>${esc(z.beruf || "")}</td>
              <td>${esc(z.betrieb || "")}</td>
              <td class="bw-actions">
                <button class="bw-iconbtn" type="button" data-remove="${z.zuteilung_id}"
                        aria-label="Zuteilung von ${esc((z.vorname || "") + " " + (z.nachname || ""))} entfernen" title="Entfernen">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
      <p id="plan-leer" class="bw-hinweis"${zugeteilt.length ? " hidden" : ""}>Noch keine Prüflinge zugeteilt.</p>

      <h2 style="margin-top:var(--bw-space-4)">Prüfling zuteilen</h2>
      <div class="bw-toolbar">
        <div class="bw-field" style="flex:1 1 18rem;margin:0">
          <label for="pruefling-wahl" class="bw-skip-link">Prüfling</label>
          <select id="pruefling-wahl"${offen.length ? "" : " disabled"}>
            ${offen.length
              ? offen.map((p) => `<option value="${p.id}">${esc((p.nachname || "") + ", " + (p.vorname || "") + (p.beruf ? " (" + p.beruf + ")" : ""))}</option>`).join("")
              : '<option value="">Alle Prüflinge bereits zugeteilt</option>'}
          </select>
        </div>
        <div class="bw-field" style="margin:0">
          <label for="slot-wahl" class="bw-skip-link">Uhrzeit</label>
          <input id="slot-wahl" type="time" aria-label="Uhrzeit (optional)"${offen.length ? "" : " disabled"}>
        </div>
        <button class="bw-btn bw-btn--gelb" type="button" id="zuteilen-btn"${offen.length ? "" : " disabled"}>Zuteilen</button>
      </div>
      <p style="margin-top:var(--bw-space-2)">
        <button class="bw-btn bw-btn--sekundaer" type="button" id="auto-zuteilen-btn"${termin.beruf ? "" : " disabled title=\"Termin ohne Fachrichtung\""}>
          Alle passenden Prüflinge automatisch zuteilen${termin.beruf ? ` (${esc(termin.beruf)})` : ""}
        </button>
        <span class="bw-klein bw-leise"> — in alphabetischer Reihenfolge; Uhrzeiten manuell vergeben.</span>
      </p>

      <h2 style="margin-top:var(--bw-space-4)">Ausschuss / Prüfer:innen (${zahl(prueferZug.length)})</h2>
      <table class="bw-table">
        <thead><tr><th>Rolle</th><th>Name</th><th>Organisation</th><th>Aktion</th></tr></thead>
        <tbody id="pruefer-koerper">
          ${prueferZug.map((p) => `
            <tr>
              <td>${esc(p.rolle || "—")}</td>
              <td>${esc((p.nachname || "") + ", " + (p.vorname || ""))}</td>
              <td>${esc(p.organisation || "")}</td>
              <td class="bw-actions">
                <button class="bw-iconbtn" type="button" data-remove-pruefer="${p.zuteilung_id}"
                        aria-label="Prüfer:in ${esc((p.vorname || "") + " " + (p.nachname || ""))} entfernen" title="Entfernen">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
      <p class="bw-hinweis"${prueferZug.length ? " hidden" : ""}>Noch keine Prüfer:innen zugeteilt.</p>

      <h2 style="margin-top:var(--bw-space-4)">Prüfer:in zuteilen</h2>
      <div class="bw-toolbar">
        <div class="bw-field" style="flex:1 1 18rem;margin:0">
          <label for="pruefer-wahl" class="bw-skip-link">Prüfer:in</label>
          <select id="pruefer-wahl"${prueferOff.length ? "" : " disabled"}>
            ${prueferOff.length
              ? prueferOff.map((p) => `<option value="${p.id}">${esc((p.nachname || "") + ", " + (p.vorname || "") + (p.organisation ? " (" + p.organisation + ")" : ""))}</option>`).join("")
              : '<option value="">Alle Prüfer:innen bereits zugeteilt</option>'}
          </select>
        </div>
        <div class="bw-field" style="margin:0">
          <label for="rolle-wahl" class="bw-skip-link">Rolle</label>
          <select id="rolle-wahl" aria-label="Rolle (optional)"${prueferOff.length ? "" : " disabled"}>
            <option value="">— Rolle —</option>
            ${ROLLEN.map((r) => `<option>${esc(r)}</option>`).join("")}
          </select>
        </div>
        <button class="bw-btn bw-btn--gelb" type="button" id="pruefer-zuteilen-btn"${prueferOff.length ? "" : " disabled"}>Zuteilen</button>
      </div>
    `;

    document.getElementById("zuteilen-btn")?.addEventListener("click", async () => {
      const pid = Number(document.getElementById("pruefling-wahl").value);
      if (!pid) { meldung("Bitte einen Prüfling wählen.", "fehler"); return; }
      const slot = document.getElementById("slot-wahl").value || null;
      try {
        const konflikte = await store.terminkonflikte(pid, id);
        if (konflikte.length) {
          const liste = konflikte.map((k) => `„${k.titel}"`).join(", ");
          if (!confirm(`Dieser Prüfling ist am selben Tag bereits zugeteilt (${liste}). Trotzdem zuteilen?`)) return;
        }
        await store.zuteilen(id, pid, slot);
        meldung("Prüfling zugeteilt.");
        planZeichnen();
      } catch (e) { console.error(e); meldung("Zuteilen fehlgeschlagen: " + e.message, "fehler"); }
    });

    document.getElementById("auto-zuteilen-btn")?.addEventListener("click", async () => {
      if (!termin.beruf) return;
      if (!confirm(`Alle noch nicht zugeteilten Prüflinge der Fachrichtung „${termin.beruf}" diesem Termin zuteilen?`)) return;
      meldung("Prüflinge werden zugeteilt…");
      try {
        const r = await store.autoZuteilenNachFachrichtung(id);
        meldung(r.zugeteilt ? `${zahl(r.zugeteilt)} Prüflinge automatisch zugeteilt.` : "Keine passenden, noch offenen Prüflinge gefunden.");
        planZeichnen();
      } catch (e) { console.error(e); meldung("Auto-Zuteilung fehlgeschlagen: " + e.message, "fehler"); }
    });

    document.querySelector("#plan tbody")?.addEventListener("click", async (ev) => {
      const rid = ev.target.closest("[data-remove]")?.getAttribute("data-remove");
      if (!rid) return;
      await store.entferneZuteilung(Number(rid));
      meldung("Zuteilung entfernt.");
      planZeichnen();
    });

    document.getElementById("raster-btn")?.addEventListener("click", async () => {
      const start = document.getElementById("raster-start").value || null;
      const takt = parseInt(document.getElementById("raster-takt").value, 10) || 20;
      try {
        const r = await store.zeitrasterVergeben(id, start, takt);
        meldung(r.anzahl
          ? `Zeitraster vergeben: ${zahl(r.anzahl)} Prüflinge ab ${r.beginn} Uhr im ${zahl(r.minuten)}-Minuten-Takt.`
          : "Keine zugeteilten Prüflinge für ein Zeitraster.");
        planZeichnen();
      } catch (e) { console.error(e); meldung("Zeitraster fehlgeschlagen: " + e.message, "fehler"); }
    });

    document.getElementById("raster-loeschen")?.addEventListener("click", async () => {
      await store.zeitrasterLoeschen(id);
      meldung("Uhrzeiten entfernt.");
      planZeichnen();
    });

    document.getElementById("pruefer-zuteilen-btn")?.addEventListener("click", async () => {
      const prid = Number(document.getElementById("pruefer-wahl").value);
      if (!prid) { meldung("Bitte eine:n Prüfer:in wählen.", "fehler"); return; }
      const rolle = document.getElementById("rolle-wahl").value || null;
      try {
        if (termin.datum && await store.istAbwesend(prid, termin.datum)) {
          const datum = new Date(termin.datum).toLocaleDateString("de-DE");
          if (!confirm(`Diese:r Prüfer:in ist am ${datum} als abwesend hinterlegt. Trotzdem zuteilen?`)) return;
        }
        await store.prueferZuteilen(id, prid, rolle);
        meldung("Prüfer:in zugeteilt.");
        planZeichnen();
      } catch (e) { console.error(e); meldung("Zuteilen fehlgeschlagen: " + e.message, "fehler"); }
    });

    document.getElementById("pruefer-koerper")?.addEventListener("click", async (ev) => {
      const rid = ev.target.closest("[data-remove-pruefer]")?.getAttribute("data-remove-pruefer");
      if (!rid) return;
      await store.entfernePrueferZuteilung(Number(rid));
      meldung("Prüfer-Zuteilung entfernt.");
      planZeichnen();
    });

    document.getElementById("drucken-btn")?.addEventListener("click", () => {
      tagesablaufDrucken(termin, zugeteilt, prueferZug);
    });

    document.getElementById("niederschrift-btn")?.addEventListener("click", async () => {
      try {
        const ergebnisse = await store.terminErgebnisse(id);
        niederschriftDrucken(termin, ergebnisse, prueferZug);
      } catch (e) { console.error(e); meldung("Niederschrift fehlgeschlagen: " + e.message, "fehler"); }
    });

    document.getElementById("ics-termin")?.addEventListener("click", async () => {
      try {
        const daten = (await store.kalenderDaten()).filter((t) => String(t.id) === String(id));
        if (!daten.length) { meldung("Dieser Termin hat kein Datum.", "fehler"); return; }
        icsDownload(`Pruefungstermin-${id}.ics`, icsBauen(daten));
        meldung("Termin als .ics exportiert — in Outlook importierbar.");
      } catch (e) { console.error(e); meldung("Export fehlgeschlagen: " + e.message, "fehler"); }
    });
  }

  wahl.addEventListener("change", planZeichnen);
  planZeichnen();
}

/* --------------------------------------------------- Prüfer-Plan / Zusagen */

function zusageBadge(status) {
  if (status === "zugesagt") return '<span class="bw-status-do">zugesagt</span>';
  if (status === "abgesagt") return '<span class="bw-status-dont">abgesagt</span>';
  if (status === "angefragt") return '<span class="bw-tag">angefragt</span>';
  return '<span class="bw-leise">offen</span>';
}

function anfrageMailto(termin) {
  const emails = termin.pruefer.map((p) => p.email).filter(Boolean);
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const betreff = `Prüfungseinladung – ${termin.titel} am ${datum}`;
  const text =
    `Sehr geehrte Prüferin, sehr geehrter Prüfer,\n\n` +
    `Sie sind für folgende praktische Abschlussprüfung (Gärtner/in) als Mitglied des Prüfungsausschusses vorgesehen:\n\n` +
    `Termin: ${termin.titel}\nDatum: ${datum}${termin.zeit_von ? ", " + termin.zeit_von + " Uhr" : ""}\n` +
    `Ort: ${termin.ort || "—"}${termin.raum ? " (" + termin.raum + ")" : ""}\n` +
    `Prüflinge: ${termin.anzahl_prueflinge}\n\n` +
    `Bitte teilen Sie uns Ihre Zu- oder Absage mit.\n\nMit freundlichen Grüßen\nAusbildungsberatung, Regierungspräsidium Freiburg`;
  return `mailto:${encodeURIComponent(emails.join(","))}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

async function renderPlanungsliste() {
  const liste = await store.planungsListe();
  const z = await store.zusageZaehler();

  const terminCard = (t) => `
    <div class="bw-card" style="margin-bottom:var(--bw-space-3)">
      <div class="bw-toolbar" style="margin-bottom:var(--bw-space-2)">
        <div>
          <strong>${esc(t.titel)}</strong>
          <div class="bw-klein bw-leise">
            ${t.datum ? esc(new Date(t.datum).toLocaleDateString("de-DE")) : "ohne Datum"}${t.zeit_von ? " · " + esc(t.zeit_von) : ""}
            ${t.ort ? " · " + esc(t.ort) : ""}${t.raum ? ", " + esc(t.raum) : ""} · ${zahl(t.anzahl_prueflinge)} Prüflinge
          </div>
        </div>
        <button class="bw-btn bw-btn--sekundaer" type="button" data-anfrage="${t.id}"
                ${t.pruefer.length ? "" : "disabled"}>Prüfer:innen anfragen (E-Mail)</button>
      </div>
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Rolle</th><th>Name</th><th>Organisation</th><th>Zusage</th><th>Aktion</th></tr></thead>
          <tbody>
            ${t.pruefer.length ? t.pruefer.map((p) => `
              <tr>
                <td>${esc(p.rolle || "—")}</td>
                <td>${esc((p.nachname || "") + ", " + (p.vorname || ""))}</td>
                <td>${esc(p.organisation || "")}</td>
                <td>${zusageBadge(p.status)}</td>
                <td class="bw-actions">
                  <button class="bw-iconbtn" type="button" data-status="zugesagt" data-zid="${p.zuteilung_id}" title="Zusage" aria-label="Zusage">✓</button>
                  <button class="bw-iconbtn" type="button" data-status="abgesagt" data-zid="${p.zuteilung_id}" title="Absage" aria-label="Absage">✗</button>
                  <button class="bw-iconbtn" type="button" data-status="offen" data-zid="${p.zuteilung_id}" title="Zurücksetzen" aria-label="Zurücksetzen">↺</button>
                </td>
              </tr>`).join("") : `<tr><td colspan="5" class="bw-leise">Noch kein Ausschuss zugeteilt.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  appEl().innerHTML = `
    <h1>Prüfer-Plan &amp; Zusagen</h1>
    <p class="bw-unterzeile">Ausschüsse je Termin informieren und Zu-/Absagen verwalten</p>
    <p class="bw-hinweis">Zusage-Stand: ${zahl(z.zugesagt)} zugesagt · ${zahl(z.angefragt)} angefragt · ${zahl(z.offen)} offen · ${zahl(z.abgesagt)} abgesagt</p>
    <div id="planliste">
      ${liste.length ? liste.map(terminCard).join("") : '<p class="bw-hinweis">Noch keine Termine. Erst unter <a href="#/">Übersicht</a> „Automatische Prüfungsplanung" starten.</p>'}
    </div>
  `;

  document.getElementById("planliste").addEventListener("click", async (ev) => {
    const statusBtn = ev.target.closest("[data-status]");
    const anfrageBtn = ev.target.closest("[data-anfrage]");
    if (statusBtn) {
      await store.setzePrueferStatus(Number(statusBtn.getAttribute("data-zid")), statusBtn.getAttribute("data-status"));
      meldung("Zusage-Status aktualisiert.");
      renderPlanungsliste();
    } else if (anfrageBtn) {
      const t = liste.find((x) => String(x.id) === anfrageBtn.getAttribute("data-anfrage"));
      if (!t) return;
      await store.anfrageStellen(t.id);
      window.location.href = anfrageMailto(t);
      meldung("Anfrage gestellt — E-Mail-Programm geöffnet.");
      setTimeout(renderPlanungsliste, 300);
    }
  });
}

/* --------------------------------------------------------------- Noten */

function formatNote(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function ergebnisBadge(bestanden) {
  if (bestanden === true || bestanden === "t" || bestanden === "true")
    return '<span class="bw-status-do">bestanden</span>';
  if (bestanden === false || bestanden === "f" || bestanden === "false")
    return '<span class="bw-status-dont">nicht bestanden</span>';
  return '<span class="bw-leise">offen</span>';
}

async function renderNoten() {
  const rows = await store.bewertungenListe();
  const verteilung = await store.notenVerteilung();
  const bewertet = rows.filter((r) => r.gesamt != null).length;

  appEl().innerHTML = `
    <h1>Noten</h1>
    <p class="bw-unterzeile">Galabau-Sammelbewertung: 5 praktische + 4 Kenntnisbereiche → Gesamtnote</p>

    <div class="bw-tablewrap">
      <table class="bw-table">
        <thead><tr><th>Name</th><th>Fachrichtung</th><th>Praxis</th><th>Kenntnis</th><th>Gesamtnote</th><th>Ergebnis</th><th>Aktion</th></tr></thead>
        <tbody id="noten-koerper">
          ${rows.map((r) => `
            <tr>
              <td>${esc((r.nachname || "") + ", " + (r.vorname || ""))}</td>
              <td>${esc(r.beruf || "")}</td>
              <td>${formatNote(r.praxis)}</td>
              <td>${formatNote(r.kenntnis)}</td>
              <td><strong>${formatNote(r.gesamt)}</strong></td>
              <td>${ergebnisBadge(r.bestanden)}</td>
              <td class="bw-actions">
                <button class="bw-btn bw-btn--sekundaer" type="button" data-bewerten="${r.pruefling_id}">${r.gesamt != null ? "Ändern" : "Bewerten"}</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="bw-hinweis"${rows.length ? " hidden" : ""}>Noch keine Prüflinge vorhanden — zuerst unter <a href="#/prueflinge">Prüflinge</a> anlegen.</p>

    <h2 style="margin-top:var(--bw-space-4)">Verteilung der Gesamtnoten</h2>
    <div id="noten-diagramm" class="bw-card"></div>
    <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">
      Galabau: Gesamtnote = Praxis-Schnitt · 0,6 + Kenntnis-Schnitt · 0,4 (auf 1 Stelle abgeschnitten).
      Nicht bestanden, wenn Praxis, Kenntnis oder Gesamt ≥ 4,5, ein Bereich ≥ 5,5 (Sperrfach) oder ≥ 2 Bereiche ≥ 4,5.
    </p>
  `;

  if (window.bwChart && bewertet) {
    const maxWert = Math.max.apply(null, verteilung.map((v) => v.wert));
    window.bwChart.bars(
      document.getElementById("noten-diagramm"),
      verteilung.map((v) => ({ label: v.label, value: v.wert, highlight: v.wert === maxWert && maxWert > 0 })),
      { titel: "Verteilung der Gesamtnoten", max: Math.max(1, maxWert) }
    );
  } else {
    document.getElementById("noten-diagramm").innerHTML = '<p class="bw-leise">Noch keine Bewertungen erfasst.</p>';
  }

  document.getElementById("noten-koerper").addEventListener("click", async (ev) => {
    const pid = ev.target.closest("[data-bewerten]")?.getAttribute("data-bewerten");
    if (!pid) return;
    const row = rows.find((r) => String(r.pruefling_id) === String(pid));
    notenDialog(row, renderNoten);
  });
}

function noteFeld(id, label, value) {
  // type="number" erwartet Punkt-Dezimaltrenner; ein Komma würde der Browser
  // verwerfen (Feld bliebe leer). Anzeige lokalisiert der Browser selbst.
  const v = value == null ? "" : String(value).replace(",", ".");
  return `<div class="bw-field">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" name="${id}" type="number" min="1" max="6" step="0.1" inputmode="decimal"
           value="${esc(v)}" placeholder="1,0–6,0" data-note>
  </div>`;
}

function notenDialog(row, nachher) {
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog bw-dialog--breit";
  dlg.id = "dialog";
  const P = [row.p1, row.p2, row.p3, row.p4, row.p5];
  const K = [row.k1, row.k2, row.k3, row.k4];
  dlg.innerHTML = `
    <form method="dialog" id="noten-form" novalidate>
      <h2 style="margin-top:0">Bewertung — ${esc((row.vorname || "") + " " + (row.nachname || ""))}</h2>
      <p class="bw-klein bw-leise">Notenwerte 1,0–6,0 je Bereich. Gesamtnote und Ergebnis werden automatisch berechnet.</p>

      <h3>Praktische Prüfung</h3>
      <div class="bw-dialog__felder">
        ${GALABAU_BEREICHE.praxis.map((b, i) => noteFeld("p" + (i + 1), `${roem(i + 1)}. ${b}`, P[i])).join("")}
      </div>
      <h3>Kenntnisprüfung</h3>
      <div class="bw-dialog__felder">
        ${GALABAU_BEREICHE.kenntnis.map((b, i) => noteFeld("k" + (i + 1), b, K[i])).join("")}
      </div>
      <div class="bw-hinweis" style="margin-top:var(--bw-space-2)">
        <p class="bw-klein bw-leise" style="margin:0 0 var(--bw-space-2)">Pflanzenkenntnisse aus Teilnoten berechnen: (2 × schriftliche PK + 1 × Pflanzenbestimmung) ÷ 3. Leer lassen, um die Note oben direkt einzutragen.</p>
        <div class="bw-dialog__felder">
          ${noteFeld("pk_s", "schriftliche Pflanzenkenntnisse", row.pk_schriftlich)}
          ${noteFeld("pk_b", "Pflanzenbestimmung", row.pk_bestimmung)}
        </div>
      </div>

      <p id="noten-preview" class="bw-hinweis" aria-live="polite"></p>
      <div class="bw-field">
        <label for="f_bem">Bemerkung</label>
        <textarea id="f_bem" name="bemerkung" rows="2">${esc(row.bemerkung || "")}</textarea>
      </div>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="abbrechen">Abbrechen</button>
        <button type="submit" class="bw-btn">Speichern</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const form = dlg.querySelector("#noten-form");
  const preview = dlg.querySelector("#noten-preview");
  const lese = (pre, n) => Array.from({ length: n }, (_, i) => form.elements[pre + (i + 1)].value);

  const vorschau = () => {
    const g = store.gesamtGalabau(lese("p", 5), lese("k", 4));
    if (g.gesamt == null) {
      preview.className = "bw-hinweis";
      preview.textContent = "Alle 9 Bereiche ausfüllen, dann werden Gesamtnote und Ergebnis berechnet.";
      return;
    }
    preview.className = "bw-hinweis " + (g.bestanden ? "bw-hinweis--erfolg" : "bw-hinweis--fehler");
    preview.textContent =
      `Praxis ${formatNote(g.praxis)} · Kenntnis ${formatNote(g.kenntnis)} → Gesamtnote ${formatNote(g.gesamt)} — ` +
      (g.bestanden ? "bestanden" : "nicht bestanden" + (g.gruende.length ? " (" + g.gruende.join("; ") + ")" : ""));
  };
  form.querySelectorAll("[data-note]").forEach((el) => el.addEventListener("input", vorschau));

  // Pflanzenkenntnisse-Teilnoten -> berechnet automatisch die Note in k2.
  const pkBerechnen = () => {
    // type="number" akzeptiert nur Punkt-Dezimaltrenner (kein Komma).
    const note = store.pflanzenkenntnisNote(form.elements["pk_s"].value, form.elements["pk_b"].value);
    if (note != null) form.elements["k2"].value = note.toFixed(1);
    vorschau();
  };
  form.elements["pk_s"].addEventListener("input", pkBerechnen);
  form.elements["pk_b"].addEventListener("input", pkBerechnen);
  vorschau();

  dlg.querySelector("#abbrechen").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    // Wertebereich prüfen
    for (const el of form.querySelectorAll("[data-note]")) {
      const v = el.value.trim();
      if (v === "") continue;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 1 || n > 6) {
        el.focus();
        meldung("Notenwerte müssen zwischen 1,0 und 6,0 liegen.", "fehler");
        return;
      }
    }
    try {
      const g = await store.setzeBewertung(row.pruefling_id, lese("p", 5), lese("k", 4), form.elements["bemerkung"].value,
        { pk_schriftlich: form.elements["pk_s"].value, pk_bestimmung: form.elements["pk_b"].value });
      meldung(g.gesamt != null
        ? `Gespeichert: Gesamtnote ${formatNote(g.gesamt)} — ${g.bestanden ? "bestanden" : "nicht bestanden"}.`
        : "Bewertung gespeichert (unvollständig).");
      dlg.close();
      if (nachher) nachher();
    } catch (e) { console.error(e); meldung("Speichern fehlgeschlagen: " + e.message, "fehler"); }
  });

  dlg.showModal();
  form.elements["p1"].focus();
}

function roem(n) { return ["", "I", "II", "III", "IV", "V"][n] || String(n); }

/* --------------------------------------------------------------- Zeugnisse */

async function renderZeugnisse() {
  const rows = await store.bewertungenListe();

  appEl().innerHTML = `
    <h1>Zeugnisse</h1>
    <p class="bw-unterzeile">Prüfungszeugnis je Prüfling drucken (oder als PDF speichern)</p>
    <div class="bw-toolbar">
      <span class="bw-klein bw-leise">${zahl(rows.filter((r) => r.gesamt != null).length)} bewertete Prüflinge</span>
      <button class="bw-btn bw-btn--gelb" type="button" id="serien-druck"
              ${rows.some((r) => r.gesamt != null) ? "" : "disabled"}>Alle Zeugnisse drucken (Serie)</button>
    </div>
    <div class="bw-tablewrap">
    <table class="bw-table">
      <thead><tr><th>Name</th><th>Fachrichtung</th><th>Gesamtnote</th><th>Ergebnis</th><th>Aktion</th></tr></thead>
      <tbody id="zeugnis-koerper">
        ${rows.map((r) => `
          <tr>
            <td>${esc((r.nachname || "") + ", " + (r.vorname || ""))}</td>
            <td>${esc(r.beruf || "")}</td>
            <td>${formatNote(r.gesamt)}</td>
            <td>${ergebnisBadge(r.bestanden)}</td>
            <td class="bw-actions">
              <button class="bw-btn bw-btn--sekundaer" type="button" data-zeugnis="${r.pruefling_id}"
                      ${r.gesamt != null ? "" : "disabled title=\"Erst unter Noten bewerten\""}>Zeugnis drucken</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>
    <p class="bw-hinweis"${rows.length ? " hidden" : ""}>Noch keine Prüflinge vorhanden — zuerst unter <a href="#/prueflinge">Prüflinge</a> anlegen.</p>
    <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">Ein Zeugnis kann erst gedruckt werden, wenn unter <a href="#/noten">Noten</a> eine Bewertung erfasst ist.</p>
  `;

  document.getElementById("zeugnis-koerper").addEventListener("click", async (ev) => {
    const pid = ev.target.closest("[data-zeugnis]")?.getAttribute("data-zeugnis");
    if (!pid) return;
    try { await zeugnisDrucken(Number(pid)); }
    catch (e) { console.error(e); meldung("Zeugnis konnte nicht erstellt werden: " + e.message, "fehler"); }
  });
  document.getElementById("serien-druck")?.addEventListener("click", async () => {
    try { await serienZeugnisDruck(); }
    catch (e) { console.error(e); meldung("Serien-Druck fehlgeschlagen: " + e.message, "fehler"); }
  });
}

/** Baut ein druckbares Prüfungszeugnis und ruft den Druckdialog auf. */
/** Inneres HTML eines Prüfungszeugnisses (für Einzel- und Serien-Druck). */
function zeugnisHtml(d) {
  const heute = new Date().toLocaleDateString("de-DE");
  const geb = d.geburtsdatum ? new Date(d.geburtsdatum).toLocaleDateString("de-DE") : "";
  const terminZeile = d.termin
    ? `${d.termin.datum ? new Date(d.termin.datum).toLocaleDateString("de-DE") : ""}${d.termin.ort ? " in " + esc(d.termin.ort) : ""}`
    : "—";
  const P = [d.p1, d.p2, d.p3, d.p4, d.p5];
  const K = [d.k1, d.k2, d.k3, d.k4];
  const bereichZeile = (label, note) =>
    `<tr><td>${esc(label)}</td><td style="text-align:right">${formatNote(note)}</td></tr>`;
  return `
    <h1>Prüfungszeugnis</h1>
    <p>über die Abschlussprüfung im Ausbildungsberuf Gärtner/in${d.beruf ? " — Fachrichtung " + esc(d.beruf) : ""}</p>
    <table class="bw-table bw-zeugnis">
      <tbody>
        <tr><th scope="row">Name</th><td>${esc((d.vorname || "") + " " + (d.nachname || ""))}</td></tr>
        ${geb ? `<tr><th scope="row">geboren am</th><td>${esc(geb)}</td></tr>` : ""}
        <tr><th scope="row">Ausbildungsbetrieb</th><td>${esc(d.betrieb || "—")}</td></tr>
        <tr><th scope="row">Prüfungstermin</th><td>${terminZeile}</td></tr>
      </tbody>
    </table>

    <h2>Praktische Prüfung</h2>
    <table class="bw-table"><tbody>
      ${GALABAU_BEREICHE.praxis.map((b, i) => bereichZeile(roem(i + 1) + ". " + b, P[i])).join("")}
      <tr><th scope="row">Praxis-Schnitt</th><td style="text-align:right"><strong>${formatNote(d.praxis)}</strong></td></tr>
    </tbody></table>

    <h2>Kenntnisprüfung</h2>
    <table class="bw-table"><tbody>
      ${GALABAU_BEREICHE.kenntnis.map((b, i) => bereichZeile(b, K[i])).join("")}
      <tr><th scope="row">Kenntnis-Schnitt</th><td style="text-align:right"><strong>${formatNote(d.kenntnis)}</strong></td></tr>
    </tbody></table>

    <table class="bw-table bw-zeugnis"><tbody>
      <tr><th scope="row">Gesamtnote</th><td><strong>${formatNote(d.gesamt)}</strong></td></tr>
      <tr><th scope="row">Ergebnis</th><td><strong>${d.bestanden === true ? "bestanden" : d.bestanden === false ? "nicht bestanden" : "—"}</strong></td></tr>
    </tbody></table>
    <p>Freiburg, den ${esc(heute)}</p>
    <div class="bw-druck__unterschriften">
      <span>Vorsitz des Prüfungsausschusses</span>
      <span>Beisitz</span>
    </div>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

async function zeugnisDrucken(prueflingId) {
  const d = await store.zeugnisDaten(prueflingId);
  if (!d) { meldung("Prüfling nicht gefunden.", "fehler"); return; }
  druckbereich().innerHTML = zeugnisHtml(d);
  window.print();
}

/** Serien-Druck aller bewerteten Zeugnisse (je Zeugnis eine Seite). */
async function serienZeugnisDruck() {
  const liste = await store.alleZeugnisDaten();
  if (!liste.length) { meldung("Keine bewerteten Prüflinge für den Serien-Druck.", "fehler"); return; }
  druckbereich().innerHTML = liste
    .map((d) => `<section class="bw-zeugnisblatt">${zeugnisHtml(d)}</section>`).join("");
  window.print();
}

/* --------------------------------------------------------- Schnellsuche */

async function renderSuche() {
  appEl().innerHTML = `
    <h1>Schnellsuche</h1>
    <p class="bw-unterzeile">Prüflinge, Betriebe, Prüfer:innen und Termine auf einmal — tippfehlertolerant</p>
    <div class="bw-search" style="max-width:42rem">
      <label for="modulsuche" class="bw-skip-link">Suchbegriff</label>
      <input id="modulsuche" type="search" placeholder="Name, Betrieb, Ort, Termin …"
             aria-label="Schnellsuche" autocomplete="off">
      <button type="button" id="suche-btn">Suchen</button>
    </div>
    <div id="such-ergebnis" aria-live="polite" style="margin-top:var(--bw-space-3)"></div>
  `;

  const eingabe = document.getElementById("modulsuche");
  const ziel = document.getElementById("such-ergebnis");

  const prueflingZeile = (r, q) => `
    <li><a href="#/pruefling/${r.id}">${hl((r.nachname || "") + ", " + (r.vorname || ""), q)}</a>
      <span class="bw-klein bw-leise">${esc(r.beruf || "")}${r.betrieb ? " · " + esc(r.betrieb) : ""}</span></li>`;
  const kontaktZeile = (r, q, name, zusatz) => `
    <li>${hl(name, q)}${zusatz ? ` <span class="bw-klein bw-leise">${esc(zusatz)}</span>` : ""}
      <span class="bw-klein">${[r.telefon ? telLink(r.telefon, q) : "", r.email ? mailLink(r.email, q) : ""].filter(Boolean).join(" · ")}</span></li>`;
  const terminZeile = (r, q) => `
    <li><a href="#/planung">${hl(r.titel || "Termin", q)}</a>
      <span class="bw-klein bw-leise">${r.datum ? esc(new Date(r.datum).toLocaleDateString("de-DE")) : ""}${r.beruf ? " · " + esc(r.beruf) : ""}${r.ort ? " · " + esc(r.ort) : ""}</span></li>`;

  const gruppe = (titel, items, html) => items.length
    ? `<section style="margin-bottom:var(--bw-space-3)"><h2>${esc(titel)} (${zahl(items.length)})</h2><ul class="bw-trefferliste">${items.map(html).join("")}</ul></section>`
    : "";

  const zeichne = async () => {
    const q = eingabe.value.trim();
    if (!q) { ziel.innerHTML = '<p class="bw-leise">Suchbegriff eingeben — es werden alle Stammdaten gleichzeitig durchsucht.</p>'; return; }
    let r;
    try { r = await store.schnellsuche(q); }
    catch (e) { console.error(e); meldung("Suche fehlgeschlagen: " + e.message, "fehler"); return; }
    const gesamt = r.prueflinge.length + r.betriebe.length + r.pruefer.length + r.pruefungen.length;
    const html =
      gruppe("Prüflinge", r.prueflinge, (x) => prueflingZeile(x, q)) +
      gruppe("Betriebe", r.betriebe, (x) => kontaktZeile(x, q, x.name, x.ort)) +
      gruppe("Prüfer:innen", r.pruefer, (x) => kontaktZeile(x, q, (x.nachname || "") + ", " + (x.vorname || ""), x.organisation)) +
      gruppe("Prüfungstermine", r.pruefungen, (x) => terminZeile(x, q));
    ziel.innerHTML = gesamt ? html : `<p class="bw-hinweis">Keine Treffer für „${esc(q)}".</p>`;
  };

  eingabe.addEventListener("input", debounce(zeichne, 180));
  document.getElementById("suche-btn").addEventListener("click", zeichne);
  zeichne();
  eingabe.focus();
}

/* --------------------------------------------------------- Prüflings-Akte */

async function renderPrueflingAkte(id) {
  let a;
  try { a = await store.prueflingAkte(Number(id)); }
  catch (e) { console.error(e); appEl().innerHTML = `<div class="bw-hinweis bw-hinweis--fehler">Akte konnte nicht geladen werden: ${esc(e.message)}</div>`; return; }
  if (!a) { appEl().innerHTML = `<div class="bw-hinweis">Prüfling nicht gefunden. <a href="#/prueflinge">Zur Liste</a></div>`; return; }

  const p = a.pruefling;
  const name = `${p.vorname || ""} ${p.nachname || ""}`.trim() || "Prüfling";
  const b = a.bewertung;
  const bewertet = b && b.gesamt != null;
  const geb = p.geburtsdatum ? new Date(p.geburtsdatum).toLocaleDateString("de-DE") : "—";

  const terminCard = (t) => `
    <div class="bw-card" style="margin-bottom:var(--bw-space-2)">
      <div class="bw-toolbar" style="margin:0">
        <strong style="margin-right:auto">${esc(t.titel || "Termin")}</strong>
        <button class="bw-iconbtn" type="button" data-entfernen="${t.zuteilung_id}"
                aria-label="Zuteilung entfernen" title="Zuteilung entfernen">🗑</button>
      </div>
      <div class="bw-klein bw-leise" style="margin:var(--bw-space-1) 0">
        ${t.datum ? esc(new Date(t.datum).toLocaleDateString("de-DE")) : "ohne Datum"}${t.slot ? " · " + esc(t.slot) + " Uhr" : (t.zeit_von ? " · ab " + esc(t.zeit_von) : "")}
        ${t.ort ? " · " + esc(t.ort) : ""}${t.raum ? ", " + esc(t.raum) : ""}${t.beruf ? " · " + esc(t.beruf) : ""}
      </div>
      ${t.ausschuss.length
        ? `<div class="bw-klein">Ausschuss: ${t.ausschuss.map((x) => esc((x.nachname || "") + (x.rolle ? " (" + x.rolle + ")" : ""))).join(", ")}</div>`
        : '<div class="bw-klein bw-leise">Noch kein Ausschuss zugeteilt.</div>'}
    </div>`;

  const passend = a.passend || [];
  const zuteilenHtml = passend.length ? `
    <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
      <div class="bw-field" style="flex:1 1 16rem;margin:0">
        <label for="akte-terminwahl" class="bw-skip-link">Termin</label>
        <select id="akte-terminwahl">
          ${passend.map((t) => `<option value="${t.id}">${esc((t.titel || "Termin") + (t.datum ? " — " + new Date(t.datum).toLocaleDateString("de-DE") : ""))}</option>`).join("")}
        </select>
      </div>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-zuteilen">Diesem Termin zuteilen</button>
    </div>` : (a.pruefling.beruf ? "" : '<p class="bw-klein bw-leise">Fachrichtung beim Prüfling fehlt — keine passenden Termine.</p>');

  appEl().innerHTML = `
    <p class="bw-klein"><a href="#/prueflinge">← Prüflinge</a></p>
    <h1 style="margin-bottom:var(--bw-space-1)">${esc(name)} ${fortschrittTag(a.phase)}</h1>
    <p class="bw-unterzeile">Gesamtakte — Stammdaten, Prüfungstag, Note und Zeugnis an einem Ort</p>

    <div class="bw-toolbar" style="margin-bottom:var(--bw-space-3)">
      <button class="bw-btn bw-btn--gelb" type="button" id="akte-bewerten">${bewertet ? "Note ändern" : "Bewerten"}</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-zeugnis" ${bewertet ? "" : "disabled title=\"Erst bewerten\""}>Zeugnis drucken</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-bearbeiten">Stammdaten bearbeiten</button>
    </div>

    <div class="bw-flaechen">
      <section class="bw-card" aria-labelledby="akte-stamm">
        <h2 id="akte-stamm" style="margin-top:0">Stammdaten</h2>
        <table class="bw-table"><tbody>
          <tr><th scope="row">Beruf</th><td>${esc(p.beruf || "—")}</td></tr>
          <tr><th scope="row">Geburtsdatum</th><td>${esc(geb)}</td></tr>
          <tr><th scope="row">Ausbildungsbetrieb</th><td>${esc(p.betrieb || "—")}</td></tr>
          <tr><th scope="row">Prüfungsjahr</th><td>${esc(p.pruefungsjahr || "—")}</td></tr>
          <tr><th scope="row">E-Mail</th><td>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "—"}</td></tr>
          <tr><th scope="row">Telefon</th><td>${p.telefon ? `<a href="tel:${esc(String(p.telefon).replace(/[^\d+]/g, ""))}">${esc(p.telefon)}</a>` : "—"}</td></tr>
          <tr><th scope="row">Status</th><td>${esc(p.status || "—")}</td></tr>
        </tbody></table>
      </section>

      <section aria-labelledby="akte-pruefung">
        <h2 id="akte-pruefung">Prüfungstag</h2>
        ${a.termine.length ? a.termine.map(terminCard).join("")
          : `<p class="bw-hinweis">Noch keinem Prüfungstermin zugeteilt.</p>`}
        ${zuteilenHtml}

        <h2 style="margin-top:var(--bw-space-3)">Bewertung</h2>
        <div class="bw-card">
          ${bewertet ? `
            <table class="bw-table"><tbody>
              <tr><th scope="row">Praxis-Schnitt</th><td>${formatNote(b.praxis)}</td></tr>
              <tr><th scope="row">Kenntnis-Schnitt</th><td>${formatNote(b.kenntnis)}</td></tr>
              <tr><th scope="row">Gesamtnote</th><td><strong>${formatNote(b.gesamt)}</strong></td></tr>
              <tr><th scope="row">Ergebnis</th><td>${ergebnisBadge(b.bestanden)}</td></tr>
            </tbody></table>`
          : '<p class="bw-leise">Noch nicht bewertet.</p>'}
        </div>
      </section>
    </div>
  `;

  document.getElementById("akte-bewerten").addEventListener("click", () => {
    const row = Object.assign({ pruefling_id: p.id, nachname: p.nachname, vorname: p.vorname }, b || {});
    notenDialog(row, () => renderPrueflingAkte(id));
  });
  document.getElementById("akte-zeugnis").addEventListener("click", async () => {
    try { await zeugnisDrucken(p.id); }
    catch (e) { console.error(e); meldung("Zeugnis konnte nicht erstellt werden: " + e.message, "fehler"); }
  });
  document.getElementById("akte-bearbeiten").addEventListener("click", () => {
    formularOeffnen("prueflinge", p, () => renderPrueflingAkte(id));
  });
  document.getElementById("akte-zuteilen")?.addEventListener("click", async () => {
    const pid = Number(document.getElementById("akte-terminwahl").value);
    if (!pid) return;
    try {
      const konflikte = await store.terminkonflikte(p.id, pid);
      if (konflikte.length && !confirm(`Am selben Tag bereits zugeteilt (${konflikte.map((k) => "„" + k.titel + "“").join(", ")}). Trotzdem zuteilen?`)) return;
      await store.zuteilen(pid, p.id);
      meldung("Prüfling dem Termin zugeteilt.");
      renderPrueflingAkte(id);
    } catch (e) { console.error(e); meldung("Zuteilen fehlgeschlagen: " + e.message, "fehler"); }
  });
  appEl().querySelectorAll("[data-entfernen]").forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await store.entferneZuteilung(Number(btn.getAttribute("data-entfernen")));
      meldung("Zuteilung entfernt.");
      renderPrueflingAkte(id);
    } catch (e) { console.error(e); meldung("Entfernen fehlgeschlagen: " + e.message, "fehler"); }
  }));
}

/* --------------------------------------------------------- Auswertungen */

async function renderAuswertungen(jahr = null) {
  const jahre = await store.pruefungsjahre();
  if (jahr != null) jahr = Number(jahr);
  const auslast = await store.auslastung(jahr);
  const quoten = await store.quoteJeFachrichtung(jahr);
  const konflikte = await store.prueferKonflikte();

  const belegt = auslast.filter((t) => t.prueflinge > 0);
  const summePl = belegt.reduce((s, t) => s + t.prueflinge, 0);
  const schnittPl = belegt.length ? Math.round((summePl / belegt.length) * 10) / 10 : 0;
  const ohneAusschuss = belegt.filter((t) => t.ausschuss === 0).length;
  const gesamtBewertet = quoten.reduce((s, r) => s + r.bewertet, 0);
  const gesamtBestanden = quoten.reduce((s, r) => s + r.bestanden, 0);
  const gesamtQuote = gesamtBewertet ? Math.round((gesamtBestanden / gesamtBewertet) * 100) : null;

  const terminZeile = (t) => `
    <tr>
      <td>${esc(t.titel || "—")}</td>
      <td>${t.datum ? esc(new Date(t.datum).toLocaleDateString("de-DE")) : "—"}${t.zeit_von ? " · " + esc(t.zeit_von) : ""}</td>
      <td>${esc(t.beruf || "—")}</td>
      <td style="text-align:right">${zahl(t.prueflinge)}</td>
      <td style="text-align:right">${t.ausschuss ? zahl(t.ausschuss) : '<span class="bw-status-dont">0</span>'}</td>
    </tr>`;

  const quoteZeile = (r) => `
    <tr>
      <td>${esc(r.beruf)}</td>
      <td style="text-align:right">${zahl(r.gesamt)}</td>
      <td style="text-align:right">${zahl(r.bewertet)}</td>
      <td style="text-align:right">${zahl(r.bestanden)}</td>
      <td style="text-align:right">${r.quote == null ? "—" : zahl(r.quote) + " %"}</td>
      <td style="text-align:right">${r.schnitt == null ? "—" : formatNote(r.schnitt)}</td>
    </tr>`;

  appEl().innerHTML = `
    <h1>Auswertungen</h1>
    <p class="bw-unterzeile">Auslastung der Prüfungstage und Bestehensquoten je Fachrichtung — automatisch aus den vorhandenen Daten</p>
    <div class="bw-toolbar">
      ${jahre.length ? `
      <div class="bw-field" style="margin:0">
        <label for="jahr-filter" class="bw-skip-link">Prüfungsjahr</label>
        <select id="jahr-filter" aria-label="Prüfungsjahr filtern">
          <option value="">Alle Prüfungsjahre</option>
          ${jahre.map((j) => `<option value="${j}"${String(jahr) === String(j) ? " selected" : ""}>${esc(j)}</option>`).join("")}
        </select>
      </div>` : ""}
      <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-quoten" ${quoten.length ? "" : "disabled"}>Quoten als CSV</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-auslastung" ${auslast.length ? "" : "disabled"}>Auslastung als CSV</button>
    </div>

    <div class="bw-flaechen bw-stat-grid">
      <div class="bw-card bw-stat"><span class="bw-stat__zahl">${zahl(belegt.length)}</span><span class="bw-stat__label">belegte Termine</span></div>
      <div class="bw-card bw-stat"><span class="bw-stat__zahl">${zahl(schnittPl)}</span><span class="bw-stat__label">Ø Prüflinge / Termin</span></div>
      <div class="bw-card bw-stat"><span class="bw-stat__zahl">${gesamtQuote == null ? "—" : zahl(gesamtQuote) + " %"}</span><span class="bw-stat__label">Bestehensquote gesamt</span></div>
      <div class="bw-card bw-stat"><span class="bw-stat__zahl">${zahl(konflikte.length)}</span><span class="bw-stat__label">Prüfer-Konflikte</span></div>
    </div>

    <section aria-labelledby="konflikt-h" style="margin-top:var(--bw-space-4)">
      <h2 id="konflikt-h">Prüfer-Doppelbelegungen</h2>
      ${konflikte.length ? `
        <p class="bw-hinweis bw-hinweis--fehler">${zahl(konflikte.length)} Prüfer:in(nen) sind am selben Tag mehreren Terminen zugeteilt. Im <a href="#/planung">Planung</a> entzerren.</p>
        <div class="bw-tablewrap">
          <table class="bw-table">
            <thead><tr><th>Prüfer:in</th><th>Datum</th><th style="text-align:right">Termine</th><th>betroffene Termine</th></tr></thead>
            <tbody>${konflikte.map((k) => `
              <tr>
                <td>${esc(k.name || "—")}</td>
                <td>${k.datum ? esc(new Date(k.datum).toLocaleDateString("de-DE")) : "—"}</td>
                <td style="text-align:right">${zahl(k.anzahl)}</td>
                <td>${esc(k.termine || "")}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>` : '<p class="bw-hinweis bw-hinweis--erfolg">Keine Doppelbelegungen — keine Prüfer:in ist am selben Tag mehreren Terminen zugeteilt.</p>'}
    </section>

    <section aria-labelledby="quote-h" style="margin-top:var(--bw-space-4)">
      <h2 id="quote-h">Bestehensquote je Fachrichtung</h2>
      <div id="quote-diagramm" class="bw-card"></div>
      <ul class="bw-legend">
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Quote in %</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> höchste Quote</li>
      </ul>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table">
          <thead><tr><th>Fachrichtung</th><th style="text-align:right">Prüflinge</th><th style="text-align:right">bewertet</th><th style="text-align:right">bestanden</th><th style="text-align:right">Quote</th><th style="text-align:right">Ø Note</th></tr></thead>
          <tbody>${quoten.length ? quoten.map(quoteZeile).join("") : '<tr><td colspan="6" class="bw-leise">Noch keine Prüflinge erfasst.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="auslast-h" style="margin-top:var(--bw-space-4)">
      <h2 id="auslast-h">Auslastung je Prüfungstermin</h2>
      ${ohneAusschuss ? `<p class="bw-hinweis bw-hinweis--fehler">${zahl(ohneAusschuss)} belegte(r) Termin(e) ohne Ausschuss — bitte im <a href="#/planung">Planung</a> besetzen.</p>` : ""}
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Termin</th><th>Datum</th><th>Fachrichtung</th><th style="text-align:right">Prüflinge</th><th style="text-align:right">Ausschuss</th></tr></thead>
          <tbody>${auslast.length ? auslast.map(terminZeile).join("") : '<tr><td colspan="5" class="bw-leise">Noch keine Prüfungstermine. Erst unter <a href="#/">Übersicht</a> „Automatische Prüfungsplanung" starten.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;

  const mitQuote = quoten.filter((r) => r.quote != null);
  if (window.bwChart && mitQuote.length) {
    const maxQ = Math.max.apply(null, mitQuote.map((r) => r.quote));
    window.bwChart.bars(
      document.getElementById("quote-diagramm"),
      mitQuote.map((r) => ({ label: kurzBeruf(r.beruf), value: r.quote, highlight: r.quote === maxQ })),
      { titel: "Bestehensquote je Fachrichtung", max: 100, einheit: "%" }
    );
  } else {
    document.getElementById("quote-diagramm").innerHTML = '<p class="bw-leise">Noch keine Bewertungen — Quote erscheint, sobald unter <a href="#/noten">Noten</a> bewertet wurde.</p>';
  }

  document.getElementById("jahr-filter")?.addEventListener("change", (ev) => {
    renderAuswertungen(ev.target.value || null);
  });

  const deDez = (n) => n == null ? "" : String(n).replace(".", ",");
  document.getElementById("csv-quoten")?.addEventListener("click", () => {
    const kopf = ["Fachrichtung", "Prüflinge", "bewertet", "bestanden", "Quote %", "Ø Note"];
    const zeilen = quoten.map((r) => [r.beruf, r.gesamt, r.bewertet, r.bestanden, r.quote == null ? "" : r.quote, r.schnitt == null ? "" : deDez(Math.round(r.schnitt * 10) / 10)]);
    dateiDownload(`Bestehensquoten${jahr ? "-" + jahr : ""}.csv`, csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`Quoten exportiert: ${zahl(quoten.length)} Fachrichtungen.`);
  });
  document.getElementById("csv-auslastung")?.addEventListener("click", () => {
    const kopf = ["Termin", "Datum", "Beginn", "Fachrichtung", "Ort", "Prüflinge", "Ausschuss"];
    const zeilen = auslast.map((t) => [t.titel || "", t.datum ? new Date(t.datum).toLocaleDateString("de-DE") : "", t.zeit_von || "", t.beruf || "", t.ort || "", t.prueflinge, t.ausschuss]);
    dateiDownload(`Auslastung${jahr ? "-" + jahr : ""}.csv`, csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`Auslastung exportiert: ${zahl(auslast.length)} Termine.`);
  });
}

/** Kürzt lange Fachrichtungsnamen für Diagramm-Achsen. */
function kurzBeruf(b) {
  return String(b || "")
    .replace("Garten- und Landschaftsbau", "GaLaBau")
    .replace("Friedhofsgärtnerei", "Friedhof")
    .replace("Staudengärtnerei", "Stauden")
    .replace("Zierpflanzenbau", "Zierpfl.")
    .replace("Gemüsebau", "Gemüse")
    .replace("Baumschule", "Baumsch.")
    .replace("Obstbau", "Obst");
}

/* --------------------------------------------------------- Adressliste */

function telLink(tel, q) {
  if (!tel) return "";
  const rein = String(tel).replace(/[^\d+]/g, "");
  return `<a href="tel:${esc(rein)}">${hl(tel, q)}</a>`;
}
function mailLink(mail, q) {
  if (!mail) return "";
  return `<a href="mailto:${esc(mail)}">${hl(mail, q)}</a>`;
}

async function renderKontakte() {
  let letzte = [];

  appEl().innerHTML = `
    <h1>Adress- &amp; Telefonliste</h1>
    <p class="bw-unterzeile">Betriebe und Prüfer:innen — durchsuchbar und druckbar</p>
    <div class="bw-toolbar">
      <div class="bw-search">
        <label for="modulsuche" class="bw-skip-link">Kontakte durchsuchen</label>
        <input id="modulsuche" type="search" placeholder="Suchen… (Name, Ort, Telefon, E-Mail)"
               aria-label="Kontakte durchsuchen" autocomplete="off">
        <button type="button" id="suche-btn">Suchen</button>
      </div>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-export">CSV (.csv)</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="vcard-export">vCard (.vcf)</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="drucken-btn">Liste drucken</button>
    </div>

    <div aria-live="polite">
      <table class="bw-table">
        <thead><tr><th>Typ</th><th>Name</th><th>Organisation / Ort</th><th>Funktion / Ansprechpartner</th><th>Telefon</th><th>E-Mail</th></tr></thead>
        <tbody id="zeilen"></tbody>
      </table>
      <p id="leer" class="bw-hinweis" hidden></p>
    </div>
  `;

  const eingabe = document.getElementById("modulsuche");
  const zeichne = async () => {
    const q = eingabe.value;
    let rows;
    try { rows = await store.kontakteSuche(q); }
    catch (e) { console.error(e); meldung("Suche fehlgeschlagen: " + e.message, "fehler"); return; }
    letzte = rows;
    document.getElementById("zeilen").innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.typ)}</td>
        <td>${hl(r.bezeichnung, q)}</td>
        <td>${hl(r.zusatz || "", q)}</td>
        <td>${hl(r.person || "", q)}</td>
        <td>${telLink(r.telefon, q)}</td>
        <td>${mailLink(r.email, q)}</td>
      </tr>`).join("");
    const leer = document.getElementById("leer");
    if (!rows.length) {
      leer.hidden = false;
      leer.textContent = q
        ? `Keine Treffer für „${q}".`
        : "Noch keine Betriebe oder Prüfer:innen erfasst.";
    } else { leer.hidden = true; }
  };

  eingabe.addEventListener("input", debounce(zeichne, 180));
  document.getElementById("suche-btn").addEventListener("click", zeichne);
  document.getElementById("drucken-btn").addEventListener("click", () => kontakteDrucken(letzte));
  document.getElementById("csv-export").addEventListener("click", () => {
    if (!letzte.length) { meldung("Keine Kontakte zum Exportieren.", "fehler"); return; }
    dateiDownload("Adressliste.csv", kontakteCsv(letzte), "text/csv;charset=utf-8");
    meldung(`CSV exportiert: ${zahl(letzte.length)} Kontakte.`);
  });
  document.getElementById("vcard-export").addEventListener("click", () => {
    if (!letzte.length) { meldung("Keine Kontakte zum Exportieren.", "fehler"); return; }
    dateiDownload("Adressliste.vcf", kontakteVcard(letzte), "text/vcard;charset=utf-8");
    meldung(`vCard exportiert: ${zahl(letzte.length)} Kontakte — in Outlook/Telefon importierbar.`);
  });

  zeichne();
}

/** CSV-Feld maskieren (Semikolon-Trennung, deutsches Excel). */
function csvFeld(v) {
  const s = String(v == null ? "" : v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** Tabelle (Kopf + Zeilen) als CSV-Text (Semikolon, BOM für Excel, CRLF). */
function csvText(kopf, zeilen) {
  const z = [kopf.map(csvFeld).join(";")].concat(zeilen.map((r) => r.map(csvFeld).join(";")));
  return "﻿" + z.join("\r\n") + "\r\n";
}
/** Adressliste als CSV (Semikolon, BOM für Excel-Umlaute). */
function kontakteCsv(rows) {
  const kopf = ["Typ", "Name", "Organisation/Ort", "Funktion/Ansprechpartner", "Telefon", "E-Mail"];
  const zeilen = rows.map((r) =>
    [r.typ, r.bezeichnung, r.zusatz || "", r.person || "", r.telefon || "", r.email || ""].map(csvFeld).join(";"));
  return "﻿" + [kopf.join(";")].concat(zeilen).join("\r\n") + "\r\n";
}
/** vCard-Wert maskieren (RFC 6350: ; , \ und Zeilenumbruch). */
function vcardEscape(s) {
  return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** Adressliste als vCard 3.0 (ein VCARD je Kontakt). */
function kontakteVcard(rows) {
  return rows.map((r) => {
    const istPruefer = r.typ === "Prüfer:in";
    let nachname = r.bezeichnung || "", vorname = "";
    if (istPruefer && /,/.test(r.bezeichnung || "")) {
      const teile = r.bezeichnung.split(",");
      nachname = teile[0].trim(); vorname = (teile[1] || "").trim();
    }
    const fn = istPruefer ? (vorname ? vorname + " " + nachname : nachname) : (r.bezeichnung || "");
    const z = ["BEGIN:VCARD", "VERSION:3.0"];
    z.push("N:" + vcardEscape(nachname) + ";" + vcardEscape(vorname) + ";;;");
    z.push("FN:" + vcardEscape(fn));
    if (r.zusatz) z.push("ORG:" + vcardEscape(r.zusatz));
    if (r.person) z.push((istPruefer ? "TITLE:" : "NOTE:") + vcardEscape(r.person));
    if (r.telefon) z.push("TEL;TYPE=WORK,VOICE:" + vcardEscape(r.telefon));
    if (r.email) z.push("EMAIL;TYPE=INTERNET:" + vcardEscape(r.email));
    z.push("END:VCARD");
    return z.join("\r\n");
  }).join("\r\n") + "\r\n";
}

/** Druckbare Adress- und Telefonliste (aktuelle Auswahl). */
function kontakteDrucken(rows) {
  const root = druckbereich();
  root.innerHTML = `
    <h1>Adress- und Telefonliste</h1>
    <table class="bw-table">
      <thead><tr><th>Typ</th><th>Name</th><th>Organisation / Ort</th><th>Funktion / Ansprechpartner</th><th>Telefon</th><th>E-Mail</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${esc(r.typ)}</td>
            <td>${esc(r.bezeichnung)}</td>
            <td>${esc(r.zusatz || "")}</td>
            <td>${esc(r.person || "")}</td>
            <td>${esc(r.telefon || "")}</td>
            <td>${esc(r.email || "")}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>
  `;
  window.print();
}

/* --------------------------------------------------------- CSV-Import (Prüflinge)
   Offline-Parser (kein Fremdcode): erkennt Trennzeichen (; oder ,), behandelt
   Anführungszeichen und Zeilenumbrüche in Feldern. Spalten werden automatisch
   den Prüflingsfeldern zugeordnet (überschreibbar), Vorschau + Dublettenschutz. */

function csvParse(text) {
  text = String(text || "").replace(/^﻿/, ""); // BOM entfernen
  const kopf = text.slice(0, (text.indexOf("\n") + 1) || text.length);
  const delim = (kopf.split(";").length > kopf.split(",").length) ? ";" : ",";
  const zeilen = [];
  let feld = "", zeile = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inQ = false; }
      else feld += c;
    } else if (c === '"') { inQ = true; }
    else if (c === delim) { zeile.push(feld); feld = ""; }
    else if (c === "\n") { zeile.push(feld); zeilen.push(zeile); zeile = []; feld = ""; }
    else if (c === "\r") { /* ignorieren */ }
    else feld += c;
  }
  if (feld.length || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  return zeilen.filter((z) => z.some((f) => String(f).trim() !== ""));
}

const CSV_FELDER = [
  { name: "nachname",     label: "Nachname",     syn: ["nachname", "name", "familienname", "lastname"] },
  { name: "vorname",      label: "Vorname",      syn: ["vorname", "firstname", "rufname"] },
  { name: "geburtsdatum", label: "Geburtsdatum", syn: ["geburtsdatum", "geboren", "geb", "geburtstag", "birthdate"] },
  { name: "beruf",        label: "Fachrichtung", syn: ["beruf", "fachrichtung", "ausbildungsberuf"] },
  { name: "betrieb",      label: "Ausbildungsbetrieb", syn: ["betrieb", "ausbildungsbetrieb", "firma", "unternehmen", "ausbildungsstaette"] },
  { name: "pruefungsjahr",label: "Prüfungsjahr", syn: ["pruefungsjahr", "jahr", "pruefjahr"] },
  { name: "email",        label: "E-Mail",       syn: ["email", "mail", "emailadresse"] },
  { name: "telefon",      label: "Telefon",      syn: ["telefon", "tel", "telefonnummer", "handy", "mobil"] },
];

function csvNorm(s) {
  return String(s || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}
function csvAutoMap(header) {
  const norm = header.map(csvNorm);
  const map = {};
  CSV_FELDER.forEach((f) => {
    let idx = norm.findIndex((h) => f.syn.includes(h));
    if (idx < 0) idx = norm.findIndex((h) => h && f.syn.some((s) => h.includes(s)));
    map[f.name] = idx; // -1 = nicht zugeordnet
  });
  return map;
}

/* ---------------------------------------------- Prüfer-Abwesenheiten (Dialog) */

async function abwesenheitDialog(prueferId, name) {
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog";
  dlg.id = "dialog";
  dlg.innerHTML = `
    <form method="dialog" id="abw-form" novalidate>
      <h2 style="margin-top:0">Abwesenheiten — ${esc(name)}</h2>
      <p class="bw-klein bw-leise">Tage eintragen, an denen ${esc(name)} nicht als Prüfer:in verfügbar ist. Die automatische Prüfungsplanung besetzt an diesen Tagen keinen Ausschuss mit dieser Person.</p>
      <div class="bw-toolbar">
        <div class="bw-field" style="margin:0">
          <label for="abw-datum" class="bw-skip-link">Datum</label>
          <input id="abw-datum" type="date" aria-label="Abwesenheitstag">
        </div>
        <button type="button" class="bw-btn bw-btn--sekundaer" id="abw-add">Tag hinzufügen</button>
      </div>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table"><tbody id="abw-liste"></tbody></table>
      </div>
      <p id="abw-leer" class="bw-leise bw-klein" hidden>Keine Abwesenheiten eingetragen.</p>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn" id="abw-fertig">Fertig</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const listeEl = dlg.querySelector("#abw-liste");
  const zeichne = async () => {
    const tage = await store.abwesenheitenFuer(prueferId);
    listeEl.innerHTML = tage.map((t) => `
      <tr>
        <td>${esc(new Date(t.datum).toLocaleDateString("de-DE"))}</td>
        <td class="bw-actions"><button class="bw-iconbtn" type="button" data-del-abw="${t.id}" title="Entfernen" aria-label="Tag entfernen">🗑</button></td>
      </tr>`).join("");
    dlg.querySelector("#abw-leer").hidden = tage.length > 0;
  };

  dlg.querySelector("#abw-add").addEventListener("click", async () => {
    const d = dlg.querySelector("#abw-datum").value;
    if (!d) { meldung("Bitte ein Datum wählen.", "fehler"); return; }
    try { await store.abwesenheitSetzen(prueferId, d); dlg.querySelector("#abw-datum").value = ""; zeichne(); }
    catch (e) { console.error(e); meldung("Konnte nicht speichern: " + e.message, "fehler"); }
  });
  listeEl.addEventListener("click", async (ev) => {
    const id = ev.target.closest("[data-del-abw]")?.getAttribute("data-del-abw");
    if (!id) return;
    await store.abwesenheitEntfernen(Number(id));
    zeichne();
  });
  dlg.querySelector("#abw-fertig").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  await zeichne();
  dlg.showModal();
}

function csvImportDialog(nachher) {
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog bw-dialog--breit";
  dlg.id = "dialog";
  dlg.innerHTML = `
    <form method="dialog" id="csv-form" novalidate>
      <h2 style="margin-top:0">Prüflinge aus CSV importieren</h2>
      <p class="bw-klein bw-leise">CSV-Datei wählen (Excel: „Speichern unter → CSV"). Erste Zeile = Spaltenüberschriften.
        Trennzeichen <code>;</code> oder <code>,</code> werden automatisch erkannt.</p>
      <div class="bw-field">
        <label for="csv-datei">CSV-Datei</label>
        <input id="csv-datei" type="file" accept=".csv,text/csv">
      </div>
      <div id="csv-zuordnung" hidden>
        <h3>Spaltenzuordnung</h3>
        <div class="bw-dialog__felder" id="csv-mapping"></div>
        <p id="csv-info" class="bw-hinweis" aria-live="polite"></p>
        <div class="bw-tablewrap">
          <table class="bw-table"><thead id="csv-vorschau-kopf"></thead><tbody id="csv-vorschau"></tbody></table>
        </div>
      </div>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="csv-abbrechen">Abbrechen</button>
        <button type="submit" class="bw-btn" id="csv-import" disabled>Importieren</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  let header = [], daten = [];
  const form = dlg.querySelector("#csv-form");
  const mappingEl = dlg.querySelector("#csv-mapping");
  const infoEl = dlg.querySelector("#csv-info");

  function aktualisiere() {
    const map = {};
    CSV_FELDER.forEach((f) => { map[f.name] = Number(form.elements["map_" + f.name].value); });
    const namensSpalte = map.nachname >= 0 || map.vorname >= 0;
    form.elements["csv-import"].disabled = !(namensSpalte && daten.length);
    infoEl.textContent = `${daten.length} Datensätze erkannt${namensSpalte ? "" : " — bitte mindestens Nach- oder Vorname zuordnen"}.`;
    // Vorschau (erste 5)
    dlg.querySelector("#csv-vorschau-kopf").innerHTML =
      "<tr>" + CSV_FELDER.map((f) => `<th>${esc(f.label)}</th>`).join("") + "</tr>";
    dlg.querySelector("#csv-vorschau").innerHTML = daten.slice(0, 5).map((z) =>
      "<tr>" + CSV_FELDER.map((f) => `<td>${esc(map[f.name] >= 0 ? (z[map[f.name]] || "") : "")}</td>`).join("") + "</tr>"
    ).join("");
    return map;
  }

  dlg.querySelector("#csv-datei").addEventListener("change", async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    if (!datei) return;
    try {
      const zeilen = csvParse(await datei.text());
      if (zeilen.length < 2) { meldung("CSV enthält keine Datenzeilen (Kopfzeile + mindestens eine Zeile nötig).", "fehler"); return; }
      header = zeilen[0]; daten = zeilen.slice(1);
      const map = csvAutoMap(header);
      mappingEl.innerHTML = CSV_FELDER.map((f) => `
        <div class="bw-field">
          <label for="map_${f.name}">${esc(f.label)}</label>
          <select id="map_${f.name}" name="map_${f.name}">
            <option value="-1">— nicht importieren —</option>
            ${header.map((h, i) => `<option value="${i}"${map[f.name] === i ? " selected" : ""}>${esc(h || ("Spalte " + (i + 1)))}</option>`).join("")}
          </select>
        </div>`).join("");
      mappingEl.querySelectorAll("select").forEach((s) => s.addEventListener("change", aktualisiere));
      dlg.querySelector("#csv-zuordnung").hidden = false;
      aktualisiere();
    } catch (e) { console.error(e); meldung("CSV konnte nicht gelesen werden: " + e.message, "fehler"); }
  });

  dlg.querySelector("#csv-abbrechen").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const map = aktualisiere();
    const saetze = daten.map((z) => {
      const s = {};
      CSV_FELDER.forEach((f) => { if (map[f.name] >= 0) s[f.name] = (z[map[f.name]] || "").trim(); });
      return s;
    });
    try {
      const r = await store.prueflingeImportieren(saetze);
      meldung(`Import: ${zahl(r.angelegt)} Prüflinge angelegt, ${zahl(r.uebersprungen)} übersprungen (Dublette/leer).`);
      dlg.close();
      if (nachher) nachher();
    } catch (e) { console.error(e); meldung("Import fehlgeschlagen: " + e.message, "fehler"); }
  });

  dlg.showModal();
}

/* ------------------------------------------------------------- CRUD-Dialog */

function feldHtml(f, value, refOptionen) {
  const id = "f_" + f.name;
  const v = value == null ? "" : String(value);
  const pflicht = f.pflicht ? " required" : "";
  const stern = f.pflicht ? ' <span aria-hidden="true">*</span>' : "";
  let control = "";
  if (f.input === "textarea") {
    control = `<textarea id="${id}" name="${f.name}" rows="3"${pflicht}>${esc(v)}</textarea>`;
  } else if (f.input === "select") {
    const opts = ['<option value="">— bitte wählen —</option>']
      .concat((f.optionen || []).map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`));
    control = `<select id="${id}" name="${f.name}"${pflicht}>${opts.join("")}</select>`;
  } else if (f.input === "reftext") {
    const listId = "dl_" + f.name;
    const opts = (refOptionen || []).map((o) => `<option value="${esc(o)}"></option>`).join("");
    control = `<input id="${id}" name="${f.name}" type="text" value="${esc(v)}"${pflicht}
                 list="${listId}" autocomplete="off">
               <datalist id="${listId}">${opts}</datalist>`;
  } else {
    control = `<input id="${id}" name="${f.name}" type="${f.input}" value="${esc(v)}"${pflicht}${f.input === "number" ? ' inputmode="numeric"' : ""}>`;
  }
  return `<div class="bw-field"><label for="${id}">${esc(f.label)}${stern}</label>${control}${f.hinweis ? `<small class="bw-leise">${esc(f.hinweis)}</small>` : ""}</div>`;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function formularOeffnen(key, rec, nachher) {
  const ent = ENTITAETEN[key];
  const istNeu = !rec;
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();

  // Vorschlagswerte (datalist) für ref-Felder vorab laden
  const refMap = {};
  for (const f of ent.felder) {
    if (f.input === "reftext" && f.ref) {
      try { refMap[f.name] = await store.werteFuer(f.ref.entitaet, f.ref.feld); }
      catch (e) { refMap[f.name] = []; }
    }
  }

  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog";
  dlg.id = "dialog";
  dlg.innerHTML = `
    <form method="dialog" id="dialog-form" novalidate>
      <h2 style="margin-top:0">${istNeu ? "Neuer Eintrag" : "Bearbeiten"} — ${esc(ent.singular)}</h2>
      <div class="bw-dialog__felder">
        ${ent.felder.map((f) => feldHtml(f, rec ? rec[f.name] : "", refMap[f.name])).join("")}
      </div>
      <p class="bw-klein bw-leise">Mit <span aria-hidden="true">*</span> markierte Felder sind Pflicht.</p>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="abbrechen">Abbrechen</button>
        <button type="submit" class="bw-btn">${istNeu ? "Anlegen" : "Speichern"}</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const form = dlg.querySelector("#dialog-form");
  dlg.querySelector("#abbrechen").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    // Pflichtfelder prüfen (deutsche, hilfreiche Meldung)
    for (const f of ent.felder) {
      if (f.pflicht) {
        const c = form.elements[f.name];
        if (!c.value.trim()) {
          c.focus();
          meldung(`Bitte „${f.label}" ausfüllen.`, "fehler");
          return;
        }
      }
    }
    // Format prüfen (E-Mail)
    for (const f of ent.felder) {
      if (f.input === "email") {
        const wertE = form.elements[f.name].value.trim();
        if (wertE && !RE_EMAIL.test(wertE)) {
          form.elements[f.name].focus();
          meldung(`„${f.label}" ist keine gültige E-Mail-Adresse.`, "fehler");
          return;
        }
      }
    }
    // Format prüfen (modellgetriebene Muster, z. B. PLZ, Prüfungsjahr)
    for (const f of ent.felder) {
      if (!f.muster) continue;
      const wertM = form.elements[f.name].value.trim();
      if (wertM && !new RegExp(f.muster).test(wertM)) {
        form.elements[f.name].focus();
        meldung(f.musterText || `„${f.label}" hat ein ungültiges Format.`, "fehler");
        return;
      }
    }
    const daten = {};
    for (const f of ent.felder) daten[f.name] = form.elements[f.name].value;

    // Dublettenwarnung (nicht-blockierend bestätigbar)
    try {
      const treffer = await store.findeDubletten(key, daten, istNeu ? null : rec.id);
      if (treffer.length) {
        const bez = (ent.dublette || []).map((k) => daten[k]).filter(Boolean).join(" ");
        if (!confirm(`Es gibt bereits einen Eintrag „${bez}". Trotzdem ${istNeu ? "anlegen" : "speichern"}?`)) {
          return;
        }
      }
    } catch (e) { console.warn("Dublettenprüfung übersprungen:", e); }

    try {
      if (istNeu) { await store.anlegen(key, daten); meldung(`${ent.singular} angelegt.`); }
      else { await store.aendern(key, rec.id, daten); meldung(`${ent.singular} gespeichert.`); }
      dlg.close();
      if (nachher) nachher();
    } catch (e) {
      console.error(e);
      meldung("Speichern fehlgeschlagen: " + e.message, "fehler");
    }
  });

  dlg.showModal();
  const erstes = form.querySelector("input, select, textarea");
  if (erstes) erstes.focus();
}

/* --------------------------------------------------------------- Router */

async function route() {
  navAufbauen();
  const r = aktiveRoute();
  try {
    if (r === "uebersicht") await renderUebersicht();
    else if (r === "planung") await renderPlanung();
    else if (r === "planungsliste") await renderPlanungsliste();
    else if (r === "noten") await renderNoten();
    else if (r === "zeugnisse") await renderZeugnisse();
    else if (r === "auswertungen") await renderAuswertungen();
    else if (r === "kontakte") await renderKontakte();
    else if (r === "suche") await renderSuche();
    else if (r.startsWith("pruefling/")) await renderPrueflingAkte(r.slice("pruefling/".length));
    else if (ENTITAETEN[r]) await renderListe(r);
    else { location.hash = "#/"; return; }
  } catch (e) {
    console.error(e);
    appEl().innerHTML = `<div class="bw-hinweis bw-hinweis--fehler"><strong>Fehler beim Anzeigen.</strong> ${esc(e.message)}</div>`;
  }
  document.getElementById("inhalt")?.focus?.();
}

/* --------------------------------------------------------------- Start */

function dbModusHinweis() {
  const el = document.getElementById("db-status");
  if (!el || !DB_MODUS) return;
  if (DB_MODUS.persistent) {
    el.hidden = true;
  } else {
    el.className = "bw-hinweis bw-hinweis--fehler";
    el.textContent =
      "Hinweis: Diese Umgebung erlaubt keine dauerhafte Speicherung (Ablage: " +
      DB_MODUS.modus + "). Eingaben gehen beim Schließen verloren. Bitte das Tool über einen Webserver (nicht per Doppelklick/file://) öffnen.";
    el.hidden = false;
  }
}

async function start() {
  const app = appEl();
  app.innerHTML = `<p class="bw-leise" role="status">Datenbank wird geladen…</p>`;
  try {
    const { modus } = await store.oeffnen();
    DB_MODUS = modus;
    await store.beispieldatenEinmalig();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="bw-hinweis bw-hinweis--fehler">
      <strong>Die Datenbank konnte nicht geladen werden.</strong>
      <p>${esc(e.message)}</p>
      <p class="bw-klein">Bitte das Tool über einen lokalen Webserver öffnen
      (nicht per Doppelklick / <code>file://</code>): <code>python3 -m http.server 8000</code>,
      dann <code>http://localhost:8000/</code>.</p></div>`;
    return;
  }
  dbModusHinweis();
  window.addEventListener("hashchange", route);
  route();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
