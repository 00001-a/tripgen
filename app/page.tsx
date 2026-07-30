'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useObject } from '@ai-sdk/react';
import { PlanSchema, CATEGORY_META, type PlanRequest, type ChatMessage, type Plan, type HotelCandidate, type ChosenHotel } from '@/lib/schema';

// Leaflet 依赖浏览器全局对象，仅在客户端加载（关闭 SSR 预渲染）
const TripMap = dynamic(() => import('./TripMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center rounded-2xl bg-gray-50 text-sm text-gray-400">
      地图加载中…
    </div>
  ),
});

const PREF_OPTIONS = [
  { value: 'food', label: '美食', emoji: '🍜' },
  { value: 'nature', label: '自然', emoji: '🌿' },
  { value: 'culture', label: '人文', emoji: '🏛️' },
  { value: 'shopping', label: '购物', emoji: '🛍️' },
  { value: 'relax', label: '休闲', emoji: '🏖️' },
  { value: 'adventure', label: '探险', emoji: '🧗' },
] as const;

const TYPE_OPTIONS = [
  { value: 'couple', label: '情侣' },
  { value: 'family', label: '亲子' },
  { value: 'solo', label: '独自' },
  { value: 'friends', label: '朋友' },
] as const;

const PACE_OPTIONS = [
  { value: 'relaxed', label: '轻松' },
  { value: 'balanced', label: '均衡' },
  { value: 'packed', label: '紧凑' },
] as const;

const BUDGET_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4'];

