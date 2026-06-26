// search.js — intelligente, multitokenbasierte, globale Fuzzy-Suche (In-Memory).
// Für reine JS-Tools ohne Datenbank. Bei PGlite-Tools stattdessen db.js
// (Suche in der Datenbank via pg_trgm/unaccent) verwenden.
//
// Eigenschaften:
//  - global: durchsucht alle (oder gewählte) Felder eines Datensatzes
//  - multitoken: jedes Wort der Eingabe muss matchen (UND), Reihenfolge egal
//  - fuzzy: tolerant gegenüber Tippfehlern (Levenshtein, längenabhängig)
//  - diakritikatolerant: "Müller" == "muller", ß == ss
//  - Scoring: exakt > Präfix > fuzzy; Treffer in mehreren Feldern zählen mehr
//
// API:  window.bwSearch.search(records, query, options) -> sortierte Treffer
//       window.bwSearch.normalize(text)
//       window.bwSearch.highlight(text, query) -> HTML mit <mark class="bw-treffer">
(function () {
  function normalize(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Diakritika entfernen
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(q) {
    return normalize(q).split(" ").filter(Boolean);
  }

  // Levenshtein-Distanz (begrenzt, für kurze Tokens ausreichend schnell)
  function lev(a, b) {
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = new Array(n + 1), cur = new Array(n + 1), i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  // erlaubte Fuzzy-Distanz je nach Tokenlänge
  function tol(len) { return len <= 3 ? 0 : len <= 6 ? 1 : 2; }

  // Bewertet ein Token gegen einen normalisierten Feldwert. 0 = kein Treffer.
  function scoreToken(token, hay) {
    if (!hay) return 0;
    if (hay.indexOf(token) !== -1) {
      // exakter Teilstring; Präfix eines Wortes wird stärker gewichtet
      return new RegExp("(^|\\s)" + token).test(hay) ? 3 : 2;
    }
    var words = hay.split(" "), best = 0, k = tol(token.length);
    if (k === 0) return 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (Math.abs(w.length - token.length) > k) continue;
      if (lev(token, w) <= k) best = Math.max(best, 1); // fuzzy-Treffer
    }
    return best;
  }

  function search(records, query, options) {
    options = options || {};
    var fields = options.fields || null; // null = alle Felder
    var tokens = tokenize(query);
    if (!tokens.length) return records.slice();

    var out = [];
    for (var r = 0; r < records.length; r++) {
      var rec = records[r];
      var keys = fields || Object.keys(rec);
      var hayParts = [];
      for (var f = 0; f < keys.length; f++) hayParts.push(normalize(rec[keys[f]]));
      var hay = hayParts.join(" ");

      var total = 0, allMatch = true;
      for (var t = 0; t < tokens.length; t++) {
        var sc = scoreToken(tokens[t], hay);
        if (sc === 0) { allMatch = false; break; } // jedes Token muss matchen
        total += sc;
      }
      if (allMatch) out.push({ record: rec, score: total });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.map(function (x) { return x.record; });
  }

  function highlight(text, query) {
    var tokens = tokenize(query);
    if (!tokens.length) return String(text == null ? "" : text);
    var src = String(text == null ? "" : text);
    // einfache, diakritika-unsensitive Markierung exakter Teiltreffer
    var normSrc = normalize(src);
    var ranges = [];
    tokens.forEach(function (tok) {
      var idx = normSrc.indexOf(tok), start = 0;
      while (idx !== -1) {
        ranges.push([idx, idx + tok.length]);
        start = idx + tok.length; idx = normSrc.indexOf(tok, start);
      }
    });
    if (!ranges.length) return src;
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var i = 1; i < ranges.length; i++) {
      var last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i]);
    }
    var html = "", pos = 0;
    merged.forEach(function (r) {
      html += escapeHtml(src.slice(pos, r[0]));
      html += '<mark class="bw-treffer">' + escapeHtml(src.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    html += escapeHtml(src.slice(pos));
    return html;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.bwSearch = { normalize: normalize, search: search, highlight: highlight };
})();
