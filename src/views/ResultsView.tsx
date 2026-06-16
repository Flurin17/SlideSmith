import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Eye,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { BrainState, PostResult } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { getResults, learnFromWinners, syncResults } from '../lib/api';

interface ResultsViewProps {
  configured: boolean;
  onBrainUpdated: (brain: BrainState) => void;
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

function formatPercent(n: number) {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function interactions(result: PostResult) {
  return result.likes + result.comments + result.shares;
}

function engagementRate(result: PostResult) {
  return result.views > 0 ? (interactions(result) / result.views) * 100 : 0;
}

function performanceScore(result: PostResult) {
  return result.views + result.likes * 8 + result.comments * 18 + result.shares * 24;
}

function rankResults(results: PostResult[]) {
  return [...results].sort((a, b) => performanceScore(b) - performanceScore(a));
}

function defaultWinnerIds(results: PostResult[]) {
  return rankResults(results)
    .slice(0, Math.min(3, results.length))
    .map((r) => r.id);
}

function reconcileSelectedIds(results: PostResult[], selectedIds: string[]) {
  const validIds = new Set(results.map((r) => r.id));
  const kept = selectedIds.filter((id) => validIds.has(id));
  return kept.length ? kept : defaultWinnerIds(results);
}

function topPlatform(results: PostResult[]) {
  const byPlatform = platformBreakdown(results);
  return byPlatform[0]?.platform || 'n/a';
}

function platformBreakdown(results: PostResult[]) {
  const map = new Map<string, { platform: string; posts: number; views: number; interactions: number }>();
  for (const result of results) {
    const platform = result.platform || 'post';
    const row = map.get(platform) || { platform, posts: 0, views: 0, interactions: 0 };
    row.posts += 1;
    row.views += result.views;
    row.interactions += interactions(result);
    map.set(platform, row);
  }
  return Array.from(map.values()).sort((a, b) => b.views - a.views);
}

export function ResultsView({ configured, onBrainUpdated }: ResultsViewProps) {
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [learning, setLearning] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);
  const [learningPreview, setLearningPreview] = useState<{
    learnedMemory: string;
    sourcePostIds: string[];
  } | null>(null);
  const [learned, setLearned] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (!configured) return;
    getResults()
      .then((next) => {
        if (ignore) return;
        setResults(next);
        setSelectedIds((prev) => reconcileSelectedIds(next, prev));
        setLearningPreview(null);
        setLearned(false);
        setError(null);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      ignore = true;
    };
  }, [configured]);

  const visibleResults = configured ? results : null;
  const ranked = useMemo(() => (visibleResults ? rankResults(visibleResults) : []), [visibleResults]);
  const winnerCandidates = useMemo(() => ranked.slice(0, Math.min(6, ranked.length)), [ranked]);
  const stats = useMemo(() => {
    if (!visibleResults?.length) return null;
    const totalViews = visibleResults.reduce((s, r) => s + r.views, 0);
    const totalInteractions = visibleResults.reduce((s, r) => s + interactions(r), 0);
    const totalShares = visibleResults.reduce((s, r) => s + r.shares, 0);
    const avgViews = totalViews / visibleResults.length;
    const rate = totalViews > 0 ? (totalInteractions / totalViews) * 100 : 0;
    return {
      totalViews,
      totalInteractions,
      totalShares,
      avgViews,
      rate,
      top: ranked[0],
      platforms: platformBreakdown(visibleResults),
      topPlatform: topPlatform(visibleResults),
    };
  }, [ranked, visibleResults]);

