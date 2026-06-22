from __future__ import annotations

import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

LOCAL_ARGOS_HOME = PROJECT_ROOT / ".argos-local"
os.environ.setdefault("XDG_DATA_HOME", str(LOCAL_ARGOS_HOME / "data"))
os.environ.setdefault("XDG_CONFIG_HOME", str(LOCAL_ARGOS_HOME / "config"))
os.environ.setdefault("XDG_CACHE_HOME", str(LOCAL_ARGOS_HOME / "cache"))
os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")

import argostranslate.package  # noqa: E402


def install_pair(from_code: str = "en", to_code: str = "zh") -> None:
    argostranslate.package.update_package_index()
    packages = argostranslate.package.get_available_packages()
    package = next(
        pkg for pkg in packages if pkg.from_code == from_code and pkg.to_code == to_code
    )
    download_path = package.download()
    argostranslate.package.install_from_path(download_path)
    print(f"Installed {from_code}->{to_code}: {package}")


if __name__ == "__main__":
    from_code = sys.argv[1] if len(sys.argv) > 1 else "en"
    to_code = sys.argv[2] if len(sys.argv) > 2 else "zh"
    install_pair(from_code, to_code)
