// app.js — Oberfläche der Ausbildungsberatung-Suite (Vanilla JS, ES-Modul).
//
// Router (Hash) -> Übersicht / generische Listenansichten mit DB-seitiger
// Fuzzy-Suche und CRUD-Dialogen. Datenmodell: model.js, Persistenz: store.js.
// Design ausschließlich über bw-theme.css (--bw-*-Tokens), Texte deutsch.

import * as store from "./store.js";
import { ENTITAETEN, NAV_REIHENFOLGE } from "./model.js";

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
    .concat(NAV_REIHENFOLGE.map((k) => ({ key: k, label: ENTITAETEN[k].plural })));
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
  const jeStatus = await store.gruppiert("prueflinge", "status");

  appEl().innerHTML = `
    <h1>Übersicht</h1>
    <p class="bw-unterzeile">Prüfungsplanung, Azubi-Verwaltung und Organisation der Ausbildungsberatung</p>

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

    <section aria-labelledby="diagramm-h" style="margin-top:var(--bw-space-4)">
      <h2 id="diagramm-h">Prüflinge nach Status</h2>
      <div id="diagramm" class="bw-card"></div>
      <ul class="bw-legend">
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Anzahl je Status</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> größter Wert</li>
      </ul>
    </section>
  `;

  if (window.bwChart && jeStatus.length) {
    const maxWert = Math.max.apply(null, jeStatus.map((r) => r.wert));
    window.bwChart.bars(
      document.getElementById("diagramm"),
      jeStatus.map((r) => ({ label: r.label, value: r.wert, highlight: r.wert === maxWert })),
      { titel: "Prüflinge nach Status" }
    );
  } else {
    document.getElementById("diagramm").innerHTML =
      '<p class="bw-leise">Noch keine Prüflinge erfasst.</p>';
  }
}

/* ----------------------------------------------------------- Listenansichten */

function tabellenSpalten(ent) { return ent.felder.filter((f) => f.tabelle); }

function zeileHtml(ent, row, query) {
  const tds = tabellenSpalten(ent).map((f) => {
    const roh = formatWert(f, row[f.name]);
    return `<td>${f.such ? hl(roh, query) : esc(roh)}</td>`;
  }).join("");
  return `<tr>${tds}
    <td class="bw-actions">
      <button class="bw-iconbtn" type="button" data-edit="${row.id}" aria-label="${esc(ent.singular)} bearbeiten" title="Bearbeiten">✎</button>
      <button class="bw-iconbtn" type="button" data-del="${row.id}" aria-label="${esc(ent.singular)} löschen" title="Löschen">🗑</button>
    </td></tr>`;
}

async function renderListe(key) {
  const ent = ENTITAETEN[key];
  if (!ent) { location.hash = "#/"; return; }
  const spalten = tabellenSpalten(ent);

  appEl().innerHTML = `
    <h1>${esc(ent.plural)}</h1>
    <div class="bw-toolbar">
      <div class="bw-search">
        <label for="modulsuche" class="bw-skip-link">${esc(ent.plural)} durchsuchen</label>
        <input id="modulsuche" type="search" placeholder="Suchen… (tippfehler­tolerant, alle Felder)"
               aria-label="${esc(ent.plural)} durchsuchen" autocomplete="off">
        <button type="button" id="suche-btn">Suchen</button>
      </div>
      <button class="bw-btn bw-btn--gelb" type="button" id="neu-btn">＋ Neuer Eintrag</button>
    </div>

    <div id="liste-bereich" aria-live="polite">
      <table class="bw-table">
        <thead><tr>${spalten.map((f) => `<th>${esc(f.label)}</th>`).join("")}<th>Aktionen</th></tr></thead>
        <tbody id="zeilen"></tbody>
      </table>
      <p id="leer" class="bw-hinweis" hidden></p>
    </div>
  `;

  const eingabe = document.getElementById("modulsuche");
  const zeichne = async () => {
    const q = eingabe.value;
    let rows;
    try { rows = await store.suche(key, q); }
    catch (e) { console.error(e); meldung("Suche fehlgeschlagen: " + e.message, "fehler"); return; }
    document.getElementById("zeilen").innerHTML = rows.map((r) => zeileHtml(ent, r, q)).join("");
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

  document.getElementById("zeilen").addEventListener("click", async (ev) => {
    const editId = ev.target.closest("[data-edit]")?.getAttribute("data-edit");
    const delId = ev.target.closest("[data-del]")?.getAttribute("data-del");
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
