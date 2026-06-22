"""Render build script: download exactly en<->zh Argos language model packages."""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

LOCAL_ARGOS_HOME = PROJECT_ROOT / ".argos-local"
LOCAL_ARGOS_HOME.mkdir(parents=True, exist_ok=True)
(LOCAL_ARGOS_HOME / "data").mkdir(exist_ok=True)
(LOCAL_ARGOS_HOME / "config").mkdir(exist_ok=True)
(LOCAL_ARGOS_HOME / "cache").mkdir(exist_ok=True)

os.environ.setdefault("XDG_DATA_HOME", str(LOCAL_ARGOS_HOME / "data"))
os.environ.setdefault("XDG_CONFIG_HOME", str(LOCAL_ARGOS_HOME / "config"))
os.environ.setdefault("XDG_CACHE_HOME", str(LOCAL_ARGOS_HOME / "cache"))
os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")

import argostranslate.package

print("Updating package index...")
argostranslate.package.update_package_index()

available = argostranslate.package.get_available_packages()
print(f"Package index has {len(available)} entries")

# Install ONLY en->zh and zh->en
for pair in [("en", "zh"), ("zh", "en")]:
    from_code, to_code = pair
    try:
        pkg = next(p for p in available if p.from_code == from_code and p.to_code == to_code)
        print(f"Downloading {pkg}...")
        path = pkg.download()
        argostranslate.package.install_from_path(path)
        print(f"  Installed {from_code}->{to_code} OK")
    except StopIteration:
        print(f"  WARNING: no package found for {from_code}->{to_code}")
    except Exception as e:
        print(f"  ERROR installing {from_code}->{to_code}: {e}")

# Verify
import argostranslate.translate
langs = argostranslate.translate.get_installed_languages()
print(f"Installed languages: {[f'{l.code}({l.name})' for l in langs]}")
print("Model download complete.")
