import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarClock, CheckCircle2, FileEdit, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import type { BrandKit, Slideshow } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { SlidePreview } from '../components/SlidePreview';
import { Button } from '../components/Button';
import { getSlideshowLibrary } from '../lib/api';

interface SlideshowLibraryViewProps {
  brandKit?: BrandKit;
}

const statusMeta: Record<string, { label: string; icon: typeof Archive; className: string }> = {
  queued: { label: 'In Queue', icon: Archive, className: 'text-ink-5 bg-raised border-line' },
  scheduled: { label: 'Scheduled', icon: CalendarClock, className: 'text-ink bg-card border-line-2' },
  draft: { label: 'Draft', icon: FileEdit, className: 'text-ink-5 bg-raised border-line' },
  rejected: { label: 'Removed', icon: Trash2, className: 'text-red-600 bg-red-50 border-red-200' },
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function SlideshowLibraryView({ brandKit }: SlideshowLibraryViewProps) {
  const [slideshows, setSlideshows] = useState<Slideshow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      setSlideshows(await getSlideshowLibrary());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSlideshowLibrary()
      .then((next) => {
        if (!cancelled) {
          setSlideshows(next);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const items = slideshows || [];
    return {
      total: items.length,
      queued: items.filter((s) => (s.libraryStatus || 'queued') === 'queued').length,
      published: items.filter((s) => ['scheduled', 'draft'].includes(s.libraryStatus || '')).length,
    };
  }, [slideshows]);

  return (
    <>
      <ViewHeader
        title="Slideshows"
        subtitle="Every generated carousel, including removed and scheduled posts."
        right={
          <Button
            variant="secondary"
            size="md"
            onClick={() => void load()}
            disabled={refreshing}
            icon={<RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        {slideshows && slideshows.length > 0 && (
          <div className="px-8 py-4 border-b border-line bg-surface">
            <div className="max-w-6xl mx-auto grid grid-cols-3 gap-3">
              <Stat label="Generated" value={stats.total} />
              <Stat label="Still queued" value={stats.queued} />
              <Stat label="Sent to post-bridge" value={stats.published} />
            </div>
          </div>
        )}

        <div className="p-8">
          <div className="max-w-6xl mx-auto">
            {error ? (
              <Empty text={error} />
            ) : slideshows === null ? (
              <Loading />
            ) : slideshows.length === 0 ? (
              <Empty text="No generated slideshows yet. Generate a batch from Queue and they will appear here permanently." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {slideshows.map((slideshow) => (
                  <LibraryCard key={slideshow.id} slideshow={slideshow} brandKit={brandKit} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-3">
      <div className="text-[11px] text-ink-6 uppercase tracking-widest">{label}</div>
      <div className="text-[22px] font-semibold text-ink leading-none mt-2">{value}</div>
    </div>
  );
}

function LibraryCard({ slideshow, brandKit }: { slideshow: Slideshow; brandKit?: BrandKit }) {
  const status = slideshow.libraryStatus || 'queued';
  const meta = statusMeta[status] || statusMeta.queued;
  const Icon = meta.icon;
  return (
    <article className="bg-card border border-line rounded-xl overflow-hidden">
      <div className="p-4 bg-surface border-b border-line">
        <div className="grid grid-cols-6 gap-1.5">
          {slideshow.slides.map((slide) => (
            <SlidePreview key={slide.id} slide={slide} brandKit={brandKit} />
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[14px] font-semibold text-ink leading-snug">{slideshow.hook || 'Untitled slideshow'}</h3>
          <span className={`shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-semibold ${meta.className}`}>
            <Icon size={11} />
            {meta.label}
          </span>
        </div>

        <p className="text-[12px] text-ink-4 leading-snug line-clamp-2">
          {slideshow.caption || slideshow.publishedCaption || 'No caption saved'}
        </p>

        <div className="flex flex-wrap gap-1 mt-2">
          {(slideshow.hashtags || []).slice(0, 6).map((tag) => (
            <span key={tag} className="text-[10px] text-ink-5 px-1.5 py-0.5 rounded bg-raised">
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-6">
          <span>{slideshow.slides.length} slides</span>
          {slideshow.createdAt && <span>generated {formatDate(slideshow.createdAt)}</span>}
          {slideshow.scheduledAt && <span>scheduled {formatDate(slideshow.scheduledAt)}</span>}
          {slideshow.generationContext?.pillarName && <span>{slideshow.generationContext.pillarName}</span>}
          {slideshow.generationContext?.presetName && <span>{slideshow.generationContext.presetName}</span>}
          {!!slideshow.postBridgePostIds?.length && (
            <span className="inline-flex items-center gap-1 text-ink-5">
              <CheckCircle2 size={11} />
              post-bridge {slideshow.postBridgePostIds[0]}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
      <Loader2 size={14} className="animate-spin" /> Loading slideshows…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-[13px] text-ink-5 max-w-md mx-auto">{text}</div>;
}
