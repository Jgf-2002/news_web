const state = {
  items: [],
  selectedId: null,
  generatedAt: "",
  filters: {
    source: "all",
    priority: "all",
    language: "zh",
    query: "",
  },
};

const listeners = new Set();
const CJK_CHAR = /[\u3400-\u9FFF]/;
const LATIN_CHAR = /[A-Za-z]/;

function classifySegment(segment) {
  let cjkCount = 0;
  let latinCount = 0;

  for (const char of segment) {
    if (CJK_CHAR.test(char)) {
      cjkCount += 1;
      continue;
    }
    if (LATIN_CHAR.test(char)) {
      latinCount += 1;
    }
  }

  if (cjkCount === 0 && latinCount === 0) {
    return "neutral";
  }

  if (cjkCount >= Math.max(2, latinCount * 1.3)) {
    return "zh";
  }

  if (latinCount >= Math.max(2, cjkCount * 1.3)) {
    return "en";
  }

  return "mixed";
}

function splitBilingualText(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { zh: "", en: "", raw: "" };
  }

  const segments = raw
    .split(/\r?\n+/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (!segments.length) {
    return { zh: "", en: "", raw };
  }

  const zhParts = [];
  const enParts = [];
  const mixedParts = [];

  segments.forEach((segment) => {
    const kind = classifySegment(segment);
    if (kind === "zh") {
      zhParts.push(segment);
      return;
    }
    if (kind === "en") {
      enParts.push(segment);
      return;
    }
    mixedParts.push(segment);
  });

  if (mixedParts.length > 0) {
    const mixedText = mixedParts.join(" ");
    const hasZh = CJK_CHAR.test(mixedText);
    const hasEn = LATIN_CHAR.test(mixedText);

    if (!zhParts.length && hasZh) {
      zhParts.push(mixedText);
    }
    if (!enParts.length && hasEn) {
      enParts.push(mixedText);
    }
  }

  if (!zhParts.length && CJK_CHAR.test(raw)) {
    zhParts.push(raw);
  }

  if (!enParts.length && LATIN_CHAR.test(raw)) {
    enParts.push(raw);
  }

  return {
    zh: zhParts.join(" ").trim(),
    en: enParts.join(" ").trim(),
    raw,
  };
}

function normalizeItem(item) {
  const source = item || {};
  return {
    ...source,
    _lang: {
      title: splitBilingualText(source.title),
      content: splitBilingualText(source.content),
    },
  };
}

function localizeText(item, language) {
  const titleLang = item?._lang?.title || { zh: "", en: "", raw: "" };
  const contentLang = item?._lang?.content || { zh: "", en: "", raw: "" };

  const localizedTitle = language === "en" ? (titleLang.en || "") : (titleLang.zh || "");
  const localizedContent = language === "en" ? (contentLang.en || "") : (contentLang.zh || "");
  const fallbackTitle = localizedContent || titleLang.raw || contentLang.raw || "";

  return {
    title: localizedTitle || fallbackTitle,
    content: localizedContent,
    hasLocalized: Boolean(localizedTitle || localizedContent),
  };
}

function emit() {
  const snapshot = getState();
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return {
    items: [...state.items],
    selectedId: state.selectedId,
    generatedAt: state.generatedAt,
    filters: { ...state.filters },
  };
}

export function setData(items, generatedAt) {
  state.items = Array.isArray(items) ? items.map((item) => normalizeItem(item)) : [];
  state.generatedAt = generatedAt || "";

  if (!state.selectedId || !state.items.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.items[0]?.id || null;
  }

  emit();
}

export function setSelectedId(selectedId) {
  state.selectedId = selectedId;
  emit();
}

export function setFilter(name, value) {
  if (!(name in state.filters)) {
    return;
  }
  state.filters[name] = value;
  emit();
}

export function getFilteredItems() {
  const sourceFilter = state.filters.source;
  const priorityFilter = state.filters.priority;
  const languageFilter = state.filters.language === "en" ? "en" : "zh";
  const query = state.filters.query.trim().toLowerCase();

  return state.items.reduce((acc, item) => {
    if (sourceFilter !== "all" && item.source !== sourceFilter) {
      return acc;
    }
    if (priorityFilter !== "all" && item.priority !== priorityFilter) {
      return acc;
    }

    const localized = localizeText(item, languageFilter);
    if (!localized.hasLocalized) {
      return acc;
    }

    if (query) {
      const haystack = [
        localized.title,
        localized.content,
        item.source || "",
        ...(Array.isArray(item.symbols) ? item.symbols : []),
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) {
        return acc;
      }
    }

    acc.push({
      ...item,
      title: localized.title,
      content: localized.content,
      language: languageFilter,
    });
    return acc;
  }, []);
}

export function getSelectedItem(filteredItems) {
  return filteredItems.find((item) => item.id === state.selectedId) || filteredItems[0] || null;
}
