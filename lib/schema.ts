import { z } from 'zod';

// 用户在生成前选定的酒店（仅用于请求，不进入行程 JSON）
export const ChosenHotelSchema = z.object({
  name: z.string(),
  location: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  pricePerNight: z.number().optional(),
});
export type ChosenHotel = z.infer<typeof ChosenHotelSchema>;

export const PlanRequestSchema = z.object({
  destination: z.string().min(1).max(80),
  days: z.number().int().min(1).max(14),
  budget: z.object({ currency: z.string().default('CNY'), total: z.number().positive() }),
  travelers: z.object({
    adults: z.number().int().min(1),
    children: z.number().int().min(0).default(0),
    type: z.enum(['family', 'couple', 'solo', 'friends']),
  }),
  preferences: z
    .array(z.enum(['food', 'nature', 'culture', 'shopping', 'relax', 'adventure']))
    .default([]),
  dietary: z.array(z.string()).optional(),
  pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
  // 生成行程前由用户选定的酒店（作为每天行程的锚点）
  hotel: ChosenHotelSchema.optional(),
});

export type PlanRequest = z.infer<typeof PlanRequestSchema>;

// 酒店推荐：模型给出若干候选供用户挑选
export const HotelCandidateSchema = z.object({
  name: z.string(),
  location: z.string(),
  lat: z.number(),
  lng: z.number(),
  pricePerNight: z.number(),
  tags: z.array(z.string()),
  reason: z.string(),
});
export const HotelListSchema = z.object({
  hotels: z.array(HotelCandidateSchema).min(3).max(5),
});
export type HotelCandidate = z.infer<typeof HotelCandidateSchema>;

export const PlanItemSchema = z.object({
  time: z.string(),
  category: z.enum([
    'food',
    'sightseeing',
    'activity',
    'transport',
    'rest',
    'shopping',
    'accommodation',
    'nature',
    'culture',
  ]),
  title: z.string(),
  description: z.string(),
  location: z.string().optional(),
  // 真实地理坐标（WGS84 经纬度），用于地图标点
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  durationMin: z.number().optional(),
  cost: z.number(),
  tips: z.string().optional(),
});

export const DaySchema = z.object({
  day: z.number(),
  theme: z.string(),
  items: z.array(PlanItemSchema),
  dayCost: z.number(),
});

export const PlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  days: z.array(DaySchema),
  budgetBreakdown: z.object({
    accommodation: z.number(),
    food: z.number(),
    transport: z.number(),
    tickets: z.number(),
    shopping: z.number(),
    misc: z.number(),
  }),
  tips: z.array(z.string()),
  packing: z.array(z.string()).optional(),
  // 对话模式下由模型填写：本次调整的中文简述（仅 refine 使用，generate 时为空）
  reply: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;

// 对话消息
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// 对话改行程请求：当前行程 + 历史消息
// 注意：plan 采用宽松校验（z.any），因为模型上一轮可能产出略偏离枚举的值
// （如 category 不在标准集合内），直接严格校验会导致「对话改行程」反复失败。
export const PlanRefineRequestSchema = z.object({
  plan: z.any(),
  messages: z.array(ChatMessageSchema).min(1),
});
export type PlanRefineRequest = z.infer<typeof PlanRefineRequestSchema>;

export const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  food: { label: '美食', emoji: '🍜', color: 'bg-amber-100 text-amber-700' },
  sightseeing: { label: '观光', emoji: '📸', color: 'bg-sky-100 text-sky-700' },
  activity: { label: '活动', emoji: '🎯', color: 'bg-violet-100 text-violet-700' },
  transport: { label: '交通', emoji: '🚆', color: 'bg-slate-100 text-slate-700' },
  rest: { label: '休息', emoji: '☕', color: 'bg-emerald-100 text-emerald-700' },
  shopping: { label: '购物', emoji: '🛍️', color: 'bg-pink-100 text-pink-700' },
  accommodation: { label: '住宿', emoji: '🏨', color: 'bg-teal-100 text-teal-700' },
  nature: { label: '自然', emoji: '🌿', color: 'bg-green-100 text-green-700' },
  culture: { label: '人文', emoji: '🏛️', color: 'bg-orange-100 text-orange-700' },
};
