const DEFAULT_MARKET_DATA_URL = "../data/normalized/market-data.json";
const CACHE_BUSTER_PARAM = "_ts";
const LOCAL_CACHE_KEY = "news_web_market_monitor_cache_v3";
const RETRY_DELAYS_MS = [900, 1600];

const VIEW_DEFINITIONS = [
  {
    code: "us",
    label: "US",
    accent: "#5aa9ff",
    description: "Index breadth, sector rotation and volatility pressure for the U.S. session.",
    legend_note: "Breadth tracks members above the previous close while the white line tracks benchmark return.",
    headlines: {
      "risk-on": "US participation is broadening while volatility pressure cools.",
      "risk-off": "US breadth is narrowing and defensives are taking the tape.",
      balanced: "US leadership is rotating with mixed breadth confirmation.",
    },
  },
  {
    code: "hk",
    label: "HK",
    accent: "#38bdf8",
    description: "Hong Kong beta, China tech proxies and FX pressure in one dense board.",
    legend_note: "HK proxy series use liquid Yahoo-tracked ETFs so the local pipeline stays resilient when index feeds are patchy.",
    headlines: {
      "risk-on": "Hong Kong participation is improving and tech beta is firming.",
      "risk-off": "Hong Kong breadth is fading and large-cap pressure is spreading.",
      balanced: "Hong Kong participation is mixed with selective internet leadership.",
    },
  },
  {
    code: "macro",
    label: "Macro",
    accent: "#facc15",
    description: "Dollar, rates, commodities, crypto and CNH cross-currents for macro risk reads.",
    legend_note: "Macro breadth normalizes inverse risk assets such as DXY, yields and USD/CNH before counting participation.",
    headlines: {
      "risk-on": "Macro crosswinds are easing as risk assets outpace the dollar complex.",
      "risk-off": "Macro pressure is building as the dollar complex tightens conditions.",
      balanced: "Macro signals are split with no clean cross-asset follow-through.",
    },
  },
];

const REGIME_INVERSE_CODES = new Set(["VIX", "DXY", "US10Y", "CNH"]);

const FALLBACK_SERIES = [
  { code: "SPX", label: "S&P 500", group: "US Equities", color: "#5aa9ff", precision: 2, suffix: "", base: 6735.25, offset: 24.2, views: ["us"] },
  { code: "NDX", label: "Nasdaq 100", group: "Growth", color: "#22c55e", precision: 2, suffix: "", base: 21118.4, offset: 118.6, views: ["us"] },
  { code: "VIX", label: "CBOE Volatility", group: "Risk Gauge", color: "#f97316", precision: 2, suffix: "", base: 19.64, offset: -0.58, views: ["us"], inverse_for_regime: true },
  { code: "HSI", label: "Hang Seng ETF", group: "Hong Kong", color: "#38bdf8", precision: 2, suffix: "", base: 25.88, offset: 0.18, views: ["hk"] },
  { code: "HKTECH", label: "Hang Seng TECH ETF", group: "China Tech", color: "#60a5fa", precision: 2, suffix: "", base: 10.34, offset: 0.11, views: ["hk"] },
  { code: "CNH", label: "USD/CNH", group: "FX", color: "#0ea5e9", precision: 4, suffix: "", base: 6.9032, offset: -0.0213, views: ["hk", "macro"], inverse_for_regime: true },
  { code: "DXY", label: "US Dollar Index", group: "Macro", color: "#facc15", precision: 2, suffix: "", base: 103.48, offset: -0.26, views: ["macro"], inverse_for_regime: true },
  { code: "US10Y", label: "US 10Y Yield", group: "Rates", color: "#a78bfa", precision: 3, suffix: "%", base: 4.223, offset: -0.031, views: ["macro"], inverse_for_regime: true },
  { code: "GOLD", label: "Gold", group: "Commodities", color: "#fbbf24", precision: 2, suffix: "", base: 2911.4, offset: 12.6, views: ["macro"] },
  { code: "WTI", label: "WTI Crude", group: "Commodities", color: "#fb7185", precision: 2, suffix: "", base: 67.2, offset: 0.92, views: ["macro"] },
  { code: "BTC", label: "Bitcoin", group: "Crypto", color: "#22d3ee", precision: 0, suffix: "", base: 89250, offset: 1280, views: ["macro"] },
];

