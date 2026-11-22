<script setup lang="ts">
import { useTripStore } from '../stores/trip';
import { PREF_OPTIONS, TYPE_OPTIONS, PACE_OPTIONS } from '../lib/constants';

const trip = useTripStore();
const emit = defineEmits<{ submitted: [] }>();

function onSubmit() {
  if (trip.submitForm()) emit('submitted');
}

const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand-soft';

function segClass(active: boolean) {
  return active
    ? 'border-brand bg-brand-soft text-brand'
    : 'border-line bg-white text-muted hover:border-brand/40';
}
</script>

<template>
  <form @submit.prevent="onSubmit" class="rounded-md border border-line bg-card p-5">
    <div class="space-y-4">
      <!-- 目的地 -->
      <label class="block">
        <span class="mb-1 block text-sm font-medium text-ink">目的地</span>
        <input v-model="trip.destination" :class="inputCls" placeholder="例如：日本东京" />
      </label>

      <!-- 天数 / 预算 -->
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-ink">天数</span>
          <input v-model="trip.days" type="number" min="1" max="14" placeholder="例如 5" :class="inputCls" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-ink">总预算（¥）</span>
          <input
            v-model="trip.budgetTotal"
            type="number"
            min="500"
            step="500"
            placeholder="例如 8000"
            :class="inputCls"
          />
        </label>
      </div>

      <!-- 出行人群 -->
      <div>
        <span class="mb-1 block text-sm font-medium text-ink">出行人群</span>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="o in TYPE_OPTIONS"
            :key="o.value"
            type="button"
            :class="['rounded-md border px-2 py-1.5 text-sm transition', segClass(trip.travelerType === o.value)]"
            @click="trip.travelerType = o.value"
          >
            {{ o.label }}
          </button>
        </div>
      </div>

      <!-- 人数 -->
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-ink">成人</span>
          <input v-model="trip.adults" type="number" min="1" placeholder="例如 2" :class="inputCls" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-ink">儿童</span>
          <input v-model="trip.children" type="number" min="0" placeholder="0" :class="inputCls" />
        </label>
      </div>

      <!-- 兴趣偏好 -->
      <div>
        <span class="mb-1 block text-sm font-medium text-ink">兴趣偏好</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in PREF_OPTIONS"
            :key="p.value"
            type="button"
            :class="[
              'rounded-full border px-3 py-1 text-sm transition',
              trip.preferences.includes(p.value)
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-white text-muted hover:border-brand/40',
            ]"
            @click="trip.togglePref(p.value)"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- 节奏 -->
      <div>
        <span class="mb-1 block text-sm font-medium text-ink">节奏</span>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="o in PACE_OPTIONS"
            :key="o.value"
            type="button"
            :class="['rounded-md border px-2 py-1.5 text-sm transition', segClass(trip.pace === o.value)]"
            @click="trip.pace = o.value"
          >
            {{ o.label }}
          </button>
        </div>
      </div>

      <!-- 提交 -->
      <p v-if="trip.formError" class="text-sm text-[#7c3a30]">{{ trip.formError }}</p>
      <button
        type="submit"
        :disabled="trip.isLoading"
        class="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        开始规划
      </button>
    </div>
  </form>
</template>
