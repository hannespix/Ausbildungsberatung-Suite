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

export const ENTITAETEN = {
  prueflinge: {
    key: "prueflinge",
    singular: "Prüfling",
    plural: "Prüflinge",
    icon: "user",
    ordnung: "nachname, vorname",
    felder: [
      { name: "nachname",     label: "Nachname",        input: "text",     typ: "text",    such: true, pflicht: true, tabelle: true },
      { name: "vorname",      label: "Vorname",         input: "text",     typ: "text",    such: true, pflicht: true, tabelle: true },
      { name: "geburtsdatum", label: "Geburtsdatum",    input: "date",     typ: "date" },
      { name: "beruf",        label: "Ausbildungsberuf",input: "text",     typ: "text",    such: true, tabelle: true },
      { name: "betrieb",      label: "Ausbildungsbetrieb", input: "text",  typ: "text",    such: true, tabelle: true },
      { name: "pruefungsjahr",label: "Prüfungsjahr",    input: "number",   typ: "integer", tabelle: true },
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
    felder: [
      { name: "name",           label: "Name",            input: "text",     typ: "text", such: true, pflicht: true, tabelle: true },
      { name: "strasse",        label: "Straße / Nr.",    input: "text",     typ: "text" },
      { name: "plz",            label: "PLZ",             input: "text",     typ: "text" },
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
    felder: [
      { name: "titel",     label: "Bezeichnung",   input: "text",     typ: "text", such: true, pflicht: true, tabelle: true },
      { name: "beruf",     label: "Ausbildungsberuf", input: "text",  typ: "text", such: true, tabelle: true },
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
