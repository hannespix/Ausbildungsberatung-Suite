// app.js — Oberfläche der Ausbildungsberatung-Suite (Vanilla JS, ES-Modul).
//
// Router (Hash) -> Übersicht / generische Listenansichten mit DB-seitiger
// Fuzzy-Suche und CRUD-Dialogen. Datenmodell: model.js, Persistenz: store.js.
// Design ausschließlich über bw-theme.css (--bw-*-Tokens), Texte deutsch.

import * as store from "./store.js";
import { ENTITAETEN, NAV_REIHENFOLGE, GALABAU_BEREICHE, STANDARD_STATIONEN_GALABAU } from "./model.js";
import { rotationsplan, minZuZeit, prueferVerteilen, stationsBelegung } from "./ablauf.js";
import { emlBauen, base64FromBytes } from "./eml.js";
import {
  BERUFE, berufNach, berechne, getTarifVerguetung, getJahresurlaub,
  ds as rDs, iso as rIso, addMonths as rAddMonths,
} from "./ausbildungsrechner.js";
import {
  ERGEBNISSE, ergebnisLabel, brauchtWiedervorlage, naechsteFrist,
  wvStatus, ampel as bhAmpel, isoDate as bhIso, zulassungsEmpfehlung,
  KW_ORDER, RASTER_SPALTEN, MAENGEL_CODES, codeUmschalten, codesAlsListe, zellenStatus,
  maengelHaeufung, maengelJeBetrieb,
} from "./berichtsheft.js";
import {
  STATUS as BERATUNG_STATUS, statusLabel as beratungStatusLabel, KATEGORIEN as BERATUNG_KATEGORIEN,
  EINTRAG_ARTEN, artLabel, standardWiedervorlage, fallAmpel, kategorieHaeufung,
} from "./beratung.js";

// Vorlage für den Rotations-Ablaufplan (Single Source: model.js) — von Cockpit
// und automatischer Planung gemeinsam genutzt, je Termin anpassbar.
const STATIONEN_GALABAU = STANDARD_STATIONEN_GALABAU;

/* ----------------------------------------------------------------- Anmeldung
   Leichte Zugangsabsicherung: ohne Login ist nichts nutzbar. Die Sitzung gilt
   nur für den Browser-Tab (sessionStorage) — nach dem Schließen wird erneut
   nach dem Login gefragt. Siehe auth.js für die ehrliche Sicherheits-Einordnung. */
const SITZUNG_KEY = "ab_sitzung";
let _benutzer = null;

function istAdmin() { return _benutzer && _benutzer.rolle === "admin"; }

function sitzungLaden() {
  try {
    const roh = sessionStorage.getItem(SITZUNG_KEY);
    if (roh) { const u = JSON.parse(roh); if (u && u.benutzername) _benutzer = u; }
  } catch { /* sessionStorage evtl. nicht verfügbar — dann eben Login je Aufruf */ }
}

function abmelden() {
  _benutzer = null;
  try { sessionStorage.removeItem(SITZUNG_KEY); } catch { /* egal */ }
  navAufbauen();
  loginAnzeigen();
  if (aktiveRoute() !== "") location.hash = "#/";
}

/** Login-Maske; blockiert die App bis zur erfolgreichen Anmeldung. */
function loginAnzeigen(fehler) {
  navAufbauen();
  appEl().innerHTML = `
    <section class="bw-card" style="max-width:26rem;margin:var(--bw-space-4) auto" aria-labelledby="login-h">
      <h1 id="login-h" style="margin-top:0">Anmeldung</h1>
      <p class="bw-klein bw-leise">Bitte anmelden — ohne Login ist das Tool gesperrt.</p>
      ${fehler ? `<p class="bw-hinweis bw-hinweis--fehler" role="alert">${esc(fehler)}</p>` : ""}
      <form id="login-form" novalidate>
        <div class="bw-field">
          <label for="login-name">Benutzername</label>
          <input id="login-name" name="name" type="text" autocomplete="username" value="admin" required>
        </div>
        <div class="bw-field">
          <label for="login-pass">Passwort</label>
          <input id="login-pass" name="pass" type="password" autocomplete="current-password" required>
        </div>
        <button class="bw-btn bw-btn--gelb" type="submit">Anmelden</button>
      </form>
      <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">Erstanmeldung über den vorbelegten Zugang <strong>admin</strong>. Passwort danach unter „Benutzer" ändern.</p>
    </section>`;
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = document.getElementById("login-name").value;
    const pass = document.getElementById("login-pass").value;
    try {
      const u = await store.login(name, pass);
      if (!u) { loginAnzeigen("Benutzername oder Passwort falsch."); return; }
      _benutzer = u;
      try { sessionStorage.setItem(SITZUNG_KEY, JSON.stringify(u)); } catch { /* egal */ }
      meldung(`Angemeldet als ${u.benutzername}.`);
      navAufbauen();
      // Direkt aufs Dashboard. Ist der Hash schon „#/" (kein hashchange-Event),
      // direkt rendern; sonst löst die Hash-Änderung den Router aus.
      const aufDashboard = location.hash === "" || location.hash === "#" || location.hash === "#/";
      if (aufDashboard) route(); else location.hash = "#/";
    } catch (e) { console.error(e); loginAnzeigen("Anmeldung fehlgeschlagen: " + e.message); }
  });
  document.getElementById("login-pass")?.focus?.();
}

/** "08:00"/"8:00 Uhr" -> Minuten ab Mitternacht; ungültig -> Default. */
function zeitZuMin(text, fallback = 8 * 60) {
  const m = String(text || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

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

/** Geldbetrag in de-DE mit Euro-Zeichen (z. B. 1.234,50 €). */
function euro(n) {
  return Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
/** Eingabe „12,50" oder „12.50" -> Zahl; leer/ungültig -> 0. */
function geldOderNull(s) {
  const n = Number(String(s == null ? "" : s).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Einfarbige Inline-SVG-Symbole (currentColor, erben die Textfarbe) — statt
 * bunter Emoji, damit das Tool im Landes-CD „wie aus einem Guss" wirkt.
 * Strichzeichnungen, keine Füll-/Eigenfarben. aria-hidden (Label am Knopf).
 */
const ICON_PFADE = {
  akte: '<rect x="7" y="3" width="10" height="4" rx="1"/><path d="M7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"/><path d="M9 12h6M9 16h6"/>',
  kalender: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  stift: '<path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3Z"/><path d="M14.5 7.5l2 2"/>',
  muell: '<path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v7M14 11v7"/>',
  haken: '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  kreuz: '<path d="M6 6l12 12M18 6L6 18"/>',
  zurueck: '<path d="M4 5v5h5"/><path d="M4.5 10a8 8 0 1 1-1.2 5"/>',
};
function icon(name) {
  const p = ICON_PFADE[name];
  if (!p) return "";
  return `<svg class="bw-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}

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
  return (h.split("?")[0]) || "uebersicht";
}

/** Parameter aus dem Hash (z. B. #/prueflinge?phase=eingeplant). */
function routeParams() {
  const q = location.hash.replace(/^#\/?/, "").split("?")[1] || "";
  const p = {};
  q.split("&").filter(Boolean).forEach((kv) => {
    const [k, v] = kv.split("=");
    p[decodeURIComponent(k)] = decodeURIComponent(v || "");
  });
  return p;
}

// Gruppierte Hauptnavigation: wenige Hauptpunkte, Unterpunkte im Dropdown —
// gegliedert nach dem Arbeitsablauf (Stammdaten → Planung → Prüfungstag →
// Auswertung). Übersicht und Auswertungen bleiben Direktlinks.
function navGruppen() {
  const ent = (k) => (ENTITAETEN[k] ? ENTITAETEN[k].plural : k);
  return [
    { link: "", label: "Übersicht", routeKey: "uebersicht" },
    { label: "Stammdaten", kinder: [
      { key: "prueflinge", label: ent("prueflinge") },
      { key: "betriebe", label: ent("betriebe") },
      { key: "pruefer", label: ent("pruefer") },
      { key: "pruefungen", label: ent("pruefungen") },
      { key: "kontakte", label: "Adressliste" },
    ] },
    { label: "Prüfung", kinder: [
      { key: "pruefungstag", label: "Tagescockpit" },
      { key: "planung", label: "Tagesplanung" },
      { key: "planungsliste", label: "Prüfer-Plan" },
      { key: "noten", label: "Noten" },
      { key: "zeugnisse", label: "Zeugnisse" },
      { key: "auswertungen", label: "Auswertungen" },
    ] },
    { link: "berichtsheft", label: "Berichtsheft", routeKey: "berichtsheft" },
    { label: "Beratung", kinder: [
      { key: "beratung", label: "Beratungsfälle" },
      { key: "rechner", label: "Ausbildungsrechner" },
    ] },
    { link: "vorlagen", label: "Vorlagen", routeKey: "vorlagen" },
  ];
}

function navAufbauen() {
  const ul = document.getElementById("navlinks");
  if (!ul) return;
  // Suche/Menü-Knöpfe nur bei Anmeldung zeigen (saubere Login-Maske).
  const aktionen = document.getElementById("nav-aktionen");
  if (aktionen) aktionen.style.display = _benutzer ? "" : "none";
  // Ohne Anmeldung keine Navigation (Tool ist gesperrt).
  if (!_benutzer) { ul.innerHTML = ""; return; }
  const route = aktiveRoute();
  const auth = (istAdmin()
      ? `<li><a href="#/benutzer"${route === "benutzer" ? ' aria-current="page"' : ""}>Benutzer</a></li>`
      : "")
    + `<li><a href="#/abmelden" title="Angemeldet als ${esc(_benutzer.benutzername)}">Abmelden</a></li>`;
  ul.innerHTML = navGruppen().map((g, gi) => {
    if (!g.kinder) {
      const aktiv = g.routeKey === route ? ' aria-current="page"' : "";
      return `<li><a href="#/${g.link}"${aktiv}>${esc(g.label)}</a></li>`;
    }
    const kindAktiv = g.kinder.some((k) => k.key === route);
    const subId = "navsub-" + gi;
    const sub = g.kinder.map((k) =>
      `<li><a href="#/${k.key}"${k.key === route ? ' aria-current="page"' : ""}>${esc(k.label)}</a></li>`).join("");
    return `<li class="bw-nav__group">
        <button type="button" class="bw-nav__groupbtn${kindAktiv ? " is-aktiv" : ""}"
                data-menu-toggle aria-haspopup="true" aria-expanded="false" aria-controls="${subId}">${esc(g.label)} <span class="bw-nav__caret" aria-hidden="true">▾</span></button>
        <ul class="bw-nav__submenu" id="${subId}">${sub}</ul>
      </li>`;
  }).join("") + auth;
  navDropdownsBinden();
}

let _navGebunden = false;
/** Dropdown- und Schließverhalten der Hauptnavigation (einmalig, per Delegation). */
function navDropdownsBinden() {
  const ul = document.getElementById("navlinks");
  if (!ul || _navGebunden) return;
  _navGebunden = true;
  const alleZu = (außer) => ul.querySelectorAll('[data-menu-toggle][aria-expanded="true"]')
    .forEach((b) => { if (b !== außer) b.setAttribute("aria-expanded", "false"); });
  const hamburgerZu = () => {
    const t = document.querySelector("[data-nav-toggle]");
    const p = document.getElementById("hauptmenue");
    if (t) t.setAttribute("aria-expanded", "false");
    if (p) p.setAttribute("data-open", "false");
  };
  ul.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-menu-toggle]");
    if (btn) {
      e.preventDefault();
      const offen = btn.getAttribute("aria-expanded") === "true";
      alleZu(btn);
      btn.setAttribute("aria-expanded", String(!offen));
      return;
    }
    // Klick auf einen echten Navigationslink: Dropdown und Hamburger schließen.
    if (e.target.closest("a[href]")) { alleZu(null); hamburgerZu(); }
  });
  document.addEventListener("click", (e) => { if (!ul.contains(e.target)) alleZu(null); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") alleZu(null); });
}

/* ----------------------------------------------------------------- Übersicht */

/** Ampel-Punkt für ein Bereitschafts-Kriterium (erledigt = grün, offen = leise). */
function bereitschaftPunkt(ok) {
  return ok ? '<span class="bw-status-do" aria-hidden="true">●</span>'
            : '<span class="bw-leise" aria-hidden="true">○</span>';
}

/** Ein Prüfungstag im Bereitschafts-Board (Ausschuss, Zusagen, Uhrzeiten). */
function bereitschaftEintrag(t) {
  const datum = t.datum ? new Date(t.datum).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) : "—";
  const istHeute = t.datum && new Date(t.datum).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  const hatPl = t.prueflinge > 0;
  const ausschussOk = t.ausschuss >= 3;
  const zusagenOk = t.ausschuss > 0 && t.zusagen_offen === 0;
  const uhrzeitOk = hatPl && t.mit_slot === t.prueflinge;
  const chips = hatPl
    ? `<span class="bw-bereitschaft">
         <span>${bereitschaftPunkt(ausschussOk)} Ausschuss ${zahl(t.ausschuss)}/3</span>
         <span>${bereitschaftPunkt(zusagenOk)} Zusagen ${t.zusagen_offen ? zahl(t.zusagen_offen) + " offen" : "ok"}</span>
         <span>${bereitschaftPunkt(uhrzeitOk)} Uhrzeiten ${zahl(t.mit_slot)}/${zahl(t.prueflinge)}</span>
       </span>`
    : '<span class="bw-klein"><span class="bw-status-dont">●</span> noch keine Prüflinge</span>';
  return `
    <li>
      <span>
        <strong>${esc(datum)}</strong>${istHeute ? ' <span class="bw-tag bw-tag--ok">Heute</span>' : ""} · ${esc(t.titel || "Termin")}
        <span class="bw-klein bw-leise">${t.beruf ? esc(t.beruf) + " · " : ""}${zahl(t.prueflinge)} Prüflinge</span>
        ${chips}
      </span>
      <span class="bw-toolbar" style="margin:0 0 0 auto;gap:var(--bw-space-1)">
        <a class="bw-btn bw-btn--sekundaer" href="#/planung?termin=${t.id}">Planung</a>
        <a class="bw-btn bw-btn--sekundaer" href="#/noten?termin=${t.id}"${hatPl ? "" : ' aria-disabled="true" tabindex="-1" style="opacity:.5;pointer-events:none"'}>Noten</a>
      </span>
    </li>`;
}

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

  // Nächste Prüfungstage: heute oder später, chronologisch, max. 5 — als
  // Bereitschafts-Board (Ausschuss, Zusagen, Uhrzeiten je Tag auf einen Blick).
  let naechste = [];
  try {
    naechste = (await store.prueftagBereitschaft()).slice(0, 5);
  } catch (e) { console.warn("Termine nicht verfügbar:", e); }

  // Bereichsübergreifende Wiedervorlagen (Berichtsheft + Beratung) — offen/überfällig.
  let wvAlle = [];
  let beratungOffen = null, bhWvOffen = null;
  try {
    const h = heuteISO();
    const faelle = await store.beratungFaelle();
    const bhWv = await store.berichtsheftWiedervorlagen();
    beratungOffen = faelle.filter((f) => f.status !== "geloest").length;
    bhWvOffen = bhWv.filter((w) => {
      if (w.wiedervorlage_erledigt) return false;
      const s = wvStatus(w.wiedervorlage_frist, false, h);
      return s === "offen" || s === "ueberfaellig";
    }).length;
    wvAlle = [
      ...faelle.filter((f) => f.wiedervorlage && f.status !== "geloest").map((f) => ({
        bereich: "Beratung", wer: f.nachname ? `${f.nachname}, ${f.vorname}` : (f.betrieb || "—"),
        anlass: f.titel, frist: f.wiedervorlage, route: `#/beratung/${f.id}`, stat: wvStatus(f.wiedervorlage, false, h),
      })),
      ...bhWv.filter((w) => !w.wiedervorlage_erledigt).map((w) => ({
        bereich: "Berichtsheft", wer: `${w.nachname}, ${w.vorname}`,
        anlass: ergebnisLabel(w.ergebnis), frist: w.wiedervorlage_frist, route: "#/berichtsheft", stat: wvStatus(w.wiedervorlage_frist, false, h),
      })),
    ].filter((x) => x.stat === "offen" || x.stat === "ueberfaellig")
     .sort((a, b) => String(a.frist).localeCompare(String(b.frist))).slice(0, 8);
  } catch (e) { console.warn("Wiedervorlagen nicht verfügbar:", e); }

  // Schnellzugriff auf alle Bereiche der Suite (deckt den Funktionsumfang ab).
  const bereiche = [
    { route: "prueflinge",    titel: "Stammdaten",        text: "Prüflinge, Betriebe, Prüfer:innen und Termine verwalten." },
    { route: "kontakte",      titel: "Adressliste",       text: "Kontakte von Betrieben und Prüfer:innen, Export." },
    { route: "pruefungstag",  titel: "Tagescockpit",      text: "Ein Prüfungstag an einem Ort — Status und Dokumente." },
    { route: "planung",       titel: "Tagesplanung",      text: "Prüflinge und Ausschuss je Termin zuteilen." },
    { route: "planungsliste", titel: "Prüfer-Plan",       text: "Ausschuss-Besetzung und Zusagen je Termin." },
    { route: "noten",         titel: "Noten",             text: "Bewerten, Reihen-Bewertung, Import/Export." },
    { route: "zeugnisse",     titel: "Zeugnisse",         text: "Prüfungszeugnisse und Ergebnis-Mitteilungen drucken." },
    { route: "auswertungen",  titel: "Auswertungen",      text: "Quoten, Notenspiegel, Auslastung, Prüfer-Einsätze." },
    { route: "berichtsheft",  titel: "Berichtsheft",      text: "Ausbildungsnachweise kontrollieren, KW-Raster, Mängel.", zahl: bhWvOffen, einheit: "offen" },
    { route: "beratung",      titel: "Beratung",          text: "Beratungsfälle mit Verlauf und Wiedervorlage.", zahl: beratungOffen, einheit: "offen" },
    { route: "rechner",       titel: "Ausbildungsrechner", text: "Prüfungstermin, Vergütung und Urlaub berechnen." },
    { route: "vorlagen",      titel: "Vorlagen",          text: "Schreiben + Anlagen als E-Mail-Entwurf (.eml)." },
    { route: "suche",         titel: "Globale Suche",     text: "Prüflinge, Betriebe, Prüfer:innen und Termine finden." },
  ];

  appEl().innerHTML = `
    <h1>Übersicht</h1>
    <p class="bw-unterzeile">Arbeitsplattform der Ausbildungsberatung — Prüfung, Berichtsheft, Beratung, Vorlagen und Auswertungen an einem Ort.</p>

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

    <section aria-labelledby="bereiche-h" style="margin-top:var(--bw-space-4)">
      <h2 id="bereiche-h">Bereiche</h2>
      <p class="bw-klein bw-leise">Schnellzugriff auf alle Werkzeuge der Suite.</p>
      <div class="bw-flaechen bw-kachel-grid">
        ${bereiche.map((b) => `
          <a class="bw-card bw-kachel" href="#/${b.route}">
            <span class="bw-kachel__titel">${esc(b.titel)}${(b.zahl != null && b.zahl > 0) ? `<span class="bw-tag bw-tag--aktiv">${zahl(b.zahl)} ${esc(b.einheit)}</span>` : ""}</span>
            <span class="bw-kachel__text">${esc(b.text)}</span>
          </a>`).join("")}
      </div>
    </section>

    ${naechste.length ? `
    <section aria-labelledby="naechste-h" style="margin-top:var(--bw-space-4)">
      <h2 id="naechste-h">Nächste Prüfungstage</h2>
      <p class="bw-klein bw-leise">Bereitschaft je Tag — <span class="bw-status-do">●</span> erledigt, <span class="bw-leise">○</span> offen. Tag öffnen, um Lücken zu schließen.</p>
      <ul class="bw-trefferliste">
        ${naechste.map((t) => bereitschaftEintrag(t)).join("")}
      </ul>
    </section>` : ""}

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

    ${wvAlle.length ? `
    <section aria-labelledby="wv-h" style="margin-top:var(--bw-space-4)">
      <h2 id="wv-h">Wiedervorlagen</h2>
      <p class="bw-klein bw-leise">Offene und überfällige Wiedervorlagen aus Berichtsheft und Beratung.</p>
      <ul class="bw-trefferliste">
        ${wvAlle.map((w) => `
          <li>
            <span>${w.stat === "ueberfaellig" ? '<span class="bw-status-dont">●</span> ' : ""}<strong>${esc(new Date(w.frist).toLocaleDateString("de-DE"))}</strong> · ${esc(w.bereich)} · ${esc(w.wer)} <span class="bw-leise">— ${esc(w.anlass)}</span></span>
            <a class="bw-btn bw-btn--sekundaer" href="${w.route}" style="margin-left:auto">Öffnen</a>
          </li>`).join("")}
      </ul>
    </section>` : ""}

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
      ${fGesamt ? `
      <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">Phase öffnen — zeigt die Prüflinge gefiltert:</p>
      <div class="bw-toolbar" style="gap:var(--bw-space-1)">
        ${fortschritt.map((f) => `<a class="bw-btn bw-btn--sekundaer" href="#/prueflinge?phase=${encodeURIComponent(f.key)}">${esc(f.label)} (${zahl(f.wert)})</a>`).join("")}
      </div>` : ""}
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
        <p class="bw-klein bw-leise">Verteilt alle Prüflinge je Fachrichtung gleichmäßig auf passend viele Prüfungstermine (Kapazität je Tag automatisch aus Ablaufplan &amp; Tageslänge, optional überschreibbar), nach PLZ geclustert, legt fehlende Termine an, besetzt je Termin einen Ausschuss und erstellt den Stationen-Ablaufplan: Ausschuss auf Stationen verteilt, Startzeit &amp; Reihenfolge je Prüfling aus der Karussell-Rotation (kein 20-Minuten-Raster). Ergebnis im <a href="#/planungsliste">Prüfer-Plan</a>, in der <a href="#/planung">Planung</a> und im <a href="#/pruefungstag">Prüfungstag-Cockpit</a>.</p>
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
    const eingabe = prompt("Kapazität je Prüfungstermin (Prüflinge pro Tag) — leer lassen für automatisch aus dem Ablaufplan:", "");
    if (eingabe === null) return;
    const cap = parseInt(eingabe, 10) > 0 ? parseInt(eingabe, 10) : null;
    const wie = cap ? `max. ${cap} je Termin` : "Kapazität automatisch aus dem Ablaufplan";
    if (!confirm(`Alle Prüflinge automatisch auf Termine verteilen (${wie}) und Ausschüsse besetzen? Bestehende Zuteilungen werden ersetzt.`)) return;
    meldung("Planung wird erstellt…");
    try {
      const r = await store.planungAutomatisch(cap);
      meldung(`Geplant: ${zahl(r.zuteilungen)} Prüflinge auf ${zahl(r.termine)} Termine, ${zahl(r.prueferZuteilungen)} Prüfer-Zuteilungen.`
        + (r.uebersprungen ? ` ${zahl(r.uebersprungen)} ohne Fachrichtung übersprungen — bitte ergänzen.` : ""),
        r.uebersprungen ? "fehler" : "erfolg");
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

function zeileHtml(ent, row, query, phase, termin, belegung) {
  const tds = tabellenSpalten(ent).map((f) => {
    const roh = formatWert(f, row[f.name]);
    return `<td>${f.such ? hl(roh, query) : esc(roh)}</td>`;
  }).join("");
  const terminTd = termin !== undefined
    ? `<td>${termin ? esc(termin) : '<span class="bw-leise">—</span>'}</td>` : "";
  const fortschrittTd = phase !== undefined ? `<td>${fortschrittTag(phase)}</td>` : "";
  // Belegung (nur Prüfungstermine): zugeteilte Prüflinge + Ausschussgröße.
  const belegungTds = belegung !== undefined
    ? `<td style="text-align:right">${zahl(belegung.prueflinge)}</td>`
      + `<td style="text-align:right">${belegung.ausschuss ? zahl(belegung.ausschuss) : '<span class="bw-status-dont">0</span>'}</td>`
    : "";
  const akte = ent.key === "prueflinge"
    ? `<a class="bw-iconbtn" href="#/pruefling/${row.id}" aria-label="Akte von ${esc((row.vorname || "") + " " + (row.nachname || ""))} öffnen" title="Akte öffnen">${icon("akte")}</a>`
    : ent.key === "betriebe"
    ? `<a class="bw-iconbtn" href="#/betrieb/${row.id}" aria-label="Betrieb ${esc(row.name || "")} öffnen" title="Betrieb öffnen">${icon("akte")}</a>`
    : ent.key === "pruefer"
    ? `<a class="bw-iconbtn" href="#/pruefer/${row.id}" aria-label="Akte von ${esc((row.vorname || "") + " " + (row.nachname || ""))} öffnen" title="Akte öffnen">${icon("akte")}</a>`
    : ent.key === "pruefungen"
    ? `<a class="bw-iconbtn" href="#/planung?termin=${row.id}" aria-label="In der Planung öffnen" title="In der Planung öffnen">${icon("kalender")}</a>`
    : "";
  const abw = ent.key === "pruefer"
    ? `<button class="bw-iconbtn" type="button" data-abwesenheit="${row.id}" aria-label="Abwesenheiten von ${esc((row.vorname || "") + " " + (row.nachname || ""))}" title="Abwesenheiten">${icon("kalender")}</button>`
    : "";
  return `<tr>${tds}${terminTd}${fortschrittTd}${belegungTds}
    <td class="bw-actions">
      ${akte}${abw}
      <button class="bw-iconbtn" type="button" data-edit="${row.id}" aria-label="${esc(ent.singular)} bearbeiten" title="Bearbeiten">${icon("stift")}</button>
      <button class="bw-iconbtn" type="button" data-del="${row.id}" aria-label="${esc(ent.singular)} löschen" title="Löschen">${icon("muell")}</button>
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
  const zeigtBelegung = key === "pruefungen";
  let sortName = null, sortDir = 1;
  // Optionaler Fortschritt-Filter (nur Prüflinge), per Deep-Link aus der
  // Übersicht (#/prueflinge?phase=eingeplant) vorbelegt.
  let phaseFilter = zeigtFortschritt ? (routeParams().phase || "") : "";
  // Optionaler Prüfungsjahr-Filter (nur Prüflinge) für mehrere Jahrgänge; per
  // Deep-Link vorbelegbar (#/prueflinge?jahr=2027 oder ?jahr=__ohne__).
  let jahrFilter = zeigtFortschritt ? (routeParams().jahr || "") : "";
  let jahre = [];
  if (zeigtFortschritt) { try { jahre = await store.pruefungsjahre(); } catch (e) { console.warn("Jahre nicht verfügbar:", e); } }

  const kopfRow = () => spalten.map((f) => {
    const aktiv = f.name === sortName;
    const marker = aktiv ? (sortDir === 1 ? " ▲" : " ▼") : "";
    const aria = aktiv ? (sortDir === 1 ? "ascending" : "descending") : "none";
    return `<th class="bw-th-sort" data-sort="${f.name}" role="button" tabindex="0" aria-sort="${aria}"
                title="Nach ${esc(f.label)} sortieren">${esc(f.label)}<span aria-hidden="true">${marker}</span></th>`;
  }).join("") + `${zeigtFortschritt ? "<th>Prüfungstag</th><th>Fortschritt</th>" : ""}${zeigtBelegung ? "<th style=\"text-align:right\">Prüflinge</th><th style=\"text-align:right\">Ausschuss</th>" : ""}<th>Aktionen</th>`;

  appEl().innerHTML = `
    <h1>${esc(ent.plural)}</h1>
    <div class="bw-toolbar">
      <div class="bw-search">
        <label for="modulsuche" class="bw-skip-link">${esc(ent.plural)} durchsuchen</label>
        <input id="modulsuche" type="search" placeholder="Suchen… (tippfehler­tolerant, alle Felder)"
               aria-label="${esc(ent.plural)} durchsuchen" autocomplete="off">
        <button type="button" id="suche-btn">Suchen</button>
      </div>
      ${zeigtFortschritt ? `
      <div class="bw-field" style="margin:0">
        <label for="phase-filter" class="bw-skip-link">Nach Fortschritt filtern</label>
        <select id="phase-filter" aria-label="Nach Fortschritt filtern">
          <option value="">Alle Phasen</option>
          ${store.FORTSCHRITT_STUFEN.map((s) => `<option value="${s.key}"${s.key === phaseFilter ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
        </select>
      </div>
      ${(jahre.length || jahrFilter === "__ohne__") ? `
      <div class="bw-field" style="margin:0">
        <label for="jahr-filter-liste" class="bw-skip-link">Nach Prüfungsjahr filtern</label>
        <select id="jahr-filter-liste" aria-label="Nach Prüfungsjahr filtern">
          <option value="">Alle Jahre</option>
          ${jahre.map((j) => `<option value="${j}"${String(j) === String(jahrFilter) ? " selected" : ""}>${esc(j)}</option>`).join("")}
          <option value="__ohne__"${jahrFilter === "__ohne__" ? " selected" : ""}>(ohne Jahr)</option>
        </select>
      </div>` : ""}
      <button class="bw-btn bw-btn--sekundaer" type="button" id="zulassen-alle" hidden></button>` : ""}
      <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-btn">CSV importieren</button>
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
  let aktuelleRows = [], aktuellePhasen = null, aktuelleTermine = null, aktuelleBelegung = null;
  // Abgeleiteter Prüfungstag je Prüfling (frühester) als Klartext „TT.MM.JJJJ · HH:MM".
  const terminPlain = (r) => {
    const t = aktuelleTermine && aktuelleTermine.get(String(r.id));
    if (!t || !t.datum) return "";
    return new Date(t.datum).toLocaleDateString("de-DE") + (t.slot ? " · " + t.slot : "");
  };
  // Belegung je Prüfungstermin (Prüflinge/Ausschuss) aus der Auslastung.
  const belegungVon = (r) => {
    const b = aktuelleBelegung && aktuelleBelegung.get(String(r.id));
    return { prueflinge: b ? b.prueflinge : 0, ausschuss: b ? b.ausschuss : 0 };
  };
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
    let phaseMap = null, terminMap = null;
    if (zeigtFortschritt) {
      try {
        const ph = await store.fortschrittAlle();
        phaseMap = new Map(ph.map((r) => [String(r.id), r.phase]));
      } catch (e) { console.warn("Fortschritt nicht verfügbar:", e); }
      try {
        const tm = await store.prueflingTermin();
        terminMap = new Map(tm.map((r) => [String(r.id), r]));
      } catch (e) { console.warn("Prüfungstage nicht verfügbar:", e); }
    }
    let belegungMap = null;
    if (zeigtBelegung) {
      try {
        const a = await store.auslastung();
        belegungMap = new Map(a.map((r) => [String(r.id), r]));
      } catch (e) { console.warn("Belegung nicht verfügbar:", e); }
    }
    if (phaseFilter && phaseMap) {
      rows = rows.filter((r) => (phaseMap.get(String(r.id)) || "angemeldet") === phaseFilter);
    }
    if (jahrFilter === "__ohne__") {
      rows = rows.filter((r) => !String(r.pruefungsjahr || "").trim());
    } else if (jahrFilter) {
      rows = rows.filter((r) => String(r.pruefungsjahr || "") === String(jahrFilter));
    }
    aktuelleRows = rows; aktuellePhasen = phaseMap; aktuelleTermine = terminMap; aktuelleBelegung = belegungMap;
    document.getElementById("zeilen").innerHTML = rows
      .map((r) => zeileHtml(ent, r, q,
        phaseMap ? (phaseMap.get(String(r.id)) || "angemeldet") : undefined,
        zeigtFortschritt ? terminPlain(r) : undefined,
        zeigtBelegung ? belegungVon(r) : undefined))
      .join("");
    const leer = document.getElementById("leer");
    if (!rows.length) {
      const phaseLabel = (store.FORTSCHRITT_STUFEN.find((s) => s.key === phaseFilter) || {}).label;
      leer.hidden = false;
      leer.textContent = q
        ? `Keine Treffer für „${q}". Suchbegriff ändern oder neuen Eintrag anlegen.`
        : phaseFilter
          ? `Keine Prüflinge in der Phase „${phaseLabel || phaseFilter}".`
          : `Noch keine ${ent.plural} erfasst. Mit „Neuer Eintrag" beginnen.`;
    } else {
      leer.hidden = true;
    }
    // Sammel-Zulassung nur sinnvoll, wenn nach „Angemeldet" gefiltert wird.
    const zb = document.getElementById("zulassen-alle");
    if (zb) {
      const zeig = phaseFilter === "angemeldet" && rows.length > 0;
      zb.hidden = !zeig;
      if (zeig) zb.textContent = `Angezeigte zulassen (${zahl(rows.length)})`;
    }
  };

  eingabe.addEventListener("input", debounce(zeichne, 180));
  document.getElementById("suche-btn").addEventListener("click", zeichne);
  document.getElementById("phase-filter")?.addEventListener("change", (ev) => { phaseFilter = ev.target.value; zeichne(); });
  document.getElementById("jahr-filter-liste")?.addEventListener("change", (ev) => { jahrFilter = ev.target.value; zeichne(); });
  document.getElementById("zulassen-alle")?.addEventListener("click", async () => {
    const ids = aktuelleRows.map((r) => r.id);
    if (!ids.length) return;
    if (!confirm(`${ids.length} angezeigte:n Prüfling(e) zulassen (Status „zugelassen")?`)) return;
    try {
      const n = await store.setzeStatusViele(ids, "zugelassen");
      meldung(`${zahl(n)} Prüfling(e) zugelassen.`);
      zeichne();
    } catch (e) { console.error(e); meldung("Zulassen fehlgeschlagen: " + e.message, "fehler"); }
  });
  document.getElementById("neu-btn").addEventListener("click", () => formularOeffnen(key, null, zeichne));
  document.getElementById("csv-btn")?.addEventListener("click", () => csvImportDialog(key, zeichne));

  // Spalten der aktuellen Liste (sichtbare Felder + ggf. Fortschritt) für Export/Druck.
  const exportKopf = () => spalten.map((f) => f.label)
    .concat(zeigtFortschritt ? ["Prüfungstag", "Fortschritt"] : [])
    .concat(zeigtBelegung ? ["Prüflinge", "Ausschuss"] : []);
  const exportZeile = (r) => spalten.map((f) => formatWert(f, r[f.name]))
    .concat(zeigtFortschritt ? [terminPlain(r), FORTSCHRITT_LABELS[(aktuellePhasen && aktuellePhasen.get(String(r.id))) || "angemeldet"] || ""] : [])
    .concat(zeigtBelegung ? [belegungVon(r).prueflinge, belegungVon(r).ausschuss] : []);

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
      t.rolle ? "Rolle: " + t.rolle : "",
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

function tagesablaufHtml(termin, zugeteilt, prueferZug) {
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const kopf = [
    datum,
    termin.zeit_von ? esc(termin.zeit_von) + (termin.zeit_bis ? "–" + esc(termin.zeit_bis) : "") : "",
    termin.ort ? esc(termin.ort) + (termin.raum ? ", " + esc(termin.raum) : "") : "",
    termin.beruf ? esc(termin.beruf) : "",
  ].filter(Boolean).join(" · ");
  const istGalabau = termin.beruf === "Garten- und Landschaftsbau";

  return `
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
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

function tagesablaufDrucken(termin, zugeteilt, prueferZug) {
  druckbereich().innerHTML = tagesablaufHtml(termin, zugeteilt, prueferZug);
  window.print();
}

/* ----------------------------------------- Stationen-Rotation (Ablaufplan) */

/** Anzeigename eines zugeteilten Prüflings. */
function plName(z) { return ((z.nachname || "") + (z.vorname ? ", " + z.vorname : "")) || "Prüfling"; }

/** Map prueferId -> Anzeigename aus der Ausschussliste eines Termins. */
function prueferNameMap(prueferZug) {
  return new Map((prueferZug || []).map((p) => [p.id, (p.nachname || "") + (p.vorname ? ", " + p.vorname : "")]));
}

/** Besetzungs-Text einer Station: Namen, sonst Bedarf bzw. RP-Eigenregie. */
function stationBesetzung(station, prueferName) {
  if (station.eigenregie) return "RP-Eigenregie";
  const ids = station.prueferIds || [];
  if (ids.length) return ids.map((id) => (prueferName && prueferName.get(id)) || "#" + id).join(", ");
  const b = station.prueferBedarf || 0;
  return b ? b + " Prüfer:in" + (b > 1 ? "nen" : "") + " (offen)" : "—";
}

/** Zeitfenster einer Laufzettel-Station: Prüfung + (optional) Bewertung. */
function stationsZeitfenster(e) {
  const s = e.station;
  const pruefBis = e.vonMin + s.pruefMin;
  const txt = `${minZuZeit(e.vonMin)}–${minZuZeit(pruefBis)} Prüfung`;
  return s.bewertungMin > 0 ? `${txt} · ${minZuZeit(pruefBis)}–${minZuZeit(e.bisMin)} Bewertung` : txt;
}

/** Mittagspause eines Termins laden (je Termin gespeichert; Fallback: alt-global). */
async function pauseLaden(pruefungId) {
  const nach = Number(await store.getEinstellung(`ablauf_pause_nach:${pruefungId}`, await store.getEinstellung("ablauf_pause_nach", 0))) || 0;
  const min = Number(await store.getEinstellung(`ablauf_pause_min:${pruefungId}`, await store.getEinstellung("ablauf_pause_min", 0))) || 0;
  return { nachRunde: nach, min };
}
/** Mittagspause eines Termins speichern (je Termin). */
async function pauseSpeichern(pruefungId, nach, min) {
  await store.setEinstellung(`ablauf_pause_nach:${pruefungId}`, String(nach));
  await store.setEinstellung(`ablauf_pause_min:${pruefungId}`, String(min));
}

/** Rotations-Plan für einen Termin aus den (gespeicherten) Stationen. */
function ablaufplanFuer(termin, zugeteilt, stationen, pause) {
  const st = stationen && stationen.length ? stationen : STATIONEN_GALABAU;
  return rotationsplan(st, zugeteilt, {
    startMin: zeitZuMin(termin.zeit_von),
    pauseNachRunde: (pause && pause.nachRunde) || 0,
    pauseMin: (pause && pause.min) || 0,
  });
}

/**
 * Bindet den Stationen-Editor (eine Disclosure im Cockpit): Zeilen mit Name,
 * Dauer, Prüferbedarf, Eigenregie; hinzufügen/entfernen, Standardvorlage
 * einsetzen, speichern. Nach dem Speichern lädt das Cockpit neu (Plan
 * aktualisiert sich). @param neuLaden Callback zum Neuzeichnen.
 */
function stationenEditorBinden(pruefungId, start, neuLaden) {
  const wrap = document.getElementById("stationen-editor");
  if (!wrap) return;
  let arbeit = (start && start.length ? start : STATIONEN_GALABAU).map((s) => ({ ...s }));

  function zeichne() {
    const summe = arbeit.reduce((n, s) => n + (s.eigenregie ? 0 : Math.min(3, Math.max(0, Math.round(Number(s.prueferBedarf) || 0)))), 0);
    wrap.innerHTML = `
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Station (Aufgabe)</th><th style="width:7rem">Dauer&nbsp;Min</th><th style="width:7rem">Prüfer 0–3</th><th style="width:6rem">RP-eigen</th><th><span class="bw-skip-link">Aktion</span></th></tr></thead>
          <tbody>${arbeit.map((s, i) => `
            <tr>
              <td><input type="text" class="bw-input" data-f="name" data-i="${i}" value="${esc(s.name)}" aria-label="Stationsname"></td>
              <td><input type="number" min="1" step="5" class="bw-input" data-f="dauerMin" data-i="${i}" value="${Number(s.dauerMin) || 60}" aria-label="Dauer in Minuten"></td>
              <td><input type="number" min="0" max="3" class="bw-input" data-f="prueferBedarf" data-i="${i}" value="${s.eigenregie ? 0 : (Number(s.prueferBedarf) || 0)}"${s.eigenregie ? " disabled" : ""} aria-label="Prüferbedarf"></td>
              <td style="text-align:center"><input type="checkbox" data-f="eigenregie" data-i="${i}"${s.eigenregie ? " checked" : ""} aria-label="In Eigenregie des RP (ohne Ausschuss-Prüfer)"></td>
              <td><button type="button" class="bw-iconbtn" data-del="${i}" aria-label="Station entfernen">${icon("muell")}</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="bw-klein bw-leise">${zahl(arbeit.length)} Stationen · ${zahl(summe)} Prüfer:innen gleichzeitig nötig. „RP-eigen" = vom RP betreut, ohne Ausschuss-Prüfer (z. B. Pflanzenerkennung).</p>
      <div class="bw-toolbar" style="margin:0">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="st-add">Station hinzufügen</button>
        <button type="button" class="bw-btn bw-btn--sekundaer" id="st-standard">Standard-Stationen einsetzen</button>
        <button type="button" class="bw-btn bw-btn--gelb" id="st-save">Stationen speichern</button>
      </div>`;

    wrap.querySelectorAll("input[data-f]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i), f = inp.dataset.f;
        if (f === "eigenregie") { arbeit[i].eigenregie = inp.checked; if (inp.checked) { arbeit[i].prueferBedarf = 0; arbeit[i].bewertungMin = 0; } zeichne(); return; }
        arbeit[i][f] = f === "name" ? inp.value : Number(inp.value);
      });
    });
    wrap.querySelectorAll("button[data-del]").forEach((b) => b.addEventListener("click", () => { arbeit.splice(Number(b.dataset.del), 1); zeichne(); }));
    document.getElementById("st-add").addEventListener("click", () => { arbeit.push({ name: "Neue Station", dauerMin: 60, bewertungMin: 10, prueferBedarf: 1, eigenregie: false }); zeichne(); });
    document.getElementById("st-standard").addEventListener("click", () => { arbeit = STATIONEN_GALABAU.map((s) => ({ ...s })); zeichne(); meldung("Standard-Stationen eingesetzt — noch speichern."); });
    document.getElementById("st-save").addEventListener("click", async () => {
      const gueltig = arbeit.filter((s) => String(s.name || "").trim());
      if (!gueltig.length) { meldung("Mindestens eine Station mit Namen angeben.", "fehler"); return; }
      try {
        await store.stationenSetzen(pruefungId, arbeit);
        meldung(`Stationen gespeichert: ${zahl(gueltig.length)}.`);
        neuLaden();
      } catch (e) { console.error(e); meldung("Speichern fehlgeschlagen: " + e.message, "fehler"); }
    });
  }
  zeichne();
}

