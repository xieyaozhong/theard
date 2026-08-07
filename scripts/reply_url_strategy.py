from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.io import PREVIEW, load_json


def valid_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def validate_previews(previews: list[dict]) -> list[str]:
    errors: list[str] = []
    for post in previews:
        products = post.get("products", [])
        if len(products) != 4:
            errors.append(f"{post.get('id')}: expected 4 products, got {len(products)}")
        for product in products:
            url = product.get("reply_url", "")
            if not valid_url(url):
                errors.append(f"{post.get('id')}/{product.get('id')}: invalid reply URL")
            if len(url) >= 460:
                errors.append(f"{post.get('id')}/{product.get('id')}: URL too long; use official Shopee short link")
    return errors


def main() -> None:
    previews = load_json(PREVIEW / "daily.json", default=[])
    errors = validate_previews(previews)
    if errors:
        print("BLOCKED")
        for error in errors:
            print("-", error)
        raise SystemExit(1)
    print("PASS: reply URL strategy")


if __name__ == "__main__":
    main()