const SERIES_VIEW_MAP = Object.fromEntries(FALLBACK_SERIES.map((entry) => [entry.code, entry.views.slice()]));
const BREADTH_VIEW_MAP = { NQ_BREADTH: ["us"], SECTOR_BREADTH: ["us"], HSI_BREADTH: ["hk"], MACRO_BREADTH: ["macro"] };
const HEAT_VIEW_MAP = { NQ_HEAT: ["us"], SECTOR_HEAT: ["us"], HSI_HEAT: ["hk"], MACRO_HEAT: ["macro"] };

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeViews(value, fallback = []) {
  const next = Array.isArray(value) ? value.filter(Boolean).map((item) => String(item).toLowerCase()) : fallback;
  return Array.from(new Set(next.filter(Boolean)));
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

function buildFallbackPoints(base, amplitude = 0.01) {
  const now = Date.now();
  const offsets = [-0.92, -0.72, -0.58, -0.38, -0.12, 0.08, 0.26, 0.11, 0.33, 0.46, 0.62, 0.54, 0.76, 0.68];
  return offsets.map((offset, index) => {
    const timestamp = new Date(now - (offsets.length - index - 1) * 5 * 60 * 1000).toISOString();
    return [timestamp, Number((base * (1 + offset * amplitude)).toFixed(4))];
  });
}

function signBucket(value, threshold = 0.08) {
  if (value >= threshold) return 1;
  if (value <= -threshold) return -1;
  return 0;
}

function buildCollectionStatus(items) {
  const normalized = items.map((item) => String(item?.source_status || "").toLowerCase()).filter(Boolean);
  if (!normalized.length) return "fallback";
  if (normalized.every((status) => status === "live")) return "live";
  if (normalized.some((status) => status === "live" || status === "partial")) return "degraded";
  if (normalized.some((status) => status === "cached")) return "stale";
  return "fallback";
}

function getViewDefinition(viewCode) {
  return VIEW_DEFINITIONS.find((item) => item.code === viewCode) || VIEW_DEFINITIONS[0];
}

function resolveItemViews(item, map) {
  const fallback = map[String(item?.code || "").toUpperCase()] || [];
  return normalizeViews(item?.views, fallback);
}

function buildSummarySnapshot(viewCode, series, breadthGroups, heatLayers, generatedAt, refreshIntervalSeconds) {
  const definition = getViewDefinition(viewCode);
  const ordered = [...series].sort((left, right) => Number(right?.change_pct || 0) - Number(left?.change_pct || 0));
  const leaders = ordered.slice(0, 2).map((item) => item.code);
  const laggards = ordered.slice(-2).map((item) => item.code);

  let regimeScore = 0;
  series.forEach((item) => {
    const direction = signBucket(Number(item?.change_pct || 0));
    regimeScore += item?.inverse_for_regime ? -direction : direction;
  });
  regimeScore += breadthGroups.filter((item) => Number(item?.latest_pct || 0) >= 55).length;
  regimeScore -= breadthGroups.filter((item) => Number(item?.latest_pct || 0) <= 45).length;

  let regime = "balanced";
  if (regimeScore >= 2) regime = "risk-on";
  if (regimeScore <= -2) regime = "risk-off";

  const liveSeries = series.filter((item) => item?.source_status === "live").length;
  const breadthLive = breadthGroups.filter((item) => ["live", "partial"].includes(item?.source_status)).length;
  const heatLive = heatLayers.filter((item) => ["live", "partial"].includes(item?.source_status)).length;

  return {
    regime,
    headline: definition.headlines[regime] || definition.headlines.balanced,
    leaders,
    laggards,
    live_count: liveSeries,
    stale_count: Math.max(series.length - liveSeries, 0),
    breadth_live_count: breadthLive,
    heat_live_count: heatLive,
    series_count: series.length,
    breadth_count: breadthGroups.length,
    heat_count: heatLayers.length,
    refresh_interval_seconds: refreshIntervalSeconds,
    generated_at: generatedAt,
    status: buildCollectionStatus([...series, ...breadthGroups, ...heatLayers]),
  };
}

function buildViewsPayload(series, breadthGroups, heatLayers, generatedAt, refreshIntervalSeconds) {
  return {
    default: VIEW_DEFINITIONS[0].code,
    items: VIEW_DEFINITIONS.map((definition) => {
      const filteredSeries = series.filter((item) => resolveItemViews(item, SERIES_VIEW_MAP).includes(definition.code));
      const filteredBreadth = breadthGroups.filter((item) => resolveItemViews(item, BREADTH_VIEW_MAP).includes(definition.code));
      const filteredHeat = heatLayers.filter((item) => resolveItemViews(item, HEAT_VIEW_MAP).includes(definition.code));
      return {
        code: definition.code,
        label: definition.label,
        accent: definition.accent,
        description: definition.description,
        legend_note: definition.legend_note,
        status: buildCollectionStatus([...filteredSeries, ...filteredBreadth, ...filteredHeat]),
        series_codes: filteredSeries.map((item) => item.code),
        breadth_codes: filteredBreadth.map((item) => item.code),
        heat_codes: filteredHeat.map((item) => item.code),
        hero_breadth_code: filteredBreadth[0]?.code || "",
        summary: buildSummarySnapshot(definition.code, filteredSeries, filteredBreadth, filteredHeat, generatedAt, refreshIntervalSeconds),
      };
    }),
  };
}

function buildFallbackPayload(errorMessage = "") {
  const generatedAt = new Date().toISOString();
  const series = FALLBACK_SERIES.map((entry) => {
    const last = Number((entry.base + entry.offset).toFixed(entry.precision));
    const previousClose = Number(entry.base.toFixed(entry.precision));
    const change = Number((last - previousClose).toFixed(entry.precision));
    const changePct = previousClose ? Number((((last - previousClose) / previousClose) * 100).toFixed(2)) : 0;
    const points = buildFallbackPoints(entry.base, entry.code === "BTC" ? 0.017 : 0.011);
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
      views: entry.views.slice(),
      inverse_for_regime: Boolean(entry.inverse_for_regime),
      source_status: "default",
      source_note: errorMessage || "browser-default",
    };
  });

  const breadthGroups = [
    { code: "NQ_BREADTH", label: "Nasdaq Breadth", description: "Fallback participation curve for Nasdaq leaders.", color: "#22c55e", benchmark_code: "NDX", benchmark_label: "Nasdaq 100", featured: true, latest_pct: 61.2, session_delta_pct: 8.4, benchmark_change_pct: 0.46, advancers: 8, decliners: 3, unchanged: 1, members_total: 12, live_members: 0, points: buildFallbackPoints(52, 0.022).map((point, index) => [point[0], Number((42 + index * 1.7 + (index % 2) * 2.4).toFixed(2)), Number((-0.42 + index * 0.09).toFixed(2))]), leaders: [{ symbol: "NVDA", label: "NVIDIA", change_pct: 1.48, display_change_pct: 1.48, normalized: false, state: "hot" }], laggards: [{ symbol: "AAPL", label: "Apple", change_pct: -0.74, display_change_pct: -0.74, normalized: false, state: "cold" }], views: ["us"], source_status: "default", source_note: errorMessage || "browser-default", heat_state: "hot", as_of: generatedAt },
    { code: "SECTOR_BREADTH", label: "Sector Breadth", description: "Fallback sector rotation curve for the SPDR complex.", color: "#f97316", benchmark_code: "SPX", benchmark_label: "S&P 500", featured: false, latest_pct: 54.5, session_delta_pct: 4.8, benchmark_change_pct: 0.18, advancers: 6, decliners: 4, unchanged: 1, members_total: 11, live_members: 0, points: buildFallbackPoints(49, 0.018).map((point, index) => [point[0], Number((46 + index * 0.9 + (index % 3) * 1.2).toFixed(2)), Number((-0.18 + index * 0.04).toFixed(2))]), leaders: [{ symbol: "XLE", label: "Energy", change_pct: 1.12, display_change_pct: 1.12, normalized: false, state: "hot" }], laggards: [{ symbol: "XLF", label: "Financials", change_pct: -0.64, display_change_pct: -0.64, normalized: false, state: "cold" }], views: ["us"], source_status: "default", source_note: errorMessage || "browser-default", heat_state: "neutral", as_of: generatedAt },
    { code: "HSI_BREADTH", label: "HSI Breadth", description: "Fallback participation curve for Hong Kong leaders.", color: "#5aa9ff", benchmark_code: "HSI", benchmark_label: "Hang Seng ETF", featured: true, latest_pct: 58.2, session_delta_pct: 5.3, benchmark_change_pct: 0.31, advancers: 7, decliners: 4, unchanged: 1, members_total: 12, live_members: 0, points: buildFallbackPoints(48, 0.02).map((point, index) => [point[0], Number((44 + index * 1.2 + (index % 4) * 0.8).toFixed(2)), Number((-0.22 + index * 0.05).toFixed(2))]), leaders: [{ symbol: "0700.HK", label: "Tencent", change_pct: 0.88, display_change_pct: 0.88, normalized: false, state: "hot" }], laggards: [{ symbol: "9988.HK", label: "Alibaba", change_pct: -0.91, display_change_pct: -0.91, normalized: false, state: "cold" }], views: ["hk"], source_status: "default", source_note: errorMessage || "browser-default", heat_state: "hot", as_of: generatedAt },
    { code: "MACRO_BREADTH", label: "Macro Risk Breadth", description: "Fallback macro breadth normalizing inverse dollar and rates pressure.", color: "#facc15", benchmark_code: "DXY", benchmark_label: "Dollar Proxy", featured: false, latest_pct: 66.7, session_delta_pct: 10.1, benchmark_change_pct: -0.26, advancers: 4, decliners: 2, unchanged: 0, members_total: 6, live_members: 0, points: buildFallbackPoints(56, 0.021).map((point, index) => [point[0], Number((39 + index * 2.25 + (index % 2) * 1.5).toFixed(2)), Number((0.18 - index * 0.04).toFixed(2))]), leaders: [{ symbol: "DXY", label: "Dollar", change_pct: 0.26, display_change_pct: -0.26, normalized: true, state: "hot" }], laggards: [{ symbol: "US10Y", label: "US 10Y", change_pct: -0.18, display_change_pct: 0.18, normalized: true, state: "cold" }], views: ["macro"], source_status: "default", source_note: errorMessage || "browser-default", heat_state: "hot", as_of: generatedAt },
  ];

  const heatLayers = [
    { code: "NQ_HEAT", label: "Nasdaq Leaders", description: "Fallback mega-cap heat layer.", source_status: "default", source_note: errorMessage || "browser-default", views: ["us"], tiles: [{ symbol: "NVDA", code: "NVDA", label: "NVIDIA", size: "lg", last: 901.2, change_pct: 1.48, state: "hot" }, { symbol: "MSFT", code: "MSFT", label: "Microsoft", size: "lg", last: 421.5, change_pct: 0.86, state: "hot" }, { symbol: "AAPL", code: "AAPL", label: "Apple", size: "lg", last: 233.4, change_pct: -0.74, state: "cold" }, { symbol: "AMZN", code: "AMZN", label: "Amazon", size: "md", last: 201.8, change_pct: 0.42, state: "neutral" }, { symbol: "META", code: "META", label: "Meta", size: "md", last: 644.8, change_pct: -0.35, state: "neutral" }, { symbol: "PLTR", code: "PLTR", label: "Palantir", size: "sm", last: 157.1, change_pct: 2.14, state: "hot" }], hottest: { symbol: "PLTR", change_pct: 2.14 }, coldest: { symbol: "AAPL", change_pct: -0.74 } },
    { code: "SECTOR_HEAT", label: "Sector Rotation", description: "Fallback sector heat layer.", source_status: "default", source_note: errorMessage || "browser-default", views: ["us"], tiles: [{ symbol: "XLK", code: "XLK", label: "Technology", size: "lg", last: 245.2, change_pct: 0.84, state: "hot" }, { symbol: "XLE", code: "XLE", label: "Energy", size: "lg", last: 93.4, change_pct: 1.12, state: "hot" }, { symbol: "XLF", code: "XLF", label: "Financials", size: "lg", last: 50.4, change_pct: -0.64, state: "cold" }, { symbol: "XLV", code: "XLV", label: "Healthcare", size: "md", last: 147.2, change_pct: 0.22, state: "neutral" }], hottest: { symbol: "XLE", change_pct: 1.12 }, coldest: { symbol: "XLF", change_pct: -0.64 } },
    { code: "HSI_HEAT", label: "HSI Core", description: "Fallback Hong Kong and China internet heat layer.", source_status: "default", source_note: errorMessage || "browser-default", views: ["hk"], tiles: [{ symbol: "0700.HK", code: "0700", label: "Tencent", size: "lg", last: 392.4, change_pct: 0.88, state: "hot" }, { symbol: "9988.HK", code: "9988", label: "Alibaba", size: "lg", last: 85.6, change_pct: -0.91, state: "cold" }, { symbol: "3690.HK", code: "3690", label: "Meituan", size: "lg", last: 122.8, change_pct: 0.54, state: "hot" }, { symbol: "1810.HK", code: "1810", label: "Xiaomi", size: "md", last: 19.8, change_pct: 1.26, state: "hot" }], hottest: { symbol: "1810", change_pct: 1.26 }, coldest: { symbol: "9988", change_pct: -0.91 } },
    { code: "MACRO_HEAT", label: "Macro Crosswinds", description: "Fallback dollar, rates, energy and crypto move map.", source_status: "default", source_note: errorMessage || "browser-default", views: ["macro"], tiles: [{ symbol: "DXY", code: "DXY", label: "Dollar", size: "lg", last: 103.22, change_pct: -0.26, state: "cold" }, { symbol: "US10Y", code: "US10Y", label: "US 10Y", size: "lg", last: 4.192, change_pct: -0.74, state: "cold" }, { symbol: "GOLD", code: "GOLD", label: "Gold", size: "md", last: 2924.0, change_pct: 0.43, state: "neutral" }, { symbol: "WTI", code: "WTI", label: "WTI", size: "md", last: 68.12, change_pct: 1.37, state: "hot" }, { symbol: "BTC", code: "BTC", label: "Bitcoin", size: "lg", last: 90530, change_pct: 1.43, state: "hot" }, { symbol: "CNH", code: "CNH", label: "USD/CNH", size: "sm", last: 6.8819, change_pct: -0.31, state: "cold" }], hottest: { symbol: "BTC", change_pct: 1.43 }, coldest: { symbol: "US10Y", change_pct: -0.74 } },
  ];

  const refreshIntervalSeconds = 60;
  return {
    generated_at: generatedAt,
    schema_version: "3.0.0",
    source: { provider: "Embedded browser fallback", transport: "Client-side default payload" },
    status: "fallback",
    stale: true,
    errors: errorMessage ? [errorMessage] : [],
    summary: buildSummarySnapshot("us", series, breadthGroups, heatLayers, generatedAt, refreshIntervalSeconds),
    breadth: { updated_at: generatedAt, groups: breadthGroups },
    heat_layers: { updated_at: generatedAt, legend: { min_pct: -3, max_pct: 3 }, layers: heatLayers },
    views: buildViewsPayload(series, breadthGroups, heatLayers, generatedAt, refreshIntervalSeconds),
    series,
  };
}

