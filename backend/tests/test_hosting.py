"""Exercise real HTTP routes, database files, restart persistence and account boundaries."""

import asyncio
import base64
import json
import shutil
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.hosting_config import HostingSettings
from app.main import create_app
from app.workspace_hosting import COOKIE, Identity, verify_supabase
from tests.test_work_workspace import PRODUCTS, SALES


class HostingTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parent / ".hosting_runs" / uuid4().hex
        self.root.mkdir(parents=True)
        self.settings = HostingSettings(mode="demo", data_dir=self.root, cookie_secure=False,
                                        session_secret="test-only-secret-value-at-least-32-characters")
        self.app = create_app(self.settings)
        self.a = TestClient(self.app)
        self.b = TestClient(self.app)

    def tearDown(self):
        self.a.close()
        self.b.close()
        shutil.rmtree(self.root)

    def initialize(self, client):
        response = client.get("/api/work/datasets")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()[0]["id"]

    def save_demo(self, client, dataset_id):
        payload = dict(dataset_id=dataset_id, sku="FSH-EV-001", as_of_date="2026-08-31",
                       discount_pct=0, expected_units_30d=1, purchase_units=0,
                       action="promotion", rationale="이번 주 노출을 우선 검토합니다.")
        compared = client.post("/api/work/compare", json=payload)
        self.assertEqual(compared.status_code, 200, compared.text)
        saved = client.post("/api/work/decisions", json=payload)
        self.assertEqual(saved.status_code, 200, saved.text)
        return saved.json()["id"]

    def test_clean_demo_seeds_30_products_and_never_hm(self):
        first = self.a.get("/api/me")
        self.assertIn("HttpOnly", first.headers.get("set-cookie", ""))
        self.assertIn("SameSite=Lax", first.headers.get("set-cookie", ""))
        dataset_id = self.initialize(self.a)
        response = self.a.get(f"/api/work/analysis?dataset_id={dataset_id}")
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["dataset"]["kind"], "synthetic")
        self.assertEqual(data["summary"]["total_products"], 30)
        self.assertTrue(data["products"])

    def test_demo_decisions_and_numeric_ids_are_private(self):
        a_id = self.initialize(self.a)
        b_id = self.initialize(self.b)
        decision_id = self.save_demo(self.a, a_id)
        self.assertEqual(len(self.a.get(f"/api/work/datasets/{a_id}/decisions").json()), 1)
        self.assertEqual(self.b.get(f"/api/work/datasets/{b_id}/decisions").json(), [])
        denied = self.b.get(f"/api/work/decisions/{decision_id}/outcome")
        self.assertEqual(denied.status_code, 404)
        self.assertNotEqual(self.a.cookies.get(COOKIE), self.b.cookies.get(COOKIE))

    def test_restart_preserves_own_decision_without_reseeding(self):
        dataset_id = self.initialize(self.a)
        self.save_demo(self.a, dataset_id)
        cookie = self.a.cookies.get(COOKIE)
        with TestClient(create_app(self.settings)) as restarted:
            restarted.cookies.set(COOKIE, cookie)
            self.assertEqual(len(restarted.get("/api/work/datasets").json()), 1)
            records = restarted.get(f"/api/work/datasets/{dataset_id}/decisions")
            self.assertEqual(len(records.json()), 1)

    def test_forged_cookie_does_not_open_existing_workspace(self):
        dataset_id = self.initialize(self.a)
        self.save_demo(self.a, dataset_id)
        cookie = self.a.cookies.get(COOKIE)
        self.b.cookies.set(COOKIE, cookie[:-1] + ("0" if cookie[-1] != "0" else "1"))
        b_id = self.initialize(self.b)
        self.assertEqual(self.b.get(f"/api/work/datasets/{b_id}/decisions").json(), [])

    def test_guest_upload_and_legacy_import_rejected(self):
        self.initialize(self.a)
        for path in ("/api/work/datasets/upload", "/api/import/products", "/api/import/sales",
                     "/api/work/datasets/1/sales/import"):
            self.assertEqual(self.a.post(path).status_code, 401, path)

    def test_cross_site_write_and_invalid_bearer_rejected(self):
        self.initialize(self.a)
        self.assertEqual(self.a.post("/api/work/compare", headers={"Origin": "https://other.example"}, json={}).status_code, 403)
        self.assertEqual(self.a.get("/api/work/datasets", headers={"Authorization": "Bearer fabricated"}).status_code, 401)

    def test_guest_capacity_is_bounded(self):
        app = create_app(replace(self.settings, max_guests=1))
        with TestClient(app) as first, TestClient(app) as second:
            self.initialize(first)
            self.assertEqual(second.get("/api/work/datasets").status_code, 503)

    def test_private_accounts_and_guest_cannot_read_each_others_uploads(self):
        settings = replace(self.settings, mode="private", supabase_url="https://example.supabase.co",
                           supabase_key="sb_publishable_test")
        user_a, user_b = str(uuid4()), str(uuid4())

        async def verify(token, _settings):
            if token == "user-a":
                return Identity("user:" + user_a, user_a, "a@example.com")
            if token == "user-b":
                return Identity("user:" + user_b, user_b, "b@example.com")
            raise HTTPException(401, "Invalid token")

        with patch("app.workspace_hosting.verify_supabase", side_effect=verify), \
                TestClient(create_app(settings)) as alice, TestClient(create_app(settings)) as bob:
            alice.headers["Authorization"] = "Bearer user-a"
            bob.headers["Authorization"] = "Bearer user-b"
            alice.headers["X-User-ID"] = user_b  # Client identities must have no effect.
            self.initialize(alice)
            self.initialize(bob)
            uploaded = alice.post("/api/work/datasets/upload", data={
                "name": "Alice private", "snapshot_date": "2026-09-02", "complete_calendar": "true"},
                files={"products_file": ("products.csv", PRODUCTS, "text/csv"),
                       "sales_file": ("sales.csv", SALES, "text/csv")})
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            upload_id = uploaded.json()["id"]
            self.assertEqual(len(alice.get("/api/work/datasets").json()), 2)
            self.assertEqual(len(bob.get("/api/work/datasets").json()), 1)
            for path in (f"/api/work/analysis?dataset_id={upload_id}",
                         f"/api/work/catalog?dataset_id={upload_id}",
                         f"/api/work/datasets/{upload_id}/decisions"):
                self.assertEqual(bob.get(path).status_code, 404, path)
            alice.headers.pop("Authorization")
            self.assertEqual(len(alice.get("/api/work/datasets").json()), 1)
            alice.headers["Authorization"] = "Bearer user-a"
            self.assertEqual(len(alice.get("/api/work/datasets").json()), 2)
            alice.headers["Authorization"] = "Bearer bad"
            self.assertEqual(alice.get("/api/work/datasets").status_code, 401)

    def test_static_app_and_api_share_origin_but_do_not_serve_data_files(self):
        public = self.root / "ui"
        public.mkdir()
        (public / "index.html").write_text("<html>MD V2</html>", encoding="utf-8")
        (public / "hm_images").mkdir()
        (public / "hm_images" / "not-public.jpg").write_bytes(b"not-public")
        with TestClient(create_app(replace(self.settings, serve_frontend=True, frontend_dir=public))) as client:
            self.assertIn("MD V2", client.get("/").text)
            self.assertEqual(client.get("/api/health").status_code, 200)
            self.assertEqual(client.get("/md_decision_lab.db").status_code, 404)
            self.assertEqual(client.get("/hm_images/not-public.jpg").status_code, 404)
            self.assertEqual(client.get("/docs").status_code, 404)

    def test_missing_secret_and_service_role_keys_fail_closed(self):
        with self.assertRaises(ValueError):
            create_app(replace(self.settings, session_secret="short"))
        payload = base64.urlsafe_b64encode(json.dumps({"role": "service_role"}).encode()).decode().rstrip("=")
        for key in ("sb_secret_do_not_expose", f"header.{payload}.signature"):
            with self.assertRaises(ValueError):
                create_app(replace(self.settings, mode="private", supabase_url="https://example.supabase.co", supabase_key=key))

    def test_real_verifier_uses_auth_server_and_rejects_failure(self):
        user_id = str(uuid4())
        settings = replace(self.settings, mode="private", supabase_url="https://example.supabase.co",
                           supabase_key="sb_publishable_test")
        with patch("app.workspace_hosting.httpx.AsyncClient") as mock:
            upstream = mock.return_value.__aenter__.return_value
            upstream.get = AsyncMock(return_value=httpx.Response(200, json={
                "id": user_id, "email_confirmed_at": "2026-10-30T00:00:00Z", "email": "me@example.com"}))
            identity = asyncio.run(verify_supabase("test-token", settings))
            self.assertEqual(identity.user_id, user_id)
            self.assertEqual(upstream.get.call_args.kwargs["headers"]["Authorization"], "Bearer test-token")
            upstream.get.return_value = httpx.Response(401)
            with self.assertRaises(HTTPException) as expired:
                asyncio.run(verify_supabase("expired", settings))
            self.assertEqual(expired.exception.status_code, 401)
            upstream.get.return_value = httpx.Response(503)
            with self.assertRaises(HTTPException) as down:
                asyncio.run(verify_supabase("unavailable", settings))
            self.assertEqual(down.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
