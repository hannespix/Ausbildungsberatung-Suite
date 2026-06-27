// Unit-Tests der reinen Auth-/Hash-Logik (assets/js/auth.js). Node + CI.
import { sha256hex, passHash } from "../assets/js/auth.js";

let fehler = 0, geprueft = 0;
function ok(b, name) { geprueft++; if (!b) { fehler++; console.error("FAIL:", name); } }
function eq(a, b, name) { ok(a === b, `${name} (erwartet ${b}, war ${a})`); }

// --- SHA-256 gegen bekannte Testvektoren ---
eq(sha256hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256('')");
eq(sha256hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256('abc')");
eq(sha256hex("The quick brown fox jumps over the lazy dog"),
  "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592", "sha256(fox)");
// UTF-8 (Umlaut)
eq(sha256hex("azubi2027"), sha256hex("azubi2027"), "deterministisch");
ok(sha256hex("ä").length === 64, "Umlaut -> 64 Hex-Zeichen");

// --- passHash: deterministisch, salzabhängig, kein Klartext ---
eq(passHash("s1", "azubi2027"), passHash("s1", "azubi2027"), "passHash deterministisch");
ok(passHash("s1", "azubi2027") !== passHash("s2", "azubi2027"), "anderes Salz -> anderer Hash");
ok(passHash("s1", "azubi2027") !== passHash("s1", "falsch"), "anderes Passwort -> anderer Hash");
ok(!passHash("s1", "azubi2027").includes("azubi2027"), "Hash enthält kein Klartext-Passwort");
eq(passHash("s1", "x").length, 64, "passHash -> 64 Hex-Zeichen");

console.log(`${geprueft} Prüfungen, ${fehler} Fehler.`);
if (fehler) { console.error("AUTH-TESTS FEHLGESCHLAGEN"); process.exit(1); }
console.log("AUTH-TESTS OK");
