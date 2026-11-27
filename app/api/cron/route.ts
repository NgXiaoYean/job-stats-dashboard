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

      // Find previous day's snapshot for each source to diff new vs existed posts
      const previousSnapshots = await collection
        .find({ dateString: { $ne: dateString } })
        .sort({ recordedAtDate: -1 })
        .toArray();

      const prevMap = new Map<string, Set<string>>();
      for (const p of previousSnapshots) {
        if (!prevMap.has(p.source) && Array.isArray(p.postIds)) {
          prevMap.set(p.source, new Set(p.postIds));
        }
      }

      const operations = stats.map((s) => {
        const currentIds: string[] = s.postIds || [];
        const prevSet = prevMap.get(s.source);

        let newPosts = currentIds.length;
        let updatedPosts = 0;

        if (prevSet && prevSet.size > 0) {
          newPosts = currentIds.filter((id) => !prevSet.has(id)).length;
          updatedPosts = currentIds.filter((id) => prevSet.has(id)).length;
        }

        return {
          updateOne: {
            filter: { source: s.source, dateString },
            update: {
              $set: {
                ...s,
                dateString,
                newPosts,
                updatedPosts,
                updatedAt: now,
                recordedAtDate: now,
              },
              $setOnInsert: {
                createdAt: now,
              },
            },
            upsert: true,
          },
        };
      });

      await collection.bulkWrite(operations);

      return NextResponse.json({ success: true, count: stats.length, date: dateString, savedToMongo: true });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: stats.length, savedToMongo: false });
}
