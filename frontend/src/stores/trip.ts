import { ref, computed, watch } from 'vue';
import { defineStore } from 'pinia';
import { useObject } from '@ai-sdk/vue';
import {
  PlanSchema,
  type PlanRequest,
  type ChatMessage,
  type HotelCandidate,
  type ChosenHotel,
  type Plan,
} from '../lib/schema';
import type { TravelerType, Pace } from '../lib/constants';

const STORAGE_PLAN = 'tripgen:plan';
const STORAGE_CHAT = 'tripgen:chat';
const STORAGE_HISTORY = 'tripgen:history';

export interface VerifyResult {
  id: string;
  lat: number;
  lng: number;
  verified: boolean;
  name?: string;
  address?: string;
  openTime?: string;
  website?: string;
  phone?: string;
  provider?: string;
}

// 智能体执行轨迹的一步（生成 / 核验 / 修正 / 复核）
export interface AgentStep {
  key: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  detail?: string;
}

// 工具反馈：联网核验未通过的地点，回传给模型修正
export interface PlanIssue {
  day: number;
  index: number;
  title: string;
  reason: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  destination: string;
  days: number;
  createdAt: number;
  updatedAt: number;
  plan: Plan;
  verify?: Record<string, VerifyResult>;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (raw) return JSON.parse(raw) as HistoryEntry[];
  } catch {
    // ignore
  }
  return [];
}

