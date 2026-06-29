# STATUS.md — Übergabe / aktueller Stand

Kurzer Übergabepunkt für die jeweils nächste Session/Iteration. **Wahrheit über
den Fortschritt** steht in `ROADMAP.md`; hier nur der Einstieg + das Nächste.

## Schnellstart für eine neue Session
1. `CLAUDE.md`, `AGENTS.md`, `docs/ARCHITEKTUR.md`, `ROADMAP.md` lesen.
2. Selbstcheck: `node tools/test_*.mjs` · `python3 tools/check_offline.py` ·
   `node tools/build_standalone.mjs` · `node tools/smoke/run.mjs` (lokaler
   Chromium nötig; siehe `tools/smoke/harness.mjs`).
3. Loop: auf dem aktuellen Arbeitsbranch von aktuellem `main`, genau eine
   Iteration, PR → CI grün → squash-merge → `main` syncen (Details: `AGENTS.md`).
   Standalone-Build braucht `npm install esbuild @electric-sql/pglite --no-save`
   (PGlite-Version = `assets/vendor/pglite`, `pglite.wasm`-Größe abgleichen);
   Smokes brauchen zusätzlich `playwright-core`.

## Funktionsumfang (fertig)
- Prüfung (Stammdaten, Tagesplanung/-cockpit, Stationen-Rotation, Noten,
  Zeugnisse, Auswertungen), Zugangsschutz/Benutzer, Recht (Impressum/Datenschutz/
  Barrierefreiheit).
- **Übersicht-Dashboard** mit Bereiche-Kacheln (alle Werkzeuge), Login springt
  direkt aufs Dashboard.
- Vorlagen-Versand: **Anlagen-System + E-Mail-Entwurf (.eml mit Anhängen)**
  (`eml.js`, `assets/anlagen/`); 5 offizielle Anlagen gebündelt (BAV, Hilfestellung,
  Infoblatt Azubi, Praktikantenvertrag, Abmeldung/Auflösung BAV); Empfänger aus
  Stammdaten/Betrieb; Schreiben aus Prüflings-/Betriebs-Akte (Deep-Links
  `#/vorlagen?betrieb=<id>` / `?an=<email>`).
- Ausbildungsrechner (Engine + Oberfläche).
- Berichtsheftkontrolle: Dashboard, Kontrolle erfassen, **KW-Wochenraster**,
  Wiedervorlagen, Kontrolltermine, druckbare Listen, **Mängel-Auswertung**
  (Code-Häufung + Betriebs-Sicht + CSV), **CSV-Import von Kontrollen**.
- Ausbildungsberatung: Fälle + Verlauf, Themen-Häufung, WV-Board; **Beratungsfall
  aus Berichtsheft anlegen**.
- **Modulübergreifend verlinkt:** Prüflings-Akte und Betriebs-Akte zeigen
  Berichtsheft & Beratung; Fall-Akte verlinkt Prüfling-Akte + Raster;
  Auswertungen mit bereichsübergreifendem Überblick.
- Datensicherung erfasst alle Tabellen; Unit-Tests (galabau, ablauf, auth,
  rechner, berichtsheft, beratung, **eml**) in der CI; Smoke-Harness mit 10 Smokes
  (`tools/smoke/run.mjs`, lokal).

## Nächste sinnvolle Iterationen (Vorschlag)
- **Braucht Input der Dienststelle:** weitere offizielle/RP-interne Vordrucke
  (Ausbilderbogen, Anträge Verkürzung/Verlängerung, Ausbildungsnachweis,
  berufsspezifische Gärtner-Anlagen) als PDF + je Standard-Mail den Text und die
  beizufügenden Anlagen/Checkliste; dann als Vorlagen einbauen. Info-Mail für
  Interessenten und Auflösung/Abmeldung sind bereits angelegt.
- Auswertungen: Stichtagsauswertung; Mängel-/Fehltage-Trend über Ausbildungsjahre.
- Prüfer-Akte ggf. analog verlinken; Adressliste um Bereichsbezüge ergänzen.

## Offene Hinweise
- Merge erfolgt im Loop automatisch (auf ausdrückliche Anweisung des Nutzers):
  Draft → CI grün → ready → squash-merge → `main` syncen. „stop"/„merge stoppen"
  hält das an.
- Squash-Merge-Commits auf `main` zeigt GitHub als „Unverified" (Committer
  `noreply@github.com`) — systembedingt beim API-Merge, kein Code-Thema.
- Smokes laufen lokal, nicht in der CI (kein Browser dort). Bei neuem Feature
  einen Smoke unter `tools/smoke/` ergänzen und in `run.mjs` eintragen.
