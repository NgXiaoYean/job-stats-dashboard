import type { JobSourceStat } from './stats-calculator';

const ACTORS = [
  { source: 'Indeed', id: 'curious_coder~indeed-scraper', page: 'https://apify.com/curious_coder/indeed-scraper' },
  { source: 'JobStreet', id: 'blackfalcondata~jobstreet-scraper', page: 'https://apify.com/blackfalcondata/jobstreet-scraper' },
] as const;

type Job = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function date(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jobFields(source: string, job: Job) {
  const id = text(source === 'Indeed' ? job.id : job.jobId ?? job.seekJobId);
  const title = text(job.title);
  const rawUrl = text(source === 'Indeed' ? job.viewJobLink || job.originalApplyUrl : job.canonicalUrl);
  const url = source === 'Indeed' && rawUrl.startsWith('/')
    ? `https://malaysia.indeed.com${rawUrl}`
    : rawUrl;
  const posted = date(source === 'Indeed' ? job.pubDate : job.postedDate);
  const location = text(source === 'Indeed' ? job.formattedLocation : job.location);
  return {
    id,
    title,
    validUrl: /^https?:\/\//i.test(url),
    posted,
    hasLocation: Boolean(location),
  };
}

function emptyStat(source: string, url: string, error: string): JobSourceStat {
  return {
    source,
    url,
    sourceType: 'apify',
    totalPosts: 0,
    completeFields: 0,
    completeFieldsPercent: 0,
    incompletePosts: 0,
    incompletePostsPercent: 0,
    missing: { missingTitle: 0, missingDate: 0, missingUrl: 0, missingPostId: 0, missingLocation: 0 },
    hasLocation: 0,
    hasLocationPercent: 0,
    within7d: 0,
    within30d: 0,
    recordedAt: new Date().toISOString(),
    error,
  };
}

async function getJson(url: string, token: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Apify returned HTTP ${response.status}`);
  return response.json();
}

async function latestActorStat(actor: typeof ACTORS[number], token: string): Promise<JobSourceStat> {
  try {
    const result = await getJson(`https://api.apify.com/v2/actors/${actor.id}/runs/last?status=SUCCEEDED`, token);
    const run = result?.data;
    if (!run?.defaultDatasetId || !run?.finishedAt) {
      return emptyStat(actor.source, actor.page, 'No successful run yet');
    }

    const jobs: Job[] = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const page = await getJson(
        `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true&offset=${offset}&limit=1000`,
        token,
      );
      if (!Array.isArray(page)) throw new Error('Invalid Apify dataset response');
      jobs.push(...page.filter((item): item is Job => item !== null && typeof item === 'object' && !Array.isArray(item)));
      if (page.length < 1000) break;
      if (offset === 9000) throw new Error('Apify dataset exceeds 10,000 items');
    }

    // These counts describe the completed run, so anchor the windows to its finish time.
    const asOf = new Date(run.finishedAt).getTime();
    const day = 24 * 60 * 60 * 1000;
    const missing = { missingTitle: 0, missingDate: 0, missingUrl: 0, missingPostId: 0, missingLocation: 0 };
    let completeFields = 0;
    let hasLocation = 0;
    let within7d = 0;
    let within30d = 0;

    for (const job of jobs) {
      const fields = jobFields(actor.source, job);
      if (!fields.id) missing.missingPostId++;
      if (!fields.title) missing.missingTitle++;
      if (!fields.validUrl) missing.missingUrl++;
      if (!fields.posted) missing.missingDate++;
      if (!fields.hasLocation) missing.missingLocation++;
      else hasLocation++;

      if (fields.id && fields.title && fields.validUrl && fields.posted) {
        completeFields++;
        if (fields.posted.getTime() >= asOf - 7 * day && fields.posted.getTime() <= asOf) within7d++;
        if (fields.posted.getTime() >= asOf - 30 * day && fields.posted.getTime() <= asOf) within30d++;
      }
    }

    const total = jobs.length;
    const incompletePosts = total - completeFields;
    return {
      source: actor.source,
      url: actor.page,
      sourceType: 'apify',
      finishedAt: run.finishedAt,
      totalPosts: total,
      completeFields,
      completeFieldsPercent: total ? Math.round(completeFields / total * 1000) / 10 : 0,
      incompletePosts,
      incompletePostsPercent: total ? Math.round(incompletePosts / total * 1000) / 10 : 0,
      missing,
      hasLocation,
      hasLocationPercent: total ? Math.round(hasLocation / total * 1000) / 10 : 0,
      within7d,
      within30d,
      recordedAt: run.finishedAt,
    };
  } catch (error) {
    return emptyStat(actor.source, actor.page, error instanceof Error ? error.message : 'Apify request failed');
  }
}

export async function fetchLatestApifyStats(): Promise<JobSourceStat[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return ACTORS.map((actor) => emptyStat(actor.source, actor.page, 'APIFY_TOKEN not configured'));
  return Promise.all(ACTORS.map((actor) => latestActorStat(actor, token)));
}
