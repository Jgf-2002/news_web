import { fetchMarketPayload, getMarketSeriesValues, MARKET_REFRESH_INTERVAL_MS } from "./market-data-source.js";

const COPY = {
  en: {
    live: "Live",
    degraded: "Partial Fallback",
    stale: "Cached Snapshot",
    fallback: "Default Snapshot",
    idle: "Sync Pending",
    updated: "Updated",
    range: "Range",
    previous: "Prev Close",
    breadth: "Breadth",
    breadthDelta: "Session Δ",
    breadthBench: "Bench",
    leadership: "Leadership",
    sync: "Sync Window",
    view: "Market View",
    focus: "Desk Focus",
    heat: "Heat",
    hottest: "Hottest",
    coldest: "Coldest",
    breadthKicker: "Market Breadth",
    breadthTitle: "Participation curves",
    breadthLegend: "Breadth % + benchmark return overlay",
    heatKicker: "Heat Layers",
    heatTitle: "Rotation stack",
    heatLegend: "Hot = demand | Cold = distribution",
    tapeEmpty: "Cross-asset tape temporarily unavailable",
    advancers: "Adv",
    decliners: "Dec",
    unchanged: "Flat",
    sourceLive: "LIVE",
    sourceCached: "CACHED",
    sourceDefault: "FALLBACK",
    sourcePartial: "PARTIAL",
    trendUp: "Bid",
    trendDown: "Offered",
    trendFlat: "Flat",
    regimeRiskOn: "RISK-ON",
    regimeRiskOff: "RISK-OFF",
    regimeBalanced: "BALANCED",
    headlineRiskOn: "Participation broadens while defensive gauges cool.",
    headlineRiskOff: "Breadth narrows and defensive layers are heating up.",
    headlineBalanced: "Cross-asset leadership is rotating without full confirmation.",
    summaryPending: "Waiting for local market payload.",
    legendTitle: "Mini Legend",
    legendBreadth: "Breadth curve",
    legendBenchmark: "Benchmark",
    legendHot: "Hot",
    legendNeutral: "Neutral",
    legendCold: "Cold",
    legendRefresh: "Refresh",
    legendNormalized: "INV = inverse asset normalized in breadth math",
    boardLeaders: "Leaders",
    boardLaggards: "Laggards",
    boardEmpty: "No board data available.",
    watchlist: "Watchlist",
    normalized: "INV",
    liveFeeds: "live feeds",
    cards: "cards",
    layers: "layers",
  },
  zh: {
    live: "\u5b9e\u65f6",
    degraded: "\u90e8\u5206\u964d\u7ea7",
    stale: "\u7f13\u5b58\u5feb\u7167",
    fallback: "\u9ed8\u8ba4\u5feb\u7167",
    idle: "\u7b49\u5f85\u540c\u6b65",
    updated: "\u66f4\u65b0",
    range: "\u65e5\u5185\u533a\u95f4",
    previous: "\u6628\u6536",
    breadth: "\u5bbd\u5ea6",
    breadthDelta: "\u65e5\u5185\u53d8\u5316",
    breadthBench: "\u57fa\u51c6",
    leadership: "\u9886\u6da8\u9886\u8dcc",
    sync: "\u6570\u636e\u540c\u6b65",
    view: "\u5e02\u573a\u89c6\u56fe",
    focus: "\u76d8\u9762\u7126\u70b9",
    heat: "\u70ed\u529b",
    hottest: "\u6700\u70ed",
    coldest: "\u6700\u51b7",
    breadthKicker: "\u5e02\u573a\u5bbd\u5ea6",
    breadthTitle: "\u53c2\u4e0e\u7387\u66f2\u7ebf",
    breadthLegend: "\u5bbd\u5ea6\u767e\u5206\u6bd4 + \u57fa\u51c6\u6da8\u8dcc\u53e0\u52a0",
    heatKicker: "\u70ed\u529b\u5c42",
    heatTitle: "\u8f6e\u52a8\u70ed\u529b",
    heatLegend: "\u70ed = \u4e70\u76d8 | \u51b7 = \u6d3e\u53d1",
    tapeEmpty: "\u8de8\u8d44\u4ea7\u901f\u89c8\u6682\u65f6\u4e0d\u53ef\u7528",
    advancers: "\u4e0a\u6da8",
    decliners: "\u4e0b\u8dcc",
    unchanged: "\u5e73",
    sourceLive: "\u5b9e\u65f6",
    sourceCached: "\u7f13\u5b58",
    sourceDefault: "\u9ed8\u8ba4",
    sourcePartial: "\u90e8\u5206",
    trendUp: "\u505a\u591a",
    trendDown: "\u505a\u7a7a",
    trendFlat: "\u6a2a\u76d8",
    regimeRiskOn: "\u98ce\u9669\u504f\u597d",
    regimeRiskOff: "\u98ce\u9669\u56de\u907f",
    regimeBalanced: "\u5e73\u8861",
    headlineRiskOn: "\u53c2\u4e0e\u7387\u6269\u6563\uff0c\u9632\u5fa1\u6027\u6307\u6807\u964d\u6e29\u3002",
    headlineRiskOff: "\u5bbd\u5ea6\u6536\u7f29\uff0c\u9632\u5fa1\u6027\u70ed\u529b\u5347\u6e29\u3002",
    headlineBalanced: "\u8de8\u8d44\u4ea7\u9886\u6da8\u8f6e\u52a8\uff0c\u786e\u8ba4\u4e0d\u8db3\u3002",
    summaryPending: "\u7b49\u5f85\u672c\u5730\u5e02\u573a\u6570\u636e\u8f7d\u5165\u3002",
    legendTitle: "\u8ff7\u4f60\u56fe\u4f8b",
    legendBreadth: "\u5bbd\u5ea6\u66f2\u7ebf",
    legendBenchmark: "\u57fa\u51c6",
    legendHot: "\u70ed",
    legendNeutral: "\u4e2d\u6027",
    legendCold: "\u51b7",
    legendRefresh: "\u5237\u65b0",
    legendNormalized: "INV = \u9006\u5411\u8d44\u4ea7\u5df2\u5728\u5bbd\u5ea6\u7edf\u8ba1\u4e2d\u5f52\u4e00\u5316",
    boardLeaders: "\u5f3a\u52bf",
    boardLaggards: "\u5f31\u52bf",
    boardEmpty: "\u6682\u65e0\u53ef\u7528\u677f\u5757\u6570\u636e\u3002",
    watchlist: "\u89c2\u5bdf\u5217\u8868",
    normalized: "INV",
    liveFeeds: "\u5b9e\u65f6\u6e90",
    cards: "\u5361\u7247",
    layers: "\u5c42",
  },
};

