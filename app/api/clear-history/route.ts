import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { fetchAndComputeStats } from '@/lib/stats-calculator';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const confirm = searchParams.get('confirm');

  if (confirm !== 'true') {
    return NextResponse.json(
      {
        error: 'Please add ?confirm=true to confirm clearing MongoDB history snapshot records.',
      },
      { status: 400 }
    );
  }

  try {
    const client = await clientPromise;
    if (!client) {
      return NextResponse.json({ error: 'MongoDB client not initialized.' }, { status: 500 });
    }

    const db = client.db('job_analytics');
    const collection = db.collection('daily_stats');
    const result = await collection.deleteMany({});

    // Record today's clean 12 platforms as the initial baseline
    const stats = await fetchAndComputeStats();
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
            newPosts: s.totalPosts,
            updatedPosts: 0,
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

    return NextResponse.json({
      success: true,
      message: `Successfully reset history and initialized clean baseline for ${stats.length} platforms.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
