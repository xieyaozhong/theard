import unittest

from agents.content_agent import generate_caption
from agents.product_agent import select_products
from core.models import Product


class AgentTests(unittest.TestCase):
    def test_caption_is_traditional_lifestyle_sentence(self):
        result = generate_caption("桌面整理", salt="test")
        self.assertTrue(result.content.endswith("。"))
        self.assertNotIn("Shopee", result.content)
        self.assertGreater(len(result.content), 8)

    def test_product_selector_returns_four(self):
        products = [Product(f"p{i}", f"桌面商品{i}", f"分類{i}", f"https://example.com/{i}") for i in range(5)]
        selected = select_products(products, "桌面", limit=4)
        self.assertEqual(len(selected), 4)
        self.assertEqual(len({p.id for p in selected}), 4)


if __name__ == "__main__":
    unittest.main()
