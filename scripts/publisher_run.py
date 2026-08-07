from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.io import PREVIEW, load_json, save_json
from scripts.publisher_pipeline import run_pipeline
from scripts.threads_publisher import publish_text
from scripts.threads_reply_publisher import publish_reply

CONFIRMATION = "PUBLISH_THREADS_NOW"


def build_reply(post: dict) -> str:
    labels = ("第一個", "第二個", "第三個", "第四個")
    return "\n\n".join(f"{label}\n{product['reply_url']}" for label, product in zip(labels, post["products"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()

    report = run_pipeline()
    if report["status"] != "READY_TO_PUBLISH":
        print("Publisher run status: BLOCKED")
        raise SystemExit(1)

    if not args.publish:
        print("Publisher run status: READY_TO_PUBLISH")
        print("Threads API called: no")
        return

    if args.confirm != CONFIRMATION:
        print("Refusing real publish: missing exact confirmation phrase")
        raise SystemExit(2)

    previews = load_json(PREVIEW / "daily.json")
    results = []
    for post in previews:
        main_result = publish_text(post["caption"])
        parent_id = str(main_result.get("id", ""))
        if not parent_id:
            raise RuntimeError(f"Threads publish returned no id: {main_result}")
        reply_result = publish_reply(parent_id, build_reply(post))
        results.append({"preview_id": post["id"], "post": main_result, "reply": reply_result})
    save_json(PREVIEW / "publisher-live-result.json", results)
    print(f"Published {len(results)} Threads posts with replies")


if __name__ == "__main__":
    main()
