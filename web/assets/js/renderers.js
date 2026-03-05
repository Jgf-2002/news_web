function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatUtc(value) {
  if (!value) {
    return "Unknown";
  }

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
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
    return "Unknown";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function renderFeedList(container, items, selectedId, onSelect) {
  if (!container) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<p class="detail-empty">No items match current filters.</p>';
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
            <span class="feed-time">${escapeHtml(formatUtc(item.published_at))}</span>
          </div>
          <p class="feed-title">${escapeHtml(item.title)}</p>
          <div class="feed-meta">
            <span>SRC: ${escapeHtml(item.source)}</span>
            <span>SENT: ${escapeHtml(item.sentiment)}</span>
            <span>${escapeHtml(symbols.join(" ") || "NO_SYMBOL")}</span>
          </div>
        </button>
      `;
    })
    .join("");

  container.innerHTML = html;

  container.querySelectorAll(".feed-card").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.getAttribute("data-item-id");
      if (nextId) {
        onSelect(nextId);
      }
    });
  });
}

export function renderDetail(target, item) {
  if (!target) {
    return;
  }

  if (!item) {
    target.innerHTML = '<p class="detail-empty">Select a signal to inspect details.</p>';
    return;
  }

  const symbols = Array.isArray(item.symbols) ? item.symbols : [];
  const symbolsHtml = symbols.map((symbol) => `<span class="detail-tag">${escapeHtml(symbol)}</span>`).join("");

  const urlHtml = item.url
    ? `<a class="detail-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open Source Link</a>`
    : "";

  target.innerHTML = `
    <div class="detail-headline-row">
      <h3 class="detail-title">${escapeHtml(item.title)}</h3>
      <span class="feed-pill" data-priority="${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span>
    </div>
    <div class="detail-tags">
      <span class="detail-tag">Source: ${escapeHtml(item.source)}</span>
      <span class="detail-tag">Sentiment: ${escapeHtml(titleCase(item.sentiment))}</span>
      <span class="detail-tag">Published: ${escapeHtml(formatUtc(item.published_at))}</span>
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

export function renderMetrics(container, items) {
  if (!container) {
    return;
  }

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
      <p class="metric-label">Total Signals</p>
      <p class="metric-value">${escapeHtml(String(items.length))}</p>
    </section>

    <section class="metric-card">
      <p class="metric-label">By Source</p>
      <ul class="metric-list">${renderList(sourceCounts)}</ul>
    </section>

    <section class="metric-card">
      <p class="metric-label">By Priority</p>
      <ul class="metric-list">${renderList(priorityCounts)}</ul>
    </section>

    <section class="metric-card">
      <p class="metric-label">Sentiment</p>
      <ul class="metric-list">${renderList(sentimentCounts)}</ul>
    </section>

    <section class="metric-card">
      <p class="metric-label">Top Symbols</p>
      <ul class="metric-list">${symbolsHtml}</ul>
    </section>
  `;
}

export function formatGeneratedAt(generatedAt) {
  return generatedAt ? `Updated: ${formatUtc(generatedAt)}` : "Data pending";
}
