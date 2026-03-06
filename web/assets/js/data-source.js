const DEFAULT_DATA_URL = "../data/normalized/feed.json";
const CACHE_BUSTER_PARAM = "_ts";

export function resolveDataUrl() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("data");
  return fromQuery || DEFAULT_DATA_URL;
}

function buildRequestUrl(dataUrl) {
  const requestUrl = new URL(dataUrl, window.location.href);
  requestUrl.searchParams.set(CACHE_BUSTER_PARAM, String(Date.now()));
  return requestUrl.toString();
}

export async function fetchFeedPayload() {
  const dataUrl = resolveDataUrl();
  const response = await fetch(buildRequestUrl(dataUrl), {
    cache: "no-store",
    headers: {
      "Accept": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
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
