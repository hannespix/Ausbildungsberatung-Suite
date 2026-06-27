// model.js — fachliches Datenmodell der Ausbildungsberatung-Suite.
//
// Eine einzige, datengetriebene Quelle: Jede Entität beschreibt ihre Felder
// (Label, Eingabetyp, SQL-Typ, Suche, Pflicht, Tabellenspalte). Daraus bauen
// store.js die Tabellen + CRUD und app.js die Formulare + Listen. Ein neues
// Modul = eine neue Entität hier + eine Route in app.js.
//
// SQL-Typen bewusst schlicht (text/date/integer/numeric) — PGlite/Postgres.

/** @typedef {{name:string,label:string,input:string,typ:string,such?:boolean,
 *   pflicht?:boolean,tabelle?:boolean,optionen?:string[],hinweis?:string,
 *   suffix?:string}} Feld */

/** Gärtner-Fachrichtungen (Ausbildungsberatung RP Freiburg). */
export const GAERTNER_FACHRICHTUNGEN = [
  "Garten- und Landschaftsbau",
  "Zierpflanzenbau",
  "Baumschule",
  "Staudengärtnerei",
  "Gemüsebau",
  "Obstbau",
  "Friedhofsgärtnerei",
];

/**
 * Prüfungsbereiche der Abschlussprüfung „Gärtner/in BW, Fachrichtung Garten- und
 * Landschaftsbau" (Sammelbewertungsbogen). Praxis 60 %, Kenntnis 40 %.
 */
export const GALABAU_BEREICHE = {
  praxis: [
    "Ausführungspläne sowie Leistungsverzeichnisse lesen und auf die Baustelle übertragen",
    "Herstellen von befestigten Flächen",
    "Be- und Verarbeiten von Naturstein",
    "Pflanzungen vorbereiten und durchführen",
    "Flächen für Ansaaten vorbereiten und ansäen",
  ],
  kenntnis: [
    "Landschaftsgärtnerische Arbeiten",
    "Pflanzenkenntnisse",
    "Betriebliche Zusammenhänge",
    "Wirtschafts- und Sozialkunde",
  ],
};

/**
 * Standard-Stationen des praktischen Prüfungstags GaLaBau (Vorlage für den
 * Rotations-Ablaufplan): die fünf praktischen Prüfungsbereiche (je 60 Min,
 * 50 Prüfung + 10 Bewertung) plus die vom RP in Eigenregie betreute
 * Pflanzenerkennung (20 Min, ohne Ausschuss-Prüfer). Einzige Quelle für die
 * Vorlage — von Cockpit (app.js) und automatischer Planung (store.js) genutzt.
 */
export const STANDARD_STATIONEN_GALABAU = GALABAU_BEREICHE.praxis
  .map((name) => ({ name, dauerMin: 60, bewertungMin: 10, prueferBedarf: 1, eigenregie: false }))
  .concat([{ name: "Pflanzenerkennung", dauerMin: 20, bewertungMin: 0, prueferBedarf: 0, eigenregie: true }]);

