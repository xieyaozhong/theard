import csv
import json
import tempfile
import unittest
from pathlib import Path

from affiliate.import_links import import_links
from affiliate.import_performance import import_performance
from affiliate.metrics import AffiliateMetrics, product_performance_score
from affiliate.sync_downloads import classify_csv


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

    def test_importer_aggregates_product_metrics(self):
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
                    "商品ID", "Sub_id1", "點擊數", "訂單數", "買家購買價格",
                    "商品分潤", "點擊率", "分潤率",
                ])
                writer.writeheader()
                writer.writerow({
                    "商品ID": "product-001", "Sub_id1": "threads-test-001",
                    "點擊數": "50", "訂單數": "2", "買家購買價格": "2500",
                    "商品分潤": "200", "點擊率": "4%", "分潤率": "8%",
                })
                writer.writerow({
                    "商品ID": "product-001", "Sub_id1": "threads-test-001",
                    "點擊數": "50", "訂單數": "3", "買家購買價格": "2500",
                    "商品分潤": "200", "點擊率": "4%", "分潤率": "8%",
                })

            result = import_performance(csv_path, products_path)
            saved = json.loads(products_path.read_text(encoding="utf-8"))[0]
            self.assertEqual(result["matched"], 2)
            self.assertEqual(result["updated"], 1)
            self.assertEqual(saved["orders"], 5)
            self.assertEqual(saved["clicks"], 100)
            self.assertAlmostEqual(saved["conversion_rate"], 0.05)
            self.assertAlmostEqual(saved["epc"], 4.0)
            self.assertGreater(saved["score"], 0)

    def test_batch_link_import_creates_product(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            products_path = root / "products.json"
            links_path = root / "links.csv"
            products_path.write_text("[]", encoding="utf-8")
            with links_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "商品名稱", "商品連結", "產品供應連結", "Sub ID", "分潤率",
                ])
                writer.writeheader()
                writer.writerow({
                    "商品名稱": "收納架",
                    "商品連結": "https://shopee.tw/product/123",
                    "產品供應連結": "https://s.shopee.tw/example",
                    "Sub ID": "threads-storage-001",
                    "分潤率": "10%",
                })
            result = import_links(links_path, products_path)
            saved = json.loads(products_path.read_text(encoding="utf-8"))
            self.assertEqual(result["created"], 1)
            self.assertEqual(saved[0]["affiliate_url"], "https://s.shopee.tw/example")
            self.assertEqual(saved[0]["sub_id"], "threads-storage-001")
            self.assertAlmostEqual(saved[0]["commission_rate"], 0.10)
            self.assertEqual(classify_csv(links_path), "links")


if __name__ == "__main__":
    unittest.main()
