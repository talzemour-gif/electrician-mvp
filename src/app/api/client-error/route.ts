import { NextResponse } from 'next/server';

type ClientErrorReport = {
  digest?: unknown;
  path?: unknown;
  source?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as ClientErrorReport;
    const report = {
      digest: typeof body.digest === 'string' ? body.digest.slice(0, 100) : undefined,
      path: typeof body.path === 'string' ? body.path.slice(0, 300) : undefined,
      source: typeof body.source === 'string' ? body.source.slice(0, 50) : 'client',
      occurredAt: new Date().toISOString(),
    };

    console.error('[client-error]', report);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Invalid error report' }, { status: 400 });
  }
}
