from __future__ import annotations

from datetime import date

from core.models import Topic


def select_topics(topics: list[Topic], limit: int = 3) -> list[Topic]:
    active = [topic for topic in topics if topic.active]
    active.sort(key=lambda t: (-t.priority, t.last_used or "0000-00-00", t.id))
    return active[:limit]


def mark_topic_used(raw_topics: list[dict], topic_id: str) -> None:
    for item in raw_topics:
        if str(item.get("id")) == topic_id:
            item["last_used"] = date.today().isoformat()
            return
