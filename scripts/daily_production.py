from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.content_agent import generate_caption
from agents.product_agent import select_products
from ai.ollama_client import OllamaConfig, affiliate_caption_prompt, generate as ollama_generate
from core.io import DATA, PREVIEW, load_json, save_json
from core.models import Product, Topic
from scripts.smart_topic_selector import select_topics


def _caption_for_topic(topic: Topic, chosen: list[Product], index: int) -> tuple[str, str, str]:
    fallback = generate_caption(topic.name, salt=f"daily-{index}")
    if os.getenv("THEARD_LOCAL_AI", "0").strip() not in {"1", "true", "TRUE", "yes", "YES"}:
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
    raw_topics = load_json(DATA / "topics.json")
    raw_products = load_json(DATA / "products.json")
    history = load_json(DATA / "post-history.json", default=[])
    topics = [Topic.from_dict(item) for item in raw_topics]
    products = [Product.from_dict(item) for item in raw_products]
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
            "products": [
                {
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
                for product in chosen
            ],
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
