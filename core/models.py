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
        )

    @property
    def reply_url(self) -> str:
        return self.affiliate_short_url or self.affiliate_url
