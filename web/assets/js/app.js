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
    brandTitle: "Global News — Chinese No.1 Flash Report",
    source: "Source",
    priority: "Priority",
    search: "Search",
    searchPlaceholder: "keyword, symbol",
    refresh: "Refresh",
    contact: "Contact",
    feedTitle: "Live Feed",
    clearRegion: "All Regions",
    feedCount: (count) => `${count} items`,
    feedCountRegion: (count, region) => `${count} items | ${region}`,
    live: "Live",
    idle: "Idle",
    loadedSignals: (count) => `Loaded ${count} signals`,
    loadFailed: "Data load failed",
    selectedFromGlobe: "Signal selected from globe",
    focusedRegion: "Focused on selected region",
    regionFilterOn: (label) => `Region filter: ${label}`,
    regionHint: (label) => `REGION LOCK: ${label}`,
    leadTitle: "Need deeper market context?",
    leadText: "Jump to the ParisTrader webpage for full workflow, deeper analytics and faster decision support.",
    leadOpen: "Go To Webpage",
    leadLater: "Later",
    toggleText: "EN",
  },
  zh: {
    brandTitle: "\u5bf0\u7403\u65b0\u805e\u30fb\u83ef\u8a9e\u7b2c\u4e00\u901f\u5831",
    source: "\u6765\u6e90",
    priority: "\u4f18\u5148\u7ea7",
    search: "\u641c\u7d22",
    searchPlaceholder: "\u5173\u952e\u8bcd\u3001\u4ee3\u7801",
    refresh: "\u5237\u65b0",
    contact: "\u8054\u7cfb\u6211",
    feedTitle: "\u5b9e\u65f6\u65b0\u95fb",
    clearRegion: "\u8fd4\u56de\u5168\u90e8",
    feedCount: (count) => `${count} \u6761`,
    feedCountRegion: (count, region) => `${count} \u6761 | ${region}`,
    live: "\u5b9e\u65f6",
    idle: "\u7a7a\u95f2",
    loadedSignals: (count) => `\u5df2\u52a0\u8f7d ${count} \u6761\u65b0\u95fb`,
    loadFailed: "\u6570\u636e\u52a0\u8f7d\u5931\u8d25",
    selectedFromGlobe: "\u5df2\u4ece\u5730\u56fe\u9009\u4e2d\u65b0\u95fb",
    focusedRegion: "\u5df2\u5b9a\u4f4d\u5230\u5bf9\u5e94\u533a\u57df",
    regionFilterOn: (label) => `\u5df2\u5207\u6362\u5230 ${label} \u533a\u57df\u65b0\u95fb`,
    regionHint: (label) => `\u76ee\u524d\u5340\u57df\uff1a${label}`,
    leadTitle: "\u9700\u8981\u66f4\u6df1\u5c42\u7684\u5e02\u573a\u4e0a\u4e0b\u6587\uff1f",
    leadText: "\u8df3\u8f49\u5230 ParisTrader \u7db2\u9801\uff0c\u7372\u53d6\u66f4\u5b8c\u6574\u6d41\u7a0b\u3001\u66f4\u6df1\u5206\u6790\u8207\u66f4\u5feb\u6c7a\u7b56\u652f\u63f4\u3002",
    leadOpen: "\u8df3\u8f49\u7db2\u9801",
    leadLater: "\u7a0d\u540e",
    toggleText: "\u4e2d\u6587",
  },
};