/**
 * Bindet den „Prüfer:innen an Stationen verteilen"-Editor: je betreuter Station
 * Auswahl-Kästchen der zugeteilten Ausschussmitglieder. Speichert die Namen je
 * Station (über stationenSetzen, Stationsdaten bleiben erhalten).
 */
function stationPrueferEditorBinden(pruefungId, stationen, prueferZug, neuLaden) {
  const wrap = document.getElementById("station-pruefer-editor");
  if (!wrap) return;
  const basis = (stationen && stationen.length ? stationen : STATIONEN_GALABAU)
    .map((s) => ({ ...s, prueferIds: (s.prueferIds || []).slice() }));

  wrap.innerHTML = `
    ${basis.map((s, i) => s.eigenregie
      ? `<div class="bw-card" style="margin-top:var(--bw-space-1)"><strong>${esc(s.name)}</strong> <span class="bw-klein bw-leise">— RP-Eigenregie, kein Ausschuss-Prüfer</span></div>`
      : `<fieldset class="bw-card" style="margin-top:var(--bw-space-1)">
          <legend><strong>${esc(s.name)}</strong> <span class="bw-klein bw-leise">(Bedarf ${zahl(s.prueferBedarf || 0)})</span></legend>
          <div class="bw-toolbar" style="margin:0;gap:var(--bw-space-2)">
            ${prueferZug.map((p) => `<label class="bw-klein" style="display:inline-flex;align-items:center;gap:.4em;flex:0 0 auto">
              <input type="checkbox" data-st="${i}" value="${p.id}" style="width:auto"${(s.prueferIds || []).includes(p.id) ? " checked" : ""}>
              ${esc((p.nachname || "") + (p.vorname ? ", " + p.vorname : ""))}${p.rolle ? ` <span class="bw-leise">(${esc(p.rolle)})</span>` : ""}
            </label>`).join("")}
          </div>
        </fieldset>`).join("")}
    <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
      <button type="button" class="bw-btn bw-btn--gelb" id="sp-save">Zuordnung speichern</button>
    </div>`;

  document.getElementById("sp-save").addEventListener("click", async () => {
    basis.forEach((s, i) => {
      if (s.eigenregie) return;
      s.prueferIds = Array.from(wrap.querySelectorAll(`input[data-st="${i}"]:checked`)).map((c) => Number(c.value));
    });
    try {
      await store.stationenSetzen(pruefungId, basis);
      meldung("Prüfer-Zuordnung gespeichert.");
      neuLaden();
    } catch (e) { console.error(e); meldung("Speichern fehlgeschlagen: " + e.message, "fehler"); }
  });
}

/** Kennzahlen-Zeile (Pills) zum Plan — für das Cockpit. */
function ablaufKennzahlenHtml(plan) {
  if (!plan.gruppen.length) return "";
  return `<div class="bw-bereitschaft" style="margin-top:var(--bw-space-2)">
    <span>${zahl(plan.m)} Stationen</span>
    <span>${zahl(plan.gruppen.length)} ${plan.gruppen.length === 1 ? "Gruppe" : "Gruppen"} à max. ${zahl(plan.m)}</span>
    <span>${zahl(plan.prueferProRunde)} Prüfer:innen gleichzeitig</span>
    <span>${minZuZeit(plan.startMin)}–${minZuZeit(plan.endeMin)} Uhr</span>
    ${plan.pauseNachRunde && plan.gruppen[0].pause ? `<span>Mittagspause ${minZuZeit(plan.gruppen[0].pause.vonMin)}–${minZuZeit(plan.gruppen[0].pause.bisMin)}</span>` : ""}
    <span>0 Min Wartezeit</span>
  </div>`;
}

/** Stationsraster einer Gruppe: Zeilen = Runden (Uhrzeit), Spalten = Stationen. */
function gruppenRasterHtml(plan, gruppe, zugeteilt, prueferName) {
  const kopf = plan.stationen.map((s) => `<th>${esc(s.name)}<br><span class="bw-klein bw-leise">${esc(stationBesetzung(s, prueferName))}</span></th>`).join("");
  const pauseZeile = gruppe.pause
    ? `<tr><th scope="row">${minZuZeit(gruppe.pause.vonMin)}–${minZuZeit(gruppe.pause.bisMin)}</th><td colspan="${plan.stationen.length}" class="bw-leise" style="text-align:center">Mittagspause</td></tr>`
    : "";
  const zeilen = gruppe.runden.map((r) => {
    const zellen = r.zellen.map((z) => `<td>${z.prueflingIdx == null ? "—" : esc(plName(zugeteilt[z.prueflingIdx]))}</td>`).join("");
    const row = `<tr><th scope="row">${minZuZeit(r.vonMin)}–${minZuZeit(r.bisMin)}</th>${zellen}</tr>`;
    return (gruppe.pause && gruppe.pause.nachRunde === r.nr) ? row + pauseZeile : row;
  }).join("");
  return `<table class="bw-table">
    <thead><tr><th>Uhrzeit</th>${kopf}</tr></thead>
    <tbody>${zeilen}</tbody>
  </table>`;
}

/** Inneres HTML des Stationsplans (alle Gruppen als Raster). */
function stationsplanHtml(termin, plan, zugeteilt, prueferName) {
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const gruppen = plan.gruppen.map((g) => `
    <section style="break-inside:avoid;margin-top:var(--bw-space-3)">
      <h2>Gruppe ${zahl(g.nr)} <span class="bw-klein bw-leise">(${zahl(g.anzahl)} Prüflinge, ab ${minZuZeit(g.startMin)} Uhr)</span></h2>
      ${gruppenRasterHtml(plan, g, zugeteilt, prueferName)}
    </section>`).join("");
  return `
    <h1>Ablaufplan (Stationen) — ${esc(termin.titel || "Prüfungstag")}</h1>
    <p>${esc(datum)}${termin.ort ? " · " + esc(termin.ort) : ""} · ${zahl(plan.anzahl)} Prüflinge · ${zahl(plan.m)} Stationen · ${zahl(plan.prueferProRunde)} Prüfer:innen gleichzeitig · ${minZuZeit(plan.startMin)}–${minZuZeit(plan.endeMin)} Uhr</p>
    <p class="bw-klein bw-leise">Karussell-Rotation: jeder Prüfling durchläuft jede Station genau einmal, ohne Leerlauf. Station je 60 Min (50 Prüfung + 10 Bewertung); Pflanzenerkennung 20 Min in Eigenregie des RP.</p>
    ${gruppen}
    <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-3)">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

/** Druckbarer Stationsplan (alle Gruppen als Raster). */
function stationsplanDrucken(termin, zugeteilt, stationen, prueferZug, pause) {
  const plan = ablaufplanFuer(termin, zugeteilt, stationen, pause);
  if (!plan.gruppen.length) { meldung("Keine Prüflinge zugeteilt.", "fehler"); return; }
  druckbereich().innerHTML = stationsplanHtml(termin, plan, zugeteilt, prueferNameMap(prueferZug));
  window.print();
}

/** Inneres HTML der persönlichen Laufzettel (eine Karte je Prüfling). */
function laufzettelHtml(termin, plan, zugeteilt, prueferName) {
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const karten = zugeteilt.map((z, i) => {
    const eintraege = plan.laufzettel[i] || [];
    const gruppeNr = Math.floor(i / plan.m) + 1;
    const gPause = (plan.gruppen[gruppeNr - 1] || {}).pause;
    const pauseZeile = gPause
      ? `<tr><td>${minZuZeit(gPause.vonMin)}–${minZuZeit(gPause.bisMin)}</td><td colspan="3" class="bw-leise">Mittagspause</td></tr>`
      : "";
    const zeilen = eintraege.map((e) => {
      const row = `<tr>
      <td>${minZuZeit(e.vonMin)}–${minZuZeit(e.bisMin)}</td>
      <td>${esc(e.station.name)}</td>
      <td class="bw-klein">${esc(stationBesetzung(e.station, prueferName))}</td>
      <td class="bw-klein">${stationsZeitfenster(e)}</td>
    </tr>`;
      return (gPause && plan.pauseNachRunde === e.rundeNr) ? row + pauseZeile : row;
    }).join("");
    return `<section style="break-inside:avoid;page-break-after:always;margin-top:var(--bw-space-3)">
      <h2>Laufzettel — ${esc(plName(z))}</h2>
      <p class="bw-klein">${esc(termin.titel || "Prüfungstag")} · ${esc(datum)}${termin.ort ? " · " + esc(termin.ort) : ""} · Gruppe ${zahl(gruppeNr)}</p>
      <table class="bw-table">
        <thead><tr><th>Uhrzeit</th><th>Station</th><th>Prüfer:in</th><th>Ablauf</th></tr></thead>
        <tbody>${zeilen || '<tr><td colspan="4">—</td></tr>'}</tbody>
      </table>
    </section>`;
  }).join("");
  return `
    <h1>Laufzettel — ${esc(termin.titel || "Prüfungstag")}</h1>
    <p class="bw-klein bw-leise">Je Prüfling eine Seite: wann an welcher Station. ${zahl(plan.anzahl)} Prüflinge.</p>
    ${karten}`;
}

/** Druckbare persönliche Laufzettel (eine Karte je Prüfling). */
function laufzettelDrucken(termin, zugeteilt, stationen, prueferZug, pause) {
  const plan = ablaufplanFuer(termin, zugeteilt, stationen, pause);
  if (!plan.gruppen.length) { meldung("Keine Prüflinge zugeteilt.", "fehler"); return; }
  druckbereich().innerHTML = laufzettelHtml(termin, plan, zugeteilt, prueferNameMap(prueferZug));
  window.print();
}

/** Inneres HTML der Stationskarten je Station (für die Prüfer:innen). */
function stationskartenHtml(termin, plan, zugeteilt, prueferName) {
  const belegung = stationsBelegung(plan);
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const karten = plan.stationen.map((s, sIdx) => {
    const folge = belegung[sIdx] || [];
    const zeilen = folge.map((b) => `<tr>
      <td>${minZuZeit(b.vonMin)}–${minZuZeit(b.bisMin)}</td>
      <td>${esc(plName(zugeteilt[b.prueflingIdx]))}</td>
      <td>${esc((zugeteilt[b.prueflingIdx] || {}).betrieb || "")}</td>
      <td style="min-width:7rem">&nbsp;</td>
    </tr>`).join("");
    return `<section style="break-inside:avoid;page-break-after:always;margin-top:var(--bw-space-3)">
      <h2>Station: ${esc(s.name)}</h2>
      <p class="bw-klein">${esc(termin.titel || "Prüfungstag")} · ${esc(datum)}${termin.ort ? " · " + esc(termin.ort) : ""}</p>
      <p>Prüfer:innen: ${esc(stationBesetzung(s, prueferName))}${s.bewertungMin > 0 ? ` · je Prüfling ${zahl(s.pruefMin)} Min Prüfung + ${zahl(s.bewertungMin)} Min Bewertung` : ` · ${zahl(s.dauerMin)} Min`}</p>
      <table class="bw-table">
        <thead><tr><th>Uhrzeit</th><th>Prüfling</th><th>Ausbildungsbetrieb</th><th>Bewertung/Notiz</th></tr></thead>
        <tbody>${zeilen || '<tr><td colspan="4">—</td></tr>'}</tbody>
      </table>
    </section>`;
  }).join("");
  return `
    <h1>Stationskarten — ${esc(termin.titel || "Prüfungstag")}</h1>
    <p class="bw-klein bw-leise">Je Station eine Seite: welche Prüflinge in welcher Reihenfolge kommen. ${zahl(plan.m)} Stationen.</p>
    ${karten}`;
}

/** Druckbare Stationskarten je Station (für die Prüfer:innen): wer kommt wann. */
function stationskartenDrucken(termin, zugeteilt, stationen, prueferZug, pause) {
  const plan = ablaufplanFuer(termin, zugeteilt, stationen, pause);
  if (!plan.gruppen.length) { meldung("Keine Prüflinge zugeteilt.", "fehler"); return; }
  druckbereich().innerHTML = stationskartenHtml(termin, plan, zugeteilt, prueferNameMap(prueferZug));
  window.print();
}

/** Druckbare Anwesenheitsliste (Unterschriftenspalte) je Prüfungstag. */
function anwesenheitDrucken(termin, zugeteilt) {
  if (!zugeteilt.length) { meldung("Keine Prüflinge zugeteilt.", "fehler"); return; }
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const kopf = [datum, termin.ort ? esc(termin.ort) + (termin.raum ? ", " + esc(termin.raum) : "") : "", termin.beruf ? esc(termin.beruf) : ""]
    .filter(Boolean).join(" · ");
  druckbereich().innerHTML = `
    <h1>Anwesenheitsliste — ${esc(termin.titel)}</h1>
    <p>${kopf}</p>
    <p class="bw-klein">Praktische Abschlussprüfung Gärtner/in · ${zahl(zugeteilt.length)} Prüflinge</p>
    <table class="bw-table">
      <thead><tr><th>Uhrzeit</th><th>Name</th><th>Ausbildungsbetrieb</th><th>Unterschrift</th></tr></thead>
      <tbody>${zugeteilt.map((z) => `
        <tr>
          <td>${esc(z.slot || "—")}</td>
          <td>${esc((z.nachname || "") + ", " + (z.vorname || ""))}</td>
          <td>${esc(z.betrieb || "")}</td>
          <td style="min-width:9rem">&nbsp;</td>
        </tr>`).join("")}</tbody>
    </table>
    <p>Ort, Datum: ${esc(termin.ort || "")}${termin.ort ? ", " : ""}den ${esc(datum)}</p>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
  window.print();
}