export default function Home() {
  const [destination, setDestination] = useState('日本东京');
  const [days, setDays] = useState(5);
  const [budgetTotal, setBudgetTotal] = useState(8000);
  const [travelerType, setTravelerType] = useState<(typeof TYPE_OPTIONS)[number]['value']>('couple');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [preferences, setPreferences] = useState<string[]>(['food', 'culture']);
  const [pace, setPace] = useState<(typeof PACE_OPTIONS)[number]['value']>('balanced');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');

  // 生成前的酒店挑选流程
  const [lastRequest, setLastRequest] = useState<PlanRequest | null>(null);
  const [hotels, setHotels] = useState<HotelCandidate[] | null>(null);
  const [chosenHotel, setChosenHotel] = useState<ChosenHotel | null>(null);
  const [isLoadingHotels, setIsLoadingHotels] = useState(false);
  const [hotelError, setHotelError] = useState<string | null>(null);

  const { object, submit, isLoading, error } = useObject({
    api: '/api/plan',
    schema: PlanSchema,
    onFinish: ({ object }) => {
      // 对话模式下，模型会把本次调整说明写入 reply
      if (object?.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: object.reply as string }]);
      }
    },
  });

  function togglePref(v: string) {
    setPreferences((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: PlanRequest = {
      destination,
      days: Number(days),
      budget: { currency: 'CNY', total: Number(budgetTotal) },
      travelers: { adults: Number(adults), children: Number(children), type: travelerType },
      preferences: preferences as PlanRequest['preferences'],
      pace,
    };
    setLastRequest(payload);
    setMessages([]);
    setChosenHotel(null);
    setHotels(null);
    setHotelError(null);
    setIsLoadingHotels(true);

    // 先让用户挑选酒店，再据此生成以酒店为锚点的顺路行程
    fetch('/api/hotels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsLoadingHotels(false);
        if (data?.error) {
          setHotelError(typeof data.error === 'string' ? data.error : '酒店推荐失败');
          return;
        }
        if (Array.isArray(data?.hotels) && data.hotels.length > 0) {
          setHotels(data.hotels);
        } else {
          setHotelError('没有找到合适的酒店，请调整条件后重试');
        }
      })
      .catch(() => {
        setIsLoadingHotels(false);
        setHotelError('酒店推荐请求失败，请重试');
      });
  }

  function chooseHotel(h: HotelCandidate) {
    if (!lastRequest) return;
    setChosenHotel(h);
    submit({ ...lastRequest, hotel: h });
  }

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isLoading || !object) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setChatInput('');
    // 把当前行程 + 完整对话历史发给后端，流式返回更新后的完整行程
    submit({ plan: object, messages: nextMessages });
  }

  const budget = object?.budgetBreakdown;
  const budgetTotalActual = budget
    ? Object.values(budget).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <header className="mb-8 text-center">
          <h1 className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
            途灵 TripGen
          </h1>
          <p className="mt-2 text-gray-500">输入需求，30 秒生成可分享的旅行行程 ✈️</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          {/* 表单 */}
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-3xl border border-white bg-white/80 p-6 shadow-xl shadow-indigo-100 backdrop-blur"
          >
            <Field label="目的地">
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-indigo-400"
                placeholder="例如：日本东京"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="天数">
                <NumberInput value={days} onChange={setDays} min={1} max={14} />
              </Field>
              <Field label="总预算(¥)">
                <NumberInput value={budgetTotal} onChange={setBudgetTotal} min={500} step={500} />
              </Field>
            </div>

            <Field label="出行人群">
              <Segmented options={TYPE_OPTIONS} value={travelerType} onChange={setTravelerType} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="成人">
                <NumberInput value={adults} onChange={setAdults} min={1} max={20} />
              </Field>
              <Field label="儿童">
                <NumberInput value={children} onChange={setChildren} min={0} max={10} />
              </Field>
            </div>

            <Field label="兴趣偏好">
              <div className="flex flex-wrap gap-2">
                {PREF_OPTIONS.map((o) => {
                  const active = preferences.includes(o.value);
                  return (
                    <button
                      type="button"
                      key={o.value}
                      onClick={() => togglePref(o.value)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {o.emoji} {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="节奏">
              <Segmented options={PACE_OPTIONS} value={pace} onChange={setPace} />
            </Field>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-pink-500 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition hover:opacity-95 disabled:opacity-60"
            >
              {isLoading ? '生成中…' : '🚀 生成行程'}
            </button>
          </form>

          {/* 结果 */}
          <section className="rounded-3xl border border-white bg-white/80 p-6 shadow-xl shadow-indigo-100 backdrop-blur">
            {error && (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
                出错了：{String((error as Error)?.message ?? error)}
              </div>
            )}

            {/* 酒店挑选阶段（生成行程之前） */}
            {isLoadingHotels && (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-indigo-500">
                <div className="text-5xl">🏨</div>
                <p className="mt-3 animate-pulse">途灵正在为你推荐合适的酒店…</p>
              </div>
            )}

            {hotelError && !isLoadingHotels && (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
                酒店推荐失败：{hotelError}
              </div>
            )}

            {hotels && !isLoadingHotels && !object && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-600">
                  为你找到 {hotels.length} 家合适酒店，选一家作为每天行程的落脚点：
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hotels.map((h, i) => (
                    <div key={i} className="flex flex-col rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-gray-800">{h.name}</span>
                        <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          ¥{h.pricePerNight}/晚
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{h.location}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {h.tags.map((t, ti) => (
                          <span key={ti} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">💡 {h.reason}</p>
                      <button
                        type="button"
                        onClick={() => chooseHotel(h)}
                        disabled={isLoading}
                        className="mt-3 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-500 py-2 text-sm font-semibold text-white shadow shadow-pink-200 transition hover:opacity-95 disabled:opacity-60"
                      >
                        {isLoading ? '生成中…' : '用这家生成行程'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!object && !isLoading && !isLoadingHotels && !hotels && !hotelError && (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-gray-400">
                <div className="text-6xl">🗺️</div>
                <p className="mt-3">填写左边表单，点击「生成行程」试试看</p>
              </div>
            )}

            {isLoading && !object && (
              <div className="flex h-full min-h-[300px] items-center justify-center text-indigo-500">
                <span className="animate-pulse">途灵正在为你规划…</span>
              </div>
            )}

            {object && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{object.title ?? '行程标题…'}</h2>
                  <p className="mt-1 text-sm text-gray-500">{object.summary ?? ''}</p>
                  {chosenHotel && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                      🏨 落脚点：{chosenHotel.name}
                    </p>
                  )}
                </div>

                {budget && (
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-600">
                      <span>预算分配</span>
                      <span>¥{budgetTotalActual.toLocaleString()}</span>
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full">
                      {Object.entries(budget).map(([k, v], i) => (
                        <div
                          key={k}
                          style={{
                            width: `${budgetTotalActual ? (v / budgetTotalActual) * 100 : 0}%`,
                            background: BUDGET_COLORS[i % BUDGET_COLORS.length],
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-gray-500">
                      {Object.entries(budget).map(([k, v], i) => (
                        <span key={k} className="flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: BUDGET_COLORS[i % BUDGET_COLORS.length] }}
                          />
                          {LABELS[k] ?? k} ¥{v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 视图切换：行程列表 / 卡通地图 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      view === 'list'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    📋 行程
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('map')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      view === 'map'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    🗺️ 地图
                  </button>
                </div>

                {view === 'list' ? (
                  object.days?.map((d) => (
                    <div key={d?.day} className="rounded-2xl border border-gray-100 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
                          Day {d?.day}
                        </span>
                        <span className="font-medium text-gray-700">{d?.theme ?? ''}</span>
                        <span className="ml-auto text-sm text-gray-400">¥{d?.dayCost ?? '—'}</span>
                      </div>
                      <ul className="space-y-2">
                        {d?.items?.map((it, idx) => {
                          const cat = it?.category ?? 'sightseeing';
                          const meta = CATEGORY_META[cat];
                          const catEmoji = meta?.emoji ?? '📍';
                          const catLabel = meta?.label ?? cat;
                          const catColor = meta?.color ?? 'bg-gray-100 text-gray-600';
                          return (
                            <li key={idx} className="flex gap-3">
                              <span className="w-12 shrink-0 text-sm font-medium text-gray-400">
                                {it?.time}
                              </span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-xs font-medium ${catColor}`}
                              >
                                {catEmoji} {catLabel}
                              </span>
                              <div className="text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gray-800">{it?.title}</span>
                                  {it?.cost != null && (
                                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                      💰 ¥{it.cost}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-xs text-gray-400">
                                  支出类型：{catLabel} · 具体：{it?.title}
                                </div>
                                <div className="text-gray-500">{it?.description}</div>
                                {it?.tips && (
                                  <div className="text-xs text-indigo-500">💡 {it.tips}</div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                ) : (
                  <TripMap days={object.days as Plan['days']} />
                )}

                {object.tips && object.tips.length > 0 && (
                  <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                    <div className="font-semibold">贴心提示</div>
                    <ul className="mt-1 list-disc pl-5">
                      {object.tips.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 对话调整 */}
          <section className="flex h-[600px] flex-col rounded-3xl border border-white bg-white/80 p-6 shadow-xl shadow-indigo-100 backdrop-blur lg:col-span-2 xl:col-span-1 xl:h-[80vh]">
            <h3 className="mb-3 text-lg font-bold text-gray-800">💬 对话调整行程</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 && !isLoading && (
                <p className="text-sm text-gray-400">
                  先生成行程，然后在这里说「把第二天的购物改成博物馆」「预算压缩到 6000」「多加几个亲子项目」之类的需求，途灵会实时改好行程。
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                  <span
                    className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {m.content}
                  </span>
                </div>
              ))}
              {isLoading && (
                <div className="text-left text-sm text-indigo-500">
                  <span className="animate-pulse">途灵正在调整行程…</span>
                </div>
              )}
            </div>
            <form onSubmit={handleChatSubmit} className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={!object || isLoading}
                placeholder={object ? '说点什么来改行程…' : '先生成行程后再对话'}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={!object || isLoading || !chatInput.trim()}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition hover:opacity-95 disabled:opacity-50"
              >
                发送
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

const LABELS: Record<string, string> = {
  accommodation: '住宿',
  food: '餐饮',
  transport: '交通',
  tickets: '门票',
  shopping: '购物',
  misc: '其他',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-indigo-400"
    />
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${
            value === o.value
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
