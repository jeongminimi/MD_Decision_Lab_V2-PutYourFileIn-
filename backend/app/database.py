import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from fastapi import Request


class Base(DeclarativeBase):
    pass


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./md_decision_lab.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request):
    factory = getattr(request.state, "workspace_factory", None)
    if factory is None and request.app.state.hosting.mode != "local":
        raise RuntimeError("A hosted request must have a verified workspace")
    db = (factory or SessionLocal)()
    try:
        yield db
    finally:
        db.close()


def ensure_schema_compatibility(target_engine=None):
    from sqlalchemy import text
    target = target_engine or engine
    with target.connect() as conn:
        tables = [row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()]
        for table in ("work_product_inputs", "work_input_snapshots"):
            if table in tables:
                cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
                for col_name, col_type in (("inbound_date", "DATE"), ("opening_stock", "INTEGER"),
                                           ("opening_date", "DATE"), ("received_units", "INTEGER")):
                    if col_name not in cols:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))
        if "work_decisions" in tables:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(work_decisions)")).fetchall()}
            if "comparison_snapshot" not in cols:
                conn.execute(text("ALTER TABLE work_decisions ADD COLUMN comparison_snapshot JSON"))
        conn.commit()
