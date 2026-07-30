import { streamObject } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { PlanSchema, PlanRequestSchema, PlanRefineRequestSchema } from '@/lib/schema';
import { SYSTEM_PROMPT, buildUserPrompt, REFINE_SYSTEM_PROMPT, buildRefinePrompt } from '@/lib/prompt';

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

  // 对话改行程模式：body 含 plan + messages
  if (Array.isArray(body.messages) && body.plan) {
    const parsed = PlanRefineRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: '对话请求校验失败', issues: parsed.error.issues }, { status: 400 });
    }
    const result = streamObject({
      model: deepseek('deepseek-chat'),
      schema: PlanSchema,
      system: REFINE_SYSTEM_PROMPT,
      prompt: buildRefinePrompt(parsed.data.plan, parsed.data.messages),
    });
    return result.toTextStreamResponse();
  }

  // 初始生成模式
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: '参数校验失败', issues: parsed.error.issues }, { status: 400 });
  }

  const result = streamObject({
    model: deepseek('deepseek-chat'),
    schema: PlanSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(parsed.data, parsed.data.hotel),
  });

  return result.toTextStreamResponse();
}
