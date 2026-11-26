import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

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
    const result = await db.collection('daily_stats').deleteMany({});

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} old snapshot records from daily_stats.`,
      nextStep: 'Starting today, only the 3:00 PM cron job will record fresh daily snapshots.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
