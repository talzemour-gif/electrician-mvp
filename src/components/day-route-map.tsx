'use client';
import { useEffect, useMemo, useState } from 'react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';

export type RouteStop = { id: string; customer: string; address: string; city: string; time: string; latitude: number | null; longitude: number | null };
type RouteData = { points: { index: number; lat: number; lng: number; displayName: string }[]; missing: number[]; route: [number, number][] };

function FitMap({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (positions.length) map.fitBounds(latLngBounds(positions), { padding: [34, 34], maxZoom: 15 }); }, [map, positions]);
  return null;
}

export default function DayRouteMap({ stops }: { stops: RouteStop[] }) {
  const [data, setData] = useState<RouteData | null>(null);
  const [error, setError] = useState('');
  const addressesKey = useMemo(() => stops.map(stop => stop.address).join('|'), [stops]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    if (!stops.length) return () => controller.abort();
    fetch('/api/day-route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses: stops.map(stop => stop.address), locations: stops.map(stop => stop.latitude !== null && stop.longitude !== null ? { lat: stop.latitude, lng: stop.longitude } : null) }), signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(setData).catch(caught => { if ((caught as Error).name !== 'AbortError') setError('לא ניתן לטעון את המפה כרגע. רשימת הפגישות עדיין זמינה בהמשך הדף.'); });
    return () => controller.abort();
  // The address signature deliberately controls reloads when the selected day changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey]);
  if (!stops.length) return <div className="card empty-state">אין כתובות להצגה במפה ביום הזה.</div>;
  const positions = data?.points.map(point => [point.lat, point.lng] as [number, number]) ?? [];
  return <div className="day-route-layout">
    <div className="day-map-wrap">
      {error ? <div className="map-message error" role="alert">{error}</div>
        : !data ? <div className="map-message" role="status">מאתר כתובות ומתכנן מסלול…</div>
        : !data.points.length ? <div className="map-message error">לא הצלחנו לאתר את כתובות הפגישות במפה.</div>
        : <MapContainer className="day-map" center={positions[0]} zoom={13} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitMap positions={positions} />
          {data.route.length > 1 && <Polyline positions={data.route} pathOptions={{ color: '#4f46e5', weight: 5, opacity: .8 }} />}
          {data.points.map(point => <Marker key={stops[point.index].id} position={[point.lat, point.lng]} icon={divIcon({ className: 'route-marker-shell', html: `<span class="route-marker">${point.index + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })}><Popup><strong>{stops[point.index].time} · {stops[point.index].customer}</strong><br />{stops[point.index].address}</Popup></Marker>)}
        </MapContainer>}
      {data && data.missing.length > 0 && <p className="map-warning">לא הצלחנו לאתר: {data.missing.map(index => stops[index].address).join(' · ')}</p>}
    </div>
    <ol className="day-route-stops" aria-label="פגישות במסלול היומי">
      {stops.map((stop, index) => <li key={stop.id}>
        <span className="route-stop-number" aria-hidden="true">{index + 1}</span>
        <div className="route-stop-details"><strong>{stop.customer}</strong><div><span>{stop.city || 'עיר לא צוינה'}</span><time>{stop.time}</time></div></div>
      </li>)}
    </ol>
  </div>;
}
