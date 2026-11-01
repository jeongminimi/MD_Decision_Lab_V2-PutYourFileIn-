"""Choose an independent SQLite database for every verified user or demo session.

All existing routers use get_db, so the separation also covers legacy APIs and
numeric dataset/decision IDs. No owner IDs supplied by clients are trusted.
"""

import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from .database import Base, ensure_schema_compatibility
from .hosting_config import HostingSettings


COOKIE = "md_demo_session"
MAX_BODY = 32 * 1024 * 1024


@dataclass(frozen=True)
class Identity:
    key: str
    user_id: str | None = None
    email: str | None = None


async def verify_supabase(token: str, settings: HostingSettings) -> Identity:
    """Ask Supabase Auth to verify the bearer token; never decode an unsigned JWT."""
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=False) as client:
            response = await client.get(f"{settings.supabase_url}/auth/v1/user", headers={
                "apikey": settings.supabase_key, "Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise HTTPException(503, "로그인 서버 연결을 확인해 주세요. 잠시 후 다시 시도하세요.") from exc
    if response.status_code in {401, 403}:
        raise HTTPException(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.")
    if response.status_code != 200:
        raise HTTPException(503, "로그인 서버가 응답하지 않습니다. 잠시 후 다시 시도하세요.")
    try:
        user = response.json()
        user_id = str(UUID(user["id"]))
        if user.get("is_anonymous") or not user.get("email_confirmed_at"):
            raise ValueError("A verified email account is required")
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(401, "이메일 인증을 완료한 계정으로 로그인해 주세요.") from exc
    return Identity(key="user:" + user_id, user_id=user_id, email=user.get("email"))


class WorkspaceStore:
    def __init__(self, settings: HostingSettings):
        self.settings = settings
        self.lock = threading.RLock()
        permissions = {"mode": 0o700} if os.name != "nt" else {}
        self.settings.data_dir.mkdir(parents=True, exist_ok=True, **permissions)
        (self.settings.data_dir / "guests").mkdir(exist_ok=True, **permissions)
        (self.settings.data_dir / "users").mkdir(exist_ok=True, **permissions)

    def path(self, identity: Identity) -> Path:
        # Filenames never include cookie text, email, query parameters or client IDs.
        name = hashlib.sha256(identity.key.encode()).hexdigest()
        return self.settings.data_dir / ("users" if identity.user_id else "guests") / f"{name}.db"

    def new_guest(self) -> tuple[Identity, str]:
        issued = int(time.time())
        nonce = secrets.token_hex(24)
        payload = f"{issued}.{nonce}"
        signature = hmac.new(self.settings.session_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return Identity(key="guest:" + nonce), f"{payload}.{signature}"

    def parse_guest(self, cookie: str) -> Identity | None:
        try:
            issued, nonce, signature = cookie.split(".")
            if len(nonce) != 48 or not all(ch in "0123456789abcdef" for ch in nonce):
                return None
            age = time.time() - int(issued)
            expected = hmac.new(self.settings.session_secret.encode(), f"{issued}.{nonce}".encode(), hashlib.sha256).hexdigest()
            if not 0 <= age <= self.settings.guest_ttl or not hmac.compare_digest(signature, expected):
                return None
            return Identity(key="guest:" + nonce)
        except (ValueError, TypeError):
            return None

    def open(self, identity: Identity):
        path = self.path(identity)
        with self.lock:
            if not path.exists() and not identity.user_id:
                now = time.time()
                # Only expired demo databases are removed; account databases are retained.
                for candidate in path.parent.glob("*.db"):
                    if now - candidate.stat().st_mtime > self.settings.guest_ttl:
                        try:
                            candidate.unlink(missing_ok=True)
                        except OSError:
                            pass  # Leave workspaces that are in use alone.
                if sum(1 for _ in path.parent.glob("*.db")) >= self.settings.max_guests:
                    raise HTTPException(503, "현재 데모 이용자가 많습니다. 잠시 후 다시 접속해 주세요.")
            if path.exists() and path.stat().st_size > self.settings.max_db_bytes:
                raise HTTPException(413, "작업공간 용량 한도에 도달했습니다. 관리자에게 문의해 주세요.")
            fresh = not path.exists()
            engine = create_engine(f"sqlite:///{path.as_posix()}",
                                   connect_args={"check_same_thread": False, "timeout": 20}, poolclass=NullPool)
            factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
            if fresh:
                try:
                    Base.metadata.create_all(engine)
                    ensure_schema_compatibility(engine)
                    from .services.seed import seed_demo_data
                    from .services.public_demo import seed_public_demo
                    with factory() as db:
                        seed_demo_data(db)
                        seed_public_demo(db)
                except Exception:
                    engine.dispose()
                    path.unlink(missing_ok=True)
                    raise
        return factory, engine


class WorkspaceMiddleware:
    def __init__(self, app, settings: HostingSettings, store: WorkspaceStore):
        self.app, self.settings, self.store = app, settings, store
        self.rate = defaultdict(deque)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/") or scope["path"] in {
                "/api/health", "/api/runtime"} or scope["path"].startswith("/api/templates/") or scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        engine = None
        try:
            # Cookies only authorize same-origin writes. CORS alone does not stop CSRF.
            if scope["method"] not in {"GET", "HEAD", "OPTIONS"}:
                origin = headers.get("origin")
                local_origin = f"{scope.get('scheme', 'http')}://{headers.get('host', '')}"
                permitted = {self.settings.public_origin or local_origin, *self.settings.cors_origins}
                if (origin and origin not in permitted) or headers.get("sec-fetch-site") == "cross-site":
                    raise HTTPException(403, "허용된 서비스 주소에서 요청해 주세요.")
            if int(headers.get("content-length", "0")) > MAX_BODY:
                raise HTTPException(413, "요청 파일의 전체 크기는 32MB 이하여야 합니다.")
            authorization = headers.get("authorization", "")
            cookie_value = None
            if authorization:
                if not authorization.startswith("Bearer ") or not 1 <= len(authorization[7:]) <= 8192:
                    raise HTTPException(401, "로그인 정보를 확인해 주세요.")
                if self.settings.mode != "private":
                    raise HTTPException(401, "현재 배포는 공개 데모 모드입니다.")
                identity = await verify_supabase(authorization[7:], self.settings)
            else:
                from http.cookies import SimpleCookie
                cookies = SimpleCookie()
                try:
                    cookies.load(headers.get("cookie", ""))
                except Exception:
                    pass
                value = cookies[COOKIE].value if COOKIE in cookies else ""
                identity = self.store.parse_guest(value)
                if identity is None:
                    identity, cookie_value = self.store.new_guest()
            if not identity.user_id and not self.settings.allow_guest_uploads and (scope["path"].startswith("/api/import/") or
                    scope["path"].endswith("/upload") or scope["path"].endswith("/sales/import")):
                raise HTTPException(401, "자기 파일을 올리려면 로그인해 주세요. 데모 상품의 입력·비교·판단 저장은 바로 사용할 수 있습니다.")
            if scope["path"].startswith("/api/work/sim/import-sample"):
                raise HTTPException(403, "H&M 원본과 운영 사례 연결은 개인 PC의 로컬 모드에서 사용하세요.")
            # Bound memory as well as requests. Keys contain no credentials.
            now = time.monotonic()
            if len(self.rate) >= 1000:
                self.rate = defaultdict(deque, {k: v for k, v in self.rate.items() if v and v[-1] > now - 60})
                if identity.key not in self.rate and len(self.rate) >= 1000:
                    raise HTTPException(429, "현재 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
            recent = self.rate[identity.key]
            while recent and recent[0] <= now - 60:
                recent.popleft()
            if len(recent) >= 120:
                raise HTTPException(429, "요청이 많습니다. 1분 뒤 다시 시도하세요.")
            recent.append(now)
            factory, engine = await run_in_threadpool(self.store.open, identity)
            scope.setdefault("state", {}).update(workspace_factory=factory, identity=identity)
        except (HTTPException, ValueError) as exc:
            status = exc.status_code if isinstance(exc, HTTPException) else 400
            detail = exc.detail if isinstance(exc, HTTPException) else "요청 형식을 확인해 주세요."
            return await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_BODY:
                    raise HTTPException(413, "요청 파일의 전체 크기는 32MB 이하여야 합니다.")
            return message

        async def private_send(message):
            if message["type"] == "http.response.start":
                extra = [(b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff")]
                if cookie_value:
                    cookie = f"{COOKIE}={cookie_value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={self.settings.guest_ttl}"
                    if self.settings.cookie_secure:
                        cookie += "; Secure"
                    extra.append((b"set-cookie", cookie.encode()))
                message = {**message, "headers": list(message.get("headers", [])) + extra}
            await send(message)

        try:
            await self.app(scope, limited_receive, private_send)
        finally:
            engine.dispose()
