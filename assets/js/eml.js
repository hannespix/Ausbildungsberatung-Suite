// eml.js — reiner Erzeuger von E-Mail-Entwürfen im .eml-Format (RFC 5322 / MIME),
// DOM-/DB-frei und in Node testbar.
//
// Warum .eml? mailto: kann technisch keine Dateianhänge mitschicken. Eine .eml-
// Datei dagegen enthält Betreff, Text UND Anhänge; per Doppelklick öffnet sie in
// Outlook/Thunderbird als fertiger, editierbarer Entwurf inklusive Anlagen. Das
// bleibt vollständig offline (kein Versand, keine externen Requests).
//
// Der erzeugte Entwurf trägt „X-Unsent: 1", damit Outlook ihn als unversendeten
// Entwurf mit „Senden"-Knopf öffnet (statt als empfangene Nachricht).

const CRLF = "\r\n";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 aus Bytes (Uint8Array/Array), ohne btoa/Buffer — läuft überall. */
export function base64FromBytes(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? "=" : B64[b2 & 63];
  }
  return out;
}

/** Text als UTF-8-Bytes (TextEncoder gibt es in Node ≥18 und im Browser). */
export function utf8Bytes(str) { return new TextEncoder().encode(String(str)); }

/** Base64-Zeilen nach MIME auf 76 Zeichen umbrechen (CRLF). */
export function base64Umbrechen(b64) {
  const zeilen = [];
  for (let i = 0; i < b64.length; i += 76) zeilen.push(b64.slice(i, i + 76));
  return zeilen.join(CRLF);
}

/**
 * Header-Wert mit Nicht-ASCII (z. B. Umlaute im Betreff) als RFC-2047-Encoded-Word.
 * Reines ASCII bleibt unverändert.
 */
export function encodeHeaderWort(s) {
  s = String(s == null ? "" : s);
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${base64FromBytes(utf8Bytes(s))}?=`;
}

/** Dateiname auf ein sicheres ASCII-Set für den Content-Disposition-Header reduzieren. */
export function sichererDateiname(name) {
  return String(name || "anlage")
    .replace(/[\\/:*?"<>|\r\n]/g, "_")   // im Dateisystem/Headern unzulässige Zeichen
    .replace(/[^\x20-\x7E]/g, "_")        // Nicht-ASCII (Umlaute) -> _
    .trim() || "anlage";
}

/** RFC-5322-Datumszeile in UTC (z. B. „Sun, 28 Jun 2026 12:00:00 +0000"). */
export function rfc5322Datum(d) {
  const tage = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monate = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n) => String(n).padStart(2, "0");
  return `${tage[d.getUTCDay()]}, ${p(d.getUTCDate())} ${monate[d.getUTCMonth()]} ${d.getUTCFullYear()} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

/**
 * Erzeugt den Inhalt einer .eml-Datei.
 * @param {object} o
 * @param {string} [o.to]       Empfänger-Adresse(n) (kommagetrennt, optional)
 * @param {string} [o.subject]  Betreff
 * @param {string} [o.body]     Text (UTF-8)
 * @param {Array<{filename:string, mime?:string, base64?:string, bytes?:Uint8Array}>} [o.attachments]
 * @param {Date}   [o.datum]    Datum (Default: jetzt)
 * @param {string} [o.boundary] MIME-Grenze (Default deterministisch — für Tests)
 * @returns {string} .eml-Inhalt mit CRLF-Zeilenenden
 */
export function emlBauen(o = {}) {
  const to = o.to || "";
  const subject = o.subject || "";
  const body = o.body || "";
  const attachments = Array.isArray(o.attachments) ? o.attachments : [];
  const datum = o.datum instanceof Date ? o.datum : new Date();
  const boundary = o.boundary || "=_RPF_Ausbildungsberatung_Anlagen_";

  const kopf = [
    "MIME-Version: 1.0",
    `Date: ${rfc5322Datum(datum)}`,
    to ? `To: ${to}` : null,
    `Subject: ${encodeHeaderWort(subject)}`,
    "X-Unsent: 1",                       // Outlook: als editierbaren Entwurf öffnen
  ].filter(Boolean);

  const textTeil = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Umbrechen(base64FromBytes(utf8Bytes(body))),
  ].join(CRLF);

  // Ohne Anhänge: einfache text/plain-Nachricht (kein multipart).
  if (!attachments.length) {
    return [...kopf,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Umbrechen(base64FromBytes(utf8Bytes(body))),
      "",
    ].join(CRLF);
  }

  const teile = [`--${boundary}`, textTeil];
  for (const a of attachments) {
    const name = sichererDateiname(a.filename);
    const mime = a.mime || "application/octet-stream";
    const b64 = a.base64 != null ? a.base64 : base64FromBytes(a.bytes || []);
    teile.push(`--${boundary}`);
    teile.push([
      `Content-Type: ${mime}; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${name}"`,
      "",
      base64Umbrechen(b64),
    ].join(CRLF));
  }
  teile.push(`--${boundary}--`);

  return [
    ...kopf,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    teile.join(CRLF),
    "",
  ].join(CRLF);
}