/** Inneres HTML der Ergebnis-Niederschrift je Termin (Prüflinge mit Note). */
function niederschriftHtml(termin, ergebnisse, prueferZug) {
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const kopf = [
    datum,
    termin.ort ? esc(termin.ort) + (termin.raum ? ", " + esc(termin.raum) : "") : "",
    termin.beruf ? esc(termin.beruf) : "",
  ].filter(Boolean).join(" · ");
  const bestanden = ergebnisse.filter((r) => r.bestanden === true).length;
  const bewertet = ergebnisse.filter((r) => r.gesamt != null).length;
  // Begründung des Nichtbestehens je betroffenem Prüfling (aus den Bereichsnoten
  // abgeleitet, identisch zur Bewerten-Vorschau) — amtlich für das Protokoll.
  const nichtBestanden = ergebnisse
    .filter((r) => r.bestanden === false)
    .map((r) => ({ r, gruende: store.bewertungGruende(r) }))
    .filter((x) => x.gruende.length);
  const begruendung = nichtBestanden.length ? `
    <h2>Begründung Nichtbestehen</h2>
    <table class="bw-table">
      <thead><tr><th>Name</th><th>Grund</th></tr></thead>
      <tbody>${nichtBestanden.map((x) => `
        <tr><td>${esc((x.r.nachname || "") + ", " + (x.r.vorname || ""))}</td><td>${x.gruende.map(esc).join("; ")}</td></tr>`).join("")}</tbody>
    </table>` : "";
  // Bemerkungen des Ausschusses je Prüfling (sofern erfasst) — fürs Protokoll.
  const mitBemerkung = ergebnisse.filter((r) => r.bemerkung && String(r.bemerkung).trim());
  const bemerkungen = mitBemerkung.length ? `
    <h2>Bemerkungen des Ausschusses</h2>
    <table class="bw-table">
      <thead><tr><th>Name</th><th>Bemerkung</th></tr></thead>
      <tbody>${mitBemerkung.map((r) => `
        <tr><td>${esc((r.nachname || "") + ", " + (r.vorname || ""))}</td><td>${esc(r.bemerkung)}</td></tr>`).join("")}</tbody>
    </table>` : "";

  return `
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
    ${begruendung}
    ${bemerkungen}

    <h2>Prüfungsausschuss</h2>
    <table class="bw-table">
      <thead><tr><th>Rolle</th><th>Name</th><th>Unterschrift</th></tr></thead>
      <tbody>${(prueferZug.length ? prueferZug : [{}, {}, {}]).map((p) => `
        <tr><td>${esc(p.rolle || "—")}</td><td>${esc(((p.nachname || "") + (p.vorname ? ", " + p.vorname : "")) || "—")}</td><td style="min-width:8rem"> </td></tr>`).join("")}</tbody>
    </table>
    <p>Ort, Datum: ${esc(termin.ort || "")}${termin.ort ? ", " : ""}den ${esc(datum)}</p>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

function niederschriftDrucken(termin, ergebnisse, prueferZug) {
  druckbereich().innerHTML = niederschriftHtml(termin, ergebnisse, prueferZug);
  window.print();
}

/**
 * Leerer Sammelbewertungsbogen je Prüfling zum handschriftlichen Ausfüllen am
 * Prüfungstag (5 praktische + 4 Kenntnisbereiche, Notenspalte leer). Verbindet
 * Planung (Name, Betrieb, Slot) mit der späteren Noteneingabe.
 */
function bewertungsbogenHtml(termin, p) {
  const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE") : "—";
  const leer = '<td style="text-align:right;min-width:5rem">&nbsp;</td>';
  const zeile = (label) => `<tr><td>${esc(label)}</td>${leer}</tr>`;
  return `
    <h1>Bewertungsbogen — praktische Abschlussprüfung</h1>
    <p>Gärtner/in${termin.beruf ? " — Fachrichtung " + esc(termin.beruf) : ""}</p>
    <table class="bw-table bw-zeugnis"><tbody>
      <tr><th scope="row">Name</th><td>${esc((p.vorname || "") + " " + (p.nachname || ""))}</td></tr>
      <tr><th scope="row">Ausbildungsbetrieb</th><td>${esc(p.betrieb || "—")}</td></tr>
      <tr><th scope="row">Prüfungstag</th><td>${esc(datum)}${p.slot ? " · " + esc(p.slot) + " Uhr" : ""}${termin.ort ? " · " + esc(termin.ort) : ""}</td></tr>
    </tbody></table>

    <h2>Praktische Prüfung</h2>
    <table class="bw-table"><thead><tr><th>Bereich</th><th style="text-align:right">Note</th></tr></thead><tbody>
      ${GALABAU_BEREICHE.praxis.map((b, i) => zeile(roem(i + 1) + ". " + b)).join("")}
      <tr><th scope="row">Praxis-Schnitt</th>${leer}</tr>
    </tbody></table>

    <h2>Kenntnisprüfung</h2>
    <table class="bw-table"><thead><tr><th>Bereich</th><th style="text-align:right">Note</th></tr></thead><tbody>
      ${GALABAU_BEREICHE.kenntnis.map((b) => zeile(b)).join("")}
      <tr><th scope="row">Kenntnis-Schnitt</th>${leer}</tr>
    </tbody></table>

    <table class="bw-table bw-zeugnis"><tbody>
      <tr><th scope="row">Gesamtnote</th>${leer}</tr>
      <tr><th scope="row">Ergebnis</th><td>&nbsp;</td></tr>
    </tbody></table>
    <div class="bw-druck__unterschriften">
      <span>Vorsitz des Prüfungsausschusses</span>
      <span>Beisitz</span>
    </div>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

/** Druckt je zugeteiltem Prüfling einen leeren Bewertungsbogen (eine Seite). */
function bewertungsboegenDrucken(termin, zugeteilt) {
  if (!zugeteilt.length) { meldung("Keine Prüflinge zugeteilt.", "fehler"); return; }
  druckbereich().innerHTML = zugeteilt
    .map((p) => `<section class="bw-zeugnisblatt">${bewertungsbogenHtml(termin, p)}</section>`).join("");
  window.print();
}

/**
 * Komplette Prüfungstag-Mappe in einem Druck: Tagesablauf, je Prüfling ein
 * leerer Bewertungsbogen und die Ergebnis-Niederschrift — eine Aktion für die
 * gesamte Durchführung (je Abschnitt eine Seite).
 */
/** Deckblatt der Tagesmappe: Eckdaten, Kennzahlen, Ausschuss, Inhaltsverzeichnis. */
function mappeDeckblattHtml(termin, plan, zugeteilt, prueferZug) {
  const datum = termin.datum
    ? new Date(termin.datum).toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "—";
  const p0 = plan.gruppen[0] && plan.gruppen[0].pause;
  const eck = (label, wert) => `<tr><th scope="row">${esc(label)}</th><td>${wert}</td></tr>`;
  const inhalt = [
    "Stationsplan (Gesamtraster)",
    "Laufzettel je Prüfling",
    "Stationskarten je Prüfer:in",
    "Bewertungsbögen",
    "Ergebnis-Niederschrift",
  ];
  return `
    <p class="bw-klein bw-leise">Regierungspräsidium Freiburg · Ausbildungsberatung</p>
    <h1>Prüfungstag-Mappe — ${esc(termin.titel || "Prüfungstag")}</h1>
    <table class="bw-table bw-zeugnis"><tbody>
      ${eck("Datum", esc(datum))}
      ${eck("Ort", esc(termin.ort || "—") + (termin.raum ? ", " + esc(termin.raum) : ""))}
      ${eck("Fachrichtung", esc(termin.beruf || "—"))}
      ${plan.gruppen.length ? eck("Zeitrahmen", minZuZeit(plan.startMin) + "–" + minZuZeit(plan.endeMin) + " Uhr") : ""}
      ${p0 ? eck("Mittagspause", minZuZeit(p0.vonMin) + "–" + minZuZeit(p0.bisMin) + " Uhr") : ""}
      ${eck("Prüflinge", zahl(zugeteilt.length))}
      ${plan.gruppen.length ? eck("Stationen", zahl(plan.m) + " · " + zahl(plan.gruppen.length) + " " + (plan.gruppen.length === 1 ? "Gruppe" : "Gruppen")) : ""}
      ${plan.gruppen.length ? eck("Prüfer:innen gleichzeitig", zahl(plan.prueferProRunde)) : ""}
    </tbody></table>
    <h2>Prüfungsausschuss (${zahl(prueferZug.length)})</h2>
    ${prueferZug.length
      ? `<ul>${prueferZug.map((p) => `<li>${esc((p.nachname || "") + (p.vorname ? ", " + p.vorname : ""))}${p.rolle ? " — " + esc(p.rolle) : ""}</li>`).join("")}</ul>`
      : '<p class="bw-leise">Noch kein Ausschuss zugeteilt.</p>'}
    <h2>Inhalt dieser Mappe</h2>
    <ol>${inhalt.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

async function mappeDrucken(termin, zugeteilt, prueferZug, stationen, pause) {
  if (!zugeteilt.length) { meldung("Keine Prüflinge zugeteilt.", "fehler"); return; }
  const ergebnisse = await store.terminErgebnisse(termin.id);
  const plan = ablaufplanFuer(termin, zugeteilt, stationen, pause);
  const prueferName = prueferNameMap(prueferZug);
  const blatt = (html) => `<section class="bw-zeugnisblatt">${html}</section>`;
  // Komplette Tagesmappe in Ablaufreihenfolge: Deckblatt → Stationsplan →
  // Laufzettel (Prüflinge) → Stationskarten (Prüfer:innen) → Bewertungsbögen →
  // Niederschrift. Nutzt dieselben Bausteine wie die Einzeldrucke.
  druckbereich().innerHTML =
    blatt(mappeDeckblattHtml(termin, plan, zugeteilt, prueferZug)) +
    (plan.gruppen.length ? blatt(stationsplanHtml(termin, plan, zugeteilt, prueferName)) : "") +
    (plan.gruppen.length ? blatt(laufzettelHtml(termin, plan, zugeteilt, prueferName)) : "") +
    (plan.gruppen.length ? blatt(stationskartenHtml(termin, plan, zugeteilt, prueferName)) : "") +
    zugeteilt.map((p) => blatt(bewertungsbogenHtml(termin, p))).join("") +
    blatt(niederschriftHtml(termin, ergebnisse, prueferZug));
  window.print();
}

/* --------------------------------------------------------- Prüfungstag-Cockpit
   Tag-zentriertes Dashboard: ein Termin gewählt → Status, Bulk-Dokumente und
   Schnellzugriff (Noten/Zeugnisse/Planung) an einem Ort. Verwendet die
   vorhandenen Druck-/Status-Funktionen wieder (keine Logik-Duplikate). */
async function renderPruefungstag(pruefungId = null) {
  if (pruefungId == null) { const tp = routeParams().termin; if (tp) pruefungId = Number(tp); }
  const termine = await store.liste("pruefungen");
  if (!termine.length) {
    appEl().innerHTML = `<h1>Prüfungstag</h1>
      <p class="bw-hinweis">Noch keine Prüfungstermine. Erst unter <a href="#/pruefungen">Prüfungstermine</a> anlegen oder über die <a href="#/">Übersicht</a> „Automatische Prüfungsplanung" starten.</p>`;
    return;
  }
  if (pruefungId == null) pruefungId = termine[0].id;

  appEl().innerHTML = `
    <h1>Prüfungstag</h1>
    <p class="bw-unterzeile">Alles für den Prüfungstag an einem Ort — Vorbereitung, Durchführung, Abschluss.</p>
    <div class="bw-toolbar">
      <div class="bw-field" style="max-width:36rem;flex:1 1 22rem;margin:0">
        <label for="tag-termin">Prüfungstermin</label>
        <select id="tag-termin">
          ${termine.map((t) => `<option value="${t.id}"${String(t.id) === String(pruefungId) ? " selected" : ""}>${esc(terminLabel(t))}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="tag-inhalt" aria-live="polite"></div>`;

  const wahl = document.getElementById("tag-termin");

  async function tagZeichnen() {
    const id = Number(wahl.value);
    const termin = termine.find((t) => t.id === id) || {};
    const zugeteilt = await store.zuteilungenFuer(id);
    const prueferZug = await store.prueferFuer(id);
    const ergebnisse = await store.terminErgebnisse(id);

    const datum = termin.datum ? new Date(termin.datum).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "ohne Datum";
    const istHeute = termin.datum && new Date(termin.datum).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
    const mitSlot = zugeteilt.filter((z) => z.slot).length;
    const zugesagt = prueferZug.filter((p) => (p.status || "offen") === "zugesagt").length;
    const offenZ = prueferZug.filter((p) => ["offen", "angefragt"].includes(p.status || "offen")).length;
    const bewertet = ergebnisse.filter((r) => r.gesamt != null).length;
    const bestanden = ergebnisse.filter((r) => r.bestanden === true).length;
    const hatPl = zugeteilt.length > 0;
    const pill = bereitschaftPunkt;
    const stationen = await store.stationenFuer(id);
    const stationenGespeichert = stationen.length > 0;
    const pause = await pauseLaden(id);
    const tagPlan = ablaufplanFuer(termin, zugeteilt, stationen, pause);
    // „Übernommen" = Startzeiten der Prüflinge entsprechen den Gruppenstarts des
    // aktuellen Ablaufplans (ein Zeitmodell, kein altes Raster mehr).
    const tagUebernommen = tagPlan.m > 0 && zugeteilt.length > 0 && zugeteilt.every((z, i) => {
      const g = tagPlan.gruppen[Math.floor(i / tagPlan.m)];
      return g && z.slot === minZuZeit(g.startMin);
    });
    const prueferName = prueferNameMap(prueferZug);

    document.getElementById("tag-inhalt").innerHTML = `
      <div class="bw-card" style="margin-bottom:var(--bw-space-3)">
        <strong style="font-size:var(--bw-fs-h3)">${esc(termin.titel || "Termin")}</strong>
        ${istHeute ? ' <span class="bw-tag bw-tag--ok">Heute</span>' : ""}
        <div class="bw-klein bw-leise" style="margin-top:var(--bw-space-1)">
          ${esc(datum)}${termin.zeit_von ? " · ab " + esc(termin.zeit_von) + " Uhr" : ""}${termin.ort ? " · " + esc(termin.ort) : ""}${termin.raum ? ", " + esc(termin.raum) : ""}${termin.beruf ? " · " + esc(termin.beruf) : ""}
        </div>
        ${hatPl ? `<div class="bw-bereitschaft" style="margin-top:var(--bw-space-2)">
          <span>${pill(prueferZug.length >= 3)} Ausschuss ${zahl(prueferZug.length)}/3</span>
          <span>${pill(prueferZug.length > 0 && offenZ === 0)} Zusagen ${offenZ ? zahl(offenZ) + " offen" : "ok"}</span>
          <span>${pill(mitSlot === zugeteilt.length)} Uhrzeiten ${zahl(mitSlot)}/${zahl(zugeteilt.length)}</span>
          <span>${pill(bewertet === zugeteilt.length)} Bewertet ${zahl(bewertet)}/${zahl(zugeteilt.length)}${bewertet ? " · " + zahl(bestanden) + " bestanden" : ""}</span>
        </div>` : '<p class="bw-hinweis" style="margin-top:var(--bw-space-2)">Noch keine Prüflinge zugeteilt — in der <a href="#/planung?termin=' + id + '">Tagesplanung</a> zuteilen.</p>'}
      </div>

      <div class="bw-flaechen">
        <section class="bw-card" aria-labelledby="tag-dok">
          <h2 id="tag-dok" style="margin-top:0">Dokumente für den Tag</h2>
          <div class="bw-toolbar" style="margin:0">
            <button class="bw-btn bw-btn--gelb" type="button" id="tag-mappe" ${hatPl ? "" : "disabled title=\"Keine Prüflinge zugeteilt\""}>Prüfungstag-Mappe drucken</button>
            <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-ablauf" ${hatPl || prueferZug.length ? "" : "disabled"}>Tagesablauf</button>
            <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-anwesenheit" ${hatPl ? "" : "disabled"}>Anwesenheitsliste</button>
            <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-boegen" ${hatPl ? "" : "disabled"}>Bewertungsbögen</button>
            <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-niederschrift" ${hatPl ? "" : "disabled"}>Ergebnis-Niederschrift</button>
            <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-zeugnisse" ${bewertet ? "" : "disabled title=\"Erst bewerten\""}>Zeugnisse/Mitteilungen (Serie)</button>
            <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-ics" ${termin.datum ? "" : "disabled title=\"Termin ohne Datum\""}>Termin als .ics</button>
          </div>
        </section>

        <section class="bw-card" aria-labelledby="tag-weiter">
          <h2 id="tag-weiter" style="margin-top:0">Weiter zu</h2>
          <div class="bw-toolbar" style="margin:0">
            <a class="bw-btn bw-btn--sekundaer" href="#/noten?termin=${id}">Noten erfassen</a>
            <a class="bw-btn bw-btn--sekundaer" href="#/zeugnisse?termin=${id}">Zeugnisse</a>
            <a class="bw-btn bw-btn--sekundaer" href="#/planung?termin=${id}">In der Planung bearbeiten</a>
          </div>
          <h3>Ausschuss (${zahl(prueferZug.length)})</h3>
          ${prueferZug.length
            ? `<ul class="bw-klein" style="margin:0;padding-left:1.2em">${prueferZug.map((p) => `<li>${esc((p.nachname || "") + (p.vorname ? ", " + p.vorname : ""))}${p.rolle ? " — " + esc(p.rolle) : ""} ${zusageBadge(p.status)}</li>`).join("")}</ul>`
            : '<p class="bw-leise bw-klein">Noch kein Ausschuss — in der <a href="#/planung?termin=' + id + '">Planung</a> besetzen.</p>'}
        </section>
      </div>

      ${hatPl ? `<section class="bw-card" aria-labelledby="tag-ablaufplan" style="margin-top:var(--bw-space-3)">
        <h2 id="tag-ablaufplan" style="margin-top:0">Ablaufplan (Stationen-Rotation)</h2>
        <p class="bw-klein bw-leise" style="margin-top:0">Jeder Prüfling durchläuft jede Station genau einmal — ohne Wartezeit, mit der kleinstmöglichen Prüferzahl. Station je 60 Min (50 Prüfung + 10 Bewertung); Pflanzenerkennung 20 Min in Eigenregie des RP.</p>
        ${ablaufKennzahlenHtml(tagPlan)}
        <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
          <button class="bw-btn bw-btn--gelb" type="button" id="tag-assistent">Tag automatisch organisieren</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-uebernehmen">Nur Ablaufplan übernehmen</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-laufzettel">Laufzettel drucken (je Prüfling)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-stationskarten">Stationskarten drucken (je Prüfer:in)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="tag-stationsplan">Stationsplan drucken</button>
        </div>
        <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-1)">„Tag automatisch organisieren" sichert die Stationen, verteilt den Ausschuss darauf und übernimmt den Ablaufplan in einem Schritt. „Übernehmen" schreibt nur Startzeit &amp; Reihenfolge auf alle Prüflinge — Anwesenheitsliste, Noten, Niederschrift und Zeugnisse folgen dann diesem Takt.${tagUebernommen ? ' <span class="bw-tag bw-tag--ok">übernommen</span>' : ""}</p>
        <p class="bw-klein${stationenGespeichert ? " bw-leise" : ""}">${stationenGespeichert ? "Stationen für diesen Termin gespeichert." : "Standardvorlage (noch nicht gespeichert) — unten anpassen und speichern."}</p>
        <h3>Gruppe 1${tagPlan.gruppen.length > 1 ? ' <span class="bw-klein bw-leise">(' + zahl(tagPlan.gruppen.length) + " Gruppen gesamt)</span>" : ""}</h3>
        <div class="bw-tablewrap">${gruppenRasterHtml(tagPlan, tagPlan.gruppen[0], zugeteilt, prueferName)}</div>
        <div class="bw-toolbar" style="margin-top:var(--bw-space-2);align-items:flex-end">
          <div class="bw-field" style="margin:0">
            <label for="pause-nach">Mittagspause nach Station</label>
            <input id="pause-nach" type="number" min="0" max="${Math.max(0, tagPlan.m - 1)}" value="${zahl(pause.nachRunde)}" style="width:6rem" aria-label="Mittagspause nach welcher Station (0 = keine)">
          </div>
          <div class="bw-field" style="margin:0">
            <label for="pause-min">Dauer (Min)</label>
            <input id="pause-min" type="number" min="0" step="5" value="${zahl(pause.min)}" style="width:6rem" aria-label="Pausendauer in Minuten">
          </div>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="pause-save">Pause speichern</button>
          <span class="bw-klein bw-leise">0 = keine Pause. Wirkt auf Zeiten in Raster, Laufzettel und Stationsplan.</span>
        </div>
        <details class="bw-disclosure" style="margin-top:var(--bw-space-3)">
          <summary>Stationen bearbeiten</summary>
          <div id="stationen-editor"></div>
        </details>
        ${prueferZug.length ? `<details class="bw-disclosure" style="margin-top:var(--bw-space-2)">
          <summary>Prüfer:innen an Stationen verteilen</summary>
          <div id="station-pruefer-editor"></div>
        </details>` : '<p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">Für die namentliche Stationsbesetzung erst den <a href="#/planung?termin=' + id + '">Ausschuss zuteilen</a>.</p>'}
      </section>` : ""}

      <h2 style="margin-top:var(--bw-space-4)">Prüflinge (${zahl(zugeteilt.length)})</h2>
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Uhrzeit</th><th>Name</th><th>Betrieb</th><th style="text-align:right">Gesamtnote</th><th>Ergebnis</th></tr></thead>
          <tbody>${ergebnisse.length ? ergebnisse.map((r) => `
            <tr>
              <td>${esc(r.slot || "—")}</td>
              <td>${esc((r.nachname || "") + ", " + (r.vorname || ""))}</td>
              <td>${esc(r.betrieb || "")}</td>
              <td style="text-align:right">${formatNote(r.gesamt)}</td>
              <td>${ergebnisBadge(r.bestanden)}</td>
            </tr>`).join("") : '<tr><td colspan="5" class="bw-leise">Noch keine Prüflinge zugeteilt.</td></tr>'}</tbody>
        </table>
      </div>`;

    const an = (idAttr, fn) => document.getElementById(idAttr)?.addEventListener("click", async () => {
      try { await fn(); } catch (e) { console.error(e); meldung("Aktion fehlgeschlagen: " + e.message, "fehler"); }
    });
    an("tag-mappe", () => mappeDrucken(termin, zugeteilt, prueferZug, stationen, pause));
    an("tag-ablauf", () => tagesablaufDrucken(termin, zugeteilt, prueferZug));
    an("tag-laufzettel", () => laufzettelDrucken(termin, zugeteilt, stationen, prueferZug, pause));
    an("tag-stationskarten", () => stationskartenDrucken(termin, zugeteilt, stationen, prueferZug, pause));
    an("tag-stationsplan", () => stationsplanDrucken(termin, zugeteilt, stationen, prueferZug, pause));
    document.getElementById("pause-save")?.addEventListener("click", async () => {
      const nach = Math.max(0, parseInt(document.getElementById("pause-nach").value, 10) || 0);
      const min = Math.max(0, parseInt(document.getElementById("pause-min").value, 10) || 0);
      await pauseSpeichern(id, nach, min);
      meldung(nach && min ? `Mittagspause gesetzt: ${zahl(min)} Min nach Station ${zahl(nach)} (für diesen Termin).` : "Mittagspause entfernt.");
      tagZeichnen();
    });
    // Schreibt Startzeit + Reihenfolge aus dem Ablaufplan (gegebener Stationen) auf alle Prüflinge.
    const taktenSchreiben = async (st) => {
      const plan = ablaufplanFuer(termin, zugeteilt, st);
      const eintraege = [];
      plan.gruppen.forEach((g) => g.mitglieder.forEach((pl, i) => {
        eintraege.push({ prueflingId: pl.id, slot: minZuZeit(g.startMin), reihenfolge: g.von + i + 1 });
      }));
      return store.ablaufZeitenUebernehmen(id, eintraege);
    };
    an("tag-uebernehmen", async () => {
      // Standardvorlage festschreiben, damit der gespeicherte Plan dem Takt entspricht.
      if (!stationenGespeichert) await store.stationenSetzen(id, STATIONEN_GALABAU);
      const n = await taktenSchreiben(await store.stationenFuer(id));
      meldung(`Ablaufplan übernommen: ${zahl(n)} Prüflinge getaktet — Anwesenheit, Noten und Niederschrift folgen jetzt diesem Plan.`);
      tagZeichnen();
    });
    an("tag-assistent", async () => {
      // 1. Stationen sichern (Standardvorlage festschreiben, falls noch keine).
      let aktuell = stationen;
      if (!stationenGespeichert) { await store.stationenSetzen(id, STATIONEN_GALABAU); aktuell = await store.stationenFuer(id); }
      // 2. Ausschuss (nicht abgesagt) auf die betreuten Stationen verteilen.
      const pool = prueferZug.filter((p) => (p.status || "offen") !== "abgesagt").map((p) => p.id);
      const vert = prueferVerteilen(aktuell, pool);
      await store.stationenSetzen(id, vert.stationen);
      // 3. Ablaufplan übernehmen (Startzeit & Reihenfolge), wenn Prüflinge zugeteilt sind.
      const getaktet = zugeteilt.length ? await taktenSchreiben(await store.stationenFuer(id)) : 0;
      meldung(`Tag organisiert: ${zahl(vert.verteilt)}/${zahl(vert.bedarf)} Stationsplätze besetzt${vert.fehlen ? ` (${zahl(vert.fehlen)} offen — mehr Ausschuss zuteilen)` : ""}, ${zahl(getaktet)} Prüflinge getaktet.`);
      tagZeichnen();
    });
    if (hatPl) stationenEditorBinden(id, stationen, tagZeichnen);
    if (hatPl && prueferZug.length) stationPrueferEditorBinden(id, stationen, prueferZug, tagZeichnen);
    an("tag-anwesenheit", () => anwesenheitDrucken(termin, zugeteilt));
    an("tag-boegen", () => bewertungsboegenDrucken(termin, zugeteilt));
    an("tag-niederschrift", () => niederschriftDrucken(termin, ergebnisse, prueferZug));
    an("tag-zeugnisse", () => serienZeugnisDruck(id));
    an("tag-ics", () => { icsDownload("Pruefungstag-" + (termin.titel || "Termin").replace(/[^\wäöüÄÖÜß-]/g, "_") + ".ics", icsBauen([termin])); meldung("Termin als .ics exportiert."); });
  }

  wahl.addEventListener("change", () => renderPruefungstag(Number(wahl.value)));
  await tagZeichnen();
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
          ${termine.map((t) => `<option value="${t.id}"${String(t.id) === String(routeParams().termin) ? " selected" : ""}>${esc(terminLabel(t))}</option>`).join("")}
        </select>
      </div>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="ics-alle">Alle Termine als Kalender (.ics)</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="einladungen-alle">Alle Einladungen drucken</button>
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

  document.getElementById("einladungen-alle").addEventListener("click", async () => {
    try { await einladungenSerienDruck(); }
    catch (e) { console.error(e); meldung("Einladungs-Druck fehlgeschlagen: " + e.message, "fehler"); }
  });

  async function planZeichnen() {
    const id = Number(wahl.value);
    const termin = termine.find((t) => t.id === id);
    const zugeteilt = await store.zuteilungenFuer(id);
    const offen = await store.nichtZugeteilt(id);
    const prueferZug = await store.prueferFuer(id);
    const prueferOff = await store.prueferOffen(id);
    const ROLLEN = (ENTITAETEN.pruefer.felder.find((f) => f.name === "funktion") || {}).optionen || [];

    // Prüfungstag-Status: Readiness aus Ausschuss, Zusagen, Uhrzeiten und Noten.
    const ergebnisse = await store.terminErgebnisse(id);
    const mitSlot = zugeteilt.filter((z) => z.slot).length;
    const zugesagtN = prueferZug.filter((p) => (p.status || "offen") === "zugesagt").length;
    const offenZ = prueferZug.filter((p) => ["offen", "angefragt"].includes(p.status || "offen")).length;
    const bewertetN = ergebnisse.filter((r) => r.gesamt != null).length;
    const pill = (ok) => ok
      ? '<span class="bw-status-do" aria-hidden="true">●</span>'
      : '<span class="bw-leise" aria-hidden="true">○</span>';
    const statusHtml = zugeteilt.length ? `
      <div class="bw-card" style="margin-bottom:var(--bw-space-3)">
        <strong class="bw-klein">Prüfungstag-Status</strong>
        <div class="bw-klein" style="margin-top:var(--bw-space-1);display:flex;flex-wrap:wrap;gap:var(--bw-space-3)">
          <span>${pill(prueferZug.length >= 3)} Ausschuss ${zahl(prueferZug.length)}/3</span>
          <span>${pill(prueferZug.length > 0 && offenZ === 0)} Zusagen: ${zahl(zugesagtN)} zugesagt, ${zahl(offenZ)} offen</span>
          <span>${pill(mitSlot === zugeteilt.length)} Uhrzeiten ${zahl(mitSlot)}/${zahl(zugeteilt.length)}</span>
          <span>${pill(bewertetN === zugeteilt.length)} Bewertet ${zahl(bewertetN)}/${zahl(zugeteilt.length)}</span>
        </div>
      </div>` : "";

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
          <button class="bw-btn bw-btn--gelb" type="button" id="mappe-btn"
                  ${zugeteilt.length ? "" : "disabled title=\"Keine Prüflinge zugeteilt\""}>Prüfungstag-Mappe drucken</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="termin-bearbeiten">Termin bearbeiten</button>
          <details class="bw-disclosure">
            <summary class="bw-btn bw-btn--sekundaer">Einzeldokumente &amp; Export</summary>
            <div class="bw-disclosure__panel">
              <button class="bw-btn bw-btn--sekundaer" type="button" id="drucken-btn"
                      ${zugeteilt.length || prueferZug.length ? "" : "disabled"}>Tagesablauf drucken</button>
              <button class="bw-btn bw-btn--sekundaer" type="button" id="anwesenheit-btn"
                      ${zugeteilt.length ? "" : "disabled title=\"Keine Prüflinge zugeteilt\""}>Anwesenheitsliste drucken</button>
              <button class="bw-btn bw-btn--sekundaer" type="button" id="boegen-btn"
                      ${zugeteilt.length ? "" : "disabled title=\"Keine Prüflinge zugeteilt\""}>Bewertungsbögen drucken</button>
              <button class="bw-btn bw-btn--sekundaer" type="button" id="niederschrift-btn"
                      ${zugeteilt.length ? "" : "disabled title=\"Keine Prüflinge zugeteilt\""}>Ergebnis-Niederschrift</button>
              <button class="bw-btn bw-btn--sekundaer" type="button" id="ics-termin"
                      ${termin.datum ? "" : "disabled title=\"Termin ohne Datum\""}>Termin als .ics</button>
            </div>
          </details>
        </div>
      </div>

      ${statusHtml}

      <h2>Zugeteilte Prüflinge (${zahl(zugeteilt.length)})</h2>
      <div class="bw-toolbar" style="margin-bottom:var(--bw-space-2)"${zugeteilt.length ? "" : " hidden"}>
        <button class="bw-btn bw-btn--gelb" type="button" id="raster-btn">Ablaufplan übernehmen</button>
        <button class="bw-btn bw-btn--sekundaer" type="button" id="raster-loeschen">Uhrzeiten löschen</button>
        <span class="bw-klein bw-leise"> — vergibt Startzeit &amp; Reihenfolge aus dem Stationen-Ablaufplan (Detail-Stationen im <a href="#/pruefungstag?termin=${id}">Cockpit</a>).</span>
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
                        aria-label="Zuteilung von ${esc((z.vorname || "") + " " + (z.nachname || ""))} entfernen" title="Entfernen">${icon("muell")}</button>
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
                        aria-label="Prüfer:in ${esc((p.vorname || "") + " " + (p.nachname || ""))} entfernen" title="Entfernen">${icon("muell")}</button>
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
      try {
        const r = await store.ablaufplanTakten(id);
        meldung(r.getaktet
          ? `Ablaufplan übernommen: ${zahl(r.getaktet)} Prüflinge ab ${r.beginn} Uhr getaktet (${zahl(r.gruppen)} ${r.gruppen === 1 ? "Gruppe" : "Gruppen"}, ${zahl(r.prueferProRunde)} Prüfer:innen gleichzeitig).`
          : "Keine zugeteilten Prüflinge für den Ablaufplan.");
        planZeichnen();
      } catch (e) { console.error(e); meldung("Ablaufplan fehlgeschlagen: " + e.message, "fehler"); }
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
        const pkonflikte = await store.prueferTerminkonflikte(prid, id);
        if (pkonflikte.length) {
          const liste = pkonflikte.map((k) => `„${k.titel}"`).join(", ");
          if (!confirm(`Diese:r Prüfer:in ist am selben Tag bereits einem anderen Termin zugeteilt (${liste}) — Doppelbelegung. Trotzdem zuteilen?`)) return;
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

    document.getElementById("anwesenheit-btn")?.addEventListener("click", () => {
      anwesenheitDrucken(termin, zugeteilt);
    });

    document.getElementById("boegen-btn")?.addEventListener("click", () => {
      bewertungsboegenDrucken(termin, zugeteilt);
    });

    document.getElementById("mappe-btn")?.addEventListener("click", async () => {
      try {
        const st = await store.stationenFuer(id);
        await mappeDrucken(termin, zugeteilt, prueferZug, st, await pauseLaden(id));
      } catch (e) { console.error(e); meldung("Prüfungstag-Mappe fehlgeschlagen: " + e.message, "fehler"); }
    });

    // Termindetails (Datum/Ort/Raum/Uhrzeit) direkt aus der Planung bearbeiten —
    // ohne Umweg über die Termine-Stammdatenliste. Danach denselben Termin neu laden.
    document.getElementById("termin-bearbeiten")?.addEventListener("click", () => {
      formularOeffnen("pruefungen", termin, () => { location.hash = "#/planung?termin=" + id; renderPlanung(); });
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

/** Inneres HTML einer persönlichen Prüfer-Einladung (für Druck/Serie). */
function prueferEinladungHtml(t, p) {
  const datum = t.datum
    ? new Date(t.datum).toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "—";
  const name = `${p.vorname || ""} ${p.nachname || ""}`.trim();
  const heute = new Date().toLocaleDateString("de-DE");
  return `
    <p class="bw-klein bw-leise">Regierungspräsidium Freiburg · Ausbildungsberatung</p>
    <p>${esc(name) || "Prüfer:in"}${p.organisation ? "<br>" + esc(p.organisation) : ""}</p>
    <p class="bw-klein bw-leise" style="text-align:right">Freiburg, den ${esc(heute)}</p>
    <h1>Einladung in den Prüfungsausschuss</h1>
    <p>Sehr geehrtes Ausschussmitglied,</p>
    <p>wir laden Sie als <strong>${esc(p.rolle || "Mitglied")}</strong> des Prüfungsausschusses zur
       praktischen Abschlussprüfung Gärtner/in${t.beruf ? ", Fachrichtung " + esc(t.beruf) : ""} ein.</p>
    <table class="bw-table bw-zeugnis"><tbody>
      <tr><th scope="row">Termin</th><td>${esc(datum)}</td></tr>
      ${t.zeit_von ? `<tr><th scope="row">Beginn</th><td>${esc(t.zeit_von)} Uhr</td></tr>` : ""}
      <tr><th scope="row">Ort</th><td>${esc(t.ort || "—")}${t.raum ? ", " + esc(t.raum) : ""}</td></tr>
      <tr><th scope="row">Ihre Rolle</th><td>${esc(p.rolle || "Mitglied")}</td></tr>
      <tr><th scope="row">Prüflinge</th><td>${zahl(t.anzahl_prueflinge)}</td></tr>
    </tbody></table>
    <p>Bitte teilen Sie uns Ihre Zu- oder Absage zeitnah mit. Sind Sie verhindert,
       nennen Sie uns bitte möglichst eine Vertretung.</p>
    <p>Mit freundlichen Grüßen<br>Ausbildungsberatung<br>Regierungspräsidium Freiburg</p>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

/** Druckt je Ausschussmitglied eines Termins eine persönliche Einladung. */
function prueferEinladungDrucken(t) {
  if (!t.pruefer.length) { meldung("Noch kein Ausschuss zugeteilt.", "fehler"); return; }
  druckbereich().innerHTML = t.pruefer
    .map((p) => `<section class="bw-zeugnisblatt">${prueferEinladungHtml(t, p)}</section>`).join("");
  window.print();
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
        <div class="bw-toolbar" style="margin:0;gap:var(--bw-space-1)">
          <button class="bw-btn bw-btn--sekundaer" type="button" data-anfrage="${t.id}"
                  ${t.pruefer.length ? "" : "disabled"}>Prüfer:innen anfragen (E-Mail)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" data-pdruck="${t.id}"
                  ${t.pruefer.length ? "" : "disabled"}>Einladung drucken</button>
        </div>
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
                  <button class="bw-iconbtn" type="button" data-status="zugesagt" data-zid="${p.zuteilung_id}" title="Zusage" aria-label="Zusage">${icon("haken")}</button>
                  <button class="bw-iconbtn" type="button" data-status="abgesagt" data-zid="${p.zuteilung_id}" title="Absage" aria-label="Absage">${icon("kreuz")}</button>
                  <button class="bw-iconbtn" type="button" data-status="offen" data-zid="${p.zuteilung_id}" title="Zurücksetzen" aria-label="Zurücksetzen">${icon("zurueck")}</button>
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
    const pdruckBtn = ev.target.closest("[data-pdruck]");
    if (pdruckBtn) {
      const t = liste.find((x) => String(x.id) === pdruckBtn.getAttribute("data-pdruck"));
      if (t) prueferEinladungDrucken(t);
      return;
    }
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

/** Note mit Wortstufe, z. B. „2,4 (gut)" — für die Zeugnis-Schnitte/Gesamtnote. */
function noteMitWort(n) {
  return n == null ? "—" : `${formatNote(n)} (${store.wortStufe(Number(n))})`;
}

function ergebnisBadge(bestanden) {
  if (bestanden === true || bestanden === "t" || bestanden === "true")
    return '<span class="bw-status-do">bestanden</span>';
  if (bestanden === false || bestanden === "f" || bestanden === "false")
    return '<span class="bw-status-dont">nicht bestanden</span>';
  return '<span class="bw-leise">offen</span>';
}

async function renderNoten(pruefungId = null) {
  // Deep-Link #/noten?termin=… (z. B. aus dem Bereitschafts-Board am Prüfungstag).
  if (pruefungId == null) { const tp = routeParams().termin; if (tp) pruefungId = Number(tp); }
  const termine = await store.liste("pruefungen");
  const rows = await store.bewertungenListe(pruefungId);
  const verteilung = await store.notenVerteilung();
  const bewertet = rows.filter((r) => r.gesamt != null).length;
  const bestandenN = rows.filter((r) => r.bestanden === true).length;
  const gefiltert = pruefungId != null;

  appEl().innerHTML = `
    <h1>Noten</h1>
    <p class="bw-unterzeile">Galabau-Sammelbewertung: 5 praktische + 4 Kenntnisbereiche → Gesamtnote</p>

    ${termine.length ? `
    <div class="bw-toolbar">
      <div class="bw-field" style="max-width:36rem;flex:1 1 22rem;margin:0">
        <label for="noten-termin">Prüfungstermin</label>
        <select id="noten-termin">
          <option value="">— alle Prüflinge —</option>
          ${termine.map((t) => `<option value="${t.id}"${String(t.id) === String(pruefungId) ? " selected" : ""}>${esc(terminLabel(t))}</option>`).join("")}
        </select>
      </div>
      <span class="bw-klein bw-leise" style="align-self:center">${zahl(bewertet)} von ${zahl(rows.length)} bewertet${bewertet ? " · " + zahl(bestandenN) + " bestanden" : ""}</span>
      ${gefiltert && rows.some((r) => r.gesamt == null)
        ? `<button class="bw-btn bw-btn--gelb" type="button" id="reihen-btn">Reihen-Bewertung (${zahl(rows.filter((r) => r.gesamt == null).length)} offen)</button>`
        : ""}
      <details class="bw-disclosure">
        <summary class="bw-btn bw-btn--sekundaer">CSV &amp; Vorlagen</summary>
        <div class="bw-disclosure__panel">
          <button class="bw-btn bw-btn--sekundaer" type="button" id="noten-vorlage" ${rows.length ? "" : "disabled"}>Bewertungsvorlage (CSV)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="noten-import">Noten importieren (CSV)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="noten-csv" ${bewertet ? "" : "disabled"}>Noten als CSV</button>
        </div>
      </details>
    </div>` : ""}

    <div class="bw-tablewrap">
      <table class="bw-table">
        <thead><tr>${gefiltert ? "<th>Uhrzeit</th>" : ""}<th>Name</th><th>Fachrichtung</th><th>Praxis</th><th>Kenntnis</th><th>Gesamtnote</th><th>Ergebnis</th><th>Aktion</th></tr></thead>
        <tbody id="noten-koerper">
          ${rows.map((r) => `
            <tr>
              ${gefiltert ? `<td>${esc(r.slot || "—")}</td>` : ""}
              <td>${esc((r.nachname || "") + ", " + (r.vorname || ""))}</td>
              <td>${esc(r.beruf || "")}</td>
              <td>${formatNote(r.praxis)}</td>
              <td>${formatNote(r.kenntnis)}</td>
              <td><strong>${formatNote(r.gesamt)}</strong></td>
              <td>${ergebnisBadge(r.bestanden)}${r.bestanden === false && store.bewertungGruende(r).length
                ? `<br><span class="bw-klein bw-leise">${store.bewertungGruende(r).map(esc).join("; ")}</span>` : ""}</td>
              <td class="bw-actions">
                <button class="bw-btn bw-btn--sekundaer" type="button" data-bewerten="${r.pruefling_id}">${r.gesamt != null ? "Ändern" : "Bewerten"}</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="bw-hinweis"${rows.length ? " hidden" : ""}>${gefiltert
      ? "Diesem Termin sind noch keine Prüflinge zugeteilt — unter <a href=\"#/planung\">Planung</a> zuteilen."
      : "Noch keine Prüflinge vorhanden — zuerst unter <a href=\"#/prueflinge\">Prüflinge</a> anlegen."}</p>

    <h2 style="margin-top:var(--bw-space-4)">Verteilung der Gesamtnoten</h2>
    <div id="noten-diagramm" class="bw-card"></div>
    <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">
      Galabau: Gesamtnote = Praxis-Schnitt · 0,6 + Kenntnis-Schnitt · 0,4 (auf 1 Stelle abgeschnitten).
      Nicht bestanden, wenn Praxis, Kenntnis oder Gesamt ≥ 4,5, ein Bereich ≥ 5,5 (Sperrfach) oder ≥ 2 Bereiche ≥ 4,5.
      Das Diagramm zeigt stets alle Bewertungen.
    </p>
  `;

  if (window.bwChart && verteilung.some((v) => v.wert > 0)) {
    const maxWert = Math.max.apply(null, verteilung.map((v) => v.wert));
    window.bwChart.bars(
      document.getElementById("noten-diagramm"),
      verteilung.map((v) => ({ label: v.label, value: v.wert, highlight: v.wert === maxWert && maxWert > 0 })),
      { titel: "Verteilung der Gesamtnoten", max: Math.max(1, maxWert) }
    );
  } else {
    document.getElementById("noten-diagramm").innerHTML = '<p class="bw-leise">Noch keine Bewertungen erfasst.</p>';
  }

  document.getElementById("noten-import")?.addEventListener("click", () => {
    notenImportDialog(pruefungId, () => renderNoten(pruefungId));
  });
  document.getElementById("noten-vorlage")?.addEventListener("click", () => {
    // Import-kompatible Leervorlage: Namen vorausgefüllt, 9 Notenspalten leer —
    // in Excel ausfüllen und über „Noten importieren (CSV)" zurückspielen.
    const kopf = ["Nachname", "Vorname", "Fachrichtung",
      "Praxis I", "Praxis II", "Praxis III", "Praxis IV", "Praxis V",
      "Kenntnis 1", "Kenntnis 2", "Kenntnis 3", "Kenntnis 4"];
    const zeilen = rows.map((r) => [r.nachname || "", r.vorname || "", r.beruf || "", "", "", "", "", "", "", "", "", ""]);
    const termin = gefiltert ? (termine.find((t) => String(t.id) === String(pruefungId)) || {}) : null;
    const datei = "Bewertungsvorlage" + (termin && termin.titel ? "-" + termin.titel.replace(/[^\wäöüÄÖÜß-]+/g, "_") : "") + ".csv";
    dateiDownload(datei, csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`Bewertungsvorlage exportiert: ${zahl(rows.length)} Prüflinge. In Excel ausfüllen und über „Noten importieren (CSV)" zurückspielen.`);
  });
  document.getElementById("noten-termin")?.addEventListener("change", (ev) => {
    const v = ev.target.value;
    renderNoten(v ? Number(v) : null);
  });

  document.getElementById("noten-csv")?.addEventListener("click", () => {
    const deDez = (n) => n == null ? "" : String(n).replace(".", ",");
    const kopf = (gefiltert ? ["Uhrzeit"] : [])
      .concat(["Nachname", "Vorname", "Fachrichtung"])
      .concat(GALABAU_BEREICHE.praxis.map((b, i) => `P${i + 1} ${b}`))
      .concat(GALABAU_BEREICHE.kenntnis)
      .concat(["Praxis-Schnitt", "Kenntnis-Schnitt", "Gesamtnote", "Ergebnis"]);
    const zeilen = rows.map((r) => (gefiltert ? [r.slot || ""] : [])
      .concat([r.nachname || "", r.vorname || "", r.beruf || ""])
      .concat([r.p1, r.p2, r.p3, r.p4, r.p5, r.k1, r.k2, r.k3, r.k4].map(deDez))
      .concat([deDez(r.praxis), deDez(r.kenntnis), deDez(r.gesamt),
        r.bestanden === true ? "bestanden" : r.bestanden === false ? "nicht bestanden" : ""]));
    const termin = gefiltert ? (termine.find((t) => String(t.id) === String(pruefungId)) || {}) : null;
    const datei = "Noten" + (termin && termin.titel ? "-" + termin.titel.replace(/[^\wäöüÄÖÜß-]+/g, "_") : "") + ".csv";
    dateiDownload(datei, csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`Noten exportiert: ${zahl(rows.length)} Prüflinge.`);
  });

  // Reihen-Bewertung: nach dem Speichern öffnet sich der nächste unbewertete
  // Prüfling automatisch — zügiges Abarbeiten am Prüfungstag, mobil bedienbar.
  document.getElementById("reihen-btn")?.addEventListener("click", () => {
    const offene = rows.filter((r) => r.gesamt == null);
    const naechste = (i) => {
      if (i >= offene.length) { meldung(`Reihen-Bewertung abgeschlossen: ${zahl(offene.length)} bewertet.`); renderNoten(pruefungId); return; }
      notenDialog(offene[i], () => naechste(i + 1));
    };
    naechste(0);
  });

  document.getElementById("noten-koerper").addEventListener("click", async (ev) => {
    const pid = ev.target.closest("[data-bewerten]")?.getAttribute("data-bewerten");
    if (!pid) return;
    const row = rows.find((r) => String(r.pruefling_id) === String(pid));
    notenDialog(row, () => renderNoten(pruefungId));
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

      <div class="bw-hinweis" style="margin-top:var(--bw-space-2)">
        <p class="bw-klein bw-leise" style="margin:0 0 var(--bw-space-2)">Mündliche Ergänzungsprüfung (optional, ein Kenntnisbereich): die Bereichsnote wird zu (2 × schriftlich + 1 × mündlich) ÷ 3 gewichtet und fließt so in Schnitt und Gesamtnote ein. Über die Zulassung entscheidet der Prüfungsausschuss.</p>
        <div class="bw-dialog__felder">
          <div class="bw-field">
            <label for="erg_bereich">Bereich</label>
            <select id="erg_bereich" name="erg_bereich">
              <option value="">— keine —</option>
              ${GALABAU_BEREICHE.kenntnis.map((b, i) => `<option value="k${i + 1}"${row.ergaenzung_bereich === "k" + (i + 1) ? " selected" : ""}>${esc(b)}</option>`).join("")}
            </select>
          </div>
          ${noteFeld("erg_note", "mündliche Note", row.ergaenzung_note)}
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

  const kenntnisEffektiv = () => {
    const kArr = lese("k", 4);
    const ergB = form.elements["erg_bereich"].value;
    const ergN = form.elements["erg_note"].value;
    return (ergB && ergN.trim() !== "") ? store.ergaenzteKenntnis(kArr, ergB, ergN) : kArr;
  };

  const vorschau = () => {
    const ergAktiv = form.elements["erg_bereich"].value && form.elements["erg_note"].value.trim() !== "";
    const g = store.gesamtGalabau(lese("p", 5), kenntnisEffektiv());
    if (g.gesamt == null) {
      preview.className = "bw-hinweis";
      preview.textContent = "Alle 9 Bereiche ausfüllen, dann werden Gesamtnote und Ergebnis berechnet.";
      return;
    }
    preview.className = "bw-hinweis " + (g.bestanden ? "bw-hinweis--erfolg" : "bw-hinweis--fehler");
    preview.textContent =
      `Praxis ${formatNote(g.praxis)} · Kenntnis ${formatNote(g.kenntnis)}${ergAktiv ? " (mit mündl. Ergänzung)" : ""} → Gesamtnote ${formatNote(g.gesamt)} — ` +
      (g.bestanden ? "bestanden" : "nicht bestanden" + (g.gruende.length ? " (" + g.gruende.join("; ") + ")" : ""));
  };
  form.querySelectorAll("[data-note]").forEach((el) => el.addEventListener("input", vorschau));
  form.elements["erg_bereich"].addEventListener("change", vorschau);

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
        { pk_schriftlich: form.elements["pk_s"].value, pk_bestimmung: form.elements["pk_b"].value,
          ergaenzung_bereich: form.elements["erg_bereich"].value || null, ergaenzung_note: form.elements["erg_note"].value });
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

async function renderZeugnisse(pruefungId = null) {
  // Deep-Link #/zeugnisse?termin=… (z. B. aus dem Tagescockpit).
  if (pruefungId == null) { const tp = routeParams().termin; if (tp) pruefungId = Number(tp); }
  const termine = await store.liste("pruefungen");
  const rows = await store.bewertungenListe(pruefungId);
  const bewertete = rows.filter((r) => r.gesamt != null).length;
  const serienLabel = pruefungId != null ? "Zeugnisse dieses Termins drucken (Serie)" : "Alle Zeugnisse drucken (Serie)";

  appEl().innerHTML = `
    <h1>Zeugnisse</h1>
    <p class="bw-unterzeile">Prüfungszeugnis je Prüfling drucken (bei Nichtbestehen eine sachliche Ergebnis-Mitteilung) — oder als PDF speichern</p>
    <div class="bw-toolbar">
      ${termine.length ? `
      <div class="bw-field" style="max-width:36rem;flex:1 1 22rem;margin:0">
        <label for="zeugnis-termin">Prüfungstermin</label>
        <select id="zeugnis-termin">
          <option value="">— alle Prüflinge —</option>
          ${termine.map((t) => `<option value="${t.id}"${String(t.id) === String(pruefungId) ? " selected" : ""}>${esc(terminLabel(t))}</option>`).join("")}
        </select>
      </div>` : ""}
      <span class="bw-klein bw-leise" style="align-self:center">${zahl(bewertete)} bewertete Prüflinge</span>
      <button class="bw-btn bw-btn--gelb" type="button" id="serien-druck"
              ${bewertete ? "" : "disabled"}>${serienLabel}</button>
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
    <p class="bw-hinweis"${rows.length ? " hidden" : ""}>${pruefungId != null
      ? "Diesem Termin sind noch keine Prüflinge zugeteilt — unter <a href=\"#/planung\">Planung</a> zuteilen."
      : "Noch keine Prüflinge vorhanden — zuerst unter <a href=\"#/prueflinge\">Prüflinge</a> anlegen."}</p>
    <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">Ein Zeugnis kann erst gedruckt werden, wenn unter <a href="#/noten">Noten</a> eine Bewertung erfasst ist.</p>
  `;

  document.getElementById("zeugnis-termin")?.addEventListener("change", (ev) => {
    const v = ev.target.value;
    renderZeugnisse(v ? Number(v) : null);
  });
  document.getElementById("zeugnis-koerper").addEventListener("click", async (ev) => {
    const pid = ev.target.closest("[data-zeugnis]")?.getAttribute("data-zeugnis");
    if (!pid) return;
    try { await zeugnisDrucken(Number(pid)); }
    catch (e) { console.error(e); meldung("Zeugnis konnte nicht erstellt werden: " + e.message, "fehler"); }
  });
  document.getElementById("serien-druck")?.addEventListener("click", async () => {
    try { await serienZeugnisDruck(pruefungId); }
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
  // Hatte ein Kenntnisbereich eine mündliche Ergänzungsprüfung, zeigt das
  // Zeugnis die gewichtete (effektive) Bereichsnote — passend zum Schnitt.
  const ergIdx = { k1: 0, k2: 1, k3: 2, k4: 3 }[d.ergaenzung_bereich];
  const Keff = (ergIdx != null && d.ergaenzung_note != null)
    ? store.ergaenzteKenntnis(K, d.ergaenzung_bereich, d.ergaenzung_note) : K;
  const bereichZeile = (label, note) =>
    `<tr><td>${esc(label)}</td><td style="text-align:right">${formatNote(note)}</td></tr>`;
  // Ein Prüfungszeugnis erhält nur, wer bestanden hat. Bei Nichtbestehen wird
  // sachlich eine „Mitteilung über das Prüfungsergebnis" gedruckt — mit dem
  // Grund (aus den Bereichsnoten abgeleitet, wie in Akte/Niederschrift).
  const nichtBestanden = d.bestanden === false;
  const gruende = nichtBestanden ? store.bewertungGruende(d) : [];
  const titel = nichtBestanden ? "Mitteilung über das Prüfungsergebnis" : "Prüfungszeugnis";
  return `
    <h1>${titel}</h1>
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
      <tr><th scope="row">Praxis-Schnitt</th><td style="text-align:right"><strong>${noteMitWort(d.praxis)}</strong></td></tr>
    </tbody></table>

    <h2>Kenntnisprüfung</h2>
    <table class="bw-table"><tbody>
      ${GALABAU_BEREICHE.kenntnis.map((b, i) => bereichZeile(b + (i === ergIdx ? " *" : ""), Keff[i])).join("")}
      <tr><th scope="row">Kenntnis-Schnitt</th><td style="text-align:right"><strong>${noteMitWort(d.kenntnis)}</strong></td></tr>
    </tbody></table>
    ${ergIdx != null ? '<p class="bw-klein">* Note nach mündlicher Ergänzungsprüfung: (2 × schriftlich + 1 × mündlich) ÷ 3.</p>' : ""}

    <table class="bw-table bw-zeugnis"><tbody>
      <tr><th scope="row">Gesamtnote</th><td><strong>${noteMitWort(d.gesamt)}</strong></td></tr>
      <tr><th scope="row">Ergebnis</th><td><strong>${d.bestanden === true ? "bestanden" : d.bestanden === false ? "nicht bestanden" : "—"}</strong></td></tr>
      ${nichtBestanden && gruende.length ? `<tr><th scope="row">Grund</th><td>${gruende.map(esc).join("; ")}</td></tr>` : ""}
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

/** Serien-Druck der bewerteten Zeugnisse (optional auf einen Termin beschränkt). */
async function serienZeugnisDruck(pruefungId = null) {
  const liste = await store.alleZeugnisDaten(pruefungId);
  if (!liste.length) { meldung("Keine bewerteten Prüflinge für den Serien-Druck.", "fehler"); return; }
  druckbereich().innerHTML = liste
    .map((d) => `<section class="bw-zeugnisblatt">${zeugnisHtml(d)}</section>`).join("");
  window.print();
}

/* ------------------------------------------------ Prüflings-Einladung */

/**
 * Standard-Mitbringliste zur praktischen Prüfung. Ergänzend gilt stets die
 * offizielle Werkzeug-/Mitbringliste der Ausbildungsberatung.
 */
const MITBRINGLISTE = [
  "Gültiger Lichtbildausweis (Personalausweis)",
  "Wetterfeste Arbeitskleidung und Sicherheitsschuhe",
  "Persönliche Schutzausrüstung (Arbeitshandschuhe)",
  "Gliedermaßstab (Zollstock), Bandmaß und Wasserwaage",
  "Schreibzeug (Bleistift, Kugelschreiber)",
  "Verpflegung für den Prüfungstag",
];

/** Inneres HTML einer Einladung (für Einzel- und Serien-Druck). */
function einladungHtml(d) {
  const name = `${d.vorname || ""} ${d.nachname || ""}`.trim();
  const datum = d.datum
    ? new Date(d.datum).toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "—";
  const uhrzeit = d.slot || d.zeit_von || "";
  const heute = new Date().toLocaleDateString("de-DE");
  return `
    <p class="bw-klein bw-leise">Regierungspräsidium Freiburg · Ausbildungsberatung</p>
    <p>${esc(name) || "Prüfling"}${d.betrieb ? "<br>" + esc(d.betrieb) : ""}</p>
    <p class="bw-klein bw-leise" style="text-align:right">Freiburg, den ${esc(heute)}</p>
    <h1>Einladung zur praktischen Abschlussprüfung</h1>
    <p>Sehr geehrte Auszubildende, sehr geehrter Auszubildender,</p>
    <p>hiermit laden wir Sie zur praktischen Abschlussprüfung im Ausbildungsberuf
       Gärtner/in${d.beruf ? ", Fachrichtung " + esc(d.beruf) : ""} ein.</p>
    <table class="bw-table bw-zeugnis"><tbody>
      <tr><th scope="row">Termin</th><td>${esc(datum)}</td></tr>
      ${uhrzeit ? `<tr><th scope="row">Uhrzeit</th><td>${esc(uhrzeit)} Uhr</td></tr>` : ""}
      <tr><th scope="row">Ort</th><td>${esc(d.ort || "—")}${d.raum ? ", " + esc(d.raum) : ""}</td></tr>
    </tbody></table>
    <p>Bitte erscheinen Sie pünktlich und bringen Sie Folgendes mit:</p>
    <ul>${MITBRINGLISTE.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="bw-klein bw-leise">Ergänzend gilt die offizielle Werkzeug-/Mitbringliste der Ausbildungsberatung.</p>
    <p>Sind Sie aus wichtigem Grund verhindert, teilen Sie uns dies bitte
       unverzüglich mit und legen Sie einen Nachweis (z. B. ärztliches Attest) vor.</p>
    <p>Mit freundlichen Grüßen<br>Ausbildungsberatung<br>Regierungspräsidium Freiburg</p>
    <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
}

/** Druckt die Einladung(en) eines Prüflings (eine Seite je Termin). */
async function einladungDrucken(prueflingId) {
  const liste = await store.einladungsListe(Number(prueflingId));
  if (!liste.length) { meldung("Erst einem Prüfungstermin zuteilen (unter Planung).", "fehler"); return; }
  druckbereich().innerHTML = liste
    .map((d) => `<section class="bw-zeugnisblatt">${einladungHtml(d)}</section>`).join("");
  window.print();
}

/** Serien-Druck aller Einladungen (eine Seite je zugeteiltem Prüfling). */
async function einladungenSerienDruck() {
  const liste = await store.einladungsListe();
  if (!liste.length) { meldung("Noch keine Prüflinge einem Termin zugeteilt.", "fehler"); return; }
  druckbereich().innerHTML = liste
    .map((d) => `<section class="bw-zeugnisblatt">${einladungHtml(d)}</section>`).join("");
  window.print();
}

/* --------------------------------------------------------- Schnellsuche */

async function renderSuche() {
  appEl().innerHTML = `
    <h1>Schnellsuche</h1>
    <p class="bw-unterzeile">Prüflinge, Betriebe, Prüfer:innen und Termine auf einmal — tippfehlertolerant. Tipp: Taste <kbd>/</kbd> springt überall zur Suche.</p>
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
  const kontaktZeile = (r, q, name, zusatz, href) => `
    <li>${href ? `<a href="${href}">${hl(name, q)}</a>` : hl(name, q)}${zusatz ? ` <span class="bw-klein bw-leise">${esc(zusatz)}</span>` : ""}
      <span class="bw-klein">${[r.telefon ? telLink(r.telefon, q) : "", r.email ? mailLink(r.email, q) : ""].filter(Boolean).join(" · ")}</span></li>`;
  const terminZeile = (r, q) => `
    <li><a href="#/planung?termin=${r.id}">${hl(r.titel || "Termin", q)}</a>
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
      gruppe("Betriebe", r.betriebe, (x) => kontaktZeile(x, q, x.name, x.ort, `#/betrieb/${x.id}`)) +
      gruppe("Prüfer:innen", r.pruefer, (x) => kontaktZeile(x, q, (x.nachname || "") + ", " + (x.vorname || ""), x.organisation, `#/pruefer/${x.id}`)) +
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

  let bez = { beratung: [], kontrollen: 0, letzteKontrolle: null, rasterMaengel: 0 };
  try { bez = await store.prueflingBezuege(Number(id)); } catch (e) { console.warn("Bezüge nicht verfügbar:", e); }

  const p = a.pruefling;
  const name = `${p.vorname || ""} ${p.nachname || ""}`.trim() || "Prüfling";
  const b = a.bewertung;
  const bewertet = b && b.gesamt != null;
  const zurueckgezogen = String(p.status || "").toLowerCase() === "zurückgezogen";
  const geb = p.geburtsdatum ? new Date(p.geburtsdatum).toLocaleDateString("de-DE") : "—";

  // Aufklappbare Einzel-Bereichsnoten (9 Bereiche) — alles zur Bewertung an
  // einem Ort, identisch zur Darstellung im Zeugnis (inkl. mündlicher Ergänzung).
  const einzelnotenHtml = () => {
    const P = [b.p1, b.p2, b.p3, b.p4, b.p5];
    const K = [b.k1, b.k2, b.k3, b.k4];
    const ergIdx = { k1: 0, k2: 1, k3: 2, k4: 3 }[b.ergaenzung_bereich];
    const Keff = (ergIdx != null && b.ergaenzung_note != null)
      ? store.ergaenzteKenntnis(K, b.ergaenzung_bereich, b.ergaenzung_note) : K;
    const zeile = (label, note) => `<tr><td>${esc(label)}</td><td style="text-align:right">${formatNote(note)}</td></tr>`;
    return `<details class="bw-disclosure" style="margin-top:var(--bw-space-1)">
      <summary class="bw-btn bw-btn--sekundaer">Einzelnoten anzeigen</summary>
      <div class="bw-disclosure__panel">
        <div class="bw-tablewrap" style="width:100%">
          <table class="bw-table"><tbody>
            ${GALABAU_BEREICHE.praxis.map((l, i) => zeile(roem(i + 1) + ". " + l, P[i])).join("")}
            ${GALABAU_BEREICHE.kenntnis.map((l, i) => zeile(l + (i === ergIdx ? " *" : ""), Keff[i])).join("")}
          </tbody></table>
        </div>
        ${ergIdx != null ? '<p class="bw-klein bw-leise" style="width:100%">* nach mündlicher Ergänzungsprüfung</p>' : ""}
      </div>
    </details>`;
  };

  const terminCard = (t) => `
    <div class="bw-card" style="margin-bottom:var(--bw-space-2)">
      <div class="bw-toolbar" style="margin:0">
        <strong style="margin-right:auto">${esc(t.titel || "Termin")}</strong>
        <a class="bw-iconbtn" href="#/planung?termin=${t.id}" aria-label="In der Planung öffnen" title="In der Planung öffnen">${icon("kalender")}</a>
        <button class="bw-iconbtn" type="button" data-entfernen="${t.zuteilung_id}"
                aria-label="Zuteilung entfernen" title="Zuteilung entfernen">${icon("muell")}</button>
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
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-einladung" ${a.termine.length ? "" : "disabled title=\"Erst einem Termin zuteilen\""}>Einladung drucken</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-ics" ${a.termine.some((t) => t.datum) ? "" : "disabled title=\"Kein datierter Prüfungstermin\""}>Termin als Kalender (.ics)</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-zeugnis" ${bewertet ? "" : "disabled title=\"Erst bewerten\""}>${bewertet && b && b.bestanden === false ? "Ergebnis-Mitteilung drucken" : "Zeugnis drucken"}</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-bearbeiten">Stammdaten bearbeiten</button>
      ${zurueckgezogen
        ? '<button class="bw-btn bw-btn--sekundaer" type="button" id="akte-reaktivieren">Reaktivieren</button>'
        : `${a.phase === "angemeldet" ? '<button class="bw-btn bw-btn--sekundaer" type="button" id="akte-zulassen">Zulassen</button>' : ""}
           <button class="bw-btn bw-btn--sekundaer" type="button" id="akte-zurueckziehen">Zurückziehen</button>`}
    </div>

    <div class="bw-flaechen">
      <section class="bw-card" aria-labelledby="akte-stamm">
        <h2 id="akte-stamm" style="margin-top:0">Stammdaten</h2>
        <table class="bw-table"><tbody>
          <tr><th scope="row">Beruf</th><td>${esc(p.beruf || "—")}</td></tr>
          <tr><th scope="row">Geburtsdatum</th><td>${esc(geb)}</td></tr>
          <tr><th scope="row">Ausbildungsbetrieb</th><td>${p.betrieb
            ? (a.betriebId ? `<a href="#/betrieb/${a.betriebId}">${esc(p.betrieb)}</a>` : esc(p.betrieb))
            : "—"}</td></tr>
          <tr><th scope="row">Prüfungsjahr</th><td>${esc(p.pruefungsjahr || "—")}</td></tr>
          <tr><th scope="row">E-Mail</th><td>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "—"}</td></tr>
          <tr><th scope="row">Telefon</th><td>${p.telefon ? `<a href="tel:${esc(String(p.telefon).replace(/[^\d+]/g, ""))}">${esc(p.telefon)}</a>` : "—"}</td></tr>
          <tr><th scope="row">Status</th><td>${esc(p.status || "—")}</td></tr>
          ${p.bemerkung ? `<tr><th scope="row">Bemerkung</th><td>${esc(p.bemerkung)}</td></tr>` : ""}
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
              ${b.bestanden === false && store.bewertungGruende(b).length
                ? `<tr><th scope="row">Grund</th><td>${store.bewertungGruende(b).map(esc).join("; ")}</td></tr>`
                : ""}
              ${b.bemerkung ? `<tr><th scope="row">Bemerkung des Ausschusses</th><td>${esc(b.bemerkung)}</td></tr>` : ""}
            </tbody></table>
            ${einzelnotenHtml()}`
          : '<p class="bw-leise">Noch nicht bewertet.</p>'}
        </div>
      </section>
    </div>

    <section class="bw-card" aria-labelledby="akte-bezuege" style="margin-top:var(--bw-space-3)">
      <h2 id="akte-bezuege" style="margin-top:0">Berichtsheft &amp; Beratung</h2>
      <p class="bw-klein" style="margin-top:0">
        Berichtsheft: ${zahl(bez.kontrollen)} Kontrolle${bez.kontrollen === 1 ? "" : "n"}${bez.letzteKontrolle ? ", zuletzt " + esc(new Date(bez.letzteKontrolle).toLocaleDateString("de-DE")) : ""}${bez.rasterMaengel ? ` · <strong>${zahl(bez.rasterMaengel)} offene Raster-Mängel</strong>` : ""}.
        <a href="#/berichtsheft/${p.id}">Wochenraster öffnen</a> · <a href="#/berichtsheft">Kontrolle erfassen</a>
      </p>
      <h3 style="margin:var(--bw-space-2) 0 var(--bw-space-1)">Beratungsfälle</h3>
      ${bez.beratung.length ? `<ul class="bw-trefferliste">
        ${bez.beratung.map((f) => `<li>
          <span><strong>${esc(f.titel || "Fall")}</strong>${f.kategorie ? ` <span class="bw-leise">· ${esc(f.kategorie)}</span>` : ""} <span class="bw-leise">— ${esc(beratungStatusLabel(f.status))}</span></span>
          <a class="bw-btn bw-btn--sekundaer" href="#/beratung/${f.id}" style="margin-left:auto">Öffnen</a>
        </li>`).join("")}
      </ul>` : '<p class="bw-leise bw-klein">Keine Beratungsfälle zu dieser Person. Ein Fall lässt sich aus der <a href="#/berichtsheft">Berichtsheft-Übersicht</a> anlegen.</p>'}
    </section>
  `;

  document.getElementById("akte-bewerten").addEventListener("click", () => {
    const row = Object.assign({ pruefling_id: p.id, nachname: p.nachname, vorname: p.vorname }, b || {});
    notenDialog(row, () => renderPrueflingAkte(id));
  });
  document.getElementById("akte-zeugnis").addEventListener("click", async () => {
    try { await zeugnisDrucken(p.id); }
    catch (e) { console.error(e); meldung("Zeugnis konnte nicht erstellt werden: " + e.message, "fehler"); }
  });
  document.getElementById("akte-einladung").addEventListener("click", async () => {
    try { await einladungDrucken(p.id); }
    catch (e) { console.error(e); meldung("Einladung konnte nicht erstellt werden: " + e.message, "fehler"); }
  });
  document.getElementById("akte-ics")?.addEventListener("click", () => {
    // Persönlicher Prüfungstermin als Kalendereintrag — Startzeit ist der
    // Uhrzeit-Slot des Prüflings (sonst der Terminbeginn).
    const termine = a.termine.filter((t) => t.datum).map((t) => ({
      id: t.id, titel: "Abschlussprüfung Gärtner/in" + (t.beruf ? " — " + t.beruf : ""),
      beruf: t.beruf, datum: t.datum, zeit_von: t.slot || t.zeit_von, ort: t.ort, raum: t.raum,
    }));
    if (!termine.length) { meldung("Kein datierter Prüfungstermin für den Kalender-Export.", "fehler"); return; }
    const dn = `Pruefungstermin-${(p.nachname || "Pruefling").replace(/[^\wäöüÄÖÜß-]/g, "_")}.ics`;
    icsDownload(dn, icsBauen(termine));
    meldung(`Prüfungstermin als Kalender (.ics) exportiert. In Outlook über „Datei → Öffnen/Importieren" einlesen.`);
  });
  document.getElementById("akte-bearbeiten").addEventListener("click", () => {
    formularOeffnen("prueflinge", p, () => renderPrueflingAkte(id));
  });
  const statusAktion = async (status, frage) => {
    if (frage && !confirm(frage)) return;
    try {
      await store.setzeStatus(p.id, status);
      meldung(`Status gesetzt: ${status}.`);
      renderPrueflingAkte(id);
    } catch (e) { console.error(e); meldung("Status ändern fehlgeschlagen: " + e.message, "fehler"); }
  };
  document.getElementById("akte-zulassen")?.addEventListener("click", () => statusAktion("zugelassen"));
  document.getElementById("akte-zurueckziehen")?.addEventListener("click", () =>
    statusAktion("zurückgezogen", `${name} von der Prüfung zurückziehen?`));
  document.getElementById("akte-reaktivieren")?.addEventListener("click", () =>
    statusAktion("angemeldet", `${name} wieder aktivieren (Status „angemeldet")?`));
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

/* --------------------------------------------------------- Betriebs-Akte */

async function renderBetriebAkte(id) {
  let a;
  try { a = await store.betriebAkte(Number(id)); }
  catch (e) { console.error(e); appEl().innerHTML = `<div class="bw-hinweis bw-hinweis--fehler">Betrieb konnte nicht geladen werden: ${esc(e.message)}</div>`; return; }
  if (!a) { appEl().innerHTML = `<div class="bw-hinweis">Betrieb nicht gefunden. <a href="#/betriebe">Zur Liste</a></div>`; return; }

  const b = a.betrieb;
  const pl = a.prueflinge || [];
  const bewertet = pl.filter((p) => p.gesamt != null);
  const bestanden = pl.filter((p) => p.bestanden === true).length;
  // Notenlage des Betriebs (Beratungs-Information): Ø Gesamtnote + Quote.
  const schnitt = bewertet.length
    ? Math.round((bewertet.reduce((s, p) => s + Number(p.gesamt), 0) / bewertet.length) * 10) / 10 : null;
  const quote = bewertet.length ? Math.round((bestanden / bewertet.length) * 100) : null;
  const adresse = [b.strasse, [b.plz, b.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  appEl().innerHTML = `
    <p class="bw-klein"><a href="#/betriebe">← Ausbildungsbetriebe</a></p>
    <h1 style="margin-bottom:var(--bw-space-1)">${esc(b.name || "Betrieb")}</h1>
    <p class="bw-unterzeile">Ausbildungsbetrieb — Kontakt und zugeordnete Prüflinge an einem Ort</p>

    <div class="bw-toolbar" style="margin-bottom:var(--bw-space-3)">
      <button class="bw-btn bw-btn--sekundaer" type="button" id="betrieb-bearbeiten">Stammdaten bearbeiten</button>
    </div>

    <div class="bw-flaechen">
      <section class="bw-card" aria-labelledby="betrieb-stamm">
        <h2 id="betrieb-stamm" style="margin-top:0">Kontakt</h2>
        <table class="bw-table"><tbody>
          <tr><th scope="row">Anschrift</th><td>${esc(adresse || "—")}</td></tr>
          <tr><th scope="row">Ansprechpartner</th><td>${esc(b.ansprechpartner || "—")}</td></tr>
          <tr><th scope="row">E-Mail</th><td>${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : "—"}</td></tr>
          <tr><th scope="row">Telefon</th><td>${b.telefon ? `<a href="tel:${esc(String(b.telefon).replace(/[^\d+]/g, ""))}">${esc(b.telefon)}</a>` : "—"}</td></tr>
          ${b.bemerkung ? `<tr><th scope="row">Bemerkung</th><td>${esc(b.bemerkung)}</td></tr>` : ""}
        </tbody></table>
      </section>

      <section aria-labelledby="betrieb-pl">
        <h2 id="betrieb-pl">Prüflinge (${zahl(pl.length)})</h2>
        ${pl.length ? `
          <p class="bw-klein bw-leise">${zahl(bewertet.length)} bewertet · ${zahl(bestanden)} bestanden${
            schnitt != null ? ` · Ø Gesamtnote ${noteMitWort(schnitt)} · Quote ${zahl(quote)} %` : ""}</p>
          <div class="bw-tablewrap">
            <table class="bw-table">
              <thead><tr><th>Name</th><th>Fachrichtung</th><th>Jahr</th><th style="text-align:right">Gesamtnote</th><th>Fortschritt</th><th>Aktion</th></tr></thead>
              <tbody>${pl.map((p) => `
                <tr>
                  <td>${esc((p.nachname || "") + ", " + (p.vorname || ""))}</td>
                  <td>${esc(p.beruf || "—")}</td>
                  <td>${esc(p.pruefungsjahr || "—")}</td>
                  <td style="text-align:right">${formatNote(p.gesamt)}</td>
                  <td>${fortschrittTag(p.phase)}</td>
                  <td class="bw-actions"><a class="bw-iconbtn" href="#/pruefling/${p.id}" title="Akte öffnen" aria-label="Akte öffnen">${icon("akte")}</a></td>
                </tr>`).join("")}</tbody>
            </table>
          </div>`
          : `<p class="bw-hinweis">Diesem Betrieb sind noch keine Prüflinge zugeordnet. In der <a href="#/prueflinge">Prüflingsliste</a> als Ausbildungsbetrieb „${esc(b.name || "")}" eintragen.</p>`}
      </section>
    </div>
  `;

  document.getElementById("betrieb-bearbeiten").addEventListener("click", () => {
    formularOeffnen("betriebe", b, () => renderBetriebAkte(id));
  });
}

/* --------------------------------------------------------- Prüfer-Akte */

async function renderPrueferAkte(id) {
  let a;
  try { a = await store.prueferAkte(Number(id)); }
  catch (e) { console.error(e); appEl().innerHTML = `<div class="bw-hinweis bw-hinweis--fehler">Prüfer:in konnte nicht geladen werden: ${esc(e.message)}</div>`; return; }
  if (!a) { appEl().innerHTML = `<div class="bw-hinweis">Prüfer:in nicht gefunden. <a href="#/pruefer">Zur Liste</a></div>`; return; }

  const p = a.pruefer;
  const name = `${p.vorname || ""} ${p.nachname || ""}`.trim() || "Prüfer:in";
  const eins = a.einsaetze || [];
  const abw = a.abwesenheiten || [];
  const tage = new Set(eins.filter((e) => e.datum).map((e) => icsDatum(e.datum))).size;

  appEl().innerHTML = `
    <p class="bw-klein"><a href="#/pruefer">← Prüfer:innen</a></p>
    <h1 style="margin-bottom:var(--bw-space-1)">${esc(name)}</h1>
    <p class="bw-unterzeile">Prüfer:in — Kontakt, Ausschuss-Einsätze und Abwesenheiten an einem Ort</p>

    <div class="bw-toolbar" style="margin-bottom:var(--bw-space-3)">
      <button class="bw-btn bw-btn--sekundaer" type="button" id="pruefer-ics"
              ${eins.some((e) => e.datum) ? "" : "disabled title=\"Keine datierten Einsätze\""}>Einsätze als Kalender (.ics)</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="pruefer-abw">Abwesenheiten bearbeiten</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="pruefer-bearbeiten">Stammdaten bearbeiten</button>
    </div>

    <div class="bw-flaechen">
      <section class="bw-card" aria-labelledby="pruefer-stamm">
        <h2 id="pruefer-stamm" style="margin-top:0">Kontakt</h2>
        <table class="bw-table"><tbody>
          <tr><th scope="row">Organisation</th><td>${esc(p.organisation || "—")}</td></tr>
          <tr><th scope="row">Funktion</th><td>${esc(p.funktion || "—")}</td></tr>
          <tr><th scope="row">E-Mail</th><td>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "—"}</td></tr>
          <tr><th scope="row">Telefon</th><td>${p.telefon ? `<a href="tel:${esc(String(p.telefon).replace(/[^\d+]/g, ""))}">${esc(p.telefon)}</a>` : "—"}</td></tr>
          ${p.bemerkung ? `<tr><th scope="row">Bemerkung</th><td>${esc(p.bemerkung)}</td></tr>` : ""}
          <tr><th scope="row">Einsätze</th><td>${zahl(eins.length)} an ${zahl(tage)} Prüfungstag(en)</td></tr>
        </tbody></table>
      </section>

      <section aria-labelledby="pruefer-eins">
        <h2 id="pruefer-eins">Ausschuss-Einsätze (${zahl(eins.length)})</h2>
        ${eins.length ? `
          <div class="bw-tablewrap">
            <table class="bw-table">
              <thead><tr><th>Datum</th><th>Termin</th><th>Rolle</th><th>Zusage</th></tr></thead>
              <tbody>${eins.map((e) => `
                <tr>
                  <td>${e.datum ? esc(new Date(e.datum).toLocaleDateString("de-DE")) : "—"}${e.zeit_von ? " · " + esc(e.zeit_von) : ""}</td>
                  <td><a href="#/planung?termin=${e.pruefung_id}" title="In der Planung öffnen">${esc(e.titel || "Termin")}</a></td>
                  <td>${esc(e.rolle || "—")}</td>
                  <td>${zusageBadge(e.status)}</td>
                </tr>`).join("")}</tbody>
            </table>
          </div>`
          : '<p class="bw-hinweis">Noch keinem Ausschuss zugeteilt — unter <a href="#/planung">Planung</a> besetzen.</p>'}

        <h2 style="margin-top:var(--bw-space-3)">Abwesenheiten (${zahl(abw.length)})</h2>
        <div class="bw-card">
          ${abw.length
            ? `<p class="bw-klein">${abw.map((x) => esc(new Date(x.datum).toLocaleDateString("de-DE"))).join(" · ")}</p>`
            : '<p class="bw-leise">Keine Abwesenheiten hinterlegt.</p>'}
        </div>
      </section>
    </div>
  `;

  document.getElementById("pruefer-ics")?.addEventListener("click", () => {
    const termine = eins.filter((e) => e.datum).map((e) => ({
      id: e.pruefung_id, titel: e.titel, beruf: e.beruf, datum: e.datum,
      zeit_von: e.zeit_von, ort: e.ort, rolle: e.rolle,
    }));
    if (!termine.length) { meldung("Keine datierten Einsätze für den Kalender-Export.", "fehler"); return; }
    const dn = `Einsaetze-${(p.nachname || "Pruefer").replace(/[^\wäöüÄÖÜß-]/g, "_")}.ics`;
    icsDownload(dn, icsBauen(termine));
    meldung(`Kalender exportiert: ${zahl(termine.length)} Einsatz/Einsätze (.ics). In Outlook über „Datei → Öffnen/Importieren" einlesen.`);
  });
  document.getElementById("pruefer-bearbeiten").addEventListener("click", () => {
    formularOeffnen("pruefer", p, () => renderPrueferAkte(id));
  });
  document.getElementById("pruefer-abw").addEventListener("click", () => {
    // Nach dem Schließen die Akte mit dem neuen Abwesenheitsstand neu zeichnen.
    abwesenheitDialog(p.id, name, () => renderPrueferAkte(id));
  });
}

/* --------------------------------------------------------- Auswertungen */

async function renderAuswertungen(jahr = null) {
  const jahre = await store.pruefungsjahre();
  if (jahr != null) jahr = Number(jahr);
  const auslast = await store.auslastung(jahr);
  const quoten = await store.quoteJeFachrichtung(jahr);
  const konflikte = await store.prueferKonflikte();
  const einsaetze = await store.prueferEinsaetze(jahr);
  const entschaedigung = await store.entschaedigungVorschau(jahr);
  const satzTag = geldOderNull(await store.getEinstellung("entsch_tagessatz", ""));
  const satzFahrt = geldOderNull(await store.getEinstellung("entsch_fahrt", ""));
  const spiegel = await store.notenVerteilung(jahr);
  const spiegelSumme = spiegel.reduce((s, r) => s + r.wert, 0);
  const bereiche = await store.bereichsDurchschnitte(jahr);
  const bereichLabel = (b) => (GALABAU_BEREICHE[b.gruppe] || [])[b.idx] || b.kurz;
  const bereicheMit = bereiche.filter((b) => b.schnitt != null);
  // Schwächste Stelle = höchster (schlechtester) Schnitt; erste bei Gleichstand.
  const maxBereich = bereicheMit.length ? Math.max.apply(null, bereicheMit.map((b) => b.schnitt)) : null;

  const belegt = auslast.filter((t) => t.prueflinge > 0);
  const summePl = belegt.reduce((s, t) => s + t.prueflinge, 0);
  const schnittPl = belegt.length ? Math.round((summePl / belegt.length) * 10) / 10 : 0;
  const ohneAusschuss = belegt.filter((t) => t.ausschuss === 0).length;
  const gesamtBewertet = quoten.reduce((s, r) => s + r.bewertet, 0);
  const gesamtBestanden = quoten.reduce((s, r) => s + r.bestanden, 0);
  const gesamtQuote = gesamtBewertet ? Math.round((gesamtBestanden / gesamtBewertet) * 100) : null;

  const terminZeile = (t) => `
    <tr>
      <td><a href="#/planung?termin=${t.id}" title="In der Planung öffnen">${esc(t.titel || "—")}</a></td>
      <td>${t.datum ? esc(new Date(t.datum).toLocaleDateString("de-DE")) : "—"}${t.zeit_von ? " · " + esc(t.zeit_von) : ""}</td>
      <td>${esc(t.beruf || "—")}</td>
      <td style="text-align:right">${zahl(t.prueflinge)}</td>
      <td style="text-align:right">${t.ausschuss ? zahl(t.ausschuss) : '<a href="#/planung?termin=' + t.id + '" class="bw-status-dont" title="Ausschuss besetzen">0</a>'}</td>
      <td style="text-align:right">${zahl(t.bewertet)}/${zahl(t.prueflinge)}</td>
      <td style="text-align:right">${t.bewertet ? zahl(t.bestanden) : "—"}</td>
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

  const einsatzZeile = (r) => `
    <tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.organisation || "—")}</td>
      <td style="text-align:right">${zahl(r.einsaetze)}</td>
      <td style="text-align:right">${zahl(r.tage)}</td>
      <td style="text-align:right">${zahl(r.zugesagt)}</td>
      <td style="text-align:right">${r.offen ? '<span class="bw-status-dont">' + zahl(r.offen) + "</span>" : "0"}</td>
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
      <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-einsaetze" ${einsaetze.length ? "" : "disabled"}>Prüfer-Einsätze als CSV</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="einsaetze-drucken" ${einsaetze.length ? "" : "disabled"}>Einsatzübersicht drucken</button>
      <button class="bw-btn bw-btn--gelb" type="button" id="bericht-drucken" ${(quoten.length || auslast.length) ? "" : "disabled"}>Bericht drucken</button>
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

    <section aria-labelledby="spiegel-h" style="margin-top:var(--bw-space-4)">
      <h2 id="spiegel-h">Notenspiegel (Gesamtnote)</h2>
      <div id="spiegel-diagramm" class="bw-card"></div>
      <ul class="bw-legend"${spiegelSumme ? "" : " hidden"}>
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Anzahl je Notenstufe</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> häufigste Stufe</li>
      </ul>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table">
          <thead><tr><th>Notenstufe</th><th style="text-align:right">Anzahl</th><th style="text-align:right">Anteil</th></tr></thead>
          <tbody>${spiegelSumme ? spiegel.map((r) => `<tr><td>${esc(r.label)}</td><td style="text-align:right">${zahl(r.wert)}</td><td style="text-align:right">${Math.round((r.wert / spiegelSumme) * 100)} %</td></tr>`).join("")
            : '<tr><td colspan="3" class="bw-leise">Noch keine Bewertungen — erscheint, sobald unter <a href="#/noten">Noten</a> bewertet wurde.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="bereich-h" style="margin-top:var(--bw-space-4)">
      <h2 id="bereich-h">Ø Note je Prüfungsbereich</h2>
      <p class="bw-klein bw-leise">Durchschnitt je Bereich über alle bewerteten Prüflinge — zeigt, wo systematisch Schwächen liegen (höher = schlechter). Hilfe für die gezielte Ausbildungsberatung.</p>
      <div id="bereich-diagramm" class="bw-card"></div>
      <ul class="bw-legend"${bereicheMit.length ? "" : " hidden"}>
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Ø Note (1 = sehr gut … 6 = ungenügend)</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> schwächster Bereich</li>
      </ul>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table">
          <thead><tr><th>Bereich</th><th>Prüfungsbereich</th><th style="text-align:right">Ø Note</th><th style="text-align:right">Anzahl</th></tr></thead>
          <tbody>${bereicheMit.length ? bereiche.map((b) => `<tr><td>${esc(b.kurz)}</td><td>${esc(bereichLabel(b))}</td><td style="text-align:right">${b.schnitt == null ? "—" : formatNote(b.schnitt)}</td><td style="text-align:right">${zahl(b.anzahl)}</td></tr>`).join("")
            : '<tr><td colspan="4" class="bw-leise">Noch keine Bewertungen — erscheint, sobald unter <a href="#/noten">Noten</a> bewertet wurde.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="auslast-h" style="margin-top:var(--bw-space-4)">
      <h2 id="auslast-h">Auslastung &amp; Ergebnis je Prüfungstermin</h2>
      ${ohneAusschuss ? `<p class="bw-hinweis bw-hinweis--fehler">${zahl(ohneAusschuss)} belegte(r) Termin(e) ohne Ausschuss — bitte im <a href="#/planung">Planung</a> besetzen.</p>` : ""}
      <div id="auslast-diagramm" class="bw-card"></div>
      <ul class="bw-legend"${belegt.length ? "" : " hidden"}>
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Prüflinge je Termin</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> stärkste Auslastung</li>
      </ul>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table">
          <thead><tr><th>Termin</th><th>Datum</th><th>Fachrichtung</th><th style="text-align:right">Prüflinge</th><th style="text-align:right">Ausschuss</th><th style="text-align:right">bewertet</th><th style="text-align:right">bestanden</th></tr></thead>
          <tbody>${auslast.length ? auslast.map(terminZeile).join("") : '<tr><td colspan="7" class="bw-leise">Noch keine Prüfungstermine. Erst unter <a href="#/">Übersicht</a> „Automatische Prüfungsplanung" starten.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="einsatz-h" style="margin-top:var(--bw-space-4)">
      <h2 id="einsatz-h">Prüfer-Einsätze</h2>
      <p class="bw-klein bw-leise">Ausschuss-Zuteilungen je Prüfer:in — für eine faire Lastverteilung. Aus der <a href="#/planung">Planung</a> abgeleitet.</p>
      <div id="einsatz-diagramm" class="bw-card"></div>
      <ul class="bw-legend"${einsaetze.length ? "" : " hidden"}>
        <li><span class="swatch" style="background:var(--bw-cat-1)"></span> Einsätze je Prüfer:in</li>
        <li><span class="swatch" style="background:var(--bw-gelb);outline:1.5px solid var(--bw-schwarz)"></span> meiste Einsätze</li>
      </ul>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table">
          <thead><tr><th>Prüfer:in</th><th>Organisation</th><th style="text-align:right">Einsätze</th><th style="text-align:right">Tage</th><th style="text-align:right">zugesagt</th><th style="text-align:right">offen</th></tr></thead>
          <tbody>${einsaetze.length ? einsaetze.map(einsatzZeile).join("") : '<tr><td colspan="6" class="bw-leise">Noch keine Ausschuss-Zuteilungen. Erst unter <a href="#/planung">Planung</a> besetzen.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="entsch-h" style="margin-top:var(--bw-space-4)">
      <h2 id="entsch-h">Prüferentschädigung</h2>
      <p class="bw-klein bw-leise">Entschädigung je Prüfer:in aus den tatsächlich wahrgenommenen Sitzungstagen (Absagen zählen nicht). <strong>Sätze selbst eintragen</strong> — das Tool trifft keine Annahme über Höhe oder Rechtsgrundlage. Betrag = Sitzungstage × (Tagessatz + Fahrtkostenpauschale).</p>
      <div class="bw-toolbar">
        <div class="bw-field" style="margin:0">
          <label for="satz-tag">Tagessatz (€ je Sitzungstag)</label>
          <input type="text" inputmode="decimal" id="satz-tag" value="${satzTag ? String(satzTag).replace(".", ",") : ""}" placeholder="z. B. 25,00" style="max-width:12rem">
        </div>
        <div class="bw-field" style="margin:0">
          <label for="satz-fahrt">Fahrtkostenpauschale (€ je Sitzungstag)</label>
          <input type="text" inputmode="decimal" id="satz-fahrt" value="${satzFahrt ? String(satzFahrt).replace(".", ",") : ""}" placeholder="z. B. 10,00" style="max-width:12rem">
        </div>
        <button class="bw-btn bw-btn--sekundaer" type="button" id="csv-entsch" ${entschaedigung.length ? "" : "disabled"}>Abrechnung als CSV</button>
        <button class="bw-btn bw-btn--gelb" type="button" id="entsch-drucken" ${entschaedigung.length ? "" : "disabled"}>Abrechnung drucken</button>
      </div>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-2)">
        <table class="bw-table">
          <thead><tr><th>Prüfer:in</th><th>Organisation</th><th style="text-align:right">Sitzungstage</th><th style="text-align:right">Einsätze</th><th style="text-align:right">Betrag</th></tr></thead>
          <tbody id="entsch-body"></tbody>
          <tfoot><tr><th scope="row" colspan="2">Summe</th><th style="text-align:right" id="entsch-summe-tage">0</th><th></th><th style="text-align:right" id="entsch-summe-betrag">${euro(0)}</th></tr></tfoot>
        </table>
      </div>
      ${entschaedigung.length ? "" : '<p class="bw-leise">Noch keine wahrgenommenen Einsätze. Erst unter <a href="#/planung">Planung</a> Ausschüsse besetzen und Zusagen erfassen.</p>'}
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

  const spiegelDia = document.getElementById("spiegel-diagramm");
  if (window.bwChart && spiegelSumme) {
    const maxS = Math.max.apply(null, spiegel.map((r) => r.wert));
    // Bei Gleichstand nur die erste häufigste Stufe gelb (CI: Gelb gilt EINEM Wert).
    const hlIdx = spiegel.findIndex((r) => r.wert === maxS);
    window.bwChart.bars(
      spiegelDia,
      spiegel.map((r, i) => ({ label: r.label, value: r.wert, highlight: i === hlIdx && maxS > 0 })),
      { titel: "Notenspiegel (Gesamtnote)", max: Math.max(1, maxS) }
    );
  } else {
    spiegelDia.innerHTML = '<p class="bw-leise">Noch keine Bewertungen — Notenspiegel erscheint nach der Bewertung (<a href="#/noten">Noten</a>).</p>';
  }

  const bereichDia = document.getElementById("bereich-diagramm");
  if (window.bwChart && bereicheMit.length) {
    // Nur die erste schwächste Stelle gelb (CI: Gelb gilt genau EINEM Wert).
    const hlKey = bereicheMit.find((b) => b.schnitt === maxBereich)?.key;
    window.bwChart.bars(
      bereichDia,
      bereicheMit.map((b) => ({ label: b.kurz, value: b.schnitt, highlight: b.key === hlKey })),
      { titel: "Ø Note je Prüfungsbereich (höher = schlechter)", max: 6 }
    );
  } else {
    bereichDia.innerHTML = '<p class="bw-leise">Noch keine Bewertungen — erscheint nach der Bewertung (<a href="#/noten">Noten</a>).</p>';
  }

  const auslastDia = document.getElementById("auslast-diagramm");
  if (window.bwChart && belegt.length) {
    const maxPl = Math.max.apply(null, belegt.map((t) => t.prueflinge));
    window.bwChart.bars(
      auslastDia,
      belegt.map((t) => ({
        label: t.datum ? new Date(t.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : kurzBeruf(t.titel || "—"),
        value: t.prueflinge,
        highlight: t.prueflinge === maxPl,
      })),
      { titel: "Prüflinge je Prüfungstermin", max: Math.max(1, maxPl) }
    );
  } else {
    auslastDia.innerHTML = '<p class="bw-leise">Noch keine belegten Prüfungstermine — erst Prüflinge zuteilen (Planung).</p>';
  }

  const einsatzDia = document.getElementById("einsatz-diagramm");
  if (window.bwChart && einsaetze.length) {
    const maxE = Math.max.apply(null, einsaetze.map((r) => r.einsaetze));
    // Liste ist nach Einsätzen absteigend sortiert — nur den Spitzenwert
    // hervorheben (Gelb gilt genau EINEM Wert, CI-Regel).
    window.bwChart.bars(
      einsatzDia,
      einsaetze.slice(0, 16).map((r, i) => ({ label: kurzName(r.name), value: r.einsaetze, highlight: i === 0 })),
      { titel: "Einsätze je Prüfer:in", max: Math.max(1, maxE) }
    );
  } else {
    einsatzDia.innerHTML = '<p class="bw-leise">Noch keine Ausschuss-Zuteilungen — erst unter <a href="#/planung">Planung</a> besetzen.</p>';
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
    const kopf = ["Termin", "Datum", "Beginn", "Fachrichtung", "Ort", "Prüflinge", "Ausschuss", "bewertet", "bestanden"];
    const zeilen = auslast.map((t) => [t.titel || "", t.datum ? new Date(t.datum).toLocaleDateString("de-DE") : "", t.zeit_von || "", t.beruf || "", t.ort || "", t.prueflinge, t.ausschuss, t.bewertet, t.bestanden]);
    dateiDownload(`Auslastung${jahr ? "-" + jahr : ""}.csv`, csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`Auslastung exportiert: ${zahl(auslast.length)} Termine.`);
  });
  document.getElementById("csv-einsaetze")?.addEventListener("click", () => {
    const kopf = ["Prüfer:in", "Organisation", "Einsätze", "Tage", "zugesagt", "offen", "abgesagt"];
    const zeilen = einsaetze.map((r) => [r.name, r.organisation || "", r.einsaetze, r.tage, r.zugesagt, r.offen, r.abgesagt]);
    dateiDownload(`Pruefer-Einsaetze${jahr ? "-" + jahr : ""}.csv`, csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`Prüfer-Einsätze exportiert: ${zahl(einsaetze.length)} Prüfer:innen.`);
  });
  document.getElementById("einsaetze-drucken")?.addEventListener("click", async () => {
    const liste = await store.prueferEinsatzListe(jahr);
    if (!liste.length) { meldung("Noch keine Ausschuss-Zuteilungen zum Drucken."); return; }
    const heute = new Date().toLocaleDateString("de-DE");
    // Zeilen je Prüfer:in gruppieren — Reihenfolge der Liste bleibt erhalten.
    const gruppen = [];
    let aktuell = null;
    for (const r of liste) {
      if (!aktuell || aktuell.id !== r.pruefer_id) {
        aktuell = { id: r.pruefer_id, name: r.name, organisation: r.organisation, zeilen: [] };
        gruppen.push(aktuell);
      }
      aktuell.zeilen.push(r);
    }
    const statusWort = (s) => {
      const t = String(s || "offen").toLowerCase();
      if (t === "zugesagt") return "zugesagt";
      if (t === "abgesagt") return "abgesagt";
      if (t === "angefragt") return "angefragt";
      return "offen";
    };
    const block = (g) => `
      <section class="bw-einsatz-block" style="margin-top:var(--bw-space-3);break-inside:avoid">
        <h2 style="margin-bottom:0">${esc(g.name)}</h2>
        <p class="bw-klein bw-leise" style="margin-top:0">${esc(g.organisation || "ohne Organisation")} · ${zahl(g.zeilen.length)} ${g.zeilen.length === 1 ? "Einsatz" : "Einsätze"}</p>
        <table class="bw-table">
          <thead><tr><th>Datum</th><th>Termin</th><th>Fachrichtung</th><th>Rolle</th><th>Zusage</th></tr></thead>
          <tbody>${g.zeilen.map((r) => `<tr>
            <td>${r.datum ? esc(new Date(r.datum).toLocaleDateString("de-DE")) : "—"}</td>
            <td>${esc(r.titel || "—")}</td>
            <td>${esc(r.beruf || "—")}</td>
            <td>${esc(r.rolle || "—")}</td>
            <td>${esc(statusWort(r.status))}</td>
          </tr>`).join("")}</tbody>
        </table>
      </section>`;
    druckbereich().innerHTML = `
      <h1>Prüfer-Einsatzübersicht — Abschlussprüfung Gärtner/in</h1>
      <p>${jahr ? "Prüfungsjahr " + esc(String(jahr)) : "Alle Prüfungsjahre"} · ${zahl(gruppen.length)} Prüfer:innen · ${zahl(liste.length)} Einsätze · Stand ${esc(heute)}</p>
      <p class="bw-klein bw-leise">Saison-Übersicht je Prüfer:in als Grundlage für Einsatzbestätigung und Entschädigung.</p>
      ${gruppen.map(block).join("")}
      <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-3)">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
    window.print();
  });

  // --- Prüferentschädigung: Sätze frei eingeben, Beträge live berechnen ---
  const entschTagEl = document.getElementById("satz-tag");
  const entschFahrtEl = document.getElementById("satz-fahrt");
  // Liefert {zeilen:[{...,betrag}], summeTage, summeBetrag} zum aktuellen Satz.
  const entschRechnen = () => {
    const tag = geldOderNull(entschTagEl?.value);
    const fahrt = geldOderNull(entschFahrtEl?.value);
    let summeTage = 0, summeBetrag = 0;
    const zeilen = entschaedigung.map((r) => {
      const betrag = r.tage * (tag + fahrt);
      summeTage += r.tage; summeBetrag += betrag;
      return { ...r, betrag };
    });
    return { zeilen, summeTage, summeBetrag, tag, fahrt };
  };
  const entschTabelleZeichnen = () => {
    const { zeilen, summeTage, summeBetrag } = entschRechnen();
    const body = document.getElementById("entsch-body");
    if (body) body.innerHTML = zeilen.length
      ? zeilen.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.organisation || "—")}</td><td style="text-align:right">${zahl(r.tage)}</td><td style="text-align:right">${zahl(r.einsaetze)}</td><td style="text-align:right">${euro(r.betrag)}</td></tr>`).join("")
      : '<tr><td colspan="5" class="bw-leise">Keine wahrgenommenen Einsätze.</td></tr>';
    const st = document.getElementById("entsch-summe-tage");
    const sb = document.getElementById("entsch-summe-betrag");
    if (st) st.textContent = zahl(summeTage);
    if (sb) sb.textContent = euro(summeBetrag);
  };
  entschTabelleZeichnen();
  let entschSpeicherTimer = null;
  const entschGeaendert = () => {
    entschTabelleZeichnen();
    clearTimeout(entschSpeicherTimer);
    entschSpeicherTimer = setTimeout(() => {
      store.setEinstellung("entsch_tagessatz", String(geldOderNull(entschTagEl?.value)));
      store.setEinstellung("entsch_fahrt", String(geldOderNull(entschFahrtEl?.value)));
    }, 400);
  };
  entschTagEl?.addEventListener("input", entschGeaendert);
  entschFahrtEl?.addEventListener("input", entschGeaendert);
  document.getElementById("csv-entsch")?.addEventListener("click", () => {
    const { zeilen, summeTage, summeBetrag, tag, fahrt } = entschRechnen();
    const kopf = ["Prüfer:in", "Organisation", "Sitzungstage", "Einsätze", "Tagessatz", "Fahrtpauschale", "Betrag"];
    const reihen = zeilen.map((r) => [r.name, r.organisation || "", r.tage, r.einsaetze, tag, fahrt, r.betrag]);
    reihen.push(["Summe", "", summeTage, "", "", "", summeBetrag]);
    dateiDownload(`Pruefer-Entschaedigung${jahr ? "-" + jahr : ""}.csv`, csvText(kopf, reihen), "text/csv;charset=utf-8");
    meldung(`Entschädigungs-Abrechnung exportiert: ${zahl(zeilen.length)} Prüfer:innen.`);
  });
  document.getElementById("entsch-drucken")?.addEventListener("click", () => {
    const { zeilen, summeTage, summeBetrag, tag, fahrt } = entschRechnen();
    if (!zeilen.length) { meldung("Keine wahrgenommenen Einsätze zum Abrechnen."); return; }
    const heute = new Date().toLocaleDateString("de-DE");
    druckbereich().innerHTML = `
      <h1>Prüferentschädigung — Abschlussprüfung Gärtner/in</h1>
      <p>${jahr ? "Prüfungsjahr " + esc(String(jahr)) : "Alle Prüfungsjahre"} · Stand ${esc(heute)}</p>
      <p>Tagessatz ${euro(tag)} · Fahrtkostenpauschale ${euro(fahrt)} je Sitzungstag · Betrag = Sitzungstage × (Tagessatz + Fahrtkostenpauschale).</p>
      <table class="bw-table">
        <thead><tr><th>Prüfer:in</th><th>Organisation</th><th style="text-align:right">Sitzungstage</th><th style="text-align:right">Einsätze</th><th style="text-align:right">Betrag</th></tr></thead>
        <tbody>${zeilen.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.organisation || "—")}</td><td style="text-align:right">${zahl(r.tage)}</td><td style="text-align:right">${zahl(r.einsaetze)}</td><td style="text-align:right">${euro(r.betrag)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th scope="row" colspan="2">Summe</th><th style="text-align:right">${zahl(summeTage)}</th><th></th><th style="text-align:right">${euro(summeBetrag)}</th></tr></tfoot>
      </table>
      <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-3)">Die Sätze wurden von der sachbearbeitenden Stelle eingetragen; das Tool trifft keine Annahme über Höhe oder Rechtsgrundlage. Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
    window.print();
  });
  document.getElementById("bericht-drucken")?.addEventListener("click", () => {
    const heute = new Date().toLocaleDateString("de-DE");
    const kennzahl = (wert, label) => `<tr><th scope="row">${esc(label)}</th><td style="text-align:right">${wert}</td></tr>`;
    druckbereich().innerHTML = `
      <h1>Auswertungsbericht — Abschlussprüfung Gärtner/in</h1>
      <p>${jahr ? "Prüfungsjahr " + esc(String(jahr)) : "Alle Prüfungsjahre"} · Stand ${esc(heute)}</p>

      <h2>Kennzahlen</h2>
      <table class="bw-table bw-zeugnis"><tbody>
        ${kennzahl(zahl(belegt.length), "Belegte Prüfungstermine")}
        ${kennzahl(zahl(schnittPl), "Ø Prüflinge je Termin")}
        ${kennzahl(gesamtQuote == null ? "—" : zahl(gesamtQuote) + " %", "Bestehensquote gesamt")}
        ${kennzahl(zahl(konflikte.length), "Prüfer-Doppelbelegungen")}
        ${kennzahl(zahl(ohneAusschuss), "Belegte Termine ohne Ausschuss")}
      </tbody></table>

      <h2>Bestehensquote je Fachrichtung</h2>
      <table class="bw-table">
        <thead><tr><th>Fachrichtung</th><th style="text-align:right">Prüflinge</th><th style="text-align:right">bewertet</th><th style="text-align:right">bestanden</th><th style="text-align:right">Quote</th><th style="text-align:right">Ø Note</th></tr></thead>
        <tbody>${quoten.length ? quoten.map((r) => `<tr><td>${esc(r.beruf)}</td><td style="text-align:right">${zahl(r.gesamt)}</td><td style="text-align:right">${zahl(r.bewertet)}</td><td style="text-align:right">${zahl(r.bestanden)}</td><td style="text-align:right">${r.quote == null ? "—" : zahl(r.quote) + " %"}</td><td style="text-align:right">${r.schnitt == null ? "—" : formatNote(r.schnitt)}</td></tr>`).join("") : '<tr><td colspan="6">Keine Daten.</td></tr>'}</tbody>
      </table>

      <h2>Notenspiegel (Gesamtnote)</h2>
      <table class="bw-table">
        <thead><tr><th>Notenstufe</th><th style="text-align:right">Anzahl</th><th style="text-align:right">Anteil</th></tr></thead>
        <tbody>${spiegelSumme ? spiegel.map((r) => `<tr><td>${esc(r.label)}</td><td style="text-align:right">${zahl(r.wert)}</td><td style="text-align:right">${Math.round((r.wert / spiegelSumme) * 100)} %</td></tr>`).join("") : '<tr><td colspan="3">Keine Daten.</td></tr>'}</tbody>
      </table>

      <h2>Ø Note je Prüfungsbereich</h2>
      <table class="bw-table">
        <thead><tr><th>Bereich</th><th>Prüfungsbereich</th><th style="text-align:right">Ø Note</th><th style="text-align:right">Anzahl</th></tr></thead>
        <tbody>${bereicheMit.length ? bereiche.map((b) => `<tr><td>${esc(b.kurz)}</td><td>${esc(bereichLabel(b))}</td><td style="text-align:right">${b.schnitt == null ? "—" : formatNote(b.schnitt)}</td><td style="text-align:right">${zahl(b.anzahl)}</td></tr>`).join("") : '<tr><td colspan="4">Keine Daten.</td></tr>'}</tbody>
      </table>

      <h2>Auslastung &amp; Ergebnis je Prüfungstermin</h2>
      <table class="bw-table">
        <thead><tr><th>Termin</th><th>Datum</th><th>Fachrichtung</th><th style="text-align:right">Prüflinge</th><th style="text-align:right">Ausschuss</th><th style="text-align:right">bewertet</th><th style="text-align:right">bestanden</th></tr></thead>
        <tbody>${auslast.length ? auslast.map((t) => `<tr><td>${esc(t.titel || "—")}</td><td>${t.datum ? esc(new Date(t.datum).toLocaleDateString("de-DE")) : "—"}</td><td>${esc(t.beruf || "—")}</td><td style="text-align:right">${zahl(t.prueflinge)}</td><td style="text-align:right">${zahl(t.ausschuss)}</td><td style="text-align:right">${zahl(t.bewertet)}/${zahl(t.prueflinge)}</td><td style="text-align:right">${t.bewertet ? zahl(t.bestanden) : "—"}</td></tr>`).join("") : '<tr><td colspan="7">Keine Daten.</td></tr>'}</tbody>
      </table>

      <h2>Prüfer-Einsätze</h2>
      <table class="bw-table">
        <thead><tr><th>Prüfer:in</th><th>Organisation</th><th style="text-align:right">Einsätze</th><th style="text-align:right">Tage</th><th style="text-align:right">zugesagt</th><th style="text-align:right">offen</th></tr></thead>
        <tbody>${einsaetze.length ? einsaetze.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.organisation || "—")}</td><td style="text-align:right">${zahl(r.einsaetze)}</td><td style="text-align:right">${zahl(r.tage)}</td><td style="text-align:right">${zahl(r.zugesagt)}</td><td style="text-align:right">${zahl(r.offen)}</td></tr>`).join("") : '<tr><td colspan="6">Keine Daten.</td></tr>'}</tbody>
      </table>
      <p class="bw-klein bw-leise">Erstellt mit der Ausbildungsberatung-Suite — Regierungspräsidium Freiburg</p>`;
    window.print();
  });
}

/** Kürzt „Nachname, Vorname" für Diagramm-Achsen (Nachname + Initial). */
function kurzName(name) {
  const [nach, vor] = String(name || "").split(",").map((s) => s.trim());
  return nach + (vor ? " " + vor.charAt(0) + "." : "");
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
        <td>${r.id != null ? `<a href="${r.typ === "Betrieb" ? "#/betrieb/" : "#/pruefer/"}${r.id}">${hl(r.bezeichnung, q)}</a>` : hl(r.bezeichnung, q)}</td>
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

// Zusätzliche Spalten-Synonyme je Feldname (für die automatische Zuordnung).
const CSV_SYN = {
  nachname: ["nachname", "name", "familienname", "lastname"],
  vorname: ["vorname", "firstname", "rufname"],
  name: ["name", "firma", "unternehmen", "bezeichnung", "betrieb"],
  geburtsdatum: ["geburtsdatum", "geboren", "geb", "geburtstag", "birthdate"],
  beruf: ["beruf", "fachrichtung", "ausbildungsberuf"],
  betrieb: ["betrieb", "ausbildungsbetrieb", "firma", "unternehmen", "ausbildungsstaette"],
  pruefungsjahr: ["pruefungsjahr", "jahr", "pruefjahr"],
  email: ["email", "mail", "emailadresse", "epost"],
  telefon: ["telefon", "tel", "telefonnummer", "handy", "mobil"],
  organisation: ["organisation", "firma", "betrieb", "institution"],
  funktion: ["funktion", "rolle"],
  strasse: ["strasse", "strassenr", "adresse", "anschrift"],
  plz: ["plz", "postleitzahl"],
  ort: ["ort", "stadt", "gemeinde"],
  ansprechpartner: ["ansprechpartner", "kontakt", "ansprechperson"],
  titel: ["titel", "bezeichnung"],
  datum: ["datum", "tag", "date"],
};

/** Importierbare Felder einer Entität (alle außer Freitext), je mit Synonymen. */
function csvFelder(key) {
  return ENTITAETEN[key].felder
    .filter((f) => f.input !== "textarea")
    .map((f) => ({
      name: f.name,
      label: f.label,
      syn: Array.from(new Set([csvNorm(f.name), csvNorm(f.label), ...(CSV_SYN[f.name] || []).map(csvNorm)])).filter(Boolean),
    }));
}

function csvNorm(s) {
  return String(s || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}
function csvAutoMap(header, felder) {
  const norm = header.map(csvNorm);
  const map = {};
  felder.forEach((f) => {
    let idx = norm.findIndex((h) => f.syn.includes(h));
    if (idx < 0) idx = norm.findIndex((h) => h && f.syn.some((s) => h.includes(s)));
    map[f.name] = idx; // -1 = nicht zugeordnet
  });
  return map;
}

/* ---------------------------------------------- Prüfer-Abwesenheiten (Dialog) */

async function abwesenheitDialog(prueferId, name, nachher) {
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
        <td class="bw-actions"><button class="bw-iconbtn" type="button" data-del-abw="${t.id}" title="Entfernen" aria-label="Tag entfernen">${icon("muell")}</button></td>
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
  dlg.addEventListener("close", () => { dlg.remove(); if (nachher) nachher(); });
  await zeichne();
  dlg.showModal();
}

function csvImportDialog(key, nachher) {
  const ent = ENTITAETEN[key];
  const FELDER = csvFelder(key);
  const dub = ent.dublette || [];
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog bw-dialog--breit";
  dlg.id = "dialog";
  dlg.innerHTML = `
    <form method="dialog" id="csv-form" novalidate>
      <h2 style="margin-top:0">${esc(ent.plural)} aus CSV importieren</h2>
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

  // Pflicht: mindestens ein Dublettenfeld zugeordnet (z. B. Name / Bezeichnung).
  const dubLabel = dub.map((d) => (FELDER.find((f) => f.name === d) || {}).label || d).join(" oder ");
  function aktualisiere() {
    const map = {};
    FELDER.forEach((f) => { map[f.name] = Number(form.elements["map_" + f.name].value); });
    const schluesselOk = dub.length ? dub.some((d) => map[d] >= 0) : FELDER.some((f) => map[f.name] >= 0);
    form.elements["csv-import"].disabled = !(schluesselOk && daten.length);
    infoEl.textContent = `${daten.length} Datensätze erkannt${schluesselOk ? "" : ` — bitte mindestens ${dubLabel} zuordnen`}.`;
    // Vorschau (erste 5)
    dlg.querySelector("#csv-vorschau-kopf").innerHTML =
      "<tr>" + FELDER.map((f) => `<th>${esc(f.label)}</th>`).join("") + "</tr>";
    dlg.querySelector("#csv-vorschau").innerHTML = daten.slice(0, 5).map((z) =>
      "<tr>" + FELDER.map((f) => `<td>${esc(map[f.name] >= 0 ? (z[map[f.name]] || "") : "")}</td>`).join("") + "</tr>"
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
      const map = csvAutoMap(header, FELDER);
      mappingEl.innerHTML = FELDER.map((f) => `
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
      FELDER.forEach((f) => { if (map[f.name] >= 0) s[f.name] = (z[map[f.name]] || "").trim(); });
      return s;
    });
    try {
      const r = await store.datensaetzeImportieren(key, saetze);
      meldung(`Import: ${zahl(r.angelegt)} ${esc(ent.plural)} angelegt, ${zahl(r.uebersprungen)} übersprungen (Dublette/leer).`);
      dlg.close();
      if (nachher) nachher();
    } catch (e) { console.error(e); meldung("Import fehlgeschlagen: " + e.message, "fehler"); }
  });

  dlg.showModal();
}

/* ----------------------------------------------------------- Noten-Import */

// Felder für den Noten-CSV-Import: Zuordnung über Name, dazu die 9 Bereichsnoten.
const NOTEN_IMPORT_FELDER = [
  { name: "nachname", label: "Nachname", syn: ["nachname", "name", "familienname"] },
  { name: "vorname", label: "Vorname", syn: ["vorname", "rufname"] },
  { name: "p1", label: "Praxis I", syn: ["p1", "praxis1", "praxisi", "bereich1"] },
  { name: "p2", label: "Praxis II", syn: ["p2", "praxis2", "praxisii", "bereich2"] },
  { name: "p3", label: "Praxis III", syn: ["p3", "praxis3", "praxisiii", "bereich3"] },
  { name: "p4", label: "Praxis IV", syn: ["p4", "praxis4", "praxisiv", "bereich4"] },
  { name: "p5", label: "Praxis V", syn: ["p5", "praxis5", "praxisv", "bereich5"] },
  { name: "k1", label: "Kenntnis 1", syn: ["k1", "kenntnis1", "kenntnisi"] },
  { name: "k2", label: "Kenntnis 2", syn: ["k2", "kenntnis2", "kenntnisii"] },
  { name: "k3", label: "Kenntnis 3", syn: ["k3", "kenntnis3", "kenntnisiii"] },
  { name: "k4", label: "Kenntnis 4", syn: ["k4", "kenntnis4", "kenntnisiv"] },
];
const NOTEN_PFLICHT = NOTEN_IMPORT_FELDER.filter((f) => f.name !== "vorname").map((f) => f.name);

function notenImportDialog(pruefungId, nachher) {
  const FELDER = NOTEN_IMPORT_FELDER;
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog bw-dialog--breit";
  dlg.id = "dialog";
  dlg.innerHTML = `
    <form method="dialog" id="ni-form" novalidate>
      <h2 style="margin-top:0">Noten aus CSV importieren</h2>
      <p class="bw-klein bw-leise">CSV mit Spalten <code>Nachname</code>, <code>Vorname</code> und den 9 Bereichsnoten
        (<code>Praxis I–V</code>, <code>Kenntnis 1–4</code>; Dezimalkomma erlaubt). Zuordnung über den Namen;
        gespeichert wird nur, wenn alle 9 Noten vorhanden sind. Erste Zeile = Überschriften.</p>
      <div class="bw-field">
        <label for="ni-datei">CSV-Datei</label>
        <input id="ni-datei" type="file" accept=".csv,text/csv">
      </div>
      <div id="ni-zuordnung" hidden>
        <h3>Spaltenzuordnung</h3>
        <div class="bw-dialog__felder" id="ni-mapping"></div>
        <p id="ni-info" class="bw-hinweis" aria-live="polite"></p>
        <div class="bw-tablewrap">
          <table class="bw-table"><thead id="ni-kopf"></thead><tbody id="ni-vorschau"></tbody></table>
        </div>
      </div>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="ni-abbrechen">Abbrechen</button>
        <button type="submit" class="bw-btn" id="ni-import" disabled>Importieren</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  let header = [], daten = [];
  const form = dlg.querySelector("#ni-form");
  const mappingEl = dlg.querySelector("#ni-mapping");
  const infoEl = dlg.querySelector("#ni-info");

  function aktualisiere() {
    const map = {};
    FELDER.forEach((f) => { map[f.name] = Number(form.elements["map_" + f.name].value); });
    const vollstaendig = NOTEN_PFLICHT.every((n) => map[n] >= 0);
    form.elements["ni-import"].disabled = !(vollstaendig && daten.length);
    infoEl.textContent = vollstaendig
      ? `${daten.length} Zeile(n) erkannt — Zuordnung vollständig.`
      : "Bitte Nachname und alle 9 Bereichsnoten zuordnen.";
    dlg.querySelector("#ni-kopf").innerHTML =
      "<tr>" + FELDER.map((f) => `<th>${esc(f.label)}</th>`).join("") + "</tr>";
    dlg.querySelector("#ni-vorschau").innerHTML = daten.slice(0, 5).map((z) =>
      "<tr>" + FELDER.map((f) => `<td>${esc(map[f.name] >= 0 ? (z[map[f.name]] || "") : "")}</td>`).join("") + "</tr>"
    ).join("");
    return map;
  }

  dlg.querySelector("#ni-datei").addEventListener("change", async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    if (!datei) return;
    try {
      const zeilen = csvParse(await datei.text());
      if (zeilen.length < 2) { meldung("CSV enthält keine Datenzeilen (Kopfzeile + mindestens eine Zeile nötig).", "fehler"); return; }
      header = zeilen[0]; daten = zeilen.slice(1);
      const map = csvAutoMap(header, FELDER);
      mappingEl.innerHTML = FELDER.map((f) => `
        <div class="bw-field">
          <label for="map_${f.name}">${esc(f.label)}</label>
          <select id="map_${f.name}" name="map_${f.name}">
            <option value="-1">— nicht importieren —</option>
            ${header.map((h, i) => `<option value="${i}"${map[f.name] === i ? " selected" : ""}>${esc(h || ("Spalte " + (i + 1)))}</option>`).join("")}
          </select>
        </div>`).join("");
      mappingEl.querySelectorAll("select").forEach((s) => s.addEventListener("change", aktualisiere));
      dlg.querySelector("#ni-zuordnung").hidden = false;
      aktualisiere();
    } catch (e) { console.error(e); meldung("CSV konnte nicht gelesen werden: " + e.message, "fehler"); }
  });

  dlg.querySelector("#ni-abbrechen").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const map = aktualisiere();
    const wert = (z, n) => map[n] >= 0 ? (z[map[n]] || "").trim() : "";
    const saetze = daten.map((z) => ({
      nachname: wert(z, "nachname"),
      vorname: wert(z, "vorname"),
      praxis: ["p1", "p2", "p3", "p4", "p5"].map((n) => wert(z, n)),
      kenntnis: ["k1", "k2", "k3", "k4"].map((n) => wert(z, n)),
    }));
    try {
      const r = await store.notenImportieren(saetze);
      meldung(`Noten-Import: ${zahl(r.gesetzt)} gespeichert, ${zahl(r.nichtGefunden)} ohne Treffer, ${zahl(r.unvollstaendig)} unvollständig.`);
      dlg.close();
      if (nachher) nachher();
    } catch (e) { console.error(e); meldung("Noten-Import fehlgeschlagen: " + e.message, "fehler"); }
  });

  dlg.showModal();
}

/* ------------------------------------------------------------- CRUD-Dialog */

function feldHtml(f, value, refOptionen) {
  const id = "f_" + f.name;
  let v = value == null ? "" : String(value);
  // Datumsfelder: gespeicherte ISO-/Date-Werte auf YYYY-MM-DD bringen, sonst
  // bleibt das <input type="date"> beim Bearbeiten leer (Pflichtfeld schlägt fehl).
  if (f.input === "date" && v) {
    const d = new Date(value);
    if (!isNaN(d)) v = d.toISOString().slice(0, 10);
  }
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

/* ------------------------------------------------------ Benutzerverwaltung */

async function renderBenutzer() {
  if (!istAdmin()) {
    appEl().innerHTML = `<h1>Benutzer</h1>
      <p class="bw-hinweis bw-hinweis--fehler">Kein Zugriff — nur für Administrator:innen.</p>`;
    return;
  }
  const liste = await store.benutzerListe();
  const zeile = (u) => `
    <tr>
      <td>${esc(u.benutzername)}</td>
      <td>${u.rolle === "admin" ? "Administrator:in" : "Benutzer:in"}</td>
      <td class="bw-toolbar" style="margin:0;gap:var(--bw-space-1)">
        <button class="bw-iconbtn" type="button" data-pw="${u.id}" data-name="${esc(u.benutzername)}" title="Passwort setzen" aria-label="Passwort für ${esc(u.benutzername)} setzen">${icon("stift")}</button>
        <button class="bw-iconbtn" type="button" data-del="${u.id}" data-name="${esc(u.benutzername)}" title="Entfernen" aria-label="Benutzer:in entfernen">${icon("muell")}</button>
      </td>
    </tr>`;
  appEl().innerHTML = `
    <h1>Benutzerverwaltung</h1>
    <p class="bw-unterzeile">Zugänge zur Suite anlegen und verwalten. Angemeldet als <strong>${esc(_benutzer.benutzername)}</strong>.</p>
    <p class="bw-hinweis">Hinweis: Diese Anmeldung ist eine <strong>leichte Zugangshürde</strong> für ein lokales Offline-Werkzeug — kein vollwertiger Schutz gegen direkten Geräte-/Dateizugriff. Personenbezogene Echtdaten nur über BITBW/LVN.</p>

    <section class="bw-card" aria-labelledby="bn-neu" style="margin-bottom:var(--bw-space-3)">
      <h2 id="bn-neu" style="margin-top:0">Neue:n Benutzer:in anlegen</h2>
      <div class="bw-toolbar" style="align-items:flex-end">
        <div class="bw-field" style="margin:0"><label for="bn-name">Benutzername</label><input id="bn-name" type="text" autocomplete="off"></div>
        <div class="bw-field" style="margin:0"><label for="bn-pass">Passwort</label><input id="bn-pass" type="text" autocomplete="off" placeholder="mind. 4 Zeichen"></div>
        <div class="bw-field" style="margin:0"><label for="bn-rolle">Rolle</label>
          <select id="bn-rolle"><option value="user">Benutzer:in</option><option value="admin">Administrator:in</option></select></div>
        <button class="bw-btn bw-btn--gelb" type="button" id="bn-anlegen">Anlegen</button>
      </div>
    </section>

    <div class="bw-tablewrap">
      <table class="bw-table">
        <thead><tr><th>Benutzername</th><th>Rolle</th><th><span class="bw-skip-link">Aktion</span></th></tr></thead>
        <tbody>${liste.map(zeile).join("")}</tbody>
      </table>
    </div>`;

  document.getElementById("bn-anlegen").addEventListener("click", async () => {
    const name = document.getElementById("bn-name").value;
    const pass = document.getElementById("bn-pass").value;
    const rolle = document.getElementById("bn-rolle").value;
    try {
      await store.benutzerAnlegen(name, pass, rolle);
      meldung(`Benutzer:in „${name}" angelegt.`);
      renderBenutzer();
    } catch (e) { meldung("Anlegen fehlgeschlagen: " + e.message, "fehler"); }
  });
  appEl().querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-del"), name = b.getAttribute("data-name");
    if (!confirm(`Benutzer:in „${name}" wirklich entfernen?`)) return;
    try { await store.benutzerLoeschen(id); meldung("Benutzer:in entfernt."); renderBenutzer(); }
    catch (e) { meldung("Entfernen fehlgeschlagen: " + e.message, "fehler"); }
  }));
  appEl().querySelectorAll("[data-pw]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-pw"), name = b.getAttribute("data-name");
    const neu = prompt(`Neues Passwort für „${name}" (mind. 4 Zeichen):`);
    if (neu == null) return;
    try { await store.passwortSetzen(id, neu); meldung(`Passwort für „${name}" gesetzt.`); }
    catch (e) { meldung("Passwort setzen fehlgeschlagen: " + e.message, "fehler"); }
  }));
}

