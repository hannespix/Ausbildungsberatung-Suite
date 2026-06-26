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
Ausschuss-Zusammenstellung (Vorsitz/Beisitz/Lehrkraft), ausgewogene Zuteilung,
Einladungs-/Bestätigungsstatus ✅ (Prüfer-Plan).
- ✅ **Konfliktfreie Ausschuss-Besetzung**: die Auto-Planung vermeidet aktiv
  Doppelbelegungen am selben Prüfungstag (datums-bewusst, mit Auffüllung statt
  leerem Ausschuss); verbleibende Doppelbelegungen werden in den Auswertungen
  als „Prüfer-Doppelbelegungen" aufgelistet (`prueferKonflikte`). Smoke-getestet.
- Offen: gepflegte Prüfer-Verfügbarkeiten (Abwesenheiten) als Eingabe.

### M5 — Notenberechnung ✅
Neue Ansicht „Noten": Gesamtbewertung je Prüfling, Bewerten-Dialog mit
Live-Vorschau, Notenverteilungs-Diagramm. Smoke-getestet (Chromium).

### M5a — Linearer Dezimal-Schlüssel ✅
Auf das offizielle Schema BW (grüne Berufe) umgestellt: **Note = 6 − 5·(Punkte/
Maximalpunktzahl)** als Dezimalnote (1,0–6,0), wählbare Maximalpunktzahl
(40/60/80/100/120/150/200), Wortstufen (sehr gut … ungenügend). Grundlage:
Notenberechnungs-Vorlage „Gärtner AP S 2026" (RP Freiburg). Smoke-getestet.

### M5b — Galabau-Gesamtschema ✅
Aus der Vorlage „Notenberechnung Gärtner AP S 2026" reverse-engineert und
integriert: 5 praktische Bereiche (I–V) + 4 Kenntnisbereiche, Praxis-Schnitt
(TRUNC,1), Kenntnis-Schnitt, **GESAMTNOTE = Praxis·0,6 + Kenntnis·0,4** (TRUNC,1),
**Bestehensregeln** (Schnitt/Gesamt < 4,5; Sperrfach ≥ 5,5; max. ein Bereich ≥ 4,5).
Bewerten-Dialog (9 Bereiche, Live-Ergebnis), Noten-Liste, Zeugnis. Smoke-getestet
(inkl. 60/40, Sperrfach, 2×≥4,5). Tool jetzt auf **Gärtner-Fachrichtungen** fokussiert.

### M5c — Notenberechnung-Detail (teils ✅)
- ✅ **Pflanzenkenntnisse als Teilnote**: aus den offiziellen Folien
  übernommen — Pflanzenkenntnisse = TRUNC((2·schriftliche PK + 1·Pflanzen­
  bestimmung)/3, 1). Im Bewerten-Dialog füllen zwei Teilnoten automatisch das
  Pflanzenkenntnisse-Feld; Teilwerte werden gespeichert und beim Wiederöffnen
  vorbelegt. Nebenbei behoben: Dezimalnoten gingen beim Wiederöffnen verloren
  (`type=number` akzeptiert kein Komma). Smoke-getestet.
- Offen: Mündliche Ergänzungsprüfung ((U+U+V)/3, nur schriftliche Fächer),
  „eine einzige 6 → durchgefallen" explizit, weitere Fachrichtungen.

### M7 — Excel-/CSV-Import (teils ✅)
- ✅ **CSV-Import von Prüflingen**: offline-Parser (Trennzeichen-Erkennung ; / ,,
  Anführungszeichen, Umlaute), automatische Spaltenzuordnung (überschreibbar),
  Vorschau und Dublettenschutz (Nach-/Vorname). Button in der Prüflingsliste.
  Smoke-getestet (inkl. quoted Feld mit Komma, Dublette, leere Zeile).
- Offen: SheetJS lokal vendoren für `.xlsx/.xlsm`-Sammelbögen (Punktedaten),
  CSV-Import auch für Betriebe/Prüfer:innen.

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
- ✅ **ICS-Export** der Prüfungstage (RFC 5545, lokal als `.ics`-Datei, kein
  Graph-API): in der Planung „Alle Termine als Kalender (.ics)" und je Termin
  „Termin als .ics". VEVENT mit Datum/Uhrzeit, Ort/Raum und Beschreibung
  (Fachrichtung, Prüflingszahl, Ausschuss). In Outlook importierbar. Smoke-getestet.
- Offen: vCard-Export der Adress-/Telefonliste; `mailto:`-Einladung (Prüfer-Plan
  vorhanden).

### M9 — Adress- & Telefonliste ✅
Neue Ansicht „Adressliste": konsolidiert Betriebe und Prüfer:innen, DB-seitige
globale Fuzzy-Suche (UNION + Trigramm) mit Treffermarkierung, Telefon-/E-Mail als
`tel:`/`mailto:`-Aktionen, druckbare Liste. Smoke-getestet (Chromium).

