// Reine Berechnungs-Engine des "Ausbildungsrechner Grüne Berufe (BaWü)".
// Faithful-Port der fachlichen Logik aus dem Referenztool (siehe quellen/).
// DB-/DOM-frei und in Node testbar. Berechnet u. a. den frühestmöglichen
// Prüfungstermin (§§ 43, 45 BBiG), Teilzeit-Verlängerung (§ 7a II BBiG),
// Fehlzeiten-Nachholzeit (§ 8 II BBiG) sowie Vergütungs-/Urlaubsübersicht.
//
// WICHTIG: Berechnungshilfe ohne Gewähr — ersetzt keine Einzelfallprüfung.

/* ------------------------------------------------------------ Datumshelfer */
/** ISO "YYYY-MM-DD" -> Date (lokale Mittagszeit, TZ-stabil). */
export function ds(iso) { const d = new Date(String(iso) + "T12:00:00"); return isNaN(d) ? null : d; }
/** Date -> ISO "YYYY-MM-DD" (lokale Felder). */
export function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

/** Monate addieren mit Monatsende-Anpassung (§ 188 III BGB). */
export function addMonths(date, months) {
  const d = new Date(date);
  const ziel = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Math.round(months));
  const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(ziel, letzter));
  return d;
}
export function addDays(date, tage) { const d = new Date(date); d.setDate(d.getDate() + Math.round(tage)); return d; }
export function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12); }
/** Ganze Monatsdifferenz a->b (kalendarisch, abgerundet auf volle Monate). */
export function diffMonths(a, b) {
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return m;
}
/** Alter (Jahre) zum Stichtag. */
export function alterZuStichtag(geb, stichtag) {
  const g = new Date(geb), s = new Date(stichtag);
  let a = s.getFullYear() - g.getFullYear();
  const hatte = s.getMonth() > g.getMonth() || (s.getMonth() === g.getMonth() && s.getDate() >= g.getDate());
  if (!hatte) a--;
  return a;
}

/* ---------------------------------------------------------- Stammdaten/Tarife */
// Tarifstaffeln je Beruf (ab-Datum + Vergütung Lehrjahr 1..3). Stand siehe quellen/.
const T_LANDWIRT = [{ ab: "2024-01-01", lj: [850, 950, 1050] }, { ab: "2025-01-01", lj: [900, 1000, 1100] }];
const T_GARTENBAU = [{ ab: "2024-03-01", lj: [900, 1000, 1100] }, { ab: "2025-05-01", lj: [980, 1080, 1240] }];

const lw = (id, label) => ({ id, label, group: "Land-/Forstwirtschaft", urlaub: 26, tarifInfo: "TV Land-/Forstwirtschaft BaWü, ab 01.01.2025", tarife: T_LANDWIRT });
const gb = (id, label) => ({ id, label, group: "Erwerbsgartenbau BaWü", urlaub: 26, tarifInfo: "TV Gartenbau Baden-Württemberg/Hessen, ab 01.05.2025", tarifLaufzeitBis: "2026-04-30", tarife: T_GARTENBAU });

/** Berufe der grünen Sparte mit Tarif-/Urlaubsdaten. */
export const BERUFE = [
  { id: "galabau", label: "Gärtner/in – Garten- und Landschaftsbau", group: "Gartenbau (GaLaBau)", urlaub: 30,
    tarifInfo: "TV Ausbildungsvergütungen GaLaBau (bundeseinheitlich), Fassung 18.06.2025",
    tarife: [{ ab: "2024-07-01", lj: [1060, 1180, 1290] }, { ab: "2025-07-01", lj: [1100, 1220, 1340] }, { ab: "2026-07-01", lj: [1140, 1270, 1390] }] },
  gb("baumschule", "Gärtner/in – Baumschule"),
  gb("friedhof", "Gärtner/in – Friedhofsgärtnerei"),
  gb("gemuese", "Gärtner/in – Gemüsebau"),
  gb("obstbau", "Gärtner/in – Obstbau"),
  gb("stauden", "Gärtner/in – Staudengärtnerei"),
  gb("zierpflanzen", "Gärtner/in – Zierpflanzenbau"),
  lw("landwirt", "Landwirt/in"),
  lw("winzer", "Winzer/in"),
  lw("pferdewirt", "Pferdewirt/in"),
  lw("tierwirt", "Tierwirt/in"),
  lw("fischwirt", "Fischwirt/in"),
  lw("forstwirt", "Forstwirt/in (Privatwirtschaft)"),
  { id: "forstwirt-oed", label: "Forstwirt/in (öff. Dienst / Land)", group: "Land-/Forstwirtschaft", urlaub: 29,
    tarifInfo: "TVA-L-Forst (öffentlicher Dienst), ÄTV Nr. 9",
    tarife: [{ ab: "2024-01-01", lj: [1087, 1141, 1191] }, { ab: "2024-11-01", lj: [1187, 1241, 1291] }, { ab: "2025-02-01", lj: [1237, 1291, 1341] }] },
  lw("brenner", "Brenner/in"),
];

