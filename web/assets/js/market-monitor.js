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
    trendUp: "Bid",
    trendDown: "Offered",
    trendFlat: "Flat",
    regimeRiskOn: "RISK-ON",
    regimeRiskOff: "RISK-OFF",
    regimeBalanced: "BALANCED",
    headlineRiskOn: "Equity beta leads while defensive gauges cool.",
    headlineRiskOff: "Defensive flows dominate and volatility is firm.",
    headlineBalanced: "Cross-asset positioning is mixed into the close.",
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
    trendUp: "偏多",
    trendDown: "偏空",
    trendFlat: "震荡",
    regimeRiskOn: "风险偏好",
    regimeRiskOff: "风险规避",
    regimeBalanced: "多空均衡",
    headlineRiskOn: "权益与高弹性资产偏强，防御指标回落。",
    headlineRiskOff: "防御性资金占优，波动与避险需求抬升。",
    headlineBalanced: "跨资产信号分化，盘面暂处均衡拉锯。",
    unavailable: "市场数据暂时不可用",
    summaryPending: "等待本地市场数据产物。",
  },
};

function getCopy(language) {
  return language === "en" ? COPY.en : COPY.zh;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimeLabel(value, language) {
  if (!value) {
    return language === "en" ? "N/A" : "暂无";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(parsed));
}

function formatNumber(value, precision = 2, suffix = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}${suffix}`;
}

function formatSigned(value, precision = 2, suffix = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatNumber(numeric, precision, suffix)}`;
}

function labelByTrend(trend, language) {
  const copy = getCopy(language);
  if (trend === "up") {
    return copy.trendUp;
  }
  if (trend === "down") {
    return copy.trendDown;
  }
  return copy.trendFlat;
}

function labelBySource(sourceStatus, language) {
  const copy = getCopy(language);
  if (sourceStatus === "cached") {
    return copy.sourceCached;
  }
  if (sourceStatus === "default") {
    return copy.sourceDefault;
  }
  return copy.sourceLive;
}

function labelByStatus(status, language) {
  const copy = getCopy(language);
  if (status === "live") {
    return copy.live;
  }
  if (status === "degraded") {
    return copy.degraded;
  }
  if (status === "stale") {
    return copy.stale;
  }
  if (status === "fallback") {
    return copy.fallback;
  }
  return copy.idle;
}

function formatRegimeLabel(regime, language) {
  const copy = getCopy(language);
  if (regime === "risk-on") {
    return copy.regimeRiskOn;
  }
  if (regime === "risk-off") {
    return copy.regimeRiskOff;
  }
  return copy.regimeBalanced;
}

function formatHeadline(regime, language, fallback) {
  const copy = getCopy(language);
  if (regime === "risk-on") {
    return copy.headlineRiskOn;
  }
  if (regime === "risk-off") {
    return copy.headlineRiskOff;
  }
  if (regime === "balanced") {
    return copy.headlineBalanced;
  }
  return fallback || copy.summaryPending;
}

function buildSparkline(series, cardId) {
  const points = getMarketSeriesValues(series);
  if (points.length < 2) {
    return '<div class="market-sparkline-empty"></div>';
  }

  const width = 248;
  const height = 88;
  const padding = 8;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max), 1);
  const yForValue = (value) => {
    const normalized = (value - min) / span;
    return height - padding - normalized * (height - padding * 2);
  };
  const xForIndex = (index) => {
    if (points.length === 1) {
      return width / 2;
    }
    return padding + (index / (points.length - 1)) * (width - padding * 2);
  };
  const linePoints = points.map((point, index) => `${xForIndex(index).toFixed(2)},${yForValue(point.value).toFixed(2)}`).join(" ");
  const firstX = xForIndex(0).toFixed(2);
  const lastX = xForIndex(points.length - 1).toFixed(2);
  const lastY = yForValue(points[points.length - 1].value).toFixed(2);
  const areaPath = `M ${firstX} ${height - padding} L ${linePoints.split(" ").join(" L ")} L ${lastX} ${height - padding} Z`;
  const gradientId = `spark-${cardId}`;

  return `
    <svg class="market-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(series.code)} intraday curve">
      <defs>
        <linearGradient id="${escapeHtml(gradientId)}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${escapeHtml(series.color || "#5aa9ff")}" stop-opacity="0.38"></stop>
          <stop offset="100%" stop-color="${escapeHtml(series.color || "#5aa9ff")}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" class="market-sparkline-grid"></line>
      <path d="${areaPath}" fill="url(#${escapeHtml(gradientId)})"></path>
      <polyline points="${linePoints}" fill="none" stroke="${escapeHtml(series.color || "#5aa9ff")}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <circle cx="${lastX}" cy="${lastY}" r="3.8" fill="${escapeHtml(series.color || "#5aa9ff")}"></circle>
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
    <article class="market-summary-card market-summary-card-wide">
      <p class="market-summary-label">${escapeHtml(copy.regime)}</p>
      <div class="market-summary-main">
        <span class="market-regime-badge" data-regime="${escapeHtml(summary.regime || "balanced")}">${escapeHtml(formatRegimeLabel(summary.regime, language))}</span>
        <p class="market-summary-headline">${escapeHtml(headline)}</p>
      </div>
    </article>
    <article class="market-summary-card">
      <p class="market-summary-label">${escapeHtml(copy.leaders)}</p>
      <p class="market-summary-value">${escapeHtml(leaders)}</p>
    </article>
    <article class="market-summary-card">
      <p class="market-summary-label">${escapeHtml(copy.laggards)}</p>
      <p class="market-summary-value">${escapeHtml(laggards)}</p>
    </article>
    <article class="market-summary-card">
      <p class="market-summary-label">${escapeHtml(copy.sync)}</p>
      <p class="market-summary-value">${escapeHtml(updatedLabel)}</p>
      <p class="market-summary-meta">${escapeHtml(String(summary.live_count ?? 0))} ${escapeHtml(copy.liveSeries)} · ${escapeHtml(String(summary.stale_count ?? 0))} ${escapeHtml(copy.staleSeries)}</p>
    </article>
  `;
}

