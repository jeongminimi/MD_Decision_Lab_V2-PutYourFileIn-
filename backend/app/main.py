from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy import text

from . import models  # noqa: F401 — registers SQLAlchemy metadata
from .api.routes import router
from .api.work_routes import router as work_router
from .api.hm_sim_routes import router as hm_sim_router
from .api.catalog_routes import router as catalog_router
from .api.peer_routes import router as peer_router
from .database import Base, SessionLocal, engine, ensure_schema_compatibility, get_db
from .services.seed import seed_demo_data
from .services.public_demo import seed_public_demo
from .hosting_config import HostingSettings
from .workspace_hosting import WorkspaceMiddleware, WorkspaceStore


def create_app(settings: HostingSettings | None = None):
    settings = settings or HostingSettings.from_env()
    settings.validate()

    def init_local():
        Base.metadata.create_all(bind=engine)
        ensure_schema_compatibility(engine)
        with SessionLocal() as db:
            seed_demo_data(db)
            seed_public_demo(db)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.mode == "local":
            await run_in_threadpool(init_local)
        yield

    app = FastAPI(title="MD Decision Lab API", version="0.2.0", lifespan=lifespan,
                  docs_url="/docs" if settings.mode == "local" else None,
                  redoc_url="/redoc" if settings.mode == "local" else None,
                  openapi_url="/openapi.json" if settings.mode == "local" else None)
    app.state.hosting = settings
    if settings.mode != "local":
        store = WorkspaceStore(settings)
        app.state.workspaces = store
        app.add_middleware(WorkspaceMiddleware, settings=settings, store=store)
    app.add_middleware(CORSMiddleware,
        allow_origins=list(settings.cors_origins) + ([settings.public_origin] if settings.public_origin else []) + (
            ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174",
             "http://localhost:5180", "http://127.0.0.1:5180"] if settings.mode == "local" else []),
        allow_credentials=True, allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"])
    app.include_router(router)
    app.include_router(work_router)
    app.include_router(hm_sim_router)
    app.include_router(catalog_router)
    app.include_router(peer_router)

    @app.get("/api/runtime")
    def runtime():
        return {"mode": settings.mode, "auth_enabled": settings.mode == "private",
                "guest_uploads_enabled": settings.allow_guest_uploads,
                "guest_ttl_seconds": settings.guest_ttl,
                "supabase_url": settings.supabase_url if settings.mode == "private" else None,
                "supabase_key": settings.supabase_key if settings.mode == "private" else None}

    @app.get("/api/me")
    def me(request: Request):
        identity = getattr(request.state, "identity", None)
        return {"mode": settings.mode, "user_id": identity.user_id if identity else None,
                "email": identity.email if identity else None,
                "can_upload": settings.mode == "local" or settings.allow_guest_uploads or bool(identity and identity.user_id)}

    @app.get("/api/templates/{kind}")
    def upload_template(kind: str):
        templates = {"products": "company_products_template.csv", "sales": "company_sales_template.csv"}
        if kind not in templates:
            raise HTTPException(404, "파일 양식을 찾을 수 없습니다.")
        from .hosting_config import PROJECT_ROOT
        return FileResponse(PROJECT_ROOT / "sample_data" / templates[kind],
                            media_type="text/csv; charset=utf-8", filename=templates[kind])

    @app.post("/api/workspace/reset")
    def reset_guest(request: Request, db=Depends(get_db)):
        identity = getattr(request.state, "identity", None)
        if settings.mode == "local" or identity is None or identity.user_id:
            raise HTTPException(403, "임시 작업공간에서만 사용할 수 있습니다.")
        db.execute(text("PRAGMA secure_delete = ON"))
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
        seed_demo_data(db)
        seed_public_demo(db)
        return {"reset": True}

    if settings.serve_frontend:
        if not (settings.frontend_dir / "index.html").is_file():
            raise ValueError("Build frontend/dist before enabling MD_SERVE_FRONTEND")
        if (settings.frontend_dir / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=settings.frontend_dir / "assets"), name="assets")

        @app.get("/")
        def frontend():
            return FileResponse(settings.frontend_dir / "index.html", headers={"Cache-Control": "no-cache"})
    else:
        @app.get("/")
        def root():
            return {"name": "MD Decision Lab API", "mode": settings.mode}
    return app


app = create_app()
