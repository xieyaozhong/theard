from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from affiliate.metrics import product_performance_score
from core.models import Product

CATEGORY_ALIASES = {
    "床邊小物": "床邊",
    "牆面佈置": "牆面",
    "租屋生活": "租屋用品",
}


def _business_score(product: Product) -> float:
    if product.score > 0:
        return product.score
    if not product.has_performance_data and product.commission_rate <= 0:
        return 25.0
    return product_performance_score(
        conversion_rate=product.conversion_rate,
        epc=product.epc,
        commission_rate=product.commission_rate,
        clicks=product.clicks,
    )


def _score(product: Product, topic: str, recent_ids: set[str]) -> tuple[float, float, int, int, str]:
    haystack = " ".join((product.title, product.category, *product.tags)).lower()
    words = [w for w in topic.lower().replace("、", " ").split() if w]
    relevance = sum(4 for word in words if word in haystack)
    if topic.lower() in haystack:
        relevance += 6

    freshness = -12 if product.id in recent_ids else 0
    usage_penalty = min(product.use_count, 12) * 0.75
    business = _business_score(product)

    # Topic relevance remains dominant enough that a high-EPC but unrelated item
    # will not replace a genuinely relevant product. Business performance then
    # acts as the primary tie-breaker inside the relevant product pool.
    blended = relevance * 4.0 + business * 0.65 + freshness - usage_penalty
    return (blended, business, -product.use_count, len(product.tags), product.id)


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
