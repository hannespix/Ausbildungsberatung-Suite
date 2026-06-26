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

### M2b — Weitere Stammdaten-Politur (teils ✅)
- ✅ **Sortierung per Spaltenkopf** in allen Listen: Klick (oder Tastatur) auf
  einen Spaltenkopf sortiert auf-/absteigend, typbewusst (Text de-locale,
  Zahlen, Datum; leere Werte ans Ende), `aria-sort` gesetzt, mit Suche
  kombinierbar. Smoke-getestet (inkl. Mobile).
- ✅ **CSV-Export & Druck jeder Liste**: „CSV exportieren" und „Liste drucken"
  in allen Stammdaten-Listen — folgt der aktuellen Suche und Sortierung,
  Prüflinge inkl. abgeleiteter Fortschritt-Spalte. Smoke-getestet (inkl. Mobile).
- ✅ **Format-Validierung** (modellgetrieben): PLZ 5-stellig, Prüfungsjahr
  4-stellig — mit deutscher Meldung, leere Nicht-Pflichtfelder bleiben erlaubt.
  Über `muster`/`musterText` je Feld erweiterbar. Smoke-getestet.
- Offen: Berufe-Lookup, Inline-Bearbeitung.

### Globale Schnellsuche ✅
Eigene Ansicht (`#/suche`, über die Header-Lupe erreichbar): durchsucht
Prüflinge, Betriebe, Prüfer:innen und Termine **gleichzeitig** DB-seitig
(Trigramm, tippfehlertolerant), gruppierte Trefferliste mit Markierung. Treffer
verlinken direkt — Prüflinge in ihre Akte, Termine in die Planung, Kontakte mit
`tel:`/`mailto:`. Smoke-getestet (inkl. Mobile 390px).

### Prüflings-Akte — Termin-Zuteilung direkt ✅
In der Akte lässt sich der Prüfling jetzt direkt einem passenden Termin
(gleiche Fachrichtung) zuteilen oder die Zuteilung entfernen — mit
Konfliktwarnung bei Doppelbelegung am selben Tag. Korrekturen ohne Umweg über
die Planung. `store.prueflingAkte` liefert passende Termine + Zuteilungs-IDs.
Smoke-getestet (inkl. Mobile).