/* ------------------------------------------------------- Rechtliche Seiten */

function rechtsSeite(titel, inhalt) {
  appEl().innerHTML = `<h1>${esc(titel)}</h1>${inhalt}
    <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-4)">Regierungspräsidium Freiburg — Ausbildungsberatung</p>`;
  document.getElementById("inhalt")?.focus?.();
}

function renderImpressum() {
  rechtsSeite("Impressum", `
    <p>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz).</p>
    <h2>Herausgeber</h2>
    <p>Regierungspräsidium Freiburg<br>Kaiser-Joseph-Straße 167<br>79098 Freiburg im Breisgau</p>
    <h2>Vertretung</h2>
    <p>Das Regierungspräsidium Freiburg wird durch die Regierungspräsidentin / den Regierungspräsidenten vertreten.</p>
    <h2>Kontakt</h2>
    <p>Telefon: 0761 208-0<br>E-Mail: poststelle@rpf.bwl.de</p>
    <h2>Zuständige Aufsichtsbehörde</h2>
    <p>Ministerium für Ländlichen Raum, Landwirtschaft und Heimat Baden-Württemberg.</p>
    <p class="bw-hinweis">Internes Werkzeug der Ausbildungsberatung. Die konkreten Verantwortlichen sind vor Veröffentlichung durch die Dienststelle zu ergänzen/zu prüfen.</p>`);
}