const getCopy = (language) => (language === "en" ? COPY.en : COPY.zh);
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function formatTimeLabel(value, language) {
  if (!value) return "--";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(parsed));
}

function formatNumber(value, precision = 2, suffix = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${numeric.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })}${suffix}`;
}

function formatSigned(value, precision = 2, suffix = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${numeric > 0 ? "+" : ""}${formatNumber(numeric, precision, suffix)}`;
}

function labelByTrend(trend, language) {
  const copy = getCopy(language);
  if (trend === "up") return copy.trendUp;
  if (trend === "down") return copy.trendDown;
  return copy.trendFlat;
}

function labelBySource(sourceStatus, language) {
  const copy = getCopy(language);
  if (sourceStatus === "cached") return copy.sourceCached;
  if (sourceStatus === "default") return copy.sourceDefault;
  if (sourceStatus === "partial") return copy.sourcePartial;
  return copy.sourceLive;
}

function labelByStatus(status, language) {
  const copy = getCopy(language);
  if (status === "live") return copy.live;
  if (status === "degraded") return copy.degraded;
  if (status === "stale") return copy.stale;
  if (status === "fallback") return copy.fallback;
  return copy.idle;
}

function formatRegimeLabel(regime, language) {
  const copy = getCopy(language);
  if (regime === "risk-on") return copy.regimeRiskOn;
  if (regime === "risk-off") return copy.regimeRiskOff;
  return copy.regimeBalanced;
}

function formatHeadline(regime, language, fallback) {
  if (fallback) return fallback;
  const copy = getCopy(language);
  if (regime === "risk-on") return copy.headlineRiskOn;
  if (regime === "risk-off") return copy.headlineRiskOff;
  return copy.headlineBalanced;
}

