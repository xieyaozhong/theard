from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from affiliate.metrics import AffiliateMetrics, product_performance_score
from core.io import DATA, load_json, save_json

ALIASES = {
    "product_id": ("product_id", "商品ID", "商品編號", "商品代碼"),
    "sub_id": ("sub_id", "Sub ID", "subid", "追蹤代碼"),
    "clicks": ("clicks", "點擊", "點擊數"),
    "orders": ("orders", "訂單", "訂單數", "有效訂單"),
    "revenue": ("revenue", "gmv", "成交金額", "購買金額"),
    "commission": ("commission", "分潤", "分潤金", "商品分潤"),
    "ctr": ("ctr", "CTR", "點擊率"),
    "commission_rate": ("commission_rate", "分潤率", "佣金率"),
}


def _clean_number(value: Any) -> float:
    text = str(value or "").strip().replace(",", "").replace("$", "").replace("NT$", "")
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


def _pick(row: dict[str, str], key: str) -> str:
    for alias in ALIASES[key]:
        if alias in row and str(row[alias]).strip():
            return str(row[alias]).strip()
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

    matched = 0
    skipped = 0
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            product_id = _pick(row, "product_id")
            sub_id = _pick(row, "sub_id")
            product = by_id.get(product_id) or by_sub_id.get(sub_id)
            if product is None:
                skipped += 1
                continue

            clicks = int(_clean_number(_pick(row, "clicks")))
            orders = int(_clean_number(_pick(row, "orders")))
            revenue = _clean_number(_pick(row, "revenue"))
            commission = _clean_number(_pick(row, "commission"))
            ctr = _clean_number(_pick(row, "ctr"))
            commission_rate = _clean_number(_pick(row, "commission_rate")) or float(product.get("commission_rate", 0) or 0)
            metrics = AffiliateMetrics.build(
                clicks=clicks,
                orders=orders,
                revenue=revenue,
                commission=commission,
                ctr=ctr,
            )

            product.update({
                "sub_id": sub_id or str(product.get("sub_id", "")),
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
            matched += 1

    save_json(products_path, products)
    return {"matched": matched, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Shopee affiliate performance CSV into THEARD products.json")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--products", type=Path, default=DATA / "products.json")
    args = parser.parse_args()
    result = import_performance(args.csv_path, args.products)
    print(f"matched={result['matched']} skipped={result['skipped']} products={args.products}")


if __name__ == "__main__":
    main()
