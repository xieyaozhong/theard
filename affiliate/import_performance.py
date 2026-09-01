from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from affiliate.metrics import AffiliateMetrics, product_performance_score
from core.io import DATA, load_json, save_json

ALIASES = {
    "product_id": ("product_id", "商品ID", "商品編號", "商品代碼"),
    "product_title": ("product_title", "商品名稱", "產品名稱", "Product Name"),
    "sub_id": ("sub_id", "Sub ID", "Sub_Id", "Sub ID 1", "Sub_id1", "sub_id1", "subid", "追蹤代碼"),
    "clicks": ("clicks", "點擊", "點擊數", "總點擊數"),
    "orders": ("orders", "訂單", "訂單數", "有效訂單", "完成訂單"),
    "order_id": ("order_id", "Order ID", "訂單ID", "訂單編號"),
    "revenue": ("revenue", "gmv", "成交金額", "購買金額", "買家購買價格", "商品成交金額"),
    "commission": ("commission", "分潤", "分潤金", "商品分潤", "預估分潤"),
    "ctr": ("ctr", "CTR", "點擊率"),
    "commission_rate": ("commission_rate", "分潤率", "佣金率"),
}


def _clean_number(value: Any) -> float:
    text = str(value or "").strip().replace(",", "").replace("NT$", "").replace("$", "")
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


def _normalized_key(value: str) -> str:
    return "".join(ch for ch in value.casefold() if ch not in " _-")


def _pick(row: dict[str, str], key: str) -> str:
    for alias in ALIASES[key]:
        if alias in row and str(row[alias]).strip():
            return str(row[alias]).strip()
    normalized = {_normalized_key(str(name)): value for name, value in row.items()}
    for alias in ALIASES[key]:
        value = normalized.get(_normalized_key(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def import_performance(csv_path: Path, products_path: Path = DATA / "products.json") -> dict[str, int]:
    products = load_json(products_path)
    if not isinstance(products, list):
        raise ValueError("data/products.json must be a JSON array")

    by_id = {str(item.get("id", "")): item for item in products if isinstance(item, dict)}
    by_sub_id = {
        str(item.get("sub_id", "")): item
        for item in products
        if isinstance(item, dict) and str(item.get("sub_id", "")).strip()
    }
    by_title = {
        str(item.get("title", "")).strip(): item
        for item in products
        if isinstance(item, dict) and str(item.get("title", "")).strip()
    }

    aggregates: dict[str, dict[str, float | int | str]] = defaultdict(
        lambda: {
            "clicks": 0,
            "orders": 0,
            "revenue": 0.0,
            "commission": 0.0,
            "ctr_weight": 0.0,
            "ctr_clicks": 0,
            "commission_rate": 0.0,
            "sub_id": "",
        }
    )
    matched_rows = 0
    skipped = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            product_id = _pick(row, "product_id")
            sub_id = _pick(row, "sub_id")
            product_title = _pick(row, "product_title")
            product = by_id.get(product_id) or by_sub_id.get(sub_id) or by_title.get(product_title)
            if product is None:
                skipped += 1
                continue

            key = str(product.get("id", ""))
            bucket = aggregates[key]
            clicks = int(_clean_number(_pick(row, "clicks")))
            orders = int(_clean_number(_pick(row, "orders")))
            if orders == 0 and _pick(row, "order_id"):
                orders = 1
            revenue = _clean_number(_pick(row, "revenue"))
            commission = _clean_number(_pick(row, "commission"))
            ctr = _clean_number(_pick(row, "ctr"))
            commission_rate = _clean_number(_pick(row, "commission_rate"))

            bucket["clicks"] = int(bucket["clicks"]) + clicks
            bucket["orders"] = int(bucket["orders"]) + orders
            bucket["revenue"] = float(bucket["revenue"]) + revenue
            bucket["commission"] = float(bucket["commission"]) + commission
            if clicks and ctr:
                bucket["ctr_weight"] = float(bucket["ctr_weight"]) + ctr * clicks
                bucket["ctr_clicks"] = int(bucket["ctr_clicks"]) + clicks
            if commission_rate:
                bucket["commission_rate"] = max(float(bucket["commission_rate"]), commission_rate)
            if sub_id:
                bucket["sub_id"] = sub_id
            matched_rows += 1

    updated_products = 0
    for product_id, bucket in aggregates.items():
        product = by_id.get(product_id)
        if product is None:
            continue
        clicks = int(bucket["clicks"])
        orders = int(bucket["orders"])
        ctr_clicks = int(bucket["ctr_clicks"])
        ctr = float(bucket["ctr_weight"]) / ctr_clicks if ctr_clicks else 0.0
        commission_rate = float(bucket["commission_rate"]) or float(product.get("commission_rate", 0) or 0)
        metrics = AffiliateMetrics.build(
            clicks=clicks,
            orders=orders,
            revenue=float(bucket["revenue"]),
            commission=float(bucket["commission"]),
            ctr=ctr,
        )
        product.update({
            "sub_id": str(bucket["sub_id"] or product.get("sub_id", "")),
            "commission_rate": round(commission_rate, 6),
            "clicks": metrics.clicks,
            "orders": metrics.orders,
            "revenue": round(metrics.revenue, 2),
            "commission": round(metrics.commission, 2),
            "ctr": round(metrics.ctr, 6),
            "conversion_rate": round(metrics.conversion_rate, 6),
            "epc": round(metrics.epc, 4),
            "score": product_performance_score(
                conversion_rate=metrics.conversion_rate,
                epc=metrics.epc,
                commission_rate=commission_rate,
                clicks=metrics.clicks,
            ),
        })
        updated_products += 1

    save_json(products_path, products)
    return {"matched": matched_rows, "updated": updated_products, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Shopee affiliate performance CSV into THEARD products.json")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--products", type=Path, default=DATA / "products.json")
    args = parser.parse_args()
    result = import_performance(args.csv_path, args.products)
    print(
        f"matched={result['matched']} updated={result['updated']} "
        f"skipped={result['skipped']} products={args.products}"
    )


if __name__ == "__main__":
    main()
