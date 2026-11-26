export interface MissingFieldsBreakdown {
  missingTitle: number;
  missingDate: number;
  missingUrl: number;
  missingPostId: number;
  missingLocation: number;
}

export interface JobSourceStat {
  source: string;
  url: string;
  totalPosts: number;
  completeFields: number;
  completeFieldsPercent: number;
  incompletePosts: number;
  incompletePostsPercent: number;
  missing: MissingFieldsBreakdown;
  hasLocation: number;
  hasLocationPercent: number;
  within7d: number;
  within30d: number;
  recordedAt: string;
  error?: string;
}

const MALAYSIAN_LOCATIONS = [
  'kuala lumpur', 'kl', 'selangor', 'penang', 'pulau pinang', 'johor',
  'perak', 'kedah', 'melaka', 'malacca', 'negeri sembilan', 'pahang',
  'terengganu', 'kelantan', 'sabah', 'sarawak', 'putrajaya', 'labuan',
  'petaling jaya', 'shah alam', 'subang', 'cheras', 'klang', 'puchong',
  'cyberjaya', 'bukit mertajam', 'george town', 'johor bahru', 'ipoh',
  'kota kinabalu', 'kuching'
];

export async function fetchAndComputeStats(baseUrl?: string): Promise<JobSourceStat[]> {
  const root = baseUrl || process.env.RSSHUB_BASE_URL || 'http://localhost:1200';
  const cleanRoot = root.replace(/\/$/, '');

  const sources = [
    { name: 'Maukerja', path: '/maukerja/jobs' },
    { name: 'GoGet', path: '/goget/jobs' },
    { name: 'FastJobs', path: '/fastjobs/jobs' },
    { name: 'Troopers', path: '/troopers/jobs' },
  ];

  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const results: JobSourceStat[] = [];

  for (const s of sources) {
    const endpoint = `${cleanRoot}${s.path}?format=json&limit=100`;
    try {
      const res = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'JobStatsDashboard/1.0',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const items: any[] = data.items || [];

      let within7d = 0;
      let within30d = 0;
      let completeFields = 0;
      let hasLocation = 0;

      let missingTitle = 0;
      let missingDate = 0;
      let missingUrl = 0;
      let missingPostId = 0;
      let missingLocation = 0;

      for (const item of items) {
        // 1. Post ID check
        const rawId = item.id || item.guid;
        const postId = typeof rawId === 'string' && rawId.trim().length > 0;

        // 2. Title check
        const rawTitle = item.title;
        const title = typeof rawTitle === 'string' && rawTitle.trim().length > 0;

        // 3. URL (Job) check
        const rawUrl = item.url || item.link;
        const link = typeof rawUrl === 'string' && (rawUrl.trim().startsWith('http://') || rawUrl.trim().startsWith('https://'));

        // 4. PostedDate + Time check
        const dateStr = item.date_published || item.pubDate;
        let hasValidDate = false;
        let pubDateObj: Date | null = null;
        if (dateStr) {
          const parsed = new Date(dateStr);
          if (!Number.isNaN(parsed.getTime())) {
            hasValidDate = true;
            pubDateObj = parsed;
          }
        }

        // Track missing counts for individual fields
        if (!postId) missingPostId++;
        if (!title) missingTitle++;
        if (!link) missingUrl++;
        if (!hasValidDate) missingDate++;

        // Location check
        const tags: string[] = Array.isArray(item.tags)
          ? item.tags
          : Array.isArray(item.category)
          ? item.category
          : [];
        const summary = (item.content_html || item.summary || '').toString();

        const tagsContainLocation = tags.some((tag) => {
          const lower = String(tag).toLowerCase();
          return MALAYSIAN_LOCATIONS.some((loc) => lower.includes(loc));
        });

        const summaryContainsLocation =
          /location\s*[:•-]/i.test(summary) ||
          MALAYSIAN_LOCATIONS.some((loc) => summary.toLowerCase().includes(loc));

        if (tagsContainLocation || summaryContainsLocation) {
          hasLocation++;
        } else {
          missingLocation++;
        }

        // Complete: Has all compulsory fields (Post ID, PostedDate + Time, URL, and Title)
        const isComplete = postId && hasValidDate && link && title;
        if (isComplete && pubDateObj) {
          completeFields++;
          // ONLY count past 7 days and 30 days if the post has ALL compulsory fields:
          if (pubDateObj >= day7Ago) within7d++;
          if (pubDateObj >= day30Ago) within30d++;
        }
      }

      const total = items.length;
      const incompletePosts = Math.max(0, total - completeFields);

      results.push({
        source: s.name,
        url: endpoint,
        totalPosts: total,
        completeFields,
        completeFieldsPercent: total ? Math.round((completeFields / total) * 1000) / 10 : 0,
        incompletePosts,
        incompletePostsPercent: total ? Math.round((incompletePosts / total) * 1000) / 10 : 0,
        missing: {
          missingTitle,
          missingDate,
          missingUrl,
          missingPostId,
          missingLocation,
        },
        hasLocation,
        hasLocationPercent: total ? Math.round((hasLocation / total) * 1000) / 10 : 0,
        within7d,
        within30d,
        recordedAt: now.toISOString(),
      });
    } catch (err: any) {
      results.push({
        source: s.name,
        url: endpoint,
        totalPosts: 0,
        completeFields: 0,
        completeFieldsPercent: 0,
        incompletePosts: 0,
        incompletePostsPercent: 0,
        missing: {
          missingTitle: 0,
          missingDate: 0,
          missingUrl: 0,
          missingPostId: 0,
          missingLocation: 0,
        },
        hasLocation: 0,
        hasLocationPercent: 0,
        within7d: 0,
        within30d: 0,
        recordedAt: now.toISOString(),
        error: err.message || 'Failed to fetch feed',
      });
    }
  }

  return results;
}
