from __future__ import annotations

import argparse
import csv
import hashlib
import io
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


def _looks_like_shopee_link(value: str) -> bool:
    value = str(value or "").strip().lower()
    return value.startswith(("https://", "http://")) and "shopee" in value


def _read_rows(csv_path: Path) -> list[dict[str, str]]:
    text = csv_path.read_text(encoding="utf-8-sig")
    raw_rows = [row for row in csv.reader(io.StringIO(text)) if any(str(cell).strip() for cell in row)]

    # Shopee's batch-link export may be a simple one-link-per-line CSV with no
    # header. Treat every line as an official affiliate link instead of losing
    # the first URL as a DictReader header.
    if raw_rows and all(len(row) == 1 and _looks_like_shopee_link(row[0]) for row in raw_rows):
        return [{"affiliate_url": row[0].strip()} for row in raw_rows]

    return list(csv.DictReader(io.StringIO(text)))


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
    by_affiliate_url = {
        str(item.get("affiliate_url", "")): item
        for item in products
        if isinstance(item, dict) and str(item.get("affiliate_url", "")).strip()
    }
    by_title = {
        str(item.get("title", "")).strip(): item
        for item in products
        if isinstance(item, dict) and str(item.get("title", "")).strip()
    }

    created = 0
    updated = 0
    skipped = 0

    for row in _read_rows(csv_path):
        affiliate_url = _pick(row, "affiliate_url")
        if not affiliate_url or not _looks_like_shopee_link(affiliate_url):
            skipped += 1
            continue

        raw_title = _pick(row, "title")
        product_url = _pick(row, "product_url")
        link_only = not raw_title and not product_url
        product_id = _stable_id(product_url, affiliate_url, raw_title)
        title = raw_title or f"Shopee 分潤連結 {product_id[-6:].upper()}"
        sub_id = _pick(row, "sub_id") or (f"threads-auto-{product_id[-8:]}" if link_only else "")
        category = _pick(row, "category") or ("蝦皮連結池" if link_only else "蝦皮匯入")
        commission_rate = _rate(_pick(row, "commission_rate"))

        product = (
            by_affiliate_url.get(affiliate_url)
            or by_sub.get(sub_id)
            or by_product_url.get(product_url)
            or (by_title.get(raw_title) if raw_title else None)
        )

        if product is None:
            tags = [category] if category else []
            if link_only:
                tags.extend(["link-pool", "threads-auto"])
            product = {
                "id": product_id,
                "title": title,
                "category": category,
                "affiliate_url": affiliate_url,
                "affiliate_short_url": "",
                "product_url": product_url,
                "sub_id": sub_id,
                "commission_rate": round(commission_rate, 6),
                "tags": tags,
                "last_used": "",
                "use_count": 0,
                "active": True,
            }
            products.append(product)
            by_id[product_id] = product
            created += 1
        else:
            product.update({
                "title": raw_title or str(product.get("title", title)),
                "category": category or str(product.get("category", "")),
                "affiliate_url": affiliate_url,
                "product_url": product_url or str(product.get("product_url", "")),
                "sub_id": sub_id or str(product.get("sub_id", "")),
                "active": True,
            })
            if link_only:
                tags = list(product.get("tags", []))
                for tag in ("link-pool", "threads-auto"):
                    if tag not in tags:
                        tags.append(tag)
                product["tags"] = tags
            if commission_rate:
                product["commission_rate"] = round(commission_rate, 6)
            updated += 1

        by_affiliate_url[affiliate_url] = product
        if sub_id:
            by_sub[sub_id] = product
        if product_url:
            by_product_url[product_url] = product
        if raw_title:
            by_title[raw_title] = product

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