const elements = {
  brandTitle: document.getElementById("brand-title"),
  sourceFilter: document.getElementById("source-filter"),
  priorityFilter: document.getElementById("priority-filter"),
  languageToggle: document.getElementById("language-toggle"),
  languageToggleText: document.getElementById("language-toggle-text"),
  searchInput: document.getElementById("search-input"),
  refreshButton: document.getElementById("refresh-btn"),
  contactButton: document.getElementById("contact-btn"),
  feedTitle: document.getElementById("feed-title"),
  clearRegionButton: document.getElementById("clear-region-filter"),
  feedList: document.getElementById("feed-list"),
  detailView: document.getElementById("detail-view"),
  mobileDetailView: document.getElementById("mobile-detail-view"),
  metricsGrid: document.getElementById("metrics-grid"),
  feedCount: document.getElementById("feed-count"),
  generatedAt: document.getElementById("generated-at"),
  liveIndicator: document.getElementById("live-indicator"),
  globeCanvas: document.getElementById("globe-canvas"),
  globeSummary: document.getElementById("globe-summary"),
  regionHint: document.getElementById("region-hint"),
  drawer: document.getElementById("mobile-detail-drawer"),
  drawerCloseButton: document.getElementById("mobile-close-detail"),
  toast: document.getElementById("toast"),
  labelSource: document.getElementById("label-source"),
  labelPriority: document.getElementById("label-priority"),
  labelSearch: document.getElementById("label-search"),
  leadModal: document.getElementById("lead-modal"),
  leadModalBackdrop: document.getElementById("lead-modal-backdrop"),
  leadModalClose: document.getElementById("lead-modal-close"),
  leadModalCloseX: document.getElementById("lead-modal-close-x"),
  leadModalTitle: document.getElementById("lead-modal-title"),
  leadModalText: document.getElementById("lead-modal-text"),
  leadModalOpen: document.getElementById("lead-modal-open"),
};

let activeRegionName = null;
let toastTimer = null;
let leadModalTimer = null;
let regionHintTimer = null;
let lastRenderedSelectedId = null;
let pendingForceFocusId = null;

function getLanguage() {
  return getState().filters.language === "en" ? "en" : "zh";
}

function getText(key, ...args) {
  const dictionary = UI_TEXT[getLanguage()];
  const value = dictionary[key];
  return typeof value === "function" ? value(...args) : value;
}

function getRegionLabel(regionName, language = getLanguage()) {
  if (!regionName) {
    return "";
  }
  return getHubDisplayInfo(regionName, language).label || regionName;
}

const globe = createGlobeRenderer(elements.globeCanvas, elements.globeSummary, {
  onSelect: (selection) => {
    const item = selection?.item || null;
    if (!item?.id) {
      return;
    }

    if (selection?.regionName) {
      activeRegionName = selection.regionName;
      showToast(getText("regionFilterOn", getRegionLabel(activeRegionName)));
      showRegionHint(activeRegionName);
    } else {
      showToast(getText("selectedFromGlobe"));
    }

    selectItem(item.id, {
      openOnMobile: true,
      focusGlobe: false,
    });
  },
});

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

function showRegionHint(regionName) {
  if (!elements.regionHint || !regionName) {
    return;
  }

  const label = getRegionLabel(regionName);
  elements.regionHint.textContent = getText("regionHint", label);
  elements.regionHint.hidden = false;
  elements.regionHint.classList.add("blink");

  if (regionHintTimer) {
    window.clearTimeout(regionHintTimer);
  }

  regionHintTimer = window.setTimeout(() => {
    elements.regionHint.classList.remove("blink");
  }, 4800);
}

