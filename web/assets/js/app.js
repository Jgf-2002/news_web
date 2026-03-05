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
  renderRegionPopover,
  formatGeneratedAt,
} from "./renderers.js";
import {
  createGlobeRenderer,
  getHubDisplayInfo,
  inferPrimaryHub,
} from "./globe-view.js";

const REFRESH_INTERVAL_MS = 10_000;
const LEAD_MODAL_DELAY_MS = 28_000;
const LEAD_MODAL_COOLDOWN_MS = 20 * 60 * 1000;
const LEAD_MODAL_STORAGE_KEY = "news_web_lead_modal_last_seen";

const UI_TEXT = {
  en: {
    source: "Source",
    priority: "Priority",
    language: "Language",
    search: "Search",
    searchPlaceholder: "keyword, symbol",
    refresh: "Refresh",
    contact: "Contact",
    feedCount: (n) => `${n} items`,
    live: "Live",
    idle: "Idle",
    loadedSignals: (n) => `Loaded ${n} signals`,
    loadFailed: "Data load failed",
    selectedFromGlobe: "Signal selected from globe",
    focusedRegion: "Focused on selected region",
    leadTitle: "Need deeper market context?",
    leadText: "Open ParisTrader Terminal for full workflow, deeper analytics and faster decision support.",
    leadOpen: "Open Terminal",
    leadLater: "Later",
  },
  zh: {
    source: "来源",
    priority: "优先级",
    language: "语言",
    search: "搜索",
    searchPlaceholder: "关键词、代码",
    refresh: "刷新",
    contact: "联系我",
    feedCount: (n) => `${n} 条`,
    live: "实时",
    idle: "空闲",
    loadedSignals: (n) => `已加载 ${n} 条新闻`,
    loadFailed: "数据加载失败",
    selectedFromGlobe: "已从地球视图选中新闻",
    focusedRegion: "已定位到对应区域",
    leadTitle: "需要更深层的市场上下文？",
    leadText: "打开 ParisTrader Terminal，获取更完整流程、更深分析与更快决策支持。",
    leadOpen: "打开终端",
    leadLater: "稍后",
  },
};

const elements = {
  sourceFilter: document.getElementById("source-filter"),
  priorityFilter: document.getElementById("priority-filter"),
  languageFilter: document.getElementById("language-filter"),
  searchInput: document.getElementById("search-input"),
  refreshButton: document.getElementById("refresh-btn"),
  contactButton: document.getElementById("contact-btn"),
  feedList: document.getElementById("feed-list"),
  detailView: document.getElementById("detail-view"),
  mobileDetailView: document.getElementById("mobile-detail-view"),
  metricsGrid: document.getElementById("metrics-grid"),
  feedCount: document.getElementById("feed-count"),
  generatedAt: document.getElementById("generated-at"),
  liveIndicator: document.getElementById("live-indicator"),
  globeCanvas: document.getElementById("globe-canvas"),
  globeSummary: document.getElementById("globe-summary"),
  regionPopover: document.getElementById("region-popover"),
  drawer: document.getElementById("mobile-detail-drawer"),
  drawerCloseButton: document.getElementById("mobile-close-detail"),
  toast: document.getElementById("toast"),
  labelSource: document.getElementById("label-source"),
  labelPriority: document.getElementById("label-priority"),
  labelLanguage: document.getElementById("label-language"),
  labelSearch: document.getElementById("label-search"),
  leadModal: document.getElementById("lead-modal"),
  leadModalBackdrop: document.getElementById("lead-modal-backdrop"),
  leadModalClose: document.getElementById("lead-modal-close"),
  leadModalCloseX: document.getElementById("lead-modal-close-x"),
  leadModalTitle: document.getElementById("lead-modal-title"),
  leadModalText: document.getElementById("lead-modal-text"),
  leadModalOpen: document.getElementById("lead-modal-open"),
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
    showToast(getText("selectedFromGlobe"));
  },
});

let toastTimer = null;
let leadModalTimer = null;
let lastRenderedSelectedId = null;
let pendingForceFocusId = null;

function getLanguage() {
  return getState().filters.language === "en" ? "en" : "zh";
}

function getText(key, ...args) {
  const language = getLanguage();
  const dictionary = UI_TEXT[language];
  const value = dictionary[key];
  return typeof value === "function" ? value(...args) : value;
}

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

