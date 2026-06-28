// Unit-Tests der Berichtsheft-Logik (assets/js/berichtsheft.js).
import {
  ERGEBNISSE, ergebnisLabel, brauchtWiedervorlage, hatEchteMaengel,
  isoKW, isoWochenJahr, kwBereich, naechsteFrist, wvStatus, ampel,
  zulassungsEmpfehlung, KW_ORDER, codeUmschalten, codesAlsListe, zellenStatus,
} from "../assets/js/berichtsheft.js";

let fehler = 0, geprueft = 0;
function ok(b, n) { geprueft++; if (!b) { fehler++; console.error("FAIL:", n); } }
function eq(a, b, n) { ok(a === b, `${n} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`); }
const d = (s) => new Date(s + "T12:00:00");

// --- Ergebnisse ---
eq(ERGEBNISSE.length, 6, "6 Ergebnis-Typen");
eq(ergebnisLabel("in_ordnung"), "In Ordnung", "Label in_ordnung");
eq(brauchtWiedervorlage("in_ordnung"), false, "in_ordnung ohne WV");
eq(brauchtWiedervorlage("post_an_rp"), true, "post_an_rp mit WV");

// --- Mängel ---
eq(hatEchteMaengel(""), false, "keine Mängel");
eq(hatEchteMaengel("H"), false, "nur Fehltage (H) ist kein echter Mangel");
eq(hatEchteMaengel("A,H"), true, "A,H enthält echten Mangel");

// --- ISO-Kalenderwoche (inkl. Jahreswechsel-Grenzfälle) ---
eq(isoKW(d("2026-01-01")), 1, "01.01.2026 -> KW 1");
eq(isoWochenJahr(d("2026-01-01")), 2026, "Wochenjahr 01.01.2026 = 2026");
eq(isoKW(d("2021-01-01")), 53, "01.01.2021 -> KW 53 (gehört zu 2020)");
eq(isoWochenJahr(d("2021-01-01")), 2020, "Wochenjahr 01.01.2021 = 2020");
eq(isoKW(d("2024-12-30")), 1, "30.12.2024 -> KW 1 (gehört zu 2025)");
eq(isoWochenJahr(d("2024-12-30")), 2025, "Wochenjahr 30.12.2024 = 2025");
eq(isoKW(d("2025-06-15")), 24, "15.06.2025 -> KW 24");
eq(isoKW(d("2020-12-31")), 53, "31.12.2020 -> KW 53");

// --- KW-Bereich ---
const b = kwBereich(24, 2025);
eq(b.mon, "2025-06-09", "KW 24/2025 beginnt Mo 09.06.");
eq(b.sun, "2025-06-15", "KW 24/2025 endet So 15.06.");

// --- Wiedervorlage-Frist (nie in der Vergangenheit) ---
eq(naechsteFrist("in_ordnung", null, "2026-06-27"), null, "in_ordnung -> keine Frist");
eq(naechsteFrist("post_an_rp", null, "2026-06-27"), "2026-07-25", "post -> heute + 4 Wochen");
eq(naechsteFrist("nachholung_naechste_durchsicht", "2026-09-01", "2026-06-27"), "2026-09-01", "Nachholen -> nächster Termin");
// FIX-Test: vergangener „nächster Termin" -> Frist trotzdem in der Zukunft (4 Wochen)
eq(naechsteFrist("nachholung_naechste_durchsicht", "2026-01-01", "2026-06-27"), "2026-07-25", "vergangener Termin -> 4-Wochen-Frist statt Vergangenheit");

// --- Wiedervorlage-Status (abgeleitet) ---
eq(wvStatus(null, false, "2026-06-27"), null, "ohne Frist kein Status");
eq(wvStatus("2026-07-25", false, "2026-06-27"), "offen", "Frist in Zukunft -> offen");
eq(wvStatus("2026-06-01", false, "2026-06-27"), "ueberfaellig", "Frist vergangen -> überfällig");
eq(wvStatus("2026-06-01", true, "2026-06-27"), "erledigt", "erledigt schlägt alles");
// Regression: DB liefert date-Spalten als Date-Objekte -> müssen erkannt werden.
eq(wvStatus(new Date(2026, 5, 1), false, "2026-06-27"), "ueberfaellig", "Date-Objekt vergangen -> überfällig");
eq(wvStatus(new Date(2026, 6, 25), false, "2026-06-27"), "offen", "Date-Objekt Zukunft -> offen");

// --- Ampel ---
eq(ampel(null, null).farbe, "grau", "keine Kontrolle -> grau");
eq(ampel({ ergebnis: "in_ordnung", maengel: "" }, null).farbe, "gruen", "in Ordnung -> grün");
eq(ampel({ ergebnis: "in_ordnung", maengel: "A" }, null).farbe, "gelb", "Mangel trotz in_ordnung -> gelb");
eq(ampel({ ergebnis: "post_an_rp", maengel: "" }, "offen").farbe, "gelb", "WV offen -> gelb");
eq(ampel({ ergebnis: "post_an_rp", maengel: "" }, "ueberfaellig").farbe, "rot", "WV überfällig -> rot");

// --- Zulassungs-Empfehlung (nur Empfehlung, keine Überschreibung) ---
eq(zulassungsEmpfehlung({ ergebnis: "in_ordnung", maengel: "", fehltageProzent: 5, wvOffen: false }), true, "alles ok -> Empfehlung ja");
eq(zulassungsEmpfehlung({ ergebnis: "in_ordnung", maengel: "", fehltageProzent: 12, wvOffen: false }), false, ">10% Fehltage -> nein");
eq(zulassungsEmpfehlung({ ergebnis: "post_an_rp", maengel: "", fehltageProzent: 0, wvOffen: true }), false, "WV offen -> nein");

// --- KW-Raster ---
eq(KW_ORDER.length, 52, "52 Kalenderwochen im Raster");
eq(KW_ORDER[0], 36, "Raster beginnt bei KW 36 (Schuljahr)");
eq(KW_ORDER[16], 52, "17. Zelle = KW 52");
eq(KW_ORDER[17], 1, "18. Zelle = KW 1");
eq(KW_ORDER[51], 35, "letzte Zelle = KW 35");
eq(codeUmschalten("", "a"), "A", "Code hinzufügen (uppercase)");
eq(codeUmschalten("A,D", "C"), "A,C,D", "Code einsortieren");
eq(codeUmschalten("A,D", "D"), "A", "Code entfernen");
eq(codesAlsListe("A, d ,H").join("|"), "A|D|H", "codesAlsListe normalisiert");
eq(zellenStatus({ maengel: "A" }), "issue", "echter Mangel -> issue");
eq(zellenStatus({ maengel: "H", fehltage: 2 }), "fehltage", "nur H+Fehltage -> fehltage");
eq(zellenStatus({ maengel: "", behobene: "A", geprueft: 1 }), "behoben", "behoben ohne aktuellen Mangel");
eq(zellenStatus({ maengel: "", geprueft: 1 }), "ok", "geprüft ohne Mangel -> ok");
eq(zellenStatus({}), "leer", "unbearbeitet -> leer");

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("BERICHTSHEFT-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("BERICHTSHEFT-TESTS OK");
