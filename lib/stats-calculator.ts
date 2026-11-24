export interface JobSourceStat {
  source: string;
  url: string;
  totalPosts: number;
  completeFields: number;
  completeFieldsPercent: number;
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

      for (const item of items) {
        const title = Boolean(item.title?.trim());
        const link = Boolean(item.url || item.link);
        const author = Boolean(
          typeof item.author === 'string'
            ? item.author.trim()
            : item.author?.name?.trim()
        );
        const summary = (item.content_html || item.summary || '').toString();
        const desc = Boolean(summary.trim());
        const tags: string[] = Array.isArray(item.tags)
          ? item.tags
          : Array.isArray(item.category)
          ? item.category
          : [];

        // Check publication dates
        const dateStr = item.date_published || item.pubDate;
        let hasValidDate = false;
        if (dateStr) {
          const pubDate = new Date(dateStr);
          if (!Number.isNaN(pubDate.getTime())) {
            hasValidDate = true;
            if (pubDate >= day7Ago) within7d++;
            if (pubDate >= day30Ago) within30d++;
          }
        }

        // Check location presence
        const tagsContainLocation = tags.some((tag) => {
          const lower = String(tag).toLowerCase();
          return MALAYSIAN_LOCATIONS.some((loc) => lower.includes(loc));
        });

        const summaryContainsLocation =
          /location\s*[:•-]/i.test(summary) ||
          MALAYSIAN_LOCATIONS.some((loc) => summary.toLowerCase().includes(loc));

        if (tagsContainLocation || summaryContainsLocation) {
          hasLocation++;
        }

        // All critical fields complete
        if (title && link && author && desc && hasValidDate && tags.length > 0) {
          completeFields++;
        }
      }

      const total = items.length;
      results.push({
        source: s.name,
        url: endpoint,
        totalPosts: total,
        completeFields,
        completeFieldsPercent: total ? Math.round((completeFields / total) * 1000) / 10 : 0,
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
