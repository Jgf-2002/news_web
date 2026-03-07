from __future__ import annotations

import argparse
import copy
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0 Safari/537.36",
    "Accept": "application/json",
}
DEFAULT_REFRESH_INTERVAL_SECONDS = 60
DEFAULT_MAX_POINTS = 48

# Data source notes:
# - Primary source is Yahoo Finance chart data via public JSON endpoint.
# - The pipeline refreshes this file on each local sync run, while the web UI polls
#   the generated static JSON for a GitHub Pages friendly "real-time" experience.
# - If the upstream source fails, the script falls back to the last successful cache
#   and finally to deterministic default sample data so the page never breaks.
SERIES_CONFIG: list[dict[str, Any]] = [
    {
        "symbol": "^GSPC",
        "code": "SPX",
        "label": "S&P 500",
        "group": "US Equities",
        "color": "#5aa9ff",
        "precision": 2,
        "suffix": "",
        "inverse_for_regime": False,
    },
    {
        "symbol": "^NDX",
        "code": "NDX",
        "label": "Nasdaq 100",
        "group": "Growth",
        "color": "#22c55e",
        "precision": 2,
        "suffix": "",
        "inverse_for_regime": False,
    },
    {
        "symbol": "^VIX",
        "code": "VIX",
        "label": "CBOE Volatility",
        "group": "Risk Gauge",
        "color": "#f97316",
        "precision": 2,
        "suffix": "",
        "inverse_for_regime": True,
    },
    {
        "symbol": "DX-Y.NYB",
        "code": "DXY",
        "label": "US Dollar Index",
        "group": "Macro",
        "color": "#facc15",
        "precision": 2,
        "suffix": "",
        "inverse_for_regime": True,
    },
    {
        "symbol": "^TNX",
        "code": "US10Y",
        "label": "US 10Y Yield",
        "group": "Rates",
        "color": "#a78bfa",
        "precision": 3,
        "suffix": "%",
        "display_divisor": 10,
        "inverse_for_regime": False,
    },
    {
        "symbol": "GC=F",
        "code": "GOLD",
        "label": "Gold Futures",
        "group": "Commodities",
        "color": "#fbbf24",
        "precision": 2,
        "suffix": "",
        "inverse_for_regime": False,
    },
    {
        "symbol": "CL=F",
        "code": "WTI",
        "label": "WTI Crude",
        "group": "Commodities",
        "color": "#fb7185",
        "precision": 2,
        "suffix": "",
        "inverse_for_regime": False,
    },
    {
        "symbol": "BTC-USD",
        "code": "BTC",
        "label": "Bitcoin",
        "group": "Crypto",
        "color": "#22d3ee",
        "precision": 0,
        "suffix": "",
        "inverse_for_regime": False,
    },
]


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path, fallback: Any) -> Any:
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def round_value(value: float, precision: int) -> float:
    return round(float(value), precision)


def build_chart_url(symbol: str) -> str:
    encoded = quote(symbol, safe="")
    return (
        YAHOO_CHART_URL.format(symbol=encoded)
        + "?range=1d&interval=5m&includePrePost=true&events=div%2Csplits&corsDomain=finance.yahoo.com"
    )


def request_json(url: str, timeout: int) -> dict[str, Any]:
    request = Request(url, headers=REQUEST_HEADERS)
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def format_exchange_time(epoch_seconds: int | float | None, timezone_name: str | None) -> tuple[str, str]:
    if not epoch_seconds:
        return "", ""

    utc_dt = datetime.fromtimestamp(float(epoch_seconds), tz=UTC)
    as_of = utc_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    if not timezone_name:
        return as_of, utc_dt.strftime("%H:%M UTC")

    try:
        local_dt = utc_dt.astimezone(ZoneInfo(timezone_name))
    except Exception:
        return as_of, utc_dt.strftime("%H:%M UTC")

    return as_of, local_dt.strftime("%H:%M %Z")


def downsample_points(points: list[list[Any]], max_points: int) -> list[list[Any]]:
    if len(points) <= max_points:
        return points

    output: list[list[Any]] = []
    total = len(points) - 1
    for index in range(max_points):
        source_index = round(index * total / max(max_points - 1, 1))
        output.append(points[source_index])
    return output


def classify_direction(change_pct: float) -> str:
    if change_pct >= 0.15:
        return "up"
    if change_pct <= -0.15:
        return "down"
    return "flat"


