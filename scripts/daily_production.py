from __future__ import annotations

import hashlib
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.content_agent import generate_caption
from agents.product_agent import select_products
from ai.ollama_client import OllamaConfig, affiliate_caption_prompt, generate as ollama_generate
from core.io import DATA, PREVIEW, load_json, save_json
from core.models import Product, Topic
from scripts.smart_topic_selector import select_topics

LINK_POOL_CATEGORY = "蝦皮連結池"
LINK_POOL_CAPTIONS = (
    "今天整理了 4 個連結放留言，有需要再慢慢看 👇",
    "今天的四個選物連結整理好了，想看的我放留言 👇",
    "把今天看到的四個連結收成一組，放留言給需要的人 👇",
    "今天先整理四個連結，想逛的直接看留言就好 👇",
)


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _link_pool_post_count() -> int:
    try:
        value = int(os.getenv("THEARD_DAILY_POSTS", "1"))
    except ValueError:
        value = 1
    return max(1, min(value, 6))


def _product_payload(product: Product) -> dict:
    return {
        "id": product.id,
        "title": product.title,
        "category": product.category,
        "reply_url": product.reply_url,
        "sub_id": product.sub_id,
        "affiliate_score": product.score,
        "commission_rate": product.commission_rate,
        "conversion_rate": product.conversion_rate,
        "epc": product.epc,
    }


def _build_link_pool_previews(products: list[Product]) -> list[dict]:
    pool = sorted(
        (
            product
            for product in products
            if product.active and product.reply_url and product.category == LINK_POOL_CATEGORY
        ),
        key=lambda product: product.id,
    )
    if len(pool) < 4:
        raise RuntimeError("THEARD link-pool mode requires at least 4 active Shopee links")

    post_count = _link_pool_post_count()
    today = datetime.now(ZoneInfo("Asia/Taipei")).date()
    start = (today.toordinal() * post_count * 4) % len(pool)
    previews: list[dict] = []

    for index in range(1, post_count + 1):
        offset = start + (index - 1) * 4
        chosen = [pool[(offset + item) % len(pool)] for item in range(4)]
        caption = LINK_POOL_CAPTIONS[(today.toordinal() + index - 1) % len(LINK_POOL_CAPTIONS)]
        similarity_hash = hashlib.sha1(
            f"{today.isoformat()}|{index}|{caption}".encode("utf-8")
        ).hexdigest()[:16]
        previews.append({
            "id": f"post-{index:03d}",
            "topic": "每日選物",
            "caption": caption,
            "caption_source": "link-pool-safe",
            "similarity_hash": similarity_hash,
            "products": [_product_payload(product) for product in chosen],
        })

    return previews


def _caption_for_topic(topic: Topic, chosen: list[Product], index: int) -> tuple[str, str, str]:
    fallback = generate_caption(topic.name, salt=f"daily-{index}")
    if not _flag("THEARD_LOCAL_AI"):
        return fallback.content, fallback.similarity_hash, "deterministic"

    model = os.getenv("OLLAMA_MODEL", "qwen3:4b").strip() or "qwen3:4b"
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").strip()
    prompt_products = [
        {
            "title": product.title,
            "category": product.category,
            "score": product.score,
        }
        for product in chosen
    ]
    try:
        content = ollama_generate(
            affiliate_caption_prompt(topic.name, prompt_products),
            OllamaConfig(base_url=base_url, model=model),
        ).strip()
        if not content:
            raise RuntimeError("empty local AI content")
        return content[:480], fallback.similarity_hash, f"ollama:{model}"
    except RuntimeError as exc:
        print(f"[local-ai fallback] {exc}", file=sys.stderr)
        return fallback.content, fallback.similarity_hash, "deterministic-fallback"


def build_daily_previews() -> list[dict]:
    raw_products = load_json(DATA / "products.json")
    products = [Product.from_dict(item) for item in raw_products]

    if _flag("THEARD_LINK_POOL_MODE"):
        previews = _build_link_pool_previews(products)
        PREVIEW.mkdir(parents=True, exist_ok=True)
        save_json(PREVIEW / "daily.json", previews)
        return previews

    raw_topics = load_json(DATA / "topics.json")
    history = load_json(DATA / "post-history.json", default=[])
    topics = [Topic.from_dict(item) for item in raw_topics]
    recent_ids = {pid for post in history[-10:] for pid in post.get("product_ids", [])}

    previews = []
    for index, topic in enumerate(select_topics(topics, limit=3), start=1):
        chosen = select_products(products, topic.name, limit=4, recent_ids=recent_ids)
        caption, similarity_hash, caption_source = _caption_for_topic(topic, chosen, index)
        previews.append({
            "id": f"post-{index:03d}",
            "topic": topic.name,
            "caption": caption,
            "caption_source": caption_source,
            "similarity_hash": similarity_hash,
            "products": [_product_payload(product) for product in chosen],
        })

    PREVIEW.mkdir(parents=True, exist_ok=True)
    save_json(PREVIEW / "daily.json", previews)
    return previews


def main() -> None:
    previews = build_daily_previews()
    print(f"Generated {len(previews)} preview posts -> preview/daily.json")
    for post in previews:
        print(
            f"- {post['id']}: {post['caption']} "
            f"({len(post['products'])} products / {post['caption_source']})"
        )


if __name__ == "__main__":
    main()