  // Refresh pulls fresh metrics from the platforms (post-bridge sync) first,
  // which is also what backfills cover thumbnails once a post goes live.
  const refresh = useCallback(async () => {
    if (!configured) return;
    setRefreshing(true);
    setError(null);
    setLearnError(null);
    try {
      const next = await syncResults();
      setResults(next);
      setSelectedIds((prev) => reconcileSelectedIds(next, prev));
      setLearningPreview(null);
      setLearned(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [configured]);

  const toggleSelected = (id: string) => {
    setLearningPreview(null);
    setLearned(false);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const reviewLearning = async () => {
    if (!selectedIds.length) return;
    setLearning(true);
    setLearnError(null);
    setLearned(false);
    try {
      const next = await learnFromWinners(selectedIds, false);
      setSelectedIds(next.sourcePostIds);
      setLearningPreview({
        learnedMemory: next.learnedMemory,
        sourcePostIds: next.sourcePostIds,
      });
    } catch (e) {
      setLearnError(e instanceof Error ? e.message : String(e));
    } finally {
      setLearning(false);
    }
  };

  const applyLearning = async () => {
    const ids = learningPreview?.sourcePostIds || selectedIds;
    if (!ids.length) return;
    setLearning(true);
    setLearnError(null);
    try {
      const next = await learnFromWinners(ids, true);
      onBrainUpdated(next.brain);
      setLearningPreview({
        learnedMemory: next.learnedMemory,
        sourcePostIds: next.sourcePostIds,
      });
      setLearned(true);
    } catch (e) {
      setLearnError(e instanceof Error ? e.message : String(e));
    } finally {
      setLearning(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Results"
        subtitle="Live analytics from post-bridge for everything you've published."
        right={
          configured && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void refresh()}
              disabled={refreshing}
              icon={<RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />}
            >
              {refreshing ? 'Syncing…' : 'Refresh'}
            </Button>
          )
        }
      />
      <div className="flex-1 overflow-y-auto">
        {stats && visibleResults && visibleResults.length > 0 && (
          <div className="px-8 py-5 border-b border-line bg-surface">
            <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-6 gap-3">
              <Stat icon={Eye} label="Views" value={formatNumber(stats.totalViews)} />
              <Stat icon={Heart} label="Interactions" value={formatNumber(stats.totalInteractions)} />
              <Stat icon={TrendingUp} label="Engagement" value={formatPercent(stats.rate)} />
              <Stat icon={BarChart3} label="Avg views" value={formatNumber(stats.avgViews)} />
              <Stat icon={Share2} label="Shares" value={formatNumber(stats.totalShares)} />
              <Stat icon={Target} label="Top platform" value={stats.topPlatform} />
            </div>
          </div>
        )}

        <div className="p-8">
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
            {!configured ? (
              <Empty text="Add your post-bridge API key in Settings to see analytics." />
            ) : error ? (
              <Empty text={error} />
            ) : visibleResults === null ? (
              <Loading />
            ) : visibleResults.length === 0 ? (
              <Empty text="No analytics yet. Once your posts go live, post-bridge syncs their performance here." />
            ) : (
              <>
                {stats && (
                  <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-4">
                    <TopPerformer result={stats.top} />
                    <PlatformBreakdown rows={stats.platforms} />
                  </div>
                )}

                <LearnPanel
                  candidates={winnerCandidates}
                  selectedIds={selectedIds}
                  learning={learning}
                  learned={learned}
                  error={learnError}
                  preview={learningPreview?.learnedMemory || ''}
                  onToggle={toggleSelected}
                  onReview={() => void reviewLearning()}
                  onApply={() => void applyLearning()}
                />

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-[12px] font-semibold uppercase tracking-widest text-ink-5">
                      Tracked posts
                    </h2>
                    <span className="text-[11px] text-ink-6">{visibleResults.length} posts</span>
                  </div>
                  {ranked.map((r, i) => (
                    <ResultCard
                      key={r.id}
                      result={r}
                      rank={i + 1}
                      selected={selectedIds.includes(r.id)}
                      onToggle={() => toggleSelected(r.id)}
                    />
                  ))}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-6 uppercase tracking-widest">
        <Icon size={12} />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[22px] font-semibold text-ink leading-none mt-2 truncate">{value}</div>
    </div>
  );
}

function TopPerformer({ result }: { result: PostResult }) {
  return (
    <section className="bg-card border border-line rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-ink-5">Top performer</h2>
          <p className="text-[12px] text-ink-6 mt-1">
            {formatNumber(result.views)} views · {formatPercent(engagementRate(result))} engagement
          </p>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-line bg-raised uppercase tracking-wide text-ink-4">
          {result.platform || 'post'}
        </span>
      </div>
      <div className="flex gap-4">
        <Cover result={result} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-ink leading-snug line-clamp-3">
            {result.description || 'No caption available'}
          </h3>
          <div className="grid grid-cols-4 gap-2 mt-4 text-[12px] text-ink-4">
            <Metric icon={Eye} value={formatNumber(result.views)} label="views" />
            <Metric icon={Heart} value={formatNumber(result.likes)} label="likes" />
            <Metric icon={MessageCircle} value={formatNumber(result.comments)} label="comments" />
            <Metric icon={Share2} value={formatNumber(result.shares)} label="shares" />
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformBreakdown({
  rows,
}: {
  rows: Array<{ platform: string; posts: number; views: number; interactions: number }>;
}) {
  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  return (
    <section className="bg-card border border-line rounded-lg p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-widest text-ink-5 mb-3">Platforms</h2>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.platform}>
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium text-ink truncate">{row.platform}</span>
              <span className="text-ink-5 shrink-0">
                {formatNumber(row.views)} views · {row.posts} posts
              </span>
            </div>
            <div className="h-1.5 bg-raised rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-ink rounded-full"
                style={{ width: `${Math.max(6, (row.views / maxViews) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LearnPanel({
  candidates,
  selectedIds,
  learning,
  learned,
  error,
  preview,
  onToggle,
  onReview,
  onApply,
}: {
  candidates: PostResult[];
  selectedIds: string[];
  learning: boolean;
  learned: boolean;
  error: string | null;
  preview: string;
  onToggle: (id: string) => void;
  onReview: () => void;
  onApply: () => void;
}) {
  return (
    <section className="bg-card border border-line rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-ink-5">
            Learn from winners
          </h2>
          <p className="text-[12px] text-ink-6 mt-1">
            {selectedIds.length} selected for the next Brain update
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="md"
            icon={learning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            disabled={!selectedIds.length || learning}
            onClick={onReview}
          >
            Review update
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={learned ? <CheckCircle2 size={13} /> : undefined}
            disabled={!preview || learning || learned}
            onClick={onApply}
          >
            {learned ? 'Brain updated' : 'Apply to Brain'}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-2 mt-4">
        {candidates.slice(0, 6).map((result, i) => (
          <button
            key={result.id}
            onClick={() => onToggle(result.id)}
            className={`text-left border rounded-lg p-3 transition-colors ${
              selectedIds.includes(result.id)
                ? 'border-ink bg-raised'
                : 'border-line bg-card hover:border-line-2 hover:bg-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] text-ink-6 uppercase tracking-widest">#{i + 1}</span>
              <span className="text-[10px] text-ink-5">{formatPercent(engagementRate(result))}</span>
            </div>
            <div className="text-[12px] font-semibold text-ink line-clamp-2 min-h-[32px]">
              {result.description || 'No caption available'}
            </div>
            <div className="text-[11px] text-ink-5 mt-2">
              {formatNumber(result.views)} views · {formatNumber(interactions(result))} interactions
            </div>
          </button>
        ))}
      </div>

      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}

      {preview && (
        <div className="mt-4 border border-line rounded-lg bg-surface p-3">
          <div className="text-[11px] uppercase tracking-widest text-ink-6 mb-2">Brain update preview</div>
          <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-3 font-mono max-h-64 overflow-y-auto">
            {preview}
          </pre>
        </div>
      )}
    </section>
  );
}

function ResultCard({
  result,
  rank,
  selected,
  onToggle,
}: {
  result: PostResult;
  rank: number;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`bg-card border rounded-lg p-4 flex gap-4 ${selected ? 'border-ink' : 'border-line'}`}>
      <Cover result={result} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-line bg-raised uppercase tracking-wide text-ink-4">
              #{rank}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-line bg-raised uppercase tracking-wide text-ink-4">
              {result.platform || 'post'}
            </span>
            {result.lastSyncedAt && (
              <span className="text-[11px] text-ink-6 truncate">
                synced {formatDate(result.lastSyncedAt)}
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            className={`shrink-0 h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
              selected
                ? 'border-ink bg-ink text-bg'
                : 'border-line text-ink-5 hover:text-ink hover:border-line-2'
            }`}
          >
            {selected ? 'Learning' : 'Learn'}
          </button>
        </div>
        {result.description && (
          <h3 className="text-[14px] font-semibold text-ink leading-snug mb-2 line-clamp-2">
            {result.description}
          </h3>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-4">
          <Metric icon={Eye} value={formatNumber(result.views)} label="views" />
          <Metric icon={Heart} value={formatNumber(result.likes)} label="likes" />
          <Metric icon={MessageCircle} value={formatNumber(result.comments)} label="comments" />
          <Metric icon={Share2} value={formatNumber(result.shares)} label="shares" />
          <span className="text-ink-5">{formatPercent(engagementRate(result))} engagement</span>
          {result.shareUrl && (
            <a href={result.shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-5 underline">
              <ExternalLink size={11} />
              view post
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Cover({ result, size = 'md' }: { result: PostResult; size?: 'md' | 'lg' }) {
  return (
    <div
      className={`shrink-0 aspect-[9/16] rounded-md overflow-hidden bg-raised ${
        size === 'lg' ? 'w-24' : 'w-20'
      }`}
    >
      {result.coverImageUrl ? (
        <img src={result.coverImageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-ink-7">
          <BarChart3 size={18} />
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Eye; value: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <Icon size={11} className="text-ink-6" />
      <span>{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
      <Loader2 size={14} className="animate-spin" /> Loading analytics…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-[13px] text-ink-5 max-w-md mx-auto">{text}</div>;
}
