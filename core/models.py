from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Topic:
    id: str
    name: str
    priority: int = 1
    last_used: str = ""
    active: bool = True

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Topic":
        return cls(
            id=str(raw["id"]),
            name=str(raw["name"]).strip(),
            priority=int(raw.get("priority", 1)),
            last_used=str(raw.get("last_used", "")),
            active=bool(raw.get("active", True)),
        )


@dataclass(frozen=True)
class Product:
    id: str
    title: str
    category: str
    affiliate_url: str
    affiliate_short_url: str = ""
    tags: tuple[str, ...] = ()
    last_used: str = ""
    use_count: int = 0
    active: bool = True
    sub_id: str = ""
    price: float = 0.0
    commission_rate: float = 0.0
    clicks: int = 0
    orders: int = 0
    revenue: float = 0.0
    commission: float = 0.0
    ctr: float = 0.0
    conversion_rate: float = 0.0
    epc: float = 0.0
    score: float = 0.0

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Product":
        return cls(
            id=str(raw["id"]),
            title=str(raw["title"]).strip(),
            category=str(raw["category"]).strip(),
            affiliate_url=str(raw.get("affiliate_url", "")).strip(),
            affiliate_short_url=str(raw.get("affiliate_short_url", "")).strip(),
            tags=tuple(str(tag).strip() for tag in raw.get("tags", [])),
            last_used=str(raw.get("last_used", "")),
            use_count=int(raw.get("use_count", 0)),
            active=bool(raw.get("active", True)),
            sub_id=str(raw.get("sub_id", "")).strip(),
            price=float(raw.get("price", 0) or 0),
            commission_rate=float(raw.get("commission_rate", 0) or 0),
            clicks=int(raw.get("clicks", 0) or 0),
            orders=int(raw.get("orders", 0) or 0),
            revenue=float(raw.get("revenue", 0) or 0),
            commission=float(raw.get("commission", 0) or 0),
            ctr=float(raw.get("ctr", 0) or 0),
            conversion_rate=float(raw.get("conversion_rate", 0) or 0),
            epc=float(raw.get("epc", 0) or 0),
            score=float(raw.get("score", 0) or 0),
        )

    @property
    def reply_url(self) -> str:
        return self.affiliate_short_url or self.affiliate_url

    @property
    def has_performance_data(self) -> bool:
        return self.clicks > 0 or self.orders > 0 or self.commission > 0
