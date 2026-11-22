# 途灵 TripGen · 技术设计文档

> AI 旅行规划器：输入目的地 / 天数 / 预算 / 人群 / 偏好，先预选住宿，再流式生成「以酒店为锚点、按天顺路」的逐日行程；支持地图查看、对话修改、历史记录、分享与导出图片，并对地点做联网核验。
>
> 状态：**已实现**（Vue 3 + Vite 前端 / 独立 Express 后端 / DeepSeek / Leaflet / OSM 核验）
> 最近更新：2026-11-22

---

## 1. 产品概述

用户填写需求后：

1. 后端推荐 3–5 家酒店（含坐标、房价、标签、推荐理由），用户挑选落脚处；
2. 以酒店为锚点流式生成逐日行程，同天路线按地理邻近顺路铺开；
3. 行程可在列表 / 地图两种视图按天查看；
4. 生成后自动联网核验地点坐标、地址、营业时间等；
5. 可通过对话持续修改，历史记录只保留调整后的版本；
6. 支持分享链接与导出整份行程图片。

---

## 2. 架构

```
浏览器 (Vue 3, 5174)
   │  /api/*  (Vite proxy)
   ▼
Express 后端 (3001) ──► DeepSeek（hotels / plan / refine）
   │
   └──► OpenStreetMap Nominatim（/api/verify，无需 Key）
```

| 层 | 选型 |
|---|---|
| 前端 | Vue 3.5 + Vite 8 + TypeScript + Tailwind CSS v4 + Pinia + vue-router 4 |
| 地图 | Leaflet + OpenStreetMap 瓦片 |
| 后端 | Node + Express + Vercel AI SDK v7 + `@ai-sdk/deepseek` |
| 模型 | `deepseek-chat` |
| 校验 | Zod v4（请求与模型输出 schema） |
| 持久化 | 无数据库：历史在 `localStorage`，当前行程/对话在 `sessionStorage` |

### 端口

- 前端开发 5173；生产预览 **5174**
- 后端 **3001**

---

## 3. 接口

| 接口 | 模式 | 说明 |
|---|---|---|
| `POST /api/hotels` | 非流式 JSON | `generateObject` 返回酒店候选 |
| `POST /api/plan` | 流式文本流 | `streamObject`；body 同时含 `plan` + `messages` 时为对话修改模式 |
| `POST /api/verify` | 非流式 JSON | 逐点调用 Nominatim，返回核验后的坐标/地址/营业时间等；限速 1 次/秒 |

前端使用 `@ai-sdk/vue` 的 `useObject` 消费 `/api/plan` 的流式输出。

---

## 4. 关键设计

### 4.1 行程规则

- N 天 = **N−1 晚**；仅 Day 1..N−1 以住宿结尾，最后一天以返程结束。
- 同天行程以酒店为起讫点，按地理邻近单向铺开，避免跨区折返。
- 住宿预算 = 房价 ×(N−1)。

### 4.2 地图

- 按天分图：图钉数字为**当天行程顺序**。
- 图钉为水滴形 SVG；点击弹出与列表一致的详情。
- 若联网核验成功，优先使用核验后的 WGS84 坐标。

### 4.3 联网核验

- 数据源：OpenStreetMap Nominatim（免费、无需 Key）。
- 查询词：`地点名 + 目的地`；名称匹配度不足时用去掉「公园/博物馆/岛」等后缀的名称重试。
- 候选按名称相似度打分（完全相同 3 / 互相包含 2 / 地址包含 1），低于 2 则放弃，保留模型坐标，避免错标。
- 返回地址、营业时间、网站、电话（OSM 有则返回）。
- 遵循使用政策：单线程、请求间隔 1.15s、带 User-Agent。
- 核验结果写入历史记录，重新打开仍生效。

### 4.4 历史记录

- `localStorage` 键 `tripgen:history`，按更新时间倒序。
- 初始生成新增一条；对话修改更新**同一条**并置顶（只保留调整后的版本）。
- 每条包含行程、目的地、天数、时间与核验结果。

### 4.5 导出与分享

- 分享：行程序列化为 URL hash（UTF-8 base64，URL 安全）。
- 导出：离屏渲染一份全量 `#itinerary-export`，用 `html-to-image` 生成 PNG，与当前查看的天无关。

### 4.6 视觉

编辑杂志风：米白纸张底、墨色正文、墨绿强调 `#1f4d3b`，标题宋体 / 衬线；不使用渐变、玻璃拟态与 emoji。

---

## 5. 环境变量与运行

`server/.env`：

```
DEEPSEEK_API_KEY=...
```

运行：

```bash
cd server && npm run dev        # 3001
cd frontend && npm run dev      # 5173
cd frontend && npm run build && npm run preview   # 5174
```

---

## 6. 已知边界

- 行程内容、酒店推荐由模型生成，价格、营业时间、门店是否存续等建议出行前复核。
- Nominatim 在国内中小 POI 覆盖有限，核不到时保留模型坐标并标注未核验，不强行匹配。
- 无服务端持久化，历史记录仅存在当前浏览器。
- 旧版 Next.js 实现已移除，可从 git 历史查看。
