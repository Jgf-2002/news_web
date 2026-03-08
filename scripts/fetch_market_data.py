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
DEFAULT_MIN_REFRESH_SECONDS = 60

# UUP / GLD / USO are used as stable proxy feeds for dollar, gold and oil so
# the panel keeps producing intraday bars reliably across off-session hours.
# 2800.HK / 3067.HK are used as stable Yahoo proxies for Hang Seng / Hang Seng
# TECH so the HK view keeps working even when direct index feeds are patchy.
SERIES_CONFIG: list[dict[str, Any]] = [
    {"symbol": "^GSPC", "code": "SPX", "label": "S&P 500", "group": "US Equities", "color": "#5aa9ff", "precision": 2, "views": ["us"]},
    {"symbol": "^NDX", "code": "NDX", "label": "Nasdaq 100", "group": "Growth", "color": "#22c55e", "precision": 2, "views": ["us"]},
    {"symbol": "^VIX", "code": "VIX", "label": "CBOE Volatility", "group": "Risk Gauge", "color": "#f97316", "precision": 2, "inverse_for_regime": True, "views": ["us"]},
    {"symbol": "2800.HK", "code": "HSI", "label": "Hang Seng ETF", "group": "Hong Kong", "color": "#38bdf8", "precision": 2, "views": ["hk"]},
    {"symbol": "3067.HK", "code": "HKTECH", "label": "Hang Seng TECH ETF", "group": "China Tech", "color": "#60a5fa", "precision": 2, "views": ["hk"]},
    {"symbol": "USDCNH=X", "code": "CNH", "label": "USD/CNH", "group": "FX", "color": "#0ea5e9", "precision": 4, "inverse_for_regime": True, "views": ["hk", "macro"]},
    {"symbol": "UUP", "code": "DXY", "label": "US Dollar Index", "group": "Macro", "color": "#facc15", "precision": 2, "inverse_for_regime": True, "views": ["macro"]},
    {"symbol": "^TNX", "code": "US10Y", "label": "US 10Y Yield", "group": "Rates", "color": "#a78bfa", "precision": 3, "suffix": "%", "display_divisor": 10, "inverse_for_regime": True, "views": ["macro"]},
    {"symbol": "GLD", "code": "GOLD", "label": "Gold", "group": "Commodities", "color": "#fbbf24", "precision": 2, "views": ["macro"]},
    {"symbol": "USO", "code": "WTI", "label": "WTI Crude", "group": "Commodities", "color": "#fb7185", "precision": 2, "views": ["macro"]},
    {"symbol": "BTC-USD", "code": "BTC", "label": "Bitcoin", "group": "Crypto", "color": "#22d3ee", "precision": 0, "views": ["macro"]},
]