### Prüflings-Akte (verbindende Klammer) ✅
Eigene Detailansicht je Prüfling (`#/pruefling/<id>`, „📋"-Symbol in der Liste):
bündelt Stammdaten, zugeteilten Prüfungstag (Datum/Uhrzeit-Slot, Ort, Ausschuss),
Bewertung (Schnitte/Gesamtnote/Ergebnis) und den abgeleiteten Fortschritt an
einem Ort. Direkt-Aktionen: Bewerten (Noten-Dialog), Einladung/Zeugnis drucken,
Stammdaten bearbeiten — eine Ansicht bedient Planung, Noten und Zeugnis.
Smoke-getestet (inkl. Mobile 390px).
✅ **Status-Schnellaktionen**: kontextabhängige Knöpfe in der Akte — „Zulassen"
(bei Angemeldeten), „Zurückziehen" und „Reaktivieren" — setzen den Status
direkt, was Fortschritt-Funnel, Filter und „Was ist zu tun?" sofort
nachziehen. `store.setzeStatus()`. Chromium-getestet (alle Übergänge, Mobile).
✅ **Termin-Deep-Links in die Planung**: `#/planung?termin=<id>` wählt den
Termin direkt vor; die Auslastungstabelle (Auswertungen, inkl. „0 Ausschuss")
und die Termin-Karten der Akte verlinken dorthin — ein Klick statt Suchen im
Dropdown. Chromium-getestet (Vorauswahl, Klick-Navigation, Akte-Link, Mobile).

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

### M3e — Tagesablauf-Phasen (GaLaBau) ✅
Der druckbare Tagesablauf zeigt für GaLaBau-Termine zusätzlich den festen
Ablauf des handlungsorientierten Prüfungstags (Gewerk 4,5 Std., Fachgespräch
10 Min., Mittagspause, Pflanzenbestimmung 20 Pfl./20 Min., Zeugnisübergabe) —
Grundlage: offizielle RPF-Präsentation. Andere Fachrichtungen ohne diese
Phasen. Smoke-getestet.

### M3d — Ergebnis-Niederschrift je Termin ✅
„Ergebnis-Niederschrift" in der Planung: druckbares Protokoll je Prüfungstag,
das Planung und Noten verbindet — alle zugeteilten Prüflinge in Slot-Reihenfolge
mit Praxis-/Kenntnis-Schnitt, Gesamtnote und Ergebnis, dazu Kennzahlen
(bewertet/bestanden), Ausschuss mit Unterschriftenspalte und Ort/Datum.
`store.terminErgebnisse(id)`. Smoke-getestet (inkl. Mobile).

### M4 — Prüfer-Organisation
Ausschuss-Zusammenstellung (Vorsitz/Beisitz/Lehrkraft), ausgewogene Zuteilung,
Einladungs-/Bestätigungsstatus ✅ (Prüfer-Plan).
- ✅ **Konfliktfreie Ausschuss-Besetzung**: die Auto-Planung vermeidet aktiv
  Doppelbelegungen am selben Prüfungstag (datums-bewusst, mit Auffüllung statt
  leerem Ausschuss); verbleibende Doppelbelegungen werden in den Auswertungen
  als „Prüfer-Doppelbelegungen" aufgelistet (`prueferKonflikte`). Smoke-getestet.
- ✅ **Prüfer-Abwesenheiten**: je Prüfer:in einzelne Tage hinterlegen (📅-Dialog
  in der Prüfer-Liste); die automatische Ausschuss-Besetzung schließt Abwesende
  an dem Tag konsequent aus (in beiden Besetzungs-Durchgängen). In der
  Datensicherung enthalten. Smoke-getestet (kein Verstoß nach Neuplanung).
- ✅ **Abwesenheits-Konflikte sichtbar**: Warnung bei manueller Prüfer-Zuteilung
  an einem Abwesenheitstag; verbleibende Verstöße erscheinen als Hinweis in
  „Was ist zu tun?" (`prueferAbwesenheitsKonflikte`, `istAbwesend`). Smoke-getestet.
- ✅ **Prüfer-Einladung drucken**: je Termin eine persönliche, druckbare
  Einladung pro Ausschussmitglied (Rolle, Datum, Ort, Prüflingszahl, Bitte um
  Zu-/Absage) — eine Seite je Mitglied, ergänzt die `mailto`-Anfrage für
  Mitglieder ohne E-Mail. Chromium-getestet (Seitenzahl = Mitglieder, Mobile).

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
- ✅ **Mündliche Ergänzungsprüfung**: im Bewerten-Dialog optional ein
  Kenntnisbereich wählbar + mündliche Note; die Bereichsnote wird zu
  TRUNC((2·schriftlich + 1·mündlich)/3, 1) gewichtet und fließt so in
  Kenntnis-Schnitt, Gesamtnote und Bestehen ein (Live-Vorschau weist die
  Ergänzung aus). Die schriftlichen Bereichsnoten k1..k4 bleiben dokumentiert;
  Bereich + Note werden gespeichert, beim Wiederöffnen vorbefüllt und sind in
  der Datensicherung enthalten. Über die Zulassung entscheidet der
  Prüfungsausschuss (keine Automatik). `store.ergaenzteKenntnis()`, unit- und
  Chromium-getestet (Kenntnis 4,2 → 4,0; Persistenz; Mobile 390px).
- ✅ **Noten je Prüfungstag erfassen**: die Notenliste lässt sich nach
  Prüfungstermin filtern — dann erscheinen nur dessen zugeteilte Prüflinge in
  Uhrzeit-/Slot-Reihenfolge mit Uhrzeit-Spalte und Zähler „X von Y bewertet".
  Bewerten aus der gefilterten Ansicht behält den Termin. So arbeitet der
  Ausschuss am Prüfungstag genau seine Liste ab (Planung ↔ Noten).
  `bewertungenListe(pruefungId)`, SQL- und Chromium-getestet (155 → 12,
  Slot-Reihenfolge, Filter bleibt nach Speichern, Mobile 390px).
- ✅ **Zeugnis spiegelt die Ergänzung**: hatte ein Kenntnisbereich eine
  mündliche Ergänzungsprüfung, zeigt das Zeugnis die gewichtete (effektive)
  Bereichsnote mit Fußnote „* nach mündlicher Ergänzungsprüfung" — passend zum
  ausgewiesenen Kenntnis-Schnitt (keine widersprüchliche Bereichsnote mehr).
  Chromium-getestet (roh 5,0 → effektiv 4,0 im Zeugnis, Fußnote, Mobile 390px).
- Offen: „eine einzige 6 → durchgefallen" explizit, weitere Fachrichtungen.

### M7 — Excel-/CSV-Import (teils ✅)
- ✅ **CSV-Import von Prüflingen**: offline-Parser (Trennzeichen-Erkennung ; / ,,
  Anführungszeichen, Umlaute), automatische Spaltenzuordnung (überschreibbar),
  Vorschau und Dublettenschutz (Nach-/Vorname). Button in der Prüflingsliste.
  Smoke-getestet (inkl. quoted Feld mit Komma, Dublette, leere Zeile).
- ✅ **CSV-Import für alle Stammdaten**: der Import ist jetzt modellgetrieben und
  für Prüflinge, Betriebe, Prüfer:innen und Termine verfügbar („CSV importieren"
  in jeder Stammdaten-Liste). Felder + automatische Spaltenzuordnung entstehen
  aus dem Entitätsmodell (mit Synonymtabelle), Dublettenschutz über die
  `dublette`-Felder der Entität. Generische `store.datensaetzeImportieren(key,…)`.
  Chromium-getestet (Betriebe + Prüfer, Auto-Mapping, Komma-/Semikolon-CSV,
  Dubletten-Re-Import, Mobile 390px).
- Offen: SheetJS lokal vendoren für `.xlsx/.xlsm`-Sammelbögen (Punktedaten).

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

### Nächste Prüfungstage — Terminvorschau ✅
Die Übersicht zeigt die nächsten (heute oder später liegenden) Prüfungstage
chronologisch (max. 5): Datum mit Wochentag, Bezeichnung, Fachrichtung,
Prüflingszahl und Warnung „kein Ausschuss"; jeder Eintrag öffnet den Termin
direkt in der Planung (`#/planung?termin=…`). Aus `auslastung()` abgeleitet,
keine neue Eingabe. Chromium-getestet (Auswahl, Verlinkung, Mobile 390px).

### „Was ist zu tun?" — Aufgaben-Panel ✅
Übersicht erkennt automatisch Handlungsbedarf über alle Stationen und verlinkt
dorthin: belegte Termine ohne Ausschuss, Prüfer-Doppelbelegungen, offene/
angefragte Zusagen, eingeplante aber unbewertete Prüflinge, Termine ohne
Prüflinge. Nur Punkte mit Bedarf werden gezeigt; sonst „Alles erledigt".
`store.hinweise()`. Smoke-getestet (inkl. Leerzustand, Mobile).
✅ **Fortschritt-Funnel klickbar**: unter dem Diagramm öffnet je Phase ein Chip
(„Eingeplant (152)" …) die Prüflingsliste **gefiltert nach dieser Phase**
(Deep-Link `#/prueflinge?phase=…`). Die Prüflingsliste hat zudem einen
eigenen Fortschritt-Filter (mit Such-/Sortier-/Export-Zusammenspiel). Verbindet
Übersicht und Stammdaten. Chromium-getestet (Deep-Link, Teilmenge, Mobile).
✅ **Sammel-Zulassung**: ist die Prüflingsliste nach „Angemeldet" gefiltert,
erscheint „Angezeigte zulassen (N)" — setzt den Status aller angezeigten
Prüflinge in einem Schritt auf „zugelassen" (Zurückgezogene bleiben
unangetastet). So wandert die Zulassung mit einem Klick durch den Funnel.
`store.setzeStatusViele()`. Chromium-getestet (35 → 0 angemeldet per Klick).
✅ **Datenqualität sichtbar**: Prüflinge ohne Fachrichtung (die sich nicht
automatisch einplanen lassen) erscheinen als Hinweis und verlinken in die
Stammdaten; die automatische Planung meldet zusätzlich, wie viele Prüflinge
deshalb übersprungen wurden (`planungAutomatisch().uebersprungen`, kein stilles
Übergehen). Chromium-getestet.

### M10 — Auswertungen & Dashboard ✅
Neue Ansicht „Auswertungen": Kennzahlen (belegte Termine, Ø Prüflinge/Termin,
Bestehensquote gesamt), **Bestehensquote je Fachrichtung** (CI-konformes
Balkendiagramm + Tabelle mit Ø Note) und **Auslastung je Prüfungstermin**
(Prüflinge/Ausschuss, Warnung bei Terminen ohne Ausschuss). Alles abgeleitet,
keine neue Eingabe. Smoke-getestet (inkl. Mobile 390px).
✅ **CSV-Export**: „Quoten als CSV" und „Auslastung als CSV" (Semikolon + BOM
für Excel, deutsche Dezimalkommas) — für Berichte/Weiterverarbeitung. Smoke-getestet.
✅ **Prüfungsjahr-Filter**: Auswertungen lassen sich auf ein Prüfungsjahr
einschränken (Quoten nach `pruefungsjahr`, Auslastung nach Termin-Jahr); CSV
trägt das Jahr im Dateinamen. Smoke-getestet.
✅ **Auslastungs-Diagramm**: Balkendiagramm „Prüflinge je Prüfungstermin"
(CI-konform, stärkste Auslastung gelb hervorgehoben) über der Auslastungs-
tabelle — über/unterbelegte Tage auf einen Blick, folgt dem Prüfungsjahr-Filter.
Chromium-getestet (Balken, Hervorhebung, Mobile 390px).
✅ **Prüfer-Einsätze**: neue Sektion mit Diagramm + Tabelle (Einsätze, Tage,
zugesagt/offen je Prüfer:in) für eine faire Lastverteilung — aus der Planung
abgeleitet, mit Prüfungsjahr-Filter und CSV-Export (`prueferEinsaetze`).
Chromium-getestet (31 Prüfer:innen, Diagramm, CSV, Mobile 390px).
✅ **Druckbarer Auswertungsbericht**: ein Knopf „Bericht drucken" fasst
Kennzahlen, Bestehensquoten je Fachrichtung, Auslastung je Termin und
Prüfer-Einsätze in einem druckbaren Dokument zusammen (folgt dem
Prüfungsjahr-Filter) — für Dokumentation/Jahresbericht. Chromium-getestet
(alle Abschnitte, Jahr im Titel, Mobile 390px).
Offen: Stichtagsauswertung.

### M11 — Barrierefreiheit & Feinschliff
WCAG-AA-Audit, Tastatur-/Screenreader-Durchgang, Leer-/Fehlerzustände,
Hilfetexte, Tastenkürzel, Dark-Mode-Prüfung der Tokens.
- ✅ **Tastenkürzel „/"**: springt überall zur Suche — auf Listenseiten
  fokussiert es das vorhandene Suchfeld, sonst öffnet es die Schnellsuche und
  fokussiert sie. Greift nicht beim Tippen in Feldern, bei offenem Dialog oder
  mit Modifikatortasten; Hinweis im Such-Header (`title`) und auf der
  Schnellsuche-Seite. Chromium-getestet (alle Fälle, Mobile 390px).

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
- ✅ **Prüflings-Einladungen**: druckbares Einladungsschreiben je Prüfling mit
  persönlichem Prüfungstermin (Datum/Uhrzeit-Slot/Ort/Raum aus der Planung) und
  Standard-Mitbringliste — einzeln aus der Akte oder als **Serien-Druck** aller
  zugeteilten Prüflinge (je Seite) in der Planung (`einladungsListe`).
  SQL-getestet (PGlite).
- ✅ **Leere Bewertungsbögen**: je Prüfungstag ein druckbarer Sammelbewertungs-
  bogen je zugeteiltem Prüfling (5 Praxis- + 4 Kenntnisbereiche, Notenspalte
  leer, Name/Betrieb/Slot vorbefüllt, Unterschriftenzeile) zum handschriftlichen
  Ausfüllen am Prüfungstag — die ausgefüllten Werte werden später unter „Noten"
  erfasst. Knopf in der Planung je Termin. Chromium-Smoke (12 Seiten, Mobile
  390px ohne Overflow, Galabau-Mathe).
- ✅ **Prüfungstag-Mappe (Sammeldruck)**: ein Knopf erzeugt die komplette
  Durchführungs-Mappe in einem Druck — Tagesablauf, je Prüfling ein leerer
  Bewertungsbogen und die Ergebnis-Niederschrift (je Abschnitt eine Seite). Eine
  Aktion bedient die ganze Durchführung; die Einzeldrucke bleiben für den
  granularen Bedarf erhalten. Druck-Bausteine zu `…Html()`-Funktionen
  zusammengeführt (keine Duplikation). Chromium-Smoke (14 Seiten, Einzeldrucke
  weiterhin getrennt, Mobile 390px, Galabau-Mathe).
- ✅ **Aufgeräumte Planungs-Toolbar**: die Mappe bleibt der sichtbare
  Hauptknopf; Tagesablauf, Bewertungsbögen, Niederschrift und ICS-Export
  liegen in einer aufklappbaren Gruppe „Einzeldokumente & Export" (natives
  `<details>`, barrierefrei, `.bw-disclosure`). Reduziert die Knopf-Flut ohne
  Funktionsverlust. Chromium-getestet (Auf-/Zuklappen, alle Drucke, Mobile 390px).
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
