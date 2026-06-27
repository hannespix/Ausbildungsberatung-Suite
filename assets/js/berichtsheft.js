// Reine, DB-/DOM-freie Logik der Berichtsheftkontrolle (in Node testbar).
// Faithful-Port der fachlichen Logik aus dem Referenztool (siehe quellen/),
// mit bewussten Fehlerkorrekturen (siehe Kommentare „FIX:").

/* ----------------------------------------------------------- Kontrollergebnisse */
// Mögliche Kontroll-Ergebnisse. `wv` = nach sich ziehende Wiedervorlage nötig.
export const ERGEBNISSE = [
  { id: "in_ordnung",                    label: "In Ordnung",                       wv: false },
  { id: "nachholung_naechste_durchsicht", label: "Nachholen bis zur nächsten Durchsicht", wv: true },
  { id: "sachberichte_wetter_email",      label: "Sachberichte/Wetter per E-Mail",   wv: true },
  { id: "berichte_bis_termin_email",      label: "Berichte bis Termin per E-Mail",   wv: true },
  { id: "persoenliche_vorlage_rp",        label: "Persönliche Vorlage beim RP",      wv: true },
  { id: "post_an_rp",                     label: "Postalisch an das RP",             wv: true },
];

export function ergebnisNach(id) { return ERGEBNISSE.find((e) => e.id === id) || null; }
export function ergebnisLabel(id) { const e = ergebnisNach(id); return e ? e.label : (id || ""); }
export function brauchtWiedervorlage(ergebnisId) { const e = ergebnisNach(ergebnisId); return !!(e && e.wv); }

// Mängelcodes des Berichtshefts (H = nur Fehltage, kein echter Mangel).
export const MAENGEL_CODES = [
  { code: "A", label: "Unterschrift Auszubildende:r fehlt" },
  { code: "B", label: "Unterschrift Ausbilder:in fehlt" },
  { code: "C", label: "Fachliche Themen unvollständig" },
  { code: "D", label: "Wetterangaben fehlen" },
  { code: "E", label: "Inhaltliche Lücken" },
  { code: "F", label: "Berichte fehlen" },
  { code: "G", label: "Datums-/KW-Fehler" },
  { code: "H", label: "Fehltage" },
  { code: "I", label: "Sonstiges" },
];
/** Echte Mängel (ohne reine Fehltage „H"). */
export function hatEchteMaengel(codes) {
  return String(codes || "").split(",").map((c) => c.trim()).filter((c) => c && c !== "H").length > 0;
}

/* --------------------------------------------------------------- Datumshelfer */
const TAG_MS = 86400000;
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(isoStr) { const d = new Date(String(isoStr) + "T12:00:00"); return isNaN(d) ? null : d; }

/**
 * ISO-8601-Kalenderwoche zu einem Datum.
 * FIX (Quelle-Bug „KW off-by-one"): einheitlich der Donnerstag-Algorithmus mit
 * Math.round (nicht Math.ceil) — Math.ceil verschiebt an DST-Grenzen um ±1 KW.
 */
export function isoKW(date) {
  const t = new Date(date.valueOf());
  t.setHours(12, 0, 0, 0);
  const tag = (t.getDay() + 6) % 7;          // Mo=0 … So=6
  t.setDate(t.getDate() - tag + 3);          // auf Donnerstag dieser Woche
  const ersterDo = t.valueOf();
  t.setMonth(0, 1);                          // 1. Januar
  if (t.getDay() !== 4) t.setMonth(0, 1 + ((4 - t.getDay()) + 7) % 7); // erster Donnerstag
  return 1 + Math.round((ersterDo - t.valueOf()) / (7 * TAG_MS));
}
/** ISO-Wochenjahr (kann am Jahreswechsel vom Kalenderjahr abweichen). */
export function isoWochenJahr(date) {
  const t = new Date(date.valueOf());
  t.setHours(12, 0, 0, 0);
  const tag = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - tag + 3);          // Donnerstag bestimmt das Wochenjahr
  return t.getFullYear();
}
/** Mo–So-Datumsbereich einer KW eines Wochenjahres. */
export function kwBereich(kw, wochenjahr) {
  const jan4 = new Date(wochenjahr, 0, 4, 12);
  const tag = (jan4.getDay() + 6) % 7;
  const woche1Mo = new Date(jan4.valueOf() - tag * TAG_MS);
  const mon = new Date(woche1Mo.valueOf() + (kw - 1) * 7 * TAG_MS);
  const sun = new Date(mon.valueOf() + 6 * TAG_MS);
  const f = (d) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  return { mon: isoDate(mon), sun: isoDate(sun), label: `KW ${kw} (${f(mon)}–${f(sun)})` };
}

