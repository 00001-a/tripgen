# 途灵 TripGen · 技术设计文档

> AI 旅行规划师：输入目的地 / 天数 / 预算 / 人群 / 偏好，先预选住宿，再 30 秒生成「以酒店为锚点、按天顺路」的 Day-by-Day 行程 + 预算表，并可在真实地图上查看、用对话实时修改。
> 状态：**已实现核心流程**（Next.js 16 + AI SDK v7 + DeepSeek + Leaflet）
> 最近更新：2026-07-31

---

## 1. 产品概述

途灵 TripGen 是一个一键式 AI 旅行规划 Web 应用。用户只需填写目的地、天数、预算和偏好，系统先推荐几间合适的酒店供其挑选落脚处，再基于选定酒店生成「每天首尾在酒店、同日内路线顺路」的逐日行程；生成结果可在真实地图（OpenStreetMap）上查看，也能通过自然语言对话持续微调。

### 核心特色

- **酒店预选**：生成行程前先由模型推荐 3–5 家真实酒店（含坐标、房价、标签、推荐理由），用户挑选落脚处，行程据此锚定。
- **顺路行程**：以酒店为每日起讫点，同天景点按地理邻近度由近及远铺开，避免跨区折返。
- **真实地图**：每个行程项带 WGS84 经纬度，用 Leaflet + OpenStreetMap 渲染彩色序号图钉与当日行进路线（免密钥）。
- **对话改行程**：基于当前行程 + 对话历史，模型流式返回「完整」更新后的行程。
- **结构化可靠输出**：AI SDK `streamObject`/`generateObject` + Zod schema 保证类型安全的流式/结构化结果。
- **预算可控**：预算明细六项之和严格等于总预算，每日花费聚合到总盘。

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 16 (App Router) + TypeScript** | 前后端一体，API Route 服务端调 LLM，Turbopack 构建 |
| 样式 | **Tailwind CSS v4** | 快速出一致 UI，移动端友好 |
| LLM 集成 | **Vercel AI SDK v7 + `@ai-sdk/deepseek` + `@ai-sdk/react`** | `streamObject`/`generateObject` + `useObject` 直接拿类型安全的流式结构化输出 |
| 模型 | **deepseek-chat** | 中文强、成本低 |
| 状态/校验 | **React 19 + Zod v4** | 客户端消费流式结果；Zod 校验入参与 AI 输出 |
| 地图 | **Leaflet + react-leaflet v5 + OpenStreetMap** | 免密钥瓦片，浏览器端渲染（关闭 SSR） |
| 存储 | **无服务端持久化（MVP）** | 分享通过前端状态即可，无需数据库 |
| 部署（规划） | **EdgeOne Pages（腾讯云）免费额度** | 完全免费、支持 Next.js API 路由；Git 仓库托管于 GitHub |

### 关键环境变量

| 变量 | 用途 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 调用 DeepSeek 模型 | **仅服务端** API Route 持有，前端不暴露；本地放 `.env.local`，部署时配到平台环境变量 |

---

## 3. 系统架构

```
浏览器 (Next.js RSC/Client)
  PlanForm  ──POST /api/hotels──▶ API Route (Node)
   │                            │   - Zod 校验入参
   │                            │   - generateObject(HotelListSchema)
   │  ◀──酒店候选 JSON──────────┘   - 调 DeepSeek(deepseek-chat)
   ▼
  酒店卡片 → 用户点选「用这家生成行程」
   │
   ▼
  useObject ──POST /api/plan──▶ API Route (Node)
   │                          │   - Zod 校验(PlanRequest + 选定酒店)
   │                          │   - streamObject(PlanSchema) 带酒店锚点
   │  ◀──文本流(Partial Plan)─┘   - 调 DeepSeek(deepseek-chat)
   ▼
  Timeline + BudgetChart + TripMap(Leaflet)
   │
   ▼ 对话微调
  useObject ──POST /api/plan(plan+messages)──▶ REFINE 模式 streamObject
```

**关键点**：API Key 只在服务端；前端通过 `useObject` 消费 `/api/plan` 的文本流，边生成边渲染；调用失败有降级提示，不白屏。

---

## 4. 核心业务流程

### 4.1 酒店预选（生成前）
1. 用户提交表单，`page.tsx` 组装 `PlanRequest` 先 `POST /api/hotels`。
2. 后端用 `generateObject` 调模型，输出 `HotelListSchema`（3–5 家候选）。
3. 前端展示酒店卡片（名称 / 房价 / 标签 / 理由 / 坐标），用户点击「用这家生成行程」。