/** Mindestausbildungsvergütung (§ 17 II BBiG), maßgeblich: Jahr des Beginns. */
export const MINDESTVERGUETUNG = [
  { ab: "2024-01-01", lj: [649, 766, 876] },
  { ab: "2025-01-01", lj: [682, 805, 921] },
  { ab: "2026-01-01", lj: [724, 854, 977] },
];

export function berufNach(id) { return BERUFE.find((b) => b.id === id) || null; }

/** Tarifliche (mind. gesetzliche) Monatsvergütung. */
export function getTarifVerguetung(berufId, datumISO, lehrjahr, beginnISO) {
  const b = berufNach(berufId); if (!b) return 0;
  const lj = Math.max(1, Math.min(3, lehrjahr)) - 1;
  const datum = ds(datumISO);
  let betrag = b.tarife[0].lj[lj];
  for (let i = b.tarife.length - 1; i >= 0; i--) { if (datum >= ds(b.tarife[i].ab)) { betrag = b.tarife[i].lj[lj]; break; } }
  const stichtag = ds(beginnISO || datumISO);
  for (let i = MINDESTVERGUETUNG.length - 1; i >= 0; i--) { if (stichtag >= ds(MINDESTVERGUETUNG[i].ab)) { betrag = Math.max(betrag, MINDESTVERGUETUNG[i].lj[lj]); break; } }
  return betrag;
}

/** Jahresurlaub (AT): max(Tarif, JArbSchG § 19 für Jugendliche). */
export function getJahresurlaub(berufId, geburtsdatumISO, jahr) {
  const b = berufNach(berufId);
  const tarif = b ? b.urlaub : 26;
  if (!geburtsdatumISO) return { tage: tarif, grund: "tarif" };
  const alter = alterZuStichtag(ds(geburtsdatumISO), new Date(jahr, 0, 1, 12));
  if (alter >= 18) return { tage: tarif, grund: "tarif" };
  if (alter >= 17) return { tage: Math.max(tarif, Math.ceil(25 * 5 / 6)), grund: "u18" };
  if (alter >= 16) return { tage: Math.max(tarif, Math.ceil(27 * 5 / 6)), grund: "u17" };
  return { tage: Math.max(tarif, Math.ceil(30 * 5 / 6)), grund: "u16" };
}

/** Nächste Prüfungsperiode ab einem Datum (Sommer Mitte Juni / Winter Mitte Dez). */
export function pruefungsperiode(ab) {
  const m = ab.getMonth(), jahr = ab.getFullYear();
  let pruef, periode, pjahr = jahr;
  if (m >= 4 && m <= 6) { pruef = new Date(jahr, 5, 15); periode = "Sommer"; }
  else if (m === 10 || m === 11) { pruef = new Date(jahr, 11, 15); periode = "Winter"; }
  else if (m === 0) { pruef = new Date(jahr - 1, 11, 15); periode = "Winter"; pjahr = jahr - 1; }
  else if (m < 4) { pruef = new Date(jahr, 5, 15); periode = "Sommer"; }
  else { pruef = new Date(jahr, 11, 15); periode = "Winter"; }
  const ende = new Date(pruef.getFullYear(), pruef.getMonth() + 1, 0, 12);
  const label = periode === "Winter"
    ? `Winterprüfung ${pjahr}/${String(pjahr + 1).slice(2)}`
    : `Sommerprüfung ${pjahr}`;
  return { ende, periode, label };
}

const ARBEITSTAGE_PRO_JAHR = 220; // landwirtschaftliche Verwaltungspraxis

/**
 * Hauptberechnung: liefert die Schritte A–D und den frühestmöglichen Prüfungstermin.
 * @param {object} e Eingaben (siehe Felder unten).
 * @returns {object} Ergebnis mit ISO-Daten, Zwischenwerten und Hinweisen.
 */
