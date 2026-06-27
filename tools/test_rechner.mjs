// Unit-Tests der Ausbildungsrechner-Engine (assets/js/ausbildungsrechner.js).
import {
  addMonths, addDays, diffMonths, endOfMonth, iso, ds, alterZuStichtag,
  getTarifVerguetung, getJahresurlaub, pruefungsperiode, berechne, berufNach,
  BERUFE,
} from "../assets/js/ausbildungsrechner.js";

let fehler = 0, geprueft = 0;
function ok(b, n) { geprueft++; if (!b) { fehler++; console.error("FAIL:", n); } }
function eq(a, b, n) { ok(a === b, `${n} (erwartet ${b}, war ${a})`); }

// --- Datumshelfer (§ 188 III BGB) ---
eq(iso(addMonths(ds("2025-09-01"), 36)), "2028-09-01", "+36 Monate");
eq(iso(addMonths(ds("2024-01-31"), 1)), "2024-02-29", "31.01.+1 -> 29.02. (Schaltjahr)");
eq(iso(addMonths(ds("2025-01-31"), 1)), "2025-02-28", "31.01.+1 -> 28.02.");
eq(iso(addMonths(ds("2025-03-15"), -2)), "2025-01-15", "-2 Monate");
eq(diffMonths(ds("2025-09-01"), ds("2028-09-01")), 36, "diffMonths 36");
eq(diffMonths(ds("2025-09-15"), ds("2026-03-10")), 5, "diffMonths Teilmonat -> 5");
eq(iso(addDays(ds("2025-12-30"), 5)), "2026-01-04", "addDays über Jahr");
eq(iso(endOfMonth(ds("2026-02-10"))), "2026-02-28", "endOfMonth Feb");
eq(alterZuStichtag(ds("2008-06-15"), new Date(2026, 0, 1, 12)), 17, "Alter zum 01.01.2026");

// --- Tarif & Mindestvergütung ---
eq(getTarifVerguetung("galabau", "2025-09-01", 1, "2025-08-15"), 1100, "GaLaBau LJ1 ab 2025-07 = 1100");
eq(getTarifVerguetung("galabau", "2025-09-01", 2, "2025-08-15"), 1220, "GaLaBau LJ2 = 1220");
eq(getTarifVerguetung("forstwirt-oed", "2025-03-01", 1, "2025-01-01"), 1237, "Forst öD LJ1 ab 2025-02 = 1237");
ok(getTarifVerguetung("landwirt", "2024-06-01", 1, "2024-06-01") >= 649, "Landwirt LJ1 >= MiAV 2024");

// --- Urlaub (Tarif vs. JArbSchG) ---
eq(getJahresurlaub("galabau", null, 2026).tage, 30, "GaLaBau Urlaub 30 (Tarif)");
eq(getJahresurlaub("landwirt", null, 2026).tage, 26, "Landwirt Urlaub 26 (Tarif)");
eq(getJahresurlaub("landwirt", "2009-06-15", 2026).grund, "u17", "Jugendlich u17 erkannt (16 J. zum 01.01.)");
eq(getJahresurlaub("landwirt", "2009-01-01", 2026).grund, "u18", "17 J. zum 01.01. -> u18-Staffel");

// --- Prüfungsperiode ---
eq(pruefungsperiode(ds("2028-07-01")).label, "Sommerprüfung 2028", "Juli -> Sommer");
eq(pruefungsperiode(ds("2028-12-10")).label, "Winterprüfung 2028/29", "Dez -> Winter");
eq(pruefungsperiode(ds("2028-01-10")).label, "Winterprüfung 2027/28", "Jan -> Winter Vorjahr");

// --- berechne: Grundfall (36 Monate, keine Anpassung) ---
let r = berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36 });
eq(r.endeNachVerkuerzung, "2028-09-01", "Grundfall Ende 2028-09-01");
eq(r.fruehestePruefung, "2028-07-01", "Grundfall Prüfung -2 Monate");
eq(r.pruefungsperiode, "Sommerprüfung 2028", "Grundfall Periode");

// Verkürzung 12 Monate
r = berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, verkuerzungAktiv: true, verkuerzungMonate: 12 });
eq(r.endeNachVerkuerzung, "2027-09-01", "Verkürzung -> 2027-09-01");
eq(r.pruefungsperiode, "Sommerprüfung 2027", "Verkürzung -> Sommer 2027");

// Vorzeitige Zulassung (§ 45) = -8 Monate
r = berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, vorzeitig: true });
eq(r.fruehestePruefung, "2028-01-01", "Vorzeitig -8 Monate");

// Fehltage: Schwelle 10 %, Nachholzeit (erzwungene Anrechnung)
r = berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, fehltage: 77, kompensation: false, fehltageRundung: "tag" });
eq(r.geringfuegigSchwelle, 66, "Schwelle 10% von 660 = 66");
eq(r.angerechnet, true, "erzwungene Anrechnung");
eq(r.nachholKalendertage, 16, "11 AT -> 16 Kalendertage (ceil 11*1.4)");
// Fehltage-Zonen
eq(berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, fehltage: 50 }).fehltageZone, "ok", "<=10% ok");
eq(berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, fehltage: 80 }).fehltageZone, "grenz", "~12% grenz");
eq(berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, fehltage: 120 }).fehltageZone, "kritisch", ">15% kritisch");

// Teilzeit § 7a II (Modus vz) + Cap
r = berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, teilzeitAktiv: true, teilzeitAb: "2025-09-01", teilzeitQuote: 80, verlaengerungModus: "vz" });
eq(r.teilzeitVerlaengerungMonate, 7, "TZ 80% vz -> 7 Monate Verlängerung");
ok(!r.capGreift, "kein Cap bei 80%");
// Cap greift (Modus tz, 50%)
r = berechne({ berufId: "galabau", start: "2025-09-01", dauerMonate: 36, teilzeitAktiv: true, teilzeitAb: "2025-09-01", teilzeitQuote: 50, verlaengerungModus: "tz" });
eq(r.capGreift, true, "Cap § 7a II greift bei 50% tz");
eq(r.teilzeitVerlaengerungMonate, 18, "Cap auf 1,5-fach -> +18 Monate");

// Berufe-Liste plausibel
eq(BERUFE.length, 15, "15 Berufe definiert");
ok(berufNach("galabau") && berufNach("galabau").urlaub === 30, "berufNach galabau Urlaub 30");

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("RECHNER-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("RECHNER-TESTS OK");
