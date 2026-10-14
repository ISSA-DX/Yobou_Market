// TrackingMap — small Leaflet + OpenStreetMap wrapper for courier tracking.
// Kept in sync across Internal_Web_Admin, Partner_Web_Vendor and
// APP_shopper_and_buyer (copy changes to all three).
//
// Props:
//   markers: [{ id, lat, lng, label, kind: 'courier'|'dropoff'|'stale', title }]
//   route:   [[lat, lng], …]  optional breadcrumb polyline
//   height:  CSS height (default 260px)
//   follow:  re-fit the view whenever markers move (default true)
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const COLORS = { courier: '#1d4ed8', dropoff: '#16a34a', stale: '#9ca3af' };

function icon(kind, label) {
  const color = COLORS[kind] || COLORS.courier;
  const glyph = kind === 'dropoff' ? 'flag' : 'two_wheeler';
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div title="${label || ''}" style="width:34px;height:34px;border-radius:50%;background:${color};
      border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;
      color:#fff;"><span class="material-symbols-outlined" style="font-size:18px">${glyph}</span></div>`,
  });
}

export default function TrackingMap({ markers = [], route = [], height = 260, follow = true }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(false);

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([14.7167, -17.4677], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const points = [];
    if (route.length > 1) {
      L.polyline(route, { color: COLORS.courier, weight: 4, opacity: 0.6 }).addTo(layer.current);
      points.push(...route);
    }
    for (const m of markers) {
      if (m.lat == null || m.lng == null) continue;
      const mk = L.marker([m.lat, m.lng], { icon: icon(m.kind, m.label) }).addTo(layer.current);
      if (m.label) mk.bindTooltip(m.label, { direction: 'top', offset: [0, -16] });
      if (m.title) mk.bindPopup(m.title);
      points.push([m.lat, m.lng]);
    }
    if (points.length && (follow || !fitted.current)) {
      if (points.length === 1) map.current.setView(points[0], Math.max(map.current.getZoom(), 15));
      else map.current.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
      fitted.current = true;
    }
  }, [markers, route, follow]);

  return <div ref={el} style={{ height, width: '100%', borderRadius: 12, zIndex: 0 }} className="overflow-hidden" />;
}

// "2 min ago" style label for a fix timestamp.
export function ago(at) {
  if (!at) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString();
}
