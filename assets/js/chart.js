// chart.js — minimaler, CI-konformer SVG-Diagramm-Helper (keine externe Lib).
// Setzt die Infografik-Regeln des Landes-CD um: Grauabstufungen als Basis,
// BaWü Gelb nur zur Hervorhebung EINES Werts (mit dunkler Outline), abgerundete
// Ecken, klare Trennung, Achsen/Labels in Grau. Für einfache Diagramme genügt
// dieser Helper; für komplexe Charts eine lokal vendored Bibliothek verwenden
// (kein CDN) und Farben/Optik per Theme erzwingen.
//
// API: bwChart.bars(el, [{label, value, highlight?}], {max, einheit})
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var GREYS = ["--bw-cat-1", "--bw-cat-2", "--bw-cat-3", "--bw-cat-4", "--bw-cat-5", "--bw-cat-6"];

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function bars(target, data, opts) {
    opts = opts || {};
    var W = 640, H = 280, padL = 48, padB = 40, padT = 12, padR = 12;
    var max = opts.max || Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    var n = data.length;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var bw = plotW / n;

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "bw-chart", role: "img" });
    svg.setAttribute("aria-label", opts.titel || "Balkendiagramm");

    // y-Achse + drei Gitterlinien
    for (var g = 0; g <= 2; g++) {
      var yv = max * g / 2, y = padT + plotH - (yv / max) * plotH;
      svg.appendChild(el("line", { class: "grid", x1: padL, y1: y, x2: W - padR, y2: y }));
      var t = el("text", { class: "label label--muted", x: padL - 6, y: y + 4, "text-anchor": "end", "font-size": 11 });
      t.textContent = Math.round(yv).toLocaleString("de-DE");
      svg.appendChild(t);
    }

    data.forEach(function (d, i) {
      var h = (d.value / max) * plotH;
      var x = padL + i * bw + 4;
      var y = padT + plotH - h;
      var w = Math.max(1, bw - 8);
      var rect = el("rect", {
        x: x, y: y, width: w, height: Math.max(0, h),
        rx: 3, ry: 3,
        class: "bar" + (d.highlight ? " bar--highlight" : "")
      });
      if (!d.highlight) {
        // Basisfarbe aus der kategorialen Grau-/Nebenfarbenreihe
        rect.setAttribute("fill", "var(" + GREYS[i % GREYS.length] + ")");
      }
      svg.appendChild(rect);

      var lab = el("text", { class: "label", x: x + w / 2, y: H - padB + 16, "text-anchor": "middle", "font-size": 11 });
      lab.textContent = d.label;
      svg.appendChild(lab);
    });

    target.innerHTML = "";
    target.appendChild(svg);
    return svg;
  }

  window.bwChart = { bars: bars };
})();
