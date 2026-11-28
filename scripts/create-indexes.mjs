import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required. Add it to .env before running this script.');
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const collection = client.db('job_analytics').collection('daily_stats');
  const indexes = await collection.createIndexes([
    { key: { source: 1, dateString: 1 }, name: 'source_date' },
    {
      key: { recordedAtDate: -1, createdAt: -1, source: 1 },
      name: 'recent_snapshots',
    },
  ]);
  console.log(`Ready: ${indexes.join(', ')}`);
  const jobs = client.db('job_analytics').collection('apify_jobs');
  const runs = client.db('job_analytics').collection('apify_ingested_runs');
  await Promise.all([
    jobs.createIndex({ platform: 1, postId: 1 }, { unique: true, name: 'unique_platform_post' }),
    jobs.createIndex({ postedAt: -1, firstSeenAt: -1 }, { name: 'recent_apify_jobs' }),
    jobs.createIndex({ platform: 1, postedAt: -1 }, { name: 'platform_recent_jobs' }),
    runs.createIndex({ runId: 1 }, { unique: true, name: 'unique_apify_run' }),
    runs.createIndex({ platform: 1, finishedAt: -1 }, { name: 'latest_platform_run' }),
  ]);
  console.log('Ready: Apify job and run indexes');
} finally {
  await client.close();
}
