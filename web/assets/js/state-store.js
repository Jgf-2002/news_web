const state = {
  items: [],
  selectedId: null,
  generatedAt: "",
  filters: {
    source: "all",
    priority: "all",
    query: "",
  },
};

const listeners = new Set();

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
  state.items = Array.isArray(items) ? items : [];
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
  const query = state.filters.query.trim().toLowerCase();

  return state.items.filter((item) => {
    if (sourceFilter !== "all" && item.source !== sourceFilter) {
      return false;
    }
    if (priorityFilter !== "all" && item.priority !== priorityFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      item.title || "",
      item.content || "",
      item.source || "",
      ...(Array.isArray(item.symbols) ? item.symbols : []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function getSelectedItem(filteredItems) {
  return filteredItems.find((item) => item.id === state.selectedId) || filteredItems[0] || null;
}
