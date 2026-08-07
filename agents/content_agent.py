from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone

OPENINGS = (
    "最近才發現，{topic}其實不用一次全部改完。",
    "房間順眼很多，常常只是先把{topic}整理對。",
    "如果空間不大，我會先從{topic}開始調整。",
    "租屋最有感的改變，往往藏在{topic}這種小地方。",
    "不用大改房間，把{topic}處理好就差很多。",
)


@dataclass(frozen=True)
class CaptionResult:
    content: str
    similarity_hash: str
    created_at: str


def clean_topic(topic: str) -> str:
    value = re.sub(r"\s+", "", topic or "").strip("，。！？!? /|#")
    if len(value) < 2:
        raise ValueError("topic must contain at least two meaningful characters")
    return value[:18]


def generate_caption(topic: str, salt: str = "") -> CaptionResult:
    topic = clean_topic(topic)
    digest = hashlib.sha256(f"{topic}|{salt}".encode("utf-8")).hexdigest()
    template = OPENINGS[int(digest[:8], 16) % len(OPENINGS)]
    content = template.format(topic=topic)
    if len(content) > 42:
        content = content[:41] + "。"
    return CaptionResult(
        content=content,
        similarity_hash=hashlib.sha1(content.encode("utf-8")).hexdigest()[:16],
        created_at=datetime.now(timezone.utc).isoformat(),
    )