function readLeadModalLastSeen() {
  try {
    return Number(window.localStorage.getItem(LEAD_MODAL_STORAGE_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function markLeadModalSeen() {
  try {
    window.localStorage.setItem(LEAD_MODAL_STORAGE_KEY, String(Date.now()));
  } catch (error) {
    // Ignore storage failures.
  }
}

function shouldAutoShowLeadModal() {
  const lastSeen = readLeadModalLastSeen();
  return Date.now() - lastSeen >= LEAD_MODAL_COOLDOWN_MS;
}

function openLeadModal() {
  if (!elements.leadModal) {
    return;
  }
  elements.leadModal.classList.add("open");
  elements.leadModal.setAttribute("aria-hidden", "false");
}

function closeLeadModal({ remember = true } = {}) {
  if (!elements.leadModal) {
    return;
  }
  elements.leadModal.classList.remove("open");
  elements.leadModal.setAttribute("aria-hidden", "true");
  if (remember) {
    markLeadModalSeen();
  }
}

function scheduleLeadModal() {
  if (leadModalTimer) {
    window.clearTimeout(leadModalTimer);
    leadModalTimer = null;
  }

  if (document.hidden || !shouldAutoShowLeadModal()) {
    return;
  }

  leadModalTimer = window.setTimeout(() => {
    openLeadModal();
  }, LEAD_MODAL_DELAY_MS);
}

function setOptionText(select, value, label) {
  const option = select?.querySelector(`option[value="${value}"]`);
  if (option) {
    option.textContent = label;
  }
}

function applyLanguageUi(language) {
  const dictionary = language === "en" ? UI_TEXT.en : UI_TEXT.zh;

  if (elements.labelSource) {
    elements.labelSource.textContent = dictionary.source;
  }
  if (elements.labelPriority) {
    elements.labelPriority.textContent = dictionary.priority;
  }
  if (elements.labelLanguage) {
    elements.labelLanguage.textContent = dictionary.language;
  }
  if (elements.labelSearch) {
    elements.labelSearch.textContent = dictionary.search;
  }

  setOptionText(elements.sourceFilter, "all", language === "en" ? "All" : "全部");
  setOptionText(elements.priorityFilter, "all", language === "en" ? "All" : "全部");
  setOptionText(elements.priorityFilter, "critical", language === "en" ? "Critical" : "紧急");
  setOptionText(elements.priorityFilter, "warning", language === "en" ? "Warning" : "警告");
  setOptionText(elements.priorityFilter, "info", language === "en" ? "Info" : "信息");

  if (elements.searchInput) {
    elements.searchInput.placeholder = dictionary.searchPlaceholder;
  }
  if (elements.refreshButton) {
    elements.refreshButton.textContent = dictionary.refresh;
  }
  if (elements.contactButton) {
    elements.contactButton.textContent = dictionary.contact;
  }
  if (elements.leadModalTitle) {
    elements.leadModalTitle.textContent = dictionary.leadTitle;
  }
  if (elements.leadModalText) {
    elements.leadModalText.textContent = dictionary.leadText;
  }
  if (elements.leadModalOpen) {
    elements.leadModalOpen.textContent = dictionary.leadOpen;
  }
  if (elements.leadModalClose) {
    elements.leadModalClose.textContent = dictionary.leadLater;
  }

  if (elements.languageFilter && elements.languageFilter.value !== language) {
    elements.languageFilter.value = language;
  }
}

function selectItem(itemId, options = {}) {
  const { openOnMobile = false, focusGlobe = false } = options;

  if (focusGlobe) {
    pendingForceFocusId = itemId;
  }

  setSelectedId(itemId);

  if (openOnMobile && isMobileViewport()) {
    openDrawer();
  }
}

function buildRegionViewData(selectedItem, filteredItems, language) {
  if (!selectedItem) {
    return null;
  }

  const selectedIndex = Math.max(0, filteredItems.findIndex((item) => item.id === selectedItem.id));
  const regionBundle = globe.getRegionBundleForItem(selectedItem, selectedIndex);
  const inferredHub = regionBundle?.hub || inferPrimaryHub(selectedItem, selectedIndex);
  if (!inferredHub) {
    return null;
  }

  const hubName = inferredHub.name;
  const fallbackItems = filteredItems.filter((item, index) => inferPrimaryHub(item, index)?.name === hubName);
  const regionItems = Array.isArray(regionBundle?.items) && regionBundle.items.length
    ? regionBundle.items
    : fallbackItems;

  const display = getHubDisplayInfo(hubName, language);

  return {
    hubName,
    label: display.label,
    nickname: display.nickname,
    count: regionItems.length,
    items: regionItems,
  };
}

function syncView() {
  const state = getState();
  const language = state.filters.language === "en" ? "en" : "zh";
  applyLanguageUi(language);

  const filteredItems = getFilteredItems();
  const selectedItem = getSelectedItem(filteredItems);

  if (selectedItem && selectedItem.id !== state.selectedId) {
    setSelectedId(selectedItem.id);
    return;
  }

  renderFeedList(
    elements.feedList,
    filteredItems,
    selectedItem?.id || null,
    (itemId) => {
      selectItem(itemId, {
        openOnMobile: isMobileViewport(),
        focusGlobe: true,
      });
    },
    language,
  );
  renderDetail(elements.detailView, selectedItem, language);
  renderDetail(elements.mobileDetailView, selectedItem, language);
  renderMetrics(elements.metricsGrid, filteredItems, language);
  globe.setSignals(filteredItems);

  const selectedId = selectedItem?.id || null;
  globe.setSelectedItemId(selectedId);

  let regionViewData = null;
  if (selectedItem) {
    regionViewData = buildRegionViewData(selectedItem, filteredItems, language);
    globe.setHighlightedRegion(regionViewData?.hubName || null);
  } else {
    globe.setHighlightedRegion(null);
  }

  renderRegionPopover(elements.regionPopover, regionViewData, language);

  const selectedChanged = selectedId !== lastRenderedSelectedId;
  const shouldForceFocus = Boolean(selectedId && pendingForceFocusId === selectedId);
  if (selectedId && (selectedChanged || shouldForceFocus)) {
    const selectedIndex = filteredItems.findIndex((item) => item.id === selectedId);
    globe.focusOnItem(selectedItem, selectedIndex);
    if (shouldForceFocus) {
      showToast(getText("focusedRegion"));
    }
  }
  if (shouldForceFocus) {
    pendingForceFocusId = null;
  }
  lastRenderedSelectedId = selectedId;

  elements.feedCount.textContent = getText("feedCount", filteredItems.length);
  elements.generatedAt.textContent = formatGeneratedAt(state.generatedAt, language);
  elements.liveIndicator.textContent = filteredItems.length > 0 ? getText("live") : getText("idle");
}

async function loadAndRender({ silent = false } = {}) {
  try {
    const payload = await fetchFeedPayload();
    setData(payload.items, payload.generatedAt);
    if (!silent) {
      showToast(getText("loadedSignals", payload.items.length));
    }
  } catch (error) {
    console.error(error);
    if (!silent) {
      showToast(getText("loadFailed"));
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

  elements.languageFilter.addEventListener("change", (event) => {
    setFilter("language", event.target.value === "en" ? "en" : "zh");
  });

  elements.searchInput.addEventListener("input", (event) => {
    setFilter("query", event.target.value || "");
  });

  elements.refreshButton.addEventListener("click", () => {
    loadAndRender();
  });

  elements.contactButton.addEventListener("click", () => {
    markLeadModalSeen();
  });

  elements.drawerCloseButton.addEventListener("click", () => {
    closeDrawer();
  });

  elements.leadModalBackdrop?.addEventListener("click", () => {
    closeLeadModal();
  });
  elements.leadModalClose?.addEventListener("click", () => {
    closeLeadModal();
  });
  elements.leadModalCloseX?.addEventListener("click", () => {
    closeLeadModal();
  });
  elements.leadModalOpen?.addEventListener("click", () => {
    markLeadModalSeen();
    closeLeadModal({ remember: false });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      closeLeadModal();
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
      scheduleLeadModal();
    } else {
      globe.stop();
      if (leadModalTimer) {
        window.clearTimeout(leadModalTimer);
        leadModalTimer = null;
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    globe.destroy();
  });
}

function init() {
  const defaultLanguage = navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
  setFilter("language", defaultLanguage);
  applyLanguageUi(defaultLanguage);
  if (elements.languageFilter) {
    elements.languageFilter.value = defaultLanguage;
  }

  subscribe(syncView);
  bindEvents();
  globe.start();
  scheduleLeadModal();
  loadAndRender();
  window.setInterval(() => loadAndRender({ silent: true }), REFRESH_INTERVAL_MS);
}

init();
