<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import HotelPicker from '../components/HotelPicker.vue';
import Itinerary from '../components/Itinerary.vue';
import TripMap from '../components/TripMap.vue';
import ChatPanel from '../components/ChatPanel.vue';
import { useTripStore } from '../stores/trip';

const router = useRouter();
const trip = useTripStore();
const activeDay = ref(1);

onMounted(() => {
  trip.restore();
});

watch(
  () => trip.plan,
  (p) => {
    if (p) activeDay.value = p.days[0]?.day ?? 1;
  },
);

function toggleCls(active: boolean) {
  return active ? 'bg-brand text-white' : 'text-muted hover:text-ink';
}
</script>

<template>
  <main class="min-h-screen bg-paper text-ink">
    <div class="mx-auto max-w-6xl px-4 py-8">
      <!-- 头部 -->
      <header class="mb-6 flex items-center justify-between border-b border-line pb-4">
        <div>
          <h1 class="text-2xl font-bold text-ink">途灵 TripGen</h1>
          <p class="mt-1 text-xs text-muted">从一家酒店出发，规划你的逐日路线</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-muted transition hover:border-brand/40 hover:text-brand"
            @click="router.push('/history')"
          >
            历史记录
          </button>
          <button
            type="button"
            class="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-muted transition hover:border-brand/40 hover:text-brand"
            @click="router.push('/')"
          >
            返回修改
          </button>
        </div>
      </header>

      <!-- 规划区 -->
      <section class="min-h-[60vh] rounded-md border border-line bg-card p-5">
        <!-- 酒店推荐中 -->
        <div v-if="trip.isLoadingHotels" class="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          <p class="text-sm text-muted">正在为你寻找合适的酒店…</p>
        </div>

        <!-- 酒店错误 -->
        <div v-else-if="trip.hotelError" class="rounded-md bg-[#f3e7e3] p-4 text-sm text-[#7c3a30]">
          <p>{{ trip.hotelError }}</p>
          <button
            type="button"
            class="mt-2 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-strong"
            @click="trip.submitForm"
          >
            重试
          </button>
        </div>

        <!-- 行程规划中 -->
        <div v-else-if="trip.isLoading" class="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          <p class="text-sm text-muted">正在规划逐日行程，请稍候…</p>
        </div>

        <!-- 行程结果 -->
        <div v-else-if="trip.plan" class="space-y-4">
          <div v-if="trip.error" class="rounded-md bg-[#f3e7e3] p-3 text-sm text-[#7c3a30]">
            生成出错：{{ trip.error.message }}
          </div>

          <!-- 工具栏 -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex rounded-md border border-line bg-paper p-0.5">
              <button
                type="button"
                class="rounded px-3 py-1.5 text-sm transition"
                :class="toggleCls(trip.view === 'list')"
                @click="trip.setView('list')"
              >
                列表
              </button>
              <button
                type="button"
                class="rounded px-3 py-1.5 text-sm transition"
                :class="toggleCls(trip.view === 'map')"
                @click="trip.setView('map')"
              >
                地图
              </button>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-brand"
                @click="trip.copyShareLink"
              >
                分享
              </button>
              <button
                type="button"
                class="rounded-md bg-brand px-3 py-1.5 text-sm text-white transition hover:bg-brand-strong"
                @click="trip.exportImage"
              >
                导出图片
              </button>
            </div>
          </div>

          <p v-if="trip.shareHint" class="break-all text-xs text-muted">{{ trip.shareHint }}</p>

          <!-- 智能体执行轨迹：生成 → 联网核验 → 工具反馈修正 → 复核 -->
          <div v-if="trip.agentTrace.length" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span
              v-for="s in trip.agentTrace"
              :key="s.key"
              class="inline-flex items-center gap-1.5"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="
                  s.status === 'done'
                    ? 'bg-brand'
                    : s.status === 'running'
                      ? 'bg-[#b08a3e] animate-pulse'
                      : 'bg-[#9a5b4f]'
                "
              />
              <span :class="s.status === 'failed' ? 'text-[#7c3a30]' : 'text-ink'">{{ s.label }}</span>
              <span v-if="s.detail" class="text-muted">· {{ s.detail }}</span>
            </span>
          </div>

          <p v-if="trip.verifyError" class="text-xs text-[#7c3a30]">{{ trip.verifyError }}</p>
          <p v-if="trip.correctionError" class="text-xs text-[#7c3a30]">{{ trip.correctionError }}</p>

          <!-- 内容 + 对话 -->
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div class="space-y-3">
              <!-- 天切换（列表 / 地图共用） -->
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="d in trip.plan.days"
                  :key="d.day"
                  type="button"
                  class="rounded-md border px-3 py-1.5 text-sm transition"
                  :class="
                    activeDay === d.day
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-white text-muted hover:border-brand/40'
                  "
                  @click="activeDay = d.day"
                >
                  Day {{ d.day }}
                </button>
              </div>

              <Itinerary
                v-if="trip.view === 'list'"
                :plan="trip.plan"
                :day="activeDay"
                :verify="trip.verifications"
              />
              <TripMap v-else :plan="trip.plan" :day="activeDay" :coords="trip.verifications" />
            </div>
            <ChatPanel class="lg:max-h-[72vh]" />
          </div>

          <!-- 导出用全量行程（离屏渲染，不随天切换） -->
          <div aria-hidden="true" class="pointer-events-none fixed -left-[100000px] top-0 w-[760px]">
            <Itinerary :plan="trip.plan" export-target :verify="trip.verifications" />
          </div>
        </div>

        <!-- 酒店选择 -->
        <HotelPicker v-else-if="trip.hotels" />

        <!-- 空状态 -->
        <div v-else class="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted">
          <p class="text-sm">还没有行程，先填写需求开始规划</p>
          <button
            type="button"
            class="rounded-md border border-line bg-white px-3 py-1.5 text-sm transition hover:border-brand/40 hover:text-brand"
            @click="router.push('/')"
          >
            去填写需求
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
