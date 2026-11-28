import type { AnyBulkWriteOperation, Filter } from 'mongodb';
import clientPromise from './mongodb';
import {
  ACTORS, fetchApifyReviewRun, listSucceededApifyRuns,
  type ReviewFieldKey, type ReviewJob, type ReviewResponse, type ReviewRun,
} from './apify-review';
import type { JobSourceStat } from './stats-calculator';

const DB_NAME = 'job_analytics';
const JOBS_COLLECTION = 'apify_jobs';
const RUNS_COLLECTION = 'apify_ingested_runs';
const COVERAGE_FIELDS: ReviewFieldKey[] = [
  'platform', 'postId', 'postedAt', 'jobUrl', 'title', 'mediaUrl', 'address', 'state',
  'district', 'lingo', 'employmentType', 'jobType', 'salary', 'company',
  'requirement', 'description',
];

interface ArchivedJob extends ReviewJob {
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastSeenRunId: string;
}

interface ArchivedRun extends ReviewRun {
  runId: string;
  ingestedAt: Date;
  archivedCount: number;
}

function malaysiaDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function runStat(run: ReviewRun, jobs: ReviewJob[]): JobSourceStat {
  const missing = { missingTitle: 0, missingDate: 0, missingUrl: 0, missingPostId: 0, missingLocation: 0 };
  let completeFields = 0;
  let hasLocation = 0;
  let within7d = 0;
  let within30d = 0;
  const finished = new Date(run.finishedAt).getTime();
  for (const job of jobs) {
    if (!job.title) missing.missingTitle++;
    if (!job.postedAt) missing.missingDate++;
    if (!job.jobUrl) missing.missingUrl++;
    if (!job.postId) missing.missingPostId++;
    if (!job.address) missing.missingLocation++;
    else hasLocation++;
    if (job.title && job.postedAt && job.jobUrl && job.postId) {
      completeFields++;
      const posted = new Date(job.postedAt).getTime();
      if (posted >= finished - 7 * 86400000 && posted <= finished) within7d++;
      if (posted >= finished - 30 * 86400000 && posted <= finished) within30d++;
    }
  }
  const total = jobs.length;
  const incomplete = total - completeFields;
  const percent = (count: number) => total ? Math.round(count / total * 1000) / 10 : 0;
  return {
    source: run.platform, url: run.actorUrl, sourceType: 'apify', finishedAt: run.finishedAt,
    totalPosts: total, completeFields, completeFieldsPercent: percent(completeFields),
    incompletePosts: incomplete, incompletePostsPercent: percent(incomplete), missing,
    hasLocation, hasLocationPercent: percent(hasLocation), within7d, within30d,
    postIds: jobs.map((job) => job.postId).filter(Boolean), recordedAt: run.finishedAt,
  };
}

async function archiveCollections() {
  const client = await clientPromise;
  if (!client) throw new Error('MONGODB_URI not configured');
  const db = client.db(DB_NAME);
  const jobs = db.collection<ArchivedJob>(JOBS_COLLECTION);
  const runs = db.collection<ArchivedRun>(RUNS_COLLECTION);
  await Promise.all([
    jobs.createIndex({ platform: 1, postId: 1 }, { unique: true, name: 'unique_platform_post' }),
    jobs.createIndex({ postedAt: -1, firstSeenAt: -1 }, { name: 'recent_apify_jobs' }),
    jobs.createIndex({ platform: 1, postedAt: -1 }, { name: 'platform_recent_jobs' }),
    runs.createIndex({ runId: 1 }, { unique: true, name: 'unique_apify_run' }),
    runs.createIndex({ platform: 1, finishedAt: -1 }, { name: 'latest_platform_run' }),
  ]);
  return { db, jobs, runs };
}