### 4.2 顺路行程生成
1. 选中酒店后，前端 `submit({ ...lastRequest, hotel })` → `POST /api/plan`。
2. 后端 `buildUserPrompt(r, hotel)` 追加酒店锚点约束，模型 `streamObject(PlanSchema)` 流式返回。
3. 前端 `useObject` 实时渲染标题、预算条、按天时间轴。
4. 系统提示词第 9、10 条强制每个 item 给真实坐标、同天由近及远顺路；用户选了酒店后第 11–13 条约束「每天首尾在酒店」。

### 4.3 对话微调
1. 用户在对话框输入需求，前端把「当前行程 `plan` + 完整 `messages`」`POST /api/plan`。
2. 后端 `PlanRefineRequestSchema` 识别为 refine 模式（宽松校验 `plan: z.any()`，避免历史略偏枚举值导致反复失败）。
3. 模型基于 `REFINE_SYSTEM_PROMPT` 返回**完整**更新后的行程 JSON，并在 `reply` 字段写中文调整说明；前端 `onFinish` 把 `reply` 作为助手消息追加到对话。

---

## 5. 数据模型（Zod，前后端共用，`lib/schema.ts`）

| Schema | 用途 | 关键字段 |
|---|---|---|
| `ChosenHotelSchema` | 用户选定酒店（仅入参，不进行程 JSON） | `name` / `location?` / `lat` / `lng` / `pricePerNight?` |
| `PlanRequestSchema` | 生成/改行程入参 | 目的地、天数、预算、人群、偏好、饮食、节奏、`hotel?` |
| `HotelCandidateSchema` + `HotelListSchema` | 酒店候选 | `name`/`location`/`lat`/`lng`/`pricePerNight`/`tags`/`reason`，3–5 家 |
| `PlanItemSchema` | 单条行程 | `time`/`category`/`title`/`description`/`location?`/`lat?`/`lng?`/`durationMin?`/`cost`/`tips?` |
| `DaySchema` | 单日 | `day`/`theme`/`items[]`/`dayCost` |
| `PlanSchema` | 完整行程 | `title`/`summary`/`days[]`/`budgetBreakdown`/`tips`/`packing?`/`reply?` |
| `PlanRefineRequestSchema` | 对话改行程 | `plan: z.any()` / `messages[]`（宽松以保兼容） |

`category` 枚举与前端配色在 `CATEGORY_META` 中集中定义（9 类：美食/观光/活动/交通/休息/购物/住宿/自然/人文），地图与列表共用同一套语义色。

---

## 6. LLM 集成（`lib/prompt.ts`）

| 导出 | 用途 | 要点 |
|---|---|---|
| `SYSTEM_PROMPT` | 初始生成硬性规则 | 11 条：schema 完整、预算±10%、08:00–22:00、具体 POI、人群/偏好适配、每 item 带 tips 与 cost、**真实经纬度(第9条)**、**同天顺路(第10条)** |
| `buildUserPrompt(r, hotel?)` | 拼接用户需求 | 传 `hotel` 时追加「以酒店为锚点：每天首尾在酒店、由近及远、房费计入 budgetBreakdown.accommodation」 |
| `REFINE_SYSTEM_PROMPT` | 对话改行程规则 | 返回完整 JSON、保持首尾在酒店/顺路、用 `reply` 说明调整 |
| `buildRefinePrompt(plan, messages)` | 拼接对话上下文 | 当前行程 JSON + 对话历史（末条为最新需求） |
| `HOTEL_SYSTEM_PROMPT` | 酒店推荐规则 | 真实存在、靠近景点/枢纽、结合人群、房价落预算、给真实坐标 |
| `buildHotelPrompt(r)` | 拼接酒店需求 | 目的地/天数/预算/人群/偏好/节奏 |

API 路由（`app/api/plan/route.ts`、`app/api/hotels/route.ts`）均设 `maxDuration = 60`，仅在 `DEEPSEEK_API_KEY` 缺失时返回明确错误。

---

## 7. 前端结构（`app/`）

```
app/
  page.tsx                 # 表单 + 酒店挑选 + 流式结果 + 对话调整（活泼彩色 UI，三栏）
  TripMap.tsx              # 真实 Leaflet 地图（ssr:false 动态导入）
  api/plan/route.ts        # 生成 / 对话改行程（streamObject，文本流）
  api/hotels/route.ts      # 酒店预选（generateObject，JSON）
lib/
  schema.ts  prompt.ts
.env.example               # DEEPSEEK_API_KEY 样例（已放行 gitignore）
.env.local                 # 真实密钥（gitignore，勿提交）
```