/* ------------------------------------------------------------- Wiedervorlagen */
const FRIST_TAGE = 28; // Standard-Wiedervorlagefrist (4 Wochen)

/**
 * Frist einer Wiedervorlage berechnen.
 * FIX (Quelle-Bug „interval=0"): die Frist liegt NIE in der Vergangenheit/heute.
 * „nachholen bis nächste Durchsicht" nutzt den nächsten geplanten Termin nur,
 * wenn er nach heute liegt — sonst greift die 4-Wochen-Frist als Untergrenze.
 * @returns {string|null} ISO-Datum oder null (kein WV-Ergebnis).
 */
export function naechsteFrist(ergebnisId, naechsterTerminISO, heuteISO) {
  if (!brauchtWiedervorlage(ergebnisId)) return null;
  const heute = parse(heuteISO) || new Date();
  const plus = isoDate(new Date(heute.valueOf() + FRIST_TAGE * TAG_MS));
  if (ergebnisId === "nachholung_naechste_durchsicht") {
    const t = parse(naechsterTerminISO);
    if (t && t.valueOf() > heute.valueOf()) return isoDate(t);
    return plus;
  }
  return plus; // E-Mail-/Vorlage-/Post-Fristen: 4 Wochen (manuell anpassbar)
}

/**
 * Status einer Wiedervorlage — IMMER aus den Daten abgeleitet (nicht gespeichert).
 * FIX (Quelle-Bug „lazy status"): kein in der DB veraltender Status; „überfällig"
 * ergibt sich bei jeder Abfrage aus Frist < heute.
 * @returns {null|"erledigt"|"ueberfaellig"|"offen"}
 */
export function wvStatus(fristISO, erledigt, heuteISO) {
  if (!fristISO) return null;
  if (erledigt) return "erledigt";
  const frist = parse(fristISO), heute = parse(heuteISO) || new Date();
  if (!frist) return "offen";
  return frist.valueOf() < heute.setHours(0, 0, 0, 0) ? "ueberfaellig" : "offen";
}

/* ------------------------------------------------------------- Status-Ableitung */
/**
 * Gesamt-Ampel je Auszubildende:r aus der letzten Kontrolle + WV-Status.
 * @param {object|null} letzte letzte Kontrolle ({ergebnis, maengel}) oder null
 * @param {null|string} wvStat Ergebnis von wvStatus(...) für die letzte Kontrolle
 */
export function ampel(letzte, wvStat) {
  if (!letzte) return { farbe: "grau", text: "Noch nie kontrolliert" };
  if (wvStat === "ueberfaellig") return { farbe: "rot", text: "Wiedervorlage überfällig" };
  if (wvStat === "offen") return { farbe: "gelb", text: "Wiedervorlage offen" };
  if (hatEchteMaengel(letzte.maengel)) return { farbe: "gelb", text: "Mängel vermerkt" };
  if (letzte.ergebnis === "in_ordnung") return { farbe: "gruen", text: "In Ordnung" };
  return { farbe: "gelb", text: "Nachholung nötig" };
}

/**
 * Automatische Prüfungs-Zulassungs-Empfehlung.
 * FIX (Quelle-Bug „Auto-Zulassung überschreibt manuell"): liefert nur eine
 * EMPFEHLUNG (boolean) und ändert nichts — manuelle Entscheidungen bleiben
 * unangetastet. Die Oberfläche zeigt sie als Hinweis.
 */
export function zulassungsEmpfehlung({ ergebnis, maengel, fehltageProzent, wvOffen }) {
  return ergebnis === "in_ordnung"
    && !hatEchteMaengel(maengel)
    && !(fehltageProzent > 10)
    && !wvOffen;
}