function renderDatenschutz() {
  rechtsSeite("Datenschutz", `
    <p>Dieses Werkzeug ist ein <strong>reines Offline-Tool</strong>. Alle Eingaben
       werden <strong>ausschließlich lokal</strong> im Browser dieses Geräts
       gespeichert (OPFS bzw. IndexedDB). Es werden <strong>keine Daten an Server
       oder Dritte übertragen</strong>, es gibt kein Tracking und keine externen
       Aufrufe (Zero-Trust, vollständig offline).</p>
    <h2>Verarbeitung</h2>
    <ul>
      <li>Verarbeitung lokal auf dem Gerät der nutzenden Stelle.</li>
      <li>Keine Übermittlung, keine Cookies, keine Analyse-/Tracking-Dienste.</li>
      <li>Die Anmeldung dient nur der lokalen Zugangsbeschränkung; Passwörter werden gesalzen und gehasht gespeichert (nicht im Klartext).</li>
    </ul>
    <h2>Personenbezogene Daten</h2>
    <p>Der produktive Umgang mit personenbezogenen Echtdaten erfolgt
       ausschließlich über die dafür vorgesehene Landesinfrastruktur (BITBW/LVN)
       gemäß den geltenden Vorgaben. Verantwortliche Stelle und Betroffenenrechte
       (Auskunft, Berichtigung, Löschung) richten sich nach der Datenschutz-
       erklärung des Regierungspräsidiums Freiburg.</p>
    <p class="bw-hinweis">Dieser Text ist eine werkzeugbezogene Kurzinformation und
       ersetzt nicht die amtliche Datenschutzerklärung der Dienststelle.</p>`);
}

