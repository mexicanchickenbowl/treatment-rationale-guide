"""Local preview + edit server for endo-guide.

Adds password-gated endpoints for in-browser editing:
  GET  /api/auth/status   → {has_password}
  POST /api/auth/set      → {password} (only when none is set yet)
  POST /api/auth/verify   → {password} → {ok}
  POST /api/save-block    → {password, type, oldRaw, newRaw} → rewrites
                            endo-guide.md then runs build.py
"""
from __future__ import annotations
import hashlib
import http.server
import json
import os
import socketserver
import subprocess
import sys
from pathlib import Path

PORT = 8080
HERE = Path(__file__).parent
DIR = str(HERE)
MD = HERE / "endo-guide.md"
PW_FILE = HERE / ".edit-password"
BUILD = HERE / "build.py"


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def has_password() -> bool:
    return PW_FILE.exists() and PW_FILE.read_text(encoding="utf-8").strip() != ""


def verify_password(pw: str) -> bool:
    if not pw or not has_password():
        return False
    return PW_FILE.read_text(encoding="utf-8").strip() == sha256(pw)


def run_build() -> tuple[bool, str]:
    try:
        r = subprocess.run(
            [sys.executable, str(BUILD)],
            cwd=str(HERE), check=True, capture_output=True, timeout=30,
        )
        return True, r.stdout.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return False, (e.stderr or e.stdout or b"").decode("utf-8", errors="replace")[:800]
    except Exception as e:
        return False, repr(e)[:800]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    # ---- helpers ----
    def _json(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 2_000_000:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}

    # ---- routing ----
    def do_GET(self):
        if self.path == "/api/auth/status":
            return self._json(200, {"has_password": has_password()})
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/auth/set":
            return self._handle_auth_set()
        if self.path == "/api/auth/verify":
            return self._handle_auth_verify()
        if self.path == "/api/save-block":
            return self._handle_save_block()
        self.send_error(404, "Not Found")

    # ---- endpoints ----
    def _handle_auth_set(self) -> None:
        body = self._read_json()
        pw = (body.get("password") or "").strip()
        if not pw:
            return self._json(400, {"ok": False, "error": "empty"})
        if has_password():
            return self._json(409, {"ok": False, "error": "already_set"})
        PW_FILE.write_text(sha256(pw), encoding="utf-8")
        try:
            os.chmod(PW_FILE, 0o600)
        except OSError:
            pass
        self._json(200, {"ok": True})

    def _handle_auth_verify(self) -> None:
        body = self._read_json()
        pw = body.get("password") or ""
        self._json(200, {"ok": verify_password(pw)})

    def _handle_save_block(self) -> None:
        body = self._read_json()
        pw = body.get("password") or ""
        if not verify_password(pw):
            return self._json(401, {"ok": False, "error": "unauthorized"})
        btype = body.get("type") or ""
        old_raw = body.get("oldRaw") or ""
        new_text = (body.get("newText") or "").strip()
        if not old_raw or not new_text:
            return self._json(400, {"ok": False, "error": "missing_fields"})

        # Build new raw source for this block type
        new_text = new_text.replace("\r\n", "\n").replace("\r", "\n")
        if btype == "p":
            new_raw = " ".join(s.strip() for s in new_text.split("\n") if s.strip())
        elif btype == "h3":
            new_raw = "### " + new_text.split("\n", 1)[0].strip()
        elif btype == "h4":
            new_raw = "#### " + new_text.split("\n", 1)[0].strip()
        else:
            return self._json(400, {"ok": False, "error": "unsupported_type"})

        if not new_raw.strip():
            return self._json(400, {"ok": False, "error": "empty"})

        md = MD.read_text(encoding="utf-8")
        count = md.count(old_raw)
        if count == 0:
            return self._json(404, {"ok": False, "error": "not_found"})
        if count > 1:
            return self._json(409, {"ok": False, "error": "ambiguous"})

        updated = md.replace(old_raw, new_raw, 1)
        if updated == md:
            return self._json(500, {"ok": False, "error": "no_change"})

        MD.write_text(updated, encoding="utf-8")
        ok, detail = run_build()
        if not ok:
            # Roll back the markdown change so the repo stays consistent
            MD.write_text(md, encoding="utf-8")
            return self._json(500, {"ok": False, "error": "build_failed", "detail": detail})
        self._json(200, {"ok": True, "newRaw": new_raw})


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main() -> None:
    with ThreadingHTTPServer(("", PORT), Handler) as httpd:
        print(f"Serving {DIR} at http://localhost:{PORT}")
        print(f"Password file: {PW_FILE} (exists={PW_FILE.exists()})")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
