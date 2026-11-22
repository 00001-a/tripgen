<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Plan, PlanItem, Day } from '../lib/schema';
import { CATEGORY_META, CAT_HEX } from '../lib/constants';

const props = defineProps<{
  plan: Plan;
  day: number;
  coords?: Record<
    string,
    { lat: number; lng: number; verified?: boolean; address?: string; openTime?: string }
  >;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let layer: L.LayerGroup | null = null;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c];
  });
}

function popupHtml(
  it: PlanItem,
  d: Day,
  order: number,
  v?: { verified?: boolean; address?: string; openTime?: string },
): string {
  const cat = CATEGORY_META[it.category]?.label ?? it.category;
  const cost = it.cost > 0 ? `¥${it.cost}` : '';
  return [
    `<div style="min-width:200px;max-width:260px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#22211d">`,
    `<div style="font-size:11px;color:#6f6b61;letter-spacing:.02em">DAY ${d.day} · 第 ${order} 站 · ${esc(it.time)}${v?.verified ? ' · 已核验' : ''}</div>`,
    `<div style="margin:4px 0 2px;font-size:14px;font-weight:700">${esc(it.title)}</div>`,
    it.location
      ? `<div style="font-size:12px;color:#6f6b61;margin-bottom:4px">${esc(it.location)}</div>`
      : '',
    v?.address
      ? `<div style="font-size:11px;color:#6f6b61;margin-bottom:4px">地址 · ${esc(v.address)}</div>`
      : '',
    v?.openTime
      ? `<div style="font-size:11px;color:#6f6b61;margin-bottom:4px">营业 · ${esc(v.openTime)}</div>`
      : '',
    `<div style="font-size:12px;line-height:1.55;color:#44423c">${esc(it.description)}</div>`,
    it.tips
      ? `<div style="margin-top:6px;font-size:12px;color:#1f4d3b">提示 · ${esc(it.tips)}</div>`
      : '',
    `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #e3ded0;display:flex;justify-content:space-between;align-items:center">`,
    `<span style="font-size:11px;color:#6f6b61">${esc(cat)}</span>`,
    cost ? `<span style="font-size:13px;font-weight:600;color:#1f4d3b">${esc(cost)}</span>` : '',
    `</div></div>`,
  ].join('');
}

function render() {
  if (!map || !layer || !props.plan) return;
  const m = map;
  const lg = layer;
  lg.clearLayers();

  const day =
    props.plan.days.find((x) => x.day === props.day) ??
    props.plan.days[0];
  if (!day) return;

  const points: [number, number][] = [];

  day.items.forEach((it, idx) => {
    const v = props.coords?.[`${day.day}-${idx}`];
    const lat = v?.lat ?? it.lat;
    const lng = v?.lng ?? it.lng;
    if (lat == null || lng == null) return;
    const order = idx + 1;
    const latLng: [number, number] = [lat, lng];
    points.push(latLng);
    const color = CAT_HEX[it.category] ?? '#1f4d3b';

    const svg =
      `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M15 1C7.3 1 1 7.3 1 15c0 10.6 14 25 14 25s14-14.4 14-25C29 7.3 22.7 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
      `<circle cx="15" cy="15" r="8.5" fill="#fff"/>` +
      `<text x="15" y="18.5" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" font-family="-apple-system,sans-serif">${order}</text>` +
      `</svg>`;

    const icon = L.divIcon({
      className: '',
      html: svg,
      iconSize: [30, 42],
      iconAnchor: [15, 41],
      popupAnchor: [0, -38],
    });

    L.marker(latLng, { icon }).addTo(lg).bindPopup(popupHtml(it, day, order, v));
  });

  if (points.length) {
    m.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }
}

onMounted(() => {
  if (!mapEl.value) return;
  map = L.map(mapEl.value, { scrollWheelZoom: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  render();
});

watch([() => props.plan, () => props.day, () => props.coords], render, { deep: true });

onBeforeUnmount(() => {
  map?.remove();
  map = null;
  layer = null;
});
</script>

<template>
  <div ref="mapEl" class="h-full min-h-[480px] w-full rounded-md border border-line" />
</template>
