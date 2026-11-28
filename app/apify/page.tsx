'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Download, Filter, RefreshCw, Search, X } from 'lucide-react';
import type { ReviewJob, ReviewResponse } from '@/lib/apify-review';

type FieldKey = Exclude<keyof ReviewJob, 'runFinishedAt'>;
type WindowFilter = 'all' | '7' | '30';

const FIELDS: { key: FieldKey; label: string; tone: string; width: string }[] = [
  { key: 'platform', label: 'Platform', tone: 'bg-red-600', width: 'min-w-28' },
  { key: 'postId', label: 'Post ID', tone: 'bg-red-600', width: 'min-w-44' },
  { key: 'postedAt', label: 'PostedDate + Time', tone: 'bg-red-600', width: 'min-w-44' },
  { key: 'jobUrl', label: 'URL (Job)', tone: 'bg-red-600', width: 'min-w-32' },
  { key: 'title', label: 'Title', tone: 'bg-red-600', width: 'min-w-72' },
  { key: 'mediaUrl', label: 'Media (Image URL)', tone: 'bg-orange-400', width: 'min-w-36' },
  { key: 'address', label: 'Address', tone: 'bg-orange-400', width: 'min-w-52' },
  { key: 'state', label: 'State (N=General)', tone: 'bg-lime-600', width: 'min-w-36' },
  { key: 'district', label: 'District', tone: 'bg-lime-600', width: 'min-w-40' },
  { key: 'lingo', label: 'Lingo', tone: 'bg-lime-600', width: 'min-w-24' },
  { key: 'employmentType', label: 'Employment Type', tone: 'bg-lime-600', width: 'min-w-44' },
  { key: 'jobType', label: 'Job Type', tone: 'bg-lime-600', width: 'min-w-56' },
  { key: 'salary', label: 'Salary', tone: 'bg-lime-600', width: 'min-w-44' },
  { key: 'company', label: 'Brand/Company', tone: 'bg-lime-600', width: 'min-w-48' },
  { key: 'requirement', label: 'Requirement', tone: 'bg-lime-600', width: 'min-w-80' },
  { key: 'description', label: 'Description', tone: 'bg-lime-600', width: 'min-w-96' },
];

const CORE_FIELDS: FieldKey[] = ['postId', 'postedAt', 'jobUrl', 'title'];

function localDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

function needsReview(job: ReviewJob): boolean {
  return CORE_FIELDS.some((field) => !job[field]);
}

