import { fetchMarketPayload, getMarketSeriesValues, MARKET_REFRESH_INTERVAL_MS } from "./market-data-source.js";

const COPY = {
  en: {
    regime: "Regime",
    leaders: "Leaders",
    laggards: "Laggards",
    sync: "Sync",
    updated: "Updated",
    range: "Range",
    previous: "Prev Close",
    live: "Live",
    degraded: "Partial Fallback",
    stale: "Cached Snapshot",
    fallback: "Default Snapshot",
    idle: "Sync Pending",
    liveSeries: "live feeds",
    staleSeries: "fallback feeds",
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
    headlineRiskOff: "Breadth narrows and defensive layers are gaining temperature.",
    headlineBalanced: "Cross-asset trend is mixed and breadth is rotating.",
    breadthKicker: "Market Breadth",
    breadthTitle: "Participation curves",
    breadthLegend: "Breadth % vs benchmark intraday return",
    heatKicker: "Heat Layers",
    heatTitle: "Rotation stack",
    heatLegend: "Hot = strong participation · Cold = distribution",
    tapeEmpty: "Cross-asset tape temporarily unavailable",
    advancers: "Adv",
    decliners: "Dec",
    unchanged: "Flat",
    benchmark: "Bench",
    session: "Session",
    heatHot: "Hot",
    heatCold: "Cold",
    heatNeutral: "Neutral",
    unavailable: "Market data temporarily unavailable",
    summaryPending: "Waiting for local market payload.",
  },
  zh: {
    regime: "市场状态",
    leaders: "领涨",
    laggards: "承压",
    sync: "同步",
    updated: "更新",
    range: "区间",
    previous: "昨收",
    live: "实时",
    degraded: "部分回退",
    stale: "缓存快照",
    fallback: "默认样本",
    idle: "等待同步",
    liveSeries: "实时源",
    staleSeries: "回退源",
    sourceLive: "实时",
    sourceCached: "缓存",
    sourceDefault: "样本",
    sourcePartial: "部分",
    trendUp: "偏多",
    trendDown: "偏空",
    trendFlat: "震荡",
    regimeRiskOn: "风险偏好",
    regimeRiskOff: "风险规避",
    regimeBalanced: "多空均衡",
    headlineRiskOn: "参与度扩散，防御指标回落。",
    headlineRiskOff: "宽度收窄，防御热度抬升。",
    headlineBalanced: "跨资产分化，宽度轮动仍在继续。",
    breadthKicker: "市场宽度",
    breadthTitle: "参与度曲线",
    breadthLegend: "宽度百分比 vs 基准分时涨跌",
    heatKicker: "热力分层",
    heatTitle: "轮动热区",
    heatLegend: "热 = 资金拥挤 · 冷 = 分布走弱",
    tapeEmpty: "跨资产带暂时不可用",
    advancers: "上涨",
    decliners: "下跌",
    unchanged: "平盘",
    benchmark: "基准",
    session: "会话",
    heatHot: "偏热",
    heatCold: "偏冷",
    heatNeutral: "中性",
    unavailable: "市场数据暂时不可用",
    summaryPending: "等待本地市场数据产物。",
  },
};

const getCopy = (language) => (language === "en" ? COPY.en : COPY.zh);
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function formatTimeLabel(value, language) {
  if (!value) return language === "en" ? "N/A" : "暂无";
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
  const copy = getCopy(language);
  if (regime === "risk-on") return copy.headlineRiskOn;
  if (regime === "risk-off") return copy.headlineRiskOff;
  if (regime === "balanced") return copy.headlineBalanced;
  return fallback || copy.summaryPending;
}

function buildSparkline(series, cardId) {
  const points = getMarketSeriesValues(series);
  if (points.length < 2) return '<div class="market-sparkline-empty"></div>';
  const width = 248;
  const height = 88;
  const padding = 8;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max), 1);
  const yFor = (value) => height - padding - ((value - min) / span) * (height - padding * 2);
  const xFor = (index) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const line = points.map((point, index) => `${xFor(index).toFixed(2)},${yFor(point.value).toFixed(2)}`).join(" ");
  const gradientId = `spark-${cardId}`;
  const lastX = xFor(points.length - 1).toFixed(2);
  const lastY = yFor(points[points.length - 1].value).toFixed(2);
  const areaPath = `M ${padding} ${height - padding} L ${line.split(" ").join(" L ")} L ${lastX} ${height - padding} Z`;
  return `
    <svg class="market-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(series.code)} intraday curve">
      <defs><linearGradient id="${escapeHtml(gradientId)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${escapeHtml(series.color || "#5aa9ff")}" stop-opacity="0.38"></stop><stop offset="100%" stop-color="${escapeHtml(series.color || "#5aa9ff")}" stop-opacity="0"></stop></linearGradient></defs>
      <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" class="market-sparkline-grid"></line>
      <path d="${areaPath}" fill="url(#${escapeHtml(gradientId)})"></path>
      <polyline points="${line}" fill="none" stroke="${escapeHtml(series.color || "#5aa9ff")}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <circle cx="${lastX}" cy="${lastY}" r="3.8" fill="${escapeHtml(series.color || "#5aa9ff")}"></circle>
    </svg>
  `;
}

