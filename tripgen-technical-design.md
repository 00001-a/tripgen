# 途灵 TripGen · 技术设计文档

> AI 旅行规划师：输入目的地 / 天数 / 预算 / 人群 / 偏好，30 秒生成可分享的 Day-by-Day 行程 + 预算表。
> 状态：**实现中**（Next.js 16 + AI SDK v5 + DeepSeek）

---

## 1. 价值定位与简历卖点

- **一眼秒懂**：非技术 HR 和技术面试官都能立刻理解价值，演示零冷场。
- **技术纵深可讲**：结构化 LLM 输出、流式渲染、轻量分享持久化、成本控制、可选多 Agent 编排。
- **完整交付物**：上线链接（Vercel）+ 开源仓库 + 一篇「架构与难点」总结。

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 16 (App Router) + TypeScript** | 前后端一体，API Route 服务端调 LLM |
| 样式 | **Tailwind CSS v4** | 快速出一致 UI，移动端友好 |
| LLM 集成 | **Vercel AI SDK v5 + `@ai-sdk/deepseek` + `@ai-sdk/react`** | `streamObject`/`useObject` + Zod 直接拿类型安全的流式结构化输出 |
| 模型 | **deepseek-chat** | 已有 API key，中文强、成本低 |
| 状态/校验 | **React 19 + Zod** | `useObject` 客户端消费流式结果；Zod 校验入参与 AI 输出 |
| 存储(分享) | **URL hash 降级（MVP）→ Vercel KV（后期）** | MVP 零配置，后期升级干净短链接 |
| 部署 | **Vercel** | push 即上线，自动 HTTPS |

---

## 3. 系统架构

```
浏览器(Next) ──POST /api/plan──▶ API Route(Node)
  PlanForm                          - Zod 校验入参
  Timeline  ◀──text stream──────── - 调 DeepSeek(streamObject)
  BudgetChart                       - Zod 解析/兜底
```

关键点：**API Key 只在服务端**，前端拿不到；LLM 调用失败有降级。

---

## 4. 数据模型（Zod，前后端共用）

见 `lib/schema.ts`：`PlanRequestSchema`（入参）、`PlanSchema`（行程：title/summary/days[]/budgetBreakdown/tips/packing）、`PlanItemSchema`、`DaySchema`、`CATEGORY_META`（前端分类配色）。

---

## 5. LLM 集成

- `app/api/plan/route.ts`：`streamObject({ model: deepseek('deepseek-chat'), schema: PlanSchema, system, prompt })` → `result.toTextStreamResponse()`。
- `lib/prompt.ts`：`SYSTEM_PROMPT`（硬性规则：结构、预算≈总预算、时段、具体 POI、人群/偏好适配、tips）+ `buildUserPrompt()`。
- 前端 `app/page.tsx`：`useObject({ api:'/api/plan', schema: PlanSchema })` 边生成边渲染时间轴与预算条。

---

## 6. 前端结构

```
app/
  page.tsx              # 表单 + 流式结果（活泼彩色 UI）
  api/plan/route.ts     # 生成（流式）
lib/
  schema.ts  prompt.ts
.env.local              # DEEPSEEK_API_KEY（gitignore，勿提交）
```

UI：渐变标题、圆角卡片、分类彩色标签；移动端单列、桌面双栏（左表单/右结果）。

---

## 7. 分享功能（规划）

- MVP：将整个 Plan JSON 编码进 URL hash（`#p=base64`），本地即可分享。
- 后期：POST `/api/share` 存 Vercel KV → `/share/[id]` 公开只读页。

---

## 8. 关键难点与对策（面试弹药）

| 难点 | 对策 |
|---|---|
| 行程结构不稳定 | Zod schema 强约束 + 系统提示词硬性规则；解析失败重试 |
| 预算超支/不足 | 提示词要求 dayCost 求和≈总预算；前端二次校验 |
| 流式中断/超时 | `streamObject` 自带中断恢复；`maxDuration=60` |
| LLM 失败 | 路由返回明确错误，前端 Toast/红条提示，不白屏 |
| Key 泄露 | 仅服务端 API Route 持有；`.env.local` + Vercel 环境变量 |

**进阶（加分项）**：多 Agent 编排——检索 Agent（补 POI/天气）→ 规划 Agent（排程）→ 预算 Agent（核算），AI SDK `generateObject` 串联。

---

## 9. 开发里程碑（10 天，vibe coding）

| 阶段 | 天数 | 交付 |
|---|---|---|
| 脚手架 | D1–2 | Next.js + Tailwind，空壳 + `/api/plan` 回显 |
| 核心生成 | D3–4 | 表单 + streamObject + 基础渲染 |
| UI 打磨 | D5–6 | 时间轴/预算图/流式/移动端 |
| 分享&导出 | D7–8 | 分享链接 + 导出 |
| 收尾 | D9–10 | 异常处理/README/架构总结 |
| 缓冲 | — | 多 Agent、地图、历史 |

---

## 10. 已确认决策（2026-07-30）

1. **项目名**：中文「途灵」+ 英文「TripGen」并用。
2. **分享存储**：MVP 用 URL hash 降级，后期升级 Vercel KV。
3. **多 Agent 编排**：做（检索→规划→预算三 Agent）。
4. **UI 风格**：活泼彩色。
5. **LLM**：DeepSeek `deepseek-chat`，key 复用 moon-bridge 已配置的，本地 `.env.local` + Vercel 环境变量。
6. **项目位置**：`D:\project\tripgen`（C 盘仅保留 WorkBuddy 会话记忆）。
