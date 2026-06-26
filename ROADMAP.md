# ROADMAP — Milestones

**Grobe Vorlage.** Der folgende Milestone-Schnitt ist nur ein Beispiel — pro
Tool anpassen, kürzen oder erweitern. `@claude` arbeitet die Milestones
**einzeln, nacheinander** ab (siehe `AGENTS.md`). Jeder Milestone endet lauffähig
und hat eine Definition of Done.

> Tool-Zweck (1–2 Sätze): Werkzeug-Suite zur Unterstützung der Ausbildungsberatung
> am RP Freiburg (grüne Berufe / Hauswirtschaft) — Verwaltung von
> Ausbildungsbetrieben, Ausbildern und Ausbildungsverhältnissen. _Genauer
> Funktionsumfang noch mit dem Fachbereich abzustimmen._
> Zielgruppe / Ablageort der Daten: Ausbildungsberatung RP Freiburg; Daten lokal
> (OPFS), produktiv mit Personenbezug nur über BITBW/LVN. _Zu bestätigen._

---

## M0 — Gerüst
**Ziel:** Template steht, Theme und Logo eingebunden, leeres Tool startet.
**Done:** `index.html` öffnet ohne Konsolenfehler; Header mit RPF-Logo; CI-treu.

## M1 — Datenmodell + Persistenz
**Ziel:** PGlite-Schema anlegen, in OPFS persistieren, beim Laden wiederherstellen.
**Done:** Datensatz anlegen/lesen/löschen; Reload behält Daten.

## M2 — Kernfunktion
**Ziel:** Erfassen und Anzeigen der Hauptentität in der CI-Tabelle.
**Done:** Vollständiger Erfassen→Anzeigen-Fluss bedienbar per Tastatur.

## M3 — Import / Export
**Ziel:** CSV/Excel-Import, Export im benötigten Zielformat (z. B. SAP/HÜL).
**Done:** Beispieldatei rein und raus, Rundlauf ohne Datenverlust.

## M4 — Suche / Filter / Auswertung
**Ziel:** Filterzeile, Suche, einfache Kennzahlen.
**Done:** Filter kombinierbar; Ergebnis korrekt; barrierefrei.

## M5 — Barrierefreiheit & Feinschliff
**Ziel:** Kontraste, Fokus, ARIA, Leerzustände, Fehlermeldungen.
**Done:** WCAG AA erfüllt; sinnvolle Leer-/Fehlertexte.

## M6 — Single-File-Build
**Ziel:** Auslieferbare Einzeldatei für Zero-Trust-Arbeitsrechner.
**Done:** `python tools/build_singlefile.py` erzeugt `dist/index.html`,
offline lauffähig, keine externen Requests.