function buildBreadthChart(group, index) {
  const points = Array.isArray(group?.points) ? group.points : [];
  if (points.length < 2) return '<div class="breadth-chart-empty"></div>';
  const featured = Boolean(group.featured);
  const width = featured ? 560 : 360;
  const height = featured ? 182 : 156;
  const padding = { top: 14, right: 12, bottom: 18, left: 12 };
  const breadthY = (value) => height - padding.bottom - (value / 100) * (height - padding.top - padding.bottom);
  const breadthX = (i) => padding.left + (i / Math.max(points.length - 1, 1)) * (width - padding.left - padding.right);
  const benchValues = points.map((point) => Number(point[2]) || 0);
  const benchMin = Math.min(...benchValues, -1);
  const benchMax = Math.max(...benchValues, 1);
  const benchSpan = benchMax - benchMin || 1;
  const benchY = (value) => height - padding.bottom - ((value - benchMin) / benchSpan) * (height - padding.top - padding.bottom);
  const breadthLine = points.map((point, i) => `${breadthX(i).toFixed(2)},${breadthY(Number(point[1]) || 0).toFixed(2)}`).join(" ");
  const benchLine = points.map((point, i) => `${breadthX(i).toFixed(2)},${benchY(Number(point[2]) || 0).toFixed(2)}`).join(" ");
  const areaPath = `M ${padding.left} ${height - padding.bottom} L ${breadthLine.split(" ").join(" L ")} L ${width - padding.right} ${height - padding.bottom} Z`;
  const gridYs = [20, 50, 80].map((value) => breadthY(value).toFixed(2));
  const id = `breadth-${index}`;
  const lastX = breadthX(points.length - 1).toFixed(2);
  const lastY = breadthY(Number(points[points.length - 1][1]) || 0).toFixed(2);
  return `
    <svg class="breadth-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(group.label)} breadth curve">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${escapeHtml(group.color || "#22c55e")}" stop-opacity="0.32"></stop><stop offset="100%" stop-color="${escapeHtml(group.color || "#22c55e")}" stop-opacity="0"></stop></linearGradient></defs>
      ${gridYs.map((y) => `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="breadth-grid-line"></line>`).join("")}
      <path d="${areaPath}" fill="url(#${id})"></path>
      <polyline points="${benchLine}" class="breadth-benchmark-line"></polyline>
      <polyline points="${breadthLine}" class="breadth-primary-line" style="stroke:${escapeHtml(group.color || "#22c55e")}"></polyline>
      <circle cx="${lastX}" cy="${lastY}" r="3.8" fill="${escapeHtml(group.color || "#22c55e")}"></circle>
    </svg>
  `;
}

function renderSummary(summaryContainer, payload, language) {
  const copy = getCopy(language);
  const summary = payload?.summary || {};
  const leaders = Array.isArray(summary.leaders) && summary.leaders.length ? summary.leaders.join(" · ") : "--";
  const laggards = Array.isArray(summary.laggards) && summary.laggards.length ? summary.laggards.join(" · ") : "--";
  const headline = formatHeadline(summary.regime, language, summary.headline);
  const updatedLabel = formatTimeLabel(payload?.generated_at || summary.generated_at, language);
  summaryContainer.innerHTML = `
    <article class="market-summary-card market-summary-card-wide"><p class="market-summary-label">${escapeHtml(copy.regime)}</p><div class="market-summary-main"><span class="market-regime-badge" data-regime="${escapeHtml(summary.regime || "balanced")}">${escapeHtml(formatRegimeLabel(summary.regime, language))}</span><p class="market-summary-headline">${escapeHtml(headline)}</p></div></article>
    <article class="market-summary-card"><p class="market-summary-label">${escapeHtml(copy.leaders)}</p><p class="market-summary-value">${escapeHtml(leaders)}</p></article>
    <article class="market-summary-card"><p class="market-summary-label">${escapeHtml(copy.laggards)}</p><p class="market-summary-value">${escapeHtml(laggards)}</p></article>
    <article class="market-summary-card"><p class="market-summary-label">${escapeHtml(copy.sync)}</p><p class="market-summary-value">${escapeHtml(updatedLabel)}</p><p class="market-summary-meta">${escapeHtml(String(summary.live_count ?? 0))} ${escapeHtml(copy.liveSeries)} · ${escapeHtml(String(summary.stale_count ?? 0))} ${escapeHtml(copy.staleSeries)}</p></article>
  `;
}

