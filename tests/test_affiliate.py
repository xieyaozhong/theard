import csv
import json
import tempfile
import unittest
from pathlib import Path

from affiliate.import_performance import import_performance
from affiliate.metrics import AffiliateMetrics, product_performance_score


class AffiliateTests(unittest.TestCase):
    def test_metrics_compute_conversion_and_epc(self):
        metrics = AffiliateMetrics.build(clicks=100, orders=5, commission=250)
        self.assertAlmostEqual(metrics.conversion_rate, 0.05)
        self.assertAlmostEqual(metrics.epc, 2.5)

    def test_score_rewards_stronger_performance(self):
        weak = product_performance_score(
            conversion_rate=0.01, epc=0.2, commission_rate=0.05, clicks=100
        )
        strong = product_performance_score(
            conversion_rate=0.06, epc=3.0, commission_rate=0.12, clicks=100
        )
        self.assertGreater(strong, weak)

    def test_importer_updates_product_metrics(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            products_path = root / "products.json"
            csv_path = root / "report.csv"
            products_path.write_text(json.dumps([
                {
                    "id": "product-001",
                    "title": "測試商品",
                    "category": "測試",
                    "affiliate_url": "https://example.com/product",
                    "sub_id": "threads-test-001",
                    "active": True,
                }
            ], ensure_ascii=False), encoding="utf-8")
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "product_id", "sub_id", "clicks", "orders", "revenue",
                    "commission", "ctr", "commission_rate",
                ])
                writer.writeheader()
                writer.writerow({
                    "product_id": "product-001",
                    "sub_id": "threads-test-001",
                    "clicks": "100",
                    "orders": "5",
                    "revenue": "5000",
                    "commission": "400",
                    "ctr": "4%",
                    "commission_rate": "8%",
                })

            result = import_performance(csv_path, products_path)
            saved = json.loads(products_path.read_text(encoding="utf-8"))[0]
            self.assertEqual(result["matched"], 1)
            self.assertEqual(saved["orders"], 5)
            self.assertAlmostEqual(saved["conversion_rate"], 0.05)
            self.assertAlmostEqual(saved["epc"], 4.0)
            self.assertGreater(saved["score"], 0)


if __name__ == "__main__":
    unittest.main()
