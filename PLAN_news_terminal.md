# News Terminal Web 计划文档

## 0. 文档信息
- 项目名: News Terminal Web
- 计划日期: 2026-03-04
- 设计参考: https://glint.trade/terminal
- 数据源目录: `C:\Cloud_code\newsai`
- 新脚本目录: `C:\Cloud_code\news_web`
- 约束: 新生成脚本不得依赖其他项目脚本（不 import `newsai` 模块）
- Skill: `ui-ux-pro-max`（已执行 design-system 与 UX/stack 检索）

## 1. 目标与范围
- 目标: 设计并落地一个类终端风格的新闻 Web 页面，视觉参考 Glint Terminal。
- 范围:
  - 终端式深色 UI（信息流 + 详情 + 状态/指标区）。
  - 从 `newsai` 读取新闻数据并在 `news_web` 内标准化。
  - 所有新增代码仅存放在 `news_web`。
- 非范围（本阶段）:
  - 不改造 `newsai` 原有代码结构。
  - 不引入跨项目 import。

## 2. 已确认输入资产
- `C:\Cloud_code\newsai\run_twitter.py`
- `C:\Cloud_code\newsai\run_newsent.py`
- `C:\Cloud_code\newsai\run_gmail.py`
- `C:\Cloud_code\newsai\last_message.json`（已存在结构化输出）
- `C:\Cloud_code\newsai\translation_cache.json`（可选辅助）

说明:
- 目前最稳定的结构化输入是 `last_message.json`（X 来源）。
- Gmail/Bloomberg 现有流程以发送 Telegram 为主，结构化落盘有限；计划里会设计“文件桥接优先、日志桥接兜底”的策略。

## 3. 视觉与交互基线（来自参考站点 + Skill）

### 3.1 视觉 token
- 背景: `#06060a`
- 表面层: `#0a0a10` / `#0e0e16`
- 主文字: `#f4f4f5`
- 次文字: `#71717a`
- 强调色: `#3b82f6`
- 正向: `#22c55e`
- 风险: `#ef4444`
- 警示: `#f59e0b`

### 3.2 字体策略
- UI 正文字体: `IBM Plex Sans`
- 数据/价格/时间戳: `JetBrains Mono`

### 3.3 布局策略
- Desktop: `Topbar + 3-column`（左侧新闻流 / 中央详情 / 右侧状态面板）
- Mobile: 折叠为 `Topbar + Feed + Drawer Detail`
- 动效: 仅保留 1-2 个关键动效（卡片进入、价格/状态闪烁）
- 无障碍: focus ring、键盘可达、`prefers-reduced-motion`

## 4. 技术架构（零跨项目依赖）

### 4.1 架构原则
- 不从 `news_web` import `newsai` 的任何 Python 模块。
- 与 `newsai` 的交互仅通过:
  - 文件读取（JSON/CSV）
  - 可选子进程调用（CLI）
- 页面层不依赖其他项目脚本；内部仅依赖 `news_web` 自身文件。

### 4.2 数据流
1. `scripts/sync_from_newsai.py`
   - 读取 `C:\Cloud_code\newsai\last_message.json` 等输入。
   - 输出到 `news_web/data/raw/*.json`。
2. `scripts/normalize_feed.py`
   - 统一字段，生成 `news_web/data/normalized/feed.json`。
3. `web/assets/js/data-source.js`
   - 前端拉取 `data/normalized/feed.json` 并渲染。

### 4.3 统一新闻数据结构（建议）
```json
{
  "id": "x_20260304_123000_abc",
  "source": "x|gmail|bloomberg",
  "title": "string",
  "content": "string",
  "symbols": ["AAPL", "TSLA"],
  "sentiment": "positive|neutral|negative",
  "priority": "critical|warning|info",
  "published_at": "2026-03-04T12:30:00Z",
  "url": "https://...",
  "meta": {
    "author": "string",
    "raw_file": "last_message.json"
  }
}
```

## 5. 目录规划（全部在 news_web）
```text
C:\Cloud_code\news_web
├─ PLAN_news_terminal.md
├─ design-system\news-terminal-web\MASTER.md
├─ data
│  ├─ raw
│  └─ normalized
├─ scripts
│  ├─ sync_from_newsai.py
│  ├─ normalize_feed.py
│  └─ run_pipeline.ps1
└─ web
   ├─ index.html
   └─ assets
      ├─ css\terminal.css
      └─ js
         ├─ app.js
         ├─ data-source.js
         ├─ state-store.js
         └─ renderers.js
```

## 6. 里程碑计划

### M1 - 数据桥接 MVP
- 产出:
  - `sync_from_newsai.py`
  - `normalize_feed.py`
  - `data/normalized/feed.json`
- 验收:
  - 在不 import `newsai` 的前提下，成功生成可渲染 feed。

### M2 - 终端 UI 骨架
- 产出:
  - `index.html` + `terminal.css` + `app.js`
  - 三栏布局（桌面）+ 移动端折叠
- 验收:
  - 375 / 768 / 1024 / 1440 无横向滚动。

### M3 - 交互与状态表达
- 产出:
  - 标签颜色语义（critical/warning/info）
  - 卡片 hover/focus/active 状态
  - `prefers-reduced-motion` 适配
- 验收:
  - 键盘可完整浏览新闻列表和详情区。

### M4 - 联调与发布准备
- 产出:
  - `run_pipeline.ps1`
  - 数据异常处理（空文件、字段缺失、时间格式异常）
  - 使用说明 `README.md`
- 验收:
  - 本地一键更新数据并刷新页面。

## 7. 风险与应对
- 风险: `newsai` 某些来源暂未稳定落地为结构化文件。
- 应对:
  - 先以 `last_message.json` 完成 MVP。
  - 为 Gmail/Bloomberg 预留适配器接口（增量接入，不影响页面层）。

## 8. 完成定义（DoD）
- 新增文件全部位于 `C:\Cloud_code\news_web`。
- 不存在跨项目 import（尤其是 `newsai` Python 模块）。
- 页面视觉达到“终端风格 + 高可读 + 高对比”。
- 数据管道可重复执行，且输出稳定 JSON。

## 9. 下一步执行顺序
1. 先做 M1（数据桥接）并生成首版 `feed.json`。
2. 再做 M2（静态终端布局）。
3. 最后做 M3/M4（交互、容错、脚本化运行）。