async function saveDailySnapshot(db: Awaited<ReturnType<typeof archiveCollections>>['db'], run: ReviewRun, jobs: ReviewJob[]) {
  const collection = db.collection('daily_stats');
  const dateString = malaysiaDate(run.finishedAt);
  const current = await collection.findOne({ source: run.platform, dateString });
  if (current?.finishedAt && current.finishedAt >= run.finishedAt) return;

  const previous = await collection.find({ source: run.platform, dateString: { $lt: dateString } })
    .sort({ dateString: -1 }).limit(1).next();
  const previousIds = new Set<string>(Array.isArray(previous?.postIds) ? previous.postIds : []);
  const stat = runStat(run, jobs);
  const newPosts = stat.postIds?.filter((id) => !previousIds.has(id)).length || 0;
  const now = new Date();
  await collection.updateOne({ source: run.platform, dateString }, {
    $set: {
      ...stat, dateString, newPosts, updatedPosts: stat.postIds!.length - newPosts,
      recordedAtDate: new Date(run.finishedAt), updatedAt: now,
    },
    $setOnInsert: { createdAt: now },
  }, { upsert: true });
}

async function refreshDailyDiffs(db: Awaited<ReturnType<typeof archiveCollections>>['db']) {
  const collection = db.collection('daily_stats');
  for (const actor of ACTORS) {
    const snapshots = await collection.find({ source: actor.platform }).sort({ dateString: 1, finishedAt: 1 }).toArray();
    let previousIds = new Set<string>();
    for (const snapshot of snapshots) {
      const ids: string[] = Array.isArray(snapshot.postIds) ? snapshot.postIds : [];
      const newPosts = ids.filter((id) => !previousIds.has(id)).length;
      const updatedPosts = ids.length - newPosts;
      if (snapshot.newPosts !== newPosts || snapshot.updatedPosts !== updatedPosts) {
        await collection.updateOne({ _id: snapshot._id }, { $set: { newPosts, updatedPosts } });
      }
      previousIds = new Set(ids);
    }
  }
}

