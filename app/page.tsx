'use client';

import { useEffect, useRef, useState } from 'react';
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

// ---- 分享链接（URL hash 零配置方案）----
// 把行程 JSON 编码进地址栏 #plan= 片段，打开链接即可只读还原，无需后端存储。
// 行程含中文，必须走 UTF-8 安全的 base64。
function encodePlanToHash(plan: object): string {
  const json = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function decodePlanFromHash(encoded: string): Plan | null {
  try {
    const bin = atob(encoded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as Plan;
  } catch {
    return null;
  }
}

function readPlanFromHash(): Plan | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/[#&]plan=([^&]+)/);
  if (!m) return null;
  return decodePlanFromHash(decodeURIComponent(m[1]));
}

// 会话级持久化 key：刷新页面后恢复行程与对话
const STORAGE_PLAN = 'tripgen:plan';
const STORAGE_CHAT = 'tripgen:chat';

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
  const [chatHint, setChatHint] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');

  // 生成前的酒店挑选流程
  const [lastRequest, setLastRequest] = useState<PlanRequest | null>(null);
  const [hotels, setHotels] = useState<HotelCandidate[] | null>(null);
  const [chosenHotel, setChosenHotel] = useState<ChosenHotel | null>(null);
  const [isLoadingHotels, setIsLoadingHotels] = useState(false);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [hotelReqInput, setHotelReqInput] = useState('');

  const { object, submit, isLoading, error } = useObject({
    api: '/api/plan',
    schema: PlanSchema,
    onFinish: ({ object }) => {
      // 对话模式下，模型会把本次调整说明写入 reply
      if (object?.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: object.reply as string }]);
      }
      // 存下最终行程，页面刷新后可恢复，避免移动端刷新丢失整个会话
      if (object) {
        try {
          sessionStorage.setItem(STORAGE_PLAN, JSON.stringify(object));
        } catch {
          // sessionStorage 不可用时忽略
        }
      }
    },
  });

  // 挂载后从 sessionStorage 恢复行程与对话（不在首屏渲染中读取，避免 SSR 水合不一致）
  const [restoredPlan, setRestoredPlan] = useState<Plan | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  useEffect(() => {
    try {
      // 优先：地址栏里带 #plan= 说明是别人分享的链接，直接还原展示
      const shared = readPlanFromHash();
      if (shared) {
        setRestoredPlan(shared);
        setIsSharedView(true);
        return;
      }
      const savedPlan = sessionStorage.getItem(STORAGE_PLAN);
      if (savedPlan) setRestoredPlan(JSON.parse(savedPlan));
      const savedChat = sessionStorage.getItem(STORAGE_CHAT);
      if (savedChat) setMessages(JSON.parse(savedChat));
    } catch {
      // 恢复失败（数据损坏等）时静默忽略
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_CHAT, JSON.stringify(messages));
    } catch {
      // sessionStorage 不可用时忽略
    }
  }, [messages]);

  // 展示/对话用行程：优先用流式生成中的 object，刷新后回退到恢复的行程
  const plan = object ?? restoredPlan;

  // 人均每晚房价：按本次出行总人数（成人 + 儿童）折算，至少按 1 人避免除零
  const hotelPeople = Math.max(
    (lastRequest?.travelers.adults ?? adults) + (lastRequest?.travelers.children ?? children),
    1,
  );

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
    setHotelReqInput('');
    // 开始新生成时清掉旧行程的本地缓存
    setRestoredPlan(null);
    setIsSharedView(false);
    setShareCopied(false);
    try {
      sessionStorage.removeItem(STORAGE_PLAN);
    } catch {
      // sessionStorage 不可用时忽略
    }
    // 清掉地址栏里的分享片段，避免刷新后又跳回别人的行程
    if (typeof window !== 'undefined' && window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // 先让用户挑选酒店，再据此生成以酒店为锚点的顺路行程
    fetchHotels(payload);
  }

  function fetchHotels(payload: PlanRequest) {
    setHotels(null);
    setHotelError(null);
    setIsLoadingHotels(true);
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

  // 选酒店阶段也能输入要求：带着要求重新推荐酒店（要求会一并用于后续行程生成）
  function handleHotelRequirement(e: React.FormEvent) {
    e.preventDefault();
    const text = hotelReqInput.trim();
    if (!text || !lastRequest || isLoadingHotels) return;
    const nextRequest: PlanRequest = { ...lastRequest, hotelRequirement: text };
    setLastRequest(nextRequest);
    fetchHotels(nextRequest);
  }

  function chooseHotel(h: HotelCandidate) {
    if (!lastRequest) {
      // 页面刷新会重置内存状态，此时酒店卡片不应再展示；给出提示引导重新生成
      setHotelError('页面状态已重置，请重新点击「生成行程」');
      setHotels(null);
      return;
    }
    setChosenHotel(h);
    submit({ ...lastRequest, hotel: h });
  }

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isLoading) return;
    if (!plan) {
      setChatHint('还没有行程可调整，请先点击「生成行程」生成一份行程');
      return;
    }
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setChatInput('');
    setChatHint(null);
    // 把当前行程 + 完整对话历史发给后端，流式返回更新后的完整行程
    submit({ plan, messages: nextMessages });
  }

  // 生成「可分享链接」：把当前行程编码进地址栏片段，复制完整 URL 给朋友
  function handleShare() {
    if (!plan) return;
    const encoded = encodePlanToHash(plan);
    const url = `${window.location.origin}/#plan=${encodeURIComponent(encoded)}`;
    // 链接过长时多数浏览器仍可用，但稳妥起见给出提示
    if (url.length > 60000) {
      window.prompt('行程较大，链接可能偏长，可手动复制：', url);
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => setShareCopied(true))
      .catch(() => {
        // 剪贴板被禁用时退化为弹窗手动复制
        window.prompt('复制下面的分享链接：', url);
      });
    window.setTimeout(() => setShareCopied(false), 4000);
  }

  // 把行程区域截成 PNG：截图前临时隐藏「按钮行/视图切换」并切到列表视图，截完还原
  async function handleDownloadImage() {
    if (!plan || !resultRef.current || isExporting) return;
    setIsExporting(true);
    const prevView = view;
    try {
      if (prevView !== 'list') {
        setView('list');
        // 等 React 重渲染出列表内容
        await new Promise((r) => setTimeout(r, 120));
      }
      if (resultRef.current && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // 字体等待失败不阻断导出
        }
      }
      // 动态加载，避免 SSR 阶段引入浏览器专属代码
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(resultRef.current as HTMLDivElement, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        // 隐藏带 data-no-export 的节点（按钮、视图切换条），保证导出图干净
        filter: (node) =>
          !(
            node instanceof HTMLElement &&
            node.dataset?.noExport === 'true'
          ),
      });
      const safeTitle = (plan.title ?? 'tripgen').replace(/[\\/:*?"<>|]/g, '');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `途灵行程-${safeTitle}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      window.alert('导出图片失败，请重试：' + String((err as Error)?.message ?? err));
    } finally {
      if (prevView !== 'list') setView(prevView);
      setIsExporting(false);
    }
  }

  const budget = plan?.budgetBreakdown;
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

            {isSharedView && (
              <div className="mb-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">
                这是别人分享给你的行程。想自己做一份？点左侧「生成行程」即可，下面还能直接对话微调。
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.location.hash) {
                      history.replaceState(null, '', window.location.pathname + window.location.search);
                    }
                    setIsSharedView(false);
                    setRestoredPlan(null);
                  }}
                  className="ml-2 font-semibold underline"
                >
                  清除分享态
                </button>
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

            {hotels && !isLoadingHotels && !plan && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-600">
                  为你找到 {hotels.length} 家合适酒店（价格按 {hotelPeople} 人分摊），选一家作为每天行程的落脚点：
                </p>
                <form onSubmit={handleHotelRequirement} className="flex gap-2">
                  <input
                    value={hotelReqInput}
                    onChange={(e) => setHotelReqInput(e.target.value)}
                    placeholder="对酒店还有要求？如：离地铁站近、要亲子房"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingHotels || !hotelReqInput.trim()}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                  >
                    按此重新推荐
                  </button>
                </form>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hotels.map((h, i) => (
                    <div key={i} className="flex flex-col rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-gray-800">{h.name}</span>
                        <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          ¥{Math.round(h.pricePerNight / hotelPeople)}/人·晚
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {h.location} · 整间 ¥{h.pricePerNight}/晚
                      </p>
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

            {!plan && !isLoading && !isLoadingHotels && !hotels && !hotelError && (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-gray-400">
                <div className="text-6xl">🗺️</div>
                <p className="mt-3">填写左边表单，点击「生成行程」试试看</p>
              </div>
            )}

            {isLoading && !plan && (
              <div className="flex h-full min-h-[300px] items-center justify-center text-indigo-500">
                <span className="animate-pulse">途灵正在为你规划…</span>
              </div>
            )}

            {plan && (
              <div ref={resultRef} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{plan.title ?? '行程标题…'}</h2>
                  <p className="mt-1 text-sm text-gray-500">{plan.summary ?? ''}</p>
                  {chosenHotel && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                      🏨 落脚点：{chosenHotel.name}
                    </p>
                  )}
                  <div data-no-export="true" className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleShare}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                    >
                      🔗 复制分享链接
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      disabled={isExporting}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                    >
                      {isExporting ? '导出中…' : '📷 存为图片'}
                    </button>
                    {shareCopied && (
                      <span className="text-sm font-medium text-emerald-600">
                        ✓ 链接已复制，发给朋友即可打开
                      </span>
                    )}
                  </div>
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
                <div data-no-export="true" className="flex gap-2">
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
                  plan.days?.map((d) => (
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
                  <TripMap days={plan.days as Plan['days']} />
                )}

                {plan.tips && plan.tips.length > 0 && (
                  <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                    <div className="font-semibold">贴心提示</div>
                    <ul className="mt-1 list-disc pl-5">
                      {plan.tips.map((t, i) => (
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
                onChange={(e) => {
                  setChatInput(e.target.value);
                  if (chatHint) setChatHint(null);
                }}
                disabled={isLoading}
                placeholder={plan ? '说点什么来改行程…' : '先生成行程，之后可在这里对话调整'}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-indigo-400 disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={isLoading || !chatInput.trim()}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition hover:opacity-95 disabled:opacity-50"
              >
                发送
              </button>
            </form>
            {chatHint && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{chatHint}</p>
            )}
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
