import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { fetchAndComputeStats } from '@/lib/stats-calculator';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customBaseUrl = searchParams.get('baseUrl') || undefined;

  // 1. Compute live statistics from the feeds
  const stats = await fetchAndComputeStats(customBaseUrl);

  // 2. Try to connect to MongoDB (with diagnostic feedback)
  let mongoConnected = false;
  let mongoMessage = '';
  let history: any[] = [];

  if (!process.env.MONGODB_URI) {
    mongoMessage = 'MONGODB_URI not detected. (If you just added it in Vercel Settings, you must click Redeploy for it to take effect)';
  } else {
    try {
      const client = await clientPromise;
      if (client) {
        // Verify connection with ping
        await client.db('admin').command({ ping: 1 });
        mongoConnected = true;
        mongoMessage = 'Connected to MongoDB Atlas (Daily Snapshots at 3:00 PM)';
        const db = client.db('job_analytics');

        // Fetch snapshots recorded by 3:00 PM cron (sorted by date desc, then source name asc)
        history = await db
          .collection('daily_stats')
          .find({})
          .sort({ recordedAtDate: -1, source: 1 })
          .limit(60)
          .toArray();
      } else {
        mongoMessage = 'MongoClient failed to initialize.';
      }
    } catch (err: any) {
      console.error('MongoDB operation error:', err);
      mongoMessage = `Connection error: ${err.message || err}`;
    }
  }

  return NextResponse.json({
    live: stats,
    history,
    mongoConnected,
    mongoMessage,
    fetchedAt: new Date().toISOString(),
  });
}
