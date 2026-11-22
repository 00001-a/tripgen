<script setup lang="ts">
import { useTripStore } from '../stores/trip';

const trip = useTripStore();
</script>

<template>
  <div class="flex h-full flex-col rounded-md border border-line bg-card">
    <div class="border-b border-line px-4 py-3">
      <h3 class="text-sm font-semibold text-ink">调整行程</h3>
      <p class="mt-0.5 text-xs text-muted">对话式修改，例如「把第二天的购物换成博物馆」</p>
    </div>

    <div class="flex-1 space-y-2 overflow-auto p-4">
      <div
        v-for="(m, i) in trip.messages"
        :key="i"
        :class="[
          'max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm',
          m.role === 'user' ? 'ml-auto bg-brand text-white' : 'bg-paper text-ink',
        ]"
      >
        {{ m.content }}
      </div>
      <div v-if="trip.chatHint" class="text-xs text-muted">{{ trip.chatHint }}</div>
    </div>

    <form @submit.prevent="trip.handleChatSubmit" class="flex gap-2 border-t border-line p-3">
      <input
        v-model="trip.chatInput"
        :disabled="trip.isLoading"
        class="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand-soft"
        placeholder="输入修改要求…"
      />
      <button
        type="submit"
        :disabled="trip.isLoading || !trip.chatInput.trim()"
        class="shrink-0 rounded-md bg-brand px-3 py-2 text-sm text-white transition hover:bg-brand-strong disabled:opacity-50"
      >
        发送
      </button>
    </form>
  </div>
</template>