function normalizePayload(payload, sourceStatus = "") {
  const candidate = payload && typeof payload === "object" ? cloneJson(payload) : buildFallbackPayload("invalid payload");
  candidate.summary = candidate.summary && typeof candidate.summary === "object" ? candidate.summary : {};
  candidate.series = Array.isArray(candidate.series) ? candidate.series : [];
  candidate.breadth = candidate.breadth && typeof candidate.breadth === "object" ? candidate.breadth : { groups: [] };
  candidate.breadth.groups = Array.isArray(candidate.breadth.groups) ? candidate.breadth.groups : [];
  candidate.heat_layers = candidate.heat_layers && typeof candidate.heat_layers === "object" ? candidate.heat_layers : { layers: [] };
  candidate.heat_layers.layers = Array.isArray(candidate.heat_layers.layers) ? candidate.heat_layers.layers : [];
  candidate.errors = Array.isArray(candidate.errors) ? candidate.errors : [];

  candidate.series = candidate.series.map((entry) => ({ ...entry, views: resolveItemViews(entry, SERIES_VIEW_MAP), inverse_for_regime: Boolean(entry?.inverse_for_regime || REGIME_INVERSE_CODES.has(String(entry?.code || "").toUpperCase())) }));
  candidate.breadth.groups = candidate.breadth.groups.map((entry) => ({ ...entry, views: resolveItemViews(entry, BREADTH_VIEW_MAP), leaders: Array.isArray(entry?.leaders) ? entry.leaders : [], laggards: Array.isArray(entry?.laggards) ? entry.laggards : [] }));
  candidate.heat_layers.layers = candidate.heat_layers.layers.map((entry) => ({ ...entry, views: resolveItemViews(entry, HEAT_VIEW_MAP), tiles: Array.isArray(entry?.tiles) ? entry.tiles : [] }));

  if (sourceStatus && candidate.status === "live") candidate.status = sourceStatus;
  if (sourceStatus === "stale") candidate.stale = true;

  const refreshIntervalSeconds = Number(candidate.summary.refresh_interval_seconds || 60);
  const generatedAt = candidate.generated_at || candidate.summary.generated_at || new Date().toISOString();
  const derivedViews = buildViewsPayload(candidate.series, candidate.breadth.groups, candidate.heat_layers.layers, generatedAt, refreshIntervalSeconds);
  const incomingViewMap = new Map(((candidate.views && Array.isArray(candidate.views.items)) ? candidate.views.items : []).map((item) => [item.code, item]));

  candidate.views = {
    default: candidate.views?.default || derivedViews.default,
    items: derivedViews.items.map((derived) => {
      const incoming = incomingViewMap.get(derived.code) || {};
      const summary = incoming.summary && typeof incoming.summary === "object" ? { ...derived.summary, ...incoming.summary } : derived.summary;
      return {
        ...derived,
        ...incoming,
        accent: incoming.accent || derived.accent,
        description: incoming.description || derived.description,
        legend_note: incoming.legend_note || derived.legend_note,
        status: incoming.status || derived.status,
        series_codes: Array.isArray(incoming.series_codes) && incoming.series_codes.length ? incoming.series_codes : derived.series_codes,
        breadth_codes: Array.isArray(incoming.breadth_codes) && incoming.breadth_codes.length ? incoming.breadth_codes : derived.breadth_codes,
        heat_codes: Array.isArray(incoming.heat_codes) && incoming.heat_codes.length ? incoming.heat_codes : derived.heat_codes,
        hero_breadth_code: incoming.hero_breadth_code || derived.hero_breadth_code,
        summary,
      };
    }),
  };

  candidate.summary.series_count = candidate.series.length;
  candidate.summary.live_count = candidate.series.filter((item) => item?.source_status === "live").length;
  candidate.summary.stale_count = candidate.series.length - candidate.summary.live_count;
  candidate.summary.refresh_interval_seconds = refreshIntervalSeconds;
  candidate.summary.generated_at = generatedAt;
  return candidate;
}

function isValidPayload(payload) {
  return Boolean(payload && Array.isArray(payload.series) && payload.series.length > 0);
}

function readLocalCache() {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
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
    headers: { Accept: "application/json", "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
  });
  if (!response.ok) throw new Error(`Failed to fetch market data: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (!isValidPayload(payload)) throw new Error("Market data payload is empty");
  return normalizePayload(payload);
}

export const MARKET_REFRESH_INTERVAL_MS = 30_000;

export async function fetchMarketPayload() {
  let lastError = null;
  // The browser only consumes the static JSON generated by the local pipeline.
  // A short retry ladder plus localStorage cache keeps the board stable even if
  // the file is being refreshed at the same moment.
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
  if (cached) return normalizePayload(cached, "stale");
  // Final client-side fallback guarantees the market panel never crashes when
  // the normalized static file is unavailable.
  return normalizePayload(buildFallbackPayload(lastError?.message || "market data unavailable"), "fallback");
}

export function getMarketSeriesValues(series) {
  if (!series || !Array.isArray(series.points)) return [];
  return series.points
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const numeric = safeNumber(point[1]);
      return numeric === null ? null : { timestamp: String(point[0] || ""), value: numeric };
    })
    .filter(Boolean);
}
