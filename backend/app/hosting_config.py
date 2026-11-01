"""V2 runtime settings; the original local workflow remains the default."""

import os
import base64
import json
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class HostingSettings:
    mode: str = "local"  # local, demo, private
    data_dir: Path = field(default_factory=lambda: PROJECT_ROOT / ".local-data")
    session_secret: str = ""
    cookie_secure: bool = True
    public_origin: str = ""
    cors_origins: tuple[str, ...] = ()
    serve_frontend: bool = False
    frontend_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "frontend" / "dist")
    supabase_url: str = ""
    supabase_key: str = ""
    allow_guest_uploads: bool = True
    guest_ttl: int = 86400
    max_guests: int = 100
    max_db_bytes: int = 256 * 1024 * 1024

    @classmethod
    def from_env(cls):
        return cls(
            mode=os.getenv("MD_APP_MODE", "local"),
            data_dir=Path(os.getenv("MD_DATA_DIR", str(PROJECT_ROOT / ".local-data"))),
            session_secret=os.getenv("MD_SESSION_SECRET", ""),
            cookie_secure=os.getenv("MD_COOKIE_SECURE", "true").lower() == "true",
            public_origin=os.getenv("MD_PUBLIC_ORIGIN", "").rstrip("/"),
            cors_origins=tuple(x.strip().rstrip("/") for x in os.getenv("MD_CORS_ORIGINS", "").split(",") if x.strip()),
            serve_frontend=os.getenv("MD_SERVE_FRONTEND", "false").lower() == "true",
            frontend_dir=Path(os.getenv("MD_FRONTEND_DIR", str(PROJECT_ROOT / "frontend" / "dist"))),
            supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
            supabase_key=os.getenv("SUPABASE_PUBLISHABLE_KEY", ""),
            allow_guest_uploads=os.getenv("MD_ALLOW_GUEST_UPLOADS", "true").lower() == "true",
            guest_ttl=int(os.getenv("MD_GUEST_TTL_SECONDS", "86400")),
            max_guests=int(os.getenv("MD_MAX_GUEST_WORKSPACES", "100")),
        )

    def validate(self):
        if self.mode not in {"local", "demo", "private"}:
            raise ValueError("MD_APP_MODE must be local, demo or private")
        if self.mode != "local" and len(self.session_secret) < 32:
            raise ValueError("Set MD_SESSION_SECRET to a random value of at least 32 characters")
        if self.mode == "private":
            url = urlsplit(self.supabase_url)
            if url.scheme != "https" or not url.netloc or url.path not in {"", "/"} or url.username or url.query or url.fragment:
                raise ValueError("Set SUPABASE_URL to your HTTPS Supabase project origin")
            if not self.supabase_key or self.supabase_key.startswith("sb_secret_"):
                raise ValueError("Use the Supabase publishable/anon key, never a service-role or secret key")
            if not self.supabase_key.startswith("sb_publishable_"):
                try:
                    payload = self.supabase_key.split(".")[1]
                    if json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))).get("role") != "anon":
                        raise ValueError("Not an anon key")
                except (IndexError, ValueError, TypeError) as exc:
                    raise ValueError("Only a Supabase publishable key or legacy anon key is allowed") from exc
        for origin in (*self.cors_origins, *((self.public_origin,) if self.public_origin else ())):
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
                raise ValueError("Origins must be full http(s) origins without paths or wildcards")
        if self.max_guests < 1 or self.guest_ttl < 60:
            raise ValueError("Guest capacity and retention must be positive")
