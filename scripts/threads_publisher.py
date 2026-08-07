from __future__ import annotations

import json
import os
from urllib import parse, request


class ThreadsPublishError(RuntimeError):
    pass


def _post_form(url: str, payload: dict[str, str]) -> dict:
    body = parse.urlencode(payload).encode("utf-8")
    req = request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise ThreadsPublishError(str(exc)) from exc


def publish_text(text: str) -> dict:
    token = os.environ.get("THREADS_ACCESS_TOKEN", "").strip()
    user_id = os.environ.get("THREADS_USER_ID", "").strip()
    base = os.environ.get("THREADS_API_BASE_URL", "https://graph.threads.net/v1.0").rstrip("/")
    if not token or not user_id:
        raise ThreadsPublishError("Missing Threads credentials")
    container = _post_form(f"{base}/{user_id}/threads", {
        "media_type": "TEXT",
        "text": text,
        "access_token": token,
    })
    creation_id = container.get("id")
    if not creation_id:
        raise ThreadsPublishError(f"Container creation failed: {container}")
    return _post_form(f"{base}/{user_id}/threads_publish", {
        "creation_id": creation_id,
        "access_token": token,
    })
