from __future__ import annotations

import sys
import os
from pathlib import Path
from time import perf_counter

from flask import Flask, jsonify, render_template, request


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

LOCAL_ARGOS_HOME = PROJECT_ROOT / ".argos-local"
os.environ.setdefault("XDG_DATA_HOME", str(LOCAL_ARGOS_HOME / "data"))
os.environ.setdefault("XDG_CONFIG_HOME", str(LOCAL_ARGOS_HOME / "config"))
os.environ.setdefault("XDG_CACHE_HOME", str(LOCAL_ARGOS_HOME / "cache"))
os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")


app = Flask(__name__)


FALLBACK_LANGUAGES = [
    {"code": "en", "name": "English"},
    {"code": "zh", "name": "Chinese"},
    {"code": "es", "name": "Spanish"},
    {"code": "fr", "name": "French"},
    {"code": "de", "name": "German"},
    {"code": "ja", "name": "Japanese"},
    {"code": "ko", "name": "Korean"},
]

DEMO_PHRASES = {
    ("en", "zh"): {
        "hello": "你好",
        "hello world": "你好，世界",
        "good morning": "早上好",
        "thank you": "谢谢",
        "argos translate is an open-source offline translation library.": "Argos Translate 是一个开源离线翻译库。",
    },
    ("zh", "en"): {
        "你好": "Hello",
        "你好，世界": "Hello, world",
        "早上好": "Good morning",
        "谢谢": "Thank you",
        "argos translate 是一个开源离线翻译库。": "Argos Translate is an open-source offline translation library.",
    },
    ("en", "es"): {
        "hello": "Hola",
        "hello world": "Hola, mundo",
        "good morning": "Buenos dias",
        "thank you": "Gracias",
    },
    ("en", "fr"): {
        "hello": "Bonjour",
        "hello world": "Bonjour le monde",
        "good morning": "Bonjour",
        "thank you": "Merci",
    },
}


def argos_runtime():
    try:
        import ctranslate2  # noqa: F401
        import argostranslate.translate as translate
    except Exception as exc:
        return None, str(exc)
    return translate, None


def installed_language_payload():
    translate, error = argos_runtime()
    if translate is None:
        return FALLBACK_LANGUAGES, False, error

    try:
        languages = translate.get_installed_languages()
    except Exception as exc:
        return FALLBACK_LANGUAGES, False, str(exc)

    if not languages:
        return FALLBACK_LANGUAGES, False, "No Argos language packages are installed."

    return (
        [{"code": language.code, "name": language.name} for language in languages],
        True,
        None,
    )


def demo_translate(text, source, target):
    normalized = " ".join(text.strip().lower().split())
    phrase = DEMO_PHRASES.get((source, target), {}).get(normalized)
    if phrase:
        return phrase

    if source == target:
        return text

    target_name = next(
        (language["name"] for language in FALLBACK_LANGUAGES if language["code"] == target),
        target.upper(),
    )
    return (
        "[演示模式]\n"
        f"请安装 {source}->{target} Argos 模型包以启用这组语言的离线翻译。\n\n"
        f"目标语言: {target_name}\n"
        f"原文:\n{text}"
    )


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/status")
def status():
    languages, ready, error = installed_language_payload()
    return jsonify(
        {
            "ready": ready,
            "languages": languages,
            "engine": "Argos Translate" if ready else "Demo mode",
            "detail": "离线翻译已就绪。"
            if ready
            else error
            or "请安装 Argos 运行依赖和语言模型包以启用离线翻译。",
        }
    )


@app.post("/api/translate")
def translate_text():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    source = payload.get("source") or "en"
    target = payload.get("target") or "zh"

    if not text:
        return jsonify({"error": "请输入要翻译的文本。"}), 400

    started = perf_counter()
    translate, runtime_error = argos_runtime()

    if translate is not None:
        try:
            result = translate.translate(text, source, target)
            return jsonify(
                {
                    "translatedText": result,
                    "engine": "Argos Translate",
                    "mode": "offline",
                    "elapsedMs": round((perf_counter() - started) * 1000),
                }
            )
        except Exception as exc:
            runtime_error = str(exc)

    return jsonify(
        {
            "translatedText": demo_translate(text, source, target),
            "engine": "Demo mode",
            "mode": "demo",
            "detail": runtime_error,
            "elapsedMs": round((perf_counter() - started) * 1000),
        }
    )


if __name__ == "__main__":
    import os as _os
    port = int(_os.environ.get("PORT", 5055))
    host = "0.0.0.0" if _os.environ.get("RENDER") else "127.0.0.1"
    app.run(host=host, port=port, debug=False, use_reloader=False)
