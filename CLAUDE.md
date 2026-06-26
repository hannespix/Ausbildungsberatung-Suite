# CLAUDE.md — Grundanweisung für Browsertools (RP Freiburg)

Steuert, **wie** dieses Tool gebaut wird (Design + Technik). Den **Prozess**
(Loop, PRs, Milestones) regelt `AGENTS.md`. Vor jeder Aufgabe beide lesen.
Ziel: jedes Tool sieht **wie aus einem Guss** aus — aktuelles Landes-CD
Baden-Württemberg (https://design.landbw.de).

> Antworten und Oberflächentexte immer auf **Deutsch**.

---

## 0. Wichtigste Regel
Aussehen wird nicht pro Projekt neu erfunden. Verbindlich ist `bw-theme.css`
(Single Source of Truth). **Keine Farb-, Schrift- oder Abstandswerte hart
codieren** — immer die `--bw-*`-Variablen. Fehlt ein Wert, ergänze ihn im
Theme, nicht im Tool.

---

## 1. Projektstruktur
```
index.html              ← das Tool (lädt bw-theme.css + assets/)
bw-theme.css            ← Design-System, Single Source of Truth
assets/fonts/           ← BaWue Sans/Serif (woff2+woff) — lizenzpflichtig
assets/logo/            ← RPF-Logo (rpf-logo.png, -negativ.png, rpf-flag.png)
assets/favicons/        ← Favicon-Paket + favicon.ico
assets/js/nav.js        ← Hamburger-Navigation (a11y)
assets/js/search.js     ← globale Fuzzy-Suche (In-Memory)
assets/js/chart.js      ← CI-konforme SVG-Diagramme
assets/js/db.js         ← PGlite-Datenbankschicht (DB-Tools)
assets/vendor/pglite/   ← lokal abgelegtes PGlite (kein CDN!) — bei DB-Tools
site.webmanifest        ← PWA-Manifest
tools/build_singlefile.py ← erzeugt offline Single-File dist/index.html
CLAUDE.md · AGENTS.md · ROADMAP.md · README.md
```

---

## 2. Kernvorgabe: vollständig offline, keine CDN-Abhängigkeit
**Jedes Tool muss komplett lokal und offline laufen** — im Flugmodus, per
Doppelklick, ohne Netzwerk, ohne Installation. Das ist nicht verhandelbar
(Zero-Trust-Arbeitsplatz).

- **Keine externen Requests** — niemals. Kein CDN (unpkg, jsdelivr, cdnjs,
  esm.sh …), keine Web-Fonts von Google/Adobe, keine Importmaps auf
  Remote-URLs, kein `fetch`/`import` gegen `http(s)://`, keine Telemetrie,
  keine Tracking-Pixel, keine Remote-Analytics.
- **Alle Abhängigkeiten vendoren** → `assets/vendor/<lib>/` und lokal
  einbinden. Betrifft ausdrücklich auch **React/ReactDOM, Babel Standalone,
  PGlite (inkl. WASM), sql.js, Diagramm-Bibliotheken**. Wird etwas „mal eben"
  von einem CDN gezogen, ist das Tool kaputt.
- **Schriften, Logo, Icons, WASM** liegen lokal im Repo.
- **Test = Definition:** Tool im **Flugmodus** öffnen. Lädt etwas nicht oder
  zeigt das Netzwerk-Panel einen externen Request → nicht offline-fähig.
- **Prüfung:** `python3 tools/check_offline.py` findet externe Referenzen und
  schlägt fehl, falls welche existieren (läuft auch im CI bei jedem PR).

**Auslieferung**
- **Einfache Tools** → Single-File via `tools/build_singlefile.py` (inlined
  Theme, base64-Fonts/-Assets/-Skripte), per Doppelklick lauffähig.
- **DB-Tools** (PGlite/WASM) → Ordner-Bundle mit vendored Abhängigkeiten;
  über internen Webserver oder als entpackter Ordner geöffnet. WASM lässt sich
  nicht sinnvoll in eine Einzeldatei pressen.

## 2.1 Stack
- Vanilla JS oder React 18 (Babel Standalone, **lokal vendored**),
  **PGlite** (Postgres-WASM) oder sql.js, Persistenz **OPFS**/IndexedDB,
  Offline-First.
- **Personenbezogene Daten** produktiv nur über BITBW/LVN, nicht Self-Hosting.

---

## 3. Design-System (Details in `bw-theme.css`)
- **Hauptfarben:** `--bw-gelb`, `--bw-schwarz` (warm), Weiß. Funktionale
  Grautöne (`--bw-grau-*`) gliedern, ersetzen die Hauptfarben nie.
- **Akzente sparsam:** `--bw-erfolg` (Do), `--bw-fehler` (Don't). Keine freie
  Farbigkeit.
- **Gelb-Regel:** Flächen-/Hervorhebungsfarbe, **nie Textfarbe auf Weiß**; Text
  auf Gelb ist Schwarz; gelbe Elemente auf Weiß brauchen dunkle Outline.
- **Hoher Weißanteil** erwünscht.
- **Schriften:** Überschriften `--bw-font-serif` (BaWue Serif), Text/UI
  `--bw-font-sans` (BaWue Sans), per `@font-face` lokal aus `assets/fonts/`.
  Niemals von externen Diensten laden. Fallbacks sind definiert.
- **Layout:** max. drei Flächen, gedrittelt/halbiert (nie 75/25); Randabstand
  = 2× Grundeinheit; Logo links.
- **Komponenten:** `.bw-header` · `.bw-nav` (+ Hamburger) · `.bw-flaechen/.bw-flaeche` ·
  `.bw-card` · `.bw-btn` (+`--sekundaer`,`--gelb`) · Formularfelder · `.bw-search` ·
  `.bw-table` · `.bw-chart`/`.bw-legend` · `.bw-stoerer` (rund) · `.bw-hinweis` ·
  `.bw-footer` · `.bw-copyright`.

---

## 3.1 Navigation & Responsivität
- **Mobile-First, responsiv** bis zum Smartphone. Layout nutzt `.bw-flaechen`
  (Grid), das unter 640px einspaltig umbricht.
- **Header-Muster (CI):** Logo links; Aktionen (Suche, Menü) rechts. Aktiver
  Navigationslink trägt den **gelben Marker** (`aria-current="page"`).
- **Hamburger-Menü** unter 800px: Button mit `data-nav-toggle`,
  `aria-controls`, `aria-expanded`; öffnet `.bw-nav__panel`. Verhalten in
  `assets/js/nav.js` (Escape schließt, Klick außerhalb schließt, Fokus zurück).
  Kein eigenes Menü neu bauen — dieses verwenden.
- **Touch-Targets ≥ 44×44px** (`.bw-iconbtn`). Footer = schwarzer Streifen
  (`.bw-footer`) mit Negativ-Logo.

## 3.2 Schaubilder, Diagramme, Statistik
Es gelten die Infografik-Regeln des Landes-CD:
- **Grauabstufungen als Basis.** Einfache Diagramme arbeiten ruhig und sachlich
  in Grau (`--bw-cat-1/2`).
- **BaWü Gelb nur zur Hervorhebung EINES Werts** (oder einfarbiges Diagramm wie
  Histogramm) — immer mit **dunkler Outline** (`.bar--highlight`).
- **Komplexe Diagramme:** Grau + sparsame Nebenfarben (`--bw-cat-3…6`), auch
  über Helligkeitsstufen unterscheiden.
- **Kontrast ≥ 3:1** jeder Farbe zum Hintergrund (ideal auch untereinander).
  Helle Farben/Gelb < 3:1 → dunkle Outline.
- **Abgerundete Ecken** (`--bw-chart-radius`), **klare Trennung** (mind. 1px),
  optional **Schraffuren** als Zusatzcodierung (Farbsehschwäche).
- Die digitalen **Interaktions-Color-Tokens nicht** in Infografiken verwenden.
- **Keine externen Chart-CDNs** (Zero-Trust): bevorzugt eigene SVG über
  `assets/js/chart.js`; reicht das nicht, eine Bibliothek **lokal vendoren**
  und Farben/Optik per Theme erzwingen (keine Default-Paletten, keine
  Schatten/Deko-Animationen).
- Zahlen in **de-DE** formatieren (Tausenderpunkt, Dezimalkomma).

## 3.3 Globale Suche (Pflichtmuster für Listen/Tabellen)
Suche ist **intelligent, multitokenbasiert, fuzzy und global**:
- **global:** durchsucht alle relevanten Felder gemeinsam.
- **multitoken:** jedes Wort der Eingabe muss matchen (UND), Reihenfolge egal.
- **fuzzy:** tippfehler-tolerant; **diakritikatolerant** (ä=a, ß=ss).
- **Ranking** nach Relevanz; Treffer mit `<mark class="bw-treffer">` markieren.
- **Ohne Datenbank:** `assets/js/search.js` (`bwSearch.search/normalize/highlight`).
- **Mit Datenbank:** in der DB suchen (siehe 3.4), nicht im Client nachbauen.

## 3.4 Datenbank-Tools — PGlite (verbindlich)
Für datenbankbasierte Tools ist die Datenhaltung **PGlite** (Postgres als
WebAssembly), persistent in **OPFS**:
- PGlite **lokal vendoren** (`assets/vendor/pglite/`), **niemals CDN**.
- Extensions **`unaccent`, `pg_trgm`, `fuzzystrmatch`** aktivieren → die globale
  Fuzzy-Suche (3.3) läuft **in der Datenbank** (Trigramm-Ähnlichkeit über eine
  zusammengeführte, normalisierte `such_text`-Spalte mit GIN-Index). Referenz:
  `assets/js/db.js` (`initDB`, `createTable`, `globaleSuche`).
- **Zwei-Phasen-Rollout:** Phase 1 lokale/Netzlaufwerk-Ablage (`.pgdata`/OPFS);
  Phase 2 produktiv über **BITBW/LVN**. Personenbezogene Daten produktiv nur dort.
- Keine personenbezogenen Echtdaten ins Repo.
- **Auslieferung:** einfache Tools als Single-File (`build_singlefile.py`);
  DB-Tools als Ordner-Bundle mit vendored PGlite (WASM lässt sich nicht
  sinnvoll in eine Einzeldatei pressen).

---

## 4. CI-Checkliste
**Do:** nur Markenfarben; aufgeräumt; hoher Weißanteil; klare gerade Flächen;
Störer rund/kontrastierend; ausreichender Kontrast.
**Don't:** keine Schatten/Verläufe/Konturlinien als Deko; keine freie
Farbigkeit; nicht überladen; nicht mehr als drei Flächen; keine schiefen
Teilungen; Logo nicht einfärben/verzerren/abschatten.

---

## 5. Barrierefreiheit (Pflicht)
WCAG 2.1 AA, Kontrast ≥ 4,5:1; semantisches HTML, `lang="de"`,
Überschriftenhierarchie, Feldbeschriftungen; volle Tastaturbedienung,
sichtbarer Fokus, Skip-Link; `prefers-reduced-motion` respektieren.

---

## 6. Logo & Recht
- RPF-Logo aus `assets/logo/` einsetzen (nicht nachbauen/einfärben/verzerren).
  Auf dunklen/gelben Flächen `rpf-logo-negativ.png` (weiß).
- Logo-Versionen nicht mischen.
- Schriften & Logo sind lizenziert/geschützt → siehe `assets/fonts/LIZENZ.md`
  und `assets/logo/LIZENZ.md`. **Repos privat halten.**

---

## 7. Arbeitsweise
1. Erst prüfen, ob vorhandene Theme-Komponenten reichen.
2. Zero-Trust, offline, ohne externe Requests bauen.
3. CI-Checkliste (4) und Barrierefreiheit (5) vor jedem Commit durchgehen.
4. Texte: aktive Verben, Sentence-Case, kein Füllwort; Fehlermeldungen sagen,
   was passierte und wie es weitergeht.
5. Prozess (Branch/PR/Milestones): `AGENTS.md`.

> Exakte offizielle Digital-Farbtokens im Design-Portal gegenchecken und nur in
> `bw-theme.css` anpassen.
