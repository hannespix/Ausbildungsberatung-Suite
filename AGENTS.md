# AGENTS.md — Agentisches Arbeiten im Loop

Diese Datei beschreibt **wie** in diesem Repository gearbeitet wird (Prozess).
Das **was** (Design, Technik, CI-Regeln) steht in `CLAUDE.md`, die **Wissensbasis**
(Architektur, Module, Datenmodell, Muster, Stolperfallen) in
`docs/ARCHITEKTUR.md`, die Aufgaben in `ROADMAP.md` und den GitHub Issues.
`@claude` und alle Beteiligten lesen vor jeder Aufgabe `CLAUDE.md`,
`AGENTS.md` **und** `docs/ARCHITEKTUR.md`.

> Sprache durchgehend Deutsch. Sicherheit und CI-Treue gehen vor Tempo.

---

## 1. Rollen

- **Mensch (Hannes / Fachbereich):** legt Ziele und Milestones fest, eröffnet
  Issues, prüft Pull Requests, merged. Trifft alle Entscheidungen mit
  Rechts-, Datenschutz- oder Fachbezug.
- **`@claude` (GitHub Action):** plant, implementiert, öffnet Pull Requests,
  reagiert auf Review-Kommentare. Arbeitet **nur** auf Branches und über PRs,
  niemals direkt auf `main`.

---

## 2. Der Loop

Ein Durchlauf bearbeitet **genau ein** Issue (eine Aufgabe / einen Milestone-Schritt):

```
   ┌────────────────────────────────────────────────────────────┐
   │ 1. AUFGABE   Issue mit klarem Ziel + Definition of Done     │
   │ 2. PLAN      @claude antwortet mit kurzem Umsetzungsplan     │
   │ 3. BUILD     Branch anlegen, umsetzen, Selbstcheck           │
   │ 4. PR        Pull Request öffnen, Bezug zum Issue            │
   │ 5. PRÜFUNG   CI-Workflow + menschliches Review               │
   │ 6. NACHBESSERN bei Änderungswünschen: @claude im PR          │
   │ 7. MERGE     Mensch merged → nächstes Issue                  │
   └────────────────────────────────────────────────────────────┘
```

**Auslösen:** `@claude` in einem Issue oder PR-Kommentar erwähnen, mit klarer
Anweisung. Beispiele:

- `@claude setze Milestone M1 aus ROADMAP.md um und öffne einen PR.`
- `@claude die Tabelle braucht eine Filterzeile pro Spalte. Bitte umsetzen.`
- `@claude warum schlägt der CI-Check fehl?` (mit aktivem `actions: read`)

---

## 3. Milestone-getriebene Iteration

Größere Tools werden in kleine, abnahmefähige Milestones zerlegt (siehe
`ROADMAP.md`, Schema **M0 … Mn**). Jeder Milestone ist:

- **klein genug** für einen PR, der in einem Sitzung-Review prüfbar ist,
- **lauffähig** am Ende (kein halber Zustand, der nichts tut),
- mit einer **Definition of Done** versehen.

`@claude` arbeitet Milestones **einzeln und nacheinander** ab — nicht mehrere
gleichzeitig, nicht vorgreifen. Nach jedem gemergten Milestone startet der
nächste Loop mit einem neuen Issue.

**Empfohlener Schnitt:**
`M0` Gerüst steht (Template, Theme, leeres Tool startet) →
`M1` Datenmodell + Persistenz (PGlite/OPFS) →
`M2` Kernfunktion (Erfassen/Anzeigen) →
`M3` Import/Export (CSV/Excel, SAP-Format etc.) →
`M4` Filter/Suche, Auswertung →
`M5` Barrierefreiheit & Feinschliff →
`M6` Single-File-Build für die Auslieferung.

---

## 4. Definition of Done (für jeden PR)

Vor „fertig" prüft `@claude` selbst und hakt im PR-Text ab:

- [ ] Erfüllt das Issue-Ziel vollständig, nichts Unfertiges zurückgelassen.
- [ ] **CI-Treue** nach `CLAUDE.md` (nur Markentokens, keine Schatten/Verläufe,
      max. 3 Flächen, Gelb nie als Text auf Weiß, hoher Weißanteil).
