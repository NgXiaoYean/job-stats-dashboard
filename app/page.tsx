'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  ExternalLink,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';

export interface SourceSubLink {
  label: string;
  url: string;
}

interface MissingFieldsBreakdown {
  missingTitle: number;
  missingDate: number;
  missingUrl: number;
  missingPostId: number;
  missingLocation: number;
}

interface JobStat {
  source: string;
  url: string;
  subLinks?: SourceSubLink[];
  totalPosts: number;
  completeFields: number;
  completeFieldsPercent: number;
  incompletePosts: number;
  incompletePostsPercent: number;
  missing?: MissingFieldsBreakdown;
  hasLocation: number;
  hasLocationPercent: number;
  within7d: number;
  within30d: number;
  recordedAt: string;
  error?: string;
}

interface ApiResponse {
  live: JobStat[];
  history: any[];
  mongoConnected: boolean;
  mongoMessage?: string;
  fetchedAt: string;
}

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [selectedMultiLink, setSelectedMultiLink] = useState<{
    source: string;
    subLinks: SourceSubLink[];
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => {
        setCopiedUrl(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchStats(), 60000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const liveStats = [...(data?.live || [])].sort((a, b) => a.source.localeCompare(b.source));
  const totalPosts = liveStats.reduce((acc, s) => acc + s.totalPosts, 0);
  const totalComplete = liveStats.reduce((acc, s) => acc + s.completeFields, 0);
  const totalIncomplete = liveStats.reduce((acc, s) => acc + (s.incompletePosts || 0), 0);
  const totalLocation = liveStats.reduce((acc, s) => acc + s.hasLocation, 0);
  const totalWithin7d = liveStats.reduce((acc, s) => acc + s.within7d, 0);
  const totalWithin30d = liveStats.reduce((acc, s) => acc + s.within30d, 0);

  const avgCompleteness = totalPosts ? ((totalComplete / totalPosts) * 100).toFixed(1) : '0';
  const avgLocation = totalPosts ? ((totalLocation / totalPosts) * 100).toFixed(1) : '0';

  // Total missing breakdown across all sources
  const totalMissingTitle = liveStats.reduce((acc, s) => acc + (s.missing?.missingTitle || 0), 0);
  const totalMissingDate = liveStats.reduce((acc, s) => acc + (s.missing?.missingDate || 0), 0);
  const totalMissingUrl = liveStats.reduce((acc, s) => acc + (s.missing?.missingUrl || 0), 0);
  const totalMissingPostId = liveStats.reduce((acc, s) => acc + (s.missing?.missingPostId || 0), 0);
  const totalMissingLocation = liveStats.reduce((acc, s) => acc + (s.missing?.missingLocation || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Job Sources Feed Analytics
          </h1>
        </div>

        {/* Database Status Pill */}
        <div className="flex flex-col items-start md:items-end gap-1 self-start md:self-auto max-w-sm">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              data?.mongoConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {data?.mongoConnected
                ? 'Database Connected'
                : 'Database Not Connected'}
            </span>
          </div>
          {data?.mongoMessage && (
            <span className="text-[11px] text-slate-500 text-left md:text-right leading-tight">
              {data.mongoMessage}
            </span>
          )}
        </div>
      </header>

      {/* Control Bar: Refresh & Actions */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>Monitoring 12 job platforms</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <label className="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-blue-600 focus:ring-0"
            />
            Auto-refresh (1m)
          </label>
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Now</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Posts</span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalPosts}</div>
          <p className="text-[11px] text-slate-400 mt-1">Across all active sources</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Complete Posts</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{avgCompleteness}%</div>
          <p className="text-[11px] text-slate-400 mt-1">
            {totalComplete} of {totalPosts} all core fields
          </p>
        </div>

        <div className={`bg-white p-4 rounded-xl border shadow-sm ${totalIncomplete > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Missing Fields</span>
            {totalIncomplete > 0 ? (
              <ShieldAlert className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {totalIncomplete === 0 ? '0' : `${totalIncomplete}`}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {totalIncomplete === 0 ? 'All 100% clean' : `${totalMissingTitle}T • ${totalMissingDate}D • ${totalMissingUrl}U • ${totalMissingPostId}ID`}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">&le; 7 Days (Complete)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalWithin7d}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Past 7 days with all fields
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">&le; 30 Days (Complete)</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalWithin30d}</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Past 30 days with all fields
          </p>
        </div>
      </div>

      {/* Main Table: Live Crawling Data */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                LIVE CRAWL
              </span>
              <h2 className="font-semibold text-slate-900 text-sm">Live Job Platform Status</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Real-time live status across all job platforms. Verifies complete post details (Title, Date, Link, and Post ID).
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 shrink-0 self-start sm:self-auto">
            Last checked: {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'Loading...'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/75 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Source Name</th>
                <th className="px-4 py-3.5">Total Posts</th>
                <th className="px-4 py-3.5" title="Has Post ID, PostedDate + Time, URL (Job), and Title">Complete Posts</th>
                <th className="px-4 py-3.5" title="Breakdown of missing fields">Missing Fields</th>
                <th className="px-4 py-3.5">Has Location</th>
                <th className="px-4 py-3.5" title="Only posts that have all compulsory fields and were published within the past 7 days">&le; 7 Days (Complete)</th>
                <th className="px-4 py-3.5" title="Only posts that have all compulsory fields and were published within the past 30 days">&le; 30 Days (Complete)</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liveStats.map((item) => (
                <tr key={item.source} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.source}</span>
                      {item.subLinks && item.subLinks.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMultiLink({ source: item.source, subLinks: item.subLinks! });
                            setCopiedUrl(null);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition shadow-sm cursor-pointer"
                          title={`View ${item.subLinks.length} links`}
                        >
                          <ExternalLink className="w-3 h-3 text-blue-600" />
                          <span>{item.subLinks.length} Links</span>
                          <ChevronDown className="w-3 h-3 text-blue-500" />
                        </button>
                      ) : (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-blue-600 transition"
                          title="Open RSS feed"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-700">
                    {item.totalPosts}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {item.completeFields}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({item.completeFieldsPercent}%)
                      </span>
                    </div>
                  </td>

                  {/* Missing Fields Breakdown */}
                  <td className="px-4 py-4">
                    {item.incompletePosts === 0 && (item.missing?.missingLocation || 0) === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        0 Missing
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {item.missing?.missingTitle ? (
                          <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                            Title: {item.missing.missingTitle}
                          </span>
                        ) : null}
                        {item.missing?.missingDate ? (
                          <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                            Date: {item.missing.missingDate}
                          </span>
                        ) : null}
                        {item.missing?.missingUrl ? (
                          <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                            URL: {item.missing.missingUrl}
                          </span>
                        ) : null}
                        {item.missing?.missingPostId ? (
                          <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                            ID: {item.missing.missingPostId}
                          </span>
                        ) : null}
                        {item.missing?.missingLocation ? (
                          <span className="bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200" title="Location not found in category tags or summary">
                            No Loc: {item.missing.missingLocation}
                          </span>
                        ) : null}
                        {item.incompletePosts === 0 && (
                          <span className="text-slate-400 py-0.5">
                            Core Clean ✅
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {item.hasLocation}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({item.hasLocationPercent}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700 font-medium">
                    {item.within7d}
                  </td>
                  <td className="px-4 py-4 text-slate-700 font-medium">
                    {item.within30d}
                  </td>
                  <td className="px-4 py-4">
                    {item.error ? (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium bg-rose-50 px-2.5 py-1 rounded-full">
                        <XCircle className="w-3 h-3" />
                        {item.error}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {liveStats.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No data available. Check your RSSHub URL or click Refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Snapshots: Database Data */}
      {data?.history && data.history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800">
                  <Database className="w-3 h-3" />
                  DATABASE HISTORY
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  Daily Snapshots ({data.history.length} records)
                </h3>
              </div>
              <div className="text-xs text-slate-500">
                Daily snapshot recorded automatically every day at 3:00 PM to track platform history.
              </div>
            </div>
            <button
              onClick={async () => {
                if (window.confirm('Delete all old snapshot records so history starts fresh from 3:00 PM cron?')) {
                  await fetch('/api/clear-history?confirm=true');
                  fetchStats();
                }
              }}
              className="px-3 py-1.5 text-xs text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-transparent rounded-lg font-medium transition self-start sm:self-auto shrink-0"
            >
              Reset History
            </button>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                <tr>
                  <th className="px-3 py-2">Recorded At</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Total Posts</th>
                  <th className="px-3 py-2" title="Has Post ID, PostedDate + Time, URL, and Title">Complete</th>
                  <th className="px-3 py-2" title="Complete posts published within past 7 days">&le; 7 Days</th>
                  <th className="px-3 py-2" title="Complete posts published within past 30 days">&le; 30 Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.history.map((h: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(h.recordedAtDate || h.recordedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{h.source}</td>
                    <td className="px-3 py-2">{h.totalPosts}</td>
                    <td className="px-3 py-2">{h.completeFields}</td>
                    <td className="px-3 py-2">{h.within7d ?? 0}</td>
                    <td className="px-3 py-2">{h.within30d ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-slate-400 py-6 border-t border-slate-200">
        <p>Job Sources Analytics Dashboard</p>
      </footer>

      {/* Feed Links Modal */}
      {selectedMultiLink && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity"
          onClick={() => setSelectedMultiLink(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {selectedMultiLink.source} Links
              </h3>
              <button
                type="button"
                onClick={() => setSelectedMultiLink(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of 5 links */}
            <div className="space-y-2 mt-4">
              {selectedMultiLink.subLinks.map((sub) => (
                <div
                  key={sub.url}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 transition"
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-sm font-semibold text-slate-800">
                      {sub.label}
                    </div>
                    <div className="text-xs text-slate-400 font-mono truncate">
                      {sub.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(sub.url)}
                      className="p-1.5 rounded-md hover:bg-white text-slate-500 hover:text-slate-700 border border-transparent hover:border-slate-200 transition cursor-pointer"
                      title="Copy URL"
                    >
                      {copiedUrl === sub.url ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <a
                      href={sub.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMultiLink(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