def parse_chart_series(config: dict[str, Any], payload: dict[str, Any], max_points: int) -> dict[str, Any]:
    result = ((payload.get("chart") or {}).get("result") or [None])[0]
    if not isinstance(result, dict):
        raise RuntimeError("chart result missing")

    meta = result.get("meta") or {}
    timestamps = result.get("timestamp") or []
    quote_rows = (((result.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
    divisor = safe_float(config.get("display_divisor")) or 1.0
    precision = int(config.get("precision", 2))

    points: list[list[Any]] = []
    for timestamp, raw_value in zip(timestamps, quote_rows):
        numeric = safe_float(raw_value)
        if numeric is None:
            continue
        normalized = numeric / divisor
        iso_ts = datetime.fromtimestamp(float(timestamp), tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        points.append([iso_ts, round_value(normalized, precision + 2)])

    if not points:
        raise RuntimeError("no usable price points")

    market_price = safe_float(meta.get("regularMarketPrice"))
    chart_previous_close = safe_float(meta.get("chartPreviousClose"))
    previous_close = safe_float(meta.get("previousClose"))

    last_value = market_price if market_price is not None else points[-1][1] * divisor
    reference_close = chart_previous_close if chart_previous_close is not None else previous_close
    if reference_close is None:
        reference_close = last_value

    display_last = last_value / divisor
    display_previous = reference_close / divisor
    change = display_last - display_previous
    change_pct = (change / display_previous * 100) if display_previous else 0.0
    scaled_values = [safe_float(point[1]) or 0.0 for point in points]
    as_of, as_of_label = format_exchange_time(meta.get("regularMarketTime") or timestamps[-1], meta.get("exchangeTimezoneName"))

    return {
        "symbol": config["symbol"],
        "code": config["code"],
        "label": config["label"],
        "group": config["group"],
        "color": config["color"],
        "precision": precision,
        "suffix": str(config.get("suffix") or ""),
        "last": round_value(display_last, precision),
        "previous_close": round_value(display_previous, precision),
        "change": round_value(change, precision),
        "change_pct": round_value(change_pct, 2),
        "day_low": round_value(min(scaled_values), precision),
        "day_high": round_value(max(scaled_values), precision),
        "as_of": as_of,
        "as_of_label": as_of_label,
        "exchange_timezone": str(meta.get("exchangeTimezoneName") or ""),
        "market_state": classify_direction(change_pct),
        "points": downsample_points(points, max_points),
        "source_status": "live",
        "source_note": "yahoo-finance-chart",
    }


def fetch_series(config: dict[str, Any], timeout: int, retries: int, max_points: int) -> dict[str, Any]:
    last_error: Exception | None = None

    for attempt in range(retries + 1):
        try:
            payload = request_json(build_chart_url(config["symbol"]), timeout=timeout)
            return parse_chart_series(config, payload, max_points=max_points)
        except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as error:
            last_error = error
            if attempt >= retries:
                break
            time.sleep(1.2 * (attempt + 1))

    raise RuntimeError(f"fetch failed for {config['code']}: {last_error}")


def build_default_points(base_value: float, precision: int, now: datetime) -> list[list[Any]]:
    multipliers = [
        -0.011,
        -0.008,
        -0.004,
        -0.002,
        0.001,
        0.003,
        0.007,
        0.005,
        0.002,
        0.006,
        0.01,
        0.012,
    ]
    points: list[list[Any]] = []
    start = now - timedelta(minutes=5 * (len(multipliers) - 1))
    for index, offset in enumerate(multipliers):
        point_dt = start + timedelta(minutes=5 * index)
        value = base_value * (1 + offset)
        points.append([point_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z"), round_value(value, precision + 2)])
    return points


def build_default_series(config: dict[str, Any], reason: str, cached_series: dict[str, Any] | None = None) -> dict[str, Any]:
    if cached_series:
        fallback = copy.deepcopy(cached_series)
        fallback["source_status"] = "cached"
        fallback["source_note"] = reason
        fallback["market_state"] = classify_direction(float(fallback.get("change_pct") or 0.0))
        return fallback

    precision = int(config.get("precision", 2))
    base_value = {
        "SPX": 6735.0,
        "NDX": 21125.0,
        "VIX": 19.8,
        "DXY": 103.55,
        "US10Y": 4.23,
        "GOLD": 2912.5,
        "WTI": 67.4,
        "BTC": 89250.0,
    }.get(config["code"], 100.0)
    points = build_default_points(base_value, precision, datetime.now(UTC))
    last = safe_float(points[-1][1]) or base_value
    previous_close = base_value
    change = last - previous_close
    change_pct = (change / previous_close * 100) if previous_close else 0.0

    return {
        "symbol": config["symbol"],
        "code": config["code"],
        "label": config["label"],
        "group": config["group"],
        "color": config["color"],
        "precision": precision,
        "suffix": str(config.get("suffix") or ""),
        "last": round_value(last, precision),
        "previous_close": round_value(previous_close, precision),
        "change": round_value(change, precision),
        "change_pct": round_value(change_pct, 2),
        "day_low": round_value(min(point[1] for point in points), precision),
        "day_high": round_value(max(point[1] for point in points), precision),
        "as_of": utc_now_iso(),
        "as_of_label": "Fallback",
        "exchange_timezone": "",
        "market_state": classify_direction(change_pct),
        "points": points,
        "source_status": "default",
        "source_note": reason,
    }


def sign_bucket(value: float, threshold: float = 0.08) -> int:
    if value >= threshold:
        return 1
    if value <= -threshold:
        return -1
    return 0


def build_summary(series: list[dict[str, Any]], generated_at: str, refresh_interval_seconds: int) -> dict[str, Any]:
    ordered = sorted(series, key=lambda item: float(item.get("change_pct") or 0.0), reverse=True)
    leaders = [item["code"] for item in ordered[:2]]
    laggards = [item["code"] for item in ordered[-2:]]

    regime_score = 0
    for item in series:
        direction = sign_bucket(float(item.get("change_pct") or 0.0))
        if item.get("code") == "GOLD":
            direction = sign_bucket(float(item.get("change_pct") or 0.0), threshold=0.12)
        if item.get("inverse_for_regime"):
            regime_score -= direction
        else:
            regime_score += direction

    if regime_score >= 2:
        regime = "risk-on"
        headline = "Equity beta leads while defensive gauges cool."
    elif regime_score <= -2:
        regime = "risk-off"
        headline = "Defensive flows dominate and volatility is firm."
    else:
        regime = "balanced"
        headline = "Cross-asset positioning is mixed into the close."

    live_count = sum(1 for item in series if item.get("source_status") == "live")
    stale_count = len(series) - live_count

    return {
        "regime": regime,
        "headline": headline,
        "leaders": leaders,
        "laggards": laggards,
        "live_count": live_count,
        "stale_count": stale_count,
        "series_count": len(series),
        "refresh_interval_seconds": refresh_interval_seconds,
        "generated_at": generated_at,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate standalone market monitor JSON payload.")
    parser.add_argument(
        "--output-file",
        default=str(Path(__file__).resolve().parents[1] / "data" / "normalized" / "market-data.json"),
        help="Output JSON path consumed by the web UI.",
    )
    parser.add_argument(
        "--cache-file",
        default=str(Path(__file__).resolve().parents[1] / ".runtime" / "market-data-cache.json"),
        help="Last successful payload cache for fallback recovery.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=12,
        help="HTTP timeout in seconds per market data request.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retry count per symbol before fallback logic kicks in.",
    )
    parser.add_argument(
        "--max-points",
        type=int,
        default=DEFAULT_MAX_POINTS,
        help="Maximum intraday points kept per symbol to control payload size.",
    )
    parser.add_argument(
        "--refresh-interval-seconds",
        type=int,
        default=DEFAULT_REFRESH_INTERVAL_SECONDS,
        help="Expected upstream refresh interval used by the web polling layer.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_file = Path(args.output_file)
    cache_file = Path(args.cache_file)

    cached_payload = read_json(cache_file, {})
    cached_series_by_code = {
        str(item.get("code")): item
        for item in (cached_payload.get("series") or [])
        if isinstance(item, dict) and item.get("code")
    }

    collected: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    live_count = 0

    with ThreadPoolExecutor(max_workers=min(4, len(SERIES_CONFIG))) as executor:
        future_map = {
            executor.submit(fetch_series, config, args.timeout, args.retries, args.max_points): config
            for config in SERIES_CONFIG
        }
        for future in as_completed(future_map):
            config = future_map[future]
            try:
                series_payload = future.result()
                series_payload["inverse_for_regime"] = bool(config.get("inverse_for_regime"))
                collected[config["code"]] = series_payload
                live_count += 1
                print(f"[market] fetched {config['code']}")
            except Exception as error:
                reason = str(error)
                fallback = build_default_series(config, reason, cached_series_by_code.get(config["code"]))
                fallback["inverse_for_regime"] = bool(config.get("inverse_for_regime"))
                collected[config["code"]] = fallback
                errors.append(f"{config['code']}: {reason}")
                print(f"[market] fallback {config['code']} -> {reason}")

    ordered_series: list[dict[str, Any]] = []
    for config in SERIES_CONFIG:
        ordered_series.append(collected[config["code"]])

    generated_at = utc_now_iso()
    if live_count == len(SERIES_CONFIG):
        status = "live"
        stale = False
    elif live_count > 0:
        status = "degraded"
        stale = True
    elif any(item.get("source_status") == "cached" for item in ordered_series):
        status = "stale"
        stale = True
    else:
        status = "fallback"
        stale = True

    summary = build_summary(ordered_series, generated_at, args.refresh_interval_seconds)
    for item in ordered_series:
        item.pop("inverse_for_regime", None)

    payload = {
        "generated_at": generated_at,
        "schema_version": "1.0.0",
        "source": {
            "provider": "Yahoo Finance chart endpoint",
            "transport": "Static JSON generated locally by scripts/fetch_market_data.py",
        },
        "status": status,
        "stale": stale,
        "errors": errors,
        "summary": summary,
        "series": ordered_series,
    }

    write_json(output_file, payload)
    if live_count > 0:
        write_json(cache_file, payload)

    print(f"[market] output={output_file}")
    print(f"[market] status={status}")
    print(f"[market] live_series={live_count}/{len(SERIES_CONFIG)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
