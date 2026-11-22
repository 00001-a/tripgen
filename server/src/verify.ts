// 联网核验：用 OpenStreetMap Nominatim 把行程地点核成真实 POI（坐标/地址/营业时间）
// 遵循 Nominatim 使用政策：单线程、请求间隔 ≥1s、带 User-Agent

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'TripGen/1.0 (travel planner; local deployment)';
const MIN_INTERVAL_MS = 1150;

export interface VerifyItem {
  id: string;
  title: string;
  location?: string;
  category?: string;
}

export interface VerifyOutcome {
  id: string;
  lat: number;
  lng: number;
  verified: boolean;
  name?: string;
  address?: string;
  openTime?: string;
  website?: string;
  phone?: string;
  provider: 'osm';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 全局请求节流：任何两次 Nominatim 请求之间至少间隔 1.15s
let lastRequestAt = 0;
async function rateLimit(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// 去掉括号补充说明和“入住/休息/返程”这类无地点含义的词
function cleanTitle(raw: string): string {
  return raw
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/(入住休息|办理入住|入住|退房|离店|休息|返程|出发|抵达|用餐)/g, ' ')
    .replace(/[·\-—:：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s·\-—_:：,，.。()（）'"]/g, '');
}

// 候选与标题的匹配度：3 = 名称完全相同，2 = 名称互相包含，1 = 地址串包含，0 = 不相关
function score(title: string, hit: Record<string, unknown>): number {
  const t = norm(title);
  if (!t) return 0;
  const name = norm(hit.name);
  if (name && name === t) return 3;
  if (name && (name.includes(t) || t.includes(name))) return 2;
  if (norm(hit.display_name).includes(t)) return 1;
  return 0;
}

const SUFFIXES = [
  '风景区',
  '景区',
  '公园',
  '乐园',
  '广场',
  '步行街',
  '博物馆',
  '美术馆',
  '纪念馆',
  '教堂',
  '寺',
  '庙',
  '岛',
  '半岛',
];

// 名称太具体搜不到时，去掉“公园/博物馆/岛”等通用后缀再试（如“沙面岛”→“沙面”）
function stripSuffix(title: string): string {
  for (const s of SUFFIXES) {
    if (title.endsWith(s) && title.length - s.length >= 2) {
      return title.slice(0, -s.length).trim();
    }
  }
  return '';
}

function pickAddress(address: unknown, displayName?: string): string | undefined {
  if (address && typeof address === 'object') {
    const a = address as Record<string, unknown>;
    const parts = [
      a.city ?? a.town ?? a.village ?? a.county ?? a.state,
      a.district ?? a.suburb ?? a.city_district,
      a.road ?? a.pedestrian ?? a.neighbourhood,
      a.house_number,
    ]
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
      .filter((x, i, arr) => arr.indexOf(x) === i);
    if (parts.length) return parts.join(' ');
  }
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.split(',').slice(0, 4).join(',').trim();
  }
  return undefined;
}

async function queryBest(
  id: string,
  title: string,
  destination: string,
): Promise<VerifyOutcome | null> {
  if (!title) return null;
  const q = [title, cleanTitle(destination)].filter(Boolean).join(' ').trim();
  if (!q) return null;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('accept-language', 'zh-CN,zh,en');

  await rateLimit();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return null;

  const data: unknown = await res.json();
  const list = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (!list.length) return null;

  // 选名称匹配度最高的候选；完全不相关就放弃（保留模型给的坐标），避免错标
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  for (const h of list) {
    const s = score(title, h);
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }
  if (!best || bestScore < 2) return null;

  const lat = Number(best.lat);
  const lng = Number(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const extra = (best.extratags ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  return {
    id,
    lat,
    lng,
    verified: true,
    name: str(best.name) ?? str(best.display_name)?.split(',')[0]?.trim(),
    address: pickAddress(best.address, str(best.display_name)),
    openTime: str(extra.opening_hours),
    website: str(extra.website),
    phone: str(extra.phone),
    provider: 'osm',
  };
}

async function queryOne(destination: string, item: VerifyItem): Promise<VerifyOutcome | null> {
  const title = cleanTitle(item.title);
  if (!title) return null;

  const direct = await queryBest(item.id, title, destination);
  if (direct) return direct;

  const short = stripSuffix(title);
  if (short && short !== title) {
    return queryBest(item.id, short, destination);
  }
  return null;
}

export async function verifyItems(
  destination: string,
  items: VerifyItem[],
): Promise<{ provider: 'osm'; results: VerifyOutcome[] }> {
  const results: VerifyOutcome[] = [];
  for (const item of items) {
    try {
      const r = await queryOne(destination, item);
      if (r) results.push(r);
    } catch {
      // 单点失败不影响其他点
    }
  }
  return { provider: 'osm', results };
}
