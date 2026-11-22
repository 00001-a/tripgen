<script setup lang="ts">
import { computed } from 'vue';
import type { Plan, Day } from '../lib/schema';
import { CATEGORY_META } from '../lib/constants';
import BudgetBar from './BudgetBar.vue';

type VerifyLike = { verified?: boolean; address?: string; openTime?: string };

const props = defineProps<{
  plan: Plan;
  day?: number;
  exportTarget?: boolean;
  verify?: Record<string, VerifyLike>;
}>();

const visibleDays = computed(() => {
  const days = props.plan.days;
  if (props.day == null) return days;
  const hit = days.filter((d) => d.day === props.day);
  return hit.length ? hit : days.slice(0, 1);
});

function vOf(d: Day, idx: number): VerifyLike | undefined {
  return props.verify?.[`${d.day}-${idx}`];
}

function catLabel(cat: string) {
  return CATEGORY_META[cat]?.label ?? cat;
}
</script>

<template>
  <div :id="props.exportTarget ? 'itinerary-export' : undefined" class="space-y-5">
    <!-- 标题与摘要 -->
    <div>
      <h2 class="text-xl font-bold text-ink">{{ plan.title }}</h2>
      <p class="mt-1 text-sm leading-relaxed text-muted">{{ plan.summary }}</p>
    </div>

    <!-- 逐日行程 -->
    <div
      v-for="d in visibleDays"
      :key="d.day"
      class="rounded-md border border-line bg-paper/50 p-4"
    >
      <div class="flex items-center justify-between border-b border-line pb-2">
        <h3 class="font-semibold text-ink">Day {{ d.day }} · {{ d.theme }}</h3>
        <span class="text-xs text-muted">¥{{ d.dayCost }}</span>
      </div>

      <ol class="mt-3 space-y-3">
        <li v-for="(it, idx) in d.items" :key="idx" class="flex gap-3">
          <div class="flex w-12 shrink-0 flex-col items-center">
            <span class="text-xs font-medium text-ink">{{ it.time }}</span>
            <span class="mt-1 w-px flex-1 bg-line" />
          </div>

          <div class="min-w-0 flex-1 pb-1">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                {{ catLabel(it.category) }}
              </span>
              <span class="font-medium text-ink">{{ it.title }}</span>
              <span
                v-if="vOf(d, idx)?.verified"
                class="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand"
              >
                已核验
              </span>
              <span v-if="it.cost" class="ml-auto shrink-0 text-xs text-muted">¥{{ it.cost }}</span>
            </div>
            <p class="mt-1 text-sm leading-relaxed text-muted">{{ it.description }}</p>
            <p v-if="it.location" class="mt-1 text-xs text-muted/80">{{ it.location }}</p>
            <p v-if="vOf(d, idx)?.address" class="mt-1 text-xs text-muted/80">
              地址 · {{ vOf(d, idx)?.address }}
            </p>
            <p v-if="vOf(d, idx)?.openTime" class="mt-1 text-xs text-muted/80">
              营业时间 · {{ vOf(d, idx)?.openTime }}
            </p>
            <p v-if="it.tips" class="mt-1 text-xs text-brand">提示 · {{ it.tips }}</p>
          </div>
        </li>
      </ol>
    </div>

    <!-- 预算 -->
    <div class="rounded-md border border-line bg-card p-4">
      <h3 class="mb-3 text-sm font-semibold text-ink">预算明细</h3>
      <BudgetBar :plan="plan" />
    </div>

    <!-- 提示 -->
    <div v-if="plan.tips?.length" class="rounded-md border border-line bg-card p-4">
      <h3 class="mb-2 text-sm font-semibold text-ink">实用提示</h3>
      <ul class="space-y-1 text-sm text-muted">
        <li v-for="(t, i) in plan.tips" :key="i">· {{ t }}</li>
      </ul>
    </div>

    <!-- 行李清单 -->
    <div v-if="plan.packing?.length" class="rounded-md border border-line bg-card p-4">
      <h3 class="mb-2 text-sm font-semibold text-ink">建议携带</h3>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="(p, i) in plan.packing"
          :key="i"
          class="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand"
        >
          {{ p }}
        </span>
      </div>
    </div>
  </div>
</template>
