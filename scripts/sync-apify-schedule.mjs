const token = process.env.APIFY_TOKEN?.trim();
if (!token) {
  console.error('APIFY_TOKEN is required in .env.');
  process.exit(1);
}

const scheduleName = 'job-stats-dashboard-malaysia-7x';
const timezone = 'Asia/Kuala_Lumpur';
const cronExpression = '0 0,3,7,10,14,17,21 * * *';

function input(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return parsed;
}

async function apify(path, method = 'GET', body) {
  const response = await fetch(`https://api.apify.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const detail = String(failure?.error?.message || 'Unknown API error').replaceAll(token, '[redacted]');
    throw new Error(`Apify ${method} ${path} returned HTTP ${response.status}: ${detail}`);
  }
  return (await response.json()).data;
}

const actors = [
  { id: 'curious_coder~indeed-scraper', input: input('APIFY_INDEED_INPUT', { country: 'my', count: 100 }) },
  { id: 'blackfalcondata~jobstreet-scraper', input: input('APIFY_JOBSTREET_INPUT', { country: 'MY', startUrls: ['https://my.jobstreet.com/jobs'], maxResults: 100, sortMode: 'date', dateRange: '31', includeDetails: true, includeApplicantInsights: false }) },
];

const actions = await Promise.all(actors.map(async (actor) => {
  const metadata = await apify(`/actors/${actor.id}`);
  return {
    type: 'RUN_ACTOR',
    actorId: metadata.id,
    runInput: { body: JSON.stringify(actor.input), contentType: 'application/json; charset=utf-8' },
  };
}));

const payload = {
  name: scheduleName,
  title: 'Job dashboard: Indeed + JobStreet 7x',
  description: 'Malaysia job status for the dashboard. Runs both actors seven times per day.',
  isEnabled: true,
  isExclusive: false,
  cronExpression,
  timezone,
  actions,
};

const schedules = await apify('/schedules?limit=1000');
const existing = schedules.items.find((schedule) => schedule.name === scheduleName);
const saved = existing
  ? await apify(`/schedules/${existing.id}`, 'PUT', payload)
  : await apify('/schedules', 'POST', payload);
const verified = await apify(`/schedules/${saved.id}`);
if (
  !verified.isEnabled ||
  verified.actions.length !== actors.length ||
  verified.cronExpression !== cronExpression ||
  verified.timezone !== timezone ||
  !actions.every((action) => verified.actions.some((savedAction) =>
    savedAction.actorId === action.actorId && savedAction.runInput?.body === action.runInput.body))
) {
  throw new Error('Apify schedule verification failed');
}

console.log(`${existing ? 'Updated' : 'Created'} Apify schedule ${saved.id}`);
console.log(`${timezone}: 00:00, 03:00, 07:00, 10:00, 14:00, 17:00, 21:00 daily`);
console.log(`Actors: ${verified.actions.length}; enabled: ${verified.isEnabled}; next run: ${verified.nextRunAt || 'pending'}`);