### M9b — Kontakte-Export ✅
CSV- und vCard-Export der Adressliste (jeweils die aktuelle, ggf. gefilterte
Auswahl): CSV mit Semikolon + BOM (Excel), vCard 3.0 je Kontakt (N/FN/ORG/TEL/
EMAIL, Prüfer:innen mit TITLE). Offline per Datei-Download, in Outlook/Telefon
importierbar. Smoke-getestet.

### M10 — Auswertungen & Dashboard ✅
Neue Ansicht „Auswertungen": Kennzahlen (belegte Termine, Ø Prüflinge/Termin,
Bestehensquote gesamt), **Bestehensquote je Fachrichtung** (CI-konformes
Balkendiagramm + Tabelle mit Ø Note) und **Auslastung je Prüfungstermin**
(Prüflinge/Ausschuss, Warnung bei Terminen ohne Ausschuss). Alles abgeleitet,
keine neue Eingabe. Smoke-getestet (inkl. Mobile 390px).
Offen: Filter/Stichtagsauswertung, Auslastungs-Diagramm.

### M11 — Barrierefreiheit & Feinschliff
WCAG-AA-Audit, Tastatur-/Screenreader-Durchgang, Leer-/Fehlerzustände,
Hilfetexte, Tastenkürzel, Dark-Mode-Prüfung der Tokens.

### Single-File (Doppelklick, ohne Server) ✅
PGlite läuft ohne Server unter `file://`: WASM/Daten eingebettet (Provisioning),
Extensions als `data:`-URL, Persistenz in IndexedDB. `tools/build_standalone.mjs`
erzeugt die doppelklickbare **`download/Ausbildungsberatung-Suite.html`**
(offline, ~23 MB). Unter Chromium `file://` verifiziert (Boot, DB, Fuzzy-Suche,
Persistenz nach Reload).

### Datensicherung (Export/Import als Datei) ✅
Vollständige Sicherung aller Tabellen als JSON-Datei und Wiederherstellung
(Übersicht → „Datensicherung"): bewahrt IDs/Beziehungen (OVERRIDING SYSTEM
VALUE), lässt generierte Spalten (`such_text`) aus und schreibt die
Identity-Sequenzen fort; die Fuzzy-Suche steht nach dem Import sofort wieder.
Offline per Datei-Download/-Upload, ohne externe Requests. Smoke-getestet
(Round-Trip mit 155 Prüflingen inkl. Zuteilungen und Bewertungen).

### Single-File — offen
Roh-DB-Export (`dumpDataDir`/`loadDataDir`) als Alternative zur JSON-Sicherung;
Single-File in der CI bauen; Größe optimieren.

### Beispieldaten-Generator ✅
Großer fiktiver Datensatz per Knopf (Übersicht): ~155 Prüflinge nach
Fachrichtungs-Verteilung (GaLaBau 100, Gemüsebau 20, Zierpflanzenbau 10,
Baumschule 10, Friedhofsgärtnerei 5, Obstbau 5, Staudengärtnerei 5), Betriebe
mit 1–10 Azubis, passende Prüfer:innen und Prüfungstermine je Fachrichtung;
„Alle Daten löschen" zum Zurücksetzen. Smoke-getestet (Verteilung geprüft).

### Workflow-Ausbau (Loop)
„Von der Vorbereitung bis zum Zeugnis":
- ✅ Auto-Zuteilung passender Prüflinge zu einem Termin (alphabetisch, idempotent).
- ✅ **Intelligente Gesamtplanung**: je Fachrichtung gleichmäßige Verteilung auf
  passend viele Termine (Kapazität je Tag), PLZ-geclustert, fehlende Termine
  automatisch angelegt, **Ausschuss je Termin** automatisch besetzt.
- ✅ **Serien-Zeugnisdruck**: alle bewerteten Zeugnisse in einem Druck (je Seite).
- ✅ **Prüfer-Plan & Zusage-Workflow**: je Termin Ausschuss informieren
  (E-Mail/mailto), Status offen→angefragt→zugesagt/abgesagt in einer Übersicht.
- ✅ **Automatischer Prüfungs-Fortschritt**: je Prüfling eine abgeleitete Phase
  (Angemeldet→Zugelassen→Eingeplant→Bestanden/Nicht bestanden), die Zulassung,
  Tagesplanung und Bewertung ohne manuelle Pflege zusammenführt. Funnel mit
  Bestehensquote auf der Übersicht, Status-Pill je Zeile in der Prüflinge-Liste;
  eine gespeicherte Bewertung setzt den Prüfling-Status automatisch. Smoke-getestet.
- ✅ **Automatisches Zeitraster**: die Gesamtplanung vergibt je Termin
  fortlaufende Uhrzeiten (Beginn aus dem Termin, 20-Minuten-Takt); in der
  Planung lässt sich das Raster je Termin neu erzeugen (Beginn/Takt wählbar)
  oder löschen. Speist den druckbaren Tagesablauf. Smoke-getestet.
- Offen: Auswertungen je Tag/Beruf,
  Prüfer-Verfügbarkeiten/Konfliktprüfung bei der Ausschuss-Besetzung.

### Laufend
Datensicherung (DB-Export/-Import als Datei), Robustheit, Tests, Performance.
