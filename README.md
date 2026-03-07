# News Terminal Web

Terminal-style news web page built in `C:\Cloud_code\news_web`.

## What This Includes
- Data bridge scripts that read source files from `C:\Cloud_code\newsai`
- Feed normalization to unified JSON schema
- Standalone market monitor pipeline with intraday cross-asset curves
- Responsive terminal UI (`web/index.html`) with:
  - WebGL rotating globe (terrain texture + atmosphere + glowing trails)
  - Drag to rotate and click globe nodes to open matching news
  - Color vividness scales with current signal count
  - Live feed list
  - Signal detail panel
  - Metrics panel
  - Market data curve deck with cached fallback states
- One-click pipeline script (`scripts/run_pipeline.ps1`)

## Constraints Enforced
- All new code lives in `C:\Cloud_code\news_web`
- No cross-project Python imports from `newsai`
- Data integration is file-based only

## Run Pipeline

```powershell
cd C:\Cloud_code\news_web
.\scripts\run_pipeline.ps1
```

Optional parameters:

```powershell
.\scripts\run_pipeline.ps1 -SourceDir C:\Cloud_code\newsai -CacheTail 140 -MaxItems 160
```

Output:
- Raw snapshots: `data\raw\*.json`
- Final feed: `data\normalized\feed.json`
- Market monitor payload: `data\normalized\market-data.json`

## Run Web UI

```powershell
cd C:\Cloud_code\news_web
py -m http.server 8080
```

Open:
- http://localhost:8080/web/index.html

Note:
- Globe rendering loads Three.js from local vendor files first (`web/assets/vendor`), then falls back to CDN.

## One-Command Run (Pipeline + Web)

Use this to run sync + normalize first, then start local web server:

```powershell
cd C:\Cloud_code\news_web
.\scripts\run_and_serve.cmd
```

Optional args:

```powershell
.\scripts\run_and_serve.cmd C:\Cloud_code\newsai 140 160 8080
```

Argument order:
1. `source_dir`
2. `cache_tail`
3. `max_items`
4. `port`

## Files
- `scripts/sync_from_newsai.py`: reads upstream files and creates raw snapshots
- `scripts/normalize_feed.py`: converts raw snapshots into unified feed schema
- `scripts/fetch_market_data.py`: generates standalone market monitor JSON from public chart endpoints
- `scripts/run_pipeline.ps1`: serial pipeline runner
- `web/index.html`: terminal page structure
- `web/assets/css/terminal.css`: theme, layout, responsive styles
- `web/assets/js/*.js`: data fetch, state store, render logic

## Market Monitor Data

- Source: Yahoo Finance chart endpoint, fetched by `scripts/fetch_market_data.py`
- Refresh strategy: regenerated on every pipeline run, then polled by the web UI from local static JSON
- Fallback order:
  1. fresh remote chart data
  2. last successful cached payload in `.runtime\market-data-cache.json`
  3. deterministic default sample payload

This keeps the GitHub Pages UI stable even when the external market source is temporarily unavailable.

## Feed Schema

```json
{
  "generated_at": "2026-03-04T04:52:53Z",
  "schema_version": "1.0.0",
  "items": [
    {
      "id": "x_xxxxx",
      "source": "x|wire",
      "title": "...",
      "content": "...",
      "symbols": ["AAPL"],
      "sentiment": "positive|neutral|negative",
      "priority": "critical|warning|info",
      "published_at": "ISO-8601 UTC",
      "url": "https://...",
      "meta": {}
    }
  ],
  "stats": {}
}
```

## Notes
- `translation_cache.json` contains many historical entries; pipeline takes a tail window and normalizes it.
- If you want only X feed, reduce `-CacheTail` or set `-CacheTail 0`.