function renderBreadthBoard(container, payload, language) {
  const copy = getCopy(language);
  const groups = payload?.breadth?.groups || [];
  container.innerHTML = `
    <div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.breadthKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.breadthTitle)}</h3></div><p class="market-board-legend">${escapeHtml(copy.breadthLegend)}</p></div>
    <div class="market-breadth-grid">
      ${groups
        .map((group, index) => `
          <article class="breadth-card ${group.featured ? "is-featured" : ""}" data-state="${escapeHtml(group.heat_state || "neutral")}">
            <div class="breadth-card-head"><div><p class="breadth-card-kicker">${escapeHtml(group.benchmark_label || "")}</p><h4 class="breadth-card-title">${escapeHtml(group.label || "--")}</h4></div><span class="market-series-status" data-state="${escapeHtml(group.source_status || "live")}">${escapeHtml(labelBySource(group.source_status, language))}</span></div>
            <div class="breadth-metrics"><div><p class="breadth-metric-label">${escapeHtml(copy.benchmark)}</p><p class="breadth-metric-value">${escapeHtml(formatSigned(group.benchmark_change_pct, 2, "%"))}</p></div><div><p class="breadth-metric-label">${escapeHtml(copy.session)}</p><p class="breadth-metric-value breadth-metric-value-large">${escapeHtml(formatNumber(group.latest_pct, 1, "%"))}</p></div><div><p class="breadth-metric-label">${escapeHtml(copy.advancers)} / ${escapeHtml(copy.decliners)}</p><p class="breadth-metric-value">${escapeHtml(String(group.advancers || 0))} / ${escapeHtml(String(group.decliners || 0))}</p></div></div>
            <div class="breadth-chart-wrap">${buildBreadthChart(group, index)}</div>
            <div class="breadth-footer"><span>${escapeHtml(copy.unchanged)} ${escapeHtml(String(group.unchanged || 0))}</span><span>${escapeHtml(group.live_members || 0)}/${escapeHtml(group.members_total || 0)} LIVE</span><span>${escapeHtml(formatSigned(group.session_delta_pct, 1, "%"))}</span></div>
          </article>
        `)
        .join("")}
    </div>
  `;
}

function tileIntensity(changePct) {
  return Math.min(1, Math.abs(Number(changePct) || 0) / 3);
}

function renderHeatBoard(container, payload, language) {
  const copy = getCopy(language);
  const layers = payload?.heat_layers?.layers || [];
  container.innerHTML = `
    <div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.heatKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.heatTitle)}</h3></div><p class="market-board-legend">${escapeHtml(copy.heatLegend)}</p></div>
    <div class="market-heat-layers">
      ${layers
        .map((layer) => `
          <section class="heat-layer">
            <div class="heat-layer-head"><div><h4 class="heat-layer-title">${escapeHtml(layer.label || "--")}</h4><p class="heat-layer-desc">${escapeHtml(layer.description || "")}</p></div><span class="market-series-status" data-state="${escapeHtml(layer.source_status || "live")}">${escapeHtml(labelBySource(layer.source_status, language))}</span></div>
            <div class="heat-layer-grid">
              ${(Array.isArray(layer.tiles) ? layer.tiles : [])
                .map((tile) => `<article class="heat-tile heat-tile-${escapeHtml(tile.size || "sm")}" data-state="${escapeHtml(tile.state || "neutral")}" style="--tile-intensity:${tileIntensity(tile.change_pct).toFixed(2)}"><p class="heat-tile-symbol">${escapeHtml(tile.code || tile.symbol || "--")}</p><p class="heat-tile-name">${escapeHtml(tile.label || "--")}</p><p class="heat-tile-value">${escapeHtml(formatSigned(tile.change_pct, 2, "%"))}</p></article>`)
                .join("")}
            </div>
          </section>
        `)
        .join("")}
    </div>
  `;
}

