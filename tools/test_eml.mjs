// Unit-Tests des .eml-Erzeugers (assets/js/eml.js).
import {
  base64FromBytes, utf8Bytes, base64Umbrechen, encodeHeaderWort,
  sichererDateiname, rfc5322Datum, emlBauen,
} from "../assets/js/eml.js";

let fehler = 0, geprueft = 0;
function ok(b, n) { geprueft++; if (!b) { fehler++; console.error("FAIL:", n); } }
function eq(a, b, n) { ok(a === b, `${n} (erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)})`); }

// --- Base64 (gegen Node-Buffer geprüft) ---
const bytes = utf8Bytes("Grüße aus Freiburg!");
eq(base64FromBytes(bytes), Buffer.from("Grüße aus Freiburg!", "utf8").toString("base64"), "Base64 == Node-Buffer");
eq(base64FromBytes(utf8Bytes("")), "", "leer -> leer");
eq(base64FromBytes(utf8Bytes("M")), "TQ==", "1 Byte -> Padding ==");
eq(base64FromBytes(utf8Bytes("Ma")), "TWE=", "2 Bytes -> Padding =");
eq(base64FromBytes(utf8Bytes("Man")), "TWFu", "3 Bytes -> kein Padding");

// --- Zeilenumbruch bei 76 ---
const lang = base64FromBytes(utf8Bytes("x".repeat(200)));
ok(base64Umbrechen(lang).split("\r\n").every((z) => z.length <= 76), "Base64-Zeilen <= 76 Zeichen");

// --- Header-Encoded-Word ---
eq(encodeHeaderWort("Plain ASCII"), "Plain ASCII", "ASCII bleibt unverändert");
eq(encodeHeaderWort("Anhörung"), `=?UTF-8?B?${Buffer.from("Anhörung", "utf8").toString("base64")}?=`, "Umlaut -> Encoded-Word");

// --- Sicherer Dateiname ---
eq(sichererDateiname("Berufsausbildungsvertrag.pdf"), "Berufsausbildungsvertrag.pdf", "normaler Name bleibt");
eq(sichererDateiname("a/b:c*?.pdf"), "a_b_c__.pdf", "Sonderzeichen ersetzt");
eq(sichererDateiname("Anhörung.pdf"), "Anh_rung.pdf", "Umlaut -> _");
eq(sichererDateiname(""), "anlage", "leer -> anlage");

// --- Datum RFC 5322 (UTC) ---
eq(rfc5322Datum(new Date(Date.UTC(2026, 5, 28, 12, 0, 0))), "Sun, 28 Jun 2026 12:00:00 +0000", "RFC-5322-Datum");

// --- .eml ohne Anhänge ---
{
  const eml = emlBauen({ to: "betrieb@example.de", subject: "Anhörung", body: "Sehr geehrte Damen und Herren,\nbitte um Rückmeldung.", datum: new Date(Date.UTC(2026, 5, 28, 12, 0, 0)) });
  ok(eml.includes("\r\n"), "CRLF-Zeilenenden");
  ok(eml.includes("To: betrieb@example.de"), "To-Header gesetzt");
  ok(eml.includes("X-Unsent: 1"), "X-Unsent für Outlook-Entwurf");
  ok(eml.includes("Content-Type: text/plain; charset=UTF-8"), "text/plain ohne Anhänge");
  ok(!eml.includes("multipart/mixed"), "kein multipart ohne Anhänge");
  // Body ist base64-kodiert und dekodierbar.
  const m = eml.split("\r\n\r\n")[1].replace(/\r\n/g, "");
  eq(Buffer.from(m, "base64").toString("utf8"), "Sehr geehrte Damen und Herren,\nbitte um Rückmeldung.", "Body dekodiert korrekt");
}

// --- .eml mit Anhang ---
{
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
  const eml = emlBauen({
    to: "betrieb@example.de", subject: "Vertrag", body: "Anbei der Vordruck.",
    attachments: [{ filename: "BAV.pdf", mime: "application/pdf", bytes: pdf }],
    datum: new Date(Date.UTC(2026, 5, 28, 12, 0, 0)), boundary: "GRENZE",
  });
  ok(eml.includes('Content-Type: multipart/mixed; boundary="GRENZE"'), "multipart/mixed mit Boundary");
  ok(eml.includes("--GRENZE\r\n"), "Boundary-Trenner vorhanden");
  ok(eml.trimEnd().endsWith("--GRENZE--"), "Abschluss-Boundary am Ende");
  ok(eml.includes('Content-Disposition: attachment; filename="BAV.pdf"'), "Anhang als attachment");
  ok(eml.includes(Buffer.from(pdf).toString("base64")), "Anhang base64-kodiert enthalten");
}

// --- Anhang per fertigem base64 ---
{
  const eml = emlBauen({ subject: "x", body: "y", attachments: [{ filename: "a.txt", mime: "text/plain", base64: "QUJD" }], boundary: "B" });
  ok(eml.includes("QUJD"), "vorgefertigtes base64 übernommen");
}

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("EML-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("EML-TESTS OK");
