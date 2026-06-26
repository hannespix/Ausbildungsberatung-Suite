# Ausbildungsberatung-Suite — RP Freiburg

Interne, **vollständig offline** lauffähige Werkzeug-Suite für die
**Ausbildungsberatung des Regierungspräsidiums Freiburg** (grüne Berufe,
Hauswirtschaft). Sie unterstützt die Organisation und Durchführung der
**praktischen Abschlussprüfungen**: Stammdaten, Prüfungstag-Planung,
Notenberechnung und Zeugnis-Erstellung — alles im aktuellen Landes-Corporate-
Design Baden-Württemberg (https://design.landbw.de), barrierefrei und ohne jede
externe Abhängigkeit (Zero-Trust-Arbeitsplatz).

> Oberfläche und Texte durchgehend **Deutsch**. Design verbindlich über
> `bw-theme.css` (Single Source of Truth, nur `--bw-*`-Tokens).

---

## Funktionsumfang

- **Stammdaten** — Prüflinge, Ausbildungsbetriebe, Prüfer:innen und
  Prüfungstermine anlegen, bearbeiten, löschen.
- **Globale Fuzzy-Suche** — tippfehler- und diakritikatolerant, über alle
  Felder, direkt in der Datenbank (Trigramm-Ähnlichkeit), mit Treffermarkierung.
- **Saubere Erfassung** — Betriebs-Vorschlagsliste, E-Mail-Validierung,
  Dublettenwarnung.
- **Prüfungstag-Planung** — Prüflinge mit Uhrzeit-Slot einem Termin zuteilen,
  Prüfer:innen/Ausschuss mit Rolle zuordnen, Warnung bei Doppelbelegung am
  selben Tag, **druckbarer Tagesablauf**.
- **Notenberechnung** — Punkte → Note nach dem 100-Punkte-Schlüssel
  (bestanden ab 50), Live-Vorschau, Notenverteilungs-Diagramm.
- **Zeugnis-Erstellung** — druckbares Prüfungszeugnis je Prüfling aus
  Stammdaten, Prüfungstermin und Ergebnis (Druck/PDF).
- **Übersicht** — Kennzahlen und CI-konforme Diagramme.

Geplante Erweiterungen (siehe [`ROADMAP.md`](ROADMAP.md)): Excel/CSV-Import,
Outlook-/Kalender-Konnektivität (ICS, offline), Adress-/Telefonliste, weitere
Auswertungen.

---

## Technik

- **Vanilla JS, ES-Module**, kein Framework-Zwang; datengetriebenes Modell
  (`assets/js/model.js` → Tabellen, Formulare und Listen entstehen daraus).
- **PGlite** (Postgres als WebAssembly), Persistenz in **IndexedDB** (mit
  Fallback OPFS → Arbeitsspeicher). DB-seitige Fuzzy-Suche über
  `pg_trgm`/`unaccent`/`fuzzystrmatch`.
- **Komplett offline / Zero-Trust:** keine CDNs, keine fremden Web-Fonts, kein
  `fetch`/`import` gegen externe URLs. Alle Abhängigkeiten lokal **vendored**
  (`assets/vendor/pglite/`, inkl. WASM).

---

## Fertige Einzeldatei (Doppelklick, ohne Server)

Für Zero-Trust-/administrierte PCs ohne lokalen Server gibt es eine
**doppelklickbare Einzeldatei** mit eingebettetem PGlite/WASM:

**[`download/Ausbildungsberatung-Suite.html`](download/Ausbildungsberatung-Suite.html)**
herunterladen (in GitHub: Datei öffnen → „Download raw file") und **per
Doppelklick** öffnen. Läuft vollständig offline; Daten werden im Browser
(IndexedDB) gespeichert. Neu bauen:

```
npm i @electric-sql/pglite esbuild
node tools/build_standalone.mjs        # -> download/Ausbildungsberatung-Suite.html
```

> Hinweis: Unter `file://` ist die Persistenz die Browser-Datenbank (IndexedDB).
> Ein Datei-Export/-Import der DB („DB-Datei daneben") folgt (ROADMAP).

## Lokal starten (Entwicklung)

Die Ordner-Variante läuft über einen lokalen Webserver:

```
python3 -m http.server 8000     # im Projektordner
# dann http://localhost:8000/ aufrufen
```

Beim ersten Start legt die Suite einige **fiktive Beispieldaten** an (keine
echten personenbezogenen Daten).

---

## Testen ohne lokales Bauen (Bundle-Artifact)

Die Action [`.github/workflows/build.yml`](.github/workflows/build.yml) packt bei
jedem Stand das offline-lauffähige **Ordner-Bundle** und legt es als Artifact
**`ausbildungsberatung-suite-bundle`** ab:

1. Im Repo unter **Actions** den letzten „App-Bundle"-Run öffnen,
2. Artifact herunterladen und entpacken,
3. im Ordner `python3 -m http.server 8000` starten und `http://localhost:8000/`
   öffnen.

Artifacts sind **nur für Repo-Mitglieder** abrufbar — daher keine öffentliche
Verteilung der lizenzierten Schriften/Logos (deshalb **kein GitHub Pages**, das
den Output öffentlich machen würde, siehe „Recht & Lizenz").

---

## Offline-Pflicht prüfen

```
python3 tools/check_offline.py     # findet externe Referenzen -> Exit 1
```
Läuft auch im CI bei jedem Push/PR (Check **„Offline-Check"**). Endgültiger
Test: die Suite im **Flugmodus** öffnen — lädt etwas nicht oder zeigt das
Netzwerk-Panel einen externen Request, ist sie nicht offline-fähig.

---

## Projektstruktur

```
index.html                 App-Shell (lädt Theme + assets/)
bw-theme.css               Design-System (Single Source of Truth, --bw-*-Tokens)
assets/js/model.js         fachliches Datenmodell (Entitäten, Felder)
assets/js/store.js         Persistenz/CRUD/Suche über PGlite
assets/js/app.js           Oberfläche: Router, Listen, Planung, Noten, Zeugnisse
assets/js/db.js            PGlite-Datenbankschicht (initDB, createTable, Suche)
assets/js/nav.js           Hamburger-Navigation (barrierefrei)
assets/js/search.js        Treffermarkierung / In-Memory-Suche (Fallback)
assets/js/chart.js         CI-konforme SVG-Diagramme
assets/vendor/pglite/      lokal abgelegtes PGlite inkl. WASM (kein CDN)
assets/fonts/              BaWue Sans/Serif (woff2+woff)   — lizenzpflichtig
assets/logo/               RPF-Logo (schwarz/negativ/flag) — geschützt
assets/favicons/           Favicon-Paket + favicon.ico
site.webmanifest           PWA-Manifest
tools/check_offline.py     Offline-/CDN-Prüfung (CI-Gate)
tools/build_singlefile.py  Single-File-Builder (für einfache, DB-lose Tools)
.github/workflows/ci.yml       Offline-Check bei Push/PR
.github/workflows/build.yml    baut das Bundle-Artifact
.github/workflows/claude.yml   @claude-Loop (Issue/PR → Branch → PR)
CLAUDE.md  AGENTS.md  ROADMAP.md
```

---

## Entwicklung & Prozess

- **Design & Technik:** [`CLAUDE.md`](CLAUDE.md) — Design-System, Offline-/
  Zero-Trust-Pflicht, Barrierefreiheit, Diagramm- und Suchregeln.
- **Prozess / Loop:** [`AGENTS.md`](AGENTS.md) — Branch → Pull Request → CI →
  Merge auf `main`; jede Änderung ist ein abgeschlossener, lauffähiger Zuwachs.
- **Roadmap / Milestones:** [`ROADMAP.md`](ROADMAP.md).

Verbindlich bleibt: Design nur über `--bw-*`-Tokens, vollständige
Offline-Fähigkeit (alle Abhängigkeiten lokal vendored) und Barrierefreiheit
(WCAG 2.1 AA).

---

## Recht & Lizenz

- **Schriften** (BaWue Sans/Serif, Luzi Type) und **RPF-Logo** sind
  lizenziert/geschützt → [`assets/fonts/LIZENZ.md`](assets/fonts/LIZENZ.md),
  [`assets/logo/LIZENZ.md`](assets/logo/LIZENZ.md).
- **Repository privat halten.** Bei öffentlichem Repo `assets/fonts/` und
  `assets/logo/` in `.gitignore` aktivieren; das Theme nutzt dann System-
  Fallbacks.
- Keine Secrets und keine personenbezogenen Echtdaten im Repo.
- Produktiver Betrieb mit Personenbezug nur über **BITBW/LVN**.