function persistHistory(list: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function newId(): string {
  const now = Date.now();
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${now}-${Math.random().toString(36).slice(2)}`;
}

// 行程序列化为 URL hash（UTF-8 base64，URL 安全）
function encodePlan(plan: Plan): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodePlan(encoded: string): Plan | null {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Plan;
  } catch {
    return null;
  }
}

function readPlanFromHash(): Plan | null {
  const h = window.location.hash;
  if (!h.startsWith('#p=')) return null;
  return decodePlan(h.slice(3));
}

export const useTripStore = defineStore('trip', () => {
  // ---------- 表单 ----------
  const destination = ref('');
  const days = ref('');
  const budgetTotal = ref('');
  const travelerType = ref<TravelerType | ''>('');
  const adults = ref('');
  const children = ref('');
  const preferences = ref<string[]>([]);
  const pace = ref<Pace | ''>('');
  const hotelReqInput = ref('');
  const formError = ref<string | null>(null);

  // ---------- 对话 ----------
  const messages = ref<ChatMessage[]>([]);
  const chatInput = ref('');
  const chatHint = ref<string | null>(null);
  const view = ref<'list' | 'map'>('list');
  const shareHint = ref<string | null>(null);

  // ---------- 酒店挑选 ----------
  const lastRequest = ref<PlanRequest | null>(null);
  const hotels = ref<HotelCandidate[] | null>(null);
  const chosenHotel = ref<ChosenHotel | null>(null);
  const isLoadingHotels = ref(false);
  const hotelError = ref<string | null>(null);

  // ---------- 行程 ----------
  const restoredPlan = ref<Plan | null>(null);
  const history = ref<HistoryEntry[]>(loadHistory());
  const currentPlanId = ref<string | null>(null);

  // 联网核验（OpenStreetMap Nominatim）
  const verifications = ref<Record<string, VerifyResult>>({});
  const isVerifying = ref(false);
  const verifyError = ref<string | null>(null);
  const verifyProvider = ref('');
  const verifyTotal = ref(0);
  let verifySeq = 0;
  const verifiedCount = computed(() => Object.keys(verifications.value).length);

  // ---------- 智能体闭环 ----------
  const agentTrace = ref<AgentStep[]>([]);
  const isCorrecting = ref(false);
  const correctionError = ref<string | null>(null);

  function setStep(key: string, label: string, status: AgentStep['status'], detail?: string) {
    const rest = agentTrace.value.filter((s) => s.key !== key);
    agentTrace.value = [...rest, { key, label, status, detail }];
  }

  function resetTrace() {
    agentTrace.value = [];
    correctionError.value = null;
  }

  // 旧版本只把行程存进 sessionStorage，这里迁移到历史记录，避免“以前做的行程消失”
  migrateLegacyPlan();

  const { object, submit, isLoading, error, clear } = useObject({
    api: '/api/plan',
    schema: PlanSchema,
    onFinish: ({ object }) => {
      if (object?.reply) {
        messages.value = [...messages.value, { role: 'assistant', content: object.reply }];
      }
      if (object) {
        try {
          sessionStorage.setItem(STORAGE_PLAN, JSON.stringify(object));
        } catch {
          // 忽略存储失败（无痕模式等）
        }
        setStep(
          'generate',
          pendingMode === 'refine' ? '对话修改' : '生成行程',
          'done',
          `${object.days.length} 天 · ${object.days.reduce((n, d) => n + d.items.length, 0)} 项`,
        );
        upsertPlanToHistory(object);
        void verifyPlan(object);
      }
    },
  });

  const plan = computed<Plan | null>(
    () => (object.value as unknown as Plan | undefined) ?? restoredPlan.value,
  );

  const hotelPeople = computed(() => {
    const a = (lastRequest.value?.travelers.adults ?? Number(adults.value)) || 0;
    const c = (lastRequest.value?.travelers.children ?? Number(children.value)) || 0;
    return Math.max(a + c, 1);
  });

  const budgetTotalActual = computed(() => {
    const b = plan.value?.budgetBreakdown;
    if (!b) return 0;
    return Object.values(b).reduce((acc, x) => acc + (Number(x) || 0), 0);
  });

  // ---------- 动作 ----------
  let pendingMode: 'generate' | 'refine' = 'generate';

  function togglePref(v: string) {
    const idx = preferences.value.indexOf(v);
    if (idx >= 0) {
      preferences.value = preferences.value.filter((x) => x !== v);
    } else {
      preferences.value = [...preferences.value, v];
    }
  }

  function buildPayload(): PlanRequest {
    return {
      destination: destination.value.trim(),
      days: Number(days.value),
      budget: { currency: 'CNY', total: Number(budgetTotal.value) },
      travelers: {
        adults: Number(adults.value),
        children: Number(children.value) || 0,
        type: travelerType.value as TravelerType,
      },
      preferences: preferences.value as PlanRequest['preferences'],
      pace: (pace.value || 'balanced') as Pace,
    };
  }

  async function fetchHotels(payload: PlanRequest) {
    hotels.value = null;
    hotelError.value = null;
    isLoadingHotels.value = true;
    try {
      const res = await fetch('/api/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.error) {
        hotelError.value = typeof data.error === 'string' ? data.error : '酒店推荐失败';
        return;
      }
      if (Array.isArray(data?.hotels) && data.hotels.length > 0) {
        hotels.value = data.hotels;
      } else {
        hotelError.value = '没有找到合适的酒店，请调整条件后重试';
      }
    } catch {
      hotelError.value = '酒店推荐请求失败，请重试';
    } finally {
      isLoadingHotels.value = false;
    }
  }

  function submitForm(): boolean {
    formError.value = null;
    if (!destination.value.trim()) {
      formError.value = '请填写目的地';
      return false;
    }
    const d = Number(days.value);
    if (!Number.isInteger(d) || d < 1 || d > 14) {
      formError.value = '请填写 1–14 天的天数';
      return false;
    }
    const b = Number(budgetTotal.value);
    if (!Number.isFinite(b) || b <= 0) {
      formError.value = '请填写大于 0 的总预算';
      return false;
    }
    if (!travelerType.value) {
      formError.value = '请选择出行人群';
      return false;
    }
    const a = Number(adults.value);
    if (!Number.isInteger(a) || a < 1) {
      formError.value = '请填写至少 1 位成人';
      return false;
    }
    const payload = buildPayload();
    lastRequest.value = payload;
    messages.value = [];
    chosenHotel.value = null;
    hotelReqInput.value = '';
    restoredPlan.value = null;
    currentPlanId.value = null;
    verifications.value = {};
    verifyError.value = null;
    isVerifying.value = false;
    verifySeq++;
    resetTrace();
    isCorrecting.value = false;
    clear();
    try {
      sessionStorage.removeItem(STORAGE_PLAN);
    } catch {
      // ignore
    }
    fetchHotels(payload);
    return true;
  }

  function handleHotelRequirement() {
    const text = hotelReqInput.value.trim();
    if (!text || !lastRequest.value || isLoadingHotels.value) return;
    const nextRequest: PlanRequest = { ...lastRequest.value, hotelRequirement: text };
    lastRequest.value = nextRequest;
    fetchHotels(nextRequest);
  }

  function chooseHotel(h: HotelCandidate) {
    if (!lastRequest.value) {
      hotelError.value = '页面状态已重置，请重新点击「生成行程」';
      hotels.value = null;
      return;
    }
    chosenHotel.value = h;
    pendingMode = 'generate';
    resetTrace();
    setStep('generate', '生成行程', 'running', '正在规划逐日路线…');
    verifications.value = {};
    verifyError.value = null;
    verifySeq++;
    submit({ ...lastRequest.value, hotel: h });
  }

  function handleChatSubmit() {
    const text = chatInput.value.trim();
    if (!text || isLoading.value) return;
    if (!plan.value) {
      chatHint.value = '还没有行程可调整，请先点击「生成行程」生成一份行程';
      return;
    }
    const nextMessages: ChatMessage[] = [...messages.value, { role: 'user', content: text }];
    messages.value = nextMessages;
    chatInput.value = '';
    chatHint.value = null;
    // 行程即将变化，旧的核验结果作废
    verifications.value = {};
    verifyError.value = null;
    verifySeq++;
    pendingMode = 'refine';
    resetTrace();
    setStep('generate', '对话修改', 'running', '正在按新需求更新行程…');
    isCorrecting.value = false;
    submit({ plan: plan.value, messages: nextMessages });
  }

  function setView(v: 'list' | 'map') {
    view.value = v;
  }

  function buildShareUrl(): string {
    if (!plan.value) return '';
    const url = new URL(window.location.href);
    url.hash = 'p=' + encodePlan(plan.value);
    return url.toString();
  }

  async function copyShareLink() {
    if (!plan.value) {
      shareHint.value = '还没有行程可分享';
      return;
    }
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      shareHint.value = '分享链接已复制';
    } catch {
      shareHint.value = url;
    }
  }

  async function exportImage() {
    if (!plan.value) return;
    // 导出使用离屏的“全量行程”副本，与当前查看的天无关
    const node = document.getElementById('itinerary-export');
    if (!node) return;
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(node, {
      backgroundColor: '#f5f2ea',
      pixelRatio: 2,
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${plan.value.title || 'tripgen'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function restore() {
    const fromHash = readPlanFromHash();
    if (fromHash) {
      restoredPlan.value = fromHash;
      currentPlanId.value = null;
      verifications.value = {};
      return;
    }
    try {
      const savedPlan = sessionStorage.getItem(STORAGE_PLAN);
      if (savedPlan) {
        const p = JSON.parse(savedPlan) as Plan;
        restoredPlan.value = p;
        // 同一份行程如已在历史里，关联到它，后续对话修改更新同一条
        const match = history.value.find((h) => JSON.stringify(h.plan) === JSON.stringify(p));
        currentPlanId.value = match?.id ?? null;
        verifications.value = match?.verify ?? {};
      }
      const savedChat = sessionStorage.getItem(STORAGE_CHAT);
      if (savedChat) messages.value = JSON.parse(savedChat) as ChatMessage[];
    } catch {
      // ignore
    }
  }

  function migrateLegacyPlan() {
    try {
      const raw = sessionStorage.getItem(STORAGE_PLAN);
      if (!raw) return;
      const p = JSON.parse(raw) as Plan;
      if (!p || !Array.isArray(p.days) || typeof p.title !== 'string') return;
      const sig = JSON.stringify(p);
      const match = history.value.find((h) => JSON.stringify(h.plan) === sig);
      if (match) {
        currentPlanId.value = match.id;
        return;
      }
      const now = Date.now();
      const id = newId();
      history.value.unshift({
        id,
        title: p.title,
        destination: '',
        days: p.days.length,
        createdAt: now,
        updatedAt: now,
        plan: p,
      });
      currentPlanId.value = id;
      persistHistory(history.value);
    } catch {
      // ignore
    }
  }

  function upsertPlanToHistory(plan: Plan) {
    const now = Date.now();
    const existing = currentPlanId.value
      ? history.value.find((h) => h.id === currentPlanId.value)
      : undefined;
    if (existing) {
      existing.plan = plan;
      existing.title = plan.title;
      existing.updatedAt = now;
      history.value = [existing, ...history.value.filter((h) => h.id !== existing.id)];
    } else {
      const id = newId();
      currentPlanId.value = id;
      history.value.unshift({
        id,
        title: plan.title,
        destination: lastRequest.value?.destination ?? '',
        days: lastRequest.value?.days ?? plan.days.length,
        createdAt: now,
        updatedAt: now,
        plan,
      });
    }
    persistHistory(history.value);
  }

  function openHistory(id: string) {
    const entry = history.value.find((h) => h.id === id);
    if (!entry) return;
    clear();
    restoredPlan.value = entry.plan;
    currentPlanId.value = id;
    messages.value = [];
    verifications.value = entry.verify ?? {};
    verifyError.value = null;
    verifySeq++;
    resetTrace();
    isCorrecting.value = false;
    try {
      sessionStorage.setItem(STORAGE_PLAN, JSON.stringify(entry.plan));
    } catch {
      // ignore
    }
  }

  async function verifyPlan(p: Plan, opts?: { allowCorrect?: boolean; reverify?: boolean }) {
    if (!p?.days?.length) return;
    const items: { id: string; title: string; location: string; category: string }[] = [];
    p.days.forEach((d) => {
      d.items.forEach((it, idx) => {
        if (it.category === 'transport' || it.category === 'rest') return;
        items.push({ id: `${d.day}-${idx}`, title: it.title, location: it.location ?? '', category: it.category });
      });
    });
    if (!items.length) return;

    const stepKey = opts?.reverify ? 'reverify' : 'verify';
    const label = opts?.reverify ? '修正后复核' : '联网核验';
    const seq = ++verifySeq;
    isVerifying.value = true;
    verifyError.value = null;
    verifyTotal.value = items.length;
    setStep(stepKey, label, 'running', `${items.length} 个地点`);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: lastRequest.value?.destination ?? '',
          items,
        }),
      });
      const data = await res.json();
      if (seq !== verifySeq) return;
      if (data?.error) {
        verifyError.value = String(data.error);
        setStep(stepKey, label, 'failed', '接口返回错误');
        return;
      }
      const map: Record<string, VerifyResult> = {};
      for (const r of (data?.results ?? []) as VerifyResult[]) {
        if (r?.verified && Number.isFinite(r.lat) && Number.isFinite(r.lng)) map[r.id] = r;
      }
      verifications.value = map;
      verifyProvider.value = String(data?.provider ?? 'osm');
      setStep(stepKey, label, 'done', `${Object.keys(map).length}/${items.length} 通过`);

      const entry = currentPlanId.value
        ? history.value.find((h) => h.id === currentPlanId.value)
        : undefined;
      if (entry) {
        entry.verify = map;
        persistHistory(history.value);
      }

      // 工具反馈：未通过核验的地点回传给模型修正（只做一轮，避免死循环）
      const issues: PlanIssue[] = items
        .filter((it) => !map[it.id])
        .map((it) => {
          const [dayStr, idxStr] = it.id.split('-');
          return {
            day: Number(dayStr),
            index: Number(idxStr),
            title: it.title,
            reason: 'OpenStreetMap 未匹配到该地点',
          };
        });
      if (issues.length && opts?.allowCorrect !== false) {
        await correctPlan(p, issues);
      }
    } catch {
      if (seq === verifySeq) {
        verifyError.value = '联网核验失败，请稍后重试';
        setStep(stepKey, label, 'failed', '请求失败');
      }
    } finally {
      if (seq === verifySeq) isVerifying.value = false;
    }
  }

  async function correctPlan(p: Plan, issues: PlanIssue[]) {
    if (isCorrecting.value) return;
    isCorrecting.value = true;
    correctionError.value = null;
    setStep('correct', '工具反馈修正', 'running', `${issues.length} 个地点未通过核验`);

    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: p, issues }),
      });
      const data = await res.json();
      if (!Array.isArray(data?.days)) {
        throw new Error(String(data?.error ?? '修正接口返回异常'));
      }
      const corrected = data as Plan;
      // 用修正后的行程替换当前展示（清空流式对象，plan 改为读 restoredPlan）
      restoredPlan.value = corrected;
      clear();
      try {
        sessionStorage.setItem(STORAGE_PLAN, JSON.stringify(corrected));
      } catch {
        // ignore
      }
      const entry = currentPlanId.value
        ? history.value.find((h) => h.id === currentPlanId.value)
        : undefined;
      if (entry) {
        entry.plan = corrected;
        entry.title = corrected.title;
        entry.updatedAt = Date.now();
        persistHistory(history.value);
      }
      setStep('correct', '工具反馈修正', 'done', `已修正 ${issues.length} 个地点`);

      // 修正后再核验一次，确认新地点可匹配
      await verifyPlan(corrected, { allowCorrect: false, reverify: true });
    } catch (e) {
      correctionError.value = '自动修正失败，已保留原行程';
      setStep('correct', '工具反馈修正', 'failed', String((e as Error)?.message ?? e));
    } finally {
      isCorrecting.value = false;
    }
  }

  function deleteHistory(id: string) {
    history.value = history.value.filter((h) => h.id !== id);
    if (currentPlanId.value === id) currentPlanId.value = null;
    persistHistory(history.value);
  }

  // 对话历史持久化
  watch(
    messages,
    (v) => {
      try {
        sessionStorage.setItem(STORAGE_CHAT, JSON.stringify(v));
      } catch {
        // ignore
      }
    },
    { deep: true },
  );

  return {
    // 表单
    destination,
    days,
    budgetTotal,
    travelerType,
    adults,
    children,
    preferences,
    pace,
    hotelReqInput,
    formError,
    // 对话
    messages,
    chatInput,
    chatHint,
    view,
    shareHint,
    // 酒店
    lastRequest,
    hotels,
    chosenHotel,
    isLoadingHotels,
    hotelError,
    // 行程
    object,
    plan,
    isLoading,
    error,
    hotelPeople,
    budgetTotalActual,
    history,
    currentPlanId,
    verifications,
    isVerifying,
    verifyError,
    verifyProvider,
    verifyTotal,
    verifiedCount,
    agentTrace,
    isCorrecting,
    correctionError,
    // 动作
    togglePref,
    submitForm,
    handleHotelRequirement,
    chooseHotel,
    handleChatSubmit,
    restore,
    setView,
    buildShareUrl,
    copyShareLink,
    exportImage,
    openHistory,
    deleteHistory,
  };
});
