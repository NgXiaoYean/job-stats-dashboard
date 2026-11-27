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
      const collection = db.collection('daily_stats');

      // Purge any obsolete subcategory records
      await collection.deleteMany({ source: { $regex: /^JobHunter \(/ } });

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const operations = stats.map((s) => ({
        updateOne: {
          filter: { source: s.source, dateString },
          update: {
            $set: {
              ...s,
              dateString,
              updatedAt: now,
              recordedAtDate: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          },
          upsert: true,
        },
      }));

      await collection.bulkWrite(operations);

      return NextResponse.json({ success: true, count: stats.length, date: dateString, savedToMongo: true });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: stats.length, savedToMongo: false });
}
