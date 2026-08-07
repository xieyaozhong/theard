from __future__ import annotations

import os
from scripts.threads_publisher import ThreadsPublishError, _post_form


def publish_reply(parent_threads_id: str, text: str) -> dict:
    token = os.environ.get("THREADS_ACCESS_TOKEN", "").strip()
    user_id = os.environ.get("THREADS_USER_ID", "").strip()
    base = os.environ.get("THREADS_API_BASE_URL", "https://graph.threads.net/v1.0").rstrip("/")
    if not token or not user_id:
        raise ThreadsPublishError("Missing Threads credentials")
    container = _post_form(f"{base}/{user_id}/threads", {
        "media_type": "TEXT",
        "text": text,
        "reply_to_id": parent_threads_id,
        "access_token": token,
    })
    creation_id = container.get("id")
    if not creation_id:
        raise ThreadsPublishError(f"Reply container creation failed: {container}")
    return _post_form(f"{base}/{user_id}/threads_publish", {
        "creation_id": creation_id,
        "access_token": token,
    })
