#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_offline.py — stellt sicher, dass das Tool vollständig offline läuft.

Durchsucht HTML/CSS/JS/Manifest nach externen Lade-Referenzen (CDN, Web-Fonts,
remote import/fetch). Findet das Skript welche, endet es mit Exit-Code 1 —
geeignet als CI-Gate. Reine URLs in Kommentaren/Texten lösen keinen Fehler aus,
nur echte Ladekonstrukte.

Aufruf:  python3 tools/check_offline.py
Nur Python-Standardbibliothek.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_SUFFIXES = {".html", ".htm", ".css", ".js", ".mjs", ".webmanifest", ".json"}
SKIP_DIRS = {"dist", "node_modules", ".git", "quellen"}

# Echte Ladekonstrukte mit externer URL -> FEHLER
PATTERNS = [
    (r'src\s*=\s*["\']https?://',                 "externes src (Skript/Bild/iframe)"),
    (r'<link[^>]+href\s*=\s*["\']https?://',      "externes Stylesheet/preload"),
    (r'@import\s+(?:url\()?\s*["\']?https?://',    "CSS @import von extern"),
    (r'url\(\s*["\']?https?://',                   "CSS url() von extern"),
    (r'\bfrom\s*["\']https?://',                   "ES-import von extern (CDN)"),
    (r'\bimport\(\s*["\']https?://',               "dynamischer import von extern"),
    (r'\bfetch\(\s*["\']https?://',                "fetch() gegen extern"),
    (r'new\s+Worker\(\s*["\']https?://',           "Worker von extern"),
    (r'importScripts\(\s*["\']https?://',          "importScripts von extern"),
    (r'"https?://[^"]+\.(?:js|mjs|css|wasm|woff2?)"', "Importmap/Asset-URL extern"),
]
# bekannte CDN-Hosts als zusätzlicher Hinweis
CDN_HINT = re.compile(r'https?://[^\s"\')]*(unpkg|jsdelivr|cdnjs|esm\.sh|googleapis|gstatic|skypack|jspm)', re.I)

# Hartcodierte Farben außerhalb des Themes -> nur Warnung
HEX = re.compile(r'#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b')
HEX_ERLAUBT_DATEI = {"bw-theme.css"}                 # Theme darf Hex definieren
HEX_ERLAUBT_KONTEXT = ('theme-color', 'background_color', 'theme_color')  # PWA/Manifest


def iter_files():
    for p in ROOT.rglob("*"):
        if p.is_dir():
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
            continue
        if p.suffix.lower() in SCAN_SUFFIXES:
            yield p


def main():
    fehler, warnungen = [], []
    for f in iter_files():
        rel = f.relative_to(ROOT)
        try:
            text = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            for pat, beschreibung in PATTERNS:
                if re.search(pat, line, re.I):
                    fehler.append(f"{rel}:{i}  {beschreibung}\n      {line.strip()[:120]}")
            if CDN_HINT.search(line) and not any(re.search(p, line, re.I) for p, _ in PATTERNS):
                warnungen.append(f"{rel}:{i}  CDN-URL erwähnt (prüfen)\n      {line.strip()[:120]}")
            # Hex-Warnung (außerhalb Theme, ohne erlaubten Kontext)
            if f.name not in HEX_ERLAUBT_DATEI and HEX.search(line):
                if not any(k in line for k in HEX_ERLAUBT_KONTEXT):
                    warnungen.append(f"{rel}:{i}  hartcodierte Farbe statt --bw-* Token\n      {line.strip()[:120]}")

    if warnungen:
        print("WARNUNGEN:")
        for w in warnungen:
            print("  • " + w)
        print()

    if fehler:
        print("FEHLER — externe Referenzen gefunden (Tool ist NICHT offline-fähig):")
        for e in fehler:
            print("  ✗ " + e)
        print(f"\n{len(fehler)} Problem(e). Abhängigkeiten lokal vendoren (assets/vendor/).")
        sys.exit(1)

    print("OFFLINE OK — keine externen Lade-Referenzen gefunden.")
    sys.exit(0)


if __name__ == "__main__":
    main()
