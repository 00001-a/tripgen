'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORY_META, type Plan } from '@/lib/schema';

// 分类彩色图钉（按类别着色，便于一眼区分支出类型）
const CAT_HEX: Record<string, string> = {
  food: '#f59e0b',
  sightseeing: '#0ea5e9',
  activity: '#8b5cf6',
  transport: '#64748b',
  rest: '#10b981',
  shopping: '#ec4899',
  accommodation: '#14b8a6',
  nature: '#22c55e',
  culture: '#f97316',
};

// 序号彩色气泡图标（带白色描边，避免与地图混在一起）
function numberedIcon(index: number, category: string): L.DivIcon {
  const color = CAT_HEX[category] ?? '#94a3b8';
  return L.divIcon({
    className: 'tripgen-pin',
    html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${color};
      border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      font-weight:700;color:#fff;font-size:13px;"><span style="transform:rotate(45deg)">${index}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
}

// 自动把视野缩放到所有标点范围内
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.2));
  }, [map, points]);
  return null;
}

export default function TripMap({ days }: { days: Plan['days'] }) {
  const validDays = (days ?? []).filter(Boolean);
  const [active, setActive] = useState(0);
  const dayIdx = Math.min(Math.max(active, 0), Math.max(validDays.length - 1, 0));
  const day = validDays[dayIdx];
  const items = (day?.items ?? []).filter(Boolean);

  // 只取有真实坐标的标点，按时间顺序
  const stops = items
    .map((it, i) => {
      const lat = typeof it?.lat === 'number' ? it.lat : undefined;
      const lng = typeof it?.lng === 'number' ? it.lng : undefined;
      return { it, i, lat, lng };
    })
    .filter((s) => s.lat != null && s.lng != null) as {
    it: NonNullable<Plan['days'][number]['items'][number]>;
    i: number;
    lat: number;
    lng: number;
  }[];

  const points = stops.map((s) => [s.lat, s.lng] as [number, number]);

  return (
    <div className="space-y-3">
      {/* 切换天数 */}
      {validDays.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {validDays.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                i === dayIdx
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Day {d?.day ?? i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100" style={{ height: 460 }}>
        {points.length > 0 ? (
          <MapContainer
            center={points[0]}
            zoom={13}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 贡献者'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />

            {/* 当日行进路线 */}
            {points.length > 1 && (
              <Polyline positions={points} pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.8 }} />
            )}

            {stops.map((s, order) => {
              const cat = s.it?.category ?? 'sightseeing';
              const meta = CATEGORY_META[cat];
              const emoji = meta?.emoji ?? '📍';
              return (
                <Marker key={order} position={[s.lat, s.lng]} icon={numberedIcon(order + 1, cat)}>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">
                        {emoji} {s.it?.title}
                      </div>
                      <div className="text-gray-500">{s.it?.time} · {s.it?.location}</div>
                      {s.it?.cost != null && (
                        <div className="mt-0.5 font-medium text-indigo-600">💰 ¥{s.it.cost}</div>
                      )}
                      <div className="text-xs text-gray-400">
                        {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-50 text-center text-sm text-gray-400">
            <div>
              <div className="text-3xl">🗺️</div>
              <p className="mt-2">本日暂无带地理坐标的景点，无法在地图上标出</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        🧭 真实地图（OpenStreetMap，无需密钥）：按时间顺序连接当日景点，颜色代表支出类型，点击图钉看详情。
      </p>
    </div>
  );
}
