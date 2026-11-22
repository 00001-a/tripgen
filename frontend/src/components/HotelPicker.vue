<script setup lang="ts">
import { useTripStore } from '../stores/trip';

const trip = useTripStore();
</script>

<template>
  <div v-if="trip.hotels" class="space-y-4">
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand-soft bg-brand-soft px-4 py-3 text-brand"
    >
      <p class="text-sm">
        为你找到 <span class="font-semibold">{{ trip.hotels.length }}</span> 家酒店，选一家作为行程锚点
      </p>
      <span class="text-xs">{{ trip.hotelPeople }} 人 · ¥{{ trip.lastRequest?.budget.total }} 预算</span>
    </div>

    <!-- 二次要求 -->
    <form @submit.prevent="trip.handleHotelRequirement" class="flex gap-2">
      <input
        v-model="trip.hotelReqInput"
        class="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand-soft"
        placeholder="对酒店有额外要求？（如：近地铁、有泳池）"
      />
      <button
        type="submit"
        :disabled="trip.isLoadingHotels || !trip.hotelReqInput.trim()"
        class="shrink-0 rounded-md border border-brand bg-white px-3 py-2 text-sm text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        重新推荐
      </button>
    </form>

    <!-- 酒店卡片 -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="(h, i) in trip.hotels"
        :key="i"
        class="flex flex-col rounded-md border border-line bg-card p-4 transition hover:border-brand/30"
      >
        <div class="flex items-start justify-between gap-2">
          <h4 class="font-semibold text-ink">{{ h.name }}</h4>
          <span class="whitespace-nowrap text-sm font-semibold text-brand">¥{{ h.pricePerNight }}/晚</span>
        </div>
        <p class="mt-0.5 text-xs text-muted">{{ h.location }}</p>
        <p class="mt-2 flex-1 text-sm leading-relaxed text-ink/70">{{ h.reason }}</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <span
            v-for="t in h.tags"
            :key="t"
            class="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand"
          >
            {{ t }}
          </span>
        </div>
        <button
          type="button"
          :disabled="trip.isLoading"
          class="mt-3 w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          @click="trip.chooseHotel(h)"
        >
          选定这家酒店
        </button>
      </div>
    </div>
  </div>
</template>
