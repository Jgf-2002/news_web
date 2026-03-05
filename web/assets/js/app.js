import { fetchFeedPayload } from "./data-source.js";
import {
  subscribe,
  setData,
  setFilter,
  setSelectedId,
  getState,
  getFilteredItems,
  getSelectedItem,
} from "./state-store.js";
import {
  renderFeedList,
  renderDetail,
  renderMetrics,
  formatGeneratedAt,
} from "./renderers.js";
import { createGlobeRenderer } from "./globe-view.js";

const REFRESH_INTERVAL_MS = 10_000;

const elements = {
  sourceFilter: document.getElementById("source-filter"),
  priorityFilter: document.getElementById("priority-filter"),
  searchInput: document.getElementById("search-input"),
  refreshButton: document.getElementById("refresh-btn"),
  feedList: document.getElementById("feed-list"),
  detailView: document.getElementById("detail-view"),
  mobileDetailView: document.getElementById("mobile-detail-view"),
  metricsGrid: document.getElementById("metrics-grid"),
  feedCount: document.getElementById("feed-count"),
  generatedAt: document.getElementById("generated-at"),
  liveIndicator: document.getElementById("live-indicator"),
  globeCanvas: document.getElementById("globe-canvas"),
  globeSummary: document.getElementById("globe-summary"),
  drawer: document.getElementById("mobile-detail-drawer"),
  drawerCloseButton: document.getElementById("mobile-close-detail"),
  toast: document.getElementById("toast"),
};

const globe = createGlobeRenderer(elements.globeCanvas, elements.globeSummary, {
  onSelect: (item) => {
    if (!item?.id) {
      return;
    }
    selectItem(item.id, {
      openOnMobile: true,
      focusGlobe: false,
    });
    showToast("Signal selected from globe");
  },
});
let toastTimer = null;
let lastRenderedSelectedId = null;
let pendingForceFocusId = null;

function isMobileViewport() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function openDrawer() {
  elements.drawer.classList.add("open");
  elements.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  elements.drawer.classList.remove("open");
  elements.drawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 1800);
}

function selectItem(itemId, options = {}) {
  const {
    openOnMobile = false,
    focusGlobe = false,
  } = options;

  if (focusGlobe) {
    pendingForceFocusId = itemId;
  }

  setSelectedId(itemId);

  if (openOnMobile && isMobileViewport()) {
    openDrawer();
  }
}

function syncView() {
  const state = getState();
  const filteredItems = getFilteredItems();
  const selectedItem = getSelectedItem(filteredItems);

  if (selectedItem && selectedItem.id !== state.selectedId) {
    setSelectedId(selectedItem.id);
    return;
  }

  renderFeedList(elements.feedList, filteredItems, selectedItem?.id || null, (itemId) => {
    selectItem(itemId, {
      openOnMobile: isMobileViewport(),
      focusGlobe: true,
    });
  });
  renderDetail(elements.detailView, selectedItem);
  renderDetail(elements.mobileDetailView, selectedItem);
  renderMetrics(elements.metricsGrid, filteredItems);
  globe.setSignals(filteredItems);

  const selectedId = selectedItem?.id || null;
  const selectedChanged = selectedId !== lastRenderedSelectedId;
  const shouldForceFocus = Boolean(selectedId && pendingForceFocusId === selectedId);
  if (selectedId && (selectedChanged || shouldForceFocus)) {
    const selectedIndex = filteredItems.findIndex((item) => item.id === selectedId);
    globe.focusOnItem(selectedItem, selectedIndex);
  }
  if (shouldForceFocus) {
    pendingForceFocusId = null;
  }
  lastRenderedSelectedId = selectedId;

  elements.feedCount.textContent = `${filteredItems.length} items`;
  elements.generatedAt.textContent = formatGeneratedAt(state.generatedAt);
  elements.liveIndicator.textContent = filteredItems.length > 0 ? "Live" : "Idle";
}

async function loadAndRender({ silent = false } = {}) {
  try {
    const payload = await fetchFeedPayload();
    setData(payload.items, payload.generatedAt);
    if (!silent) {
      showToast(`Loaded ${payload.items.length} signals`);
    }
  } catch (error) {
    console.error(error);
    if (!silent) {
      showToast("Data load failed");
    }
  }
}

function bindEvents() {
  elements.sourceFilter.addEventListener("change", (event) => {
    setFilter("source", event.target.value);
  });

  elements.priorityFilter.addEventListener("change", (event) => {
    setFilter("priority", event.target.value);
  });

  elements.searchInput.addEventListener("input", (event) => {
    setFilter("query", event.target.value || "");
  });

  elements.refreshButton.addEventListener("click", () => {
    loadAndRender();
  });

  elements.drawerCloseButton.addEventListener("click", () => {
    closeDrawer();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobileViewport()) {
      closeDrawer();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      globe.start();
      loadAndRender({ silent: true });
    } else {
      globe.stop();
    }
  });

  window.addEventListener("beforeunload", () => {
    globe.destroy();
  });
}

function init() {
  subscribe(syncView);
  bindEvents();
  globe.start();
  loadAndRender();
  window.setInterval(() => loadAndRender({ silent: true }), REFRESH_INTERVAL_MS);
}

init();
