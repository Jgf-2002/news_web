from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

UTC_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
SYMBOL_RE = re.compile(r"\b[A-Z]{1,5}\b")
RUNNEWSENT_CACHE_PREFIX = "run_newsent::"

STOPWORDS = {
    "A",
    "AN",
    "AND",
    "ARE",
    "AS",
    "AT",
    "BE",
    "BY",
    "FOR",
    "FROM",
    "HAS",
    "IN",
    "IS",
    "IT",
    "OF",
    "ON",
    "OR",
    "THAT",
    "THE",
    "TO",
    "WAS",
    "WERE",
    "WITH",
    "WILL",
    "ALL",
    "ANY",
    "CAN",
    "NOT",
    "NOW",
    "YOU",
    "YOUR",
    "USD",
    "NYSE",
    "NASDAQ",
    "BREAKING",
    "ALERT",
    "LIVE",
    "ARMY",
    "FED",
    "CPI",
    "PPI",
}

CRITICAL_TERMS = {
    "BREAKING",
    "ALERT",
    "ATTACK",
    "STRIKE",
    "MISSILE",
    "INVASION",
    "BLAST",
    "EXPLOSION",
    "EMERGENCY",
    "BLACKOUT",
}

WARNING_TERMS = {
    "DOWNGRADE",
    "TARIFF",
    "RATE",
    "INFLATION",
    "RISK",
    "VOLATILITY",
    "SELL",
    "CUT",
}

POSITIVE_TERMS = {
    "BEAT",
    "UPGRADE",
    "RALLY",
    "SURGE",
    "GAIN",
    "HIGH",
    "RISE",
    "APPROVAL",
}

NEGATIVE_TERMS = {
    "MISS",
    "DOWNGRADE",
    "DROP",
    "CRASH",
    "FALL",
    "LOW",
    "RISK",
    "CUT",
    "WAR",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, fallback: Any) -> Any:
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_iso(ts: str | None) -> datetime:
    if not ts or not isinstance(ts, str):
        return UTC_EPOCH
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return UTC_EPOCH


def is_run_newsent_hash(cache_hash: str) -> bool:
    return str(cache_hash or "").startswith(RUNNEWSENT_CACHE_PREFIX)


def parse_run_newsent_dt(cache_hash: str) -> datetime | None:
    if not is_run_newsent_hash(cache_hash):
        return None
    try:
        payload = str(cache_hash).split("::", 1)[1]
        ts_text = payload.split(":", 1)[0]
        millis = int(ts_text)
        return datetime.fromtimestamp(millis / 1000, tz=timezone.utc)
    except (IndexError, ValueError, OverflowError, OSError):
        return None


def clip_text(text: str, max_len: int) -> str:
    content = (text or "").strip()
    if len(content) <= max_len:
        return content
    return content[: max_len - 1].rstrip() + "…"


def make_id(prefix: str, unique_payload: str) -> str:
    digest = hashlib.sha1(unique_payload.encode("utf-8", "ignore")).hexdigest()[:10]
    return f"{prefix}_{digest}"


def infer_priority(text: str) -> str:
    upper = text.upper()
    if any(term in upper for term in CRITICAL_TERMS):
        return "critical"
    if any(term in upper for term in WARNING_TERMS):
        return "warning"
    return "info"


def infer_sentiment(text: str) -> str:
    upper = text.upper()
    pos_hits = sum(1 for term in POSITIVE_TERMS if term in upper)
    neg_hits = sum(1 for term in NEGATIVE_TERMS if term in upper)
    if pos_hits > neg_hits:
        return "positive"
    if neg_hits > pos_hits:
        return "negative"
    return "neutral"


def extract_symbols(text: str) -> list[str]:
    symbols = []
    for symbol in SYMBOL_RE.findall(text.upper()):
        if symbol in STOPWORDS:
            continue
        if symbol not in symbols:
            symbols.append(symbol)
        if len(symbols) >= 8:
            break
    return symbols