function renderGrid(gridContainer, payload, language) {
  const copy = getCopy(language);
  const seriesRows = Array.isArray(payload?.series) ? payload.series : [];

  if (!seriesRows.length) {
    gridContainer.innerHTML = `<article class="market-empty">${escapeHtml(copy.unavailable)}</article>`;
    return;
  }

  gridContainer.innerHTML = seriesRows
    .map((series, index) => {
      const cardId = `${series.code || "series"}-${index}`;
      const precision = Number(series.precision) || 2;
      const suffix = series.suffix || "";
      const changeClass = Number(series.change) > 0 ? "positive" : Number(series.change) < 0 ? "negative" : "neutral";
      const points = getMarketSeriesValues(series);
      const changePct = Number(series.change_pct);
      const ariaLabel = `${series.label || series.code || "market"} ${labelByTrend(series.market_state, language)} ${Number.isFinite(changePct) ? changePct.toFixed(2) : "--"} percent`;

      return `
        <article class="market-card" data-trend="${escapeHtml(series.market_state || "flat")}" aria-label="${escapeHtml(ariaLabel)}">
          <div class="market-card-top">
            <div>
              <p class="market-card-kicker">${escapeHtml(series.group || "")}</p>
              <h3 class="market-card-title">${escapeHtml(series.code || series.label || "--")}</h3>
            </div>
            <div class="market-card-badges">
              <span class="market-series-status" data-state="${escapeHtml(series.source_status || "live")}">${escapeHtml(labelBySource(series.source_status, language))}</span>
              <span class="market-trend-pill" data-trend="${escapeHtml(series.market_state || "flat")}">${escapeHtml(labelByTrend(series.market_state, language))}</span>
            </div>
          </div>
          <p class="market-card-name">${escapeHtml(series.label || "--")}</p>
          <div class="market-card-value-row">
            <p class="market-card-value">${escapeHtml(formatNumber(series.last, precision, suffix))}</p>
            <div class="market-card-change ${escapeHtml(changeClass)}">
              <span>${escapeHtml(formatSigned(series.change, precision, suffix))}</span>
              <span>${escapeHtml(formatSigned(series.change_pct, 2, "%"))}</span>
            </div>
          </div>
          <div class="market-card-chart ${points.length < 2 ? "is-empty" : ""}">
            ${buildSparkline(series, cardId)}
          </div>
          <div class="market-card-meta">
            <span>${escapeHtml(copy.range)} ${escapeHtml(formatNumber(series.day_low, precision, suffix))} — ${escapeHtml(formatNumber(series.day_high, precision, suffix))}</span>
            <span>${escapeHtml(copy.previous)} ${escapeHtml(formatNumber(series.previous_close, precision, suffix))}</span>
            <span>${escapeHtml(series.as_of_label || formatTimeLabel(series.as_of, language))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSkeleton(summaryContainer, gridContainer) {
  summaryContainer.innerHTML = `
    <article class="market-summary-card market-summary-card-wide is-skeleton"></article>
    <article class="market-summary-card is-skeleton"></article>
    <article class="market-summary-card is-skeleton"></article>
    <article class="market-summary-card is-skeleton"></article>
  `;

  gridContainer.innerHTML = Array.from({ length: 6 })
    .map(
      () => `
        <article class="market-card is-skeleton">
          <div class="market-skeleton-line short"></div>
          <div class="market-skeleton-line medium"></div>
          <div class="market-skeleton-line tall"></div>
          <div class="market-skeleton-chart"></div>
          <div class="market-skeleton-line full"></div>
        </article>
      `
    )
    .join("");
}

export function createMarketMonitor({ summaryContainer, gridContainer, statusLabel, updatedLabel }) {
  if (!summaryContainer || !gridContainer || !statusLabel || !updatedLabel) {
    return {
      load: async () => null,
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
      setLanguage: () => {},
    };
  }

  let language = "en";
  let currentPayload = null;
  let refreshTimer = null;
  let isLoading = false;

  function render() {
    const copy = getCopy(language);
    const payload = currentPayload;

    if (!payload) {
      statusLabel.textContent = copy.idle;
      statusLabel.dataset.state = "idle";
      updatedLabel.textContent = copy.summaryPending;
      renderSkeleton(summaryContainer, gridContainer);
      return;
    }

    statusLabel.textContent = labelByStatus(payload.status, language);
    statusLabel.dataset.state = payload.status || "idle";
    updatedLabel.textContent = `${copy.updated}: ${formatTimeLabel(payload.generated_at, language)}`;
    renderSummary(summaryContainer, payload, language);
    renderGrid(gridContainer, payload, language);
  }

  async function load() {
    if (isLoading) {
      return currentPayload;
    }
    isLoading = true;

    if (!currentPayload) {
      render();
    }

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
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) {
        load();
      }
    }, MARKET_REFRESH_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  render();

  return {
    load,
    setLanguage,
    startAutoRefresh,
    stopAutoRefresh,
  };
}
