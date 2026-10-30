"""Seed the tracked synthetic CSV files exactly once per new workspace."""

import asyncio
import io
from datetime import date
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import WorkDataset


DEMO_DIR = Path(__file__).resolve().parents[3] / "sample_data" / "public_demo"


def seed_public_demo(db: Session):
    if db.scalar(select(WorkDataset.id).limit(1)) is not None:
        return
    # Reuse the existing validated upload workflow; analytical formulas are unchanged.
    from ..api.work_routes import upload_dataset

    return asyncio.run(upload_dataset(
        name="가상 의류 데모", snapshot_date=date(2026, 8, 31),
        complete_calendar=True, synthetic=True,
        products_file=UploadFile(filename="products.csv", file=io.BytesIO((DEMO_DIR / "products.csv").read_bytes())),
        sales_file=UploadFile(filename="sales.csv", file=io.BytesIO((DEMO_DIR / "sales.csv").read_bytes())),
        db=db,
    ))