function renderBarrierefreiheit() {
  rechtsSeite("Barrierefreiheit", `
    <p>Dieses Werkzeug ist nach den Vorgaben der Landesverwaltung
       (WCAG 2.1, Stufe AA) gestaltet: semantisches HTML, Tastaturbedienung,
       sichtbarer Fokus, ausreichende Kontraste und Rücksicht auf
       <code>prefers-reduced-motion</code>.</p>
    <h2>Feedback</h2>
    <p>Barrieren oder Verbesserungsvorschläge bitte an die Ausbildungsberatung des
       Regierungspräsidiums Freiburg melden (siehe <a href="#/impressum">Impressum</a>).</p>`);
}

/* --------------------------------------------------------------- Vorlagen
   Vordrucke für häufig versendete E-Mails/Schreiben der Ausbildungsberatung.
   Vollständig offline: Platzhalter werden ersetzt, Text ist editierbar und kann
   kopiert, als E-Mail geöffnet (mailto) oder gedruckt werden. */
// Gebündelte Formular-Anlagen (assets/anlagen/). Quelle/Stand werden im Tool
// angezeigt; Aktualität prüft die Dienststelle (siehe assets/anlagen/QUELLEN.md).
// Neue Datei: hier registrieren UND in assets/anlagen/ ablegen.
const ANLAGEN = {
  bav: {
    datei: "Berufsausbildungsvertrag-gruene-Berufe.pdf",
    label: "Berufsausbildungsvertrag (Muster, grüne Berufe)",
    mime: "application/pdf",
    stand: "Stand 05/2020",
    quelle: "RP Baden-Württemberg / RP Freiburg",
  },
  hilfestellung: {
    datei: "Hilfestellung-BAV.pdf",
    label: "Hilfestellung zur ausfüllbaren BAV-Vorlage",
    mime: "application/pdf",
    stand: "Stand siehe Dokument",
    quelle: "MLR/LEL Baden-Württemberg",
  },
  infoblatt: {
    datei: "Infoblatt-Azubi.pdf",
    label: "Infoblatt für Auszubildende",
    mime: "application/pdf",
    stand: "Stand 02/2026",
    quelle: "MLR/LEL Baden-Württemberg",
  },
  praktikantenvertrag: {
    datei: "Praktikantenvertrag.pdf",
    label: "Praktikantenvertrag (Muster)",
    mime: "application/pdf",
    stand: "Stand siehe Dokument",
    quelle: "MLR/LEL Baden-Württemberg",
  },
  abmeldung: {
    datei: "Abmeldung-Aufloesung-BAV.pdf",
    label: "Abmeldung/Auflösung Berufsausbildungsvertrag (ausfüllbar)",
    mime: "application/pdf",
    stand: "Stand siehe Dokument",
    quelle: "MLR/LEL Baden-Württemberg",
  },
};

const VORLAGEN = [
  { id: "ausbildung_info", titel: "Ausbildung — Information für Interessenten",
    betreff: "Ausbildung in den grünen Berufen — Informationen und Vordrucke",
    text: `{{anrede}}\n\nvielen Dank für Ihr Interesse an der Ausbildung in den grünen Berufen. Gerne fassen wir die wichtigsten Schritte zusammen:\n\n1. Anerkennung als Ausbildungsbetrieb (Eignung des Betriebs und der Ausbilder:innen).\n2. Abschluss des Berufsausbildungsvertrags (beiliegender Vordruck) — bitte vollständig ausfüllen und unterschrieben einreichen.\n3. Eintragung des Ausbildungsverhältnisses in das Verzeichnis der Berufsausbildungsverhältnisse.\n\nDie beigefügten Unterlagen (Vertragsvordruck, Ausfüllhilfe und Infoblatt) helfen beim Einstieg. Für Rückfragen und eine persönliche Beratung stehen wir gerne zur Verfügung.\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg`,
    anlagen: ["bav", "hilfestellung", "infoblatt"] },
  { id: "betriebsanerkennung", titel: "Betriebsanerkennung — Unterlagen anfordern",
    betreff: "Anerkennung als Ausbildungsbetrieb — benötigte Unterlagen",
    text: `{{anrede}}\n\nfür die Prüfung der Eignung Ihres Betriebs als Ausbildungsstätte benötigen wir folgende Unterlagen:\n\n{{checkliste}}\n\nBitte senden Sie uns die Unterlagen bis zum {{frist}} zu.\n\nFür Rückfragen stehen wir gerne zur Verfügung.\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg`,
    checkliste: [
      "Beschreibung des Ausbildungsbetriebs (Tätigkeitsfelder, Ausstattung, Flächen)",
      "Nachweis der persönlichen und fachlichen Eignung der Ausbilder:innen",
      "Angaben zu Art und Umfang der zu vermittelnden Ausbildungsinhalte",
    ] },
  { id: "ausbildereignung", titel: "Ausbildereignung — Nachweis anfordern",
    betreff: "Nachweis der Ausbildereignung (AEVO)",
    text: `{{anrede}}\n\nzur Anerkennung als Ausbilder:in benötigen wir den Nachweis der berufs- und arbeitspädagogischen Eignung (Ausbildereignungsverordnung — AEVO) sowie den Nachweis der fachlichen Eignung. Bitte reichen Sie bis zum {{frist}} ein:\n\n{{checkliste}}\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg`,
    checkliste: [
      "Tabellarischer Lebenslauf",
      "Nachweis der fachlichen Eignung (Berufsabschluss / Meister:in / vergleichbar)",
      "Nachweis der Ausbildereignung (AEVO-Prüfungszeugnis)",
      "ggf. weitere Zeugnisse/Bescheinigungen",
    ] },
  { id: "ausbildungsvertrag", titel: "Berufsausbildungsvertrag — Vordruck zusenden",
    betreff: "Berufsausbildungsvertrag — Vordruck und Hinweise",
    text: `{{anrede}}\n\nanbei erhalten Sie den Vordruck des Berufsausbildungsvertrags für die grünen Berufe sowie eine Ausfüllhilfe. Bitte füllen Sie den Vertrag vollständig aus und senden ihn in dreifacher Ausfertigung, unterschrieben von beiden Vertragsparteien, bis zum {{frist}} an uns zurück.\n\nNach Prüfung tragen wir das Ausbildungsverhältnis in das Verzeichnis der Berufsausbildungsverhältnisse ein.\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg`,
    anlagen: ["bav", "hilfestellung"] },
  { id: "aufloesung", titel: "Berufsausbildungsvertrag — Auflösung/Abmeldung",
    betreff: "Auflösung des Berufsausbildungsvertrags — Vordruck",
    text: `{{anrede}}\n\nfür die Beendigung bzw. vorzeitige Auflösung des Berufsausbildungsverhältnisses verwenden Sie bitte den beigefügten Vordruck „Abmeldung/Auflösung Berufsausbildungsvertrag".\n\nBitte senden Sie den vollständig ausgefüllten und von beiden Vertragsparteien unterschriebenen Vordruck bis zum {{frist}} an uns zurück. Wir nehmen die Abmeldung im Verzeichnis der Berufsausbildungsverhältnisse vor.\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg`,
    anlagen: ["abmeldung"] },
  { id: "berichtsheft", titel: "Berichtsheft / Ausbildungsnachweis anfordern",
    betreff: "Vorlage des Ausbildungsnachweises (Berichtsheft)",
    text: `{{anrede}}\n\nim Rahmen der Ausbildungsberatung bitten wir um Vorlage des aktuellen Ausbildungsnachweises (Berichtsheft) der/des Auszubildenden.\n\nBitte legen Sie den Nachweis bis zum {{frist}} vor (vollständig geführt und von Ausbilder:in und Auszubildender/Auszubildendem abgezeichnet).\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg` },
  { id: "beratungsgespraech", titel: "Einladung zum Beratungsgespräch",
    betreff: "Einladung zu einem Beratungsgespräch",
    text: `{{anrede}}\n\nzur Klärung offener Fragen im Ausbildungsverhältnis laden wir Sie zu einem Beratungsgespräch ein. Bitte schlagen Sie uns zwei mögliche Termine vor.\n\nZiel des Gesprächs ist eine einvernehmliche, im Sinne der Ausbildung tragfähige Lösung.\n\nMit freundlichen Grüßen\n{{bearbeiter}}\nAusbildungsberatung — Regierungspräsidium Freiburg` },
];

/** Bytes einer gebündelten Anlage laden — Standalone (eingebettet) oder per fetch. */
async function anlageBytes(datei) {
  if (window.__ANLAGEN__ && window.__ANLAGEN__[datei]) {
    const b64 = String(window.__ANLAGEN__[datei]).split(",").pop();
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const res = await fetch(`assets/anlagen/${datei}`);
  if (!res.ok) throw new Error(`Anlage nicht gefunden: ${datei}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Robustes Kopieren in die Zwischenablage (offline/file://-tauglich). */
async function inZwischenablage(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* Fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

async function renderVorlagen() {
  const heute = new Date().toLocaleDateString("de-DE");
  let betriebe = [];
  try { betriebe = await store.liste("betriebe"); } catch { betriebe = []; }
  appEl().innerHTML = `
    <h1>Vorlagen &amp; Vordrucke</h1>
    <p class="bw-unterzeile">Häufige Schreiben der Ausbildungsberatung — Platzhalter werden ersetzt, Text bleibt editierbar. Kopieren, als E-Mail-Entwurf (mit Anlagen) herunterladen oder drucken.</p>
    <div class="bw-flaechen">
      <section class="bw-card" aria-labelledby="vl-h" style="flex:1 1 18rem">
        <h2 id="vl-h" style="margin-top:0">Vordruck wählen</h2>
        <div class="bw-field"><label for="vl-auswahl">Vorlage</label>
          <select id="vl-auswahl">${VORLAGEN.map((v, i) => `<option value="${i}">${esc(v.titel)}</option>`).join("")}</select></div>
        ${betriebe.length ? `<div class="bw-field"><label for="vl-betrieb">Betrieb übernehmen <span class="bw-leise">(optional)</span></label>
          <select id="vl-betrieb">
            <option value="">— Betrieb wählen —</option>
            ${betriebe.map((b, i) => `<option value="${i}">${esc(b.name)}${b.ort ? " · " + esc(b.ort) : ""}${b.email ? "" : " (ohne E-Mail)"}</option>`).join("")}
          </select></div>` : ""}
        <div class="bw-field"><label for="vl-empf">Empfänger-E-Mail <span class="bw-leise">(für den Entwurf)</span></label>
          <input id="vl-empf" type="email" autocomplete="off" placeholder="name@betrieb.de"></div>
        <div class="bw-field"><label for="vl-anrede">Anrede</label>
          <input id="vl-anrede" type="text" value="Sehr geehrte Damen und Herren,"></div>
        <div class="bw-field"><label for="vl-frist">Frist</label>
          <input id="vl-frist" type="text" placeholder="z. B. 30.07.2026"></div>
        <p class="bw-klein bw-leise">Datum (${esc(heute)}) und Bearbeiter:in (${esc(_benutzer ? _benutzer.benutzername : "")}) werden automatisch eingesetzt.</p>
        <div id="vl-anlagen"></div>
      </section>
      <section class="bw-card" aria-labelledby="vl-text-h" style="flex:2 1 26rem">
        <h2 id="vl-text-h" style="margin-top:0">Text</h2>
        <div class="bw-field"><label for="vl-betreff">Betreff</label><input id="vl-betreff" type="text"></div>
        <div class="bw-field"><label for="vl-text">Schreiben</label>
          <textarea id="vl-text" rows="16" style="font:inherit;width:100%"></textarea></div>
        <div class="bw-toolbar" style="margin:0">
          <button class="bw-btn bw-btn--gelb" type="button" id="vl-eml">E-Mail-Entwurf (.eml) herunterladen</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="vl-kopieren">Text kopieren</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="vl-mail">Als E-Mail öffnen (ohne Anlagen)</button>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="vl-druck">Drucken</button>
        </div>
      </section>
    </div>`;

  const auswahl = document.getElementById("vl-auswahl");
  const empf = document.getElementById("vl-empf");
  const anrede = document.getElementById("vl-anrede");
  const frist = document.getElementById("vl-frist");
  const betreff = document.getElementById("vl-betreff");
  const textEl = document.getElementById("vl-text");
  const anlagenEl = document.getElementById("vl-anlagen");

  const aktuelleVorlage = () => VORLAGEN[Number(auswahl.value)] || VORLAGEN[0];

  const fuellen = () => {
    const v = aktuelleVorlage();
    const checkliste = (v.checkliste || []).map((c) => `- ${c}`).join("\n");
    betreff.value = v.betreff;
    textEl.value = v.text
      .replace(/\{\{anrede\}\}/g, anrede.value || "Sehr geehrte Damen und Herren,")
      .replace(/\{\{datum\}\}/g, heute)
      .replace(/\{\{frist\}\}/g, frist.value || "…")
      .replace(/\{\{checkliste\}\}/g, checkliste || "—")
      .replace(/\{\{bearbeiter\}\}/g, _benutzer ? _benutzer.benutzername : "");
    anlagenZeichnen();
  };

  const anlagenZeichnen = () => {
    const v = aktuelleVorlage();
    const ids = (v.anlagen || []).filter((id) => ANLAGEN[id]);
    if (!ids.length) { anlagenEl.innerHTML = ""; return; }
    anlagenEl.innerHTML = `
      <fieldset class="bw-fieldset" style="margin-top:var(--bw-space-2)">
        <legend>Anlagen mitschicken</legend>
        ${ids.map((id) => {
          const a = ANLAGEN[id];
          return `<div class="bw-check" style="align-items:flex-start">
            <input type="checkbox" id="vl-anl-${id}" data-anl="${id}" checked>
            <label for="vl-anl-${id}"><strong>${esc(a.label)}</strong><br>
              <span class="bw-klein bw-leise">${esc(a.stand)} · ${esc(a.quelle)}</span>
              <button class="bw-btn bw-btn--sekundaer bw-btn--klein" type="button" data-anl-dl="${id}" style="margin-left:var(--bw-space-2)">Herunterladen</button>
            </label>
          </div>`;
        }).join("")}
        <p class="bw-klein bw-leise" style="margin:var(--bw-space-2) 0 0">Angehakte Anlagen werden in den E-Mail-Entwurf (.eml) eingebettet.</p>
      </fieldset>`;
  };

  fuellen();
  auswahl.addEventListener("change", fuellen);
  anrede.addEventListener("input", fuellen);
  frist.addEventListener("input", fuellen);

  // Betrieb übernehmen: Empfänger-E-Mail und Anrede aus den Stammdaten vorbefüllen.
  const betriebSel = document.getElementById("vl-betrieb");
  betriebSel?.addEventListener("change", () => {
    const b = betriebe[Number(betriebSel.value)];
    if (!b) return;
    if (b.email) empf.value = b.email;
    anrede.value = b.ansprechpartner ? `Sehr geehrte/r ${b.ansprechpartner},` : "Sehr geehrte Damen und Herren,";
    fuellen();
    if (!b.email) meldung("Für diesen Betrieb ist keine E-Mail hinterlegt — bitte Empfänger ergänzen.", "fehler");
  });

  // Einzelne Anlage herunterladen (am frisch gerenderten Container gebunden).
  anlagenEl.addEventListener("click", async (ev) => {
    const id = ev.target.closest("[data-anl-dl]")?.getAttribute("data-anl-dl");
    if (!id || !ANLAGEN[id]) return;
    try {
      const a = ANLAGEN[id];
      const bytes = await anlageBytes(a.datei);
      dateiDownload(a.datei, bytes, a.mime);
      meldung(`Anlage „${a.label}" heruntergeladen.`);
    } catch (e) {
      meldung("Anlage konnte nicht geladen werden: " + (e && e.message), "fehler");
    }
  });

  document.getElementById("vl-eml").addEventListener("click", async () => {
    const v = aktuelleVorlage();
    const gewaehlt = Array.from(anlagenEl.querySelectorAll("[data-anl]:checked")).map((c) => c.getAttribute("data-anl"));
    try {
      const attachments = [];
      for (const id of gewaehlt) {
        const a = ANLAGEN[id];
        attachments.push({ filename: a.datei, mime: a.mime, base64: base64FromBytes(await anlageBytes(a.datei)) });
      }
      const eml = emlBauen({ to: empf.value.trim(), subject: betreff.value, body: textEl.value, attachments });
      dateiDownload(`Entwurf-${v.id}.eml`, eml, "message/rfc822");
      meldung(attachments.length
        ? `E-Mail-Entwurf mit ${attachments.length} Anlage(n) heruntergeladen — per Doppelklick in Outlook öffnen.`
        : "E-Mail-Entwurf heruntergeladen — per Doppelklick in Outlook öffnen.");
    } catch (e) {
      meldung("Entwurf konnte nicht erzeugt werden: " + (e && e.message), "fehler");
    }
  });

  document.getElementById("vl-kopieren").addEventListener("click", async () => {
    const ok = await inZwischenablage(textEl.value);
    meldung(ok ? "Text in die Zwischenablage kopiert." : "Kopieren nicht möglich — bitte Text manuell markieren und kopieren.", ok ? "erfolg" : "fehler");
  });
  document.getElementById("vl-mail").addEventListener("click", () => {
    const an = empf.value.trim();
    location.href = `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent(betreff.value)}&body=${encodeURIComponent(textEl.value)}`;
  });
  document.getElementById("vl-druck").addEventListener("click", () => {
    druckbereich().innerHTML = `<h1>${esc(betreff.value)}</h1><pre style="font:inherit;white-space:pre-wrap">${esc(textEl.value)}</pre>`;
    window.print();
  });
}

/* ------------------------------------------------------------- Berichtsheft */
const BH_AMPEL = {
  gruen: '<span class="bw-status-do" title="In Ordnung" aria-hidden="true">●</span>',
  gelb:  '<span aria-hidden="true" style="color:var(--bw-schwarz)">◐</span>',
  rot:   '<span class="bw-status-dont" title="Handlung nötig" aria-hidden="true">●</span>',
  grau:  '<span class="bw-leise" aria-hidden="true">○</span>',
};

/** Heutiges Datum als ISO (für die WV-Statusableitung). */
function heuteISO() { return bhIso(new Date()); }

