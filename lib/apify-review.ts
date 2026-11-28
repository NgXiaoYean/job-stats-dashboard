export interface ReviewJob {
  platform: 'Indeed' | 'JobStreet';
  postId: string;
  postedAt: string;
  jobUrl: string;
  title: string;
  mediaUrl: string;
  address: string;
  state: string;
  district: string;
  lingo: string;
  employmentType: string;
  jobType: string;
  salary: string;
  company: string;
  requirement: string;
  description: string;
  runFinishedAt: string;
}

export interface ReviewRun {
  platform: ReviewJob['platform'];
  actorUrl: string;
  finishedAt: string;
  recordCount: number;
  runId?: string;
  coverage?: Record<ReviewFieldKey, number>;
  coreComplete?: number;
  within7d?: number;
  within30d?: number;
  error?: string;
}

export type ReviewFieldKey = Exclude<keyof ReviewJob, 'runFinishedAt'>;

export interface ApifyRunRef {
  platform: ReviewJob['platform'];
  actorUrl: string;
  runId: string;
  datasetId: string;
  finishedAt: string;
}

export interface ReviewResponse {
  runs: ReviewRun[];
  jobs: ReviewJob[];
  fetchedAt: string;
  totalUnique?: number;
  totalMatches?: number;
  nextOffset?: number | null;
  archived?: boolean;
  syncError?: string;
}

export const ACTORS = [
  { platform: 'Indeed', id: 'curious_coder~indeed-scraper', actorUrl: 'https://apify.com/curious_coder/indeed-scraper' },
  { platform: 'JobStreet', id: 'blackfalcondata~jobstreet-scraper', actorUrl: 'https://apify.com/blackfalcondata/jobstreet-scraper' },
] as const;

const STATE_CODES: Record<string, string> = {
  M01: 'Johor', M02: 'Kedah', M03: 'Kelantan', M04: 'Melaka',
  M05: 'Negeri Sembilan', M06: 'Pahang', M07: 'Pulau Pinang',
  M08: 'Perak', M09: 'Perlis', M10: 'Selangor', M11: 'Terengganu',
  M12: 'Sabah', M13: 'Sarawak', M14: 'Kuala Lumpur',
  M15: 'Labuan', M16: 'Putrajaya',
};

const STATE_NAMES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Pulau Pinang', 'Perak', 'Perlis', 'Selangor', 'Terengganu', 'Sabah',
  'Sarawak', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
];

type RecordValue = Record<string, any>;

function value(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'number') return String(input);
  return '';
}

function asRecord(input: unknown): RecordValue {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as RecordValue : {};
}

function dateIso(input: unknown): string {
  if (input === null || input === undefined || input === '') return '';
  const date = new Date(input as string | number);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function absoluteUrl(input: unknown, origin?: string): string {
  const raw = value(input);
  if (raw.startsWith('/') && origin) return `${origin}${raw}`;
  return /^https?:\/\//i.test(raw) ? raw : '';
}

function locationParts(input: unknown): { state: string; district: string } {
  const parts = value(input).split(',').map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1)?.toLowerCase();
  const alias = last === 'penang' ? 'Pulau Pinang' : last === 'malacca' ? 'Melaka' : '';
  const state = alias || STATE_NAMES.find((name) => name.toLowerCase() === last) || '';
  return { state, district: state && parts.length > 1 ? parts.slice(0, -1).join(', ') : '' };
}

