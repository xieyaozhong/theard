# THEARD — Threads × Shopee Affiliate AI

A maintainable, file-based content production system for creating Taiwan-style Threads posts, matching Shopee affiliate products, validating publishing payloads, and safely preparing posts for the Threads API.

## What is included

- Content Agent: generates short Traditional Chinese lifestyle captions.
- Product Agent: selects active products by topic/category and avoids recent reuse.
- Smart Topic Selector: rotates topics with priority and history penalties.
- Daily Production: creates three preview posts with four products each.
- URL Strategy: validates reply links and prefers official Shopee affiliate short links.
- Publisher Pipeline: validates content before any network call.
- Threads Publisher: uses the official Threads Graph API when explicitly enabled.
- Safe Runner: dry-run by default; real publishing needs explicit confirmation.
- Showcase Site: static immersive portfolio-style project page under `site/`.

## Quick start

```powershell
python --version
python -m unittest discover -s tests -v
python scripts/daily_production.py
python scripts/publisher_pipeline.py
python scripts/publisher_run.py
```

Dry-run is the default. A real publish requires environment variables plus:

```powershell
python scripts/publisher_run.py --publish --confirm PUBLISH_THREADS_NOW
```

## Environment

Copy `.env.example` to `.env` and fill values locally. Never commit `.env`.

```text
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=
THREADS_API_BASE_URL=https://graph.threads.net/v1.0
```

## Showcase

Open `site/index.html` locally, or deploy `site/` with the included GitHub Pages workflow. The visual direction is inspired by contemporary creative-developer portfolios: large typography, numbered sections, strong contrast, motion, and an interactive canvas background — without copying another site's content or assets.