async function renderBerichtsheft() {
  const heute = heuteISO();
  const rows = await store.berichtsheftUebersicht();
  const wv = await store.berichtsheftWiedervorlagen();
  const offeneMg = await store.berichtsheftOffeneMaengel();
  const termine = await store.berichtsheftTermine();
  const statistik = maengelHaeufung(await store.berichtsheftRasterAlle());
  const betriebe = maengelJeBetrieb(await store.berichtsheftRasterMitBetrieb());
  const wvOffen = wv
    .map((w) => ({ ...w, _stat: wvStatus(w.wiedervorlage_frist, w.wiedervorlage_erledigt, heute) }))
    .filter((w) => w._stat === "offen" || w._stat === "ueberfaellig");

  const eintraege = rows.map((r) => {
    const letzte = r.kontroll_id ? { ergebnis: r.ergebnis, maengel: r.maengel } : null;
    const stat = wvStatus(r.wiedervorlage_frist, r.wiedervorlage_erledigt, heute);
    const mg = offeneMg[r.pruefling_id] || 0;
    let a = bhAmpel(letzte, stat);
    // Offene Mängel im Wochenraster heben den Status auf „rot".
    if (mg > 0 && a.farbe !== "rot") a = { farbe: "rot", text: `Offene Mängel im Raster (${mg})` };
    return { ...r, _ampel: a, _wvStat: stat, _mg: mg };
  });
  const offen = eintraege.filter((e) => e._ampel.farbe === "rot").length;
  const nieKontrolliert = eintraege.filter((e) => e._ampel.farbe === "grau").length;

  appEl().innerHTML = `
    <h1>Berichtsheftkontrolle</h1>
    <p class="bw-unterzeile">Kontrolle der Ausbildungsnachweise (Berichtshefte) je Auszubildender:m — Ergebnis erfassen, Wiedervorlagen im Blick behalten.</p>

    <div class="bw-flaechen" style="margin-bottom:var(--bw-space-3)">
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Auszubildende</div><div style="font-size:1.5rem;font-weight:700">${zahl(eintraege.length)}</div></div>
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Wiedervorlagen offen</div><div style="font-size:1.5rem;font-weight:700">${zahl(wvOffen.length)}</div></div>
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Handlung nötig</div><div style="font-size:1.5rem;font-weight:700">${zahl(offen)}</div></div>
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Noch nie kontrolliert</div><div style="font-size:1.5rem;font-weight:700">${zahl(nieKontrolliert)}</div></div>
    </div>

    ${wvOffen.length ? `
    <section class="bw-card" aria-labelledby="bh-wv-h" style="margin-bottom:var(--bw-space-3)">
      <h2 id="bh-wv-h" style="margin-top:0">Wiedervorlagen</h2>
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Frist</th><th>Auszubildende:r</th><th>Anlass</th><th>Status</th><th></th></tr></thead>
          <tbody id="bh-wv-tbody">${wvOffen.map((w) => `
            <tr>
              <td>${esc(new Date(w.wiedervorlage_frist).toLocaleDateString("de-DE"))}</td>
              <td>${esc(w.nachname)}, ${esc(w.vorname)}</td>
              <td>${esc(ergebnisLabel(w.ergebnis))}</td>
              <td>${w._stat === "ueberfaellig" ? '<span class="bw-tag bw-tag--fehler">überfällig</span>' : '<span class="bw-tag bw-tag--aktiv">offen</span>'}</td>
              <td class="bw-actions"><button class="bw-btn bw-btn--sekundaer" type="button" data-wv-erledigt="${w.id}">erledigt</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>` : ""}

    <section class="bw-card" aria-labelledby="bh-term-h" style="margin-bottom:var(--bw-space-3)">
      <div class="bw-toolbar" style="margin:0 0 var(--bw-space-2);align-items:center">
        <h2 id="bh-term-h" style="margin:0;flex:1 1 auto">Kontrolltermine</h2>
        <button class="bw-btn bw-btn--gelb" type="button" id="bh-term-neu">Termin planen</button>
      </div>
      ${termine.length ? `<div class="bw-tablewrap"><table class="bw-table">
        <thead><tr><th>Datum</th><th>Betrieb / Gruppe</th><th>Art</th><th>Status</th><th></th></tr></thead>
        <tbody id="bh-term-tbody">${termine.map((t) => `<tr>
          <td>${esc(new Date(t.datum).toLocaleDateString("de-DE"))}</td>
          <td>${esc(t.betrieb || t.gruppe || "—")}${t.betrieb && t.gruppe ? " · " + esc(t.gruppe) : ""}</td>
          <td>${t.typ === "einsendung" ? "Einsendung" : "Schulkontrolle"}</td>
          <td>${t.status === "durchgefuehrt" ? '<span class="bw-tag bw-tag--ok">durchgeführt</span>' : (t.status === "abgesagt" ? '<span class="bw-tag">abgesagt</span>' : '<span class="bw-tag bw-tag--aktiv">geplant</span>')}</td>
          <td class="bw-actions" style="white-space:nowrap">
            ${t.status === "geplant" ? `<button class="bw-btn bw-btn--sekundaer" type="button" data-term-fertig="${t.id}">erledigt</button>` : ""}
            <button class="bw-iconbtn" type="button" data-term-edit="${t.id}" title="Bearbeiten" aria-label="Termin bearbeiten">${icon("stift")}</button>
            <button class="bw-iconbtn" type="button" data-term-del="${t.id}" title="Löschen" aria-label="Termin löschen">${icon("muell")}</button>
          </td></tr>`).join("")}</tbody></table></div>`
        : '<p class="bw-leise bw-klein">Keine Kontrolltermine geplant.</p>'}
    </section>

    <section class="bw-card" aria-labelledby="bh-ausw-h" style="margin-bottom:var(--bw-space-3)">
      <h2 id="bh-ausw-h" style="margin-top:0">Mängel-Auswertung</h2>
      <p class="bw-klein bw-leise" style="margin-top:0">Häufung der Mängel und Fehltage über alle Wochenraster — wo systematisch nachgehakt werden muss.</p>
      ${betriebe.length ? `<div class="bw-toolbar" style="margin:0 0 var(--bw-space-2)">
        <button class="bw-btn bw-btn--sekundaer" type="button" id="bh-ausw-csv">Auswertung als CSV</button>
      </div>` : ""}
      <div class="bw-flaechen" style="margin-bottom:var(--bw-space-3)">
        <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Mängel gesamt</div><div style="font-size:1.5rem;font-weight:700">${zahl(statistik.maengelGesamt)}</div></div>
        <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Wochen mit Mängeln</div><div style="font-size:1.5rem;font-weight:700">${zahl(statistik.wochenMitMaengeln)}</div></div>
        <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Fehltage gesamt</div><div style="font-size:1.5rem;font-weight:700">${zahl(statistik.fehltageSumme)}</div></div>
        <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Wochen mit Fehltagen</div><div style="font-size:1.5rem;font-weight:700">${zahl(statistik.wochenMitFehltagen)}</div></div>
      </div>
      ${statistik.maengel.length ? `
      <div id="bh-maengel-diagramm"></div>
      <div class="bw-tablewrap" style="margin-top:var(--bw-space-3)">
        <table class="bw-table">
          <thead><tr><th>Code</th><th>Mangel</th><th>Anzahl</th></tr></thead>
          <tbody>${statistik.maengel.map((m) => `
            <tr><td>${esc(m.code)}</td><td>${esc(m.label)}</td><td>${zahl(m.value)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`
        : '<p class="bw-leise bw-klein">Noch keine Mängel im Wochenraster erfasst.</p>'}
      ${betriebe.length ? `
      <h3 style="margin:var(--bw-space-3) 0 var(--bw-space-2)">Mängel je Betrieb</h3>
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Betrieb</th><th>Mängel</th><th>Fehltage</th><th>Wochen</th></tr></thead>
          <tbody>${betriebe.slice(0, 10).map((b) => `
            <tr><td>${esc(b.betrieb)}</td><td>${zahl(b.maengel)}</td><td>${zahl(b.fehltage)}</td><td>${zahl(b.wochen)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      ${betriebe.length > 10 ? `<p class="bw-klein bw-leise">Top 10 von ${zahl(betriebe.length)} Betrieben mit Mängeln/Fehltagen.</p>` : ""}` : ""}
    </section>

    <section class="bw-card" aria-labelledby="bh-liste-h">
      <h2 id="bh-liste-h" style="margin-top:0">Auszubildende</h2>
      <div class="bw-search" style="margin-bottom:var(--bw-space-2)">
        <label for="bh-suche" class="bw-skip-link">Auszubildende durchsuchen</label>
        <input id="bh-suche" type="search" placeholder="Suchen (Name, Betrieb, Fachrichtung) …" autocomplete="off">
      </div>
      <div class="bw-toolbar" style="margin:0 0 var(--bw-space-2)">
        <button class="bw-btn bw-btn--sekundaer" type="button" id="bh-csv">CSV exportieren</button>
        <button class="bw-btn bw-btn--sekundaer" type="button" id="bh-druck">Liste drucken</button>
      </div>
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Status</th><th>Name</th><th>Betrieb</th><th>Letzte Kontrolle</th><th>Ergebnis</th><th></th></tr></thead>
          <tbody id="bh-tbody"></tbody>
        </table>
      </div>
      <p id="bh-leer" class="bw-leise bw-klein" hidden>Keine Auszubildenden gefunden.</p>
    </section>`;

  // Mängel-Häufung als CI-konformes Balkendiagramm (häufigster Mangel hervorgehoben).
  const diagrammEl = document.getElementById("bh-maengel-diagramm");
  if (diagrammEl && window.bwChart && statistik.maengel.length) {
    const maxWert = Math.max.apply(null, statistik.maengel.map((m) => m.value));
    window.bwChart.bars(
      diagrammEl,
      statistik.maengel.map((m) => ({ label: m.code, value: m.value, highlight: m.value === maxWert })),
      { titel: "Mängel je Code", max: Math.max(1, maxWert) }
    );
  }

  // Mängel-Auswertung als CSV (Code-Häufung + Mängel je Betrieb in einer Datei).
  document.getElementById("bh-ausw-csv")?.addEventListener("click", () => {
    const linien = [];
    linien.push(["Mängelcode", "Bezeichnung", "Anzahl"].map(csvFeld).join(";"));
    statistik.maengel.forEach((m) => linien.push([m.code, m.label, m.value].map(csvFeld).join(";")));
    linien.push("");
    linien.push(["Betrieb", "Mängel", "Fehltage", "Wochen"].map(csvFeld).join(";"));
    betriebe.forEach((b) => linien.push([b.betrieb, b.maengel, b.fehltage, b.wochen].map(csvFeld).join(";")));
    const csv = "﻿" + linien.join("\r\n") + "\r\n";
    dateiDownload("Berichtsheft-Maengel-Auswertung.csv", csv, "text/csv;charset=utf-8");
    meldung("Mängel-Auswertung als CSV exportiert.");
  });

  const tbody = document.getElementById("bh-tbody");
  const sucheEl = document.getElementById("bh-suche");
  let gefiltert = eintraege;

  function zeichne() {
    tbody.innerHTML = gefiltert.map((e) => `
      <tr>
        <td title="${esc(e._ampel.text)}">${BH_AMPEL[e._ampel.farbe]} <span class="bw-klein">${esc(e._ampel.text)}</span></td>
        <td><a href="#/pruefling/${e.pruefling_id}">${esc(e.nachname)}, ${esc(e.vorname)}</a></td>
        <td>${esc(e.betrieb || "—")}</td>
        <td>${e.datum ? esc(new Date(e.datum).toLocaleDateString("de-DE")) : "—"}</td>
        <td>${e.kontroll_id ? esc(ergebnisLabel(e.ergebnis)) : "<span class='bw-leise'>—</span>"}</td>
        <td class="bw-actions" style="white-space:nowrap">
          <a class="bw-btn bw-btn--gelb" href="#/berichtsheft/${e.pruefling_id}">Raster</a>
          <button class="bw-btn bw-btn--sekundaer" type="button" data-kontrolle="${e.pruefling_id}">Kontrolle</button>
          <button class="bw-btn bw-btn--sekundaer bw-btn--klein" type="button" data-beratung="${e.pruefling_id}" title="Beratungsfall aus diesem Berichtsheft anlegen">Beratungsfall</button>
        </td>
      </tr>`).join("");
    document.getElementById("bh-leer").hidden = gefiltert.length > 0;
  }

  function filtern() {
    const q = sucheEl.value.trim();
    if (!q) { gefiltert = eintraege; zeichne(); return; }
    if (window.bwSearch) {
      gefiltert = window.bwSearch.search(eintraege, q, { fields: ["nachname", "vorname", "betrieb", "beruf"] });
    } else {
      const n = q.toLowerCase();
      gefiltert = eintraege.filter((e) => `${e.nachname} ${e.vorname} ${e.betrieb || ""} ${e.beruf || ""}`.toLowerCase().includes(n));
    }
    zeichne();
  }
  zeichne();
  sucheEl.addEventListener("input", debounce(filtern, 150));

  tbody.addEventListener("click", (ev) => {
    const id = ev.target.closest("[data-kontrolle]")?.getAttribute("data-kontrolle");
    if (id) {
      const e = eintraege.find((x) => String(x.pruefling_id) === String(id));
      kontrolleDialog(Number(id), e ? `${e.nachname}, ${e.vorname}` : "", () => route());
      return;
    }
    // Beratungsfall aus dem Berichtsheft anlegen (vorbefüllt: Person, Betrieb,
    // Kategorie „Berichtsheft", Beschreibung mit Mängel-/Ergebnis-Anlass).
    const bid = ev.target.closest("[data-beratung]")?.getAttribute("data-beratung");
    if (bid) {
      const e = eintraege.find((x) => String(x.pruefling_id) === String(bid));
      if (!e) return;
      const anlass = e._mg > 0
        ? `Offene Mängel im Wochenraster (${e._mg}).`
        : (e.kontroll_id ? `Letzte Kontrolle: ${ergebnisLabel(e.ergebnis)}.` : "Noch keine Kontrolle erfasst.");
      beratungFallDialog({
        pruefling_id: e.pruefling_id,
        betrieb: e.betrieb || "",
        titel: `Berichtsheft: ${e.nachname}, ${e.vorname}`,
        kategorie: "Berichtsheft",
        beschreibung: `Anlass aus der Berichtsheftkontrolle. ${anlass}`,
      }, () => route());
    }
  });
  // WV-„erledigt" am frisch gerenderten Tabellenkörper (nicht am bleibenden #app).
  document.getElementById("bh-wv-tbody")?.addEventListener("click", async (ev) => {
    const wvId = ev.target.closest("[data-wv-erledigt]")?.getAttribute("data-wv-erledigt");
    if (!wvId) return;
    await store.berichtsheftWvErledigen(Number(wvId), true);
    meldung("Wiedervorlage als erledigt markiert.");
    route();
  });

  document.getElementById("bh-csv").addEventListener("click", () => {
    const kopf = ["Nachname", "Vorname", "Betrieb", "Fachrichtung", "Status", "Letzte Kontrolle", "Ergebnis", "Wiedervorlage"];
    const zeilen = eintraege.map((e) => [
      e.nachname, e.vorname, e.betrieb || "", e.beruf || "", e._ampel.text,
      e.datum ? new Date(e.datum).toLocaleDateString("de-DE") : "",
      e.kontroll_id ? ergebnisLabel(e.ergebnis) : "",
      e.wiedervorlage_frist && !e.wiedervorlage_erledigt ? new Date(e.wiedervorlage_frist).toLocaleDateString("de-DE") : "",
    ]);
    dateiDownload("berichtsheftkontrolle.csv", csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`CSV exportiert: ${zahl(eintraege.length)} Auszubildende.`);
  });

  document.getElementById("bh-druck").addEventListener("click", () => {
    const heuteTxt = new Date().toLocaleDateString("de-DE");
    const zeilen = (gefiltert.length ? gefiltert : eintraege).map((e) => `
      <tr>
        <td>${esc(e.nachname)}, ${esc(e.vorname)}</td>
        <td>${esc(e.betrieb || "—")}</td>
        <td>${esc(e._ampel.text)}</td>
        <td>${e.datum ? esc(new Date(e.datum).toLocaleDateString("de-DE")) : "—"}</td>
        <td>${e.kontroll_id ? esc(ergebnisLabel(e.ergebnis)) : "—"}</td>
        <td>${e.wiedervorlage_frist && !e.wiedervorlage_erledigt ? esc(new Date(e.wiedervorlage_frist).toLocaleDateString("de-DE")) : ""}</td>
      </tr>`).join("");
    druckbereich().innerHTML = `
      <h1>Berichtsheftkontrolle — Übersicht</h1>
      <p>Stand: ${esc(heuteTxt)} · ${zahl((gefiltert.length ? gefiltert : eintraege).length)} Auszubildende</p>
      <table><thead><tr><th>Name</th><th>Betrieb</th><th>Status</th><th>Letzte Kontrolle</th><th>Ergebnis</th><th>Wiedervorlage</th></tr></thead>
      <tbody>${zeilen}</tbody></table>`;
    window.print();
  });

  // Kontrolltermine: planen / bearbeiten / erledigt / löschen.
  document.getElementById("bh-term-neu").addEventListener("click", () => berichtsheftTerminDialog(null, () => route()));
  document.getElementById("bh-term-tbody")?.addEventListener("click", async (ev) => {
    const fertig = ev.target.closest("[data-term-fertig]")?.getAttribute("data-term-fertig");
    const edit = ev.target.closest("[data-term-edit]")?.getAttribute("data-term-edit");
    const del = ev.target.closest("[data-term-del]")?.getAttribute("data-term-del");
    if (fertig) { await store.berichtsheftTerminAktualisieren(Number(fertig), { status: "durchgefuehrt" }); meldung("Termin als durchgeführt markiert."); route(); return; }
    if (edit) { const t = termine.find((x) => String(x.id) === edit); berichtsheftTerminDialog(t, () => route()); return; }
    if (del) { if (confirm("Kontrolltermin löschen?")) { await store.berichtsheftTerminLoeschen(Number(del)); meldung("Termin gelöscht."); route(); } }
  });

  document.getElementById("inhalt")?.focus?.();
}

/* ----------------------------------- Berichtsheft: Kontrolltermin-Dialog */
async function berichtsheftTerminDialog(termin, nachher) {
  const alt = document.getElementById("dialog"); if (alt) alt.remove();
  const t = termin || {};
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog"; dlg.id = "dialog";
  dlg.innerHTML = `
    <form method="dialog" novalidate>
      <h2 style="margin-top:0">${termin ? "Kontrolltermin bearbeiten" : "Kontrolltermin planen"}</h2>
      <div class="bw-dialog__felder">
        <div class="bw-field"><label for="bt-datum">Datum</label>
          <input id="bt-datum" type="date" required value="${esc(t.datum ? bhIso(new Date(t.datum)) : heuteISO())}"></div>
        <div class="bw-field"><label for="bt-typ">Art</label>
          <select id="bt-typ"><option value="schulkontrolle"${t.typ !== "einsendung" ? " selected" : ""}>Schulkontrolle</option><option value="einsendung"${t.typ === "einsendung" ? " selected" : ""}>Einsendung</option></select></div>
        <div class="bw-field"><label for="bt-betrieb">Betrieb</label>
          <input id="bt-betrieb" type="text" value="${esc(t.betrieb || "")}"></div>
        <div class="bw-field"><label for="bt-gruppe">Gruppe / Klasse</label>
          <input id="bt-gruppe" type="text" value="${esc(t.gruppe || "")}"></div>
        <div class="bw-field"><label for="bt-status">Status</label>
          <select id="bt-status">
            <option value="geplant"${(t.status || "geplant") === "geplant" ? " selected" : ""}>geplant</option>
            <option value="durchgefuehrt"${t.status === "durchgefuehrt" ? " selected" : ""}>durchgeführt</option>
            <option value="abgesagt"${t.status === "abgesagt" ? " selected" : ""}>abgesagt</option>
          </select></div>
      </div>
      <div class="bw-field"><label for="bt-bem">Bemerkung</label>
        <textarea id="bt-bem" rows="2" style="font:inherit;width:100%">${esc(t.bemerkung || "")}</textarea></div>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="bt-abbr">Abbrechen</button>
        <button type="button" class="bw-btn bw-btn--gelb" id="bt-speichern">Speichern</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#bt-abbr").addEventListener("click", () => dlg.close());
  dlg.querySelector("#bt-speichern").addEventListener("click", async () => {
    const datum = dlg.querySelector("#bt-datum").value;
    if (!datum) { meldung("Bitte ein Datum angeben.", "fehler"); return; }
    const daten = {
      datum, typ: dlg.querySelector("#bt-typ").value, betrieb: dlg.querySelector("#bt-betrieb").value.trim() || null,
      gruppe: dlg.querySelector("#bt-gruppe").value.trim() || null, status: dlg.querySelector("#bt-status").value,
      bemerkung: dlg.querySelector("#bt-bem").value.trim() || null,
    };
    try {
      if (termin) await store.berichtsheftTerminAktualisieren(termin.id, daten);
      else await store.berichtsheftTerminAnlegen(daten);
      meldung("Kontrolltermin gespeichert."); dlg.close();
    } catch (e) { console.error(e); meldung("Konnte nicht speichern: " + e.message, "fehler"); }
  });
  dlg.addEventListener("close", () => { dlg.remove(); if (nachher) nachher(); });
  dlg.showModal();
}

/* ------------------------------------------- Berichtsheft: Kontrolle erfassen */
async function kontrolleDialog(prueflingId, name, nachher) {
  const alt = document.getElementById("dialog");
  if (alt) alt.remove();
  const heute = heuteISO();
  const bisher = await store.berichtsheftFuerPruefling(prueflingId);
  // Nächsten geplanten Kontrolltermin für die WV-Frist-Vorgabe holen.
  let naechsterTermin = null;
  try {
    const t = await store.berichtsheftNaechsterTermin();
    naechsterTermin = t ? bhIso(new Date(t)) : null;
  } catch { /* ignore */ }

  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog bw-dialog--breit";
  dlg.id = "dialog";
  const ergebnisOptions = ERGEBNISSE.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join("");
  dlg.innerHTML = `
    <form method="dialog" id="bh-form" novalidate>
      <h2 style="margin-top:0">Kontrolle erfassen — ${esc(name)}</h2>
      <div class="bw-dialog__felder">
        <div class="bw-field"><label for="bh-datum">Kontrolldatum</label>
          <input id="bh-datum" type="date" value="${esc(heute)}" required></div>
        <div class="bw-field"><label for="bh-aj">Ausbildungsjahr</label>
          <select id="bh-aj"><option value="1">1. Jahr</option><option value="2">2. Jahr</option><option value="3">3. Jahr</option><option value="4">4. Jahr</option></select></div>
        <div class="bw-field"><label for="bh-nr">Durchsicht-Nr.</label>
          <input id="bh-nr" type="number" min="1" max="9" step="1" value="1"></div>
        <div class="bw-field"><label for="bh-ergebnis">Ergebnis</label>
          <select id="bh-ergebnis">${ergebnisOptions}</select></div>
        <div class="bw-field"><label for="bh-fehltage">Fehltage</label>
          <input id="bh-fehltage" type="number" min="0" max="999" step="1" value="0"></div>
        <div class="bw-field"><label for="bh-maengel">Mängelcodes <span class="bw-leise">(z. B. A,D)</span></label>
          <input id="bh-maengel" type="text" placeholder="A,B,…"></div>
      </div>
      <div class="bw-field" id="bh-wv-feld" hidden>
        <label for="bh-wv">Wiedervorlage bis</label>
        <input id="bh-wv" type="date">
        <p class="bw-klein bw-leise" style="margin:.3em 0 0">Vorgeschlagen aus Ergebnis/nächstem Termin — anpassbar.</p>
      </div>
      <div class="bw-field"><label for="bh-bemerkung">Bemerkung</label>
        <textarea id="bh-bemerkung" rows="3" style="font:inherit;width:100%"></textarea></div>
      <p id="bh-empf" class="bw-hinweis bw-hinweis--erfolg" hidden></p>
      ${bisher.length ? `<details style="margin-top:var(--bw-space-2)"><summary>Bisherige Kontrollen (${zahl(bisher.length)})</summary>
        <ul class="bw-klein">${bisher.map((b) => `<li>${esc(new Date(b.datum).toLocaleDateString("de-DE"))} · ${esc(ergebnisLabel(b.ergebnis))}${b.ausbildungsjahr ? ` · ${b.ausbildungsjahr}. AJ` : ""}${b.durchsicht_nr ? `/Durchsicht ${b.durchsicht_nr}` : ""}</li>`).join("")}</ul></details>` : ""}
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="bh-abbrechen">Abbrechen</button>
        <button type="button" class="bw-btn bw-btn--gelb" id="bh-speichern">Speichern</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const ergEl = dlg.querySelector("#bh-ergebnis");
  const wvFeld = dlg.querySelector("#bh-wv-feld");
  const wvEl = dlg.querySelector("#bh-wv");
  const empfEl = dlg.querySelector("#bh-empf");

  function syncErgebnis() {
    const erg = ergEl.value;
    const brauchtWv = brauchtWiedervorlage(erg);
    wvFeld.hidden = !brauchtWv;
    if (brauchtWv && !wvEl.value) {
      const f = naechsteFrist(erg, naechsterTermin, heute);
      if (f) wvEl.value = f;
    }
    // Zulassungs-EMPFEHLUNG (nur Hinweis, überschreibt nichts).
    const fehltage = Number(dlg.querySelector("#bh-fehltage").value || 0);
    const empf = zulassungsEmpfehlung({ ergebnis: erg, maengel: dlg.querySelector("#bh-maengel").value, fehltageProzent: 0, wvOffen: brauchtWv });
    empfEl.hidden = !empf;
    if (empf) empfEl.textContent = "Empfehlung: Voraussetzungen für die Prüfungszulassung erfüllt (keine offenen Mängel/Wiedervorlagen).";
  }
  ergEl.addEventListener("change", syncErgebnis);
  dlg.querySelector("#bh-maengel").addEventListener("input", syncErgebnis);
  dlg.querySelector("#bh-fehltage").addEventListener("input", syncErgebnis);
  syncErgebnis();

  dlg.querySelector("#bh-abbrechen").addEventListener("click", () => dlg.close());
  dlg.querySelector("#bh-speichern").addEventListener("click", async () => {
    const datum = dlg.querySelector("#bh-datum").value;
    if (!datum) { meldung("Bitte ein Kontrolldatum angeben.", "fehler"); return; }
    try {
      await store.berichtsheftSpeichern({
        prueflingId,
        datum,
        ausbildungsjahr: dlg.querySelector("#bh-aj").value,
        durchsichtNr: dlg.querySelector("#bh-nr").value,
        ergebnis: ergEl.value,
        maengel: dlg.querySelector("#bh-maengel").value.trim().toUpperCase() || null,
        fehltage: dlg.querySelector("#bh-fehltage").value,
        bemerkung: dlg.querySelector("#bh-bemerkung").value.trim() || null,
        wiedervorlageFrist: brauchtWiedervorlage(ergEl.value) ? (wvEl.value || null) : null,
      });
      meldung("Kontrolle gespeichert.");
      dlg.close();
    } catch (e) {
      console.error(e);
      meldung("Konnte nicht speichern: " + e.message, "fehler");
    }
  });
  dlg.addEventListener("close", () => { dlg.remove(); if (nachher) nachher(); });
  dlg.showModal();
}

/* ------------------------------- Berichtsheft: Wochenraster (Tastatur-Schnellkontrolle) */
const RASTER_AJ = 3; // grüne Berufe: 3 Ausbildungsjahre

async function renderBerichtsheftRaster(prueflingIdRaw) {
  const prueflingId = Number(prueflingIdRaw);
  const p = await store.holen("prueflinge", prueflingId);
  if (!p) { appEl().innerHTML = `<div class="bw-hinweis bw-hinweis--fehler">Auszubildende:r nicht gefunden.</div>`; return; }

  // Zellen laden -> Map "aj:kw" -> Zelle.
  const zellen = await store.berichtsheftKwLaden(prueflingId);
  const map = new Map();
  zellen.forEach((z) => map.set(`${z.ausbildungsjahr}:${z.kalenderwoche}`, z));
  const zelle = (aj, kw) => map.get(`${aj}:${kw}`) || { ausbildungsjahr: aj, kalenderwoche: kw, maengel: "", behobene: "", fehltage: 0, geprueft: false, bemerkung: "" };

  const statusKlasse = { issue: "bw-kw--issue", ok: "bw-kw--ok", behoben: "bw-kw--behoben", fehltage: "bw-kw--fehltage", leer: "" };

  function zellHTML(aj, kw, idx) {
    const z = zelle(aj, kw);
    const st = zellenStatus(z);
    const codes = codesAlsListe(z.maengel).filter((c) => c !== "H").join(" ");
    const fehl = Number(z.fehltage || 0);
    const titel = `${aj}. Ausbildungsjahr, KW ${kw}` + (codes ? ` — Mängel: ${codes}` : "") + (fehl ? ` — Fehltage: ${fehl}` : "");
    return `<div class="bw-kw ${statusKlasse[st] || ""}" role="gridcell" tabindex="${idx === 0 ? 0 : -1}"
        data-aj="${aj}" data-kw="${kw}" data-idx="${idx}" title="${esc(titel)}" aria-label="${esc(titel)}">
        <span class="bw-kw__num">${kw}</span>
        <span class="bw-kw__codes">${esc(codes)}</span>
        ${fehl ? `<span class="bw-kw__fehl">${fehl}</span>` : ""}
      </div>`;
  }

  // Globaler Index über alle AJ/KW für die Pfeil-Navigation.
  let idx = 0;
  const jahrSektionen = [];
  for (let aj = 1; aj <= RASTER_AJ; aj++) {
    const fehlSumme = KW_ORDER.reduce((s, kw) => s + Number(zelle(aj, kw).fehltage || 0), 0);
    const cells = KW_ORDER.map((kw) => zellHTML(aj, kw, idx++)).join("");
    jahrSektionen.push(`
      <div class="bw-kw-jahr"><h3>${aj}. Ausbildungsjahr</h3>
        <span class="bw-klein bw-leise">Fehltage gesamt: <strong data-fehlsum="${aj}">${zahl(fehlSumme)}</strong></span></div>
      <div class="bw-kw-wrap"><div class="bw-kw-grid" role="grid" aria-label="${aj}. Ausbildungsjahr">${cells}</div></div>`);
  }
  const gesamtZellen = idx;

  const legende = MAENGEL_CODES.map((m) => `<span class="leg"><kbd>${m.code}</kbd>${esc(m.label)}</span>`).join("");

  appEl().innerHTML = `
    <p class="bw-klein"><a href="#/berichtsheft">← Berichtsheftkontrolle</a></p>
    <div class="bw-toolbar" style="align-items:center">
      <h1 style="flex:1 1 auto;margin:0">Wochenraster — ${esc(p.nachname)}, ${esc(p.vorname)}</h1>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="bh-raster-druck">Kontroll-Liste drucken</button>
    </div>
    <p class="bw-unterzeile">${esc(p.beruf || "")}${p.betrieb ? " · " + esc(p.betrieb) : ""} — schnelle Kontrolle per Tastatur: Zelle wählen, Buchstabe tippt den Mängelcode.</p>

    <div class="bw-hinweis">
      <strong>Tastatur:</strong>
      <span class="bw-kw-legend" style="margin-top:.4em">
        <span class="leg"><kbd>←→↑↓</kbd> Navigieren</span>
        <span class="leg"><kbd>A</kbd>–<kbd>G</kbd>,<kbd>I</kbd> Mangel an/aus</span>
        <span class="leg"><kbd>0</kbd>–<kbd>7</kbd> Fehltage</span>
        <span class="leg"><kbd>O</kbd> ohne Beanstandung</span>
        <span class="leg"><kbd>Entf</kbd> leeren (→ behoben)</span>
        <span class="leg"><kbd>Leer</kbd>/<kbd>Enter</kbd> Detail</span>
      </span>
    </div>

    <div id="bh-raster">${jahrSektionen.join("")}</div>

    <details style="margin-top:var(--bw-space-3)"><summary>Mängelcodes</summary>
      <div class="bw-kw-legend">${legende}</div></details>`;

  // Listener am frisch gerenderten Container (nicht am bleibenden #app).
  const gridRoot = document.getElementById("bh-raster");
  const zelleEl = (i) => gridRoot.querySelector(`.bw-kw[data-idx="${i}"]`);

  function fokus(i) {
    const ziel = zelleEl(Math.max(0, Math.min(gesamtZellen - 1, i)));
    if (!ziel) return;
    gridRoot.querySelectorAll(".bw-kw[tabindex='0']").forEach((c) => c.setAttribute("tabindex", "-1"));
    ziel.setAttribute("tabindex", "0");
    ziel.focus();
  }

  // Zelle neu zeichnen nach Änderung (ohne kompletten Re-Render).
  function neuZeichnen(el) {
    const aj = Number(el.dataset.aj), kw = Number(el.dataset.kw), i = Number(el.dataset.idx);
    const z = zelle(aj, kw);
    const st = zellenStatus(z);
    el.className = "bw-kw " + (statusKlasse[st] || "");
    const codes = codesAlsListe(z.maengel).filter((c) => c !== "H").join(" ");
    const fehl = Number(z.fehltage || 0);
    el.innerHTML = `<span class="bw-kw__num">${kw}</span><span class="bw-kw__codes">${esc(codes)}</span>${fehl ? `<span class="bw-kw__fehl">${fehl}</span>` : ""}`;
    el.setAttribute("tabindex", String(i === 0 ? 0 : -1));
    // Fehltage-Summe des Jahres aktualisieren.
    const sum = KW_ORDER.reduce((s, k) => s + Number(zelle(aj, k).fehltage || 0), 0);
    const sumEl = gridRoot.querySelector(`[data-fehlsum="${aj}"]`);
    if (sumEl) sumEl.textContent = zahl(sum);
  }

  async function speichern(aj, kw, z) {
    map.set(`${aj}:${kw}`, { ...z, ausbildungsjahr: aj, kalenderwoche: kw });
    try { await store.berichtsheftKwSetzen(prueflingId, aj, kw, z); }
    catch (e) { console.error(e); meldung("Konnte Zelle nicht speichern: " + e.message, "fehler"); }
  }

  // Code an-/abschalten (geprüft = true sobald bearbeitet).
  async function codeUmschaltenZelle(el, code) {
    const aj = Number(el.dataset.aj), kw = Number(el.dataset.kw);
    const z = { ...zelle(aj, kw) };
    z.maengel = codeUmschalten(z.maengel, code);
    z.geprueft = true;
    await speichern(aj, kw, z);
    neuZeichnen(el);
  }
  async function fehltageSetzen(el, n) {
    const aj = Number(el.dataset.aj), kw = Number(el.dataset.kw);
    const z = { ...zelle(aj, kw) };
    z.fehltage = Math.max(0, Math.min(7, n));
    // „H" spiegelt nur die Existenz von Fehltagen.
    const ohneH = codesAlsListe(z.maengel).filter((c) => c !== "H");
    z.maengel = (z.fehltage > 0 ? [...ohneH, "H"] : ohneH).sort().join(",");
    z.geprueft = true;
    await speichern(aj, kw, z);
    neuZeichnen(el);
  }
  async function alsOk(el) {
    const aj = Number(el.dataset.aj), kw = Number(el.dataset.kw);
    await speichern(aj, kw, { ...zelle(aj, kw), maengel: "", fehltage: 0, geprueft: true });
    neuZeichnen(el);
  }
  async function leeren(el) {
    const aj = Number(el.dataset.aj), kw = Number(el.dataset.kw);
    const z = { ...zelle(aj, kw) };
    const aktuell = codesAlsListe(z.maengel).filter((c) => c !== "H");
    // Aktuelle Mängel als „behoben" merken (Nachweis der Erledigung).
    if (aktuell.length) {
      const behoben = new Set([...codesAlsListe(z.behobene), ...aktuell]);
      z.behobene = Array.from(behoben).sort().join(",");
    }
    z.maengel = ""; z.fehltage = 0; z.geprueft = true;
    await speichern(aj, kw, z);
    neuZeichnen(el);
    meldung("Zelle geleert" + (aktuell.length ? ` (Mängel ${aktuell.join(",")} als behoben vermerkt)` : "") + ".");
  }

  gridRoot.addEventListener("click", (ev) => {
    const el = ev.target.closest(".bw-kw");
    if (el && !el.classList.contains("bw-kw--inactive")) fokus(Number(el.dataset.idx));
  });

  gridRoot.addEventListener("keydown", (ev) => {
    const el = ev.target.closest(".bw-kw");
    if (!el) return;
    const i = Number(el.dataset.idx);
    const k = ev.key;
    if (k === "ArrowRight") { ev.preventDefault(); return fokus(i + 1); }
    if (k === "ArrowLeft")  { ev.preventDefault(); return fokus(i - 1); }
    if (k === "ArrowDown")  { ev.preventDefault(); return fokus(i + RASTER_SPALTEN); }
    if (k === "ArrowUp")    { ev.preventDefault(); return fokus(i - RASTER_SPALTEN); }
    if (k === "Home")       { ev.preventDefault(); return fokus(0); }
    if (k === "End")        { ev.preventDefault(); return fokus(gesamtZellen - 1); }
    if (k === " " || k === "Enter") { ev.preventDefault(); return rasterDetailDialog(el); }
    if (k === "Delete" || k === "Backspace") { ev.preventDefault(); return leeren(el); }
    const up = k.toUpperCase();
    if (up === "O") { ev.preventDefault(); return alsOk(el); }
    if (/^[A-G]$/.test(up) || up === "I") { ev.preventDefault(); return codeUmschaltenZelle(el, up); }
    if (up === "H") { ev.preventDefault(); return rasterDetailDialog(el); }
    if (/^[0-7]$/.test(k)) { ev.preventDefault(); return fehltageSetzen(el, Number(k)); }
  });

  // Detail-Dialog (Mängel-Checkboxen, Fehltage, Bemerkung) für Maus/Touch & „I".
  function rasterDetailDialog(el) {
    const aj = Number(el.dataset.aj), kw = Number(el.dataset.kw);
    const z = { ...zelle(aj, kw) };
    const alt = document.getElementById("dialog"); if (alt) alt.remove();
    const dlg = document.createElement("dialog");
    dlg.className = "bw-dialog"; dlg.id = "dialog";
    const aktiv = new Set(codesAlsListe(z.maengel));
    const checks = MAENGEL_CODES.filter((m) => m.code !== "H").map((m) =>
      `<label class="bw-check"><input type="checkbox" value="${m.code}"${aktiv.has(m.code) ? " checked" : ""}> <strong>${m.code}</strong> — ${esc(m.label)}</label>`).join("");
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <h2 style="margin-top:0">${aj}. Ausbildungsjahr · KW ${kw}</h2>
        <fieldset class="bw-fieldset"><legend>Mängel</legend>${checks}</fieldset>
        <div class="bw-field"><label for="rd-fehl">Fehltage</label>
          <input id="rd-fehl" type="number" min="0" max="7" step="1" value="${Number(z.fehltage || 0)}"></div>
        <div class="bw-field"><label for="rd-bem">Bemerkung</label>
          <textarea id="rd-bem" rows="2" style="font:inherit;width:100%">${esc(z.bemerkung || "")}</textarea></div>
        <div class="bw-dialog__aktionen">
          <button type="button" class="bw-btn bw-btn--sekundaer" id="rd-ok">Ohne Beanstandung</button>
          <button type="button" class="bw-btn bw-btn--sekundaer" id="rd-abbr">Abbrechen</button>
          <button type="button" class="bw-btn bw-btn--gelb" id="rd-speichern">Speichern</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector("#rd-abbr").addEventListener("click", () => dlg.close());
    dlg.querySelector("#rd-ok").addEventListener("click", async () => { await alsOk(el); dlg.close(); });
    dlg.querySelector("#rd-speichern").addEventListener("click", async () => {
      const codes = Array.from(dlg.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
      const fehl = Math.max(0, Math.min(7, Number(dlg.querySelector("#rd-fehl").value || 0)));
      if (fehl > 0) codes.push("H");
      await speichern(aj, kw, { ...z, maengel: codes.sort().join(","), fehltage: fehl, geprueft: true, bemerkung: dlg.querySelector("#rd-bem").value.trim() || null });
      neuZeichnen(el); dlg.close();
    });
    dlg.addEventListener("close", () => { dlg.remove(); fokus(Number(el.dataset.idx)); });
    dlg.showModal();
  }

  // Druckbare Kontroll-Liste (für den Betriebsbesuch): je Ausbildungsjahr die
  // beanstandeten Wochen + Fehltage, dazu die Mängel-Legende.
  document.getElementById("bh-raster-druck").addEventListener("click", () => {
    const heuteTxt = new Date().toLocaleDateString("de-DE");
    let html = `<h1>Berichtsheft-Kontrolle — ${esc(p.nachname)}, ${esc(p.vorname)}</h1>
      <p>${esc(p.beruf || "")}${p.betrieb ? " · " + esc(p.betrieb) : ""} · Stand: ${esc(heuteTxt)}</p>`;
    for (let aj = 1; aj <= RASTER_AJ; aj++) {
      const fehlSum = KW_ORDER.reduce((s, kw) => s + Number(zelle(aj, kw).fehltage || 0), 0);
      const zeilen = KW_ORDER.map((kw) => {
        const z = zelle(aj, kw);
        const codes = codesAlsListe(z.maengel).filter((c) => c !== "H");
        const fehl = Number(z.fehltage || 0);
        if (!codes.length && !fehl) return null;
        const codeText = codes.map((c) => `${c} (${(MAENGEL_CODES.find((m) => m.code === c) || {}).label || ""})`).join(", ");
        return `<tr><td>KW ${kw}</td><td>${esc(codeText) || "—"}</td><td>${fehl || ""}</td></tr>`;
      }).filter(Boolean);
      html += `<h2>${aj}. Ausbildungsjahr <span style="font-weight:400;font-size:.8em">— Fehltage gesamt: ${zahl(fehlSum)}</span></h2>`;
      html += zeilen.length
        ? `<table><thead><tr><th>Woche</th><th>Mängel</th><th>Fehltage</th></tr></thead><tbody>${zeilen.join("")}</tbody></table>`
        : `<p>Keine Beanstandungen.</p>`;
    }
    html += `<h2>Mängelcodes</h2><p>${MAENGEL_CODES.map((m) => `${m.code} = ${esc(m.label)}`).join(" · ")}</p>`;
    html += `<p style="margin-top:2em">Unterschrift Ausbildungsberatung: ____________________________</p>`;
    druckbereich().innerHTML = html;
    window.print();
  });

  document.getElementById("inhalt")?.focus?.();
}

/* ---------------------------------------------------------------- Beratung */
const BERATUNG_AMPEL = {
  gruen: '<span class="bw-status-do" aria-hidden="true">●</span>',
  gelb:  '<span aria-hidden="true" style="color:var(--bw-schwarz)">◐</span>',
  rot:   '<span class="bw-status-dont" aria-hidden="true">●</span>',
  grau:  '<span class="bw-leise" aria-hidden="true">○</span>',
};

async function renderBeratung() {
  const heute = heuteISO();
  const faelle = (await store.beratungFaelle()).map((f) => ({ ...f, _ampel: fallAmpel(f, heute) }));
  const offen = faelle.filter((f) => f.status !== "geloest").length;
  const ueberfaellig = faelle.filter((f) => f._ampel.farbe === "rot").length;

  // Bereichsübergreifendes Wiedervorlage-Board (Beratung + Berichtsheft).
  const bhWv = await store.berichtsheftWiedervorlagen();
  const wvBoard = [
    ...faelle.filter((f) => f.wiedervorlage && f.status !== "geloest").map((f) => ({
      quelle: "Beratung", wer: f.nachname ? `${f.nachname}, ${f.vorname}` : (f.betrieb || "—"),
      anlass: f.titel, frist: f.wiedervorlage, link: `#/beratung/${f.id}`,
      stat: wvStatus(f.wiedervorlage, false, heute),
    })),
    ...bhWv.filter((w) => !w.wiedervorlage_erledigt).map((w) => ({
      quelle: "Berichtsheft", wer: `${w.nachname}, ${w.vorname}`,
      anlass: ergebnisLabel(w.ergebnis), frist: w.wiedervorlage_frist, link: "#/berichtsheft",
      stat: wvStatus(w.wiedervorlage_frist, false, heute),
    })),
  ].filter((x) => x.stat === "offen" || x.stat === "ueberfaellig")
   .sort((a, b) => String(a.frist).localeCompare(String(b.frist)));

  appEl().innerHTML = `
    <h1>Ausbildungsberatung</h1>
    <p class="bw-unterzeile">Beratungsfälle koordiniert begleiten — Problem und Lösung dokumentieren, Verlauf und Wiedervorlage im Blick.</p>

    <div class="bw-flaechen" style="margin-bottom:var(--bw-space-3)">
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Fälle gesamt</div><div style="font-size:1.5rem;font-weight:700">${zahl(faelle.length)}</div></div>
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Offen</div><div style="font-size:1.5rem;font-weight:700">${zahl(offen)}</div></div>
      <div class="bw-card" style="flex:1 1 8rem"><div class="bw-klein bw-leise">Wiedervorlage überfällig</div><div style="font-size:1.5rem;font-weight:700">${zahl(ueberfaellig)}</div></div>
    </div>

    <div class="bw-flaechen" style="margin-bottom:var(--bw-space-3);align-items:flex-start">
      <section class="bw-card" aria-labelledby="bf-wv-h" style="flex:1 1 20rem">
        <h2 id="bf-wv-h" style="margin-top:0">Wiedervorlagen (alle Bereiche)</h2>
        ${wvBoard.length ? `<div class="bw-tablewrap"><table class="bw-table">
          <thead><tr><th>Frist</th><th>Bereich</th><th>Auszubildende:r</th><th>Anlass</th><th></th></tr></thead>
          <tbody>${wvBoard.map((w) => `<tr>
            <td>${esc(new Date(w.frist).toLocaleDateString("de-DE"))} ${w.stat === "ueberfaellig" ? '<span class="bw-tag bw-tag--fehler">überfällig</span>' : '<span class="bw-tag bw-tag--aktiv">offen</span>'}</td>
            <td>${esc(w.quelle)}</td>
            <td>${esc(w.wer)}</td>
            <td>${esc(w.anlass)}</td>
            <td class="bw-actions"><a class="bw-btn bw-btn--sekundaer" href="${w.link}">Öffnen</a></td>
          </tr>`).join("")}</tbody></table></div>` : '<p class="bw-leise bw-klein">Keine offenen Wiedervorlagen.</p>'}
      </section>
      <section class="bw-card" aria-labelledby="bf-aus-h" style="flex:1 1 16rem">
        <h2 id="bf-aus-h" style="margin-top:0">Themen-Häufung</h2>
        <div id="bf-diagramm"></div>
      </section>
    </div>

    <section class="bw-card" aria-labelledby="bf-h">
      <div class="bw-toolbar" style="margin:0 0 var(--bw-space-2);align-items:center">
        <h2 id="bf-h" style="margin:0;flex:1 1 auto">Fälle</h2>
        <button class="bw-btn bw-btn--gelb" type="button" id="bf-neu">Neuer Fall</button>
        <button class="bw-btn bw-btn--sekundaer" type="button" id="bf-csv">CSV</button>
      </div>
      <div class="bw-search" style="margin-bottom:var(--bw-space-2)">
        <label for="bf-suche" class="bw-skip-link">Fälle durchsuchen</label>
        <input id="bf-suche" type="search" placeholder="Suchen (Titel, Name, Betrieb, Kategorie) …" autocomplete="off">
      </div>
      <div class="bw-tablewrap">
        <table class="bw-table">
          <thead><tr><th>Status</th><th>Titel</th><th>Auszubildende:r / Betrieb</th><th>Kategorie</th><th>Wiedervorlage</th><th></th></tr></thead>
          <tbody id="bf-tbody"></tbody>
        </table>
      </div>
      <p id="bf-leer" class="bw-leise bw-klein" hidden>Keine Beratungsfälle. Mit „Neuer Fall" beginnen.</p>
    </section>`;

  const tbody = document.getElementById("bf-tbody");
  const sucheEl = document.getElementById("bf-suche");
  let gefiltert = faelle;

  function zeichne() {
    tbody.innerHTML = gefiltert.map((f) => {
      const wer = (f.nachname ? `${esc(f.nachname)}, ${esc(f.vorname)}` : "") + (f.betrieb ? `${f.nachname ? " · " : ""}${esc(f.betrieb)}` : "");
      return `<tr>
        <td title="${esc(f._ampel.text)}">${BERATUNG_AMPEL[f._ampel.farbe]} <span class="bw-klein">${esc(beratungStatusLabel(f.status))}</span></td>
        <td><a href="#/beratung/${f.id}">${esc(f.titel)}</a></td>
        <td>${wer || "<span class='bw-leise'>—</span>"}</td>
        <td>${esc(f.kategorie || "—")}</td>
        <td>${f.wiedervorlage ? esc(new Date(f.wiedervorlage).toLocaleDateString("de-DE")) : "—"}</td>
        <td class="bw-actions"><a class="bw-btn bw-btn--sekundaer" href="#/beratung/${f.id}">Öffnen</a></td>
      </tr>`;
    }).join("");
    document.getElementById("bf-leer").hidden = gefiltert.length > 0;
  }
  function filtern() {
    const q = sucheEl.value.trim();
    if (!q) { gefiltert = faelle; zeichne(); return; }
    if (window.bwSearch) gefiltert = window.bwSearch.search(faelle, q, { fields: ["titel", "nachname", "vorname", "betrieb", "kategorie", "beschreibung"] });
    else { const n = q.toLowerCase(); gefiltert = faelle.filter((f) => `${f.titel} ${f.nachname || ""} ${f.betrieb || ""} ${f.kategorie || ""}`.toLowerCase().includes(n)); }
    zeichne();
  }
  zeichne();
  sucheEl.addEventListener("input", debounce(filtern, 150));

  document.getElementById("bf-neu").addEventListener("click", () => beratungFallDialog(null, () => route()));
  document.getElementById("bf-csv").addEventListener("click", () => {
    const kopf = ["Titel", "Status", "Auszubildende:r", "Betrieb", "Kategorie", "Wiedervorlage", "Angelegt"];
    const zeilen = faelle.map((f) => [f.titel, beratungStatusLabel(f.status), f.nachname ? `${f.nachname}, ${f.vorname}` : "",
      f.betrieb || "", f.kategorie || "", f.wiedervorlage ? new Date(f.wiedervorlage).toLocaleDateString("de-DE") : "",
      f.angelegt ? new Date(f.angelegt).toLocaleDateString("de-DE") : ""]);
    dateiDownload("beratungsfaelle.csv", csvText(kopf, zeilen), "text/csv;charset=utf-8");
    meldung(`CSV exportiert: ${zahl(faelle.length)} Fälle.`);
  });

  // Themen-Häufung (CI-konformes SVG-Balkendiagramm).
  const dia = document.getElementById("bf-diagramm");
  const haeuf = kategorieHaeufung(faelle);
  if (window.bwChart && haeuf.length) {
    const maxH = Math.max.apply(null, haeuf.map((h) => h.value));
    window.bwChart.bars(dia, haeuf.map((h) => ({ label: h.label, value: h.value, highlight: h.value === maxH })),
      { titel: "Beratungsfälle je Kategorie", einheit: "" });
  } else {
    dia.innerHTML = '<p class="bw-leise bw-klein">Noch keine Fälle — die Auswertung erscheint, sobald Fälle angelegt sind.</p>';
  }

  document.getElementById("inhalt")?.focus?.();
}

