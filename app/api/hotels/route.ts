import { generateObject } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { PlanRequestSchema, HotelListSchema } from '@/lib/schema';
import { HOTEL_SYSTEM_PROMPT, buildHotelPrompt } from '@/lib/prompt';

export const maxDuration = 60;

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

export async function POST(req: Request) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return Response.json(
      { error: '服务端未配置 DEEPSEEK_API_KEY，请在 .env.local 或 Vercel 环境变量中设置。' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: '参数校验失败', issues: parsed.error.issues }, { status: 400 });
  }

  const result = await generateObject({
    model: deepseek('deepseek-chat'),
    schema: HotelListSchema,
    system: HOTEL_SYSTEM_PROMPT,
    prompt: buildHotelPrompt(parsed.data),
  });

  return Response.json(result.object);
}
