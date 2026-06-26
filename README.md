# RPF Browsertool — Vorlage (Landes-CI Baden-Württemberg)

**Grobe Vorlage — ein Startpunkt, kein fertiges Produkt.** Sie liefert das
Gerüst, das Design-System und die komplette Claude-Arbeitsumgebung für
browserbasierte Werkzeuge und kleine Datenbanken des Regierungspräsidiums
Freiburg. **Pro Tool wird sie angepasst**, nicht 1:1 übernommen — was nicht
gebraucht wird, fliegt raus; was fehlt, kommt dazu.

Alle daraus gebauten Tools sehen **wie aus einem Guss** aus (aktuelles
Landes-Corporate-Design, https://design.landbw.de) und entstehen im
**agentischen Loop** mit `@claude` über GitHub.

- **Design & Technik:** [`CLAUDE.md`](CLAUDE.md)
- **Prozess / Loop:** [`AGENTS.md`](AGENTS.md)
- **Aufgaben / Milestones:** [`ROADMAP.md`](ROADMAP.md)

### Was du anpasst — was verbindlich bleibt

Die Vorlage ist bewusst grob gehalten.

- **Anpassen pro Tool:** Inhalt und Funktion von `index.html`, die Milestones
  in `ROADMAP.md`, `<title>` und der App-Name in `site.webmanifest`, die Auswahl
  der Komponenten und Skripte (nur einbinden, was das Tool braucht), das
  Datenmodell in `assets/js/db.js`.
- **Verbindlich (nicht aufweichen):** das Design-System in `bw-theme.css` (nur
  `--bw-*`-Tokens, keine hartcodierten Farben/Schriften/Abstände), die
  Offline-/Zero-Trust-Pflicht (keine CDNs, alle Abhängigkeiten lokal vendored)
  und die Barrierefreiheit (WCAG 2.1 AA). Begründung und Details: `CLAUDE.md`.

---

## Neues Arbeits-Repo aus dieser Vorlage erstellen

Für **jedes Tool entsteht ein eigenes, privates Repo** aus dieser Vorlage. Das
neue Repo enthält die komplette Claude-Arbeitsumgebung bereits fertig:

- `CLAUDE.md` + `AGENTS.md` — **alle Arbeitsanweisungen** für Design, Loop und
  Entwicklung (`@claude` liest sie vor jeder Aufgabe),
- `bw-theme.css` + `assets/` — Design-System, Schriften, Logo, Favicons, JS,
- `.github/workflows/claude.yml` — der `@claude`-Loop (Issue/PR → Branch → PR),
- `.github/workflows/ci.yml` — Offline-Check bei jedem PR (wird mit
  `main`-Schutz zum echten Merge-Gate, Schritt 3),
- `.github/ISSUE_TEMPLATE/` — Vorlagen für Milestones und Aufgaben,
- `ROADMAP.md` — Milestone-Gerüst zum Ausfüllen.

Du baust davon **nichts neu auf** — es bleiben nur die Schritte unten:
scharfschalten, `main` schützen, zuschneiden.

**Einmalig an dieser Vorlage** (durch die Eigentümerin/den Eigentümer): unter
**Settings → General → „Template repository"** anhaken. Danach trägt das Repo
oben den grünen Knopf **„Use this template"**.

**Pro neuem Tool:**

1. **Repo erzeugen** — „Use this template" → „Create a new repository" → Namen
   vergeben → Sichtbarkeit **Private** (Pflicht wegen lizenzierter Schriften &
   Logo, siehe „Recht & Lizenz"). Das neue Repo ist eine vollständige Kopie
   inkl. aller Arbeitsanweisungen, aber mit **frischer Git-Historie** (ein
   Initial-Commit, nicht die Historie der Vorlage).
2. **`@claude` scharfschalten** — zwei Dinge im neuen Repo:
   - Repo-Secret `CLAUDE_CODE_OAUTH_TOKEN` (oder `ANTHROPIC_API_KEY`) anlegen;
     siehe [„`@claude`-Action einrichten"](#claude-action-einrichten). Secrets
     werden **nicht** mitkopiert — pro Repo neu zu setzen.
   - **Settings → Actions → General:** Actions zulassen und unter „Workflow
     permissions" die Option **„Allow GitHub Actions to create and approve pull
     requests"** aktivieren. Sie ist standardmäßig **aus** — ohne sie kann
     `@claude` keinen Pull Request öffnen.
3. **`main` schützen** (macht den Offline-Check zum echten Merge-Gate) — unter
   **Settings → Branches** (Branch-Schutz/Ruleset) für `main`: „Require a pull
   request before merging" und „Require status checks to pass" mit dem Check
   **„Offline-Check"** als erforderlich. Damit blockiert ein roter Check den
   Merge, und niemand — auch `@claude` nicht — pusht direkt auf `main`
   (vgl. `AGENTS.md`).
4. **Vorlage zuschneiden** — `ROADMAP.md` mit Tool-Zweck und Milestones füllen,
   `<title>` in `index.html` und den App-Namen in `site.webmanifest` anpassen,
   nicht benötigte Komponenten aus `index.html` entfernen.
5. **Loop starten** — Issue „M0 — Gerüst" eröffnen und `@claude` erwähnen, z. B.
   `@claude setze Milestone M0 aus ROADMAP.md um und öffne einen PR`. Ab hier
   läuft der Zyklus aus `AGENTS.md`: Branch → Pull Request → CI + Review → Merge.

> **Ohne „Use this template"** (falls der Knopf nicht gesetzt ist): leeres,
> privates Repo anlegen, diese Dateien hineinkopieren oder die Vorlage klonen,
> `origin` auf das neue Repo umbiegen und pushen — `CLAUDE.md`, `AGENTS.md` und
> `.github/workflows/` müssen mitkommen. „Dasselbe Ergebnis" gilt nur für den
> **Repo-Inhalt**; die Konfigurationsschritte 2–3 (Secret, Workflow-Permission,
> ggf. Actions aktivieren, `main`-Schutz) sind danach genauso auszuführen.

## `@claude`-Action einrichten

1. Lokal mit Claude Code einen OAuth-Token erzeugen:
   ```
   claude setup-token
   ```
   (Pro/Max-Zugang. Alternativ ein `ANTHROPIC_API_KEY`.)
2. Im Repo unter **Settings → Secrets and variables → Actions** anlegen:
   `CLAUDE_CODE_OAUTH_TOKEN` (bzw. `ANTHROPIC_API_KEY`).
3. Den Workflow [`.github/workflows/claude.yml`](.github/workflows/claude.yml)
   übernehmen (liegt bereits im Template).
4. Test: ein Issue eröffnen und `@claude stell dich kurz vor` schreiben.

Danach läuft der Loop: `@claude` in Issues/PRs erwähnen → Branch + Pull
Request → CI + Review → Merge. Details in `AGENTS.md`.

## Lokal entwickeln

Wegen `@font-face` die Dateien über einen lokalen Server öffnen (nicht per
`file://`):
```
python3 -m http.server 8000
# dann http://localhost:8000/ aufrufen
```

## Auslieferung als Einzeldatei (Zero-Trust)

```
python3 tools/build_singlefile.py
```
Erzeugt `dist/index.html` mit inline-Theme, base64-Schriften und -Bildern —
offline lauffähig, keine externen Requests, per Doppelklick zu öffnen. `dist/`
ist nicht versioniert.

**Zum Testen ohne lokales Bauen** baut die Action
[`.github/workflows/build.yml`](.github/workflows/build.yml) die Einzeldatei bei
jedem Stand und legt sie als Artifact
**`ausbildungsberatung-suite-singlefile`** ab: betreffenden Workflow-Run unter
**Actions** öffnen → Artifact herunterladen → entpacken → `index.html` per
Doppelklick öffnen. Artifacts sind **nur für Repo-Mitglieder** abrufbar, daher
keine öffentliche Verteilung der lizenzierten Schriften/Logos (kein GitHub
Pages, das den Output öffentlich machen würde — siehe „Recht & Lizenz").
Hinweis: Single-File gilt für einfache Tools; sobald die Suite PGlite/WASM nutzt
(DB-Milestones), wird zusätzlich als Ordner-Bundle ausgeliefert.

## Offline-Pflicht (keine CDN-Abhängigkeit)

Jedes Tool muss **vollständig offline** laufen — im Flugmodus, ohne Netzwerk.
Keine CDNs, keine fremden Web-Fonts, kein `import`/`fetch` gegen externe URLs.
Alle Abhängigkeiten **lokal vendoren** (`assets/vendor/<lib>/`), ausdrücklich
auch React/ReactDOM, Babel Standalone und PGlite (inkl. WASM):
```
npm i react react-dom @electric-sql/pglite
# Paketinhalte nach assets/vendor/<lib>/ kopieren und lokal einbinden
```
Prüfen (läuft auch im CI bei jedem PR):
```
python3 tools/check_offline.py     # findet externe Referenzen -> Exit 1
```
Endgültiger Test: Tool im **Flugmodus** öffnen. Lädt etwas nicht oder zeigt das
Netzwerk-Panel einen externen Request, ist es nicht offline-fähig.

## Struktur

```
index.html                 das Tool
bw-theme.css               Design-System (Single Source of Truth)
assets/fonts/              BaWue Sans/Serif (woff2+woff)   — lizenzpflichtig
assets/logo/               RPF-Logo (schwarz/negativ/flag) — geschützt
assets/favicons/           Favicon-Paket + favicon.ico
assets/js/nav.js           Hamburger-Navigation (barrierefrei)
assets/js/search.js        globale Fuzzy-Suche (In-Memory)
assets/js/chart.js         CI-konforme SVG-Diagramme
assets/js/db.js            PGlite-Datenbankschicht (DB-Tools)
assets/vendor/pglite/      lokal abgelegtes PGlite (kein CDN) — bei DB-Tools
site.webmanifest           PWA-Manifest
tools/build_singlefile.py  Single-File-Builder
tools/check_offline.py     Offline-/CDN-Prüfung (CI-Gate)
.github/workflows/claude.yml   @claude-Loop
.github/workflows/ci.yml       Offline-Check bei Push/PR
.github/ISSUE_TEMPLATE/    Vorlagen für Milestones/Aufgaben
CLAUDE.md AGENTS.md ROADMAP.md
```

## Datenbank-Tools (PGlite)

DB-basierte Tools nutzen **PGlite** (Postgres-WASM) mit OPFS-Persistenz und
DB-seitiger Fuzzy-Suche (`pg_trgm`/`unaccent`/`fuzzystrmatch`). PGlite **lokal
ablegen** (kein CDN):
```
npm i @electric-sql/pglite
# Paketinhalt nach assets/vendor/pglite/ kopieren (inkl. contrib/)
```
Referenz: `assets/js/db.js` (`initDB`, `createTable`, `globaleSuche`). DB-Tools
werden als Ordner-Bundle ausgeliefert (WASM lässt sich nicht in eine
Einzeldatei pressen); einfache Tools als Single-File.

## Recht & Lizenz

- **Schriften** (BaWue Sans/Serif, Luzi Type) und **Logo** sind
  lizenziert/geschützt → `assets/fonts/LIZENZ.md`, `assets/logo/LIZENZ.md`.
- **Repository privat halten.** Bei öffentlichem Repo `assets/fonts/` und
  `assets/logo/` in `.gitignore` aktivieren; das Theme nutzt dann die
  System-Fallbacks.
- Keine Secrets und keine personenbezogenen Echtdaten ins Repo.
- Produktiver Betrieb mit Personenbezug nur über BITBW/LVN.
