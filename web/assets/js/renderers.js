function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const UI_COPY = {
  en: {
    unknown: "Unknown",
    noMatch: "No items match current filters.",
    selectHint: "Select a signal to inspect details.",
    source: "Source",
    sentiment: "Sentiment",
    published: "Published",
    openLink: "Open Source Link",
    totalSignals: "Total Signals",
    bySource: "By Source",
    byPriority: "By Priority",
    topSymbols: "Top Symbols",
    updatedPrefix: "Updated",
    dataPending: "Data pending",
    src: "SRC",
    sent: "SENT",
    regionSignals: "signals",
    regionNoData: "No region data available.",
  },
  zh: {
    unknown: "未知",
    noMatch: "当前筛选条件下没有对应新闻。",
    selectHint: "请选择一条新闻查看详情。",
    source: "来源",
    sentiment: "情绪",
    published: "发布时间",
    openLink: "打开原始链接",
    totalSignals: "新闻总数",
    bySource: "来源分布",
    byPriority: "优先级分布",
    topSymbols: "高频关键词",
    updatedPrefix: "更新于",
    dataPending: "等待数据",
    src: "来源",
    sent: "情绪",
    regionSignals: "条新闻",
    regionNoData: "当前区域暂无可显示新闻。",
  },
};

function getCopy(language) {
  return language === "en" ? UI_COPY.en : UI_COPY.zh;
}

function formatUtc(value, language = "en") {
  const copy = getCopy(language);
  if (!value) {
    return copy.unknown;
  }

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return copy.unknown;
  }

  const locale = language === "en" ? "en-US" : "zh-HK";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(dt) + " UTC";
}

