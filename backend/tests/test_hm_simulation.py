import csv
import os
import shutil
import unittest
from collections import Counter
from datetime import date
from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import hm_sim_routes as sim
from app.api.work_routes import analysis as work_analysis
from app.database import Base, get_db
from app.main import app
from app.models import (WorkDailySale, WorkDataset, WorkProduct, WorkSimDecision, WorkSimLedger, WorkSimPolicy,
                        WorkSimPrice, WorkSimScenario)
from app.services.hm_simulation import AS_OF, CASE_DIR, import_simulation
from tests.workspace_temp import workspace_temp

REAL_DB = Path(__file__).resolve().parents[1] / "md_decision_lab.db"
# The case CSVs derive from H&M Kaggle data and are not committed; generate them locally to run these tests.
CASE_FILES_PRESENT = all((CASE_DIR / name).exists() for name in (
    "hm_product_policy.csv", "hm_inventory_ledger.csv", "hm_purchase_orders.csv", "hm_economics.csv"))


def read_case(name: str, directory: Path = CASE_DIR) -> list[dict[str, str]]:
    with (directory / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_case(directory: Path, name: str, rows: list[dict[str, str]]):
    with (directory / name).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


@unittest.skipUnless(CASE_FILES_PRESENT, "H&M case CSVs not generated locally")
class HmSimulationTests(unittest.TestCase):
    """Builds an H&M workspace from the case files: the ledger's observed units become the stored sales."""

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        dataset = WorkDataset(name="H&M 실제 판매 · MD 시연", kind="hm", start_date=date(2019, 1, 1),
                              end_date=date(2020, 9, 22), complete_calendar=True, source_note="test")
        self.db.add(dataset)
        self.db.flush()
        self.dataset_id = dataset.id
        self.policy = read_case("hm_product_policy.csv")
        ids = {}
        for row in self.policy:
            product = WorkProduct(dataset_id=dataset.id, sku=row["sku"], name=row["name"],
                                  category=row["category"], section=row["section"])
            self.db.add(product)
            self.db.flush()
            ids[row["sku"]] = product.id
            first = row["observed_first_sale_date"]
            if first and first < "2020-07-01":
                self.db.add(WorkDailySale(product_id=product.id, sale_date=date.fromisoformat(first), channel="1", units=1))
        for row in read_case("hm_inventory_ledger.csv"):
            if int(row["units_sold_observed"]):
                self.db.add(WorkDailySale(product_id=ids[row["sku"]], sale_date=date.fromisoformat(row["date"]),
                                          channel="2", units=int(row["units_sold_observed"])))
        self.db.commit()
        self.ids = ids

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def scenario(self) -> WorkSimScenario:
        return import_simulation(self.db, self.dataset_id)

    def test_import_preserves_leading_zero_and_matches_observed_sales(self):
        scenario = self.scenario()
        skus = self.db.scalars(select(WorkProduct.sku).join(WorkSimPolicy, WorkSimPolicy.product_id == WorkProduct.id)
                               .where(WorkSimPolicy.scenario_id == scenario.id)).all()
        self.assertEqual(len(skus), len(self.policy))
        self.assertTrue(all(len(sku) == 10 and sku.startswith("0") for sku in skus))
        stored = Counter()
        for product_id, day, units in self.db.execute(select(WorkDailySale.product_id, WorkDailySale.sale_date, WorkDailySale.units)):
            if date(2020, 7, 1) <= day <= date(2020, 9, 22):
                stored[(product_id, day)] += units
        for row in self.db.scalars(select(WorkSimLedger).where(WorkSimLedger.scenario_id == scenario.id)):
            self.assertEqual(row.observed_units, stored.get((row.product_id, row.flow_date), 0))

    def test_changed_observed_sales_reject_the_whole_import(self):
        self.db.execute(update(WorkDailySale).where(WorkDailySale.sale_date == date(2020, 8, 15)).values(units=WorkDailySale.units + 1))
        self.db.commit()
        with self.assertRaises(ValueError):
            self.scenario()
        self.assertEqual(self.db.scalar(select(func.count(WorkSimScenario.id))), 0)
        self.assertEqual(self.db.scalar(select(func.count(WorkSimLedger.id))), 0)

    def test_reconciliation_receipts_and_blocked_reorders_are_rejected(self):
        orders = read_case("hm_purchase_orders.csv")
        stopped = next(row for row in self.policy if row["reorderable_assumed"] == "false")
        cases = {
            "reconciliation": orders + [{**orders[0], "po_id": "HMPO-9999", "order_date_assumed": "",
                                         "status": "reconciliation_assumed"}],
            "after_stop": orders + [{**orders[0], "po_id": "HMPO-9998", "sku": stopped["sku"],
                                     "order_date_assumed": "2020-08-20", "expected_receipt_date_assumed": "2020-10-20",
                                     "actual_receipt_date_assumed": "", "received_units_synthetic": "0", "status": "open"}],
        }
        for label, rows in cases.items():
            with self.subTest(label), workspace_temp() as tmp:
                for name in ("hm_product_policy.csv", "hm_inventory_ledger.csv", "hm_economics.csv"):
                    shutil.copy(CASE_DIR / name, tmp)
                write_case(Path(tmp), "hm_purchase_orders.csv", rows)
                with self.assertRaises(ValueError):
                    import_simulation(self.db, self.dataset_id, Path(tmp))
        self.assertEqual(self.db.scalar(select(func.count(WorkSimScenario.id))), 0)

    def test_ledger_separates_supply_and_policy_shortfall(self):
        scenario = self.scenario()
        rows = self.db.scalars(select(WorkSimLedger).where(WorkSimLedger.scenario_id == scenario.id)).all()
        for row in rows:
            self.assertEqual(row.supplied_units, min(row.observed_units, row.opening_stock + row.inbound_units))
            self.assertEqual(row.shortfall_units, row.observed_units - row.supplied_units)
            self.assertEqual(row.closing_stock, row.opening_stock + row.inbound_units - row.supplied_units)
            self.assertGreaterEqual(row.closing_stock, 0)
            if row.flow_date <= AS_OF:
                self.assertEqual(row.shortfall_units, 0)
        result = sim.analysis(scenario.id, self.db)
        post = result["post_as_of_summary"]
        expected_observed = sum(r.observed_units for r in rows if r.flow_date > AS_OF)
        expected_short = sum(r.shortfall_units for r in rows if r.flow_date > AS_OF)
        self.assertEqual(post["observed_units"], expected_observed)
        self.assertEqual(post["policy_shortfall_units"], expected_short)
        self.assertEqual(post["supplied_units"] + post["policy_shortfall_units"], post["observed_units"])
        self.assertIn("실제 H&M 품절", post["note"])

    def test_as_of_judgment_does_not_use_later_sales(self):
        scenario = self.scenario()
        before = {p["sku"]: p for p in sim.analysis(scenario.id, self.db)["products"]}
        self.db.execute(delete(WorkDailySale).where(WorkDailySale.sale_date > AS_OF))
        self.db.add(WorkDailySale(product_id=self.ids[self.policy[0]["sku"]], sale_date=date(2020, 9, 1), channel="9", units=500))
        self.db.commit()
        after = {p["sku"]: p for p in sim.analysis(scenario.id, self.db)["products"]}
        for sku, item in before.items():
            for part in ("observed", "conditions", "signal"):
                self.assertEqual(item[part], after[sku][part], f"{sku} {part}")

    def test_unobserved_products_are_not_called_stable(self):
        scenario = self.scenario()
        # The sample is chosen from July-August sales, so every product has sold; erase one product's history up to
        # the judgment date to check that "no observed sales" is reported as such rather than as stable.
        sku = self.policy[0]["sku"]
        self.db.execute(delete(WorkDailySale).where(WorkDailySale.product_id == self.ids[sku],
                                                    WorkDailySale.sale_date <= AS_OF))
        self.db.commit()
        unobserved = {sku}
        products = {p["sku"]: p for p in sim.analysis(scenario.id, self.db)["products"]}
        self.assertEqual(products[sku]["signal"]["risk"], "not_observed")
        self.assertIsNone(products[sku]["signal"]["days_of_cover"])
        observed_view = {p["sku"]: p for p in work_analysis(self.dataset_id, AS_OF, None, None, self.db)["products"]}
        self.assertTrue(all(observed_view[sku]["risk"] == "not_observed" for sku in unobserved))

    def test_every_value_carries_its_source(self):
        scenario = self.scenario()
        result = sim.analysis(scenario.id, self.db)
        self.assertIn("8월 31일) 이후 판매는 선정에 쓰지 않았습니다", result["scenario"]["bias_note"])
        for item in result["products"]:
            self.assertEqual(item["observed"]["source"], "H&M 관측")
            self.assertEqual(item["conditions"]["source"], "가상 운영 조건")
            self.assertEqual(item["signal"]["source"], "시뮬레이션")
        detail = sim.product_detail(result["products"][0]["sku"], scenario.id, self.db)
        self.assertTrue(all(order["status"] in {"received", "open"} for order in detail["planned_orders"]))
        self.assertTrue(all(order["order_date"] <= AS_OF for order in detail["planned_orders"]))

    def test_compare_and_decision_snapshot_survive_later_changes(self):
        scenario = self.scenario()
        stopped = next(row["sku"] for row in self.policy if row["reorderable_assumed"] == "false")
        with self.assertRaises(HTTPException) as error:
            sim.compare(sim.SimComparePayload(scenario_id=scenario.id, sku=stopped, discount_pct=10,
                                              expected_units_30d=1, purchase_units=10), self.db)
        self.assertEqual(error.exception.status_code, 400)
        sku = next(p["sku"] for p in sim.analysis(scenario.id, self.db)["products"] if p["conditions"]["stock_on_hand"] >= 10)
        payload = sim.SimDecisionPayload(scenario_id=scenario.id, sku=sku, discount_pct=20, expected_units_30d=10,
                                         purchase_units=0, action="할인 검토", rationale="재고 소진 속도를 확인하고 할인안을 검토합니다.")
        saved = sim.save_decision(payload, self.db)
        snapshot = saved["snapshot"]
        self.assertEqual(snapshot["observed"]["source"], "H&M 관측")
        self.assertEqual(snapshot["conditions"]["source"], "가상 운영 조건")
        self.assertEqual(snapshot["comparison"]["source"], "시뮬레이션")
        self.assertEqual(snapshot["alternatives"]["selected_option"], "B")
        self.assertEqual(snapshot["alternatives"]["B"]["estimated_gross_profit_krw"], snapshot["comparison"]["estimated_gross_profit_krw"])
        self.db.execute(update(WorkSimPrice).values(selling_price_krw=WorkSimPrice.selling_price_krw * 2,
                                                     list_price_krw=WorkSimPrice.list_price_krw * 2))
        self.db.commit()
        changed = sim.compare(payload, self.db)
        stored = sim.decisions(scenario.id, self.db)[0]
        self.assertNotEqual(changed["estimated_gross_profit_krw"], stored["snapshot"]["comparison"]["estimated_gross_profit_krw"])
        self.assertEqual(stored["snapshot"], snapshot)

    def test_ab_choice_a_saves_both_options(self):
        scenario = self.scenario()
        item = next(p for p in sim.analysis(scenario.id, self.db)["products"]
                    if p["conditions"]["stock_on_hand"] >= 20)
        saved = sim.save_decision(sim.SimDecisionPayload(
            scenario_id=scenario.id, sku=item["sku"], discount_pct=10,
            expected_units_30d=5, purchase_units=0,
            baseline_expected_units_30d=4, selected_option="A",
            action="현재 유지", rationale="현재가 유지와 할인안을 비교했습니다.",
        ), self.db)
        alternatives = saved["snapshot"]["alternatives"]
        self.assertEqual(alternatives["selected_option"], "A")
        self.assertEqual(saved["snapshot"]["comparison"]["estimated_gross_profit_krw"],
                         alternatives["A"]["estimated_gross_profit_krw"])
        self.assertEqual(alternatives["B"]["expected_units_30d"], 5)

    def test_compare_checks_stock_day_by_day_against_planned_receipts(self):
        scenario = self.scenario()
        products = sim.analysis(scenario.id, self.db)["products"]
        # The product whose planned receipts dwarf its as-of stock: the 30-day total fits, the early days do not.
        late = max((p for p in products if p["conditions"]["planned_inbound_30d"]),
                   key=lambda p: p["conditions"]["planned_inbound_30d"] / (p["conditions"]["stock_on_hand"] + 1))
        total = late["conditions"]["stock_on_hand"] + late["conditions"]["planned_inbound_30d"]
        payload = sim.SimDecisionPayload(scenario_id=scenario.id, sku=late["sku"], discount_pct=0,
                                         expected_units_30d=total, action="현재 유지",
                                         rationale="계획 입고 전 재고 공백을 확인합니다.")
        result = sim.compare(payload, self.db)
        # The 30-day total equals the available units, yet the only receipt lands on 9/28.
        self.assertEqual(result["available_units_30d"], total)
        self.assertFalse(result["feasible"])
        self.assertIsNotNone(result["first_gap_date"])
        self.assertIsNone(result["estimated_gross_profit_krw"])
        with self.assertRaises(HTTPException) as error:
            sim.save_decision(payload, self.db)
        self.assertIn(str(result["first_gap_date"]), error.exception.detail)

    def test_sell_through_is_simulated_from_the_ledger_before_as_of(self):
        scenario = self.scenario()
        products = sim.analysis(scenario.id, self.db)["products"]
        for item in products:
            st = item["sell_through"]
            self.assertEqual((st["status"], st["source"], st["end"]), ("ok", "시뮬레이션", AS_OF))
            self.assertEqual(st["opening_stock"] + st["received_units"] - st["sold_units"], st["closing_stock"])
            self.assertEqual(st["closing_stock"], item["conditions"]["stock_on_hand"])
        sku = next(p["sku"] for p in products if p["conditions"]["stock_on_hand"] >= 10)
        saved = sim.save_decision(sim.SimDecisionPayload(
            scenario_id=scenario.id, sku=sku, discount_pct=0, expected_units_30d=1, action="현재 유지",
            rationale="가상 판매율을 함께 기록합니다."), self.db)
        self.assertEqual(saved["snapshot"]["sell_through"]["source"], "시뮬레이션")
        self.assertEqual(saved["snapshot"]["sell_through"]["end"], AS_OF.isoformat())

    def test_retrospective_sets_later_days_beside_the_as_of_judgment(self):
        scenario = self.scenario()
        result = sim.analysis(scenario.id, self.db)
        retro, post = result["retrospective"], result["post_as_of_summary"]
        self.assertEqual(retro["post_days"], 22)
        self.assertEqual(sum(g["products"] for g in retro["groups"]), len(self.policy))
        self.assertEqual(sum(g["policy_shortfall_units"] for g in retro["groups"]), post["policy_shortfall_units"])
        self.assertEqual({g["risk"] for g in retro["groups"]}, set(result["summary"]["risk_counts"]))
        self.assertFalse(any(key in g for g in retro["groups"] for key in ("accuracy", "hit_rate", "correct")))
        self.assertIn("채점한 표가 아닙니다", retro["note"])
        before = {g["risk"]: (g["products"], g["before_daily_units"], g["as_of_stock"]) for g in retro["groups"]}
        # Later sales move only the after-columns; the as-of side of the table stays fixed.
        self.db.execute(update(WorkDailySale).where(WorkDailySale.sale_date > AS_OF).values(units=WorkDailySale.units * 3))
        self.db.commit()
        changed = sim.analysis(scenario.id, self.db)["retrospective"]["groups"]
        self.assertEqual({g["risk"]: (g["products"], g["before_daily_units"], g["as_of_stock"]) for g in changed}, before)

    def test_forecast_uses_only_sales_known_on_the_judgment_date(self):
        scenario = self.scenario()
        # Give last year a pooled 10/day → 8/day pattern; setUp's first-sale rows may add a little to it.
        pid = self.ids[self.policy[0]["sku"]]
        for offset in range(14):
            self.db.add(WorkDailySale(product_id=pid, sale_date=date(2019, 8, 18 + offset), channel="1", units=10))
        for day in range(1, 23):
            self.db.add(WorkDailySale(product_id=pid, sale_date=date(2019, 9, day), channel="1", units=8))
        self.db.commit()
        result = sim.forecast(scenario.id, self.db)
        last_year = lambda start, end: self.db.scalar(select(func.sum(WorkDailySale.units)).where(
            WorkDailySale.sale_date.between(start, end)))
        expected = round((last_year(date(2019, 9, 1), date(2019, 9, 22)) / 22)
                         / (last_year(date(2019, 8, 18), date(2019, 8, 31)) / 14), 3)
        self.assertEqual(result["seasonal_factor"], expected)
        self.assertAlmostEqual(expected, 0.8, delta=0.02)
        self.assertEqual(result["horizon_days"], 22)
        rows = {row["sku"]: row for row in result["products"]}
        self.assertEqual(len(rows), len(self.policy))
        for row in rows.values():
            self.assertAlmostEqual(row["estimate"]["seasonal"], row["estimate"]["velocity"] * expected, delta=0.1)
        validation = result["validation"]
        self.assertEqual(validation["velocity"]["actual_units"], validation["seasonal"]["actual_units"])
        # Changing September changes only the actual side.
        self.db.execute(update(WorkDailySale).where(WorkDailySale.sale_date > AS_OF).values(units=WorkDailySale.units * 2))
        self.db.commit()
        changed = sim.forecast(scenario.id, self.db)
        self.assertEqual({r["sku"]: r["estimate"] for r in changed["products"]},
                         {sku: row["estimate"] for sku, row in rows.items()})
        self.assertEqual(changed["validation"]["seasonal"]["estimated_units"], validation["seasonal"]["estimated_units"])
        self.assertEqual(changed["validation"]["seasonal"]["actual_units"], 2 * validation["seasonal"]["actual_units"])

    def test_routes_are_exposed_and_import_is_not_the_company_upload(self):
        def override():
            yield self.db
        app.dependency_overrides[get_db] = override
        try:
            client = TestClient(app)
            response = client.post(f"/api/work/sim/import-sample?dataset_id={self.dataset_id}")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(client.post(f"/api/work/sim/import-sample?dataset_id={self.dataset_id}").status_code, 409)
            scenario_id = response.json()["id"]
            self.assertEqual(client.get(f"/api/work/sim/analysis?scenario_id={scenario_id}").status_code, 200)
            self.assertEqual(self.db.scalar(select(func.count(WorkDataset.id))), 1)
        finally:
            app.dependency_overrides.clear()


@unittest.skipUnless(REAL_DB.exists() and CASE_FILES_PRESENT, "local H&M database or case CSVs not present")
class RealDatabaseImportTest(unittest.TestCase):
    def test_case_files_match_the_stored_hm_sales(self):
        with workspace_temp() as tmp:
            copy = Path(tmp) / "copy.db"
            shutil.copyfile(REAL_DB, copy)
            engine = create_engine(f"sqlite:///{copy}")
            Base.metadata.create_all(engine)
            try:
                with Session(engine) as db:
                    dataset = db.scalar(select(WorkDataset).where(WorkDataset.kind == "hm"))
                    if db.scalar(select(WorkSimScenario.id).where(WorkSimScenario.dataset_id == dataset.id)):
                        self.skipTest("copy already contains the scenario")
                    scenario = import_simulation(db, dataset.id)
                    result = sim.analysis(scenario.id, db)
                    ledger = read_case("hm_inventory_ledger.csv")
                    self.assertEqual(result["summary"]["total_products"], len(read_case("hm_product_policy.csv")))
                    self.assertEqual(result["post_as_of_summary"]["observed_units"],
                                     sum(int(r["units_sold_observed"]) for r in ledger if r["date"] > AS_OF.isoformat()))
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
