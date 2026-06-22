"""Render build script: download Argos language model packages."""
import os, sys

os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")
os.environ.setdefault("ARGOS_DEVICE", "cpu")

# Create local data dir
from pathlib import Path
LOCAL = Path(__file__).resolve().parent.parent / ".argos-local"
LOCAL.mkdir(parents=True, exist_ok=True)
(LOCAL / "data").mkdir(exist_ok=True)
(LOCAL / "config").mkdir(exist_ok=True)
(LOCAL / "cache").mkdir(exist_ok=True)

os.environ["XDG_DATA_HOME"] = str(LOCAL / "data")
os.environ["XDG_CONFIG_HOME"] = str(LOCAL / "config")
os.environ["XDG_CACHE_HOME"] = str(LOCAL / "cache")

import argostranslate.package as pkg

print("Updating package index...")
pkg.update_package_index()

available = pkg.get_available_packages()
print(f"Found {len(available)} available packages")

# Install English <-> Chinese models
targets = ["translate-en_zh-1_9", "translate-zh_en-1_9"]
for p in available:
    pkg_name = p.package_path.name if hasattr(p, 'package_path') else str(p)
    for target in targets:
        if target in str(p):
            print(f"Installing {p}...")
            pkg.install_from_package_index(p)
            print(f"  Done: {p}")
            break

print("Model download complete.")