function buildLinePath(values, width, height, paddingX, paddingY, minValue, maxValue) {
  if (!Array.isArray(values) || !values.length) return "";
  const range = maxValue - minValue || 1;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;
  return values
    .map((value, index) => {
      const x = paddingX + (plotWidth * index) / Math.max(values.length - 1, 1);
      const y = paddingY + plotHeight - ((value - minValue) / range) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(linePath, width, height, paddingX, paddingY) {
  if (!linePath) return "";
  const baselineY = height - paddingY;
  const firstX = paddingX;
  const lastX = width - paddingX;
  return `${linePath} L ${lastX.toFixed(2)} ${baselineY.toFixed(2)} L ${firstX.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

function resolveViewPayload(payload, activeViewCode) {
  const items = Array.isArray(payload?.views?.items) ? payload.views.items : [];
  const view = items.find((item) => item.code === activeViewCode) || items.find((item) => item.code === payload?.views?.default) || items[0] || null;
  if (!view) {
    return { view: null, summary: payload?.summary || {}, series: payload?.series || [], breadthGroups: payload?.breadth?.groups || [], heatLayers: payload?.heat_layers?.layers || [] };
  }
  const seriesCodes = new Set(view.series_codes || []);
  const breadthCodes = new Set(view.breadth_codes || []);
  const heatCodes = new Set(view.heat_codes || []);
  return {
    view,
    summary: view.summary || payload.summary || {},
    series: (payload.series || []).filter((item) => seriesCodes.has(item.code)),
    breadthGroups: (payload.breadth?.groups || []).filter((item) => breadthCodes.has(item.code)),
    heatLayers: (payload.heat_layers?.layers || []).filter((item) => heatCodes.has(item.code)),
  };
}

function buildSparkline(series, cardId) {
  const values = getMarketSeriesValues(series).map((item) => item.value);
  if (!values.length) return `<div class="market-sparkline-empty" aria-hidden="true"></div>`;
  const width = 280;
  const height = 88;
  const paddingX = 10;
  const paddingY = 10;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const linePath = buildLinePath(values, width, height, paddingX, paddingY, minValue, maxValue);
  const areaPath = buildAreaPath(linePath, width, height, paddingX, paddingY);
  const trendColor = Number(series?.change_pct || 0) >= 0 ? "#38bdf8" : "#f97316";
  return `<svg class="market-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="spark-${cardId}"><title id="spark-${cardId}">${escapeHtml(series?.label || series?.code || "series")}</title><defs><linearGradient id="spark-fill-${cardId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${trendColor}" stop-opacity="0.28"></stop><stop offset="100%" stop-color="${trendColor}" stop-opacity="0"></stop></linearGradient></defs><line class="market-sparkline-grid" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}"></line><path d="${areaPath}" fill="url(#spark-fill-${cardId})"></path><path d="${linePath}" fill="none" stroke="${trendColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function buildMiniSignalChart(group, chartId) {
  const points = Array.isArray(group?.points) ? group.points : [];
  if (!points.length) return `<div class="market-summary-spark is-empty"></div>`;
  const width = 248;
  const height = 112;
  const paddingX = 10;
  const paddingY = 14;
  const breadthValues = points.map((point) => Number(point?.[1] || 0));
  const benchmarkValues = points.map((point) => Number(point?.[2] || 0));
  const breadthPath = buildLinePath(breadthValues, width, height, paddingX, paddingY, 0, 100);
  const benchmarkSpan = Math.max(1.2, ...benchmarkValues.map((value) => Math.abs(value)));
  const benchmarkPath = buildLinePath(benchmarkValues, width, height, paddingX, paddingY, -benchmarkSpan, benchmarkSpan);
  const fillPath = buildAreaPath(breadthPath, width, height, paddingX, paddingY);
  return `<svg class="market-summary-spark" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="summary-${chartId}"><title id="summary-${chartId}">${escapeHtml(group?.label || "Breadth")}</title><defs><linearGradient id="summary-fill-${chartId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${escapeHtml(group?.color || "#38bdf8")}" stop-opacity="0.32"></stop><stop offset="100%" stop-color="${escapeHtml(group?.color || "#38bdf8")}" stop-opacity="0"></stop></linearGradient></defs><line class="breadth-grid-line" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}"></line><path d="${fillPath}" fill="url(#summary-fill-${chartId})"></path><path d="${breadthPath}" class="breadth-primary-line" stroke="${escapeHtml(group?.color || "#38bdf8")}"></path><path d="${benchmarkPath}" class="breadth-benchmark-line"></path></svg>`;
}

function buildBreadthChart(group, index) {
  const points = Array.isArray(group?.points) ? group.points : [];
  if (!points.length) return `<div class="breadth-chart-empty" aria-hidden="true"></div>`;
  const width = 520;
  const height = 196;
  const paddingX = 18;
  const paddingY = 18;
  const breadthValues = points.map((point) => Number(point?.[1] || 0));
  const benchmarkValues = points.map((point) => Number(point?.[2] || 0));
  const breadthPath = buildLinePath(breadthValues, width, height, paddingX, paddingY, 0, 100);
  const benchmarkSpan = Math.max(1.2, ...benchmarkValues.map((value) => Math.abs(value)));
  const benchmarkPath = buildLinePath(benchmarkValues, width, height, paddingX, paddingY, -benchmarkSpan, benchmarkSpan);
  const breadthFill = buildAreaPath(breadthPath, width, height, paddingX, paddingY);
  return `<div class="breadth-chart-wrap"><svg class="breadth-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="breadth-${index}"><title id="breadth-${index}">${escapeHtml(group?.label || "Breadth")}</title><defs><linearGradient id="breadth-fill-${index}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${escapeHtml(group?.color || "#38bdf8")}" stop-opacity="0.22"></stop><stop offset="100%" stop-color="${escapeHtml(group?.color || "#38bdf8")}" stop-opacity="0"></stop></linearGradient></defs><line class="breadth-grid-line" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}"></line><line class="breadth-grid-line" x1="0" y1="${paddingY}" x2="${width}" y2="${paddingY}"></line><line class="breadth-grid-line" x1="0" y1="${height - paddingY}" x2="${width}" y2="${height - paddingY}"></line><path d="${breadthFill}" fill="url(#breadth-fill-${index})"></path><path d="${breadthPath}" class="breadth-primary-line" stroke="${escapeHtml(group?.color || "#38bdf8")}"></path><path d="${benchmarkPath}" class="breadth-benchmark-line"></path></svg></div>`;
}

function tileIntensity(changePct) {
  return Math.min(Math.abs(Number(changePct || 0)) / 3.5, 1).toFixed(3);
}

function renderToolbar(switcherContainer, legendContainer, payload, viewData, language, onSelectView) {
  if (!switcherContainer || !legendContainer) return;
  const copy = getCopy(language);
  const views = payload?.views?.items || [];
  const activeView = viewData.view || views[0] || null;
  const heroBreadth = viewData.breadthGroups[0] || null;

  switcherContainer.innerHTML = `<div class="market-view-strip">${views
    .map((view) => {
      const isActive = view.code === activeView?.code;
      return `<button class="market-view-chip ${isActive ? "is-active" : ""}" type="button" role="tab" aria-selected="${isActive}" data-market-view="${escapeHtml(view.code)}" style="--view-accent:${escapeHtml(view.accent || "#38bdf8")}"><span class="market-view-chip-label">${escapeHtml(view.label || view.code.toUpperCase())}</span><span class="market-view-chip-meta">${escapeHtml(view.description || "")}</span></button>`;
    })
    .join("")}</div><div class="market-view-meta"><div><p class="market-summary-label">${escapeHtml(copy.view)}</p><p class="market-view-meta-title">${escapeHtml(activeView?.label || "--")} · ${escapeHtml(labelByStatus(activeView?.status, language))}</p></div><div class="market-view-meta-cluster"><span class="market-status-micro">${escapeHtml(`${viewData.summary?.live_count || 0}/${viewData.summary?.series_count || 0} ${copy.liveFeeds}`)}</span><span class="market-status-micro">${escapeHtml(`${viewData.heatLayers.length} ${copy.layers}`)}</span><span class="market-status-micro">${escapeHtml(`${viewData.breadthGroups.length} ${copy.cards}`)}</span>${heroBreadth ? `<span class="market-status-micro accent">${escapeHtml(formatNumber(heroBreadth.latest_pct, 1, "%"))}</span>` : ""}</div></div>`;

  legendContainer.innerHTML = `<div class="market-legend-head"><div><p class="market-summary-label">${escapeHtml(copy.legendTitle)}</p><p class="market-legend-title">${escapeHtml(activeView?.label || "--")} · ${escapeHtml(copy.focus)}</p></div><span class="market-series-status" data-state="${escapeHtml(payload?.status || "idle")}">${escapeHtml(labelByStatus(payload?.status, language))}</span></div><div class="market-legend-row"><span class="market-legend-swatch market-legend-line" style="--legend-color:${escapeHtml(heroBreadth?.color || activeView?.accent || "#38bdf8")}"></span><span>${escapeHtml(copy.legendBreadth)}</span><span class="market-legend-swatch market-legend-benchmark"></span><span>${escapeHtml(copy.legendBenchmark)}</span></div><div class="market-legend-row"><span class="market-legend-swatch market-legend-hot"></span><span>${escapeHtml(copy.legendHot)}</span><span class="market-legend-swatch market-legend-neutral"></span><span>${escapeHtml(copy.legendNeutral)}</span><span class="market-legend-swatch market-legend-cold"></span><span>${escapeHtml(copy.legendCold)}</span></div><div class="market-legend-row market-legend-row-pills"><span class="market-series-status" data-state="live">${escapeHtml(copy.sourceLive)}</span><span class="market-series-status" data-state="cached">${escapeHtml(copy.sourceCached)}</span><span class="market-series-status" data-state="default">${escapeHtml(copy.sourceDefault)}</span><span class="market-series-status" data-state="partial">${escapeHtml(copy.sourcePartial)}</span></div><p class="market-legend-footnote">${escapeHtml(copy.legendRefresh)}: ${escapeHtml(String(viewData.summary?.refresh_interval_seconds || 60))}s · ${escapeHtml(activeView?.legend_note || copy.legendNormalized)}</p>`;

  switcherContainer.querySelectorAll("[data-market-view]").forEach((button) => {
    button.addEventListener("click", () => onSelectView(button.getAttribute("data-market-view")));
  });
}

function renderSummary(summaryContainer, viewData, language) {
  const copy = getCopy(language);
  const summary = viewData.summary || {};
  const heroBreadth = viewData.breadthGroups[0] || null;
  const heroHeat = viewData.heatLayers[0] || null;
  summaryContainer.innerHTML = `<article class="market-summary-card market-summary-card-wide market-summary-hero"><div class="market-summary-hero-head"><div><p class="market-summary-label">${escapeHtml(copy.focus)}</p><div class="market-summary-badge-row"><span class="market-regime-badge" data-regime="${escapeHtml(summary.regime || "balanced")}">${escapeHtml(formatRegimeLabel(summary.regime, language))}</span><span class="market-view-pill">${escapeHtml(viewData.view?.label || "--")}</span></div></div><div class="market-summary-updated">${escapeHtml(formatTimeLabel(summary.generated_at, language))}</div></div><div class="market-summary-main market-summary-main-split"><div class="market-summary-copy"><p class="market-summary-headline">${escapeHtml(formatHeadline(summary.regime, language, summary.headline))}</p><p class="market-summary-meta">${escapeHtml(viewData.view?.description || "")}</p><div class="market-summary-chip-row"><span class="market-status-micro accent">${escapeHtml(`${summary.live_count || 0}/${summary.series_count || 0} ${copy.liveFeeds}`)}</span><span class="market-status-micro">${escapeHtml(`${summary.breadth_live_count || 0}/${summary.breadth_count || 0} ${copy.breadth}`)}</span><span class="market-status-micro">${escapeHtml(`${summary.heat_live_count || 0}/${summary.heat_count || 0} ${copy.layers}`)}</span></div></div><div class="market-summary-chart-wrap">${buildMiniSignalChart(heroBreadth, `${viewData.view?.code || "view"}-hero`)}</div></div></article><article class="market-summary-card market-summary-stat"><p class="market-summary-label">${escapeHtml(copy.breadth)}</p><p class="market-summary-value">${escapeHtml(heroBreadth ? formatNumber(heroBreadth.latest_pct, 1, "%") : "--")}</p><p class="market-summary-meta">${escapeHtml(copy.breadthDelta)} ${escapeHtml(heroBreadth ? formatSigned(heroBreadth.session_delta_pct, 1, "%") : "--")}</p><p class="market-summary-meta">${escapeHtml(copy.breadthBench)} ${escapeHtml(heroBreadth ? formatSigned(heroBreadth.benchmark_change_pct, 2, "%") : "--")}</p></article><article class="market-summary-card market-summary-stat"><p class="market-summary-label">${escapeHtml(copy.leadership)}</p><div class="market-summary-symbols">${(summary.leaders || []).map((symbol) => `<span class="market-summary-symbol is-hot">${escapeHtml(symbol)}</span>`).join("")}${(summary.laggards || []).map((symbol) => `<span class="market-summary-symbol is-cold">${escapeHtml(symbol)}</span>`).join("")}</div><p class="market-summary-meta">${escapeHtml(copy.hottest)} ${escapeHtml(heroHeat?.hottest?.symbol || "--")} · ${escapeHtml(copy.coldest)} ${escapeHtml(heroHeat?.coldest?.symbol || "--")}</p></article><article class="market-summary-card market-summary-stat"><p class="market-summary-label">${escapeHtml(copy.sync)}</p><p class="market-summary-value">${escapeHtml(`${summary.live_count || 0}/${summary.series_count || 0}`)}</p><p class="market-summary-meta">${escapeHtml(labelByStatus(summary.status || viewData.view?.status, language))}</p><p class="market-summary-meta">${escapeHtml(copy.updated)} ${escapeHtml(formatTimeLabel(summary.generated_at, language))}</p></article>`;
}

function renderBreadthBoard(container, viewData, language) {
  const copy = getCopy(language);
  if (!viewData.breadthGroups.length) {
    container.innerHTML = `<div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.breadthKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.breadthTitle)}</h3></div></div><div class="market-empty">${escapeHtml(copy.boardEmpty)}</div>`;
    return;
  }

  container.innerHTML = `<div class="market-board-head market-board-head-enhanced"><div><p class="market-board-kicker">${escapeHtml(copy.breadthKicker)}</p><h3 class="market-board-title">${escapeHtml(viewData.view?.label || "")} · ${escapeHtml(copy.breadthTitle)}</h3></div><p class="market-board-legend">${escapeHtml(copy.breadthLegend)}</p></div><div class="market-breadth-grid">${viewData.breadthGroups
    .map((group, index) => `<article class="breadth-card ${group.featured || index === 0 ? "is-featured" : ""}" data-state="${escapeHtml(group.heat_state || "neutral")}"><div class="breadth-card-head"><div><p class="breadth-card-kicker">${escapeHtml(group.description || "")}</p><h4 class="breadth-card-title">${escapeHtml(group.label || "--")}</h4></div><div class="market-card-badges"><span class="market-series-status" data-state="${escapeHtml(group.source_status || "live")}">${escapeHtml(labelBySource(group.source_status, language))}</span><span class="market-trend-pill" data-trend="${group.heat_state === "hot" ? "up" : group.heat_state === "cold" ? "down" : "flat"}">${escapeHtml(copy.heat)}</span></div></div><div class="breadth-metrics"><div><p class="breadth-metric-label">${escapeHtml(copy.breadth)}</p><p class="breadth-metric-value breadth-metric-value-large">${escapeHtml(formatNumber(group.latest_pct, 1, "%"))}</p></div><div><p class="breadth-metric-label">${escapeHtml(copy.breadthDelta)}</p><p class="breadth-metric-value">${escapeHtml(formatSigned(group.session_delta_pct, 1, "%"))}</p></div><div><p class="breadth-metric-label">${escapeHtml(copy.breadthBench)}</p><p class="breadth-metric-value">${escapeHtml(formatSigned(group.benchmark_change_pct, 2, "%"))}</p></div></div>${buildBreadthChart(group, `${group.code}-${index}`)}<div class="breadth-footer"><span>${escapeHtml(copy.advancers)} ${escapeHtml(String(group.advancers || 0))}</span><span>${escapeHtml(copy.decliners)} ${escapeHtml(String(group.decliners || 0))}</span><span>${escapeHtml(copy.unchanged)} ${escapeHtml(String(group.unchanged || 0))}</span><span>${escapeHtml(`${group.live_members || 0}/${group.members_total || 0}`)}</span></div><div class="breadth-chip-section"><div class="breadth-chip-row"><span class="breadth-chip-label">${escapeHtml(copy.boardLeaders)}</span>${(group.leaders || [])
      .slice(0, 3)
      .map((item) => `<span class="breadth-chip" data-state="${escapeHtml(item.state || "neutral")}"><strong>${escapeHtml(item.symbol || "--")}</strong><span>${escapeHtml(formatSigned(item.display_change_pct ?? item.change_pct, 2, "%"))}</span>${item.normalized ? `<em>${escapeHtml(copy.normalized)}</em>` : ""}</span>`)
      .join("")}</div><div class="breadth-chip-row"><span class="breadth-chip-label">${escapeHtml(copy.boardLaggards)}</span>${(group.laggards || [])
      .slice(0, 3)
      .map((item) => `<span class="breadth-chip" data-state="${escapeHtml(item.state || "neutral")}"><strong>${escapeHtml(item.symbol || "--")}</strong><span>${escapeHtml(formatSigned(item.display_change_pct ?? item.change_pct, 2, "%"))}</span>${item.normalized ? `<em>${escapeHtml(copy.normalized)}</em>` : ""}</span>`)
      .join("")}</div></div></article>`)
    .join("")}</div>`;
}

function renderHeatBoard(container, viewData, language) {
  const copy = getCopy(language);
  if (!viewData.heatLayers.length) {
    container.innerHTML = `<div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.heatKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.heatTitle)}</h3></div></div><div class="market-empty">${escapeHtml(copy.boardEmpty)}</div>`;
    return;
  }

  container.innerHTML = `<div class="market-board-head market-board-head-enhanced"><div><p class="market-board-kicker">${escapeHtml(copy.heatKicker)}</p><h3 class="market-board-title">${escapeHtml(viewData.view?.label || "")} · ${escapeHtml(copy.heatTitle)}</h3></div><p class="market-board-legend">${escapeHtml(copy.heatLegend)}</p></div><div class="market-heat-layers">${viewData.heatLayers
    .map(
      (layer) => `<section class="heat-layer"><div class="heat-layer-head"><div><p class="heat-layer-desc">${escapeHtml(layer.description || "")}</p><h4 class="heat-layer-title">${escapeHtml(layer.label || "--")}</h4></div><div class="market-card-badges"><span class="market-series-status" data-state="${escapeHtml(layer.source_status || "live")}">${escapeHtml(labelBySource(layer.source_status, language))}</span><span class="market-status-micro accent">${escapeHtml(`${copy.hottest} ${layer.hottest?.symbol || "--"}`)}</span></div></div><div class="heat-layer-grid">${(layer.tiles || [])
        .map(
          (tile) => `<article class="heat-tile heat-tile-${escapeHtml(tile.size || "sm")}" data-state="${escapeHtml(tile.state || "neutral")}" style="--tile-intensity:${tileIntensity(tile.change_pct)}"><div><p class="heat-tile-name">${escapeHtml(tile.label || "--")}</p><p class="heat-tile-symbol">${escapeHtml(tile.code || tile.symbol || "--")}</p></div><div><p class="heat-tile-value">${escapeHtml(formatSigned(tile.change_pct, 2, "%"))}</p><p class="heat-layer-desc">${escapeHtml(formatNumber(tile.last, tile.code === "BTC" ? 0 : tile.code === "US10Y" ? 3 : 2))}</p></div></article>`,
        )
        .join("")}</div></section>`,
    )
    .join("")}</div>`;
}

function renderGrid(gridContainer, viewData, language) {
  const copy = getCopy(language);
  if (!viewData.series.length) {
    gridContainer.innerHTML = `<div class="market-empty">${escapeHtml(copy.tapeEmpty)}</div>`;
    return;
  }

  gridContainer.innerHTML = viewData.series
    .map((series, index) => {
      const precision = Number(series.precision ?? 2);
      const suffix = String(series.suffix || "");
      const changeClass = Number(series.change_pct || 0) > 0 ? "positive" : Number(series.change_pct || 0) < 0 ? "negative" : "neutral";
      return `<article class="market-card" data-trend="${escapeHtml(series.market_state || "flat")}"><div class="market-card-top"><div><p class="market-card-kicker">${escapeHtml(series.group || copy.watchlist)}</p><h3 class="market-card-title">${escapeHtml(series.code || "--")}</h3></div><div class="market-card-badges"><span class="market-series-status" data-state="${escapeHtml(series.source_status || "live")}">${escapeHtml(labelBySource(series.source_status, language))}</span><span class="market-trend-pill" data-trend="${escapeHtml(series.market_state || "flat")}">${escapeHtml(labelByTrend(series.market_state, language))}</span></div></div><p class="market-card-name">${escapeHtml(series.label || "--")}</p><div class="market-card-value-row"><p class="market-card-value">${escapeHtml(formatNumber(series.last, precision, suffix))}</p><div class="market-card-change ${escapeHtml(changeClass)}"><span>${escapeHtml(formatSigned(series.change, precision, suffix))}</span><span>${escapeHtml(formatSigned(series.change_pct, 2, "%"))}</span></div></div><div class="market-card-chart">${buildSparkline(series, `${series.code}-${index}`)}</div><div class="market-card-meta"><span>${escapeHtml(copy.range)} ${escapeHtml(formatNumber(series.day_low, precision, suffix))} → ${escapeHtml(formatNumber(series.day_high, precision, suffix))}</span><span>${escapeHtml(copy.previous)} ${escapeHtml(formatNumber(series.previous_close, precision, suffix))}</span><span>${escapeHtml(series.as_of_label || formatTimeLabel(series.as_of, language))}</span></div></article>`;
    })
    .join("");
}

function renderSkeleton(switcherContainer, legendContainer, summaryContainer, breadthBoard, heatBoard, gridContainer, language) {
  const copy = getCopy(language);
  if (switcherContainer) switcherContainer.innerHTML = `<div class="market-view-strip"><div class="market-view-chip is-skeleton"></div><div class="market-view-chip is-skeleton"></div><div class="market-view-chip is-skeleton"></div></div>`;
  if (legendContainer) legendContainer.innerHTML = `<div class="market-mini-legend is-skeleton"></div>`;
  summaryContainer.innerHTML = `<article class="market-summary-card market-summary-card-wide is-skeleton"></article><article class="market-summary-card is-skeleton"></article><article class="market-summary-card is-skeleton"></article><article class="market-summary-card is-skeleton"></article>`;
  breadthBoard.innerHTML = `<div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.breadthKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.breadthTitle)}</h3></div></div><div class="market-breadth-grid"><article class="breadth-card is-skeleton"></article><article class="breadth-card is-skeleton"></article></div>`;
  heatBoard.innerHTML = `<div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.heatKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.heatTitle)}</h3></div></div><div class="market-heat-layers"><section class="heat-layer is-skeleton"></section></div>`;
  gridContainer.innerHTML = Array.from({ length: 5 })
    .map(() => `<article class="market-card is-skeleton"><div class="market-skeleton-line short"></div><div class="market-skeleton-line medium"></div><div class="market-skeleton-line tall"></div><div class="market-skeleton-chart"></div><div class="market-skeleton-line full"></div></article>`)
    .join("");
}

export function createMarketMonitor({ switcherContainer, legendContainer, summaryContainer, breadthBoard, heatBoard, gridContainer, statusLabel, updatedLabel }) {
  if (!summaryContainer || !breadthBoard || !heatBoard || !gridContainer || !statusLabel || !updatedLabel) {
    return { load: async () => null, startAutoRefresh: () => {}, stopAutoRefresh: () => {}, setLanguage: () => {} };
  }

  const panelElement = summaryContainer.closest(".market-monitor-panel");
  let language = "en";
  let currentPayload = null;
  let refreshTimer = null;
  let isLoading = false;
  let activeViewCode = "us";

  function render() {
    const copy = getCopy(language);
    if (!currentPayload) {
      statusLabel.textContent = copy.idle;
      statusLabel.dataset.state = "idle";
      updatedLabel.textContent = copy.summaryPending;
      renderSkeleton(switcherContainer, legendContainer, summaryContainer, breadthBoard, heatBoard, gridContainer, language);
      return;
    }

    const viewData = resolveViewPayload(currentPayload, activeViewCode);
    activeViewCode = viewData.view?.code || currentPayload.views?.default || activeViewCode;
    if (panelElement) panelElement.style.setProperty("--market-view-accent", viewData.view?.accent || "#38bdf8");
    statusLabel.textContent = labelByStatus(currentPayload.status, language);
    statusLabel.dataset.state = currentPayload.status || "idle";
    updatedLabel.textContent = `${copy.updated}: ${formatTimeLabel(currentPayload.generated_at, language)}`;

    renderToolbar(switcherContainer, legendContainer, currentPayload, viewData, language, (nextViewCode) => {
      activeViewCode = nextViewCode || activeViewCode;
      render();
    });
    renderSummary(summaryContainer, viewData, language);
    renderBreadthBoard(breadthBoard, viewData, language);
    renderHeatBoard(heatBoard, viewData, language);
    renderGrid(gridContainer, viewData, language);
  }

  async function load() {
    if (isLoading) return currentPayload;
    isLoading = true;
    if (!currentPayload) render();
    try {
      currentPayload = await fetchMarketPayload();
      if (!currentPayload.views?.items?.some((item) => item.code === activeViewCode)) {
        activeViewCode = currentPayload.views?.default || currentPayload.views?.items?.[0]?.code || "us";
      }
      render();
      return currentPayload;
    } catch (error) {
      console.error(error);
      render();
      return currentPayload;
    } finally {
      isLoading = false;
    }
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === "zh" ? "zh" : "en";
    render();
  }

  function startAutoRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) load();
    }, MARKET_REFRESH_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  render();
  return { load, setLanguage, startAutoRefresh, stopAutoRefresh };
}
