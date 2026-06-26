#!/usr/bin/env python3
"""
Serviço de transcrição "morno": carrega o modelo MLX no 1º uso, mantém quente
durante o uso (reuso automático via ModelHolder) e libera a RAM após ocioso.
Roda com o python do uv tool que tem o mlx_whisper.
"""
import gc
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.environ.get("WAC_WHISPER_MODEL", "mlx-community/whisper-large-v3-mlx")
LANG = os.environ.get("WAC_WHISPER_LANG", "pt")
PORT = int(os.environ.get("WAC_TRANSCRIBE_PORT", "4320"))
IDLE_SECONDS = int(os.environ.get("WAC_TRANSCRIBE_IDLE", "180"))

_lock = threading.Lock()
_last_use = 0.0
_loaded = False


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def _transcribe(path, model, language):
    """Transcreve um arquivo. O modelo fica quente entre chamadas (ModelHolder)."""
    global _last_use, _loaded
    import mlx_whisper  # import preguiçoso: processo fica leve até o 1º uso

    with _lock:
        _last_use = time.time()
        result = mlx_whisper.transcribe(
            path, path_or_hf_repo=model, language=language, task="transcribe"
        )
        _loaded = True
        _last_use = time.time()
        return (result.get("text") or "").strip()


def _unload():
    """Libera o modelo da RAM/GPU."""
    global _loaded
    try:
        from mlx_whisper.transcribe import ModelHolder

        ModelHolder.model = None
        ModelHolder.model_path = None
    except Exception as e:
        log("unload (ModelHolder):", e)
    try:
        import mlx.core as mx

        mx.clear_cache()
    except Exception:
        pass
    gc.collect()
    _loaded = False
    log("🌙 modelo descarregado (ocioso), RAM liberada")


def _watchdog():
    while True:
        time.sleep(30)
        if _loaded and (time.time() - _last_use) > IDLE_SECONDS:
            with _lock:
                if _loaded and (time.time() - _last_use) > IDLE_SECONDS:
                    _unload()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "loaded": _loaded})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            self._send(400, {"error": "json inválido"})
            return

        if self.path != "/transcribe":
            self._send(404, {"error": "not found"})
            return

        path = data.get("path")
        model = data.get("model") or MODEL
        language = data.get("language") or LANG
        if not path or not os.path.isfile(path):
            self._send(400, {"error": "arquivo inexistente: %s" % path})
            return
        try:
            text = _transcribe(path, model, language)
            self._send(200, {"text": text})
        except Exception as e:
            self._send(500, {"error": str(e)})


def main():
    threading.Thread(target=_watchdog, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log(
        "🎧 transcriber em 127.0.0.1:%d (modelo carrega no 1º uso, libera após %ds ocioso)"
        % (PORT, IDLE_SECONDS)
    )
    srv.serve_forever()


if __name__ == "__main__":
    main()
