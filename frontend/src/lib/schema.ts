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
  hotelRequirement: z.string().max(300).optional(),
  hotel: ChosenHotelSchema.optional(),
});

export type PlanRequest = z.infer<typeof PlanRequestSchema>;

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
  reply: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanItem = z.infer<typeof PlanItemSchema>;
export type Day = z.infer<typeof DaySchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const PlanRefineRequestSchema = z.object({
  plan: z.any(),
  messages: z.array(ChatMessageSchema).min(1),
});
export type PlanRefineRequest = z.infer<typeof PlanRefineRequestSchema>;
