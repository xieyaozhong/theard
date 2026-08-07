import unittest

from scripts.daily_production import build_daily_previews
from scripts.publisher_pipeline import run_pipeline


class PipelineTests(unittest.TestCase):
    def test_daily_preview_shape(self):
        previews = build_daily_previews()
        self.assertEqual(len(previews), 3)
        self.assertTrue(all(len(post["products"]) == 4 for post in previews))

    def test_pipeline_ready(self):
        build_daily_previews()
        report = run_pipeline()
        self.assertEqual(report["status"], "READY_TO_PUBLISH")
        self.assertFalse(report["threads_api_called"])


if __name__ == "__main__":
    unittest.main()
