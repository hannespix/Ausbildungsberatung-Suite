# Ausbildungsberatung-Suite — RP Freiburg

Interne, **vollständig offline** lauffähige Werkzeug-Suite für die
**Ausbildungsberatung des Regierungspräsidiums Freiburg**, fokussiert auf die
**Gärtner-Fachrichtungen** (Garten- und Landschaftsbau, Zierpflanzenbau,
Baumschule, Staudengärtnerei, Gemüsebau, Obstbau, Friedhofsgärtnerei). Sie
begleitet die **praktische Abschlussprüfung von der Vorbereitung bis zum
Zeugnis**: Stammdaten, automatische Prüfungstag-Planung mit Ausschuss-Besetzung,
Notenberechnung nach offiziellem Schema und Zeugnis-/Niederschrift-Druck — alles
im aktuellen Landes-Corporate-Design Baden-Württemberg
(https://design.landbw.de), barrierefrei und ohne jede externe Abhängigkeit
(Zero-Trust-Arbeitsplatz).

> Oberfläche und Texte durchgehend **Deutsch**. Design verbindlich über
> `bw-theme.css` (Single Source of Truth, nur `--bw-*`-Tokens).

---

## Funktionsumfang

- **Übersicht / Kommandozentrum** — Kennzahlen, **nächste Prüfungstage**
  (Terminvorschau mit Direktsprung in die Planung), automatisch abgeleiteter
  **Prüfungsfortschritt** (Funnel) und ein Panel **„Was ist zu tun?"**, das
  offenen Handlungsbedarf über alle Stationen erkennt (Termine ohne Ausschuss,
  offene Zusagen, unbewertete Prüflinge, Doppelbelegungen, Prüflinge ohne
  Fachrichtung …) und direkt dorthin verlinkt. Der Fortschritt-Funnel ist
  **klickbar** — je Phase öffnet sich die Prüflingsliste gefiltert. Großer
  **fiktiver Beispieldatensatz** per Knopfdruck.
- **Stammdaten** — Prüflinge, Ausbildungsbetriebe, Prüfer:innen und
  Prüfungstermine anlegen/bearbeiten/löschen; Betriebs-Vorschlagsliste,
  E-Mail-Validierung, Dublettenwarnung, **Spalten-Sortierung**, Filter nach
  **Fortschritt-Phase** samt **Sammel-Zulassung** der Angemeldeten und
  **CSV-Import** für alle Stammdaten (Prüflinge, Betriebe, Prüfer:innen,
  Termine) mit automatischer Spaltenzuordnung und Dublettenschutz.
- **Globale Schnellsuche** — durchsucht Prüflinge, Betriebe, Prüfer:innen und
  Termine zugleich, DB-seitig (Trigramm, tippfehler-/diakritikatolerant), mit
  Treffermarkierung und Direktsprung zum Datensatz.
- **Betriebs-Akte** — eine Detailansicht je Ausbildungsbetrieb mit Kontaktdaten
  und allen zugeordneten Prüflingen (Fortschritt, Direktsprung in deren Akte).
- **Prüfer-Akte** — eine Detailansicht je Prüfer:in mit Kontakt, Ausschuss-
  Einsätzen (Direktsprung in die Planung) und Abwesenheiten.
- **Prüflings-Akte** — eine Detailansicht je Prüfling bündelt Stammdaten,
  Prüfungstag (Uhrzeit-Slot, Ausschuss), Note und Fortschritt; Direkt-Aktionen:
  Termin zuteilen/entfernen, bewerten, Zeugnis drucken, Stammdaten bearbeiten.
- **Automatische Prüfungsplanung** — verteilt alle Prüflinge je Fachrichtung
  gleichmäßig auf passend viele Termine (Kapazität je Tag, PLZ-geclustert),
  legt fehlende Termine an, vergibt **Uhrzeiten (Zeitraster)** und besetzt je
  Termin **konfliktfrei einen Ausschuss** (keine Doppelbelegung am selben Tag).
- **Prüfer-Plan & Zusagen** — Ausschüsse je Termin informieren
  (`mailto:`-Einladung oder druckbare **persönliche Einladung** je Mitglied) und
  Zu-/Absagen verwalten (offen → angefragt → zugesagt/abgesagt).
- **Durchführung** — druckbarer **Tagesablauf** (für GaLaBau inkl. festem
  Prüfungstag-Ablauf), leere **Bewertungsbögen** je Prüfling (Sammelbewertungs-
  bogen zum handschriftlichen Ausfüllen) und **Ergebnis-Niederschrift** je Termin
  mit Noten, Ausschuss und Unterschriftenspalte. Die **Prüfungstag-Mappe** druckt
  alles zusammen in einem Rutsch (Tagesablauf + alle Bögen + Niederschrift).
- **Prüflings-Einladungen** — druckbares **Einladungsschreiben** je Prüfling mit
  persönlichem Prüfungstermin (Datum, Uhrzeit-Slot, Ort, Raum) und
  Mitbringliste; einzeln aus der Akte oder als **Serien-Druck** aller
  zugeteilten Prüflinge.
- **Notenberechnung (Gärtner/Galabau)** — offizielles Sammelbewertungs-Schema:
  5 praktische Bereiche + 4 Kenntnisbereiche, **Gesamtnote = Praxis · 0,6 +
  Kenntnis · 0,4** (auf 1 Stelle abgeschnitten), Bestehensregeln (Schnitt/Gesamt
  < 4,5; Sperrfach; max. ein Bereich ≥ 4,5), Pflanzenkenntnisse als Teilnote
  und optionale **mündliche Ergänzungsprüfung** ((2 × schriftlich + 1 × mündlich)
  ÷ 3 in einem Kenntnisbereich); Live-Vorschau und Notenverteilungs-Diagramm.
  Die Notenliste lässt sich **nach Prüfungstermin filtern** (Schnellerfassung am
  Prüfungstag: Prüflinge in Uhrzeit-Reihenfolge, Zähler „X von Y bewertet").
- **Zeugnisse** — druckbares Prüfungszeugnis je Prüfling sowie **Serien-Druck**
  aller bewerteten Zeugnisse (Druck/PDF).
- **Auswertungen** — Auslastung je Termin (mit Balkendiagramm „Prüflinge je
  Prüfungstermin"), Bestehensquoten je Fachrichtung, **Prüfer-Einsätze** (Last
  je Prüfer:in) und Prüfer-Doppelbelegungen; CI-konforme Diagramme,
  Prüfungsjahr-Filter, CSV-Export und **druckbarer Auswertungsbericht**
  (Jahresbericht).
- **Adress- & Telefonliste** — konsolidiert Betriebe und Prüfer:innen, druckbar
  und als **CSV-/vCard-Export** (Outlook/Telefon).
- **Outlook-/Kalender-Export** — **ICS-Export** der Prüfungstage (offline, kein
  Graph-API), je Termin oder gesamt.
- **Datensicherung** — kompletter **Export/Import als JSON-Datei** („DB-Datei
  daneben"), bewahrt Beziehungen, offline.

Roadmap und Detailstand: [`ROADMAP.md`](ROADMAP.md).

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
> Für Backup/Umzug auf ein anderes Gerät gibt es auf der Übersicht eine
> **Datensicherung** (Export/Import des gesamten Bestands als JSON-Datei).

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
assets/js/app.js           Oberfläche: Router, Listen, Akte, Planung, Noten,
                           Zeugnisse, Auswertungen, Schnellsuche, Export/Import
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
