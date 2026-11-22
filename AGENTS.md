# TripGen 项目约定

## 结构

- `frontend/`：Vue 3 + Vite + TypeScript + Tailwind v4 + Pinia + vue-router + Leaflet
- `server/`：Express + Vercel AI SDK + DeepSeek（独立后端，3001）

## 常用命令

- 后端开发：`cd server && npm run dev`（tsx watch，端口 3001）
- 前端开发：`cd frontend && npm run dev`（默认 5173，proxy `/api` → 3001）
- 前端构建/预览：`cd frontend && npm run build && npm run preview`（端口 5174）
- 类型检查：`cd frontend && npx vue-tsc -b`；`cd server && npx tsc --noEmit`

## 关键约束

- `server/.env` 保存 `DEEPSEEK_API_KEY`，禁止提交（已 gitignore）。
- 视觉为「编辑杂志风」：米白纸张底、墨色字、墨绿强调 `#1f4d3b`、宋体标题；不要渐变、玻璃拟态、emoji、"AI" 字眼，圆角克制。
- 行程规则：N 天 = N−1 晚；仅 Day1..N−1 以住宿结尾，最后一天以返程结束；同天行程按地理邻近顺路。
- 地图：Leaflet + OpenStreetMap 瓦片；按天分图，图钉数字为当天顺序。
- 联网核验：Nominatim，请求间隔 ≥1s，带 User-Agent；名称匹配不过关时保留模型坐标，避免错标。
- 导出图片：使用离屏的 `#itinerary-export`（全量行程副本），与当前查看的天无关。
- 历史记录：`localStorage`；对话式修改同一份计划时更新同一条记录，只保留调整后的版本。
