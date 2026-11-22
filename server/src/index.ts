import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Response } from 'express';
import express from 'express';
import { generateObject, streamObject } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import {
  PlanSchema,
  PlanRequestSchema,
  PlanRefineRequestSchema,
  HotelListSchema,
} from './schema.js';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  REFINE_SYSTEM_PROMPT,
  buildRefinePrompt,
  HOTEL_SYSTEM_PROMPT,
  buildHotelPrompt,
} from './prompt.js';
import { verifyItems } from './verify.js';

// 加载 server/.env 中的 DEEPSEEK_API_KEY
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(__dirname, '../.env'));
} catch {
  // .env 不存在时忽略，由下方接口返回明确错误
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// 允许前端跨域调用（开发期 Vite 代理其实用不到，这里兜底）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

const NO_KEY = { error: '服务端未配置 DEEPSEEK_API_KEY，请在 server/.env 中设置。' };

// 把 AI SDK 的文本流响应原样转发给客户端
async function pipeStream(res: Response, response: globalThis.Response): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', response.headers.get('content-type') ?? 'text/plain; charset=utf-8');
  const body = response.body;
  if (!body) {
    res.end();
    return;
  }
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch {
    res.end();
  }
}

app.post('/api/hotels', async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    res.status(500).json(NO_KEY);
    return;
  }
  const parsed = PlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '参数校验失败', issues: parsed.error.issues });
    return;
  }
  try {
    const result = await generateObject({
      model: deepseek('deepseek-chat'),
      schema: HotelListSchema,
      system: HOTEL_SYSTEM_PROMPT,
      prompt: buildHotelPrompt(parsed.data),
    });
    res.json(result.object);
  } catch (e) {
    res.status(500).json({ error: '酒店推荐失败', detail: String((e as Error)?.message ?? e) });
  }
});

app.post('/api/plan', async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    res.status(500).json(NO_KEY);
    return;
  }

  // 对话改行程模式：body 含 plan + messages
  if (Array.isArray(req.body?.messages) && req.body?.plan) {
    const parsed = PlanRefineRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '对话请求校验失败', issues: parsed.error.issues });
      return;
    }
    const result = streamObject({
      model: deepseek('deepseek-chat'),
      schema: PlanSchema,
      system: REFINE_SYSTEM_PROMPT,
      prompt: buildRefinePrompt(parsed.data.plan, parsed.data.messages),
    });
    await pipeStream(res, result.toTextStreamResponse());
    return;
  }

  // 初始生成模式
  const parsed = PlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '参数校验失败', issues: parsed.error.issues });
    return;
  }
  const result = streamObject({
    model: deepseek('deepseek-chat'),
    schema: PlanSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(parsed.data, parsed.data.hotel),
  });
  await pipeStream(res, result.toTextStreamResponse());
});

// 联网核验地点：OSM Nominatim（无需 Key）
app.post('/api/verify', async (req, res) => {
  const destination = String(req.body?.destination ?? '').slice(0, 80);
  const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items.slice(0, 25) : [];
  const items = rawItems
    .map((x) => {
      const it = (x ?? {}) as Record<string, unknown>;
      return {
        id: String(it.id ?? '').slice(0, 40),
        title: String(it.title ?? '').slice(0, 100),
        location: String(it.location ?? '').slice(0, 160),
        category: String(it.category ?? '').slice(0, 40),
      };
    })
    .filter((x) => x.id && x.title);

  if (!items.length) {
    res.json({ provider: 'osm', results: [] });
    return;
  }

  try {
    const out = await verifyItems(destination, items);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: '联网核验失败', detail: String((e as Error)?.message ?? e) });
  }
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`tripgen-server listening on http://localhost:${PORT}`);
});
