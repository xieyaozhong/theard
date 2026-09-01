from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from affiliate.import_links import ALIASES as LINK_ALIASES, import_links
from affiliate.import_performance import ALIASES as PERFORMANCE_ALIASES, import_performance

DEFAULT_STATE = ROOT / ".theard-shopee-sync.json"


def _alias_set(groups: dict[str, tuple[str, ...]]) -> set[str]:
    return {alias.casefold() for aliases in groups.values() for alias in aliases}


def _read_headers(path: Path) -> set[str]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            row = next(reader, [])
    except (UnicodeDecodeError, OSError):
        return set()
    return {str(value).strip().casefold() for value in row if str(value).strip()}


def classify_csv(path: Path) -> str:
    headers = _read_headers(path)
    if not headers:
        return "unknown"

    link_aliases = _alias_set(LINK_ALIASES)
    performance_aliases = _alias_set(PERFORMANCE_ALIASES)
    link_hits = len(headers & link_aliases)
    performance_hits = len(headers & performance_aliases)

    has_affiliate_link = any(
        alias.casefold() in headers for alias in LINK_ALIASES["affiliate_url"]
    )
    if has_affiliate_link and link_hits >= 1:
        return "links"
    if performance_hits >= 2:
        return "performance"
    return "unknown"


def _load_state(path: Path) -> dict[str, float]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_state(path: Path, state: dict[str, float]) -> None:
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync_once(downloads: Path, state_path: Path = DEFAULT_STATE) -> dict[str, int]:
    downloads = downloads.expanduser().resolve()
    state = _load_state(state_path)
    result = {"links": 0, "performance": 0, "unknown": 0, "errors": 0}

    if not downloads.exists():
        raise FileNotFoundError(downloads)

    candidates = sorted(
        (path for path in downloads.glob("*.csv") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
    )

    for path in candidates:
        key = str(path.resolve())
        modified = path.stat().st_mtime
        if state.get(key) == modified:
            continue

        kind = classify_csv(path)
        try:
            if kind == "links":
                import_links(path)
                result["links"] += 1
            elif kind == "performance":
                import_performance(path)
                result["performance"] += 1
            else:
                result["unknown"] += 1
                continue
        except Exception:
            result["errors"] += 1
            continue

        state[key] = modified

    _save_state(state_path, state)
    return result


def default_downloads_path() -> Path:
    configured = os.getenv("THEARD_SHOPEE_DOWNLOADS", "").strip()
    return Path(configured) if configured else Path.home() / "Downloads"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Watch the local Downloads handoff from Shopee Affiliate. "
            "This never logs in to Shopee or stores account credentials."
        )
    )
    parser.add_argument("--downloads", type=Path, default=default_downloads_path())
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    args = parser.parse_args()
    result = sync_once(args.downloads, args.state)
    print(
        "shopee_bridge "
        f"links={result['links']} performance={result['performance']} "
        f"unknown={result['unknown']} errors={result['errors']}"
    )


if __name__ == "__main__":
    main()
