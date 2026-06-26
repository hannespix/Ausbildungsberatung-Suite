# ROADMAP — Ausbildungsberatung-Suite

Werkzeug-Suite zur **Prüfungsplanung praktischer Abschlussprüfungen** und zur
Organisation der **Ausbildungsberatung am RP Freiburg** (grüne Berufe,
Hauswirtschaft). `@claude` baut die Suite im autonomen Erweiterungs-Loop aus:
**je Run ein abgeschlossener, lauffähiger Zuwachs** über Branch → PR → CI →
Auto-Merge (siehe `AGENTS.md`).

> Zielgruppe / Ablage: Ausbildungsberatung RP Freiburg. Daten lokal (OPFS,
> automatischer Fallback IndexedDB → Arbeitsspeicher). Produktiv mit
> Personenbezug nur über BITBW/LVN. Keine echten personenbezogenen Daten im Repo.

---

## Erledigt

### M0 — Gerüst ✅
Vorlage eingerichtet, Landes-CD, `@claude`-Loop, Offline-CI, Bundle-Artifact.

### M1 — Datenfundament + Stammdaten ✅
PGlite (OPFS) lokal vendored; datengetriebenes Modell (`model.js`); Persistenz-/
CRUD-/Such-Schicht (`store.js`); SPA mit Router, Übersicht (Kennzahlen +
Diagramm) und CRUD für **Prüflinge, Betriebe, Prüfer:innen, Prüfungstermine**;
DB-seitige globale Fuzzy-Suche; Beispiel­daten (fiktiv). Smoke-getestet (Chromium).

---

## Geplant (Loop-Backlog — Reihenfolge flexibel)

### M2 — Beziehungen & saubere Stammdaten
Prüfling↔Betrieb als Auswahl (statt Freitext), Berufe-Lookup, Dublettenwarnung,
Pflichtfeld-/Format-Validierung (E-Mail, PLZ), Inline-Bearbeitung.

### M3 — Prüfungstage & Tagesplanung
Prüfungstermine mit Prüflings- und Prüfer-**Zuteilung**, Zeitslots je Prüfling,
Tagesablaufplan (druckbar), Konflikt-/Doppelbelegungsprüfung, Kapazitäten.

### M4 — Prüfer-Organisation
Verfügbarkeiten, Ausschuss-Zusammenstellung (Vorsitz/Beisitz/Lehrkraft),
ausgewogene Zuteilung, Einladungs-/Bestätigungsstatus.

### M5 — Notenberechnung
Bewertungsschema je Beruf (gewichtete Teilleistungen), Punkte→Note (100-Punkte-
Schlüssel), Bestehensregeln, Sperrfach-Logik, Nachprüfungs-Kennzeichnung.

### M6 — Zeugnis-Erstellung
Zeugnis/Bescheinigung aus Stammdaten + Noten, CI-konforme Druckvorlage
(`@media print`), Serien-Erstellung, PDF über Druckdialog.

### M7 — Import / Export
**Excel/CSV-Import** (Mapping-Assistent, Vorschau, Dublettenabgleich), Export
CSV/Excel; Format für nachgelagerte Systeme (z. B. Listen, Seriendruck).

### M8 — Outlook-/Kalender-Konnektivität (offline-konform)
**ICS-Export** der Prüfungstage (Kalendereinträge/Einladungen), vCard-Export der
Adress-/Telefonliste, `mailto:`-Vorlagen — ohne externe Requests (kein Graph-API).

### M9 — Adress- & Telefonliste
Konsolidierte, druck- und exportierbare Kontaktliste (Betriebe, Prüfer:innen,
Ansprechpartner) mit Schnellsuche und Telefon-/E-Mail-Aktionen.

### M10 — Auswertungen & Dashboard
Kennzahlen (Bestehensquoten, Auslastung je Tag/Beruf), CI-konforme Diagramme,
Filter, Stichtagsauswertung.

### M11 — Barrierefreiheit & Feinschliff
WCAG-AA-Audit, Tastatur-/Screenreader-Durchgang, Leer-/Fehlerzustände,
Hilfetexte, Tastenkürzel, Dark-Mode-Prüfung der Tokens.

### Laufend
Datensicherung (DB-Export/-Import als Datei), Robustheit, Tests, Performance.