- [ ] **Responsiv** bis Smartphone; Navigation nutzt das Hamburger-Muster
      (`nav.js`); Touch-Targets ≥ 44px.
- [ ] **Diagramme** nach den Infografik-Regeln (Grau-Basis, Gelb nur als
      Highlight mit Outline, Kontrast ≥ 3:1, keine externen Chart-CDNs).
- [ ] Listen/Tabellen haben die **globale Fuzzy-Suche** (3.3); DB-Tools nutzen
      **PGlite** mit DB-seitiger Suche (3.4).
- [ ] **Keine hartcodierten** Farben/Schriften/Abstände — nur `--bw-*`.
- [ ] **Barrierefrei:** Kontrast ≥ 4,5:1, Tastaturbedienung, sichtbarer Fokus,
      Feldbeschriftungen, `lang="de"`.
- [ ] **Zero-Trust / offline:** keine externen Requests, keine CDNs, keine
      fremden Web-Fonts; alle Abhängigkeiten (auch React/Babel/PGlite/WASM)
      lokal vendored. `python3 tools/check_offline.py` läuft fehlerfrei durch.
- [ ] Läuft lokal (Doppelklick / einfacher Webserver) ohne Fehler in der Konsole.
- [ ] Kurzer, klarer PR-Text: Was, Warum, Wie getestet. Bezug `Closes #<Nr>`.
- [ ] Keine Geheimnisse, keine personenbezogenen Echtdaten im Repo.

---

## 5. Leitplanken (verbindlich)

**`@claude` darf:**
- Branches anlegen, Dateien ändern, PRs öffnen, auf Reviews reagieren.
- Innerhalb des Repos refactoren und Tests/Checks ergänzen.

**`@claude` darf nicht:**
- Nicht auf `main` pushen, keine PRs selbst mergen.
- Keine neuen externen Abhängigkeiten/CDNs/Tracker einführen.
- Keine Secrets, Tokens oder personenbezogenen Echtdaten committen.
- Den Scope eines Issues nicht eigenmächtig erweitern. Unklarheiten →
  **nachfragen statt raten** (Kommentar im Issue/PR), dann stoppen.
- Keine produktive Datenverarbeitung mit Personenbezug außerhalb BITBW/LVN
  konzipieren.

**Stop-Bedingungen** (Loop anhalten, Mensch einbeziehen):
- Aufgabe berührt Recht, Datenschutz oder Fachentscheidung.
- Definition of Done nicht erreichbar ohne Scope-Erweiterung.
- Wiederholt fehlschlagende CI ohne klare Ursache.

---

## 6. Selbstreview vor dem PR

`@claude` führt vor dem Öffnen des PR einen kurzen Eigen-Review durch und
notiert das Ergebnis im PR:

1. Diff gegen die Definition of Done (Abschnitt 4) prüfen.
2. CI-Checkliste aus `CLAUDE.md` durchgehen.
3. Offene Punkte/Annahmen explizit benennen, nicht verschweigen.

---

## 7. Commit- & PR-Konventionen

- Branch: `feat/<kurz>`, `fix/<kurz>`, `chore/<kurz>`.
- Commits klein und sprechend, Imperativ, Deutsch:
  `Tabelle: Spaltenfilter ergänzen`.
- PR-Titel = Ziel in einem Satz. PR-Body: Kontext, Vorgehen, Test, `Closes #<Nr>`.
- Ein PR = ein Milestone/Issue.

---

## 8. Einstieg für einen neuen Loop (Vorlage)

> **Issue-Titel:** M1 — Datenmodell + Persistenz
> **Ziel:** PGlite-Schema für <Entität> anlegen, in OPFS persistieren, beim
> Laden wiederherstellen.
> **Definition of Done:** Datensatz anlegen/lesen/löschen; Reload behält Daten;
> CI-treu; barrierefrei; keine externen Requests.
> **Auslöser:** `@claude setze diesen Milestone um und öffne einen PR.`
