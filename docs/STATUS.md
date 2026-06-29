# STATUS.md — Übergabe / aktueller Stand

Kurzer Übergabepunkt für die jeweils nächste Session/Iteration. **Wahrheit über
den Fortschritt** steht in `ROADMAP.md`; hier nur der Einstieg + das Nächste.

## Schnellstart für eine neue Session
1. `CLAUDE.md`, `AGENTS.md`, `docs/ARCHITEKTUR.md`, `ROADMAP.md` lesen.
2. Selbstcheck: `node tools/test_*.mjs` · `python3 tools/check_offline.py` ·
   `node tools/build_standalone.mjs` · `node tools/smoke/run.mjs` (lokaler
   Chromium nötig; siehe `tools/smoke/harness.mjs`).
3. Loop: Branch `claude/general-session-935kvh` von aktuellem `main`, genau eine
   Iteration, PR → CI grün → squash-merge → `main` syncen (Details: `AGENTS.md`).

## Funktionsumfang (fertig)
- Prüfung (Stammdaten, Tagesplanung/-cockpit, Stationen-Rotation, Noten,
  Zeugnisse, Auswertungen), Zugangsschutz/Benutzer, Recht (Impressum/Datenschutz/
  Barrierefreiheit), Vorlagen.
- Vorlagen-Versand: **Anlagen-System + E-Mail-Entwurf (.eml mit Anhängen)**
  (`eml.js`, `assets/anlagen/`); erste offizielle Anlage gebündelt (Muster-BAV).
- Ausbildungsrechner (Engine + Oberfläche).
- Berichtsheftkontrolle: Dashboard, Kontrolle erfassen, **KW-Wochenraster mit
  Tastatur-Schnellkontrolle**, Wiedervorlagen, Kontrolltermine, druckbare Listen,
  **Mängel-Auswertung** (Code-Häufung + Fehltage-Kennzahlen).
- Ausbildungsberatung: Fälle + Verlauf, Themen-Häufung, bereichsübergreifendes
  Wiedervorlage-Board (auch auf der Startseite).
- Datensicherung erfasst alle Tabellen; Tests (galabau, ablauf, auth, rechner,
  berichtsheft, beratung) in der CI; lokales Smoke-Harness (`tools/smoke/`).

## Nächste sinnvolle Iterationen (Vorschlag)
- Vorlagen ausbauen: weitere offizielle Anlagen bündeln (Infoblatt Azubi,
  Abmeldung/Auflösung BAV, Ausbilderbogen, Anträge Verkürzung/Verlängerung) und
  neue Schreiben (Info-Mail für Ausbildungsinteressenten mit Vertragsvorlagen,
  Aufhebungsvertrag). Vom RP/MLR auffindbar (siehe `assets/anlagen/QUELLEN.md`);
  RP-interne/berufsspezifische Vordrucke liefert die Dienststelle.
- Berichtsheft-Import (CSV) für Auszubildende/Kontrolldaten.
- Mängel-Auswertung vertiefen (Betriebs-Sicht: Mängel je Betrieb, Trend über
  Ausbildungsjahre).
- Beratungs-/Berichtsheft-Verknüpfung vertiefen (aus Mangel → Beratungsfall).

## Offene Hinweise
- Watchdog-Cron ist session-gebunden → nach Container-Neustart neu anlegen.
- Smokes laufen lokal, nicht in der CI (kein Browser dort). Bei neuem Feature
  einen Smoke unter `tools/smoke/` ergänzen und in `run.mjs` eintragen.
