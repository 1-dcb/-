from __future__ import annotations

import traceback

from webapp.app import argos_runtime


translate, runtime_error = argos_runtime()
print("runtime_error:", runtime_error)

try:
    print(translate.translate("Hello world", "en", "zh"))
except Exception:
    traceback.print_exc()
