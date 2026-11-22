# 途灵 TripGen

AI 旅行规划器：填写目的地 / 天数 / 预算 / 人群 / 偏好 → 先预选酒店 → 流式生成逐日行程 → 地图按天查看 → 对话修改 → 历史记录 → 分享 / 导出图片。生成后自动联网核验地点。

## 项目结构

```
frontend/   Vue 3 + Vite + TypeScript + Tailwind v4 + Pinia + vue-router + Leaflet
server/     Express + Vercel AI SDK + DeepSeek（独立后端）
```

- 前端端口：开发 5173，生产预览 **5174**
- 后端端口：**3001**
- 前端的 `/api` 由 Vite proxy 转发到 `http://localhost:3001`

## 快速开始

1. 配置后端密钥：在 `server/.env` 写入

```
DEEPSEEK_API_KEY=your_key
```

2. 启动后端

```bash
cd server
npm install
npm run dev
```

3. 启动前端

```bash
cd frontend
npm install
npm run dev          # 开发，http://localhost:5173
# 或生产预览
npm run build
npm run preview      # http://localhost:5174
```

## 接口

| 接口 | 说明 |
|---|---|
| `POST /api/hotels` | 推荐 3–5 家酒店（generateObject） |
| `POST /api/plan` | 生成/修改行程（streamObject）；body 同时含 `plan` + `messages` 时为对话修改 |
| `POST /api/verify` | OpenStreetMap Nominatim 联网核验地点（坐标/地址/营业时间），无需 Key |

## 数据存储

- 历史记录：`localStorage`（键 `tripgen:history`）
- 当前行程 / 对话：`sessionStorage`
- 无数据库、无服务端持久化

## 说明

- 行程内容、酒店推荐由 DeepSeek 生成；联网核验只补齐真实 POI 的坐标与地址，价格/营业时间仍建议出行前复核。
- `server/.env` 已被 git 忽略，请勿提交密钥。