/* --------------------------------------------------- Beratung: Fall-Akte */
async function renderBeratungFall(idRaw) {
  const id = Number(idRaw);
  const f = await store.beratungFall(id);
  if (!f) { appEl().innerHTML = `<div class="bw-hinweis bw-hinweis--fehler">Beratungsfall nicht gefunden.</div>`; return; }
  const heute = heuteISO();
  const a = fallAmpel(f, heute);
  const eintraege = await store.beratungEintraege(id);
  const wer = (f.nachname ? `${esc(f.nachname)}, ${esc(f.vorname)}` : "") + (f.betrieb ? `${f.nachname ? " · " : ""}${esc(f.betrieb)}` : "");

  appEl().innerHTML = `
    <p class="bw-klein"><a href="#/beratung">← Ausbildungsberatung</a></p>
    <div class="bw-toolbar" style="align-items:center">
      <h1 style="flex:1 1 auto;margin:0">${esc(f.titel)}</h1>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="bf-bearbeiten">Bearbeiten</button>
      <button class="bw-btn bw-btn--sekundaer" type="button" id="bf-druck">Drucken</button>
    </div>
    <p class="bw-unterzeile">${BERATUNG_AMPEL[a.farbe]} ${esc(a.text)} · ${esc(beratungStatusLabel(f.status))}${f.kategorie ? " · " + esc(f.kategorie) : ""}</p>

    <div class="bw-flaechen" style="align-items:flex-start">
      <section class="bw-card" style="flex:1 1 16rem">
        <h2 style="margin-top:0">Eckdaten</h2>
        <table class="bw-table bw-table--paare"><tbody>
          <tr><th scope="row">Auszubildende:r / Betrieb</th><td>${wer || "—"}${f.pruefling_id ? ` · <a href="#/pruefling/${f.pruefling_id}">Akte</a>` : ""}</td></tr>
          <tr><th scope="row">Status</th><td>${esc(beratungStatusLabel(f.status))}</td></tr>
          <tr><th scope="row">Kategorie</th><td>${esc(f.kategorie || "—")}</td></tr>
          <tr><th scope="row">Wiedervorlage</th><td>${f.wiedervorlage ? esc(new Date(f.wiedervorlage).toLocaleDateString("de-DE")) : "—"}</td></tr>
          <tr><th scope="row">Angelegt</th><td>${f.angelegt ? esc(new Date(f.angelegt).toLocaleDateString("de-DE")) : "—"}</td></tr>
          ${f.geschlossen ? `<tr><th scope="row">Gelöst am</th><td>${esc(new Date(f.geschlossen).toLocaleDateString("de-DE"))}</td></tr>` : ""}
        </tbody></table>
        ${f.beschreibung ? `<h3>Anliegen</h3><p style="white-space:pre-wrap">${esc(f.beschreibung)}</p>` : ""}
        <div class="bw-toolbar" style="margin-top:var(--bw-space-2)">
          <a class="bw-btn bw-btn--sekundaer" href="#/vorlagen">Einladung erzeugen</a>
          <button class="bw-btn bw-btn--sekundaer" type="button" id="bf-loeschen">Fall löschen</button>
        </div>
      </section>

      <section class="bw-card" style="flex:1.3 1 20rem">
        <h2 style="margin-top:0">Verlauf</h2>
        <form id="bf-eform" class="bw-dialog__felder" style="margin-bottom:var(--bw-space-2)">
          <div class="bw-field"><label for="be-datum">Datum</label><input id="be-datum" type="date" value="${esc(heute)}"></div>
          <div class="bw-field"><label for="be-art">Art</label>
            <select id="be-art">${EINTRAG_ARTEN.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join("")}</select></div>
        </form>
        <div class="bw-field"><label for="be-text">Eintrag</label>
          <textarea id="be-text" rows="3" style="font:inherit;width:100%" placeholder="Was wurde besprochen / veranlasst?"></textarea></div>
        <div class="bw-toolbar" style="margin:0 0 var(--bw-space-3)"><button class="bw-btn bw-btn--gelb" type="button" id="be-add">Eintrag hinzufügen</button></div>
        <ol class="bw-verlauf" id="bf-eintraege"></ol>
        <p id="bf-eleer" class="bw-leise bw-klein"${eintraege.length ? " hidden" : ""}>Noch kein Verlauf.</p>
      </section>
    </div>`;

  const eintraegeEl = document.getElementById("bf-eintraege");
  function zeichneEintraege(liste) {
    eintraegeEl.innerHTML = liste.map((e) => `
      <li>
        <div class="bw-verlauf__kopf">
          <strong>${esc(artLabel(e.art))}</strong>
          <span class="bw-klein bw-leise">${e.datum ? esc(new Date(e.datum).toLocaleDateString("de-DE")) : ""}</span>
          <button class="bw-iconbtn" type="button" data-del-eintrag="${e.id}" title="Eintrag löschen" aria-label="Eintrag löschen" style="margin-left:auto">${icon("muell")}</button>
        </div>
        ${e.text ? `<div style="white-space:pre-wrap">${esc(e.text)}</div>` : ""}
      </li>`).join("");
    document.getElementById("bf-eleer").hidden = liste.length > 0;
  }
  zeichneEintraege(eintraege);

  document.getElementById("be-add").addEventListener("click", async () => {
    const text = document.getElementById("be-text").value.trim();
    if (!text) { meldung("Bitte einen Text eingeben.", "fehler"); return; }
    await store.beratungEintragAnlegen(id, { datum: document.getElementById("be-datum").value, art: document.getElementById("be-art").value, text });
    document.getElementById("be-text").value = "";
    zeichneEintraege(await store.beratungEintraege(id));
    meldung("Verlaufseintrag gespeichert.");
  });
  eintraegeEl.addEventListener("click", async (ev) => {
    const del = ev.target.closest("[data-del-eintrag]")?.getAttribute("data-del-eintrag");
    if (!del) return;
    await store.beratungEintragLoeschen(Number(del));
    zeichneEintraege(await store.beratungEintraege(id));
  });

  document.getElementById("bf-bearbeiten").addEventListener("click", () => beratungFallDialog(f, () => route()));
  document.getElementById("bf-loeschen").addEventListener("click", async () => {
    if (!confirm("Diesen Beratungsfall mit gesamtem Verlauf löschen?")) return;
    await store.beratungLoeschen(id);
    meldung("Beratungsfall gelöscht.");
    location.hash = "#/beratung";
  });
  document.getElementById("bf-druck").addEventListener("click", () => {
    druckbereich().innerHTML = `
      <h1>${esc(f.titel)}</h1>
      <p>${esc(beratungStatusLabel(f.status))}${f.kategorie ? " · " + esc(f.kategorie) : ""} · ${wer || ""}</p>
      ${f.beschreibung ? `<h2>Anliegen</h2><p style="white-space:pre-wrap">${esc(f.beschreibung)}</p>` : ""}
      <h2>Verlauf</h2>
      <ul>${eintraege.slice().reverse().map((e) => `<li><strong>${e.datum ? esc(new Date(e.datum).toLocaleDateString("de-DE")) : ""} — ${esc(artLabel(e.art))}:</strong> ${esc(e.text || "")}</li>`).join("")}</ul>`;
    window.print();
  });

  document.getElementById("inhalt")?.focus?.();
}

/* ----------------------------------------- Beratung: Fall anlegen/bearbeiten */
async function beratungFallDialog(fall, nachher) {
  const alt = document.getElementById("dialog"); if (alt) alt.remove();
  const heute = heuteISO();
  const prueflinge = await store.liste("prueflinge");
  const dlg = document.createElement("dialog");
  dlg.className = "bw-dialog bw-dialog--breit"; dlg.id = "dialog";
  const opt = (sel) => prueflinge.map((p) => `<option value="${p.id}"${String(p.id) === String(sel) ? " selected" : ""}>${esc(p.nachname)}, ${esc(p.vorname)}</option>`).join("");
  const f = fall || {};
  // „Bearbeiten" nur bei echtem Fall (mit id); ein Vorbelegungs-Objekt ohne id
  // (z. B. aus dem Berichtsheft) öffnet einen neuen, vorausgefüllten Fall.
  const istEdit = !!(fall && fall.id);
  dlg.innerHTML = `
    <form method="dialog" novalidate>
      <h2 style="margin-top:0">${istEdit ? "Fall bearbeiten" : "Neuer Beratungsfall"}</h2>
      <div class="bw-field"><label for="bd-titel">Titel / Anliegen</label>
        <input id="bd-titel" type="text" required value="${esc(f.titel || "")}"></div>
      <div class="bw-dialog__felder">
        <div class="bw-field"><label for="bd-pruefling">Auszubildende:r</label>
          <select id="bd-pruefling"><option value="">— keine:r —</option>${opt(f.pruefling_id)}</select></div>
        <div class="bw-field"><label for="bd-betrieb">Betrieb (frei)</label>
          <input id="bd-betrieb" type="text" value="${esc(f.betrieb || "")}"></div>
        <div class="bw-field"><label for="bd-kategorie">Kategorie</label>
          <select id="bd-kategorie"><option value="">—</option>${BERATUNG_KATEGORIEN.map((k) => `<option${f.kategorie === k ? " selected" : ""}>${esc(k)}</option>`).join("")}</select></div>
        <div class="bw-field"><label for="bd-status">Status</label>
          <select id="bd-status">${BERATUNG_STATUS.map((s) => `<option value="${s.id}"${(f.status || "offen") === s.id ? " selected" : ""}>${esc(s.label)}</option>`).join("")}</select></div>
        <div class="bw-field"><label for="bd-wv">Wiedervorlage</label>
          <input id="bd-wv" type="date" value="${esc(f.wiedervorlage ? bhIso(new Date(f.wiedervorlage)) : (istEdit ? "" : standardWiedervorlage(heute)))}"></div>
      </div>
      <div class="bw-field"><label for="bd-beschreibung">Beschreibung</label>
        <textarea id="bd-beschreibung" rows="4" style="font:inherit;width:100%">${esc(f.beschreibung || "")}</textarea></div>
      <div class="bw-dialog__aktionen">
        <button type="button" class="bw-btn bw-btn--sekundaer" id="bd-abbr">Abbrechen</button>
        <button type="button" class="bw-btn bw-btn--gelb" id="bd-speichern">Speichern</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#bd-abbr").addEventListener("click", () => dlg.close());
  dlg.querySelector("#bd-speichern").addEventListener("click", async () => {
    const titel = dlg.querySelector("#bd-titel").value.trim();
    if (!titel) { meldung("Bitte einen Titel angeben.", "fehler"); return; }
    const daten = {
      titel,
      prueflingId: dlg.querySelector("#bd-pruefling").value || null,
      betrieb: dlg.querySelector("#bd-betrieb").value.trim() || null,
      kategorie: dlg.querySelector("#bd-kategorie").value || null,
      status: dlg.querySelector("#bd-status").value,
      wiedervorlage: dlg.querySelector("#bd-wv").value || null,
      beschreibung: dlg.querySelector("#bd-beschreibung").value.trim() || null,
    };
    try {
      if (istEdit) await store.beratungAktualisieren(fall.id, daten);
      else await store.beratungAnlegen(daten);
      meldung("Beratungsfall gespeichert.");
      dlg.close();
    } catch (e) { console.error(e); meldung("Konnte nicht speichern: " + e.message, "fehler"); }
  });
  dlg.addEventListener("close", () => { dlg.remove(); if (nachher) nachher(); });
  dlg.showModal();
}

/* ------------------------------------------------- Ausbildungsrechner (grüne Berufe) */
/** Datum-ISO -> de-DE „TT.MM.JJJJ" (oder „—"). */
function rFmt(isoStr) {
  const d = rDs(isoStr);
  return d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

function renderRechner() {
  // Berufe nach Sparte gruppieren (saubere optgroups).
  const gruppen = [];
  BERUFE.forEach((b) => {
    let g = gruppen.find((x) => x.name === b.group);
    if (!g) { g = { name: b.group, berufe: [] }; gruppen.push(g); }
    g.berufe.push(b);
  });
  const berufOptions = gruppen.map((g) =>
    `<optgroup label="${esc(g.name)}">${g.berufe.map((b) =>
      `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join("")}</optgroup>`).join("");

  appEl().innerHTML = `
    <h1>Ausbildungsrechner — grüne Berufe</h1>
    <p class="bw-unterzeile">Frühestmöglicher Prüfungstermin, Verkürzung, Teilzeit (§ 7a BBiG),
      Fehlzeiten (§ 8 BBiG) sowie Vergütungs- und Urlaubsübersicht für die grünen Berufe in Baden-Württemberg.</p>
    <div class="bw-flaechen" style="align-items:flex-start">
      <section class="bw-card" aria-labelledby="rech-h" style="flex:1 1 20rem">
        <h2 id="rech-h" style="margin-top:0">Angaben</h2>
        <div class="bw-field"><label for="rech-beruf">Ausbildungsberuf</label>
          <select id="rech-beruf">${berufOptions}</select></div>
        <div class="bw-field"><label for="rech-start">Ausbildungsbeginn</label>
          <input id="rech-start" type="date" value="2025-09-01"></div>
        <div class="bw-field"><label for="rech-dauer">Reguläre Ausbildungsdauer (Monate)</label>
          <input id="rech-dauer" type="number" min="1" max="60" step="1" value="36"></div>
        <div class="bw-field"><label for="rech-geb">Geburtsdatum <span class="bw-leise">(optional, für Jugend-Urlaub)</span></label>
          <input id="rech-geb" type="date"></div>

        <fieldset class="bw-fieldset">
          <legend>Verkürzung (§ 8 BBiG)</legend>
          <label class="bw-check"><input id="rech-verk" type="checkbox"> Verkürzung berücksichtigen</label>
          <div class="bw-field" id="rech-verk-feld" hidden><label for="rech-verk-monate">Verkürzung (Monate)</label>
            <input id="rech-verk-monate" type="number" min="0" max="24" step="1" value="6"></div>
          <label class="bw-check"><input id="rech-vorzeitig" type="checkbox"> Vorzeitige Zulassung (§ 45 II BBiG, −8 statt −2 Monate)</label>
        </fieldset>

        <fieldset class="bw-fieldset">
          <legend>Teilzeit (§ 7a BBiG)</legend>
          <label class="bw-check"><input id="rech-tz" type="checkbox"> Teilzeitberufsausbildung</label>
          <div id="rech-tz-felder" hidden>
            <div class="bw-field"><label for="rech-tz-ab">Teilzeit ab</label>
              <input id="rech-tz-ab" type="date" value="2025-09-01"></div>
            <div class="bw-field"><label for="rech-tz-quote">Arbeitszeit-Quote (%)</label>
              <input id="rech-tz-quote" type="number" min="50" max="100" step="5" value="75"></div>
            <div class="bw-field"><label for="rech-tz-modus">Verlängerungs-Modell</label>
              <select id="rech-tz-modus">
                <option value="vz">Bezogen auf Vollzeit-Dauer (Standard)</option>
                <option value="tz">Reziprok (auf Teilzeit-Quote bezogen)</option>
              </select></div>
          </div>
        </fieldset>

        <fieldset class="bw-fieldset">
          <legend>Fehlzeiten (§ 8 II BBiG)</legend>
          <div class="bw-field"><label for="rech-fehltage">Fehltage gesamt (Arbeitstage)</label>
            <input id="rech-fehltage" type="number" min="0" max="999" step="1" value="0"></div>
          <div class="bw-field"><label for="rech-komp">Bewertung der Fehlzeiten</label>
            <select id="rech-komp">
              <option value="auto">Automatisch (Anrechnung erst über 15 %)</option>
              <option value="anrechnen">Fehlzeiten anrechnen (Nachholzeit)</option>
              <option value="kompensiert">Als kompensiert werten (keine Nachholzeit)</option>
            </select></div>
          <div class="bw-field"><label for="rech-rundung">Nachholzeit runden auf</label>
            <select id="rech-rundung">
              <option value="pruefung">nächste Prüfungsperiode</option>
              <option value="monat">Monatsende</option>
              <option value="tag">taggenau</option>
            </select></div>
        </fieldset>
      </section>

      <section class="bw-card" aria-labelledby="rech-erg-h" style="flex:1.4 1 24rem">
        <h2 id="rech-erg-h" style="margin-top:0">Ergebnis</h2>
        <div id="rech-ergebnis" aria-live="polite"></div>
        <div class="bw-toolbar" style="margin-top:var(--bw-space-3)">
          <button class="bw-btn bw-btn--gelb" type="button" id="rech-druck">Drucken / als PDF speichern</button>
        </div>
        <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-2)">
          Berechnungshilfe ohne Gewähr — ersetzt keine Einzelfallprüfung. Tarif-/Vergütungswerte: Stand siehe Quelle.</p>
      </section>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const verkChk = $("rech-verk"), tzChk = $("rech-tz");
  const verkFeld = $("rech-verk-feld"), tzFelder = $("rech-tz-felder");
  const ergebnis = $("rech-ergebnis");

  let letztes = null; // für Druck

  function eingaben() {
    const komp = $("rech-komp").value;
    return {
      berufId: $("rech-beruf").value,
      start: $("rech-start").value,
      dauerMonate: $("rech-dauer").value,
      geburtsdatum: $("rech-geb").value || null,
      verkuerzungAktiv: verkChk.checked,
      verkuerzungMonate: $("rech-verk-monate").value,
      vorzeitig: $("rech-vorzeitig").checked,
      teilzeitAktiv: tzChk.checked,
      teilzeitAb: $("rech-tz-ab").value,
      teilzeitQuote: $("rech-tz-quote").value,
      verlaengerungModus: $("rech-tz-modus").value,
      fehltage: $("rech-fehltage").value,
      kompensation: komp === "anrechnen" ? false : (komp === "kompensiert" ? true : undefined),
      fehltageRundung: $("rech-rundung").value,
    };
  }

  function zoneTag(zone) {
    const m = { ok: ["bw-tag--ok", "im Rahmen (≤ 10 %)"], grenz: ["bw-tag--aktiv", "grenzwertig (10–15 %)"], kritisch: ["bw-tag--fehler", "kritisch (> 15 %)"] };
    const [cls, txt] = m[zone] || m.ok;
    return `<span class="bw-tag ${cls}">${esc(txt)}</span>`;
  }

  function verguetungZeilen(e) {
    const start = rDs(e.start);
    if (!start) return "";
    return [1, 2, 3].map((lj) => {
      const datumLJ = rIso(rAddMonths(start, (lj - 1) * 12));
      const betrag = getTarifVerguetung(e.berufId, datumLJ, lj, e.start);
      return `<tr><td>${lj}. Ausbildungsjahr</td><td style="text-align:right">${euro(betrag)}</td></tr>`;
    }).join("");
  }

  function urlaubText(e) {
    const start = rDs(e.start);
    const jahr = start ? start.getFullYear() : new Date().getFullYear();
    const u = getJahresurlaub(e.berufId, e.geburtsdatum, jahr);
    const grund = { tarif: "tariflich", u18: "Jugendschutz (unter 18 J.)", u17: "Jugendschutz (unter 17 J.)", u16: "Jugendschutz (unter 16 J.)" }[u.grund] || "tariflich";
    return `${zahl(u.tage)} Arbeitstage <span class="bw-leise bw-klein">(${esc(grund)}, Bezugsjahr ${jahr})</span>`;
  }

  function rechnen() {
    const e = eingaben();
    let r;
    try { r = berechne(e); }
    catch (err) {
      letztes = null;
      ergebnis.innerHTML = `<p class="bw-hinweis">Bitte einen gültigen Ausbildungsbeginn angeben.</p>`;
      return;
    }
    letztes = { e, r, beruf: berufNach(e.berufId) };

    const zeilen = [];
    zeilen.push(["Reguläres Vertragsende", rFmt(r.endeRegulaer)]);
    if (e.verkuerzungAktiv && r.endeNachVerkuerzung !== r.endeRegulaer)
      zeilen.push(["Ende nach Verkürzung", rFmt(r.endeNachVerkuerzung)]);
    if (e.teilzeitAktiv) {
      zeilen.push(["Teilzeit-Verlängerung", `${zahl(r.teilzeitVerlaengerungMonate)} Monate`
        + (r.capGreift ? ' <span class="bw-tag bw-tag--aktiv">Höchstdauer § 7a II</span>' : "")
        + (r.kappung8I ? ' <span class="bw-tag bw-tag--aktiv">Kappung § 8 I</span>' : "")]);
      zeilen.push(["Ende nach Teilzeit", rFmt(r.endeNachTeilzeit)]);
    }
    const fehltage = Math.round(Number(e.fehltage) || 0);
    if (fehltage > 0) {
      zeilen.push(["Fehlzeiten-Bewertung", `${zoneTag(r.fehltageZone)} <span class="bw-klein bw-leise">${zahl(r.fehltageProzent)} % der Ausbildungszeit, Schwelle ${zahl(r.geringfuegigSchwelle)} AT</span>`]);
      if (r.angerechnet)
        zeilen.push(["Nachholzeit", `${zahl(r.nachholKalendertage)} Kalendertage`
          + (r.nachholPruefungsperiode ? ` <span class="bw-klein bw-leise">→ ${esc(r.nachholPruefungsperiode)}</span>` : "")]);
    }

    const docHtml = `
      <table class="bw-table bw-table--paare">
        <tbody>
          ${zeilen.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("")}
        </tbody>
      </table>

      <div class="bw-betont" style="margin:var(--bw-space-3) 0">
        <div class="bw-klein bw-leise" style="text-transform:uppercase;letter-spacing:.04em">Frühestmöglicher Prüfungstermin</div>
        <div style="font-size:1.35rem;font-weight:700">${rFmt(r.fruehestePruefung)}</div>
        <div>${esc(r.pruefungsperiode)} <span class="bw-leise">·  Vertragsende: ${rFmt(r.vertragsende)}</span></div>
      </div>

      <div class="bw-flaechen" style="gap:var(--bw-space-3)">
        <div style="flex:1 1 14rem">
          <h3 style="margin:0 0 var(--bw-space-1)">Monatsvergütung (brutto)</h3>
          <table class="bw-table"><tbody>${verguetungZeilen(e)}</tbody></table>
          <p class="bw-klein bw-leise" style="margin-top:var(--bw-space-1)">Höherer Wert aus Tarif und Mindestausbildungsvergütung (§ 17 II BBiG).</p>
        </div>
        <div style="flex:1 1 14rem">
          <h3 style="margin:0 0 var(--bw-space-1)">Jahresurlaub</h3>
          <p style="margin:0">${urlaubText(e)}</p>
        </div>
      </div>

      ${r.hinweise.length ? `<div class="bw-hinweis" style="margin-top:var(--bw-space-3)"><strong>Hinweise:</strong><ul style="margin:var(--bw-space-1) 0 0">${r.hinweise.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>` : ""}`;

    ergebnis.innerHTML = docHtml;
  }

  // Sichtbarkeit der bedingten Felder + Neuberechnung an alle Eingaben hängen.
  function sync() {
    verkFeld.hidden = !verkChk.checked;
    tzFelder.hidden = !tzChk.checked;
    rechnen();
  }
  appEl().querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
  });
  sync();

  $("rech-druck").addEventListener("click", () => {
    if (!letztes) { meldung("Bitte zuerst gültige Angaben machen.", "fehler"); return; }
    const { e, r, beruf } = letztes;
    const start = rDs(e.start);
    const jahr = start ? start.getFullYear() : new Date().getFullYear();
    const u = getJahresurlaub(e.berufId, e.geburtsdatum, jahr);
    const verg = [1, 2, 3].map((lj) => {
      const datumLJ = rIso(rAddMonths(start, (lj - 1) * 12));
      return `<tr><td>${lj}. Ausbildungsjahr</td><td>${euro(getTarifVerguetung(e.berufId, datumLJ, lj, e.start))}</td></tr>`;
    }).join("");
    druckbereich().innerHTML = `
      <h1>Ausbildungsrechner — ${esc(beruf ? beruf.label : "")}</h1>
      <p>Ausbildungsbeginn: ${rFmt(e.start)} · reguläre Dauer: ${zahl(Math.round(Number(e.dauerMonate) || 36))} Monate</p>
      <h2>Frühestmöglicher Prüfungstermin: ${rFmt(r.fruehestePruefung)} (${esc(r.pruefungsperiode)})</h2>
      <p>Vertragsende: ${rFmt(r.vertragsende)} · reguläres Ende: ${rFmt(r.endeRegulaer)}</p>
      <h3>Monatsvergütung (brutto)</h3>
      <table><tbody>${verg}</tbody></table>
      <p>Jahresurlaub: ${zahl(u.tage)} Arbeitstage</p>
      ${r.hinweise.length ? `<h3>Hinweise</h3><ul>${r.hinweise.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
      <p><em>Berechnungshilfe ohne Gewähr — ersetzt keine Einzelfallprüfung.</em></p>`;
    window.print();
  });

  document.getElementById("inhalt")?.focus?.();
}

// Serialisiert das Rendern: Routen-Renderer sind async; ohne Serialisierung kann
// ein langsamer früherer Aufruf (z. B. die Übersicht beim Start) einen neueren
// überschreiben und eine veraltete Seite anzeigen. Läuft schon ein route(), wird
// nur „pending" gemerkt und nach Abschluss für den AKTUELLEN Hash neu gerendert.
let _routeBusy = false, _routePending = false;
async function route() {
  if (_routeBusy) { _routePending = true; return; }
  _routeBusy = true;
  try {
    await routeImpl();
  } finally {
    _routeBusy = false;
    if (_routePending) { _routePending = false; route(); }
  }
}

async function routeImpl() {
  // Zugangsschutz: ohne Anmeldung ist nichts erreichbar.
  if (!_benutzer) { loginAnzeigen(); return; }
  const r = aktiveRoute();
  if (r === "abmelden") { abmelden(); return; }
  navAufbauen();
  try {
    if (r === "impressum") { renderImpressum(); }
    else if (r === "datenschutz") { renderDatenschutz(); }
    else if (r === "barrierefreiheit") { renderBarrierefreiheit(); }
    else if (r === "benutzer") { await renderBenutzer(); }
    else if (r === "vorlagen") { await renderVorlagen(); }
    else if (r.startsWith("berichtsheft/")) { await renderBerichtsheftRaster(r.slice("berichtsheft/".length)); }
    else if (r === "berichtsheft") { await renderBerichtsheft(); }
    else if (r.startsWith("beratung/")) { await renderBeratungFall(r.slice("beratung/".length)); }
    else if (r === "beratung") { await renderBeratung(); }
    else if (r === "rechner") { renderRechner(); }
    else if (r === "uebersicht") await renderUebersicht();
    else if (r === "pruefungstag") await renderPruefungstag();
    else if (r === "planung") await renderPlanung();
    else if (r === "planungsliste") await renderPlanungsliste();
    else if (r === "noten") await renderNoten();
    else if (r === "zeugnisse") await renderZeugnisse();
    else if (r === "auswertungen") await renderAuswertungen();
    else if (r === "kontakte") await renderKontakte();
    else if (r === "suche") await renderSuche();
    else if (r.startsWith("pruefling/")) await renderPrueflingAkte(r.slice("pruefling/".length));
    else if (r.startsWith("betrieb/")) await renderBetriebAkte(r.slice("betrieb/".length));
    else if (r.startsWith("pruefer/")) await renderPrueferAkte(r.slice("pruefer/".length));
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
    await store.benutzerSeed();      // Standard-Admin beim ersten Start
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
  tastenkuerzel();
  sitzungLaden();
  if (_benutzer) route(); else loginAnzeigen();
}

/**
 * Globale Tastenkürzel (barrierearm, M11):
 *  „/"  → Suche fokussieren (Listenseiten) bzw. zur Schnellsuche springen.
 * Greift nicht, während in einem Eingabefeld getippt wird, ein Dialog offen ist
 * oder Modifikatortasten gedrückt sind.
 */
function tastenkuerzel() {
  // Fokussiert das Suchfeld, sobald es im DOM ist (route() fokussiert nach jedem
  // Rendern #inhalt — daher per rAF-Schleife nachfassen, statt sofort).
  const suchfeldFokussieren = () => {
    let versuche = 0;
    const tick = () => {
      const feld = document.getElementById("modulsuche");
      if (feld) { feld.focus(); feld.select?.(); return; }
      if (versuche++ < 30) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  document.addEventListener("keydown", (ev) => {
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const ziel = ev.target;
    const tag = ziel && ziel.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (ziel && ziel.isContentEditable)) return;
    if (document.querySelector("dialog[open]")) return;
    if (ev.key === "/") {
      ev.preventDefault();
      const feld = document.getElementById("modulsuche");
      if (feld) { feld.focus(); feld.select?.(); return; }
      location.hash = "#/suche";
      suchfeldFokussieren();
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