function titleCase(value) {
  const text = String(value || "").toLowerCase();
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function renderFeedList(container, items, selectedId, onSelect, language = "zh") {
  if (!container) {
    return;
  }

  const copy = getCopy(language);

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<p class="detail-empty">${escapeHtml(copy.noMatch)}</p>`;
    return;
  }

  const html = items
    .map((item) => {
      const selected = item.id === selectedId;
      const symbols = Array.isArray(item.symbols) ? item.symbols.slice(0, 3) : [];

      return `
        <button
          class="feed-card"
          type="button"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-item-id="${escapeHtml(item.id)}"
          data-priority="${escapeHtml(item.priority)}"
          data-selected="${selected ? "true" : "false"}"
        >
          <div class="feed-card-row">
            <span class="feed-pill" data-priority="${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span>
            <span class="feed-time">${escapeHtml(formatUtc(item.published_at, language))}</span>
          </div>
          <p class="feed-title">${escapeHtml(item.title)}</p>
          <div class="feed-meta">
            <span>${escapeHtml(copy.src)}: ${escapeHtml(item.source)}</span>
            <span>${escapeHtml(copy.sent)}: ${escapeHtml(item.sentiment)}</span>
            <span>${escapeHtml(symbols.join(" ") || "NO_SYMBOL")}</span>
          </div>
        </button>
      `;
    })
    .join("");

  container.innerHTML = html;

  container.querySelectorAll(".feed-card").forEach((button, index) => {
    button.addEventListener("click", () => {
      const nextId = button.getAttribute("data-item-id");
      if (nextId) {
        onSelect(nextId, items[index] || null, index);
      }
    });
  });
}

export function renderDetail(target, item, language = "zh") {
  if (!target) {
    return;
  }

  const copy = getCopy(language);

  if (!item) {
    target.innerHTML = `<p class="detail-empty">${escapeHtml(copy.selectHint)}</p>`;
    return;
  }

  const symbols = Array.isArray(item.symbols) ? item.symbols : [];
  const symbolsHtml = symbols.map((symbol) => `<span class="detail-tag">${escapeHtml(symbol)}</span>`).join("");
  const sentimentValue = language === "en" ? titleCase(item.sentiment) : item.sentiment;

  const urlHtml = item.url
    ? `<a class="detail-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.openLink)}</a>`
    : "";

  target.innerHTML = `
    <div class="detail-headline-row">
      <h3 class="detail-title">${escapeHtml(item.title)}</h3>
      <span class="feed-pill" data-priority="${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span>
    </div>
    <div class="detail-tags">
      <span class="detail-tag">${escapeHtml(copy.source)}: ${escapeHtml(item.source)}</span>
      <span class="detail-tag">${escapeHtml(copy.sentiment)}: ${escapeHtml(sentimentValue || "")}</span>
      <span class="detail-tag">${escapeHtml(copy.published)}: ${escapeHtml(formatUtc(item.published_at, language))}</span>
      ${symbolsHtml}
    </div>
    <p class="detail-content">${escapeHtml(item.content)}</p>
    ${urlHtml}
  `;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function topSymbols(items) {
  const counts = new Map();
  items.forEach((item) => {
    (item.symbols || []).forEach((symbol) => {
      counts.set(symbol, (counts.get(symbol) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function renderList(dict) {
  const entries = Object.entries(dict || {});
  if (entries.length === 0) {
    return "<li><span>N/A</span><span>0</span></li>";
  }
  return entries
    .map(([key, value]) => `<li><span>${escapeHtml(key)}</span><span>${escapeHtml(String(value))}</span></li>`)
    .join("");
}

export function renderMetrics(container, items, language = "zh") {
  if (!container) {
    return;
  }

  const copy = getCopy(language);
  const sourceCounts = countBy(items, "source");
  const priorityCounts = countBy(items, "priority");
  const sentimentCounts = countBy(items, "sentiment");
  const symbolRows = topSymbols(items);

  const symbolsHtml = symbolRows.length
    ? symbolRows
        .map(([symbol, count]) => `<li><span>${escapeHtml(symbol)}</span><span>${escapeHtml(String(count))}</span></li>`)
        .join("")
    : "<li><span>N/A</span><span>0</span></li>";

  container.innerHTML = `
    <section class="metric-card">
      <p class="metric-label">${escapeHtml(copy.totalSignals)}</p>
      <p class="metric-value">${escapeHtml(String(items.length))}</p>
    </section>

    <section class="metric-card">
      <p class="metric-label">${escapeHtml(copy.bySource)}</p>
      <ul class="metric-list">${renderList(sourceCounts)}</ul>
    </section>

    <section class="metric-card">
      <p class="metric-label">${escapeHtml(copy.byPriority)}</p>
      <ul class="metric-list">${renderList(priorityCounts)}</ul>
    </section>

    <section class="metric-card">
      <p class="metric-label">${escapeHtml(copy.sentiment)}</p>
      <ul class="metric-list">${renderList(sentimentCounts)}</ul>
    </section>

    <section class="metric-card">
      <p class="metric-label">${escapeHtml(copy.topSymbols)}</p>
      <ul class="metric-list">${symbolsHtml}</ul>
    </section>
  `;
}

export function renderRegionPopover(container, regionData, language = "zh") {
  if (!container) {
    return;
  }

  const copy = getCopy(language);
  if (!regionData) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const items = Array.isArray(regionData.items) ? regionData.items.slice(0, 6) : [];
  const itemHtml = items.length
    ? items
        .map((item) => `
          <li>
            <p class="region-item-title">${escapeHtml(item.title || copy.unknown)}</p>
            <p class="region-item-meta">${escapeHtml(item.source || "N/A")} | ${escapeHtml(formatUtc(item.published_at, language))}</p>
          </li>
        `)
        .join("")
    : `<li><p class="region-item-title">${escapeHtml(copy.regionNoData)}</p></li>`;

  container.hidden = false;
  container.innerHTML = `
    <div class="region-head">
      <p class="region-title">${escapeHtml(regionData.label || copy.unknown)}</p>
      <span class="region-meta">${escapeHtml(String(regionData.count || 0))} ${escapeHtml(copy.regionSignals)}</span>
    </div>
    <p class="region-nickname">${escapeHtml(regionData.nickname || "")}</p>
    <ul class="region-items">${itemHtml}</ul>
  `;
}

export function formatGeneratedAt(generatedAt, language = "zh") {
  const copy = getCopy(language);
  return generatedAt ? `${copy.updatedPrefix}: ${formatUtc(generatedAt, language)}` : copy.dataPending;
}