### 7.1 页面交互（`page.tsx`）
- 左栏：目的地 / 天数 / 预算 / 人群 / 成人儿童 / 偏好 / 节奏 表单。
- 中栏：结果区，三阶段切换——加载酒店 → 酒店卡片挑选 → 行程（标题 + 落脚点徽章 + 预算条 + 行程/地图视图切换 + 提示）。
- 右栏：对话调整（消息流 + 输入框，先生成后可用）。
- `useObject` 用 `onFinish` 把模型 `reply` 写回对话。
- 视图切换：`list`（按天时间轴）/ `map`（TripMap）。

### 7.2 地图模块（`TripMap.tsx`）
- 仅客户端渲染：`dynamic(() => import('./TripMap'), { ssr:false })`，避免 Leaflet 访问浏览器全局对象报错。
- 同类别序号彩色气泡图钉（DivIcon，按 `category` 着色），`Polyline` 按时间顺序连当日路线。
- `FitBounds` 自动缩放视野到所有标点；无坐标日显示占位提示。
- 瓦片用 OpenStreetMap（`https://{s}.tile.openstreetmap.org/...`，免密钥），点图钉弹详情（标题/时间/地点/花费/坐标）。

---

## 8. 关键难点与对策

| 难点 | 对策 |
|---|---|
| 行程结构不稳定 | Zod schema 强约束 + 系统提示词硬性规则；解析失败返回明确错误 |
| 预算超支/不足 | 提示词要求明细六项之和=总预算、日花费聚合；前端二次校验显示总盘 |
| 路线不顺 / 不落地 | 提示词强制「酒店锚点 + 每天首尾在酒店 + 同天由近及远」 |
| 地图坐标缺失/SSR 报错 | item 可选 lat/lng，无坐标日降级占位；`ssr:false` 动态导入 |
| react-leaflet 版本缺失 | 锁定 `react-leaflet@^5`（与 React 19 兼容） |
| 对话改行程反复失败 | refine 模式对 `plan` 用宽松 `z.any()`，仅严格校验 `messages`；始终返回完整 JSON |
| 流式中断/超时 | `streamObject` 自带中断恢复；`maxDuration=60` |
| LLM 失败 | 路由返回明确错误，前端红条/Toast 提示，不白屏 |
| Key 泄露 | 仅服务端 API Route 持有；`.env.local` + 部署平台环境变量 |

---

## 9. 配置与运行

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥
cp .env.example .env.local
#   在 .env.local 填入：DEEPSEEK_API_KEY=sk-xxx

# 3. 开发
npm run dev          # http://localhost:3000

# 4. 构建 / 生产
npm run build && npm run start
```

> 注意：`.gitignore` 已配置 `.env*` 同时放行 `!.env.example`，确保密钥不入仓、模板可共享。

---

## 10. 部署（规划）

- **目标**：完全免费对外提供服务。
- **Git 托管**：GitHub 私有仓库 `https://github.com/00001-a/tripgen`（已初始化本地 commit，待 push）。
- **平台**：EdgeOne Pages（腾讯云）免费额度，支持 Next.js API 路由与自定义环境变量；上线后在平台配置 `DEEPSEEK_API_KEY`。
- **前置**：push 前需为私有仓库配置带 `repo` 权限的 GitHub PAT（或改为 Public 后免密授权）。
- 当前状态：**未部署**，代码仅本地。

---

## 11. 后续规划（Roadmap）

| 方向 | 说明 |
|---|---|
| 分享链接 | 将行程 JSON 编码进 URL hash 或短链服务，一键分享/只读页 |
| 多 Agent 编排 | 检索 Agent（补 POI/天气）→ 规划 Agent → 预算 Agent 串联 |
| 导出 | PDF / 图片导出行程 |
| 行程历史 | 本地保存历史生成，便于回看对比 |
| 地图增强 | 步行/驾车路线、距离与时长估算 |

---

## 12. 已确认决策

1. **项目名**：中文「途灵」+ 英文「TripGen」并用。
2. **核心流程**：酒店预选 → 顺路行程 → 对话微调（已实现）。
3. **地图**：Leaflet + OpenStreetMap，免密钥、客户端渲染。
4. **LLM**：DeepSeek `deepseek-chat`，服务端持有 Key。
5. **UI 风格**：活泼彩色（渐变标题、圆角卡片、分类配色）。
6. **项目位置**：`D:\project\tripgen`。
7. **部署策略**：完全免费，GitHub 托管 + EdgeOne Pages（规划中，未执行）。
