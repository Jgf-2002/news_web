const DEFAULT_DATA_URL = "../data/normalized/feed.json";

export function resolveDataUrl() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("data");
  return fromQuery || DEFAULT_DATA_URL;
}

export async function fetchFeedPayload() {
  const dataUrl = resolveDataUrl();
  const response = await fetch(dataUrl, {
    cache: "no-store",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    dataUrl,
    generatedAt: payload?.generated_at || "",
    items,
    stats: payload?.stats || {},
  };
}
