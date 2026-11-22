// 类别文案与列表配色（编辑风：低饱和中性色，去 emoji 与彩虹色）
export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  food: { label: '美食', color: 'bg-stone-100 text-stone-700' },
  sightseeing: { label: '观光', color: 'bg-stone-100 text-stone-700' },
  activity: { label: '活动', color: 'bg-stone-100 text-stone-700' },
  transport: { label: '交通', color: 'bg-stone-100 text-stone-700' },
  rest: { label: '休息', color: 'bg-stone-100 text-stone-700' },
  shopping: { label: '购物', color: 'bg-stone-100 text-stone-700' },
  accommodation: { label: '住宿', color: 'bg-stone-100 text-stone-700' },
  nature: { label: '自然', color: 'bg-stone-100 text-stone-700' },
  culture: { label: '人文', color: 'bg-stone-100 text-stone-700' },
};

// 地图图钉使用的实色（Leaflet DivIcon 需要内联样式，无法用 Tailwind 类）
export const CAT_HEX: Record<string, string> = {
  food: '#8a6d3b',
  sightseeing: '#5b7a8a',
  activity: '#6b5b78',
  transport: '#7a8a9a',
  rest: '#5f7a68',
  shopping: '#9a5b4f',
  accommodation: '#1f4d3b',
  nature: '#5f7a68',
  culture: '#8a6d3b',
};

export const PREF_OPTIONS = [
  { value: 'food', label: '美食' },
  { value: 'nature', label: '自然' },
  { value: 'culture', label: '人文' },
  { value: 'shopping', label: '购物' },
  { value: 'relax', label: '休闲' },
  { value: 'adventure', label: '探险' },
] as const;

export const TYPE_OPTIONS = [
  { value: 'couple', label: '情侣' },
  { value: 'family', label: '亲子' },
  { value: 'solo', label: '独自' },
  { value: 'friends', label: '朋友' },
] as const;

export const PACE_OPTIONS = [
  { value: 'relaxed', label: '轻松' },
  { value: 'balanced', label: '均衡' },
  { value: 'packed', label: '紧凑' },
] as const;

// 预算条用低饱和色，避免彩虹感
export const BUDGET_COLORS = ['#1f4d3b', '#8a6d3b', '#7a8a9a', '#9a5b4f', '#6b5b78', '#9b978c'];

export const LABELS: Record<string, string> = {
  accommodation: '住宿',
  food: '餐饮',
  transport: '交通',
  tickets: '门票',
  shopping: '购物',
  misc: '其他',
};

export type TravelerType = (typeof TYPE_OPTIONS)[number]['value'];
export type Pace = (typeof PACE_OPTIONS)[number]['value'];
