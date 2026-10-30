"""Test-only temporary folders that inherit Windows workspace permissions."""

import shutil
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


@contextmanager
def workspace_temp():
    path = Path(__file__).resolve().parents[1] / "test_run_tmp" / uuid4().hex
    path.mkdir(parents=True)
    try:
        yield str(path)
    finally:
        shutil.rmtree(path)
