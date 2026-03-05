from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RUNNEWSENT_CACHE_PREFIX = "run_newsent::"
MAX_RUNNEWSENT_SYNC_ENTRIES = 12000


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    except OSError:
        return None


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def file_meta(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "exists": False,
            "path": str(path),
        }

    stat = path.stat()
    return {
        "exists": True,
        "path": str(path),
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


def extract_translation_tail(data: Any, limit: int) -> list[dict[str, str]]:
    if not isinstance(data, dict):
        return []

    regular_entries: list[dict[str, str]] = []
    runnewsent_entries: list[dict[str, str]] = []
    for key, value in data.items():
        if not isinstance(value, str):
            continue
        text = value.strip()
        if not text:
            continue
        row = {"hash": str(key), "text": text}
        if str(key).startswith(RUNNEWSENT_CACHE_PREFIX):
            runnewsent_entries.append(row)
        else:
            regular_entries.append(row)

    if limit <= 0:
        regular_tail = regular_entries
    else:
        regular_tail = regular_entries[-limit:]

    # Keep all run_newsent outputs so they can always be reflected on web.
    if len(runnewsent_entries) > MAX_RUNNEWSENT_SYNC_ENTRIES:
        runnewsent_entries = runnewsent_entries[-MAX_RUNNEWSENT_SYNC_ENTRIES:]

    return regular_tail + runnewsent_entries


def extract_hash_tail(data: Any, limit: int) -> list[str]:
    if not isinstance(data, list):
        return []

    hashes = [str(item) for item in data if isinstance(item, str) and item.strip()]
    if limit <= 0:
        return hashes
    return hashes[-limit:]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync raw data files from newsai to news_web.")
    parser.add_argument(
        "--source-dir",
        default=r"C:\Cloud_code\newsai",
        help="Source directory containing upstream files.",
    )
    parser.add_argument(
        "--raw-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "raw"),
        help="Output directory for raw synced files.",
    )
    parser.add_argument(
        "--cache-tail",
        type=int,
        default=120,
        help="How many latest translation cache entries to keep.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = Path(args.source_dir)
    raw_dir = Path(args.raw_dir)

    x_path = source_dir / "last_message.json"
    translation_cache_path = source_dir / "translation_cache.json"
    bloomberg_hash_path = source_dir / "app" / "bloomberg_sent_messages.json"

    generated_at = utc_now_iso()

    x_payload = load_json(x_path)
    x_record = x_payload if isinstance(x_payload, dict) else {}

    translation_payload = load_json(translation_cache_path)
    translation_tail = extract_translation_tail(translation_payload, args.cache_tail)
    runnewsent_count = sum(1 for row in translation_tail if str(row.get("hash") or "").startswith(RUNNEWSENT_CACHE_PREFIX))

    bloomberg_payload = load_json(bloomberg_hash_path)
    bloomberg_hash_tail = extract_hash_tail(bloomberg_payload, args.cache_tail)

    write_json(raw_dir / "x_last_message.json", x_record)
    write_json(raw_dir / "translation_cache_tail.json", translation_tail)
    write_json(raw_dir / "bloomberg_hash_tail.json", bloomberg_hash_tail)

    manifest = {
        "generated_at": generated_at,
        "source_dir": str(source_dir),
        "inputs": {
            "last_message": file_meta(x_path),
            "translation_cache": file_meta(translation_cache_path),
            "bloomberg_hashes": file_meta(bloomberg_hash_path),
        },
        "outputs": {
            "x_last_message": str(raw_dir / "x_last_message.json"),
            "translation_cache_tail": str(raw_dir / "translation_cache_tail.json"),
            "bloomberg_hash_tail": str(raw_dir / "bloomberg_hash_tail.json"),
        },
        "counts": {
            "translation_tail": len(translation_tail),
            "run_newsent_tail": runnewsent_count,
            "bloomberg_hash_tail": len(bloomberg_hash_tail),
        },
    }
    write_json(raw_dir / "sync_manifest.json", manifest)

    print(f"[sync] generated_at={generated_at}")
    print(f"[sync] raw_dir={raw_dir}")
    print(f"[sync] translation_tail={len(translation_tail)}")
    print(f"[sync] run_newsent_tail={runnewsent_count}")
    print(f"[sync] bloomberg_hash_tail={len(bloomberg_hash_tail)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
