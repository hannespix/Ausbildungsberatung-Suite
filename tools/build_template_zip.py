#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_template_zip.py — packt diese Vorlage in eine Download-ZIP.

Erzeugt im Repo-Wurzelverzeichnis `rpf-browsertool-vorlage.zip` mit dem
kompletten Vorlagen-Inhalt (Theme, Assets, JS, Tools, Workflows, Doku) unter
einem Oberordner `rpf-browsertool-vorlage/`. Diese ZIP liegt zum Download im
Repo und dient als Startpunkt für ein neues Tool-Repo (siehe README,
"Neues Arbeits-Repo aus dieser Vorlage erstellen").

Ausgeschlossen: Git-Historie, Build-Ausgabe (dist/), die ZIP selbst, Caches,
Editor-/OS-Müll und potenzielle Geheimnisse.

Die ZIP ist reproduzierbar (feste Zeitstempel, sortierte Reihenfolge) — ein
erneuter Lauf ohne inhaltliche Änderung erzeugt dieselbe Datei, also keinen
unnötigen Binär-Diff.

Aufruf:  python3 tools/build_template_zip.py
Nur Python-Standardbibliothek, keine Abhängigkeiten.
"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_NAME = "rpf-browsertool-vorlage.zip"
ARCHIVE_PREFIX = "rpf-browsertool-vorlage"
OUTPUT = ROOT / OUTPUT_NAME

EXCLUDE_DIRS = {".git", "dist", "node_modules", "__pycache__", ".idea", ".vscode"}
EXCLUDE_NAMES = {OUTPUT_NAME, ".DS_Store", "Thumbs.db"}
EXCLUDE_SUFFIXES = {".swp", ".pyc", ".key", ".pem"}
# feste Zeit (1980-01-01 00:00:00) -> reproduzierbares Archiv
FIXED_DATE = (1980, 1, 1, 0, 0, 0)


def einbeziehen(rel: Path) -> bool:
    if any(part in EXCLUDE_DIRS for part in rel.parts):
        return False
    if rel.name in EXCLUDE_NAMES or rel.name == ".env":
        return False
    if rel.suffix.lower() in EXCLUDE_SUFFIXES:
        return False
    return True


def main():
    dateien = sorted(
        p.relative_to(ROOT)
        for p in ROOT.rglob("*")
        if p.is_file() and einbeziehen(p.relative_to(ROOT))
    )

    # vorhandene ZIP zuerst entfernen (deterministische Neuerzeugung)
    if OUTPUT.exists():
        OUTPUT.unlink()

    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel in dateien:
            info = zipfile.ZipInfo(f"{ARCHIVE_PREFIX}/{rel.as_posix()}")
            info.date_time = FIXED_DATE
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16  # reguläre Datei, rw-r--r--
            zf.writestr(info, (ROOT / rel).read_bytes())

    kb = OUTPUT.stat().st_size / 1024
    print(f"OK  -> {OUTPUT}  ({kb:.0f} KB, {len(dateien)} Dateien)")
    print(f"Oberordner im Archiv: {ARCHIVE_PREFIX}/")


if __name__ == "__main__":
    main()
