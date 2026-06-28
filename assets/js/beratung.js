// Reine, DB-/DOM-freie Logik der Ausbildungsberatung (in Node testbar).
// Beratungsfälle: Problem/Lösung dokumentieren, Verlauf, Wiedervorlage.

import { isoDate } from "./berichtsheft.js";

export const STATUS = [
  { id: "offen",          label: "Offen" },
  { id: "in_bearbeitung", label: "In Bearbeitung" },
  { id: "geloest",        label: "Gelöst" },
];
export function statusLabel(id) { const s = STATUS.find((x) => x.id === id); return s ? s.label : (id || ""); }

export const KATEGORIEN = [
  "Vertragsstörung", "Abbruch-Gefahr", "Berichtsheft", "Leistung / Noten",
  "Konflikt im Betrieb", "Verkürzung / Verlängerung", "Prüfung", "Sonstiges",
];

export const EINTRAG_ARTEN = [
  { id: "notiz",     label: "Notiz" },
  { id: "telefonat", label: "Telefonat" },
  { id: "gespraech", label: "Gespräch" },
  { id: "massnahme", label: "Maßnahme" },
  { id: "kontakt",   label: "Kontakt" },
];
export function artLabel(id) { const a = EINTRAG_ARTEN.find((x) => x.id === id); return a ? a.label : (id || ""); }

const TAG_MS = 86400000;
function parse(s) {
  if (s instanceof Date) return isNaN(s) ? null : s;
  if (s == null || s === "") return null;
  const d = new Date(String(s).slice(0, 10) + "T12:00:00");
  return isNaN(d) ? null : d;
}

/** Standard-Wiedervorlage für einen neuen/aktualisierten Fall (heute + Tage). */
export function standardWiedervorlage(heuteISO, tage = 14) {
  const h = parse(heuteISO) || new Date();
  return isoDate(new Date(h.valueOf() + tage * TAG_MS));
}

/**
 * Ampel eines Beratungsfalls.
 * @returns {{farbe:"gruen"|"gelb"|"rot"|"grau", text:string}}
 */
export function fallAmpel(fall, heuteISO) {
  fall = fall || {};
  if (fall.status === "geloest") return { farbe: "gruen", text: "Gelöst" };
  const wv = fall.wiedervorlage ? parse(fall.wiedervorlage) : null;
  const heute = parse(heuteISO) || new Date();
  if (wv && wv.valueOf() < heute.setHours(0, 0, 0, 0)) return { farbe: "rot", text: "Wiedervorlage überfällig" };
  if (fall.status === "in_bearbeitung") return { farbe: "gelb", text: "In Bearbeitung" };
  return { farbe: "gelb", text: "Offen" };
}

/** Offen = nicht gelöst. */
export function istOffen(fall) { return !!fall && fall.status !== "geloest"; }

/** Häufigkeit je Kategorie, absteigend (für die Themen-Auswertung). */
export function kategorieHaeufung(faelle) {
  const m = new Map();
  (faelle || []).forEach((f) => {
    const k = (f && f.kategorie) ? f.kategorie : "Ohne Kategorie";
    m.set(k, (m.get(k) || 0) + 1);
  });
  return Array.from(m.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Zählung je Status ({offen, in_bearbeitung, geloest}). */
export function statusZaehlung(faelle) {
  const z = { offen: 0, in_bearbeitung: 0, geloest: 0 };
  (faelle || []).forEach((f) => { if (f && z[f.status] != null) z[f.status]++; });
  return z;
}