function hideRegionHint() {
  if (!elements.regionHint) {
    return;
  }
  if (regionHintTimer) {
    window.clearTimeout(regionHintTimer);
    regionHintTimer = null;
  }
  elements.regionHint.hidden = true;
  elements.regionHint.classList.remove("blink");
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
  return Date.now() - readLeadModalLastSeen() >= LEAD_MODAL_COOLDOWN_MS;
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
  const copy = UI_TEXT[language];

  if (elements.brandTitle) {
    elements.brandTitle.textContent = copy.brandTitle;
  }
  if (elements.labelSource) {
    elements.labelSource.textContent = copy.source;
  }
  if (elements.labelPriority) {
    elements.labelPriority.textContent = copy.priority;
  }
  if (elements.labelSearch) {
    elements.labelSearch.textContent = copy.search;
  }
  if (elements.feedTitle) {
    elements.feedTitle.textContent = copy.feedTitle;
  }
  if (elements.clearRegionButton) {
    elements.clearRegionButton.textContent = copy.clearRegion;
  }

  setOptionText(elements.sourceFilter, "all", language === "en" ? "All" : "\u5168\u90e8");
  setOptionText(elements.priorityFilter, "all", language === "en" ? "All" : "\u5168\u90e8");
  setOptionText(elements.priorityFilter, "critical", language === "en" ? "Critical" : "\u7d27\u6025");
  setOptionText(elements.priorityFilter, "warning", language === "en" ? "Warning" : "\u8b66\u544a");
  setOptionText(elements.priorityFilter, "info", language === "en" ? "Info" : "\u4fe1\u606f");

  if (elements.searchInput) {
    elements.searchInput.placeholder = copy.searchPlaceholder;
  }
  if (elements.refreshButton) {
    elements.refreshButton.textContent = copy.refresh;
  }
  if (elements.contactButton) {
    elements.contactButton.textContent = copy.contact;
  }
  if (elements.leadModalTitle) {
    elements.leadModalTitle.textContent = copy.leadTitle;
  }
  if (elements.leadModalText) {
    elements.leadModalText.textContent = copy.leadText;
  }
  if (elements.leadModalOpen) {
    elements.leadModalOpen.textContent = copy.leadOpen;
  }
  if (elements.leadModalClose) {
    elements.leadModalClose.textContent = copy.leadLater;
  }
  if (elements.languageToggleText) {
    elements.languageToggleText.textContent = copy.toggleText;
  }
  if (elements.languageToggle) {
    elements.languageToggle.dataset.language = language;
    elements.languageToggle.setAttribute("aria-pressed", language === "en" ? "true" : "false");
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

function resolveRegionScopedItems(allItems) {
  if (!activeRegionName) {
    return allItems;
  }

  const regionItems = allItems.filter((item, index) => inferPrimaryHub(item, index)?.name === activeRegionName);
  if (regionItems.length === 0) {
    activeRegionName = null;
    return allItems;
  }
  return regionItems;
}

function syncView() {
  const state = getState();
  const language = state.filters.language === "en" ? "en" : "zh";
  applyLanguageUi(language);

  const allItems = getFilteredItems();
  const visibleItems = resolveRegionScopedItems(allItems);
  const selectedItem = getSelectedItem(visibleItems);

  if (selectedItem && selectedItem.id !== state.selectedId) {
    setSelectedId(selectedItem.id);
    return;
  }

  renderFeedList(
    elements.feedList,
    visibleItems,
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
  renderMetrics(elements.metricsGrid, visibleItems, language);
  globe.setSignals(allItems);

  const selectedId = selectedItem?.id || null;
  globe.setSelectedItemId(selectedId);

  const selectedIndex = selectedItem ? Math.max(0, allItems.findIndex((item) => item.id === selectedItem.id)) : -1;
  const selectedHub = selectedItem ? inferPrimaryHub(selectedItem, selectedIndex) : null;
  const highlightRegion = activeRegionName || selectedHub?.name || null;
  globe.setHighlightedRegion(highlightRegion);

  const selectedChanged = selectedId !== lastRenderedSelectedId;
  const shouldForceFocus = Boolean(selectedId && pendingForceFocusId === selectedId);
  if (selectedItem && (selectedChanged || shouldForceFocus)) {
    globe.focusOnItem(selectedItem, selectedIndex);
    if (shouldForceFocus) {
      showToast(getText("focusedRegion"));
    }
  }
  if (shouldForceFocus) {
    pendingForceFocusId = null;
  }
  lastRenderedSelectedId = selectedId;

  if (elements.clearRegionButton) {
    elements.clearRegionButton.hidden = !activeRegionName;
  }

  if (activeRegionName) {
    showRegionHint(activeRegionName);
    elements.feedCount.textContent = getText("feedCountRegion", visibleItems.length, getRegionLabel(activeRegionName, language));
  } else {
    hideRegionHint();
    elements.feedCount.textContent = getText("feedCount", visibleItems.length);
  }

  elements.generatedAt.textContent = formatGeneratedAt(state.generatedAt, language);
  elements.liveIndicator.textContent = visibleItems.length > 0 ? getText("live") : getText("idle");
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

  elements.languageToggle?.addEventListener("click", () => {
    const nextLanguage = getLanguage() === "en" ? "zh" : "en";
    setFilter("language", nextLanguage);
  });

  elements.searchInput.addEventListener("input", (event) => {
    setFilter("query", event.target.value || "");
  });

  elements.refreshButton.addEventListener("click", () => {
    loadAndRender();
  });

  elements.clearRegionButton?.addEventListener("click", () => {
    activeRegionName = null;
    hideRegionHint();
    showToast(getText("clearRegion"));
    setSelectedId(getState().selectedId);
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

  subscribe(syncView);
  bindEvents();
  globe.start();
  scheduleLeadModal();
  loadAndRender();
  window.setInterval(() => loadAndRender({ silent: true }), REFRESH_INTERVAL_MS);
}

init();
