#!/usr/bin/env python3
"""Generate THEARD's public trend signals and editorial article payload.

No secret is ever written to the website. OPENAI_API_KEY is optional and is
expected to be provided by the GitHub Actions secret store. Without it, the
script still produces a deterministic editorial fallback from fresh signals.
"""
from __future__ import annotations

import json
import math
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site" / "data" / "trend-article.json"
TAIPEI = timezone(timedelta(hours=8))
UA = "THEARD-Trend-Engine/1.0 (+https://xieyaozhong.github.io/theard/)"


def fetch_bytes(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_json(url: str, timeout: int = 15) -> Any:
    return json.loads(fetch_bytes(url, timeout).decode("utf-8"))


def parse_traffic(value: str | None) -> int:
    if not value:
        return 0
    s = value.upper().replace(",", "").replace("+", "").strip()
    m = re.search(r"([0-9.]+)\s*([KMB]?)", s)
    if not m:
        return 0
    n = float(m.group(1))
    mult = {"": 1, "K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[m.group(2)]
    return int(n * mult)


def score_from_traffic(n: int) -> int:
    if n <= 0:
        return 70
    return max(70, min(100, round(64 + math.log10(max(n, 10)) * 6.5)))


def google_trends_tw(limit: int = 10) -> list[dict[str, Any]]:
    url = "https://trends.google.com/trending/rss?geo=TW"
    try:
        root = ET.fromstring(fetch_bytes(url))
    except Exception as e:
        print(f"Google Trends unavailable: {e}")
        return []

    ns = "{https://trends.google.com/trending/rss}"
    rows: list[dict[str, Any]] = []
    for item in root.findall(".//item")[:limit]:
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        traffic_text = (item.findtext(f"{ns}approx_traffic") or "").strip()
        traffic = parse_traffic(traffic_text)
        news_title = ""
        news_url = ""
        news = item.find(f"{ns}news_item")
        if news is not None:
            news_title = (news.findtext(f"{ns}news_item_title") or "").strip()
            news_url = (news.findtext(f"{ns}news_item_url") or "").strip()
        rows.append({
            "title": title,
            "source": "GOOGLE TRENDS / TW",
            "score": score_from_traffic(traffic),
            "traffic": traffic_text,
            "url": news_url or f"https://trends.google.com/trending?geo=TW",
            "context": news_title,
        })
    return rows


def hacker_news(limit: int = 12) -> list[dict[str, Any]]:
    try:
        ids = fetch_json("https://hacker-news.firebaseio.com/v0/topstories.json")[:limit]
    except Exception as e:
        print(f"HN index unavailable: {e}")
        return []

    rows: list[dict[str, Any]] = []
    for story_id in ids:
        try:
            item = fetch_json(f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json", 10)
        except Exception:
            continue
        if not isinstance(item, dict) or item.get("type") != "story" or not item.get("title"):
            continue
        score = int(item.get("score") or 0)
        comments = int(item.get("descendants") or 0)
        signal = min(99, max(68, round(64 + math.log10(max(score + comments * 2, 10)) * 9)))
        rows.append({
            "title": str(item["title"]).strip(),
            "source": "HACKER NEWS",
            "score": signal,
            "traffic": f"{score} pts / {comments} comments",
            "url": item.get("url") or f"https://news.ycombinator.com/item?id={story_id}",
            "context": "High-engagement technology discussion",
        })
    return rows


def dedupe_and_rank(signals: list[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for s in sorted(signals, key=lambda x: int(x.get("score") or 0), reverse=True):
        key = re.sub(r"\W+", "", str(s.get("title", "")).lower())[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(s)
        if len(out) >= limit:
            break
    return out


def fallback_signals() -> list[dict[str, Any]]:
    return [
        {"title": "AI agents are moving from demos into persistent workflows", "source": "SYSTEM FALLBACK", "score": 82, "traffic": "", "url": "https://news.ycombinator.com/", "context": "Automation, software and human judgment"},
        {"title": "The cost of creating software continues to fall", "source": "SYSTEM FALLBACK", "score": 78, "traffic": "", "url": "https://news.ycombinator.com/", "context": "Creation cost and market expansion"},
        {"title": "AI capability is advancing faster than organizational evaluation", "source": "SYSTEM FALLBACK", "score": 76, "traffic": "", "url": "https://arxiv.org/", "context": "Governance and evaluation"},
    ]


def source_for(signal: dict[str, Any]) -> list[dict[str, str]]:
    return [{
        "source": str(signal.get("source") or "PUBLIC SIGNAL"),
        "title": str(signal.get("title") or "Trend signal"),
        "url": str(signal.get("url") or ""),
    }]


def fallback_article(signal: dict[str, Any], i: int) -> dict[str, Any]:
    topic = str(signal.get("title") or "正在上升的趨勢")
    context = str(signal.get("context") or "")
    return {
        "topic": topic,
        "mode": "LOCAL / SIGNAL SYNTHESIS",
        "angle": ["STRUCTURE × BEHAVIOR", "TECH × ECONOMICS", "SYSTEM × SECOND ORDER"][i % 3],
        "title": f"當「{topic}」開始升溫，我們真正該看的不是熱度",
        "dek": "熱門只告訴我們注意力正在移動；深度判斷要追的是成本、權力、行為與制度，究竟哪一個已經開始改變。",
        "sections": [
            {"label": "01 / WHAT CHANGED", "text": f"目前的公開訊號把「{topic}」推到更高的注意力位置。{context + '。' if context else ''}但單一熱門事件本身並不足以構成趨勢，真正值得追的是它是否開始改變人們的選擇、組織的資源配置，或原本被視為固定不變的工作流程。"},
            {"label": "02 / UNDER THE SURFACE", "text": "快速擴散的主題背後，通常至少有一項結構正在鬆動：成本下降、工具變得普及、規則重新配置、信任轉移，或新的入口讓原本無法參與的人進場。判斷趨勢最重要的不是預測搜尋量，而是辨認這項結構改變是否具有持續性。"},
            {"label": "03 / SECOND ORDER", "text": "第一層影響通常很直觀，例如更多使用、更多討論或更多投資；第二層才是長期差異真正發生的地方。平台會調整規則，工作角色會重新拆分，品牌與資本會改變分配方式，甚至原本不屬於這個市場的人也會進場。"},
            {"label": "04 / COUNTERPOINT", "text": "熱門也會製造錯覺。媒體集中報導、單一事件或社群情緒，都可能讓短期聲量看起來像長期需求。因此一個有用的反證問題是：如果明天熱搜消失，哪些行為、成本或制度變化仍然會留下？"},
            {"label": "05 / THE QUESTION", "text": "與其問這是不是下一個風口，更值得問的是：如果這個訊號代表的結構真的成立，六個月後人們會停止做哪件事，又會開始把什麼視為理所當然？"},
        ],
        "sources": source_for(signal),
    }


def extract_response_text(data: dict[str, Any]) -> str:
    direct = data.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks: list[str] = []
    for item in data.get("output", []) or []:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for c in item.get("content", []) or []:
            if isinstance(c, dict) and c.get("type") in {"output_text", "text"} and c.get("text"):
                chunks.append(str(c["text"]))
    return "\n".join(chunks).strip()


def clean_json_text(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    return text


def generate_with_openai(signals: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        return None
    model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna").strip() or "gpt-5.6-luna"
    instructions = """You are the editorial intelligence engine for THEARD. Write in natural Traditional Chinese used in Taiwan. Transform current public trend signals into rigorous thought pieces, not news rewrites and not clickbait. Distinguish what is directly supported by the supplied signals from interpretation. Never invent dates, numbers, quotes, people, causal claims, or events that are not in the supplied signal. If detail is thin, analyze structure rather than fabricating facts. Each article must have a clear thesis, underlying mechanism, second-order effect, counterpoint, and one sharp closing question. Return JSON only, with no markdown fences."""
    schema_request = {
        "task": "Choose three different high-value signals and write three deep articles.",
        "language": "zh-Hant-TW",
        "length": "roughly 700-1100 Chinese characters per article",
        "output_shape": {
            "articles": [{
                "topic": "exact signal title",
                "mode": "AUTO / AI EDITORIAL",
                "angle": "short uppercase editorial lens",
                "title": "article title",
                "dek": "1-2 sentence thesis deck",
                "sections": [
                    {"label": "01 / WHAT CHANGED", "text": "..."},
                    {"label": "02 / UNDER THE SURFACE", "text": "..."},
                    {"label": "03 / SECOND ORDER", "text": "..."},
                    {"label": "04 / COUNTERPOINT", "text": "..."},
                    {"label": "05 / THE QUESTION", "text": "..."}
                ],
                "sources": [{"source": "source name", "title": "signal title", "url": "signal url"}]
            }]
        },
        "signals": signals[:10],
    }
    payload = {
        "model": model,
        "instructions": instructions,
        "input": json.dumps(schema_request, ensure_ascii=False),
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "medium"},
        "max_output_tokens": 7000,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
        parsed = json.loads(clean_json_text(extract_response_text(data)))
        articles = parsed.get("articles") if isinstance(parsed, dict) else None
        if not isinstance(articles, list) or not articles:
            raise ValueError("model returned no articles")
        allowed = {str(s["title"]): s for s in signals}
        clean: list[dict[str, Any]] = []
        for a in articles[:3]:
            if not isinstance(a, dict):
                continue
            topic = str(a.get("topic") or "")
            signal = allowed.get(topic)
            if not signal:
                continue
            a["mode"] = "AUTO / AI EDITORIAL"
            a["sources"] = source_for(signal)
            clean.append(a)
        return clean or None
    except Exception as e:
        print(f"OpenAI editorial generation failed; using fallback: {e}")
        return None


def main() -> None:
    signals = dedupe_and_rank(google_trends_tw(10) + hacker_news(12), 12)
    if len(signals) < 3:
        signals = dedupe_and_rank(signals + fallback_signals(), 12)
    ai_articles = generate_with_openai(signals)
    articles = ai_articles or [fallback_article(s, i) for i, s in enumerate(signals[:3])]
    payload = {
        "generated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "mode": "OPENAI / AUTO EDITORIAL" if ai_articles else "LOCAL / AUTO SIGNAL SYNTHESIS",
        "signals": signals,
        "articles": articles,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(signals)} signals and {len(articles)} articles")


if __name__ == "__main__":
    main()