export async function syncApifyArchive(limitPerActor = 1) {
  const { db, jobs: collection, runs } = await archiveCollections();
  const refs = await listSucceededApifyRuns(limitPerActor);
  const processed = await runs.find({ runId: { $in: refs.map((run) => run.runId) } })
    .project({ runId: 1 }).toArray();
  const processedIds = new Set(processed.map((run) => run.runId));
  const pending = refs.filter((run) => !processedIds.has(run.runId))
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  let processedRuns = 0;
  let newJobs = 0;
  const errors: string[] = [];

  for (const ref of pending) {
    try {
      const { run, jobs } = await fetchApifyReviewRun(ref);
      if (run.error) throw new Error(run.error);
      const uniqueJobs = Array.from(new Map(jobs.filter((job) => job.postId)
        .map((job) => [job.postId, job])).values());
      const existing = await collection.find({ platform: ref.platform, postId: { $in: uniqueJobs.map((job) => job.postId) } }).toArray();
      const existingById = new Map(existing.map((job) => [job.postId, job]));
      const runDate = new Date(ref.finishedAt);
      const operations: AnyBulkWriteOperation<ArchivedJob>[] = [];
      for (const job of uniqueJobs) {
        const prior = existingById.get(job.postId);
        if (prior?.runFinishedAt && prior.runFinishedAt > ref.finishedAt) {
          if (prior.firstSeenAt > runDate) operations.push({ updateOne: {
            filter: { platform: ref.platform, postId: job.postId }, update: { $min: { firstSeenAt: runDate } },
          } });
          continue;
        }
        const merged = { ...job };
        if (prior) {
          for (const key of Object.keys(merged) as (keyof ReviewJob)[]) {
            if (key === 'platform' || key === 'postId' || key === 'runFinishedAt') continue;
            if ((!merged[key] || (key === 'description' && String(prior[key] || '').length > merged.description.length)) && prior[key]) {
              merged[key] = prior[key];
            }
          }
        }
        operations.push({ updateOne: {
          filter: { platform: ref.platform, postId: job.postId },
          update: {
            $set: { ...merged, lastSeenAt: runDate, lastSeenRunId: ref.runId },
            $setOnInsert: { firstSeenAt: runDate },
          },
          upsert: true,
        } });
      }
      if (operations.length) {
        const result = await collection.bulkWrite(operations, { ordered: false });
        newJobs += result.upsertedCount;
      }
      await saveDailySnapshot(db, run, jobs);
      await runs.updateOne({ runId: ref.runId }, { $setOnInsert: {
        ...run, runId: ref.runId, ingestedAt: new Date(), archivedCount: uniqueJobs.length,
      } }, { upsert: true });
      processedRuns++;
    } catch (error) {
      errors.push(`${ref.platform} ${ref.runId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (processedRuns || limitPerActor > 1) await refreshDailyDiffs(db);
  return { processedRuns, newJobs, totalUnique: await collection.countDocuments(), errors };
}

export interface ArchiveQuery {
  platform?: string;
  search?: string;
  days?: number;
  reviewOnly?: boolean;
  offset?: number;
  limit?: number;
}

export async function readApifyArchive(query: ArchiveQuery = {}): Promise<ReviewResponse> {
  const { jobs, runs } = await archiveCollections();
  const filter: Filter<ArchivedJob> = {};
  if (query.platform === 'Indeed' || query.platform === 'JobStreet') filter.platform = query.platform;
  if (query.days === 7 || query.days === 30) {
    filter.postedAt = { $gte: new Date(Date.now() - query.days * 86400000).toISOString() };
  }
  const conditions: Filter<ArchivedJob>[] = [];
  if (query.reviewOnly) conditions.push({ $or: [{ postedAt: '' }, { jobUrl: '' }, { title: '' }] });
  if (query.search) {
    const pattern = query.search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(pattern, 'i');
    conditions.push({ $or: [
      { title: regex }, { postId: regex }, { company: regex }, { address: regex },
      { state: regex }, { district: regex },
    ] });
  }
  if (conditions.length) filter.$and = conditions;
  const offset = Math.max(0, query.offset || 0);
  const limit = Math.min(500, Math.max(1, query.limit || 100));
  const coverageGroup = Object.fromEntries(COVERAGE_FIELDS.filter((field) => field !== 'platform').map((field) => [
    field,
    { $sum: { $cond: [{ $and: [
      { $ne: [{ $ifNull: [`$${field}`, ''] }, ''] },
      ...(field === 'state' ? [{ $ne: ['$state', 'N'] }] : []),
    ] }, 1, 0] } },
  ]));
  const [records, totalUnique, totalMatches, latest, coverageStats] = await Promise.all([
    jobs.find(filter).sort({ postedAt: -1, firstSeenAt: -1, platform: 1, postId: 1 })
      .skip(offset).limit(limit).project({ _id: 0 }).toArray(),
    jobs.countDocuments(),
    jobs.countDocuments(filter),
    Promise.all(ACTORS.map(async (actor) => runs.find({ platform: actor.platform })
      .sort({ finishedAt: -1 }).limit(1).next())),
    offset === 0
      ? jobs.aggregate<Record<string, unknown>>([{ $group: { _id: '$platform', total: { $sum: 1 }, ...coverageGroup } }]).toArray()
      : Promise.resolve([]),
  ]);
  const uniqueCoverage = offset === 0 ? Object.fromEntries(coverageStats.map((row) => [
    row._id,
    {
      total: Number(row.total),
      coverage: Object.fromEntries(COVERAGE_FIELDS.map((field) => [
        field, field === 'platform' ? Number(row.total) : Number(row[field] || 0),
      ])),
    },
  ])) as ReviewResponse['uniqueCoverage'] : undefined;
  return {
    runs: latest.map((run, index) => run as unknown as ReviewRun || {
      platform: ACTORS[index].platform, actorUrl: ACTORS[index].actorUrl,
      finishedAt: '', recordCount: 0, error: 'No archived run yet',
    }),
    jobs: records as unknown as ReviewJob[],
    fetchedAt: new Date().toISOString(),
    totalUnique,
    uniqueCoverage,
    totalMatches,
    nextOffset: offset + records.length < totalMatches ? offset + records.length : null,
    archived: true,
  };
}
