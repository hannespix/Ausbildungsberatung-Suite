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

### M2 — Saubere Stammdaten ✅
Betrieb-Auswahl per Vorschlagsliste (`datalist`, neues `reftext`-Feldmuster);
E-Mail-Format-Validierung mit deutscher Meldung; Dublettenwarnung (bestätigbar)
über Identitätsfelder je Entität. Smoke-getestet (Chromium).

---

## Geplant (Loop-Backlog — Reihenfolge flexibel)

### M2b — Weitere Stammdaten-Politur (offen)
Berufe-Lookup, PLZ-Format, Inline-Bearbeitung, Sortierung per Spaltenkopf.

### M3 — Prüfungstag-Planung (Zuteilung) ✅
Neue Ansicht „Planung": Prüflinge je Prüfungstermin **zuteilen** (mit Uhrzeit-
Slot), Tagesliste mit Entfernen, Konflikt-/Doppelbelegungswarnung am selben Tag,
saubere Aufräumung abhängiger Zuteilungen beim Löschen. Smoke-getestet (Chromium).

### M3b — Ausschuss-Zuteilung ✅
In der Planung zusätzlich **Prüfer:innen** einem Termin zuteilen (mit Rolle:
Vorsitz/Beisitz/Lehrkraft), Liste mit Entfernen; abhängige Zuteilungen werden
beim Löschen aufgeräumt. Smoke-getestet (Chromium).

### M3c — Druckbarer Tagesablauf ✅
„Tagesablauf drucken" je Termin: CI-konforme Druckvorlage (`@media print`,
tintensparend) mit Kopf, Prüflingen inkl. Slots und Ausschuss; über den
Druckdialog auch als PDF. Smoke-getestet (Chromium, `window.print` gestubbt).

### M4 — Prüfer-Organisation
Verfügbarkeiten, Ausschuss-Zusammenstellung (Vorsitz/Beisitz/Lehrkraft),
ausgewogene Zuteilung, Einladungs-/Bestätigungsstatus.

### M5 — Notenberechnung ✅
Neue Ansicht „Noten": Gesamtbewertung je Prüfling, Bewerten-Dialog mit
Live-Vorschau, Notenverteilungs-Diagramm. Smoke-getestet (Chromium).

### M5a — Linearer Dezimal-Schlüssel ✅
Auf das offizielle Schema BW (grüne Berufe) umgestellt: **Note = 6 − 5·(Punkte/
Maximalpunktzahl)** als Dezimalnote (1,0–6,0), wählbare Maximalpunktzahl
(40/60/80/100/120/150/200), Wortstufen (sehr gut … ungenügend). Grundlage:
Notenberechnungs-Vorlage „Gärtner AP S 2026" (RP Freiburg). Smoke-getestet.

### M5b — Volles Gärtner-Gesamtschema (offen, Fachentscheidung)
Prüfungsbereiche praktische Prüfung (I–V) + Kenntnisprüfung (Landschaftsgärtn.
Arbeiten, Pflanzenkenntnisse, Betriebl. Zusammenhänge, WiSo), **Gewichtung**,
GESAMTNOTE, **Bestehensregeln/Sperrfach** und Nachprüfung. Gewichte/Regeln aus
der Vorlage extrahieren und VOR dem Verdrahten mit dem Fachbereich bestätigen.

### M7 — Excel-Import der Bewertungsbögen (offen)
SheetJS lokal vendoren; Azubi-/Punktedaten aus den `.xlsm/.xlsx`-Sammelbögen
einlesen (Mapping-Vorschau, Dublettenabgleich).

### M6 — Zeugnis-Erstellung ✅
Neue Ansicht „Zeugnisse": druckbares Prüfungszeugnis je Prüfling aus Stammdaten
(Name, Geburtsdatum, Beruf, Betrieb), Prüfungstermin und Note/Ergebnis, mit
Unterschriftslinien und Datum; CI-konforme Druckvorlage, PDF über Druckdialog.
Druck nur bei vorhandener Bewertung. Smoke-getestet (Chromium).

### M6b — Zeugnis-Serie (offen)
Serien-/Stapeldruck mehrerer Zeugnisse, amtlicher Kopf/Logo im Druck,
konfigurierbarer Zeugnistext je Beruf.

### M7 — Import / Export
**Excel/CSV-Import** (Mapping-Assistent, Vorschau, Dublettenabgleich), Export
CSV/Excel; Format für nachgelagerte Systeme (z. B. Listen, Seriendruck).

### M8 — Outlook-/Kalender-Konnektivität (offline-konform)
**ICS-Export** der Prüfungstage (Kalendereinträge/Einladungen), vCard-Export der
Adress-/Telefonliste, `mailto:`-Vorlagen — ohne externe Requests (kein Graph-API).

### M9 — Adress- & Telefonliste ✅
Neue Ansicht „Adressliste": konsolidiert Betriebe und Prüfer:innen, DB-seitige
globale Fuzzy-Suche (UNION + Trigramm) mit Treffermarkierung, Telefon-/E-Mail als
`tel:`/`mailto:`-Aktionen, druckbare Liste. Smoke-getestet (Chromium).

### M9b — Kontakte-Export (offen)
CSV-/vCard-Export der Adressliste.

### M10 — Auswertungen & Dashboard
Kennzahlen (Bestehensquoten, Auslastung je Tag/Beruf), CI-konforme Diagramme,
Filter, Stichtagsauswertung.

### M11 — Barrierefreiheit & Feinschliff
WCAG-AA-Audit, Tastatur-/Screenreader-Durchgang, Leer-/Fehlerzustände,
Hilfetexte, Tastenkürzel, Dark-Mode-Prüfung der Tokens.

### Laufend
Datensicherung (DB-Export/-Import als Datei), Robustheit, Tests, Performance.
