import { NextResponse } from 'next/server';
import { calculateRoadRoute, geocodeIsraeliAddress } from '@/lib/maps';

type Point = { index: number; lat: number; lng: number; displayName: string };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { addresses?: unknown; locations?: unknown };
    if (!Array.isArray(body.addresses) || body.addresses.length > 20 || body.addresses.some(value => typeof value !== 'string' || !value.trim())) {
      return NextResponse.json({ error: 'Invalid addresses' }, { status: 400 });
    }
    const points: Point[] = [];
    const missing: number[] = [];
    for (let index = 0; index < body.addresses.length; index += 1) {
      const saved = Array.isArray(body.locations) ? body.locations[index] as { lat?: unknown; lng?: unknown } | null : null;
      const point = saved && typeof saved.lat === 'number' && typeof saved.lng === 'number'
        ? { lat: saved.lat, lng: saved.lng, displayName: body.addresses[index] }
        : await geocodeIsraeliAddress(body.addresses[index]);
      if (point) points.push({ index, ...point }); else missing.push(index);
    }
    const route = await calculateRoadRoute(points);
    return NextResponse.json({ points, missing, route });
  } catch {
    return NextResponse.json({ error: 'Map services unavailable' }, { status: 502 });
  }
}
