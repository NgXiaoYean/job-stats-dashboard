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
        mongoMessage = 'Daily snapshots active (saves at 3:00 PM)';
        const db = client.db('job_analytics');

        // Automatically purge any lingering obsolete subcategory records
        await db.collection('daily_stats').deleteMany({ source: { $regex: /^JobHunter \(/ } });

        // Fetch snapshots recorded by cron (sorted by date desc, then source name asc)
        const rawHistory = await db
          .collection('daily_stats')
          .find({ source: { $not: /^JobHunter \(/ } })
          .sort({ recordedAtDate: -1, createdAt: -1, source: 1 })
          .limit(500)
          .toArray();

        const mapped = rawHistory.map((doc: any) => {
          const recDate = doc.recordedAtDate || doc.recordedAt || new Date();
          const d = new Date(recDate);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const fallbackDateStr = `${y}-${m}-${day}`;

          return {
            ...doc,
            createdAt: doc.createdAt || doc.recordedAtDate || doc.recordedAt,
            updatedAt: doc.updatedAt || doc.recordedAtDate || doc.recordedAt,
            dateString: doc.dateString || fallbackDateStr,
          };
        });

        // Deduplicate: Keep only the latest snapshot per platform per day
        const seenDayPlatform = new Set<string>();
        const duplicateIds: any[] = [];
        history = [];

        for (const doc of mapped) {
          const key = `${doc.dateString}_${doc.source}`;
          if (!seenDayPlatform.has(key)) {
            seenDayPlatform.add(key);
            history.push(doc);
          } else {
            // Older duplicate snapshot from repeated page visits on the same day
            if (doc._id) duplicateIds.push(doc._id);
          }
        }

        // Purge older duplicate entries from MongoDB so database stays clean
        if (duplicateIds.length > 0) {
          await db.collection('daily_stats').deleteMany({ _id: { $in: duplicateIds } });
        }
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
