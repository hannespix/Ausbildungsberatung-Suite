# Quellen / Referenz-Tools

Hier liegen die ursprünglichen, eigenständigen Tools der Ausbildungsberatung,
deren Funktionen schrittweise in die Suite übernommen werden. Sie dienen als
**fachliche Referenz** (Logik, Felder, Berechnungen) — nicht zum Ausliefern.

- `berichtsheftkontrolle.html` — Berichtsheftkontrolle (Dashboard, Stammdaten,
  Import, Kontrollplanung, Kontrolle durchführen, Wiedervorlagen, Berichte/Export).
- `ausbildungsrechner-gruene-berufe-bawue.html` — Ausbildungsrechner für die
  grünen Berufe in Baden-Württemberg (Fristen/Berechnungen).

## Hinweis zur Kürzung
Aus den Referenzkopien wurden **gebündelte Fremdbibliotheken, eingebettete
Schriften und WASM-Binärdaten entfernt** (lizenz- und größenbedingt; im
öffentlichen Repo werden keine lizenzpflichtigen Schriften verteilt). Erkennbar
an Platzhaltern `/* [Quelle gekürzt: … ] */`. Die fachliche App-Logik
(HTML/CSS/JavaScript der Tools selbst) ist erhalten.

Die Nachbildung in der Suite nutzt das gemeinsame Design (`bw-theme.css`,
`--bw-*`-Tokens) und die vorhandene Datenhaltung (PGlite/Postgres-WASM) statt der
in den Originalen verwendeten Bibliotheken.
