import 'server-only';

export type MapPoint = { lat: number; lng: number; displayName: string };
const geocodeCache = new Map<string, MapPoint | null>();
let lastGeocodeAt = 0;

export async function geocodeIsraeliAddress(address: string): Promise<MapPoint | null> {
  const normalized = address.trim();
  if (geocodeCache.has(normalized)) return geocodeCache.get(normalized) ?? null;
  const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'il');
  url.searchParams.set('accept-language', 'he');
  url.searchParams.set('q', `${normalized}, ישראל`);
  const response = await fetch(url, { headers: { 'User-Agent': 'ElectricianMVP/0.1' }, next: { revalidate: 86400 } });
  if (!response.ok) throw new Error('Geocoding unavailable');
  const [result] = await response.json() as { lat: string; lon: string; display_name: string }[];
  const point = result ? { lat: Number(result.lat), lng: Number(result.lon), displayName: result.display_name } : null;
  geocodeCache.set(normalized, point);
  return point;
}

export async function calculateRoadRoute(points: { lat: number; lng: number }[]) {
  if (points.length < 2) return [] as [number, number][];
  const coordinates = points.map(point => `${point.lng},${point.lat}`).join(';');
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`, { next: { revalidate: 900 } });
  if (!response.ok) return [] as [number, number][];
  const data = await response.json() as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
  return (data.routes?.[0]?.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number]);
}
