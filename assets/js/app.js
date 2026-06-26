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
    .concat([{ key: "planung", label: "Planung" }, { key: "noten", label: "Noten" }, { key: "zeugnisse", label: "Zeugnisse" }, { key: "kontakte", label: "Adressliste" }]);
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

    <section aria-labelledby="diagramm-h" style="margin-top:var(--bw-space-4)">
      <h2 id="diagramm-h">Prüflinge nach Status</h2>
      <div id="diagramm" class="bw-card"></div>
      <ul class="bw-legend">
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Anzahl je Status</li>
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

/* ----------------------------------------------------- Prüfungstag-Planung */

function terminLabel(t) {
  const datum = t.datum ? new Date(t.datum).toLocaleDateString("de-DE") : "ohne Datum";
  return `${t.titel} — ${datum}${t.ort ? " · " + t.ort : ""}`;
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
function tagesablaufDrucken(termin, zugeteilt, prueferZug) {
  const root = druckbereich();
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const kopf = [
    datum,
    termin.zeit_von ? esc(termin.zeit_von) + (termin.zeit_bis ? "–" + esc(termin.zeit_bis) : "") : "",
    termin.ort ? esc(termin.ort) + (termin.raum ? ", " + esc(termin.raum) : "") : "",
    termin.beruf ? esc(termin.beruf) : "",
  ].filter(Boolean).join(" · ");

  root.innerHTML = `
    <h1>Tagesablauf — ${esc(termin.titel)}</h1>
    <p>${kopf}</p>
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
    <div class="bw-field" style="max-width:36rem">
      <label for="pruefungswahl">Prüfungstermin</label>
      <select id="pruefungswahl">
        ${termine.map((t) => `<option value="${t.id}">${esc(terminLabel(t))}</option>`).join("")}
      </select>
    </div>
    <div id="plan" aria-live="polite"></div>
  `;

  const wahl = document.getElementById("pruefungswahl");

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
        <button class="bw-btn bw-btn--sekundaer" type="button" id="drucken-btn"
                ${zugeteilt.length || prueferZug.length ? "" : "disabled"}>Tagesablauf drucken</button>
      </div>

      <h2>Zugeteilte Prüflinge (${zahl(zugeteilt.length)})</h2>
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

    document.getElementById("pruefer-zuteilen-btn")?.addEventListener("click", async () => {
      const prid = Number(document.getElementById("pruefer-wahl").value);
      if (!prid) { meldung("Bitte eine:n Prüfer:in wählen.", "fehler"); return; }
      const rolle = document.getElementById("rolle-wahl").value || null;
      try {
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
  }

  wahl.addEventListener("change", planZeichnen);
  planZeichnen();
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
  const v = value == null ? "" : String(value).replace(".", ",");
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
      const g = await store.setzeBewertung(row.pruefling_id, lese("p", 5), lese("k", 4), form.elements["bemerkung"].value);
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
}

/** Baut ein druckbares Prüfungszeugnis und ruft den Druckdialog auf. */
async function zeugnisDrucken(prueflingId) {
  const d = await store.zeugnisDaten(prueflingId);
  if (!d) { meldung("Prüfling nicht gefunden.", "fehler"); return; }
  const heute = new Date().toLocaleDateString("de-DE");
  const geb = d.geburtsdatum ? new Date(d.geburtsdatum).toLocaleDateString("de-DE") : "";
  const terminZeile = d.termin
    ? `${d.termin.datum ? new Date(d.termin.datum).toLocaleDateString("de-DE") : ""}${d.termin.ort ? " in " + esc(d.termin.ort) : ""}`
    : "—";
  const P = [d.p1, d.p2, d.p3, d.p4, d.p5];
  const K = [d.k1, d.k2, d.k3, d.k4];
  const bereichZeile = (label, note) =>
    `<tr><td>${esc(label)}</td><td style="text-align:right">${formatNote(note)}</td></tr>`;

  const root = druckbereich();
  root.innerHTML = `
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
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>
  `;
  window.print();
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

  zeichne();
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
    else if (r === "planung") await renderPlanung();
    else if (r === "noten") await renderNoten();
    else if (r === "zeugnisse") await renderZeugnisse();
    else if (r === "kontakte") await renderKontakte();
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
