# ARCHITEKTUR.md — Wissensbasis & Muster

Dauerhafte Wissensbasis der Suite, damit jede (auch neue/komprimierte) Session
ohne Wissensverlust weiterarbeiten kann. **Vor jeder Aufgabe lesen** (zusammen
mit `CLAUDE.md` = Design/Technik und `AGENTS.md` = Prozess). Fortschritt/offene
Punkte stehen in `ROADMAP.md`.

> Regel: Neues Wissen, neue Muster und neu entdeckte Stolperfallen **hier
> ergänzen** — nicht im Chat „merken". Was hier steht, überlebt; was nur im
> Kontext steht, geht verloren.

---

## 1. Modulkarte
- `index.html` — lädt `bw-theme.css`, die klassischen Helfer (`nav.js`,
  `chart.js`, `search.js` als `window`-Globals) und `assets/js/app.js` (ES-Modul).
- `assets/js/app.js` — Single-Page-App. Hash-Router (`route`/`aktiveRoute`/
  `routeParams`), alle `render*`-Funktionen, Dialoge, Auth-Gate, Hilfsfunktionen
  (`esc`, `zahl`, `euro`, `meldung`, `icon`, `druckbereich`, `dateiDownload`,
  `csvText`).
- `assets/js/store.js` — Datenschicht (PGlite). Tabellen werden in `oeffnen()`
  angelegt; CRUD + fachliche Funktionen; Datensicherung; `alleLoeschen`;
  Benutzer/Login.
- `assets/js/model.js` — `ENTITAETEN` (prueflinge, betriebe, pruefer,
  pruefungen), `NAV_REIHENFOLGE`, `STANDARD_STATIONEN_GALABAU`.
- `assets/js/db.js` — PGlite-Wrapper (`initDB`, `createTable`, `globaleSuche`).
- **Reine Engine-Module (DOM-/DB-frei, in Node getestet):** `galabau.js`
  (Notenlogik), `ablauf.js` (Stationsrotation), `auth.js` (Offline-SHA-256),
  `ausbildungsrechner.js` (Fristen/Vergütung/Urlaub), `berichtsheft.js`
  (Kontroll-/KW-Logik), `beratung.js` (Beratungsfälle), `eml.js`
  (E-Mail-Entwurf im .eml-Format mit Anhängen, RFC 5322/MIME).
- **Anlagen (Vorlagen-Versand):** Formular-PDFs liegen in `assets/anlagen/`
  (+ `QUELLEN.md` mit Stand/Quelle), registriert in `app.js` (`ANLAGEN`). Die
  Vorlagen-Ansicht bettet ausgewählte Anlagen über `eml.js` in einen
  `.eml`-Entwurf ein (öffnet in Outlook mit Anhängen).
- **Klassische Globals:** `nav.js` (Hamburger/a11y), `chart.js`
  (`window.bwChart.bars(el, [{label,value,highlight}], {titel,max,einheit})`),
  `search.js` (`window.bwSearch.search(records, query, {fields})`,
  `.normalize`, `.highlight`).
- `tools/` — `test_*.mjs` (Node-Unit-Tests), `build_standalone.mjs` (esbuild →
  `download/Ausbildungsberatung-Suite.html`), `check_offline.py`.
- CI: `.github/workflows/build.yml` (Jobs **offline** + **bundle**; bundle führt
  alle `test_*.mjs` aus), `deploy-pages.yml`.

## 2. Datenmodell (PGlite-Tabellen)
`prueflinge`, `betriebe`, `pruefer`, `pruefungen` (Stammdaten/ENTITAETEN) ·
`zuteilungen`, `pruefer_zuteilungen`, `pruefer_abwesenheit`, `bewertungen`,
`stationen` (Prüfung) · `einstellungen`, `benutzer` (Konfiguration/Zugang) ·
`berichtsheft_kontrollen`, `berichtsheft_kw`, `berichtsheft_termine`
(Berichtsheft) · `beratungsfaelle`, `beratung_eintraege` (Beratung).

## 3. Bereiche / Routen
- Übersicht (`#/`) — Kennzahlen, nächste Prüfungstage, „Was ist zu tun?",
  bereichsübergreifende Wiedervorlagen, Fortschritt.
- Stammdaten: `prueflinge`/`betriebe`/`pruefer`/`pruefungen`/`kontakte`, Akten
  `#/pruefling|betrieb|pruefer/<id>`.
- Prüfung: `pruefungstag`, `planung`, `planungsliste`, `noten`, `zeugnisse`,
  `auswertungen`.
- Berichtsheft: `#/berichtsheft` (Dashboard, Kontrolle erfassen, Kontroll­termine,
  Wiedervorlagen, Druck), `#/berichtsheft/<id>` (KW-Wochenraster, Tastatur).
- Beratung: `#/beratung` (Fälle, Themen-Häufung, WV-Board) + `Rechner`,
  `#/beratung/<id>` (Fall-Akte mit Verlauf).
