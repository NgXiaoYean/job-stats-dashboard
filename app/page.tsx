'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react';

interface JobStat {
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

interface ApiResponse {
  live: JobStat[];
  history: any[];
  mongoConnected: boolean;
  fetchedAt: string;
}

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchStats = async (customUrl?: string) => {
    setLoading(true);
    try {
      const query = customUrl ? `?baseUrl=${encodeURIComponent(customUrl)}` : '';
      const res = await fetch(`/api/stats${query}`);
      const json: ApiResponse = await res.json();
      setData(json);
      if (!activeUrl && customUrl) {
        setActiveUrl(customUrl);
      }
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
    const interval = setInterval(() => fetchStats(activeUrl), 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeUrl]);

  const liveStats = data?.live || [];
  const totalPosts = liveStats.reduce((acc, s) => acc + s.totalPosts, 0);
  const totalComplete = liveStats.reduce((acc, s) => acc + s.completeFields, 0);
  const totalLocation = liveStats.reduce((acc, s) => acc + s.hasLocation, 0);
  const totalWithin7d = liveStats.reduce((acc, s) => acc + s.within7d, 0);
  const avgCompleteness = totalPosts ? ((totalComplete / totalPosts) * 100).toFixed(1) : '0';
  const avgLocation = totalPosts ? ((totalLocation / totalPosts) * 100).toFixed(1) : '0';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Job Sources Feed Analytics
            </h1>
            <span className="text-xs bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full">
              Temporary Tool
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time post counts, field completeness, date recency, and location metrics from RSSHub.
          </p>
        </div>

        {/* MongoDB Status Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              data?.mongoConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {data?.mongoConnected
                ? 'MongoDB Connected (Recording Snapshots)'
                : 'MongoDB Not Connected (Live In-Memory Mode)'}
            </span>
          </div>
        </div>
      </header>

      {/* Control Bar: Custom RSSHub URL & Refresh */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Change RSSHub Base URL (e.g. http://localhost:1200 or https://...)"
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => {
              setActiveUrl(baseUrl);
              fetchStats(baseUrl);
            }}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shrink-0 transition"
          >
            Apply URL
          </button>
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
            onClick={() => fetchStats(activeUrl)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Now</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Posts Found</span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalPosts}</div>
          <p className="text-xs text-slate-400 mt-1">Across all 4 active job sources</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Complete Fields Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{avgCompleteness}%</div>
          <p className="text-xs text-slate-400 mt-1">
            {totalComplete} of {totalPosts} posts have all fields
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Location Detection</span>
            <MapPin className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{avgLocation}%</div>
          <p className="text-xs text-slate-400 mt-1">
            {totalLocation} of {totalPosts} posts have location info
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Recent Posts (&le; 7 Days)</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalWithin7d}</div>
          <p className="text-xs text-slate-400 mt-1">
            Published within the past week
          </p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Detailed Source Breakdown</h2>
          <span className="text-xs text-slate-400">
            Last updated: {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'Loading...'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/75 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Source Name</th>
                <th className="px-4 py-3.5">Total Posts</th>
                <th className="px-4 py-3.5">Complete Fields</th>
                <th className="px-4 py-3.5">Has Location</th>
                <th className="px-4 py-3.5">&le; 7 Days</th>
                <th className="px-4 py-3.5">&le; 30 Days</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liveStats.map((item) => (
                <tr key={item.source} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.source}</span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-blue-600 transition"
                        title="Open RSSHub JSON feed"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
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
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No data available. Check your RSSHub URL or click Refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Snapshots (when MongoDB is active) */}
      {data?.history && data.history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Recent Snapshots in MongoDB ({data.history.length} records)
          </h3>
          <div className="text-xs text-slate-500 mb-4">
            Daily cron snapshots recorded automatically in MongoDB Atlas.
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                <tr>
                  <th className="px-3 py-2">Recorded At</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Total Posts</th>
                  <th className="px-3 py-2">Complete</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">&le; 7 Days</th>
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
                    <td className="px-3 py-2">{h.hasLocation}</td>
                    <td className="px-3 py-2">{h.within7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cleanup / Temporary Note */}
      <footer className="text-center text-xs text-slate-400 py-6 border-t border-slate-200">
        <p>
          This is a self-contained temporary dashboard created at{' '}
          <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">
            GitHub/job-stats-dashboard
          </code>
          .
        </p>
        <p className="mt-1">
          To remove anytime: simply delete the folder and remove the project from Vercel.
        </p>
      </footer>
    </div>
  );
}