function hasFieldValue(job: ReviewJob, field: FieldKey): boolean {
  return Boolean(job[field]) && (field !== 'state' || job.state !== 'N');
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function ApifyReviewPage() {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [platform, setPlatform] = useState('all');
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReviewJob | null>(null);
  const [exporting, setExporting] = useState(false);
  const requestIdRef = useRef(0);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  function queryString(offset = 0, limit = 100, sync = false) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit), sync: sync ? '1' : '0' });
    if (platform !== 'all') params.set('platform', platform);
    if (windowFilter !== 'all') params.set('days', windowFilter);
    if (reviewOnly) params.set('reviewOnly', '1');
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }

  async function load(append = false, sync = false) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/apify/jobs?${queryString(append ? data?.jobs.length || 0 : 0, 100, sync)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next: ReviewResponse = await response.json();
      if (requestId !== requestIdRef.current) return;
      setData((previous) => append && previous ? { ...next, jobs: [...previous.jobs, ...next.jobs] } : next);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err instanceof Error ? err.message : 'Could not load Apify data');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(false, true), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [platform, windowFilter, reviewOnly, search]);

  const filtered = data?.jobs || [];
  const total = (data?.runs || []).reduce((count, run) => count + run.recordCount, 0);
  const totalUnique = data?.totalUnique ?? filtered.length;
  const totalMatches = data?.totalMatches ?? filtered.length;
  const coreComplete = (data?.runs || []).reduce((count, run) => count + (run.coreComplete || 0), 0);
  const window7 = (data?.runs || []).reduce((count, run) => count + (run.within7d || 0), 0);
  const window30 = (data?.runs || []).reduce((count, run) => count + (run.within30d || 0), 0);
  const coverage = useMemo(() => {
    const byPlatform = {
      Indeed: (data?.jobs || []).filter((job) => job.platform === 'Indeed'),
      JobStreet: (data?.jobs || []).filter((job) => job.platform === 'JobStreet'),
    };
    return FIELDS.map((field) => ({
      ...field,
      Indeed: data?.runs.find((run) => run.platform === 'Indeed')?.coverage?.[field.key]
        ?? byPlatform.Indeed.filter((job) => hasFieldValue(job, field.key)).length,
      JobStreet: data?.runs.find((run) => run.platform === 'JobStreet')?.coverage?.[field.key]
        ?? byPlatform.JobStreet.filter((job) => hasFieldValue(job, field.key)).length,
      indeedTotal: data?.runs.find((run) => run.platform === 'Indeed')?.recordCount ?? byPlatform.Indeed.length,
      jobStreetTotal: data?.runs.find((run) => run.platform === 'JobStreet')?.recordCount ?? byPlatform.JobStreet.length,
    }));
  }, [data]);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const measure = () => setTableWidth(table.scrollWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, []);

  function syncHorizontalScroll(from: HTMLDivElement, to: HTMLDivElement | null) {
    if (to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  }

  async function downloadCsv() {
    setExporting(true);
    setError('');
    try {
      const jobs: ReviewJob[] = [];
      let offset = 0;
      while (true) {
        const response = await fetch(`/api/apify/jobs?${queryString(offset, 500, false)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`CSV export failed: HTTP ${response.status}`);
        const page: ReviewResponse = await response.json();
        jobs.push(...page.jobs);
        if (page.nextOffset == null) break;
        offset = page.nextOffset;
      }
      const header = FIELDS.map((field) => csvCell(field.label)).join(',');
      const rows = jobs.map((job) => FIELDS.map((field) => csvCell(job[field.key] || '')).join(','));
      const csv = '\uFEFF' + [header, ...rows].join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'apify-job-review.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setExporting(false);
    }
  }

  function cell(job: ReviewJob, key: FieldKey) {
    const raw = job[key];
    if (!raw) return <span className="text-slate-400 italic">—</span>;
    if (key === 'postedAt') return <span className="tabular-nums whitespace-nowrap">{localDate(raw)}</span>;
    if (key === 'jobUrl' || key === 'mediaUrl') {
      return <a href={raw} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium" onClick={(event) => event.stopPropagation()}>{key === 'mediaUrl' ? 'Image URL' : 'Open job'} <ArrowUpRight className="w-3.5 h-3.5" /></a>;
    }
    if (key === 'state' && raw === 'N') return <span className="text-amber-700">N · General</span>;
    if (key === 'platform') return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${raw === 'Indeed' ? 'bg-blue-50 text-blue-800' : 'bg-emerald-50 text-emerald-800'}`}>{raw}</span>;
    if (key === 'title') return <button type="button" className="text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline" onClick={() => setSelected(job)}>{raw}</button>;
    if (key === 'description' || key === 'requirement') return <button type="button" className="text-left line-clamp-3 whitespace-pre-line text-slate-700 hover:text-blue-700" onClick={() => setSelected(job)}>{raw}</button>;
    return <span className={key === 'postId' ? 'font-mono text-[11px] break-all' : 'break-words'}>{raw}</span>;
  }

  return (
    <main className="mx-auto max-w-[1700px] px-4 sm:px-6 py-8 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="w-4 h-4" /> Dashboard</a>
        <span className="text-xs text-slate-500">Data review · Malaysia</span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-7">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 mb-2">Indeed + JobStreet</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Apify job data review</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Your 16 fields, saved by unique platform and post ID. New actor runs add jobs to Mapped records. Blank cells show fields the source did not provide.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void downloadCsv()} disabled={!totalMatches || exporting} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export CSV'}</button>
          <button type="button" onClick={() => void load(false, true)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-6">
        {[
          { label: 'Records in latest runs', value: total, note: 'Across both actors' },
          { label: 'Unique jobs saved', value: totalUnique, note: data?.archived ? 'Grows as runs are imported' : 'MongoDB archive unavailable' },
          { label: 'Core fields present', value: coreComplete, note: 'ID, date, URL, title' },
          { label: 'Posted within 7 days', value: window7, note: 'Relative to each run finish' },
          { label: 'Posted within 30 days', value: window30, note: 'Relative to each run finish' },
        ].map((card) => <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div><div className="mt-2 text-3xl font-bold tabular-nums">{card.value}</div><div className="mt-1 text-xs text-slate-500">{card.note}</div></div>)}
      </div>

      <div className="grid gap-3 md:grid-cols-2 mb-6">
        {(data?.runs || []).map((run) => <div key={run.platform} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-semibold">{run.platform}</span><a href={run.actorUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-700" aria-label={`Open ${run.platform} actor`}><ArrowUpRight className="w-4 h-4" /></a></div><div className="mt-1 text-xs text-slate-500">{run.error ? run.error : `Last successful run: ${localDate(run.finishedAt)}`}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${run.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{run.error ? 'Unavailable' : `${run.recordCount} records`}</span></div>)}
      </div>

      {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load Apify data: {error}</div>}
      {data?.syncError && <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.syncError} Saved records are still available.</div>}

      {data && <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" aria-labelledby="coverage-title">
        <div className="border-b border-slate-200 p-4">
          <h2 id="coverage-title" className="font-semibold">Field coverage in latest runs</h2>
          <p className="mt-0.5 text-xs text-slate-500">Populated records for each of your 16 fields, before table filters. “N” is an unknown state and counts as missing.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-4 py-3">Field</th><th scope="col" className="px-4 py-3 text-right">Indeed</th><th scope="col" className="px-4 py-3 text-right">JobStreet</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {coverage.map((field) => <tr key={field.key}>
                <th scope="row" className="px-4 py-2 font-medium text-slate-700">{field.label}</th>
                {(['Indeed', 'JobStreet'] as const).map((platform) => {
                  const count = field[platform];
                  const total = platform === 'Indeed' ? field.indeedTotal : field.jobStreetTotal;
                  return <td key={platform} className={`px-4 py-2 text-right tabular-nums ${total && count === 0 ? 'font-semibold text-rose-700' : count === total && total ? 'text-emerald-700' : 'text-slate-700'}`}>{total ? `${count}/${total}` : '—'}</td>;
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div><h2 className="font-semibold">Mapped records</h2><p className="text-xs text-slate-500 mt-0.5">{filtered.length} loaded of {totalMatches} matching unique jobs ({totalUnique} saved). Use the scrollbar below to review all fields; select a title for full text.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs" className="w-52 rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" /></div>
            <select aria-label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"><option value="all">Both platforms</option><option value="Indeed">Indeed</option><option value="JobStreet">JobStreet</option></select>
            <select aria-label="Posting window" value={windowFilter} onChange={(event) => setWindowFilter(event.target.value as WindowFilter)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"><option value="all">All dates</option><option value="7">Posted in last 7 days</option><option value="30">Posted in last 30 days</option></select>
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 whitespace-nowrap"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} className="rounded border-slate-300" /><Filter className="w-3.5 h-3.5" /> Missing core</label>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="mb-1 text-xs font-medium text-slate-600">Scroll columns →</div>
          <div ref={topScrollRef} onScroll={(event) => syncHorizontalScroll(event.currentTarget, tableScrollRef.current)} className="h-5 overflow-x-scroll overflow-y-hidden" tabIndex={0} aria-label="Scroll mapped records columns">
            <div className="h-px" style={{ width: tableWidth || '100%' }} />
          </div>
        </div>
        <div ref={tableScrollRef} onScroll={(event) => syncHorizontalScroll(event.currentTarget, topScrollRef.current)} className="overflow-x-auto">
          <table ref={tableRef} className="text-left text-xs border-collapse min-w-max">
            <thead><tr>{FIELDS.map((field) => <th key={field.key} scope="col" className={`${field.tone} ${field.width} px-3 py-3 align-top text-white font-semibold border-r border-white/30`}>{field.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((job, index) => <tr key={`${job.platform}:${job.postId || index}`} className="hover:bg-slate-50 align-top">{FIELDS.map((field) => <td key={field.key} className={`${field.width} max-w-96 px-3 py-3 border-r border-slate-100 ${!job[field.key] && CORE_FIELDS.includes(field.key) ? 'bg-rose-50' : ''}`}>{cell(job, field.key)}</td>)}</tr>)}
              {!loading && filtered.length === 0 && <tr><td colSpan={FIELDS.length} className="px-6 py-12 text-center text-sm text-slate-500">No records match these filters.</td></tr>}
              {loading && !data && <tr><td colSpan={FIELDS.length} className="px-6 py-12 text-center text-sm text-slate-500">Loading latest Apify runs…</td></tr>}
            </tbody>
          </table>
        </div>
        {data?.nextOffset != null && <div className="border-t border-slate-200 p-4 text-center"><button type="button" onClick={() => void load(true, false)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{loading ? 'Loading…' : `Load more (${totalMatches - filtered.length} remaining)`}</button></div>}
      </section>

      <p className="mt-4 text-xs text-slate-500">“N” means a general or unknown state. Image links use an actor-provided company logo when available. JobStreet descriptions use the actor’s teaser when full details are unavailable. Requirement text is extracted only when an explicit requirements heading appears. Company names come from actor output.</p>

      {selected && <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 sm:p-6 flex justify-end" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Job details" className="h-full w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4 border-b p-5"><div><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{selected.platform} · {selected.postId || 'No ID'}</div><h2 className="mt-1 text-xl font-bold">{selected.title || 'Untitled job'}</h2><p className="mt-1 text-xs text-slate-500">Posted {localDate(selected.postedAt) || 'date unavailable'} · Run finished {localDate(selected.runFinishedAt)}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close details"><X className="w-5 h-5" /></button></div><div className="overflow-y-auto p-5 space-y-5"><div className="grid grid-cols-2 gap-3 text-sm">{FIELDS.filter((field) => !['platform', 'title', 'description', 'requirement'].includes(field.key)).map((field) => <div key={field.key} className="border-b border-slate-100 pb-2"><div className="text-xs font-semibold text-slate-500">{field.label}</div><div className="mt-1 break-words">{selected[field.key] || '—'}</div></div>)}</div><div><h3 className="font-semibold">Requirement</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selected.requirement || 'Not provided as a separate field'}</p></div><div><h3 className="font-semibold">Description</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{selected.description || 'Not provided'}</p></div></div><div className="border-t p-4"><a href={selected.jobUrl || '#'} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${selected.jobUrl ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}>Open job <ArrowUpRight className="w-4 h-4" /></a></div></section></div>}
    </main>
  );
}
