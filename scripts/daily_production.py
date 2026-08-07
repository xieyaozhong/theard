from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.content_agent import generate_caption
from agents.product_agent import select_products
from core.io import DATA, PREVIEW, load_json, save_json
from core.models import Product, Topic
from scripts.smart_topic_selector import select_topics


def build_daily_previews() -> list[dict]:
    raw_topics = load_json(DATA / "topics.json")
    raw_products = load_json(DATA / "products.json")
    history = load_json(DATA / "post-history.json", default=[])
    topics = [Topic.from_dict(item) for item in raw_topics]
    products = [Product.from_dict(item) for item in raw_products]
    recent_ids = {pid for post in history[-10:] for pid in post.get("product_ids", [])}

    previews = []
    for index, topic in enumerate(select_topics(topics, limit=3), start=1):
        caption = generate_caption(topic.name, salt=f"daily-{index}")
        chosen = select_products(products, topic.name, limit=4, recent_ids=recent_ids)
        previews.append({
            "id": f"post-{index:03d}",
            "topic": topic.name,
            "caption": caption.content,
            "similarity_hash": caption.similarity_hash,
            "products": [
                {
                    "id": product.id,
                    "title": product.title,
                    "category": product.category,
                    "reply_url": product.reply_url,
                } for product in chosen
            ],
        })

    PREVIEW.mkdir(parents=True, exist_ok=True)
    save_json(PREVIEW / "daily.json", previews)
    return previews


def main() -> None:
    previews = build_daily_previews()
    print(f"Generated {len(previews)} preview posts -> preview/daily.json")
    for post in previews:
        print(f"- {post['id']}: {post['caption']} ({len(post['products'])} products)")


if __name__ == "__main__":
    main()
