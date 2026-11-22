<script setup lang="ts">
import { computed } from 'vue';
import type { Plan } from '../lib/schema';
import { BUDGET_COLORS, LABELS } from '../lib/constants';

const props = defineProps<{ plan: Plan }>();

const KEYS = ['accommodation', 'food', 'transport', 'tickets', 'shopping', 'misc'] as const;

const entries = computed(() =>
  KEYS.map((k, i) => ({
    key: k,
    label: LABELS[k] ?? k,
    value: Number(props.plan.budgetBreakdown?.[k] ?? 0) || 0,
    color: BUDGET_COLORS[i % BUDGET_COLORS.length],
  })),
);

const total = computed(() => entries.value.reduce((acc, e) => acc + e.value, 0));
</script>

<template>
  <div>
    <div class="flex h-3 w-full overflow-hidden rounded-sm bg-line/50">
      <div
        v-for="e in entries"
        :key="e.key"
        :style="{
          width: total ? `${(e.value / total) * 100}%` : '0%',
          backgroundColor: e.color,
        }"
        :title="`${e.label} ¥${e.value}`"
      />
    </div>
    <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
      <div v-for="e in entries" :key="e.key" class="flex items-center justify-between text-xs">
        <span class="flex items-center gap-1.5 text-muted">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: e.color }" />
          {{ e.label }}
        </span>
        <span class="text-ink">¥{{ e.value }}</span>
      </div>
    </div>
  </div>
</template>
