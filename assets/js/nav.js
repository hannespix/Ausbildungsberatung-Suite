// nav.js — Hamburger-Navigation, barrierefrei.
// Erwartet: ein Button [data-nav-toggle] mit aria-controls auf die Panel-ID.
(function () {
  function init(toggle) {
    var panel = document.getElementById(toggle.getAttribute("aria-controls"));
    if (!panel) return;

    function setOpen(open) {
      panel.setAttribute("data-open", String(open));
      toggle.setAttribute("aria-expanded", String(open));
    }
    setOpen(false);

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Escape schließt und gibt den Fokus zurück
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // Klick außerhalb schließt
    document.addEventListener("click", function (e) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (!panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
  }

  document.querySelectorAll("[data-nav-toggle]").forEach(init);
})();
