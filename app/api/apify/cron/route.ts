import { NextResponse } from 'next/server';
import { syncApifyArchive } from '@/lib/apify-archive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  try {
    const result = await syncApifyArchive(20);
    return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
  } catch (error) {
    console.error('Apify daily archive failed:', error);
    return NextResponse.json({ error: 'Apify daily archive failed' }, { status: 500 });
  }
}