def is_readable_text(text: str) -> bool:
    clean = text.strip()
    if len(clean) < 8:
        return False

    question_ratio = clean.count("?") / max(1, len(clean))
    if question_ratio > 0.22:
        return False

    ascii_alpha = sum(1 for ch in clean if ch.isalpha() and ord(ch) < 128)
    cjk_chars = sum(1 for ch in clean if 0x4E00 <= ord(ch) <= 0x9FFF)
    digits = sum(1 for ch in clean if ch.isdigit())
    readable_score = ascii_alpha + cjk_chars + digits

    return readable_score >= max(4, len(clean) // 20)


def normalize_x_message(x_data: dict[str, Any], generated_at: str) -> dict[str, Any] | None:
    content = str(x_data.get("publish_content") or "").strip()
    if not content:
        return None

    url = str(x_data.get("publish_url") or "").strip()
    published_at = str(x_data.get("publish_time") or generated_at)
    author = str(x_data.get("author") or "Unknown").strip()

    return {
        "id": make_id("x", f"{url}|{content}|{published_at}"),
        "source": "x",
        "title": clip_text(content, 96),
        "content": content,
        "symbols": extract_symbols(content),
        "sentiment": infer_sentiment(content),
        "priority": infer_priority(content),
        "published_at": published_at,
        "url": url,
        "meta": {
            "author": author,
            "raw_file": "x_last_message.json",
        },
    }


def normalize_cache_entries(entries: list[dict[str, Any]], generated_at: str, limit: int) -> list[dict[str, Any]]:
    base_dt = parse_iso(generated_at)
    normalized: list[dict[str, Any]] = []

    if limit <= 0:
        selected_entries = entries
    else:
        regular_entries = [entry for entry in entries if not is_run_newsent_hash(str(entry.get("hash") or ""))]
        runnewsent_entries = [entry for entry in entries if is_run_newsent_hash(str(entry.get("hash") or ""))]
        selected_entries = regular_entries[-limit:] + runnewsent_entries

    # Preserve latest insertion order by reading from the tail and walking backwards.
    for idx, entry in enumerate(reversed(selected_entries)):
        text = str(entry.get("text") or "").strip()
        cache_hash = str(entry.get("hash") or "")
        is_runnewsent = is_run_newsent_hash(cache_hash)
        if not is_runnewsent and not is_readable_text(text):
            continue

        fallback_dt = base_dt - timedelta(seconds=idx * 45)
        published_dt = parse_run_newsent_dt(cache_hash) or fallback_dt
        published_at = published_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")

        normalized.append(
            {
                "id": make_id("wire", f"{cache_hash}|{text}|{published_at}"),
                "source": "wire",
                "title": clip_text(text, 96),
                "content": text,
                "symbols": extract_symbols(text),
                "sentiment": infer_sentiment(text),
                "priority": infer_priority(text),
                "published_at": published_at,
                "url": "",
                "meta": {
                    "author": "run_newsent" if is_runnewsent else "newsai-cache",
                    "raw_file": "translation_cache_tail.json",
                    "hash": cache_hash,
                    "channel": "run_newsent" if is_runnewsent else "cache",
                },
            }
        )

    return normalized


def is_run_newsent_item(item: dict[str, Any]) -> bool:
    meta = item.get("meta") if isinstance(item, dict) else {}
    if not isinstance(meta, dict):
        return False
    return is_run_newsent_hash(str(meta.get("hash") or ""))


def dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in items:
        if is_run_newsent_item(item):
            output.append(item)
            continue

        signature = (item.get("content") or "").strip().lower()
        if not signature or signature in seen:
            continue
        seen.add(signature)
        output.append(item)
    return output


def build_stats(items: list[dict[str, Any]]) -> dict[str, Any]:
    source_counts = Counter(item.get("source", "unknown") for item in items)
    priority_counts = Counter(item.get("priority", "info") for item in items)
    sentiment_counts = Counter(item.get("sentiment", "neutral") for item in items)

    symbol_counter: Counter[str] = Counter()
    for item in items:
        for symbol in item.get("symbols", []):
            symbol_counter[symbol] += 1

    return {
        "total_items": len(items),
        "by_source": dict(source_counts),
        "by_priority": dict(priority_counts),
        "by_sentiment": dict(sentiment_counts),
        "top_symbols": [
            {"symbol": symbol, "mentions": count}
            for symbol, count in symbol_counter.most_common(6)
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize raw synced data to unified feed.json")
    parser.add_argument(
        "--raw-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "raw"),
        help="Directory where raw synced files are stored.",
    )
    parser.add_argument(
        "--output-file",
        default=str(Path(__file__).resolve().parents[1] / "data" / "normalized" / "feed.json"),
        help="Output feed JSON path.",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=160,
        help="Maximum number of non-run_newsent items in the final feed.",
    )
    parser.add_argument(
        "--cache-items",
        type=int,
        default=120,
        help="Maximum number of cache-tail records to convert.",
    )
    parser.add_argument(
        "--runnewsent-items",
        type=int,
        default=48,
        help="Maximum number of run_newsent records kept in the final feed.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    raw_dir = Path(args.raw_dir)
    output_file = Path(args.output_file)

    manifest = load_json(raw_dir / "sync_manifest.json", {})
    generated_at = str(manifest.get("generated_at") or utc_now_iso())

    x_data = load_json(raw_dir / "x_last_message.json", {})
    cache_entries = load_json(raw_dir / "translation_cache_tail.json", [])

    items: list[dict[str, Any]] = []
    x_item = normalize_x_message(x_data if isinstance(x_data, dict) else {}, generated_at)
    if x_item:
        items.append(x_item)

    if isinstance(cache_entries, list):
        items.extend(normalize_cache_entries(cache_entries, generated_at, args.cache_items))

    items = dedupe_items(items)
    items.sort(key=lambda item: parse_iso(str(item.get("published_at"))), reverse=True)

    if args.max_items > 0:
        runnewsent_items = [item for item in items if is_run_newsent_item(item)]
        other_items = [item for item in items if not is_run_newsent_item(item)]
        if args.runnewsent_items > 0:
            runnewsent_items = runnewsent_items[: args.runnewsent_items]
        elif args.runnewsent_items == 0:
            runnewsent_items = []
        other_items = other_items[: args.max_items]
        items = runnewsent_items + other_items
        items.sort(key=lambda item: parse_iso(str(item.get("published_at"))), reverse=True)

    payload = {
        "generated_at": generated_at,
        "schema_version": "1.0.0",
        "items": items,
        "stats": build_stats(items),
    }

    write_json(output_file, payload)

    print(f"[normalize] output={output_file}")
    print(f"[normalize] total_items={len(items)}")
    print(f"[normalize] generated_at={generated_at}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