function salaryText(job: RecordValue, platform: ReviewJob['platform']): string {
  if (platform === 'JobStreet') {
    const listed = value(job.salaryText);
    if (listed) return listed;
  }
  const salary = platform === 'Indeed' ? asRecord(job.salary) : job;
  const low = salary.min ?? salary.salaryMin;
  const high = salary.max ?? salary.salaryMax;
  if (typeof low !== 'number' && typeof high !== 'number') return '';
  const currency = value(salary.currencyCode ?? salary.salaryCurrency) || 'MYR';
  const format = (amount: number) => new Intl.NumberFormat('en-MY', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  const range = typeof low === 'number' && typeof high === 'number'
    ? `${format(low)} – ${format(high)}`
    : format((low ?? high) as number);
  const period = value(salary.type ?? salary.salaryType).toLowerCase();
  return period ? `${range} / ${period}` : range;
}

function requirementFromDescription(description: string): string {
  if (!description) return '';
  const lines = description.replace(/\r/g, '').split('\n').map((line) => line.trim());
  const cleanHeading = (line: string) => line.replace(/^[*#\s]+|[*#\s]+$/g, '').trim();
  const heading = /^(?:job\s+)?(?:requirements?|qualifications?|what we(?:'re| are) looking for|what you need|kelayakan|syarat(?:[- ]syarat)?|keperluan)\s*:?$/i;
  const nextSection = /^(?:benefits?|perks?|salary|pay|how to apply|responsibilities?|duties|job description|working hours?|about (?:the role|us))\s*:?$/i;
  const start = lines.findIndex((line) => heading.test(cleanHeading(line)));
  if (start < 0) return '';
  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (collected.length && (nextSection.test(cleanHeading(line)) || heading.test(cleanHeading(line)))) break;
    if (line) collected.push(line);
    if (collected.length >= 12) break;
  }
  return collected.join('\n').slice(0, 2000);
}

function normalizeIndeed(job: RecordValue, finishedAt: string): ReviewJob {
  const location = asRecord(job.location);
  const company = asRecord(job.companyDetails);
  const jobTypes = Array.isArray(job.jobTypes) ? job.jobTypes.map(value).filter(Boolean) : [];
  const employmentTypes = jobTypes.filter((type: string) => /full[ -]?time|part[ -]?time|contract|temporary|intern|freelance|casual/i.test(type));
  const occupations = Array.isArray(job.occupations)
    ? job.occupations.map((item: unknown) => value(asRecord(item).label)).filter(Boolean)
    : [];
  const description = value(job.jobDescription);
  const sourceName = value(job.jobSourceName);
  return {
    platform: 'Indeed',
    postId: value(job.id),
    postedAt: dateIso(job.pubDate),
    jobUrl: absoluteUrl(job.viewJobLink, 'https://malaysia.indeed.com') || absoluteUrl(job.originalApplyUrl),
    title: value(job.title),
    mediaUrl: absoluteUrl(company.logoUrl),
    address: value(location.fullAddress) || value(location.streetAddress) || value(job.formattedLocation),
    state: value(location.state) || value(location.admin1Name) || STATE_CODES[value(location.admin1Code)] || 'N',
    district: value(location.admin2Name) || value(location.city) || value(job.jobLocationCity),
    lingo: value(job.language),
    employmentType: employmentTypes.join(', '),
    jobType: occupations.slice(0, 3).join(', ') || jobTypes.filter((type: string) => !employmentTypes.includes(type)).join(', '),
    salary: salaryText(job, 'Indeed'),
    company: value(company.name) || (/^indeed$/i.test(sourceName) ? '' : sourceName),
    requirement: requirementFromDescription(description),
    description,
    runFinishedAt: finishedAt,
  };
}

function normalizeJobStreet(job: RecordValue, finishedAt: string): ReviewJob {
  const fullDescription = value(job.description) || value(job.descriptionMarkdown);
  const description = fullDescription || value(job.teaser);
  const location = locationParts(job.location);
  return {
    platform: 'JobStreet',
    postId: value(job.seekJobId) || value(job.jobId),
    postedAt: dateIso(job.postedDate),
    jobUrl: absoluteUrl(job.canonicalUrl) || absoluteUrl(job.sourceUrl),
    title: value(job.title),
    mediaUrl: absoluteUrl(job.companyLogo) || absoluteUrl(job.companyCoverImageUrl),
    address: value(job.location),
    state: value(job.locationState) || location.state || 'N',
    district: value(job.locationSuburb) || location.district,
    lingo: value(job.language),
    employmentType: value(job.employmentType),
    jobType: [value(job.category), value(job.subCategory)].filter(Boolean).join(' / '),
    salary: salaryText(job, 'JobStreet'),
    company: value(job.company),
    requirement: requirementFromDescription(fullDescription),
    description,
    runFinishedAt: finishedAt,
  };
}

async function getJson(url: string, token: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Apify returned HTTP ${response.status}`);
  return response.json();
}

export function summarizeRun(run: ReviewRun, jobs: ReviewJob[]): ReviewRun {
  const fields: ReviewFieldKey[] = [
    'platform', 'postId', 'postedAt', 'jobUrl', 'title', 'mediaUrl', 'address',
    'state', 'district', 'lingo', 'employmentType', 'jobType', 'salary',
    'company', 'requirement', 'description',
  ];
  const coverage = Object.fromEntries(fields.map((field) => [field, jobs.filter((job) =>
    Boolean(job[field]) && (field !== 'state' || job.state !== 'N')).length])) as Record<ReviewFieldKey, number>;
  const finished = new Date(run.finishedAt).getTime();
  const inWindow = (job: ReviewJob, days: number) => {
    const posted = new Date(job.postedAt).getTime();
    return Number.isFinite(posted) && posted >= finished - days * 86400000 && posted <= finished;
  };
  return {
    ...run,
    coverage,
    coreComplete: jobs.filter((job) => job.postId && job.postedAt && job.jobUrl && job.title).length,
    within7d: jobs.filter((job) => inWindow(job, 7)).length,
    within30d: jobs.filter((job) => inWindow(job, 30)).length,
  };
}

async function getActorReview(actor: typeof ACTORS[number], token: string, specifiedRun?: ApifyRunRef): Promise<{ run: ReviewRun; jobs: ReviewJob[] }> {
  try {
    const latest = specifiedRun
      ? { id: specifiedRun.runId, defaultDatasetId: specifiedRun.datasetId, finishedAt: specifiedRun.finishedAt }
      : (await getJson(`https://api.apify.com/v2/actors/${actor.id}/runs/last?status=SUCCEEDED`, token))?.data;
    if (!latest?.defaultDatasetId || !latest?.finishedAt) {
      return { run: { platform: actor.platform, actorUrl: actor.actorUrl, finishedAt: '', recordCount: 0, error: 'No successful run yet' }, jobs: [] };
    }
    const jobs: ReviewJob[] = [];
    for (let offset = 0; offset < 5000; offset += 1000) {
      const items = await getJson(`https://api.apify.com/v2/datasets/${latest.defaultDatasetId}/items?format=json&clean=true&offset=${offset}&limit=1000`, token);
      if (!Array.isArray(items)) throw new Error('Invalid Apify dataset response');
      for (const item of items) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          jobs.push(actor.platform === 'Indeed'
            ? normalizeIndeed(item, latest.finishedAt)
            : normalizeJobStreet(item, latest.finishedAt));
        }
      }
      if (items.length < 1000) break;
      if (offset === 4000) throw new Error('Dataset exceeds the 5,000-row review limit');
    }
    return {
      run: summarizeRun({ platform: actor.platform, actorUrl: actor.actorUrl, finishedAt: latest.finishedAt, recordCount: jobs.length, runId: latest.id }, jobs),
      jobs,
    };
  } catch (error) {
    return {
      run: { platform: actor.platform, actorUrl: actor.actorUrl, finishedAt: '', recordCount: 0, error: error instanceof Error ? error.message : 'Apify request failed' },
      jobs: [],
    };
  }
}

export async function listSucceededApifyRuns(limitPerActor = 20): Promise<ApifyRunRef[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error('APIFY_TOKEN not configured');
  const lists = await Promise.all(ACTORS.map(async (actor) => {
    const response = await getJson(`https://api.apify.com/v2/actors/${actor.id}/runs?status=SUCCEEDED&limit=${limitPerActor}&desc=true`, token);
    return (response?.data?.items || []).filter((run: any) => run.id && run.defaultDatasetId && run.finishedAt)
      .map((run: any): ApifyRunRef => ({
        platform: actor.platform,
        actorUrl: actor.actorUrl,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        finishedAt: run.finishedAt,
      }));
  }));
  return lists.flat();
}

export async function fetchApifyReviewRun(ref: ApifyRunRef): Promise<{ run: ReviewRun; jobs: ReviewJob[] }> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error('APIFY_TOKEN not configured');
  const actor = ACTORS.find((item) => item.platform === ref.platform);
  if (!actor) throw new Error(`Unknown Apify platform: ${ref.platform}`);
  return getActorReview(actor, token, ref);
}

export async function fetchApifyReview(): Promise<ReviewResponse> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return {
      runs: ACTORS.map((actor) => ({ platform: actor.platform, actorUrl: actor.actorUrl, finishedAt: '', recordCount: 0, error: 'APIFY_TOKEN not configured' })),
      jobs: [],
      fetchedAt: new Date().toISOString(),
    };
  }
  const results = await Promise.all(ACTORS.map((actor) => getActorReview(actor, token)));
  return { runs: results.map((result) => result.run), jobs: results.flatMap((result) => result.jobs), fetchedAt: new Date().toISOString() };
}
