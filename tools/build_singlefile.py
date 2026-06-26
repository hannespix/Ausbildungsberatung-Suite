#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_singlefile.py — erzeugt eine offline lauffähige Einzeldatei.

Nimmt index.html + bw-theme.css + assets/ und schreibt dist/index.html mit:
  - bw-theme.css inline (<style>)
  - @font-face-URLs als base64 data:-URLs
  - <img>/Favicon-Assets als base64 data:-URLs
Keine externen Requests mehr -> tauglich für Zero-Trust-Arbeitsrechner.

Aufruf:  python tools/build_singlefile.py
Nur Python-Standardbibliothek, keine Abhängigkeiten.
"""
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("image/x-icon", ".ico")


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def inline_css_urls(css: str, base: Path) -> str:
    """url("assets/..") in CSS durch data:-URLs ersetzen."""
    def repl(m):
        raw = m.group(1).strip('\'"')
        if raw.startswith(("data:", "http:", "https:")):
            return m.group(0)
        asset = (base / raw).resolve()
        if not asset.exists():
            print(f"  ! fehlt (übersprungen): {raw}")
            return m.group(0)
        return f'url("{data_uri(asset)}")'
    return re.sub(r'url\(([^)]+)\)', repl, css)


def inline_html_assets(html: str, base: Path) -> str:
    """src/href auf lokale Bilder durch data:-URLs ersetzen."""
    def repl(m):
        attr, q, raw = m.group(1), m.group(2), m.group(3)
        if raw.startswith(("data:", "http:", "https:", "#", "mailto:")):
            return m.group(0)
        asset = (base / raw).resolve()
        if not asset.exists() or asset.suffix.lower() not in {
            ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"
        }:
            return m.group(0)
        return f'{attr}={q}{data_uri(asset)}{q}'
    return re.sub(r'\b(src|href)=(["\'])([^"\']+)\2', repl, html)


def inline_scripts(html: str, base: Path) -> str:
    """<script src="lokal.js"></script> durch Inline-Skript ersetzen.
    ES-Module (type="module", z.B. db.js mit import) werden übersprungen —
    sie brauchen einen Bundler bzw. vendored PGlite (siehe CLAUDE.md)."""
    def repl(m):
        tag, src = m.group(0), m.group(2)
        if 'type="module"' in tag or "type='module'" in tag:
            print(f"  i übersprungen (ES-Modul): {src}")
            return tag
        if src.startswith(("http:", "https:", "data:")):
            return tag
        js = (base / src).resolve()
        if not js.exists():
            return tag
        code = js.read_text(encoding="utf-8").replace("</script>", "<\\/script>")
        return f"<script>\n{code}\n</script>"
    return re.sub(r'<script\b[^>]*\bsrc=(["\'])([^"\']+)\1[^>]*>\s*</script>', repl, html)


def main():
    index = ROOT / "index.html"
    theme = ROOT / "bw-theme.css"
    html = index.read_text(encoding="utf-8")

    # 1) Theme inline (mit base64-Fonts)
    css = inline_css_urls(theme.read_text(encoding="utf-8"), ROOT)
    html = re.sub(
        r'<link[^>]+href=["\']bw-theme\.css["\'][^>]*>',
        f"<style>\n{css}\n</style>",
        html,
        count=1,
    )

    # 2) Manifest-Link entfernen (Offline-Einzeldatei braucht kein PWA-Manifest)
    html = re.sub(r'\s*<link[^>]+rel=["\']manifest["\'][^>]*>', "", html)

    # 3) Bilder/Favicons inline
    html = inline_html_assets(html, ROOT)

    # 4) Lokale Skripte inline (ES-Module ausgenommen)
    html = inline_scripts(html, ROOT)

    DIST.mkdir(exist_ok=True)
    out = DIST / "index.html"
    out.write_text(html, encoding="utf-8")
    kb = out.stat().st_size / 1024
    print(f"OK  -> {out}  ({kb:.0f} KB)")
    print("Offline lauffähig (keine externen Requests). Per Doppelklick öffnen.")


if __name__ == "__main__":
    main()
