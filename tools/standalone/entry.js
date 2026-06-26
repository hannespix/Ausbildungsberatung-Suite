// entry.js — Bündel-Einstieg für den Single-File-Build.
// Lädt die klassischen Helfer (setzen window-Globals) und startet die App.
// Der ./db.js-Import von store.js wird beim Build auf db.standalone.js umgeleitet.
import "../../assets/js/nav.js";
import "../../assets/js/chart.js";
import "../../assets/js/search.js";
import "../../assets/js/app.js";
