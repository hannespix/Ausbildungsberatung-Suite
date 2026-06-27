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

## Infrastruktur
- ✅ **Zugangsschutz + Benutzerverwaltung (leicht)**: Beim Start ist das Tool
  **gesperrt** — ohne Anmeldung ist nichts erreichbar (Route-Guard, leere
  Navigation). Rollen **Admin** und **Benutzer:in**; vorbelegter Admin-Zugang
  `admin` / `azubi2027` beim ersten Start. Admins verwalten unter „Benutzer"
  Zugänge (anlegen, Passwort setzen, löschen — letzter Admin geschützt). Sitzung
  gilt pro Browser-Tab (`sessionStorage`). Passwörter werden **gesalzen + iteriert
  gehasht** gespeichert (eigene Offline-SHA-256 in `assets/js/auth.js`, ohne
  `crypto.subtle`, damit es auch per Doppelklick/`file://` läuft), nie im Klartext.
  Neue Tabelle `benutzer`; Store-Funktionen `login`/`benutzerSeed`/
  `benutzerAnlegen`/`passwortSetzen`/`benutzerLoeschen`. **Ehrliche Einordnung:**
  nur eine leichte Zugangshürde für ein lokales Offline-Werkzeug, kein
  vollwertiger Schutz gegen direkten Geräte-/Dateizugriff. 10 Auth-Unit-Tests
  (SHA-256-Testvektoren), in der CI. Chromium-getestet (Gate, falsches Passwort,
  Admin-Login, Reload-Session, User anlegen, Rollen-Schutz, Mobile 390px).
- ✅ **Impressum / Datenschutz / Barrierefreiheit**: rechtliche Seiten als eigene
  Routen, im Footer verlinkt. Datenschutz beschreibt die Offline-Verarbeitung
  (nur lokal, keine Übertragung, kein Tracking; Echtdaten nur über BITBW/LVN);
  Impressum mit RP-Freiburg-Angaben (von der Dienststelle final zu prüfen);
  Barrierefreiheits-Erklärung (WCAG 2.1 AA). Chromium-getestet (erreichbar nach
  Login, Offline-Hinweis vorhanden).
