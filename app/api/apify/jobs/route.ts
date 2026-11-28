import { NextResponse } from 'next/server';
import { fetchApifyReview } from '@/lib/apify-review';
import { readApifyArchive, syncApifyArchive } from '@/lib/apify-archive';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = {
    platform: params.get('platform') || undefined,
    search: params.get('search') || undefined,
    days: Number(params.get('days')) || undefined,
    reviewOnly: params.get('reviewOnly') === '1',
    offset: Number(params.get('offset')) || 0,
    limit: Number(params.get('limit')) || 100,
  };
  if (!process.env.MONGODB_URI) {
    const review = await fetchApifyReview();
    const filtered = review.jobs.filter((job) =>
      (!query.platform || query.platform === 'all' || job.platform === query.platform) &&
      (!query.days || (job.postedAt && new Date(job.postedAt).getTime() >= Date.now() - query.days * 86400000)) &&
      (!query.reviewOnly || !job.postedAt || !job.jobUrl || !job.title) &&
      (!query.search || [job.title, job.postId, job.company, job.address, job.state, job.district]
        .some((field) => field.toLowerCase().includes(query.search!.toLowerCase()))));
    return NextResponse.json({
      ...review, jobs: filtered.slice(query.offset, query.offset + query.limit),
      totalUnique: review.jobs.length, totalMatches: filtered.length,
      nextOffset: query.offset + query.limit < filtered.length ? query.offset + query.limit : null,
      archived: false,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  let syncError = '';
  if (params.get('sync') !== '0') {
    try {
      const result = await syncApifyArchive(1);
      if (result.errors.length) syncError = 'Some latest Apify runs could not be archived.';
    } catch (error) {
      console.error('Apify archive sync failed:', error);
      syncError = 'The latest Apify runs could not be archived.';
    }
  }
  try {
    const review = await readApifyArchive(query);
    return NextResponse.json({ ...review, syncError }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Apify archive read failed:', error);
    return NextResponse.json({ error: 'Could not read archived Apify jobs' }, { status: 500 });
  }
}
