from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from core.models import Product

CATEGORY_ALIASES = {
    "床邊小物": "床邊",
    "牆面佈置": "牆面",
    "租屋生活": "租屋用品",
}


def _score(product: Product, topic: str, recent_ids: set[str]) -> tuple[int, int, int, str]:
    haystack = " ".join((product.title, product.category, *product.tags)).lower()
    words = [w for w in topic.lower().replace("、", " ").split() if w]
    relevance = sum(4 for word in words if word in haystack)
    if topic.lower() in haystack:
        relevance += 6
    freshness = -8 if product.id in recent_ids else 0
    return (relevance + freshness, -product.use_count, len(product.tags), product.id)


def select_products(
    products: Iterable[Product],
    topic: str,
    limit: int = 4,
    recent_ids: set[str] | None = None,
) -> list[Product]:
    recent_ids = recent_ids or set()
    active = [p for p in products if p.active and p.reply_url]
    active.sort(key=lambda p: _score(p, topic, recent_ids), reverse=True)

    selected: list[Product] = []
    category_count: dict[str, int] = defaultdict(int)
    for product in active:
        category = CATEGORY_ALIASES.get(product.category, product.category)
        if category_count[category] == 0:
            selected.append(product)
            category_count[category] += 1
        if len(selected) == limit:
            return selected

    for product in active:
        if product not in selected:
            selected.append(product)
        if len(selected) == limit:
            break
    return selected
