import { NextResponse } from 'next/server';
import { geocodeIsraeliAddress } from '@/lib/maps';

export async function POST(request: Request) {
  try {
    const { address, city } = await request.json() as { address?: unknown; city?: unknown };
    if (typeof address !== 'string' || typeof city !== 'string' || !address.trim() || !city.trim() || address.length > 300 || city.length > 120) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }
    const point = await geocodeIsraeliAddress(`${address.trim()}, ${city.trim()}`);
    return point ? NextResponse.json(point) : NextResponse.json({ error: 'Address not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Map service unavailable' }, { status: 502 });
  }
}
