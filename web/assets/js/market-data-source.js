const DEFAULT_MARKET_DATA_URL = "../data/normalized/market-data.json";
const CACHE_BUSTER_PARAM = "_ts";
const LOCAL_CACHE_KEY = "news_web_market_monitor_cache_v1";
const RETRY_DELAYS_MS = [900, 1600];

const FALLBACK_SERIES = [
  { code: "SPX", label: "S&P 500", group: "US Equities", color: "#5aa9ff", precision: 2, suffix: "", base: 6735.25, offset: 0.36 },
  { code: "NDX", label: "Nasdaq 100", group: "Growth", color: "#22c55e", precision: 2, suffix: "", base: 21118.4, offset: 0.52 },
  { code: "VIX", label: "CBOE Volatility", group: "Risk Gauge", color: "#f97316", precision: 2, suffix: "", base: 19.64, offset: -0.44 },
  { code: "DXY", label: "US Dollar Index", group: "Macro", color: "#facc15", precision: 2, suffix: "", base: 103.48, offset: -0.12 },
  { code: "US10Y", label: "US 10Y Yield", group: "Rates", color: "#a78bfa", precision: 3, suffix: "%", base: 4.223, offset: 0.021 },
  { code: "GOLD", label: "Gold Futures", group: "Commodities", color: "#fbbf24", precision: 2, suffix: "", base: 2911.4, offset: 0.31 },
  { code: "WTI", label: "WTI Crude", group: "Commodities", color: "#fb7185", precision: 2, suffix: "", base: 67.2, offset: 0.44 },
  { code: "BTC", label: "Bitcoin", group: "Crypto", color: "#22d3ee", precision: 0, suffix: "", base: 89250, offset: 620 },
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveMarketDataUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("marketData") || DEFAULT_MARKET_DATA_URL;
}

function buildRequestUrl(dataUrl) {
  const requestUrl = new URL(dataUrl, window.location.href);
  requestUrl.searchParams.set(CACHE_BUSTER_PARAM, String(Date.now()));
  return requestUrl.toString();
}

function buildFallbackPoints(base) {
  const now = Date.now();
  const offsets = [-0.011, -0.008, -0.004, -0.001, 0.002, 0.006, 0.004, 0.008, 0.01, 0.007, 0.012, 0.014];
  return offsets.map((offset, index) => {
    const timestamp = new Date(now - (offsets.length - index - 1) * 5 * 60 * 1000).toISOString();
    return [timestamp, Number((base * (1 + offset)).toFixed(4))];
  });
}

function buildFallbackPayload(errorMessage = "") {
  const generatedAt = new Date().toISOString();
  const series = FALLBACK_SERIES.map((entry) => {
    const last = Number((entry.base + entry.offset).toFixed(entry.precision));
    const previousClose = Number(entry.base.toFixed(entry.precision));
    const change = Number((last - previousClose).toFixed(entry.precision));
    const changePct = previousClose ? Number((((last - previousClose) / previousClose) * 100).toFixed(2)) : 0;
    const points = buildFallbackPoints(entry.base);
    const values = points.map((point) => Number(point[1]));

    return {
      symbol: entry.code,
      code: entry.code,
      label: entry.label,
      group: entry.group,
      color: entry.color,
      precision: entry.precision,
      suffix: entry.suffix,
      last,
      previous_close: previousClose,
      change,
      change_pct: changePct,
      day_low: Number(Math.min(...values).toFixed(entry.precision)),
      day_high: Number(Math.max(...values).toFixed(entry.precision)),
      as_of: generatedAt,
      as_of_label: "Fallback",
      exchange_timezone: "",
      market_state: changePct >= 0.15 ? "up" : changePct <= -0.15 ? "down" : "flat",
      points,
      source_status: "default",
      source_note: errorMessage || "browser-default",
    };
  });

  const breadthGroups = [
    {
      code: "NQ_BREADTH",
      label: "Nasdaq Breadth",
      description: "Fallback participation curve for Nasdaq leaders.",
      color: "#22c55e",
      benchmark_code: "NDX",
      benchmark_label: "Nasdaq 100",
      featured: true,
      latest_pct: 61.2,
      session_delta_pct: 8.4,
      benchmark_change_pct: 0.46,
      advancers: 8,
      decliners: 3,
      unchanged: 1,
      members_total: 12,
      live_members: 0,
      points: buildFallbackPoints(52).map((point, index) => [point[0], Number((42 + index * 1.8 + (index % 3)).toFixed(2)), Number((-0.35 + index * 0.08).toFixed(2))]),
      leaders: [{ symbol: "NVDA", label: "NVIDIA", change_pct: 1.48, state: "hot" }],
      laggards: [{ symbol: "AAPL", label: "Apple", change_pct: -0.74, state: "cold" }],
      source_status: "default",
      source_note: errorMessage || "browser-default",
      heat_state: "hot",
      as_of: generatedAt,
    },
    {
      code: "HSI_BREADTH",
      label: "HSI Breadth",
      description: "Fallback participation curve for Hang Seng leaders.",
      color: "#5aa9ff",
      benchmark_code: "HSI",
      benchmark_label: "Hang Seng Index",
      featured: false,
      latest_pct: 48.5,
      session_delta_pct: -3.2,
      benchmark_change_pct: -0.28,
      advancers: 5,
      decliners: 6,
      unchanged: 1,
      members_total: 12,
      live_members: 0,
      points: buildFallbackPoints(48).map((point, index) => [point[0], Number((51 - index * 0.35).toFixed(2)), Number((0.18 - index * 0.04).toFixed(2))]),
      leaders: [{ symbol: "0700.HK", label: "Tencent", change_pct: 0.88, state: "hot" }],
      laggards: [{ symbol: "9988.HK", label: "Alibaba", change_pct: -0.91, state: "cold" }],
      source_status: "default",
      source_note: errorMessage || "browser-default",
      heat_state: "neutral",
      as_of: generatedAt,
    },
  ];

  const heatLayers = [
    {
      code: "NQ_HEAT",
      label: "Nasdaq Leaders",
      description: "Fallback mega-cap heat layer.",
      source_status: "default",
      source_note: errorMessage || "browser-default",
      tiles: [
        { symbol: "NVDA", code: "NVDA", label: "NVIDIA", size: "lg", last: 901.2, change_pct: 1.48, state: "hot" },
        { symbol: "MSFT", code: "MSFT", label: "Microsoft", size: "lg", last: 421.5, change_pct: 0.86, state: "hot" },
        { symbol: "AAPL", code: "AAPL", label: "Apple", size: "lg", last: 233.4, change_pct: -0.74, state: "cold" },
        { symbol: "AMZN", code: "AMZN", label: "Amazon", size: "md", last: 201.8, change_pct: 0.42, state: "neutral" },
      ],
      hottest: { symbol: "NVDA", change_pct: 1.48 },
      coldest: { symbol: "AAPL", change_pct: -0.74 },
    },
    {
      code: "SECTOR_HEAT",
      label: "Sector Rotation",
      description: "Fallback sector heat layer.",
      source_status: "default",
      source_note: errorMessage || "browser-default",
      tiles: [
        { symbol: "XLK", code: "XLK", label: "Technology", size: "lg", last: 232.2, change_pct: 0.92, state: "hot" },
        { symbol: "XLE", code: "XLE", label: "Energy", size: "md", last: 95.1, change_pct: 1.12, state: "hot" },
        { symbol: "XLV", code: "XLV", label: "Healthcare", size: "md", last: 149.3, change_pct: -0.33, state: "neutral" },
        { symbol: "XLF", code: "XLF", label: "Financials", size: "lg", last: 50.4, change_pct: -0.64, state: "neutral" },
      ],
      hottest: { symbol: "XLE", change_pct: 1.12 },
      coldest: { symbol: "XLF", change_pct: -0.64 },
    },
  ];

  return {
    generated_at: generatedAt,
    schema_version: "2.0.0",
    source: {
      provider: "Embedded browser fallback",
      transport: "Client-side default payload",
    },
    status: "fallback",
    stale: true,
    errors: errorMessage ? [errorMessage] : [],
    summary: {
      regime: "balanced",
      headline: "Fallback snapshot loaded while the static market file is unavailable.",
      leaders: series.slice(0, 2).map((item) => item.code),
      laggards: series.slice(-2).map((item) => item.code),
      live_count: 0,
      stale_count: series.length,
      series_count: series.length,
      refresh_interval_seconds: 60,
      generated_at: generatedAt,
    },
    breadth: {
      updated_at: generatedAt,
      groups: breadthGroups,
    },
    heat_layers: {
      updated_at: generatedAt,
      legend: { min_pct: -3, max_pct: 3 },
      layers: heatLayers,
    },
    series,
  };
}

