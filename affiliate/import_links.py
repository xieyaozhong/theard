from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.io import DATA, load_json, save_json

ALIASES = {
    "title": ("title", "商品名稱", "產品名稱", "Product Name", "產品"),
    "product_url": ("product_url", "商品連結", "商品網址", "產品連結", "Product Link", "商品頁面"),
    "affiliate_url": (
        "affiliate_url",
        "產品供應連結",
        "推廣連結",
        "分潤連結",
        "Affiliate Link",
        "Product Offer Link",
        "產品推廣連結",
    ),
    "sub_id": ("sub_id", "Sub ID", "Sub_Id", "subid", "追蹤代碼"),
    "commission_rate": ("commission_rate", "分潤率", "佣金率", "Commission Rate"),
    "category": ("category", "分類", "商品分類", "Category"),
}


def _pick(row: dict[str, str], key: str) -> str:
    for alias in ALIASES[key]:
        if alias in row and str(row[alias]).strip():
            return str(row[alias]).strip()
    return ""


def _rate(value: Any) -> float:
    text = str(value or "").strip().replace(",", "")
    if not text:
        return 0.0
    percent = text.endswith("%")
    if percent:
        text = text[:-1]
    try:
        number = float(text)
    except ValueError:
        return 0.0
    return number / 100.0 if percent else number


def _stable_id(product_url: str, affiliate_url: str, title: str) -> str:
    seed = product_url or affiliate_url or title
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:10]
    return f"shopee-{digest}"


def import_links(csv_path: Path, products_path: Path = DATA / "products.json") -> dict[str, int]:
    products = load_json(products_path, default=[])
    if not isinstance(products, list):
        raise ValueError("data/products.json must be a JSON array")

    by_id = {str(item.get("id", "")): item for item in products if isinstance(item, dict)}
    by_sub = {
        str(item.get("sub_id", "")): item
        for item in products
        if isinstance(item, dict) and str(item.get("sub_id", "")).strip()
    }
    by_product_url = {
        str(item.get("product_url", "")): item
        for item in products
        if isinstance(item, dict) and str(item.get("product_url", "")).strip()
    }
    by_title = {
        str(item.get("title", "")).strip(): item
        for item in products
        if isinstance(item, dict) and str(item.get("title", "")).strip()
    }

    created = 0
    updated = 0
    skipped = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            affiliate_url = _pick(row, "affiliate_url")
            if not affiliate_url:
                skipped += 1
                continue

            title = _pick(row, "title") or "Shopee imported product"
            product_url = _pick(row, "product_url")
            sub_id = _pick(row, "sub_id")
            category = _pick(row, "category") or "蝦皮匯入"
            commission_rate = _rate(_pick(row, "commission_rate"))

            product = (
                by_sub.get(sub_id)
                or by_product_url.get(product_url)
                or by_title.get(title)
            )

            if product is None:
                product_id = _stable_id(product_url, affiliate_url, title)
                product = {
                    "id": product_id,
                    "title": title,
                    "category": category,
                    "affiliate_url": affiliate_url,
                    "affiliate_short_url": "",
                    "product_url": product_url,
                    "sub_id": sub_id,
                    "commission_rate": round(commission_rate, 6),
                    "tags": [category] if category else [],
                    "last_used": "",
                    "use_count": 0,
                    "active": True,
                }
                products.append(product)
                by_id[product_id] = product
                created += 1
            else:
                product.update({
                    "title": title or str(product.get("title", "")),
                    "category": category or str(product.get("category", "")),
                    "affiliate_url": affiliate_url,
                    "product_url": product_url or str(product.get("product_url", "")),
                    "sub_id": sub_id or str(product.get("sub_id", "")),
                    "active": True,
                })
                if commission_rate:
                    product["commission_rate"] = round(commission_rate, 6)
                updated += 1

            if sub_id:
                by_sub[sub_id] = product
            if product_url:
                by_product_url[product_url] = product
            if title:
                by_title[title] = product

    save_json(products_path, products)
    return {"created": created, "updated": updated, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import official Shopee affiliate batch-link CSV into THEARD products.json"
    )
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--products", type=Path, default=DATA / "products.json")
    args = parser.parse_args()
    result = import_links(args.csv_path, args.products)
    print(
        f"created={result['created']} updated={result['updated']} "
        f"skipped={result['skipped']} products={args.products}"
    )


if __name__ == "__main__":
    main()