NQ_MEMBERS = [
    {"symbol": "NVDA", "label": "NVIDIA", "size": "lg"},
    {"symbol": "MSFT", "label": "Microsoft", "size": "lg"},
    {"symbol": "AAPL", "label": "Apple", "size": "lg"},
    {"symbol": "AMZN", "label": "Amazon", "size": "lg"},
    {"symbol": "META", "label": "Meta", "size": "md"},
    {"symbol": "GOOG", "label": "Alphabet", "size": "md"},
    {"symbol": "AVGO", "label": "Broadcom", "size": "md"},
    {"symbol": "TSLA", "label": "Tesla", "size": "md"},
    {"symbol": "AMD", "label": "AMD", "size": "sm"},
    {"symbol": "NFLX", "label": "Netflix", "size": "sm"},
    {"symbol": "COST", "label": "Costco", "size": "sm"},
    {"symbol": "PLTR", "label": "Palantir", "size": "sm"},
]
HSI_MEMBERS = [
    {"symbol": "0700.HK", "label": "Tencent", "size": "lg"},
    {"symbol": "9988.HK", "label": "Alibaba", "size": "lg"},
    {"symbol": "3690.HK", "label": "Meituan", "size": "lg"},
    {"symbol": "9618.HK", "label": "JD.com", "size": "md"},
    {"symbol": "1810.HK", "label": "Xiaomi", "size": "md"},
    {"symbol": "1299.HK", "label": "AIA", "size": "md"},
    {"symbol": "2318.HK", "label": "Ping An", "size": "md"},
    {"symbol": "0939.HK", "label": "CCB", "size": "sm"},
    {"symbol": "3968.HK", "label": "CMB", "size": "sm"},
    {"symbol": "0388.HK", "label": "HKEX", "size": "sm"},
    {"symbol": "9888.HK", "label": "Baidu", "size": "sm"},
    {"symbol": "9999.HK", "label": "NTES", "size": "sm"},
]
SECTOR_MEMBERS = [
    {"symbol": "XLK", "label": "Technology", "size": "lg"},
    {"symbol": "XLF", "label": "Financials", "size": "lg"},
    {"symbol": "XLE", "label": "Energy", "size": "lg"},
    {"symbol": "XLY", "label": "Consumer", "size": "md"},
    {"symbol": "XLV", "label": "Healthcare", "size": "md"},
    {"symbol": "XLI", "label": "Industrials", "size": "md"},
    {"symbol": "XLP", "label": "Staples", "size": "sm"},
    {"symbol": "XLU", "label": "Utilities", "size": "sm"},
    {"symbol": "XLB", "label": "Materials", "size": "sm"},
    {"symbol": "XLRE", "label": "Real Estate", "size": "sm"},
    {"symbol": "XLC", "label": "Comms", "size": "sm"},
]
MACRO_MEMBERS = [
    {"symbol": "BTC-USD", "label": "Bitcoin", "size": "lg"},
    {"symbol": "USO", "label": "WTI", "size": "md"},
    {"symbol": "GLD", "label": "Gold", "size": "md"},
    {"symbol": "UUP", "label": "Dollar", "size": "lg", "invert": True},
    {"symbol": "^TNX", "label": "US 10Y", "size": "md", "invert": True},
    {"symbol": "USDCNH=X", "label": "USD/CNH", "size": "sm", "invert": True},
]
BREADTH_GROUPS = [
    {"code": "NQ_BREADTH", "label": "Nasdaq Breadth", "description": "Inspired by the NDX breadth overlay workflow: index line + participation curve.", "color": "#22c55e", "benchmark_symbol": "^NDX", "benchmark_code": "NDX", "benchmark_label": "Nasdaq 100", "members": NQ_MEMBERS, "featured": True, "views": ["us"]},
    {"code": "HSI_BREADTH", "label": "HSI Breadth", "description": "Core Hang Seng leaders participating above previous close.", "color": "#5aa9ff", "benchmark_symbol": "2800.HK", "benchmark_code": "HSI", "benchmark_label": "Hang Seng ETF", "members": HSI_MEMBERS, "featured": True, "views": ["hk"]},
    {"code": "SECTOR_BREADTH", "label": "Sector Breadth", "description": "US sector rotation breadth using the major SPDR complex.", "color": "#f97316", "benchmark_symbol": "^GSPC", "benchmark_code": "SPX", "benchmark_label": "S&P 500", "members": SECTOR_MEMBERS, "featured": False, "views": ["us"]},
    {"code": "MACRO_BREADTH", "label": "Macro Risk Breadth", "description": "Cross-asset breadth that normalizes inverse dollar and rates pressure.", "color": "#facc15", "benchmark_symbol": "UUP", "benchmark_code": "DXY", "benchmark_label": "Dollar Proxy", "members": MACRO_MEMBERS, "featured": False, "views": ["macro"]},
]
HEAT_LAYERS = [
    {"code": "NQ_HEAT", "label": "Nasdaq Leaders", "description": "High-beta leaders and mega-cap pressure map.", "members": NQ_MEMBERS, "views": ["us"]},
    {"code": "SECTOR_HEAT", "label": "Sector Rotation", "description": "ETF rotation layer for fast risk-on / risk-off reads.", "members": SECTOR_MEMBERS, "views": ["us"]},
    {"code": "HSI_HEAT", "label": "HSI Core", "description": "Large-cap Hong Kong and China internet heat layer.", "members": HSI_MEMBERS, "views": ["hk"]},
    {"code": "MACRO_HEAT", "label": "Macro Crosswinds", "description": "Dollar, rates, energy and crypto move map.", "members": MACRO_MEMBERS, "views": ["macro"]},
]
VIEW_CONFIGS = [
    {
        "code": "us",
        "label": "US",
        "accent": "#5aa9ff",
        "description": "Index breadth, sector rotation and volatility pressure for the U.S. session.",
        "legend_note": "Breadth counts members above the previous close while the white line tracks benchmark return.",
        "headlines": {
            "risk-on": "US participation is broadening while volatility pressure cools.",
            "risk-off": "US breadth is narrowing and defensives are taking the tape.",
            "balanced": "US leadership is rotating with mixed breadth confirmation.",
        },
    },
    {
        "code": "hk",
        "label": "HK",
        "accent": "#38bdf8",
        "description": "Hong Kong beta, China tech proxies and FX pressure in one dense board.",
        "legend_note": "HK proxy series use liquid Yahoo-tracked ETFs so the local pipeline stays resilient when index feeds are patchy.",
        "headlines": {
            "risk-on": "Hong Kong participation is improving and tech beta is firming.",
            "risk-off": "Hong Kong breadth is fading and large-cap pressure is spreading.",
            "balanced": "Hong Kong participation is mixed with selective internet leadership.",
        },
    },
    {
        "code": "macro",
        "label": "Macro",
        "accent": "#facc15",
        "description": "Dollar, rates, commodities, crypto and CNH cross-currents for macro risk reads.",
        "legend_note": "Macro breadth normalizes inverse risk assets such as DXY, yields and USD/CNH before counting participation.",
        "headlines": {
            "risk-on": "Macro crosswinds are easing as risk assets outpace the dollar complex.",
            "risk-off": "Macro pressure is building as the dollar complex tightens conditions.",
            "balanced": "Macro signals are split with no clean cross-asset follow-through.",
        },
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
    return YAHOO_CHART_URL.format(symbol=encoded) + "?range=1d&interval=5m&includePrePost=true&events=div%2Csplits&corsDomain=finance.yahoo.com"


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


def classify_heat_state(change_pct: float) -> str:
    if change_pct >= 0.7:
        return "hot"
    if change_pct <= -0.7:
        return "cold"
    return "neutral"


def parse_symbol_snapshot(symbol: str, payload: dict[str, Any]) -> dict[str, Any]:
    result = ((payload.get("chart") or {}).get("result") or [None])[0]
    if not isinstance(result, dict):
        raise RuntimeError(f"{symbol} chart result missing")

    meta = result.get("meta") or {}
    timestamps = result.get("timestamp") or []
    closes = (((result.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []

    points_raw: list[list[Any]] = []
    for timestamp, raw_value in zip(timestamps, closes):
        numeric = safe_float(raw_value)
        if numeric is None:
            continue
        iso_ts = datetime.fromtimestamp(float(timestamp), tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        points_raw.append([iso_ts, numeric])

    if not points_raw:
        raise RuntimeError(f"{symbol} no usable price points")

    market_price = safe_float(meta.get("regularMarketPrice"))
    chart_previous_close = safe_float(meta.get("chartPreviousClose"))
    previous_close = safe_float(meta.get("previousClose"))
    last_raw = market_price if market_price is not None else points_raw[-1][1]
    previous_close_raw = chart_previous_close if chart_previous_close is not None else previous_close
    if previous_close_raw is None:
        previous_close_raw = last_raw

    change_raw = last_raw - previous_close_raw
    change_pct = (change_raw / previous_close_raw * 100) if previous_close_raw else 0.0
    as_of, as_of_label = format_exchange_time(meta.get("regularMarketTime") or timestamps[-1], meta.get("exchangeTimezoneName"))

    return {
        "symbol": symbol,
        "points_raw": points_raw,
        "last_raw": last_raw,
        "previous_close_raw": previous_close_raw,
        "change_raw": change_raw,
        "change_pct": round_value(change_pct, 2),
        "as_of": as_of,
        "as_of_label": as_of_label,
        "exchange_timezone": str(meta.get("exchangeTimezoneName") or ""),
        "day_low_raw": min(point[1] for point in points_raw),
        "day_high_raw": max(point[1] for point in points_raw),
        "source_status": "live",
        "source_note": "yahoo-finance-chart",
    }


def fetch_symbol_snapshot(symbol: str, timeout: int, retries: int) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            payload = request_json(build_chart_url(symbol), timeout=timeout)
            return parse_symbol_snapshot(symbol, payload)
        except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as error:
            last_error = error
            if attempt >= retries:
                break
            time.sleep(1.1 * (attempt + 1))
    raise RuntimeError(f"{symbol}: {last_error}")


def build_series_from_snapshot(config: dict[str, Any], snapshot: dict[str, Any], max_points: int) -> dict[str, Any]:
    divisor = safe_float(config.get("display_divisor")) or 1.0
    precision = int(config.get("precision", 2))
    scaled_points = [[timestamp, round_value(value / divisor, precision + 2)] for timestamp, value in downsample_points(snapshot["points_raw"], max_points)]
    last = snapshot["last_raw"] / divisor
    previous_close = snapshot["previous_close_raw"] / divisor
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
        "day_low": round_value(snapshot["day_low_raw"] / divisor, precision),
        "day_high": round_value(snapshot["day_high_raw"] / divisor, precision),
        "as_of": snapshot["as_of"],
        "as_of_label": snapshot["as_of_label"],
        "exchange_timezone": snapshot["exchange_timezone"],
        "market_state": classify_direction(change_pct),
        "points": scaled_points,
        "views": list(config.get("views") or []),
        "inverse_for_regime": bool(config.get("inverse_for_regime")),
        "source_status": snapshot.get("source_status", "live"),
        "source_note": snapshot.get("source_note", "yahoo-finance-chart"),
    }


def build_default_points(base_value: float, now: datetime, precision: int = 2) -> list[list[Any]]:
    multipliers = [-0.012, -0.009, -0.005, -0.003, 0.0, 0.004, 0.007, 0.005, 0.009, 0.011, 0.014, 0.012]
    points: list[list[Any]] = []
    start = now - timedelta(minutes=5 * (len(multipliers) - 1))
    for index, offset in enumerate(multipliers):
        point_dt = start + timedelta(minutes=5 * index)
        points.append([point_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z"), round_value(base_value * (1 + offset), precision + 2)])
    return points


def build_default_series(config: dict[str, Any], reason: str, cached_series: dict[str, Any] | None = None) -> dict[str, Any]:
    if cached_series:
        fallback = copy.deepcopy(cached_series)
        fallback["source_status"] = "cached"
        fallback["source_note"] = reason
        fallback["market_state"] = classify_direction(float(fallback.get("change_pct") or 0.0))
        return fallback

    base_value = {
        "SPX": 6735.0,
        "NDX": 21118.0,
        "VIX": 19.8,
        "HSI": 25.9,
        "HKTECH": 10.35,
        "CNH": 6.903,
        "DXY": 103.55,
        "US10Y": 4.23,
        "GOLD": 2912.0,
        "WTI": 67.1,
        "BTC": 89250.0,
    }.get(config["code"], 100.0)
    precision = int(config.get("precision", 2))
    points = build_default_points(base_value, datetime.now(UTC), precision)
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
        "views": list(config.get("views") or []),
        "inverse_for_regime": bool(config.get("inverse_for_regime")),
        "source_status": "default",
        "source_note": reason,
    }


def get_symbol_union() -> list[str]:
    symbols: list[str] = [config["symbol"] for config in SERIES_CONFIG]
    for group in BREADTH_GROUPS:
        symbols.append(group["benchmark_symbol"])
        symbols.extend(member["symbol"] for member in group["members"])
    return sorted(set(symbols))


def symbol_latest_value_at_or_before(points: list[list[Any]], timestamp: str, start_index: int, last_value: float | None) -> tuple[int, float | None]:
    current_index = start_index
    current_value = last_value
    while current_index < len(points) and str(points[current_index][0]) <= timestamp:
        current_value = safe_float(points[current_index][1])
        current_index += 1
    return current_index, current_value


def build_default_breadth_group(group: dict[str, Any], reason: str, cached_group: dict[str, Any] | None = None) -> dict[str, Any]:
    if cached_group:
        fallback = copy.deepcopy(cached_group)
        fallback["source_status"] = "cached"
        fallback["source_note"] = reason
        return fallback

    breadth_values = [42.0, 44.5, 46.0, 49.0, 53.5, 55.0, 58.0, 56.5, 60.0, 62.0, 64.5, 63.0]
    benchmark_values = [-0.8, -0.55, -0.35, -0.18, 0.02, 0.12, 0.22, 0.18, 0.31, 0.38, 0.44, 0.36]
    start = datetime.now(UTC) - timedelta(minutes=5 * (len(breadth_values) - 1))
    points = [[(start + timedelta(minutes=index * 5)).replace(microsecond=0).isoformat().replace("+00:00", "Z"), breadth_value, benchmark_values[index]] for index, breadth_value in enumerate(breadth_values)]
    leader_member = group["members"][0]
    laggard_member = group["members"][-1]
    return {
        "code": group["code"],
        "label": group["label"],
        "description": group["description"],
        "color": group["color"],
        "benchmark_code": group["benchmark_code"],
        "benchmark_label": group["benchmark_label"],
        "featured": bool(group.get("featured")),
        "latest_pct": round_value(points[-1][1], 1),
        "session_delta_pct": round_value(points[-1][1] - points[0][1], 1),
        "benchmark_change_pct": round_value(points[-1][2], 2),
        "advancers": 7,
        "decliners": 4,
        "unchanged": 1,
        "members_total": len(group["members"]),
        "live_members": 0,
        "points": points,
        "leaders": [{"symbol": leader_member["symbol"], "label": leader_member["label"], "change_pct": 1.45, "display_change_pct": 1.45, "normalized": False, "state": "hot"}],
        "laggards": [{"symbol": laggard_member["symbol"], "label": laggard_member["label"], "change_pct": -0.84, "display_change_pct": -0.84, "normalized": False, "state": "cold"}],
        "views": list(group.get("views") or []),
        "source_status": "default",
        "source_note": reason,
        "heat_state": "neutral",
        "as_of": utc_now_iso(),
    }


def build_default_heat_layer(layer: dict[str, Any], reason: str, cached_layer: dict[str, Any] | None = None) -> dict[str, Any]:
    if cached_layer:
        fallback = copy.deepcopy(cached_layer)
        fallback["source_status"] = "cached"
        fallback["source_note"] = reason
        return fallback

    seed_changes = [1.55, 1.12, 0.84, 0.48, 0.22, -0.06, -0.18, -0.42, -0.65, -0.88, -1.14, -1.48]
    tiles = []
    for index, member in enumerate(layer["members"]):
        change_pct = seed_changes[index % len(seed_changes)]
        tiles.append({"symbol": member["symbol"], "code": member["symbol"].replace(".HK", ""), "label": member["label"], "size": member.get("size", "sm"), "last": round_value(100 + index * 3.7, 2), "change_pct": change_pct, "state": classify_heat_state(change_pct)})
    return {
        "code": layer["code"],
        "label": layer["label"],
        "description": layer["description"],
        "views": list(layer.get("views") or []),
        "source_status": "default",
        "source_note": reason,
        "tiles": tiles,
        "hottest": {"symbol": tiles[0]["code"], "change_pct": tiles[0]["change_pct"]},
        "coldest": {"symbol": tiles[-1]["code"], "change_pct": tiles[-1]["change_pct"]},
    }


def build_breadth_group(group: dict[str, Any], snapshots: dict[str, dict[str, Any]], cached_group: dict[str, Any] | None, max_points: int) -> tuple[dict[str, Any], bool, list[str]]:
    errors: list[str] = []
    benchmark_snapshot = snapshots.get(group["benchmark_symbol"])
    if not benchmark_snapshot:
        reason = f"{group['code']} benchmark missing"
        return build_default_breadth_group(group, reason, cached_group), False, [reason]

    live_members = []
    for member in group["members"]:
        snapshot = snapshots.get(member["symbol"])
        if snapshot:
            live_members.append((member, snapshot))
        else:
            errors.append(f"{group['code']} member missing: {member['symbol']}")

    minimum_live = max(4, math.ceil(len(group["members"]) * 0.6))
    if len(live_members) < minimum_live:
        reason = f"{group['code']} insufficient live members"
        return build_default_breadth_group(group, reason, cached_group), False, errors + [reason]

    benchmark_points = downsample_points(benchmark_snapshot["points_raw"], max_points)
    member_state = [{"meta": member, "snapshot": snapshot, "index": 0, "last_value": None} for member, snapshot in live_members]
    breadth_points: list[list[Any]] = []
    latest_advancers = latest_decliners = latest_unchanged = 0

    for timestamp, benchmark_value in benchmark_points:
        advancers = decliners = unchanged = active_members = 0
        for state in member_state:
            state["index"], state["last_value"] = symbol_latest_value_at_or_before(state["snapshot"]["points_raw"], timestamp, state["index"], state["last_value"])
            current_value = safe_float(state["last_value"])
            if current_value is None:
                continue
            active_members += 1
            previous_close = safe_float(state["snapshot"]["previous_close_raw"]) or current_value
            delta_pct = ((current_value - previous_close) / previous_close * 100) if previous_close else 0.0
            effective_delta_pct = -delta_pct if state["meta"].get("invert") else delta_pct
            if effective_delta_pct > 0.05:
                advancers += 1
            elif effective_delta_pct < -0.05:
                decliners += 1
            else:
                unchanged += 1

        if active_members == 0:
            continue

        latest_advancers, latest_decliners, latest_unchanged = advancers, decliners, unchanged
        breadth_pct = advancers / active_members * 100
        benchmark_previous = safe_float(benchmark_snapshot["previous_close_raw"]) or safe_float(benchmark_value) or 0.0
        benchmark_value_safe = safe_float(benchmark_value) or benchmark_previous
        benchmark_change_pct = ((benchmark_value_safe - benchmark_previous) / benchmark_previous * 100) if benchmark_previous else 0.0
        breadth_points.append([timestamp, round_value(breadth_pct, 2), round_value(benchmark_change_pct, 2)])

    if not breadth_points:
        reason = f"{group['code']} no breadth curve points"
        return build_default_breadth_group(group, reason, cached_group), False, errors + [reason]

    member_rows = []
    for member, snapshot in live_members:
        raw_change_pct = float(snapshot["change_pct"])
        effective_change_pct = -raw_change_pct if member.get("invert") else raw_change_pct
        member_rows.append(
            {
                "symbol": member["symbol"],
                "label": member["label"],
                "change_pct": round_value(effective_change_pct, 2),
                "display_change_pct": round_value(raw_change_pct, 2),
                "normalized": bool(member.get("invert")),
                "state": classify_heat_state(effective_change_pct),
            }
        )
    member_rows.sort(key=lambda item: item["change_pct"], reverse=True)
    latest_pct = float(breadth_points[-1][1])
    opening_pct = float(breadth_points[0][1])
    benchmark_latest = float(breadth_points[-1][2])

    return {
        "code": group["code"],
        "label": group["label"],
        "description": group["description"],
        "color": group["color"],
        "benchmark_code": group["benchmark_code"],
        "benchmark_label": group["benchmark_label"],
        "featured": bool(group.get("featured")),
        "latest_pct": round_value(latest_pct, 1),
        "session_delta_pct": round_value(latest_pct - opening_pct, 1),
        "benchmark_change_pct": round_value(benchmark_latest, 2),
        "advancers": latest_advancers,
        "decliners": latest_decliners,
        "unchanged": latest_unchanged,
        "members_total": len(group["members"]),
        "live_members": len(live_members),
        "points": breadth_points,
        "leaders": member_rows[:3],
        "laggards": member_rows[-3:][::-1],
        "views": list(group.get("views") or []),
        "source_status": "live" if len(live_members) == len(group["members"]) else "partial",
        "source_note": "market-breadth-overlay",
        "heat_state": "hot" if latest_pct >= 62 else "cold" if latest_pct <= 38 else "neutral",
        "as_of": benchmark_snapshot["as_of"],
    }, True, errors


def build_heat_layer(layer: dict[str, Any], snapshots: dict[str, dict[str, Any]], cached_layer: dict[str, Any] | None) -> tuple[dict[str, Any], bool, list[str]]:
    errors: list[str] = []
    tiles = []
    for member in layer["members"]:
        snapshot = snapshots.get(member["symbol"])
        if not snapshot:
            errors.append(f"{layer['code']} member missing: {member['symbol']}")
            continue
        change_pct = round_value(float(snapshot["change_pct"]), 2)
        tiles.append({"symbol": member["symbol"], "code": member["symbol"].replace(".HK", ""), "label": member["label"], "size": member.get("size", "sm"), "last": round_value(float(snapshot["last_raw"]), 2), "change_pct": change_pct, "state": classify_heat_state(change_pct)})

    minimum_live = max(5, math.ceil(len(layer["members"]) * 0.6))
    if len(tiles) < minimum_live:
        reason = f"{layer['code']} insufficient tiles"
        return build_default_heat_layer(layer, reason, cached_layer), False, errors + [reason]

    hottest = max(tiles, key=lambda tile: tile["change_pct"])
    coldest = min(tiles, key=lambda tile: tile["change_pct"])
    return {
        "code": layer["code"],
        "label": layer["label"],
        "description": layer["description"],
        "views": list(layer.get("views") or []),
        "source_status": "live" if len(tiles) == len(layer["members"]) else "partial",
        "source_note": "market-heat-layer",
        "tiles": tiles,
        "hottest": {"symbol": hottest["code"], "change_pct": hottest["change_pct"]},
        "coldest": {"symbol": coldest["code"], "change_pct": coldest["change_pct"]},
    }, True, errors


def sign_bucket(value: float, threshold: float = 0.08) -> int:
    if value >= threshold:
        return 1
    if value <= -threshold:
        return -1
    return 0


def build_summary(series: list[dict[str, Any]], breadth_groups: list[dict[str, Any]], heat_layers: list[dict[str, Any]], generated_at: str, refresh_interval_seconds: int) -> dict[str, Any]:
    ordered = sorted(series, key=lambda item: float(item.get("change_pct") or 0.0), reverse=True)
    leaders = [item["code"] for item in ordered[:2]]
    laggards = [item["code"] for item in ordered[-2:]]
    regime_score = 0
    for item in series:
        direction = sign_bucket(float(item.get("change_pct") or 0.0))
        regime_score += -direction if item.get("inverse_for_regime") else direction
    regime_score += sum(1 for group in breadth_groups if float(group.get("latest_pct") or 0.0) >= 55)
    regime_score -= sum(1 for group in breadth_groups if float(group.get("latest_pct") or 0.0) <= 45)

    if regime_score >= 2:
        regime, headline = "risk-on", "Participation broadens while defensive gauges cool."
    elif regime_score <= -2:
        regime, headline = "risk-off", "Breadth narrows and defensive layers are gaining temperature."
    else:
        regime, headline = "balanced", "Cross-asset trend is mixed and breadth is rotating."

    live_series = sum(1 for item in series if item.get("source_status") == "live")
    breadth_live = sum(1 for item in breadth_groups if item.get("source_status") in {"live", "partial"})
    heat_live = sum(1 for item in heat_layers if item.get("source_status") in {"live", "partial"})
    return {
        "regime": regime,
        "headline": headline,
        "leaders": leaders,
        "laggards": laggards,
        "live_count": live_series,
        "stale_count": len(series) - live_series,
        "breadth_live_count": breadth_live,
        "heat_live_count": heat_live,
        "series_count": len(series),
        "refresh_interval_seconds": refresh_interval_seconds,
        "generated_at": generated_at,
    }


def build_collection_status(items: list[dict[str, Any]]) -> str:
    statuses = [str(item.get("source_status") or "").lower() for item in items if item]
    if not statuses:
        return "fallback"
    if all(status == "live" for status in statuses):
        return "live"
    if any(status in {"live", "partial"} for status in statuses):
        return "degraded"
    if any(status == "cached" for status in statuses):
        return "stale"
    return "fallback"


def build_view_summary(view_config: dict[str, Any], series: list[dict[str, Any]], breadth_groups: list[dict[str, Any]], heat_layers: list[dict[str, Any]], generated_at: str, refresh_interval_seconds: int) -> dict[str, Any]:
    ordered = sorted(series, key=lambda item: float(item.get("change_pct") or 0.0), reverse=True)
    leaders = [item["code"] for item in ordered[:2]]
    laggards = [item["code"] for item in ordered[-2:]]
    regime_score = 0
    for item in series:
        direction = sign_bucket(float(item.get("change_pct") or 0.0))
        regime_score += -direction if item.get("inverse_for_regime") else direction
    regime_score += sum(1 for group in breadth_groups if float(group.get("latest_pct") or 0.0) >= 55)
    regime_score -= sum(1 for group in breadth_groups if float(group.get("latest_pct") or 0.0) <= 45)

    if regime_score >= 2:
        regime = "risk-on"
    elif regime_score <= -2:
        regime = "risk-off"
    else:
        regime = "balanced"

    live_series = sum(1 for item in series if item.get("source_status") == "live")
    breadth_live = sum(1 for item in breadth_groups if item.get("source_status") in {"live", "partial"})
    heat_live = sum(1 for item in heat_layers if item.get("source_status") in {"live", "partial"})
    return {
        "regime": regime,
        "headline": str((view_config.get("headlines") or {}).get(regime) or ""),
        "leaders": leaders,
        "laggards": laggards,
        "live_count": live_series,
        "stale_count": max(len(series) - live_series, 0),
        "breadth_live_count": breadth_live,
        "heat_live_count": heat_live,
        "series_count": len(series),
        "breadth_count": len(breadth_groups),
        "heat_count": len(heat_layers),
        "refresh_interval_seconds": refresh_interval_seconds,
        "generated_at": generated_at,
        "status": build_collection_status(series + breadth_groups + heat_layers),
    }


def build_views_payload(series: list[dict[str, Any]], breadth_groups: list[dict[str, Any]], heat_layers: list[dict[str, Any]], generated_at: str, refresh_interval_seconds: int) -> dict[str, Any]:
    items = []
    for view_config in VIEW_CONFIGS:
        view_code = view_config["code"]
        view_series = [item for item in series if view_code in (item.get("views") or [])]
        view_breadth = [item for item in breadth_groups if view_code in (item.get("views") or [])]
        view_heat = [item for item in heat_layers if view_code in (item.get("views") or [])]
        items.append(
            {
                "code": view_code,
                "label": view_config["label"],
                "accent": view_config["accent"],
                "description": view_config["description"],
                "legend_note": view_config["legend_note"],
                "status": build_collection_status(view_series + view_breadth + view_heat),
                "series_codes": [item["code"] for item in view_series],
                "breadth_codes": [item["code"] for item in view_breadth],
                "heat_codes": [item["code"] for item in view_heat],
                "hero_breadth_code": view_breadth[0]["code"] if view_breadth else "",
                "summary": build_view_summary(view_config, view_series, view_breadth, view_heat, generated_at, refresh_interval_seconds),
            }
        )
    return {"default": VIEW_CONFIGS[0]["code"], "items": items}


def build_default_payload(error_message: str) -> dict[str, Any]:
    generated_at = utc_now_iso()
    series = [build_default_series(config, error_message) for config in SERIES_CONFIG]
    breadth_groups = [build_default_breadth_group(group, error_message) for group in BREADTH_GROUPS]
    heat_layers = [build_default_heat_layer(layer, error_message) for layer in HEAT_LAYERS]
    views = build_views_payload(series, breadth_groups, heat_layers, generated_at, DEFAULT_REFRESH_INTERVAL_SECONDS)
    return {
        "generated_at": generated_at,
        "schema_version": "3.0.0",
        "source": {"provider": "Yahoo Finance chart endpoint", "transport": "Static JSON generated locally by scripts/fetch_market_data.py"},
        "status": "fallback",
        "stale": True,
        "errors": [error_message],
        "summary": build_summary(series, breadth_groups, heat_layers, generated_at, DEFAULT_REFRESH_INTERVAL_SECONDS),
        "breadth": {"updated_at": generated_at, "groups": breadth_groups},
        "heat_layers": {"updated_at": generated_at, "legend": {"min_pct": -3.0, "max_pct": 3.0}, "layers": heat_layers},
        "views": views,
        "series": series,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate standalone market monitor JSON payload.")
    parser.add_argument("--output-file", default=str(Path(__file__).resolve().parents[1] / "data" / "normalized" / "market-data.json"), help="Output JSON path consumed by the web UI.")
    parser.add_argument("--cache-file", default=str(Path(__file__).resolve().parents[1] / ".runtime" / "market-data-cache.json"), help="Last successful payload cache for fallback recovery.")
    parser.add_argument("--timeout", type=int, default=12, help="HTTP timeout in seconds per market data request.")
    parser.add_argument("--retries", type=int, default=2, help="Retry count per symbol before fallback logic kicks in.")
    parser.add_argument("--max-points", type=int, default=DEFAULT_MAX_POINTS, help="Maximum intraday points kept per symbol.")
    parser.add_argument("--refresh-interval-seconds", type=int, default=DEFAULT_REFRESH_INTERVAL_SECONDS, help="Expected upstream refresh interval used by the web polling layer.")
    parser.add_argument("--min-refresh-seconds", type=int, default=DEFAULT_MIN_REFRESH_SECONDS, help="Reuse the last cached payload when it is newer than this threshold.")
    return parser.parse_args()


def try_reuse_hot_cache(cache_file: Path, output_file: Path, min_refresh_seconds: int) -> bool:
    if min_refresh_seconds <= 0:
        return False
    cached_payload = read_json(cache_file, {})
    generated_at = str(cached_payload.get("generated_at") or "")
    try:
        cached_dt = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    age_seconds = (datetime.now(UTC) - cached_dt).total_seconds()
    if age_seconds > min_refresh_seconds or not cached_payload:
        return False
    write_json(output_file, cached_payload)
    print(f"[market] hot cache reused age={round_value(age_seconds, 1)}s")
    return True


def main() -> int:
    args = parse_args()
    output_file = Path(args.output_file)
    cache_file = Path(args.cache_file)
    if try_reuse_hot_cache(cache_file, output_file, args.min_refresh_seconds):
        return 0

    cached_payload = read_json(cache_file, {})
    cached_series_by_code = {str(item.get("code")): item for item in (cached_payload.get("series") or []) if isinstance(item, dict) and item.get("code")}
    cached_breadth_by_code = {str(item.get("code")): item for item in ((cached_payload.get("breadth") or {}).get("groups") or []) if isinstance(item, dict) and item.get("code")}
    cached_heat_by_code = {str(item.get("code")): item for item in ((cached_payload.get("heat_layers") or {}).get("layers") or []) if isinstance(item, dict) and item.get("code")}

    symbols = get_symbol_union()
    snapshots: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    with ThreadPoolExecutor(max_workers=min(8, len(symbols))) as executor:
        future_map = {executor.submit(fetch_symbol_snapshot, symbol, args.timeout, args.retries): symbol for symbol in symbols}
        for future in as_completed(future_map):
            symbol = future_map[future]
            try:
                snapshots[symbol] = future.result()
                print(f"[market] fetched {symbol}")
            except Exception as error:
                errors.append(str(error))
                print(f"[market] missing {symbol} -> {error}")

    series: list[dict[str, Any]] = []
    live_series_count = 0
    for config in SERIES_CONFIG:
        snapshot = snapshots.get(config["symbol"])
        if snapshot:
            series.append(build_series_from_snapshot(config, snapshot, args.max_points))
            live_series_count += 1
        else:
            series.append(build_default_series(config, f"{config['symbol']} unavailable", cached_series_by_code.get(config["code"])))

    breadth_groups: list[dict[str, Any]] = []
    breadth_live = 0
    for group in BREADTH_GROUPS:
        payload, live, group_errors = build_breadth_group(group, snapshots, cached_breadth_by_code.get(group["code"]), args.max_points)
        breadth_groups.append(payload)
        breadth_live += 1 if live else 0
        errors.extend(group_errors)

    heat_layers: list[dict[str, Any]] = []
    heat_live = 0
    for layer in HEAT_LAYERS:
        payload, live, layer_errors = build_heat_layer(layer, snapshots, cached_heat_by_code.get(layer["code"]))
        heat_layers.append(payload)
        heat_live += 1 if live else 0
        errors.extend(layer_errors)

    generated_at = utc_now_iso()
    if live_series_count == len(SERIES_CONFIG) and breadth_live == len(BREADTH_GROUPS) and heat_live == len(HEAT_LAYERS):
        status, stale = "live", False
    elif live_series_count > 0 or breadth_live > 0 or heat_live > 0:
        status, stale = "degraded", True
    elif any(item.get("source_status") == "cached" for item in series + breadth_groups + heat_layers):
        status, stale = "stale", True
    else:
        fallback = build_default_payload("all market sections unavailable")
        write_json(output_file, fallback)
        write_json(cache_file, fallback)
        print(f"[market] output={output_file}")
        print("[market] status=fallback")
        return 0

    views = build_views_payload(series, breadth_groups, heat_layers, generated_at, args.refresh_interval_seconds)
    payload = {
        "generated_at": generated_at,
        "schema_version": "3.0.0",
        "source": {"provider": "Yahoo Finance chart endpoint", "transport": "Static JSON generated locally by scripts/fetch_market_data.py"},
        "status": status,
        "stale": stale,
        "errors": errors,
        "summary": build_summary(series, breadth_groups, heat_layers, generated_at, args.refresh_interval_seconds),
        "breadth": {"updated_at": generated_at, "groups": breadth_groups},
        "heat_layers": {"updated_at": generated_at, "legend": {"min_pct": -3.0, "max_pct": 3.0}, "layers": heat_layers},
        "views": views,
        "series": series,
    }

    write_json(output_file, payload)
    write_json(cache_file, payload)
    print(f"[market] output={output_file}")
    print(f"[market] status={status}")
    print(f"[market] live_series={live_series_count}/{len(SERIES_CONFIG)} breadth={breadth_live}/{len(BREADTH_GROUPS)} heat={heat_live}/{len(HEAT_LAYERS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