function normalizePayload(payload, sourceStatus = "") {
  const candidate = payload && typeof payload === "object" ? cloneJson(payload) : buildFallbackPayload("invalid payload");
  candidate.summary = candidate.summary || {};
  candidate.series = Array.isArray(candidate.series) ? candidate.series : [];
  candidate.breadth = candidate.breadth && typeof candidate.breadth === "object" ? candidate.breadth : { groups: [] };
  candidate.breadth.groups = Array.isArray(candidate.breadth.groups) ? candidate.breadth.groups : [];
  candidate.heat_layers = candidate.heat_layers && typeof candidate.heat_layers === "object" ? candidate.heat_layers : { layers: [] };
  candidate.heat_layers.layers = Array.isArray(candidate.heat_layers.layers) ? candidate.heat_layers.layers : [];
  candidate.errors = Array.isArray(candidate.errors) ? candidate.errors : [];

  if (sourceStatus && candidate.status === "live") {
    candidate.status = sourceStatus;
  }

  if (sourceStatus === "stale") {
    candidate.stale = true;
  }

  candidate.summary.series_count = candidate.series.length;
  candidate.summary.live_count = candidate.series.filter((item) => item?.source_status === "live").length;
  candidate.summary.stale_count = candidate.series.length - candidate.summary.live_count;
  return candidate;
}

function isValidPayload(payload) {
  return Boolean(payload && Array.isArray(payload.series) && payload.series.length > 0);
}

function readLocalCache() {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw);
    return isValidPayload(payload) ? payload : null;
  } catch (error) {
    return null;
  }
}

function writeLocalCache(payload) {
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage quota or privacy mode failures.
  }
}

async function requestMarketData() {
  const dataUrl = resolveMarketDataUrl();
  const response = await fetch(buildRequestUrl(dataUrl), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch market data: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!isValidPayload(payload)) {
    throw new Error("Market data payload is empty");
  }

  return normalizePayload(payload);
}

export const MARKET_REFRESH_INTERVAL_MS = 30_000;

export async function fetchMarketPayload() {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const payload = await requestMarketData();
      writeLocalCache(payload);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, RETRY_DELAYS_MS[attempt]);
        });
      }
    }
  }

  const cached = readLocalCache();
  if (cached) {
    return normalizePayload(cached, "stale");
  }

  return normalizePayload(buildFallbackPayload(lastError?.message || "market data unavailable"), "fallback");
}

export function getMarketSeriesValues(series) {
  if (!series || !Array.isArray(series.points)) {
    return [];
  }
  return series.points
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }
      const numeric = safeNumber(point[1]);
      return numeric === null ? null : { timestamp: String(point[0] || ""), value: numeric };
    })
    .filter(Boolean);
}