- ✅ **GitHub-Pages-Deployment**: Workflow `.github/workflows/deploy-pages.yml`
  veröffentlicht das Tool nach jedem Update auf `main` (und manuell per „Run
  workflow") auf eine GitHub Page zum Testen im Browser. Prüft vorher die
  Offline-Fähigkeit (`check_offline.py`) und deployt nur die Laufzeitdateien
  (relative Pfade → läuft unter dem Pages-Unterpfad; Persistenz über IndexedDB,
  daher ohne COOP/COEP-Header). Hinweis: Schriften (Luzi Type) und RPF-Logo sind
  lizenzpflichtig — bei öffentlichem Repo/Page ggf. über `.gitignore` ausschließen.

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
- ✅ **Prüfungstag-Spalte in der Prüflingsliste**: neben Fortschritt zeigt die
  Liste den zugeteilten Prüfungstag (frühester, Datum · Uhrzeit-Slot) als
  abgeleitete Spalte — ohne Akte-Umweg sichtbar, wer wann dran ist; „—" ohne
  Zuteilung. Im CSV-Export und Druck enthalten. Verknüpft Planung und
  Stammdaten (`prueflingTermin()`). Chromium-getestet (zugeteilt „16.07.2026 ·
  08:20" vs. „—", Spaltenkopf, Mobile 390px).
- Offen: Berufe-Lookup, Inline-Bearbeitung.

### Suche & Adressliste mit Akten verknüpft ✅
Die globale Schnellsuche und die Adress-/Telefonliste verlinken Betriebe und
Prüfer:innen jetzt direkt zu ihrer **Akte** (`#/betrieb/<id>`, `#/pruefer/<id>`),
Termine zur **Planung** (`#/planung?termin=<id>`) — ein Treffer führt mit einem
Klick zur passenden Detailansicht. `kontakteSuche` liefert dafür die `id` mit.
Chromium-getestet (Verlinkung beider Stellen, Klick öffnet Akte, CSV ok, Mobile).

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
✅ **Bemerkungen in der Akte sichtbar**: die Freitext-Bemerkung zum Prüfling
(Stammdaten) und die Bemerkung des Ausschusses zur Bewertung wurden bisher
erfasst, aber nirgends angezeigt — jetzt erscheinen sie in der Prüflings-Akte
(nur wenn gefüllt). „Alles an einem Ort", ohne Bearbeiten-Dialog. Chromium-
getestet (beide Bemerkungen sichtbar; ohne Bemerkung keine leeren Zeilen; Mobile).
✅ **Einzel-Bereichsnoten in der Akte**: die Bewertungs-Sektion zeigt unter
„Einzelnoten anzeigen" (aufklappbar) alle 9 Bereiche (Praxis I–V + 4 Kenntnis)
mit ihren Noten — inkl. mündlicher Ergänzung (effektive Note + Fußnote „*"),
identisch zum Zeugnis. Alles zur Bewertung an einem Ort, ohne Zeugnis-Druck.
Chromium-getestet (9 Zeilen, k1 effektiv 4,0 mit „*", Fußnote, Mobile 390px).
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

### Termine-Liste mit Belegung ✅
Die Termine-Stammdatenliste zeigt jetzt abgeleitete Spalten **Prüflinge** und
**Ausschuss** je Termin (aus `auslastung()`) sowie ein 📅-Symbol, das den Termin
direkt in der Planung öffnet — so sieht man bei der Saisonverwaltung auf einen
Blick, welche Tage leer/voll bzw. ohne Ausschuss sind (Ausschuss 0 rot). In
CSV-Export und Druck enthalten. Chromium-getestet (Spalten, Voll=2/Leer=0,
Planung-Link, Mobile 390px).

### Termin direkt aus der Planung bearbeiten ✅
In der Planung lassen sich Termindetails (Datum, Ort, Raum, Uhrzeit, …) jetzt per
„Termin bearbeiten" direkt im Cockpit ändern — ohne Umweg über die Termine-
Stammdatenliste; danach wird derselbe Termin neu geladen. Dabei einen latenten
Fehler behoben: beim Bearbeiten wurde der gespeicherte Datumswert (ISO-Zeitstempel)
nicht ins `<input type="date">` übernommen, sodass das Pflichtfeld „Datum"
fälschlich leer war (betraf jedes Datumsfeld, auch das Geburtsdatum). `feldHtml`
normalisiert Datumswerte jetzt auf `YYYY-MM-DD`. Chromium-getestet (Ort/Raum
ändern → gespeichert, Header aktualisiert; Mobile 390px).

### M3b — Ausschuss-Zuteilung ✅
In der Planung zusätzlich **Prüfer:innen** einem Termin zuteilen (mit Rolle:
Vorsitz/Beisitz/Lehrkraft), Liste mit Entfernen; abhängige Zuteilungen werden
beim Löschen aufgeräumt. Smoke-getestet (Chromium).
- ✅ **Prüfungstag-Status**: je gewähltem Termin eine kompakte Readiness-Zeile
  (Ausschuss x/3, Zusagen zugesagt/offen, Uhrzeiten vergeben x/n, Bewertet x/n)
  mit Ampel-Punkt je Kriterium — bündelt Signale aus Planung, Zusagen und Noten
  auf einen Blick („ist der Tag fertig vorbereitet?"). Chromium-getestet
  (Counts, Aktualisierung nach Bewertung, Mobile 390px).

### M3c — Druckbarer Tagesablauf ✅
„Tagesablauf drucken" je Termin: CI-konforme Druckvorlage (`@media print`,
tintensparend) mit Kopf, Prüflingen inkl. Slots und Ausschuss; über den
Druckdialog auch als PDF. Smoke-getestet (Chromium, `window.print` gestubbt).
- ✅ **Anwesenheitsliste**: druckbare Teilnehmerliste je Prüfungstag (Uhrzeit,
  Name, Betrieb, Unterschriftenspalte) zum Abzeichnen am Prüfungstag — in der
  Planung unter „Einzeldokumente". Chromium-getestet (Druck, Unterschriftenspalte,
  Mobile 390px).

### M3e — Tagesablauf-Phasen (GaLaBau) ✅
Der druckbare Tagesablauf zeigt für GaLaBau-Termine zusätzlich den festen
Ablauf des handlungsorientierten Prüfungstags (Gewerk 4,5 Std., Fachgespräch
10 Min., Mittagspause, Pflanzenbestimmung 20 Pfl./20 Min., Zeugnisübergabe) —
Grundlage: offizielle RPF-Präsentation. Andere Fachrichtungen ohne diese
Phasen. Smoke-getestet.

### M3f — Stationen-Rotations-Ablaufplan (optimiert) ✅
Der praktische Prüfungstag wird stationsbasiert geplant statt im 20-Min-Raster:
**jede Aufgabe ist eine Station, jeder Prüfling durchläuft jede Station genau
einmal.** Station je 60 Min (50 Prüfung + 10 Bewertung); **Pflanzenerkennung**
als eigene 20-Min-Station in Eigenregie des RP (ohne Ausschuss-Prüfer).
- **Optimierung:** Karussell-Rotation als lateinisches Quadrat — bei m Stationen
  bilden je m Prüflinge eine Gruppe; in Runde r steht Position i an Station
  (i+r) mod m. Dadurch ist jede Station jede Runde mit genau einem Prüfling
  belegt und **niemand wartet** (0 Min Leerlauf). Die nötige Prüferzahl ist die
  Summe des Prüferbedarfs der betreuten Stationen (eine Aufstellung genügt für
  alle nacheinander laufenden Gruppen) — das **Minimum**.
- Reine, DB-/DOM-freie Logik in `assets/js/ablauf.js` (`rotationsplan`,
  `normalisiereStationen`, `prueferProRunde`, `minZuZeit`), mit 50 Node-Unit-
  Tests (`tools/test_ablauf.mjs`, in der CI).
- Im **Prüfungstag-Cockpit**: Kennzahlen (Stationen, Gruppen, gleichzeitige
  Prüfer:innen, Tagesdauer, 0 Min Wartezeit), Stationsraster (Zeile = Uhrzeit,
  Spalte = Station), **Laufzettel je Prüfling drucken** („wann bin ich wo?") und
  **Stationsplan drucken** (alle Gruppen). Vorlage: die fünf praktischen
  GaLaBau-Prüfungsbereiche + Pflanzenerkennung. Chromium-getestet (Raster 6
  Stationen/6 Runden, 8 Prüflinge → 2 Gruppen, 5 Prüfer:innen, Laufzettel mit
  Prüf-/Bewertungsfenster, Mobile 390px, Galabau-Mathe).
- ✅ **Stationen je Termin bearbeitbar & persistent**: im Cockpit unter
  „Stationen bearbeiten" lassen sich Stationen anlegen/entfernen und Name, Dauer,
  Prüferbedarf (0–3) und RP-Eigenregie setzen; „Standard-Stationen einsetzen"
  füllt die GaLaBau-Vorlage. Gespeichert je Prüfungstag (neue Tabelle
  `stationen`, `store.stationenFuer`/`stationenSetzen`, beim Löschen des Termins
  mit aufgeräumt). Der Ablaufplan, die Prüferzahl, Laufzettel und Stationsplan
  rechnen sofort mit den gespeicherten Stationen; ohne gespeicherte Stationen
  greift die Standardvorlage. Eigenregie-Stationen zählen 0 Prüfer:innen.
  Chromium-getestet (Bedarf 3 speichern → 7 Prüfer:innen, Persistenz,
  Eigenregie-Toggle deaktiviert den Bedarf, Mobile 390px, Galabau-Mathe).
- ✅ **Ablaufplan als verbindlicher Takt („unter einen Hut")**: ein Klick
  „Ablaufplan übernehmen" im Cockpit schreibt **Startzeit (slot) und
  Reihenfolge** aus der Stationen-Rotation auf alle Prüflinge (sichert die
  Stationen vorher, falls noch Standardvorlage). Damit gibt es **ein einziges
  Zeitmodell** statt des alten, verworfenen 20-Minuten-Rasters: Anwesenheits-
  liste, Noten-Reihenfolge, Ergebnis-Niederschrift und Zeugnisreihenfolge folgen
  exakt dem Ablaufplan, und die Readiness-Zeile „Uhrzeiten x/n" wird grün. Ein
  „übernommen"-Marker zeigt, dass der gespeicherte Stand dem aktuellen Plan
  entspricht. `store.ablaufZeitenUebernehmen`. Chromium-getestet (8 Prüflinge →
  Gruppe 1 = 08:00 ×6, Gruppe 2 = 14:00 ×2, Reihenfolge 1–8, Niederschrift &
  Anwesenheit folgen dem Takt, Readiness 8/8, Mobile 390px, Galabau-Mathe).
- ✅ **Prüfer:innen namentlich an Stationen**: im Cockpit unter „Prüfer:innen an
  Stationen verteilen" werden den betreuten Stationen konkrete Ausschuss-
  mitglieder per Auswahlkästchen zugeordnet (Eigenregie-Stationen brauchen
  keine). Die Namen erscheinen im **Stationsraster, Stationsplan und auf den
  Laufzetteln** (statt nur „2 Prüfer:innen") — so weiß jede:r genau, an welcher
  Station er/sie steht. Gespeichert je Station (neue Spalte `pruefer_ids`,
  durch `stationenFuer`/`stationenSetzen` und die Engine `normalisiereStationen`
  durchgereicht). Chromium-getestet (Zuordnung speichern → Name im Raster &
  Stationsplan, Persistenz über `stationenFuer`, Mobile 390px, Galabau-Mathe).
- ✅ **Prüfungstag-Assistent (ein Knopf)**: „Tag automatisch organisieren" im
  Cockpit erledigt den ganzen Tag in einem Schritt — Stationen sichern (Standard-
  vorlage, falls noch keine), den nicht abgesagten Ausschuss auf die betreuten
  Stationen verteilen (bestehende Zuordnungen bleiben, Restbedarf wird aufgefüllt,
  Eigenregie bleibt frei) und den Ablaufplan übernehmen (Startzeit & Reihenfolge
  auf alle Prüflinge). Rückmeldung fasst zusammen, wie viele Stationsplätze
  besetzt sind (offene werden benannt) und wie viele Prüflinge getaktet wurden.
  Reine, testbare Verteil-Logik `ablauf.js → prueferVerteilen` (62 Unit-Tests).
  Chromium-getestet (1 Klick: 6 Stationen, 3 Ausschuss → 3/5 besetzt + 2 offen
  gemeldet, Eigenregie frei, 8/8 getaktet, Mobile 390px, Galabau-Mathe).
- ✅ **Automatische Planung folgt dem Ablaufplan-Takt** (kein 20-Min-Raster
  mehr): die globale „Automatische Prüfungsplanung" und das manuelle „Ablaufplan
  übernehmen" in der Planung nutzen jetzt dasselbe Zeitmodell wie das Cockpit.
  Je Termin werden die Standard-Stationen angelegt, der Ausschuss namentlich auf
  die Stationen verteilt und Startzeit + Reihenfolge je Prüfling aus der
  Karussell-Rotation geschrieben (Gruppenstart, keine 20-Minuten-Slots). Die
  Stationsvorlage liegt jetzt zentral in `model.js`
  (`STANDARD_STATIONEN_GALABAU`), genutzt von Cockpit und Planung. Neue
  Store-Funktion `ablaufplanTakten`; das alte `zeitrasterVergeben`/20-Min-Raster
  ist entfernt. Chromium-getestet (Auto-Plan: 10 Prüflinge → 6×08:00 + 4×14:00,
  keine :20/:40-Slots, 6 Stationen, Ausschuss verteilt, Eigenregie frei,
  eindeutige Reihenfolge, Mobile 390px, Galabau-Mathe).
- ✅ **Mehrtages-Verteilung überspringt Wochenenden & Feiertage (BW)**: legt die
  automatische Planung Folgetermine an, liegen diese nur noch auf **Werktagen
  (Mo–Fr)** und **nicht auf gesetzlichen Feiertagen in Baden-Württemberg** — die
  nächsten freien Werktage nach dem letzten vorhandenen Termin. Reine, getestete
  Funktionen `ablauf.js → werktageNach`, `osterSonntagISO` (Gauß/Meeus) und
  `feiertageBW` (feste + bewegliche inkl. Heilige Drei Könige, Fronleichnam,
  Allerheiligen); 113 Unit-Tests gesamt. Chromium-getestet (Termine um Ostern
  2026 springen über Karfreitag/Wochenende/Ostermontag → 07./08./09.04.; kein
  WE/Feiertag; Mobile 390px, Galabau-Mathe).
- ✅ **Kapazität je Tag aus dem Ablaufplan**: die automatische Planung leitet die
  Prüflingszahl je Termin jetzt aus dem Ablaufplan ab — `kapazitaetProTag` rechnet
  `floor(Tageslänge / (Stationen × Rundenlänge)) × Stationen` (mind. eine Gruppe),
  basierend auf der Tageslänge des Termins (zeit_von/zeit_bis, sonst 08–16 Uhr).
  Keine feste „12"-Zahl mehr; eine manuelle Vorgabe bleibt optional möglich
  (Eingabe leer lassen = automatisch). Chromium-getestet (14 Prüflinge → automatisch
  3 Termine à ≤6 [5/5/4]; manuell 12 → 2 Termine; Mobile 390px; Galabau-Mathe).
  +5 Engine-Unit-Tests (67 gesamt).
- ✅ **Mittagspause im Ablaufplan**: optionale Pause „nach Station n, Dauer m Min"
  (im Cockpit einstellbar, global gespeichert). Die Rotation verschiebt alle
  Runden nach der Pause entsprechend; Stationsraster, Laufzettel und Stationsplan
  zeigen eine eigene „Mittagspause"-Zeile, die Kennzahlen das Pausenfenster und
  das verschobene Tagesende. Die persistierten Startzeiten (Gruppenstart) bleiben
  unberührt — die Pause ist eine reine Tagesablauf-Größe. Engine
  `rotationsplan({pauseNachRunde,pauseMin})` mit +16 Unit-Tests (83 gesamt).
  Chromium-getestet (Pause nach Station 3/45 Min → Pause 11:00–11:45, Runde 4 auf
  11:45, Pause-Zeile in Raster & Laufzettel, Persistenz, Mobile 390px,
  Galabau-Mathe).
- ✅ **Mittagspause je Termin**: die Pause wird jetzt pro Prüfungstag gespeichert
  (Schlüssel `ablauf_pause_*:<id>`, Fallback auf den früheren globalen Wert) statt
  global — verschiedene Tage können verschiedene Pausen haben. Helfer
  `pauseLaden`/`pauseSpeichern` bündeln Lesen/Schreiben für Cockpit und
  Planungs-Mappe. Chromium-getestet (Pause an Termin A → Termin B unberührt; A
  bleibt persistent; Schlüssel je Termin; Mobile 390px, Galabau).
- ✅ **Mappen-Deckblatt mit Inhaltsverzeichnis**: die Tagesmappe beginnt jetzt mit
  einem Deckblatt — Eckdaten (Datum, Ort, Fachrichtung, Zeitrahmen, Mittagspause),
  Kennzahlen (Prüflinge, Stationen/Gruppen, gleichzeitige Prüfer:innen), die
  Ausschussliste und ein Inhaltsverzeichnis der Mappe. Ersetzt die alte
  Phasentabelle als Auftakt. Chromium-getestet (erste Seite = Deckblatt mit
  Eckdaten/Ausschuss/Inhalt, Folgeseiten vorhanden, Mobile 390px, Galabau-Mathe).
- ✅ **Komplette Tagesmappe (ein Klick)**: „Prüfungstag-Mappe drucken" bündelt
  jetzt das ganze Tagespaket in Ablaufreihenfolge — Übersicht, **Stationsplan**,
  **Laufzettel je Prüfling**, **Stationskarten je Prüfer:in**, Bewertungsbögen
  und Ergebnis-Niederschrift. Die Einzeldruck-Funktionen wurden in
  HTML-Bausteine (`stationsplanHtml`/`laufzettelHtml`/`stationskartenHtml`)
  zerlegt, die Mappe und Einzeldruck gemeinsam nutzen (kein Duplikat).
  Chromium-getestet (Mappe enthält Stationsplan + Laufzettel + Stationskarten +
  Niederschrift, Mobile 390px, Galabau-Mathe).
- ✅ **Stationskarten für Prüfer:innen**: Gegenstück zum Laufzettel — je Station
  eine druckbare Karte mit der **Folge der Prüflinge** (Uhrzeit · Name · Betrieb ·
  Bewertungsspalte), den zugeordneten Prüfer:innen und dem Prüf-/Bewertungsraster.
  So weiß jede:r Prüfer:in an der Station, wer wann kommt. Reine Engine-Funktion
  `stationsBelegung(plan)` (Transponierte der Laufzettel), +16 Unit-Tests
  (99 gesamt). Chromium-getestet (6 Stationen → 6 Karten, Station 1 mit 6 Prüflingen
  in Zeitreihenfolge + Prüfername + 08:00–09:00, Mobile 390px, Galabau-Mathe).

### M3d — Ergebnis-Niederschrift je Termin ✅
„Ergebnis-Niederschrift" in der Planung: druckbares Protokoll je Prüfungstag,
das Planung und Noten verbindet — alle zugeteilten Prüflinge in Slot-Reihenfolge
mit Praxis-/Kenntnis-Schnitt, Gesamtnote und Ergebnis, dazu Kennzahlen
(bewertet/bestanden), Ausschuss mit Unterschriftenspalte und Ort/Datum.
`store.terminErgebnisse(id)`. Smoke-getestet (inkl. Mobile).
✅ **Bemerkungen des Ausschusses im Protokoll**: hat der Ausschuss zu einem
Prüfling eine Bemerkung erfasst, erscheint sie in der Niederschrift als eigener
Abschnitt „Bemerkungen des Ausschusses" (neben „Begründung Nichtbestehen") —
amtlich dokumentiert statt nur in der Akte. `terminErgebnisse` liefert dafür
`bemerkung`. Chromium-getestet (Abschnitt mit Text bei vorhandener Bemerkung,
kein leerer Abschnitt sonst, Mobile 390px).

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
- ✅ **Doppelbelegungs-Warnung beim Zuteilen**: wird ein:e Prüfer:in manuell
  einem Termin zugeteilt, obwohl die Person am selben Tag schon einem anderen
  Termin zugeordnet ist, erscheint eine bestätigbare Warnung (analog zur
  Prüfling-Konfliktwarnung) — verhindert genau die Doppelbelegungen, die die
  Auswertungen sonst nachträglich melden. `prueferTerminkonflikte()`.
  Chromium-getestet (selber Tag warnt, anderer Tag nicht; nach Bestätigen meldet
  `prueferKonflikte` die Doppelbelegung; Mobile 390px).
- ✅ **Prüfer-Einladung drucken**: je Termin eine persönliche, druckbare
  Einladung pro Ausschussmitglied (Rolle, Datum, Ort, Prüflingszahl, Bitte um
  Zu-/Absage) — eine Seite je Mitglied, ergänzt die `mailto`-Anfrage für
  Mitglieder ohne E-Mail. Chromium-getestet (Seitenzahl = Mitglieder, Mobile).
- ✅ **Druckbare Einsatzübersicht je Prüfer:in**: in den Auswertungen erzeugt
  „Einsatzübersicht drucken" ein Saison-Dokument, das **je Prüfer:in** alle
  Ausschuss-Einsätze gruppiert auflistet (Datum · Termin · Fachrichtung · Rolle ·
  Zusage), optional auf ein Prüfungsjahr gefiltert. Grundlage für
  Einsatzbestätigung und die spätere Entschädigungsabrechnung (Beträge folgen,
  sobald die Entschädigungssätze vorliegen). `store.prueferEinsatzListe(jahr)`.
  Chromium-getestet (ein Block je Prüfer:in, Tabellenkopf vollständig, Mobile
  390px, Galabau-Mathe).
- ✅ **Prüferentschädigung (frei eingebbare Sätze)**: in den Auswertungen werden
  Tagessatz und Fahrtkostenpauschale je Sitzungstag **eingetragen** (das Tool
  trifft keine Annahme über Höhe/Rechtsgrundlage) und die Entschädigung je
  Prüfer:in live berechnet: Betrag = wahrgenommene Sitzungstage × (Tagessatz +
  Fahrtpauschale); Absagen zählen nicht. Summenzeile, druckbares
  Abrechnungsblatt und CSV-Export. Sätze werden in einer neuen
  Schlüssel/Wert-`einstellungen`-Tabelle gespeichert (`getEinstellung`/
  `setEinstellung`, überlebt einen Datenreset). `store.entschaedigungVorschau`.
  Chromium-getestet (Absage ausgeschlossen, Summe 105,00 € bei 3 Tagen ×
  35 €, Satz-Persistenz, Druck, Mobile 390px, Galabau-Mathe).

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
- ✅ **Reihen-Bewertung**: in der termingefilterten Notenliste startet
  „Reihen-Bewertung (N offen)" eine Kette — nach dem Speichern öffnet sich
  automatisch der nächste noch unbewertete Prüfling, bis alle erfasst sind;
  Abbrechen stoppt jederzeit. Nutzt den vorhandenen, mobil bedienbaren
  Bewerten-Dialog (kein Raster). Chromium-getestet (Auto-Weiterschaltung,
  Abbruch, offene Zahl sinkt, Mobile 390px).
- ✅ **Noten als CSV**: Export der (ggf. termingefilterten) Notenliste mit allen
  9 Bereichsnoten, Praxis-/Kenntnis-Schnitt, Gesamtnote und Ergebnis —
  Semikolon + BOM für Excel, deutsche Dezimalkommas; bei Termin-Filter zusätzlich
  Uhrzeit-Spalte und Termin im Dateinamen. Für Archiv/Übergabe.
  Chromium-getestet (Kopf, Dezimalkomma, gefilterter Export).
- ✅ **Zeugnis spiegelt die Ergänzung**: hatte ein Kenntnisbereich eine
  mündliche Ergänzungsprüfung, zeigt das Zeugnis die gewichtete (effektive)
  Bereichsnote mit Fußnote „* nach mündlicher Ergänzungsprüfung" — passend zum
  ausgewiesenen Kenntnis-Schnitt (keine widersprüchliche Bereichsnote mehr).
  Chromium-getestet (roh 5,0 → effektiv 4,0 im Zeugnis, Fußnote, Mobile 390px).
- ✅ **Grund des Nichtbestehens sichtbar**: bei nicht bestandenen Prüflingen
  zeigt die Prüflings-Akte eine „Grund"-Zeile und die druckbare Ergebnis-
  Niederschrift einen Abschnitt „Begründung Nichtbestehen" (Sperrfach ≥ 5,5,
  Schnitt/Gesamt ≥ 4,5, ≥ 2 Bereiche ≥ 4,5) — amtlich fürs Protokoll. Der Grund
  wird aus den gespeicherten Bereichsnoten abgeleitet (inkl. mündlicher
  Ergänzung), identisch zur Live-Vorschau im Bewerten-Dialog, ohne zusätzliche
  Speicherung (`store.bewertungGruende`). Chromium-getestet (Sperrfach-Fall in
  Akte und Niederschrift, bestandener ohne Grund-Zeile, Mobile 390px).
- ✅ **Noten-Arbeitsansicht zeigt Ergebnislage**: die Notenliste nennt in der
  Kopfzeile zusätzlich „… · N bestanden" und blendet bei nicht bestandenen
  Prüflingen den **Grund** (Sperrfach, Schnitt/Gesamt ≥ 4,5, ≥ 2 Bereiche ≥ 4,5)
  direkt unter dem Ergebnis ein — so sieht der Ausschuss beim Erfassen sofort,
  wer wieso durchgefallen ist (gleiche Quelle wie Akte/Niederschrift/Mitteilung,
  `bewertungGruende`). Chromium-getestet (2 von 2 bewertet · 1 bestanden, Grund
  Sperrfach in der Zeile, gefiltert wie ungefiltert, Mobile 390px).
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
- ✅ **Noten-Import per CSV (Punktedaten)**: in der Noten-Ansicht „Noten
  importieren (CSV)" — Spalten Nach-/Vorname + 9 Bereichsnoten (Praxis I–V,
  Kenntnis 1–4, Dezimalkomma erlaubt), automatische Spaltenzuordnung mit
  Vorschau. Jeder Satz wird über den Namen einem Prüfling zugeordnet; gespeichert
  wird nur bei vollständigen 9 Noten (`store.notenImportieren`). Spart das
  Abtippen der in Excel gesammelten Punkte; speist Gesamtnote, Zeugnis,
  Auswertungen. Chromium-getestet (Treffer/ohne Treffer/unvollständig gezählt,
  Datei-Upload im Dialog setzt Bewertungen, Mobile 390px).
- ✅ **Aufgeräumte Noten-Toolbar**: die drei CSV-Aktionen (Bewertungsvorlage,
  Noten importieren, Noten als CSV) liegen jetzt in einer aufklappbaren Gruppe
  „CSV & Vorlagen" (natives `<details>`, `.bw-disclosure`) — die Reihen-Bewertung
  bleibt als Hauptaktion sichtbar. Reduziert die Knopf-Flut, besonders mobil.
  Chromium-getestet (Gruppierung, Knopf-Funktion erhalten, Mobile 390px).
- ✅ **Bewertungsvorlage (CSV) — Round-Trip**: „Bewertungsvorlage (CSV)" in der
  Noten-Ansicht exportiert alle (ggf. termingefilterten) Prüflinge mit
  vorausgefülltem Namen und leeren, **import-kompatiblen** Notenspalten (Praxis
  I–V, Kenntnis 1–4). In Excel ausfüllen → über „Noten importieren (CSV)"
  zurückspielen. Schließt den Kreis aus Export und Import.
  Chromium-getestet (Vorlage exportiert → ausgefüllt → reimportiert, beide
  Prüflinge bewertet; Mobile 390px).
- Offen: SheetJS lokal vendoren für `.xlsx/.xlsm`-Sammelbögen (Punktedaten).

### M6 — Zeugnis-Erstellung ✅
Neue Ansicht „Zeugnisse": druckbares Prüfungszeugnis je Prüfling aus Stammdaten
(Name, Geburtsdatum, Beruf, Betrieb), Prüfungstermin und Note/Ergebnis, mit
Unterschriftslinien und Datum; CI-konforme Druckvorlage, PDF über Druckdialog.
Druck nur bei vorhandener Bewertung. Smoke-getestet (Chromium).

### M6b — Zeugnis-Serie ✅
- ✅ **Serien-/Stapeldruck** aller bewerteten Zeugnisse (je Zeugnis eine Seite).
- ✅ **Prüfungstermin-Filter** auf der Zeugnisse-Seite (wie bei den Noten): die
  Liste zeigt dann die zugeteilten Prüflinge dieses Tages, der Serien-Druck
  beschränkt sich auf deren bewertete Zeugnisse („Zeugnisse dieses Termins
  drucken"). `alleZeugnisDaten(pruefungId)`. Chromium-getestet (3 von 4
  bewerteten gefiltert, je Seite, Mobile 390px).
- ✅ **Note in Worten im Zeugnis**: Praxis-Schnitt, Kenntnis-Schnitt und
  Gesamtnote tragen zusätzlich die Wortstufe (z. B. „2,4 (gut)") — amtsüblich
  auf der Urkunde. `store.wortStufe()`. Chromium-getestet (gut/sehr gut/
  ausreichend/ungenügend, alle drei Schnitte).
- ✅ **Ergebnis-Mitteilung bei Nichtbestehen**: ein Prüfungszeugnis erhält nur,
  wer bestanden hat — bei Nichtbestehen druckt dasselbe Dokument sachlich eine
  „Mitteilung über das Prüfungsergebnis" (statt eines irreführenden „Zeugnisses")
  inkl. **Grund** (aus den Bereichsnoten abgeleitet, wie Akte/Niederschrift). Der
  Knopf in der Akte heißt dann „Ergebnis-Mitteilung drucken"; die Zeugnisse-Seite
  weist darauf hin. Kein Rechtstext, nur sachliche Ergebnisdarstellung.
  Chromium-getestet (bestanden → Prüfungszeugnis; Sperrfach → Mitteilung mit
  Grund, korrekte H1; Mobile 390px).
- Offen: konfigurierbarer Zeugnistext je Beruf.

### M7 — Import / Export
**Excel/CSV-Import** (Mapping-Assistent, Vorschau, Dublettenabgleich), Export
CSV/Excel; Format für nachgelagerte Systeme (z. B. Listen, Seriendruck).

### M8 — Outlook-/Kalender-Konnektivität (offline-konform)
- ✅ **ICS-Export** der Prüfungstage (RFC 5545, lokal als `.ics`-Datei, kein
  Graph-API): in der Planung „Alle Termine als Kalender (.ics)" und je Termin
  „Termin als .ics". VEVENT mit Datum/Uhrzeit, Ort/Raum und Beschreibung
  (Fachrichtung, Prüflingszahl, Ausschuss). In Outlook importierbar. Smoke-getestet.
- ✅ **Prüfer-Einsätze als .ics**: in der Prüfer-Akte exportiert „Einsätze als
  Kalender (.ics)" alle datierten Ausschuss-Einsätze der Person (Datum/Uhrzeit,
  Ort, Fachrichtung, Rolle) als VCALENDAR — in Outlook importierbar, damit
  Prüfer:innen ihre Termine in den eigenen Kalender übernehmen. Nutzt die
  vorhandene ICS-Infrastruktur (`icsBauen`, jetzt mit „Rolle:" je Termin).
  Chromium-getestet (nur datierter Einsatz im VEVENT, SUMMARY/DTSTART/Rolle
  korrekt, Mobile 390px).
- ✅ **Prüflings-Termin als .ics**: in der Prüflings-Akte exportiert „Termin als
  Kalender (.ics)" den persönlichen Prüfungstermin als VCALENDAR — Startzeit ist
  der Uhrzeit-Slot des Prüflings (sonst der Terminbeginn), mit Ort/Raum und
  Fachrichtung. Ergänzt die gedruckte Einladung digital (Outlook-Import),
  symmetrisch zum Prüfer-ICS. Chromium-getestet (1 VEVENT, DTSTART nutzt den
  Slot 08:40, SUMMARY mit Fachrichtung, Mobile 390px).
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

### Prüfer-Akte (Prüfer:in ↔ Planung) ✅
Detailansicht je Prüfer:in (`#/pruefer/<id>`, „📋" in der Prüferliste): Kontakt
(Organisation, Funktion, klickbare Mail/Tel), alle **Ausschuss-Einsätze**
(Datum, Termin mit Direktsprung in die Planung, Rolle, Zusage-Status) und die
hinterlegten **Abwesenheiten** (direkt aus der Akte bearbeitbar, Re-Render nach
dem Schließen). `store.prueferAkte()`. Nebenbei behoben: breite Tabellen in
`.bw-flaechen` sprengten auf dem Smartphone das Raster — `min-width:0` lässt sie
jetzt im `.bw-tablewrap` horizontal scrollen. Chromium-getestet (Einsatz-
Sprung, Abwesenheit, Mobile 390px ohne Overflow).

### Prüfling ↔ Betrieb beidseitig verlinkt ✅
Die Prüflings-Akte verlinkt den Ausbildungsbetrieb (über den Namen aufgelöst)
direkt zur Betriebs-Akte; die Betriebs-Akte führt bereits zurück zu jedem
Prüfling. Lässt sich der Name keinem Betrieb zuordnen, bleibt er reiner Text.
`prueflingAkte().betriebId`. Chromium-getestet (beidseitig, Nicht-Treffer, Mobile).

### Betriebs-Akte (Betrieb ↔ Prüflinge) ✅
✅ **Notenlage je Betrieb (Beratung)**: die Betriebs-Akte zeigt zusätzlich die
Ø Gesamtnote (mit Wortstufe) und die Bestehensquote des Betriebs sowie je
Prüfling eine Gesamtnote-Spalte — so erkennt die Ausbildungsberatung auf einen
Blick, welche Betriebe schwächer abschneiden (rein abgeleitet aus `betriebAkte`,
keine neue Eingabe). Chromium-getestet (Ø 2,5, Quote 100 %, Notenspalte, Mobile
390px).
Detailansicht je Ausbildungsbetrieb (`#/betrieb/<id>`, „📋" in der Betriebs-
liste): Kontaktdaten (Anschrift, Ansprechpartner, klickbare Mail/Tel) und alle
zugeordneten Prüflinge (über das Betriebsfeld verknüpft) mit Fachrichtung,
Prüfungsjahr und abgeleitetem Fortschritt; jeder Prüfling öffnet seine eigene
Akte, dazu „X bewertet · Y bestanden". `store.betriebAkte()`. Chromium-getestet
(Verknüpfung, Prüfling-Sprung, Leerzustand, Mobile 390px).

### Nächste Prüfungstage — Bereitschafts-Board ✅
Die Übersicht zeigt die nächsten (heute oder später liegenden) Prüfungstage
chronologisch (max. 5) als **Bereitschafts-Board**: je Tag drei Ampel-Kriterien
auf einen Blick — **Ausschuss x/3**, **Zusagen** (offen/ok) und **Uhrzeiten
x/n** (Zeitraster) — grün = erledigt, ○ = offen; Tage ohne Prüflinge sind
markiert. Jeder Eintrag öffnet den Termin direkt in der Planung
(`#/planung?termin=…`). Bündelt die Readiness-Signale aus Planung, Zusagen und
Zeitraster, ohne einzeln je Termin nachzusehen (`prueftagBereitschaft()`).
Chromium-getestet (bereiter Tag = 3 grün, lückenhafter Tag „Uhrzeiten 0/2",
Verlinkung, Mobile 390px inkl. Hamburger ohne Overflow).
✅ **Prüfungstag-Fokus**: jeder Board-Eintrag verlinkt jetzt sowohl in die
**Planung** als auch direkt in die **Noten-Erfassung** des Termins; ein Termin am
heutigen Tag trägt einen „Heute"-Marker. Dafür neuer Deep-Link
`#/noten?termin=…` (termingefilterte Noten-Ansicht, z. B. vom Board am
Prüfungstag). Chromium-getestet (Heute-Marker, Planung-/Noten-Link, Deep-Link
filtert auf den Termin, Mobile 390px).

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
✅ **Prüfungsjahr-Filter**: die Prüflingsliste lässt sich (zusätzlich zu Suche
und Fortschritt) nach Prüfungsjahr filtern — für mehrere Jahrgänge im selben
Bestand. Client-seitig aus `pruefungsjahre()`, kombinierbar mit Phasen-Filter.
Chromium-getestet (4 von 155 für 2027, Kombination Jahr+Phase, Mobile 390px).
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
✅ **Datenqualität „ohne Prüfungsjahr"**: Prüflinge ohne Prüfungsjahr fehlen in
allen jahr-gefilterten Auswertungen — sie erscheinen jetzt als Hinweis in „Was
ist zu tun?" und verlinken in die Prüflingsliste, gefiltert über die neue
Filteroption „(ohne Jahr)" (Deep-Link `#/prueflinge?jahr=__ohne__`). Hinweis →
Liste → Korrektur als zusammenhängendes Paar. Chromium-getestet (Hinweis n=1,
Filter zeigt genau den ohne-Jahr-Prüfling, „Alle Jahre" wieder alle, Mobile 390px).
✅ **Überfällig-Check**: vergangene Prüfungstage (Datum < heute) mit noch
unbewerteten zugeteilten Prüflingen erscheinen als Fehler-Hinweis und
verlinken zu den Noten — zeitbewusst über `CURRENT_DATE`. Chromium-getestet
(Hinweis erscheint bei vergangenem Termin, verschwindet nach Bewertung).
✅ **Zeitraster-Check**: anstehende/undatierte Prüfungstermine mit zugeteilten
Prüflingen, aber (teilweise) fehlenden Uhrzeit-Slots erscheinen als Hinweis und
verlinken in die Planung — ohne Uhrzeiten fehlen Slots in Tagesablauf,
Einladung und Anwesenheitsliste. Vergangene Termine bleiben außen vor.
Chromium-getestet (nur der zukünftige Termin ohne Slot wird gemeldet, nicht der
mit Slot oder der vergangene; Hinweis verschwindet nach „Zeitraster erzeugen").

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
✅ **Ergebnis je Prüfungstag**: die Auslastungs-Tabelle („Auslastung & Ergebnis
je Prüfungstermin") zeigt zusätzlich **bewertet x/n** und **bestanden** je Tag —
verbindet Planung und Noten in einer Übersicht (Jahr-Filter, CSV und Bericht
enthalten). `auslastung()` um die Ergebniszahlen erweitert (kein neuer
Abschnitt, vorhandene Tabelle angereichert). Chromium-getestet (3 Prüflinge,
2 bewertet/1 bestanden → „2/3", Spalten, Bericht, Mobile 390px).
✅ **Prüfer-Einsätze**: neue Sektion mit Diagramm + Tabelle (Einsätze, Tage,
zugesagt/offen je Prüfer:in) für eine faire Lastverteilung — aus der Planung
abgeleitet, mit Prüfungsjahr-Filter und CSV-Export (`prueferEinsaetze`).
Chromium-getestet (31 Prüfer:innen, Diagramm, CSV, Mobile 390px).
✅ **Druckbarer Auswertungsbericht**: ein Knopf „Bericht drucken" fasst
Kennzahlen, Bestehensquoten je Fachrichtung, Notenspiegel, Auslastung je Termin
und Prüfer-Einsätze in einem druckbaren Dokument zusammen (folgt dem
Prüfungsjahr-Filter) — für Dokumentation/Jahresbericht. Chromium-getestet
(alle Abschnitte, Jahr im Titel, Mobile 390px).
✅ **Notenspiegel**: Verteilung der Gesamtnote nach Wortstufe (sehr gut …
ungenügend) als CI-konformes Diagramm + Tabelle mit Anzahl und Anteil — folgt
dem Prüfungsjahr-Filter, im Bericht enthalten (`notenVerteilung(jahr)`).
Chromium-getestet (6 Stufen, genau eine hervorgehoben, Anteil %, Mobile 390px).
✅ **Ø Note je Prüfungsbereich (Schwachstellen)**: Durchschnitt der 9 Bereiche
(5 Praxis I–V + 4 Kenntnis K1–K4) über alle bewerteten Prüflinge als CI-konformes
Diagramm (schwächster Bereich gelb) + Tabelle (Bereichsname, Ø Note, Anzahl) —
zeigt der Ausbildungsberatung, wo systematisch Schwächen liegen (höher =
schlechter). Folgt dem Prüfungsjahr-Filter, im Bericht enthalten
(`bereichsDurchschnitte(jahr)`). Chromium-getestet (9 Balken, genau einer
hervorgehoben = schwächster, Tabelle, Bericht, Mobile 390px).
Offen: Stichtagsauswertung.

### CD-Feinschliff: einfarbige Symbole + kein Inhalts-Rahmen ✅
Auf Nutzer-Feedback: die bunten Emoji-Symbole (Akte/Planung/Bearbeiten/Löschen,
Zusage/Absage/Zurücksetzen) sind durch **einfarbige Inline-SVG-Symbole**
(currentColor, Strichzeichnung, keine Eigenfarben) ersetzt — wirkt
professioneller und entspricht dem CD („keine freie Farbigkeit"). Zentrale
`icon()`-Funktion mit `ICON_PFADE`. Außerdem behoben: der **schwarze Rahmen um
den gesamten Inhalt** beim Start — er kam vom Fokus-Outline des
skriptfokussierten Inhalts-Containers (`#inhalt`, Skip-Link-Ziel); jetzt
`#inhalt:focus { outline:none }` (interaktive Elemente behalten ihren Fokusring).
Chromium-getestet (keine Emoji in den Listen, SVG-Icons currentColor,
#inhalt-Fokus ohne Outline, Mobile 390px).

### Navigation gruppiert (Dropdowns) ✅
Auf Nutzer-Feedback: 11 Hauptpunkte waren zu unübersichtlich. Die Navigation ist
jetzt nach dem Arbeitsablauf in **5 Hauptpunkte** gegliedert, Unterpunkte im
barrierefreien Dropdown:
- **Übersicht** (Direktlink)
- **Stammdaten** ▾ — Prüflinge · Ausbildungsbetriebe · Prüfer:innen ·
  Prüfungstermine · Adressliste
- **Planung** ▾ — Tagesplanung · Prüfer-Plan
- **Prüfungstag** ▾ — Noten · Zeugnisse
- **Auswertungen** (Direktlink)

Datengetrieben (`navGruppen()`), Dropdown-Verhalten per Delegation
(`navDropdownsBinden`): Klick öffnet/schließt, Klick außerhalb/Escape schließt,
Unterpunkt-Klick navigiert und schließt Dropdown + Hamburger; die aktive Gruppe
trägt den gelben Marker, der aktive Unterpunkt `aria-current`. Desktop als
Overlay-Dropdown, mobil als inline aufklappende Abschnitte im Hamburger
(`aria-haspopup`/`aria-expanded`/`aria-controls`, nur `--bw-*`-Tokens, keine
Schatten). Chromium-getestet (5 Hauptpunkte, Dropdown öffnet/schließt,
Navigation + aktiv-Markierung, alle 10 Routen erreichbar, Mobile 390px inline).

### Prüfungstag-Cockpit (Tag-Dashboard) ✅
Neue Seite „Tagescockpit" (`#/pruefungstag`, in der Prüfungstag-Gruppe; Deep-Link
`?termin=…`): ein Prüfungstermin gewählt → alles für den Tag an einem Ort.
- **Status-Ampel** (Ausschuss x/3, Zusagen, Uhrzeiten x/n, Bewertet x/n · bestanden).
- **Dokumente für den Tag** (Bulk-Druck, wiederverwendete Funktionen):
  Prüfungstag-Mappe, Tagesablauf, Anwesenheitsliste, Bewertungsbögen,
  Ergebnis-Niederschrift, Serien-Zeugnisse/Mitteilungen, Termin als .ics.
- **Weiter zu**: Noten erfassen, Zeugnisse, in der Planung bearbeiten
  (Deep-Links). Ausschuss-Liste mit Zusage-Status, Prüflinge-Tabelle (Slot,
  Note, Ergebnis).
Keine Logik-Duplikate — bündelt vorhandene Druck-/Status-Funktionen und
verlinkt die Stationen. Nebenbei: `#/zeugnisse?termin=…`-Deep-Link ergänzt.
Chromium-getestet (Status, Tabelle, Weiter-Links, Niederschrift-Druck,
Termin-ICS, Terminwechsel, Nav-Eintrag, Mobile 390px).

Geplant: **Prüferentschädigung** (Abrechnung je Einsatz, druckbar/CSV) — sobald
die Entschädigungssätze feststehen.

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

### Qualität — Notenlogik isoliert + Unit-Tests ✅
Der rechtlich kritische Notenkern liegt jetzt in einem eigenen, DB-freien Modul
`assets/js/galabau.js` (gesamtGalabau, ergaenzteKenntnis, noteAusPunkten,
wortStufe, bewertungGruende, pflanzenkenntnisNote, TRUNC-Schlüssel, Bestehens-/
Sperrfach-Regeln). `store.js` importiert und re-exportiert die Funktionen — die
UI bleibt unverändert (`store.gesamtGalabau` etc.). Dazu `tools/test_galabau.mjs`
(35 Prüfungen: TRUNC, Bandgrenzen, 60/40-Gewichtung, Sperrfach, 2×≥4,5,
mündliche Ergänzung, Pflanzenkenntnisse) — läuft in Node und als Schritt im
CI-Job „App-Bundle", blockiert bei Regression den Merge. Chromium-Smoke
bestätigt Re-Export und Bewertungs-Pfad.

### Laufend
Datensicherung (DB-Export/-Import als Datei), Robustheit, Tests, Performance.
