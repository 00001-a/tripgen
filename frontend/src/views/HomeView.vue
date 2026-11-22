<script setup lang="ts">
import { useRouter } from 'vue-router';
import PlanForm from '../components/PlanForm.vue';
import { useTripStore } from '../stores/trip';

const router = useRouter();
const trip = useTripStore();
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-paper px-4 text-ink">
    <div class="w-full max-w-md">
      <div class="mb-6 text-center">
        <h1 class="text-3xl font-bold text-ink">途灵 TripGen</h1>
        <p class="mt-2 text-sm text-muted">从一家酒店出发，规划你的逐日路线</p>
      </div>

      <PlanForm @submitted="router.push('/plan')" />

      <p class="mt-4 text-center text-xs text-muted">
        填写信息后，将先为你推荐酒店，再生成逐日行程
      </p>

      <div class="mt-5 flex items-center justify-center">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-4 py-2 text-sm text-ink transition hover:border-brand/40 hover:text-brand"
          @click="router.push('/history')"
        >
          历史记录
          <span
            v-if="trip.history.length"
            class="rounded-full bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand"
          >
            {{ trip.history.length }}
          </span>
        </button>
      </div>
    </div>
  </main>
</template>