export const ENTITAETEN = {
  prueflinge: {
    key: "prueflinge",
    singular: "Prüfling",
    plural: "Prüflinge",
    icon: "user",
    ordnung: "nachname, vorname",
    dublette: ["nachname", "vorname"],
    felder: [
      { name: "nachname",     label: "Nachname",        input: "text",     typ: "text",    such: true, pflicht: true, tabelle: true },
      { name: "vorname",      label: "Vorname",         input: "text",     typ: "text",    such: true, pflicht: true, tabelle: true },
      { name: "geburtsdatum", label: "Geburtsdatum",    input: "date",     typ: "date" },
      { name: "beruf",        label: "Fachrichtung (Gärtner/in)", input: "select", typ: "text", such: true, tabelle: true,
        optionen: GAERTNER_FACHRICHTUNGEN },
      { name: "betrieb",      label: "Ausbildungsbetrieb", input: "reftext", typ: "text",  such: true, tabelle: true,
        ref: { entitaet: "betriebe", feld: "name" }, hinweis: "Aus bestehenden Betrieben wählen oder neu eintippen." },
      { name: "pruefungsjahr",label: "Prüfungsjahr",    input: "number",   typ: "integer", tabelle: true,
        muster: "^(19|20)\\d{2}$", musterText: "Bitte ein vierstelliges Jahr eingeben (z. B. 2026)." },
      { name: "status",       label: "Status",          input: "select",   typ: "text",    tabelle: true,
        optionen: ["angemeldet", "zugelassen", "geprüft", "bestanden", "nicht bestanden", "zurückgezogen"] },
      { name: "email",        label: "E-Mail",          input: "email",    typ: "text",    such: true },
      { name: "telefon",      label: "Telefon",         input: "tel",      typ: "text" },
      { name: "bemerkung",    label: "Bemerkung",       input: "textarea", typ: "text" },
    ],
  },

  betriebe: {
    key: "betriebe",
    singular: "Ausbildungsbetrieb",
    plural: "Ausbildungsbetriebe",
    icon: "building",
    ordnung: "name",
    dublette: ["name"],
    felder: [
      { name: "name",           label: "Name",            input: "text",     typ: "text", such: true, pflicht: true, tabelle: true },
      { name: "strasse",        label: "Straße / Nr.",    input: "text",     typ: "text" },
      { name: "plz",            label: "PLZ",             input: "text",     typ: "text",
        muster: "^\\d{5}$", musterText: "Die PLZ muss aus fünf Ziffern bestehen (z. B. 79098)." },
      { name: "ort",            label: "Ort",             input: "text",     typ: "text", such: true, tabelle: true },
      { name: "ansprechpartner",label: "Ansprechpartner", input: "text",     typ: "text", such: true, tabelle: true },
      { name: "email",          label: "E-Mail",          input: "email",    typ: "text", such: true },
      { name: "telefon",        label: "Telefon",         input: "tel",      typ: "text", tabelle: true },
      { name: "bemerkung",      label: "Bemerkung",       input: "textarea", typ: "text" },
    ],
  },

  pruefer: {
    key: "pruefer",
    singular: "Prüfer:in",
    plural: "Prüfer:innen",
    icon: "users",
    ordnung: "nachname, vorname",
    dublette: ["nachname", "vorname"],
    felder: [
      { name: "nachname",     label: "Nachname",      input: "text",     typ: "text", such: true, pflicht: true, tabelle: true },
      { name: "vorname",      label: "Vorname",       input: "text",     typ: "text", such: true, pflicht: true, tabelle: true },
      { name: "organisation", label: "Organisation",  input: "text",     typ: "text", such: true, tabelle: true },
      { name: "funktion",     label: "Funktion",      input: "select",   typ: "text", such: true, tabelle: true,
        optionen: ["Vorsitz", "Stv. Vorsitz", "Beisitz Arbeitgeber", "Beisitz Arbeitnehmer", "Lehrkraft"] },
      { name: "email",        label: "E-Mail",        input: "email",    typ: "text", such: true },
      { name: "telefon",      label: "Telefon",       input: "tel",      typ: "text", tabelle: true },
      { name: "bemerkung",    label: "Bemerkung",     input: "textarea", typ: "text" },
    ],
  },

  pruefungen: {
    key: "pruefungen",
    singular: "Prüfungstermin",
    plural: "Prüfungstermine",
    icon: "calendar",
    ordnung: "datum, zeit_von",
    dublette: ["titel", "datum"],
    felder: [
      { name: "titel",     label: "Bezeichnung",   input: "text",     typ: "text", such: true, pflicht: true, tabelle: true },
      { name: "beruf",     label: "Fachrichtung",  input: "select",   typ: "text", such: true, tabelle: true,
        optionen: GAERTNER_FACHRICHTUNGEN },
      { name: "datum",     label: "Datum",         input: "date",     typ: "date", pflicht: true, tabelle: true },
      { name: "zeit_von",  label: "Beginn",        input: "time",     typ: "text", tabelle: true },
      { name: "zeit_bis",  label: "Ende",          input: "time",     typ: "text" },
      { name: "ort",       label: "Ort",           input: "text",     typ: "text", such: true, tabelle: true },
      { name: "raum",      label: "Raum",          input: "text",     typ: "text" },
      { name: "bemerkung", label: "Bemerkung",     input: "textarea", typ: "text" },
    ],
  },
};

/** Suchspalten (Textfelder mit such:true) einer Entität. */
export function suchspalten(entitaet) {
  return entitaet.felder.filter((f) => f.such).map((f) => f.name);
}

/** Reihenfolge der Module in der Navigation. */
export const NAV_REIHENFOLGE = ["prueflinge", "betriebe", "pruefer", "pruefungen"];
