"""Run the built public UI locally, with a stable demo cookie key across restarts."""

import os
import secrets
import sys
from pathlib import Path

import uvicorn


def main():
    backend = Path(__file__).resolve().parents[1]
    root = backend.parent
    data = root / ".local-data" / "preview"
    data.mkdir(parents=True, exist_ok=True)
    key_file = data / ".session-key"
    if not key_file.exists():
        try:
            with key_file.open("x", encoding="utf-8") as handle:
                handle.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    sys.path.insert(0, str(backend))
    os.environ.setdefault("MD_APP_MODE", "demo")
    os.environ.setdefault("MD_SESSION_SECRET", key_file.read_text(encoding="utf-8").strip())
    os.environ.setdefault("MD_DATA_DIR", str(data))
    os.environ.setdefault("MD_ALLOW_GUEST_UPLOADS", "true")
    os.environ.setdefault("MD_COOKIE_SECURE", "false")
    os.environ.setdefault("MD_PUBLIC_ORIGIN", "http://127.0.0.1:5180")
    os.environ.setdefault("MD_SERVE_FRONTEND", "true")
    uvicorn.run("app.main:app", host="127.0.0.1", port=5180)


if __name__ == "__main__":
    main()
