import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { fetchAndComputeStats } from '@/lib/stats-calculator';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customBaseUrl = searchParams.get('baseUrl') || undefined;

  // 1. Compute live statistics from the feeds
  const stats = await fetchAndComputeStats(customBaseUrl);

  // 2. Try to connect to MongoDB (if configured)
  let mongoConnected = false;
  let history: any[] = [];

  try {
    const client = await clientPromise;
    if (client) {
      mongoConnected = true;
      const db = client.db('job_analytics');

      // Save this snapshot
      if (stats.some((s) => s.totalPosts > 0)) {
        await db.collection('daily_stats').insertMany(
          stats.map((s) => ({
            ...s,
            recordedAtDate: new Date(s.recordedAt),
          }))
        );
      }

      // Fetch the last 20 snapshots
      history = await db
        .collection('daily_stats')
        .find({})
        .sort({ recordedAtDate: -1 })
        .limit(20)
        .toArray();
    }
  } catch (err) {
    console.warn('MongoDB operation skipped or failed:', err);
  }

  return NextResponse.json({
    live: stats,
    history,
    mongoConnected,
    fetchedAt: new Date().toISOString(),
  });
}