export function berechne(e) {
  const startDate = ds(e.start); if (!startDate) throw new Error("Ausbildungsbeginn fehlt/ungültig.");
  const dauer = Math.max(1, Math.round(Number(e.dauerMonate) || 36));
  const verk = e.verkuerzungAktiv ? Math.max(0, Math.round(Number(e.verkuerzungMonate) || 0)) : 0;
  const hinweise = [];

  // Schritt A
  const endeRegulaer = addMonths(startDate, dauer);
  const endeA = addMonths(startDate, dauer - verk);

  // Schritt B — einfache Teilzeit (§ 7a II BBiG)
  let endeB = new Date(endeA), tzVerl = 0, capGreift = false, kappung8I = false;
  const tzAktiv = !!e.teilzeitAktiv && e.teilzeitAb && Number(e.teilzeitQuote) > 0;
  const quote = tzAktiv ? Math.min(100, Math.max(50, Math.round(Number(e.teilzeitQuote)))) : 100;
  if (tzAktiv) {
    const tzDate = ds(e.teilzeitAb);
    const tzAnteil = Math.max(0, diffMonths(tzDate, endeA));
    const roh = (e.verlaengerungModus === "tz")
      ? tzAnteil * (100 - quote) / quote
      : tzAnteil * (100 - quote) / 100;
    tzVerl = Math.floor(roh);
    // Cap § 7a II S. 1 (1,5-fache AO-Dauer)
    const hoechst = Math.floor(dauer * 1.5);
    const gesamtOhneCap = diffMonths(startDate, addMonths(endeA, tzVerl));
    if (gesamtOhneCap > hoechst) {
      tzVerl = Math.max(0, hoechst - diffMonths(startDate, endeA));
      capGreift = true;
      hinweise.push("Höchstdauer nach § 7a II S. 1 BBiG (1,5-fache Ausbildungszeit) greift.");
    }
    // Kappung § 8 I S. 2 (TZ + Verkürzung, Überschreitung ≤ 6 Monate -> auf Vollzeit-Ende)
    if (verk > 0 && !capGreift) {
      const ueber = diffMonths(endeRegulaer, addMonths(endeA, tzVerl));
      if (ueber > 0 && ueber <= 6) {
        tzVerl = Math.max(0, diffMonths(endeA, endeRegulaer));
        kappung8I = true;
        hinweise.push("Kappung nach § 8 I S. 2 BBiG auf das Vollzeit-Ende (Überschreitung ≤ 6 Monate).");
      }
    }
    endeB = addMonths(endeA, tzVerl);
  }

  // Schritt C — Fehlzeiten (§ 8 II BBiG)
  const fehltage = Math.max(0, Math.round(Number(e.fehltage) || 0));
  const gesamtAusbTage = (dauer - verk) / 12 * ARBEITSTAGE_PRO_JAHR;
  const schwelle = gesamtAusbTage * 0.1;
  const prozent = gesamtAusbTage > 0 ? (fehltage / gesamtAusbTage) * 100 : 0;
  const zone = prozent <= 10 ? "ok" : (prozent <= 15 ? "grenz" : "kritisch");
  // Best-Case (kompensiert) bis 15 %, sofern nicht ausdrücklich angerechnet.
  const anrechnen = e.kompensation === false ? true : (e.kompensation === true ? false : prozent > 15);
  let nachholKalTage = 0, endeC = new Date(endeB), nachholPeriode = null;
  if (anrechnen) {
    const anrechenbarAT = Math.max(0, fehltage - schwelle);
    const atKal = quote < 100 ? anrechenbarAT / (quote / 100) : anrechenbarAT;
    nachholKalTage = Math.ceil(atKal * 7 / 5);
    const rundung = e.fehltageRundung || "pruefung";
    const taggenau = addDays(endeB, nachholKalTage);
    if (rundung === "tag") endeC = taggenau;
    else if (rundung === "monat") endeC = endOfMonth(taggenau);
    else { const p = pruefungsperiode(taggenau); endeC = p.ende; nachholPeriode = p.label; }
  }

  // Schritt D — frühestmögliche Prüfung
  const ende = endeC;
  const vorzeitig = !!e.vorzeitig;
  const fruehestePruefung = vorzeitig ? addMonths(ende, -8) : addMonths(ende, -2);
  const periode = pruefungsperiode(fruehestePruefung);

  if (berufNach(e.berufId)?.tarifLaufzeitBis && ds(e.start) >= ds(berufNach(e.berufId).tarifLaufzeitBis)) {
    hinweise.push("Tarif-Laufzeit überschritten — Vergütungswerte ggf. veraltet (Nachwirkung § 4 V TVG).");
  }

  return {
    endeRegulaer: iso(endeRegulaer), endeNachVerkuerzung: iso(endeA),
    teilzeitVerlaengerungMonate: tzVerl, capGreift, kappung8I, endeNachTeilzeit: iso(endeB),
    fehltageZone: zone, fehltageProzent: Math.round(prozent * 10) / 10, geringfuegigSchwelle: Math.round(schwelle * 10) / 10,
    angerechnet: anrechnen, nachholKalendertage: nachholKalTage, nachholPruefungsperiode: nachholPeriode,
    vertragsende: iso(ende),
    fruehestePruefung: iso(fruehestePruefung), pruefungsperiode: periode.label, pruefungsperiodeEnde: iso(periode.ende),
    hinweise,
  };
}
