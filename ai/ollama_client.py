from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str = "http://127.0.0.1:11434"
    model: str = "qwen3:4b"
    timeout: int = 45


def generate(prompt: str, config: OllamaConfig = OllamaConfig()) -> str:
    """Generate text with a local Ollama server.

    This module never calls OpenAI. It is intentionally optional so THEARD keeps
    its deterministic content generator as a zero-dependency fallback.
    """
    payload = json.dumps({
        "model": config.model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.7},
    }).encode("utf-8")
    request = Request(
        f"{config.base_url.rstrip('/')}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=config.timeout) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Ollama is unavailable: {exc}") from exc
    text = str(raw.get("response", "")).strip()
    if not text:
        raise RuntimeError("Ollama returned an empty response")
    return text


def affiliate_caption_prompt(topic: str, products: list[dict]) -> str:
    product_lines = "\n".join(
        f"- {item.get('title', '')}｜{item.get('category', '')}｜score {item.get('score', 0)}"
        for item in products
    )
    return f"""你是台灣 Threads 生活內容編輯。\n主題：{topic}\n候選商品：\n{product_lines}\n\n請寫 1 則繁體中文生活型主文，60-120 字。\n規則：\n1. 先寫真實生活情境，不要像硬廣告。\n2. 不捏造價格、折扣、療效、銷量或使用心得。\n3. 不在主文塞分潤網址，商品網址由留言流程處理。\n4. 語氣自然、可閱讀，可有一個問題或小觀察。\n5. 只輸出主文，不加標題與說明。\n"""
