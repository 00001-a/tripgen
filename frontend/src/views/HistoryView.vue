<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useTripStore } from '../stores/trip';

const router = useRouter();
const trip = useTripStore();

function fmt(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function open(id: string) {
  trip.openHistory(id);
  router.push('/plan');
}
</script>

<template>
  <main class="min-h-screen bg-paper text-ink">
    <div class="mx-auto max-w-3xl px-4 py-8">
      <header class="mb-6 flex items-center justify-between border-b border-line pb-4">
        <div>
          <h1 class="text-2xl font-bold">历史记录</h1>
          <p class="mt-1 text-xs text-muted">之前生成过的计划</p>
        </div>
        <button
          type="button"
          class="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-muted transition hover:border-brand/40 hover:text-brand"
          @click="router.push('/')"
        >
          返回首页
        </button>
      </header>

      <div v-if="!trip.history.length" class="py-20 text-center text-muted">
        <p class="text-sm">还没有历史记录</p>
      </div>

      <ul v-else class="space-y-3">
        <li
          v-for="h in trip.history"
          :key="h.id"
          class="flex items-center justify-between gap-3 rounded-md border border-line bg-card p-4"
        >
          <div class="min-w-0">
            <p class="truncate font-medium text-ink">{{ h.title }}</p>
            <p class="mt-0.5 text-xs text-muted">
              {{ h.destination || '未填写目的地' }} · {{ h.days }} 天 · 更新于 {{ fmt(h.updatedAt) }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-md bg-brand px-3 py-1.5 text-sm text-white transition hover:bg-brand-strong"
              @click="open(h.id)"
            >
              查看
            </button>
            <button
              type="button"
              class="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-muted transition hover:border-[#c9a29a] hover:text-[#7c3a30]"
              @click="trip.deleteHistory(h.id)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
    </div>
  </main>
</template>
