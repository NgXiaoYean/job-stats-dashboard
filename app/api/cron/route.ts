import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { fetchAndComputeStats } from '@/lib/stats-calculator';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Optional security check if CRON_SECRET is configured in Vercel
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const stats = await fetchAndComputeStats();

  try {
    const client = await clientPromise;
    if (client) {
      const db = client.db('job_analytics');
      await db.collection('daily_stats').insertMany(
        stats.map((s) => ({
          ...s,
          recordedAtDate: new Date(s.recordedAt),
        }))
      );
      return NextResponse.json({ success: true, count: stats.length, savedToMongo: true });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: stats.length, savedToMongo: false });
}