function renderGrid(gridContainer, payload, language) {
  const copy = getCopy(language);
  const seriesRows = Array.isArray(payload?.series) ? payload.series : [];
  if (!seriesRows.length) {
    gridContainer.innerHTML = `<article class="market-empty">${escapeHtml(copy.tapeEmpty)}</article>`;
    return;
  }
  gridContainer.innerHTML = seriesRows
    .map((series, index) => {
      const precision = Number(series.precision) || 2;
      const suffix = series.suffix || "";
      const change = Number(series.change);
      const changeClass = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
      return `
        <article class="market-card" data-trend="${escapeHtml(series.market_state || "flat")}">
          <div class="market-card-top"><div><p class="market-card-kicker">${escapeHtml(series.group || "")}</p><h3 class="market-card-title">${escapeHtml(series.code || "--")}</h3></div><div class="market-card-badges"><span class="market-series-status" data-state="${escapeHtml(series.source_status || "live")}">${escapeHtml(labelBySource(series.source_status, language))}</span><span class="market-trend-pill" data-trend="${escapeHtml(series.market_state || "flat")}">${escapeHtml(labelByTrend(series.market_state, language))}</span></div></div>
          <p class="market-card-name">${escapeHtml(series.label || "--")}</p>
          <div class="market-card-value-row"><p class="market-card-value">${escapeHtml(formatNumber(series.last, precision, suffix))}</p><div class="market-card-change ${escapeHtml(changeClass)}"><span>${escapeHtml(formatSigned(series.change, precision, suffix))}</span><span>${escapeHtml(formatSigned(series.change_pct, 2, "%"))}</span></div></div>
          <div class="market-card-chart">${buildSparkline(series, `${series.code}-${index}`)}</div>
          <div class="market-card-meta"><span>${escapeHtml(copy.range)} ${escapeHtml(formatNumber(series.day_low, precision, suffix))} — ${escapeHtml(formatNumber(series.day_high, precision, suffix))}</span><span>${escapeHtml(copy.previous)} ${escapeHtml(formatNumber(series.previous_close, precision, suffix))}</span><span>${escapeHtml(series.as_of_label || formatTimeLabel(series.as_of, language))}</span></div>
        </article>
      `;
    })
    .join("");
}

function renderSkeleton(summaryContainer, breadthBoard, heatBoard, gridContainer, language) {
  const copy = getCopy(language);
  summaryContainer.innerHTML = `<article class="market-summary-card market-summary-card-wide is-skeleton"></article><article class="market-summary-card is-skeleton"></article><article class="market-summary-card is-skeleton"></article><article class="market-summary-card is-skeleton"></article>`;
  breadthBoard.innerHTML = `<div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.breadthKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.breadthTitle)}</h3></div></div><div class="market-breadth-grid"><article class="breadth-card is-skeleton"></article><article class="breadth-card is-skeleton"></article><article class="breadth-card is-skeleton"></article></div>`;
  heatBoard.innerHTML = `<div class="market-board-head"><div><p class="market-board-kicker">${escapeHtml(copy.heatKicker)}</p><h3 class="market-board-title">${escapeHtml(copy.heatTitle)}</h3></div></div><div class="market-heat-layers"><section class="heat-layer is-skeleton"></section><section class="heat-layer is-skeleton"></section></div>`;
  gridContainer.innerHTML = Array.from({ length: 6 }).map(() => `<article class="market-card is-skeleton"><div class="market-skeleton-line short"></div><div class="market-skeleton-line medium"></div><div class="market-skeleton-line tall"></div><div class="market-skeleton-chart"></div><div class="market-skeleton-line full"></div></article>`).join("");
}

export function createMarketMonitor({ summaryContainer, breadthBoard, heatBoard, gridContainer, statusLabel, updatedLabel }) {
  if (!summaryContainer || !breadthBoard || !heatBoard || !gridContainer || !statusLabel || !updatedLabel) {
    return { load: async () => null, startAutoRefresh: () => {}, stopAutoRefresh: () => {}, setLanguage: () => {} };
  }
  let language = "en";
  let currentPayload = null;
  let refreshTimer = null;
  let isLoading = false;

  function render() {
    const copy = getCopy(language);
    if (!currentPayload) {
      statusLabel.textContent = copy.idle;
      statusLabel.dataset.state = "idle";
      updatedLabel.textContent = copy.summaryPending;
      renderSkeleton(summaryContainer, breadthBoard, heatBoard, gridContainer, language);
      return;
    }
    statusLabel.textContent = labelByStatus(currentPayload.status, language);
    statusLabel.dataset.state = currentPayload.status || "idle";
    updatedLabel.textContent = `${copy.updated}: ${formatTimeLabel(currentPayload.generated_at, language)}`;
    renderSummary(summaryContainer, currentPayload, language);
    renderBreadthBoard(breadthBoard, currentPayload, language);
    renderHeatBoard(heatBoard, currentPayload, language);
    renderGrid(gridContainer, currentPayload, language);
  }

  async function load() {
    if (isLoading) return currentPayload;
    isLoading = true;
    if (!currentPayload) render();
    try {
      currentPayload = await fetchMarketPayload();
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