- Vorlagen (`#/vorlagen`), Ausbildungsrechner (`#/rechner`), Benutzer, Recht
  (`impressum`/`datenschutz`/`barrierefreiheit`).

## 4. Verbindliche Muster (so wird gebaut)
1. **Offline/Zero-Trust:** keine externen Requests, alles vendoren;
   `python3 tools/check_offline.py` muss grün sein (CI-Job *offline*).
2. **Design nur über Tokens:** ausschließlich `--bw-*`; neue Komponenten-Styles
   in `bw-theme.css`, **nie** hart in `app.js`.
3. **Neues Feature = reines Logikmodul + Node-Test + Chromium-Smoke.** Test als
   `tools/test_<name>.mjs` schreiben **und** als Schritt in `build.yml` ergänzen.
4. **Dialog-Muster:** `<dialog class="bw-dialog" id="dialog">` erzeugen,
   `document.body.appendChild`, `showModal()`; `close`-Listener → `dlg.remove()`
   und Callback `nachher()`.
5. **Listener an frisch gerenderte Kinder hängen, NIE an `appEl()` (#app)** —
   `#app` bleibt über Rendervorgänge bestehen, sonst sammeln sich Listener an.
   Muster: Tabellenkörper/Container eine `id` geben und dort binden.
6. **Tabelle hinzufügen ⇒ Datensicherung pflegen:** neue Tabelle in
   `SICHERUNG_TABELLEN` **und** `alleLoeschen` ergänzen (sonst Datenverlust beim
   Backup/Reset). `benutzer` und `einstellungen` überleben Reset bewusst.
7. **Texte/UI Deutsch**, Sentence-Case; Zahlen de-DE; Barrierefreiheit (Labels,
   Fokus, Tastatur, `aria-current`).

## 5. Bekannte Stolperfallen (nicht erneut hineinlaufen)
- **PGlite liefert `date`-Spalten als `Date`-Objekte** (nicht ISO-Strings). Reine
  Datums-Helfer müssen `Date` akzeptieren (`parse()` in `berichtsheft.js`/
  `beratung.js` ist entsprechend robust). Sonst wird z. B. „überfällig" nie erkannt.
- `store.anlegen()` gibt eine **id** zurück, viele Fachfunktionen geben Zeilen.
- **Auth:** eigenes Offline-SHA-256 (kein `crypto.subtle`, läuft so auch unter
  `file://`); Sitzung in `sessionStorage`; Route-Guard sperrt ohne Anmeldung.
- **Standalone-Build folgt den ES-Importen ab `app.js`** — nach Änderungen neu
  bauen (`node tools/build_standalone.mjs`). Voraussetzung: `npm install esbuild
  @electric-sql/pglite --no-save` (PGlite-Version muss `assets/vendor/pglite`
  entsprechen — `pglite.wasm`-Bytegröße abgleichen).
- **`mailto:` kann KEINE Anhänge transportieren** — für E-Mails mit Anlagen einen
  `.eml`-Entwurf erzeugen (`eml.js`), der in Outlook mit Dateien öffnet.
- **Anlagen-Bytes laden:** `app.js → anlageBytes()` bevorzugt `window.__ANLAGEN__`
  (im Standalone eingebettet), sonst `fetch("assets/anlagen/…")`. Neue Anlage ⇒
  Datei in `assets/anlagen/` ablegen, in `ANLAGEN` registrieren; der
  Standalone-Build bettet die Mappe automatisch als `window.__ANLAGEN__` ein.

## 6. Entwicklungs-Rezept je Iteration (Selbstcheck vor Commit)
```
node tools/test_*.mjs            # alle Unit-Tests grün
python3 tools/check_offline.py   # offline grün
node tools/build_standalone.mjs  # Standalone neu bauen
# Chromium-Smoke (temporäre Datei im Projektwurzel, danach löschen):
#   playwright-core, executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome,
#   args ["--no-sandbox"]; lokaler http-Server mit COOP/COEP-Headern.
#   In-Page Store-Tests: await import('/assets/js/store.js') liefert dieselbe
#   Modul-Instanz wie die App (gleiches _pg) -> direkte Funktionsaufrufe möglich.
```
Danach: ROADMAP aktualisieren, committen, PR, CI grün abwarten, squash-merge,
`main` syncen. Details/Branch/Backoff: `AGENTS.md`.

## 7. Prozess-Hinweise (Loop)
- **Eine Iteration = genau eine lauffähige Änderung** (kein Halbzustand über
  Kontextgrenzen). Branch → Tests → CI → squash-merge → `main` syncen.
- **Commit-Nachrichten mit deutschen Anführungszeichen** über Datei einlesen
  (`git commit -F <datei>`), nicht inline (Shell-Quoting bricht).
- **Branch-Sync vor Arbeit:** `git stash -u && git checkout <branch> &&
  git reset --hard origin/main && git stash pop`, Push mit `--force-with-lease`.
- **Watchdog-Cron** führt den Loop bei Leerlauf fort; er ist *session-gebunden*
  und muss nach Container-Neustart neu angelegt werden.
