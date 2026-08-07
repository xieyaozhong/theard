from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.io import PREVIEW, load_json, save_json
from scripts.daily_production import build_daily_previews
from scripts.reply_url_strategy import validate_previews

FORBIDDEN_MAIN = ("shopee", "蝦皮", "分潤", "affiliate", "http://", "https://")


def validate_content(previews: list[dict]) -> list[str]:
    errors: list[str] = []
    seen_hashes: set[str] = set()
    for post in previews:
        caption = str(post.get("caption", ""))
        lowered = caption.lower()
        if not caption:
            errors.append(f"{post.get('id')}: empty caption")
        if any(token in lowered for token in FORBIDDEN_MAIN):
            errors.append(f"{post.get('id')}: main caption contains forbidden commercial/link wording")
        h = post.get("similarity_hash")
        if h in seen_hashes:
            errors.append(f"{post.get('id')}: duplicate caption hash")
        seen_hashes.add(h)
    return errors


def run_pipeline() -> dict:
    previews = load_json(PREVIEW / "daily.json", default=[])
    if not previews:
        previews = build_daily_previews()
    errors = validate_content(previews) + validate_previews(previews)
    report = {
        "status": "BLOCKED" if errors else "READY_TO_PUBLISH",
        "preview_count": len(previews),
        "errors": errors,
        "threads_api_called": False,
    }
    save_json(PREVIEW / "publisher-pipeline-report.json", report)
    return report


def main() -> None:
    report = run_pipeline()
    print("Publisher pipeline status:", report["status"])
    print("Threads API called: no")
    for error in report["errors"]:
        print("-", error)
    raise SystemExit(0 if report["status"] == "READY_TO_PUBLISH" else 1)


if __name__ == "__main__":
    main()
