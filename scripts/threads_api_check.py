from __future__ import annotations

import os

REQUIRED = ("THREADS_ACCESS_TOKEN", "THREADS_USER_ID")


def check_environment() -> tuple[bool, list[str]]:
    missing = [name for name in REQUIRED if not os.environ.get(name, "").strip()]
    return not missing, missing


def main() -> None:
    ready, missing = check_environment()
    if ready:
        print("Threads API config ready")
    else:
        print("Threads API config incomplete:", ", ".join(missing))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
