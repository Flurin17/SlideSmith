import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ScheduleModal } from './components/ScheduleModal';
import { BulkScheduleModal } from './components/BulkScheduleModal';
import { GenerateModal } from './components/GenerateModal';
import { SlideshowEditorModal } from './components/SlideshowEditorModal';
import { QueueView } from './views/QueueView';
import { LibraryView } from './views/LibraryView';
import { SlideshowLibraryView } from './views/SlideshowLibraryView';
import { ScheduleView } from './views/ScheduleView';
import { ResultsView } from './views/ResultsView';
import { BrainView } from './views/BrainView';
import { SettingsView } from './views/SettingsView';
import { renderSlideshow } from './lib/render';
import { displayLinkDomain } from './lib/linkSticker';
import { formatPostCaption } from './lib/hashtags';
import * as api from './lib/api';
import type {
  AppConfig,
  Project,
  Slideshow,
  Slide,
  SocialAccount,
  BrainState,
  ViewKey,
  BrandKit,
  GenerationPreset,
  GenerationProgressStatus,
  QueueFeedbackAction,
} from './types';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('queue');
  const [queue, setQueue] = useState<Slideshow[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState<Slideshow | null>(null);
  const [editing, setEditing] = useState<Slideshow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueNote, setQueueNote] = useState<string | null>(null);

  const hasGenerationKey =
    config?.aiProvider === 'azure-openai'
      ? !!(config.keys.azureOpenAI && config.azureOpenAI.endpoint)
      : !!config?.keys.openrouter;
  const hasPostbridge = !!config?.keys.postbridge;
  const hasApify = !!config?.keys.apify;
  const activeProject: Project | undefined = config?.projects.find(
    (p) => p.id === config.activeProjectId
  ) ?? config?.projects[0];

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.getAccounts());
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
        setQueue(await api.getQueue());
        const hasConfiguredGenerationKey =
          cfg.aiProvider === 'azure-openai'
            ? !!(cfg.keys.azureOpenAI && cfg.azureOpenAI.endpoint)
            : !!cfg.keys.openrouter;
        if (!hasConfiguredGenerationKey && !cfg.keys.postbridge) setActiveView('settings');
        if (cfg.keys.postbridge) loadAccounts();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the Slidesmith server.');
      }
    })();
  }, [loadAccounts]);

  const generate = async (count: number, packs: string[], direction: string, pillar: string, preset: string) => {
    setError(null);
    setGenerationProgress(null);
    setGenerating(true);
    try {
      const started = await api.startGeneration(count, packs, direction, pillar, preset);
      setGenerationProgress(started);

      let status = started;
      while (status.status === 'queued' || status.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        status = await api.getGenerationStatus(started.id);
        setGenerationProgress(status);
      }
      if (status.status === 'error') throw new Error(status.error || status.message || 'Generation failed.');
      setQueue(await api.getQueue());
      setGenerateOpen(false);
      window.setTimeout(() => setGenerationProgress(null), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const reject = async (id: string) => {
    setQueue(await api.removeFromQueue(id));
  };

  const visibleSelectedIds = selectedIds.filter((id) => queue.some((s) => s.id === id));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const bulkDone = async () => {
    setBulkOpen(false);
    setSelectedIds([]);
    setQueue(await api.getQueue());
    setActiveView('schedule');
  };

  const bulkDelete = async () => {
    let nextQueue = queue;
    for (const id of visibleSelectedIds) {
      nextQueue = await api.removeFromQueue(id);
    }
    setQueue(nextQueue);
    setSelectedIds([]);
  };

  const saveEdits = async (patch: { slides: Slide[]; caption: string; hashtags: string[] }) => {
    if (!editing) return;
    setQueue(await api.updateSlideshow(editing.id, patch));
    setEditing(null);
  };

  const runSlideAiEdit = async (payload: {
    action: api.SlideAiEditAction;
    slideIndex: number;
    slides: Slide[];
    caption: string;
    hashtags: string[];
  }) => api.editSlideWithAI(payload);

  const confirmSchedule = async (opts: {
    socialAccounts: number[];
    mode: 'draft' | 'schedule';
    scheduledAt: string | null;
  }) => {
    if (!scheduling || !activeProject) return;
    const scheduledId = scheduling.id;
    const slides = await renderSlideshow(scheduling, activeProject.brandKit);
    await api.schedule({
      id: scheduledId,
      caption: formatPostCaption(scheduling.caption, scheduling.hashtags),
      slides,
      slideshow: scheduling,
      socialAccounts: opts.socialAccounts,
      scheduledAt: opts.scheduledAt,
      mode: opts.mode,
    });
    // Drop the now-scheduled slideshow from the queue immediately (optimistic),
    // then reconcile with the server. The modal stays open showing its success
    // state with a link to post-bridge instead of us jumping to the Schedule tab.
    setQueue((q) => q.filter((s) => s.id !== scheduledId));
    setQueue(await api.getQueue());
  };

  // Global settings (keys/model) + per-project edits (name/defaults), in one call.
  const saveSettings = async (patch: {
    keys?: AppConfig['keys'];
    aiProvider?: AppConfig['aiProvider'];
    model?: string;
    azureOpenAI?: AppConfig['azureOpenAI'];
    pinterestActor?: string;
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
    brandKit?: BrandKit;
    aiCreativeControl?: boolean;
  }) => {
    if (
      patch.keys ||
      patch.aiProvider !== undefined ||
      patch.model !== undefined ||
      patch.azureOpenAI !== undefined ||
      patch.pinterestActor !== undefined
    ) {
      await api.saveConfig({
        keys: patch.keys,
        aiProvider: patch.aiProvider,
        model: patch.model,
        azureOpenAI: patch.azureOpenAI,
        pinterestActor: patch.pinterestActor,
      });
    }
    if (activeProject && (patch.name !== undefined || patch.defaults || patch.imagePacks || patch.brandKit || patch.aiCreativeControl !== undefined)) {
      await api.updateProject(activeProject.id, {
        name: patch.name,
        defaults: patch.defaults,
        imagePacks: patch.imagePacks,
        brandKit: patch.brandKit,
        aiCreativeControl: patch.aiCreativeControl,
      });
    }
    setConfig(await api.getConfig());
  };

  const saveBrain = async (brain: BrainState) => {
    if (!activeProject) return;
    // Optimistic local update so typing stays snappy, then persist.
    setConfig((c) =>
      c
        ? { ...c, projects: c.projects.map((p) => (p.id === activeProject.id ? { ...p, brain } : p)) }
        : c
    );
    await api.updateProject(activeProject.id, { brain });
  };

  const saveGenerationPresets = async (generationPresets: GenerationPreset[]) => {
    if (!activeProject) return;
    setConfig((c) =>
      c
        ? {
            ...c,
            projects: c.projects.map((p) =>
              p.id === activeProject.id ? { ...p, generationPresets } : p
            ),
          }
        : c
    );
    await api.updateProject(activeProject.id, { generationPresets });
  };

  const appendStyleMemory = async (entry: string, note: string) => {
    if (!activeProject) return;
    const stamp = new Date().toLocaleDateString();
    const nextMemory = `${activeProject.brain.styleMemory || ''}${activeProject.brain.styleMemory ? '\n\n' : ''}[${stamp}] ${entry}`.trim();
    await saveBrain({ ...activeProject.brain, styleMemory: nextMemory });
    setQueueNote(note);
    window.setTimeout(() => setQueueNote(null), 3200);
  };

  const handleQueueFeedback = async (action: QueueFeedbackAction, slideshow: Slideshow) => {
    if (!activeProject) return;
    const pattern = slideshow.slides.map((s, i) => `${i + 1}. ${s.text}`).join(' / ');
    if (action === 'more-like-this') {
      await appendStyleMemory(
        `Make more posts like this. Hook: "${slideshow.hook}". Pattern: ${pattern}. Why it should work: ${slideshow.rationale || 'approved from Queue'}.`,
        'Added this pattern to the Brain.'
      );
      return;
    }
    if (action === 'too-generic') {
      await appendStyleMemory(
        `Avoid generic drafts like "${slideshow.hook}". Replace broad claims with specific numbers, sharp audience pain, concrete examples, or a before/after contrast.`,
        'Added an avoidance note to the Brain.'
      );
      return;
    }
    const preset: GenerationPreset = {
      id: `preset-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      name: `Template: ${(slideshow.hook || 'Queue pick').slice(0, 42)}`,
      direction: `Use this reusable carousel structure: ${pattern}. Keep the pacing and slide roles, but swap in a new specific example and avoid copying the wording.`,
    };
    await saveGenerationPresets([preset, ...(activeProject.generationPresets || [])].slice(0, 20));
    setQueueNote('Saved as a generation preset.');
    window.setTimeout(() => setQueueNote(null), 3200);
  };

  const syncLearnedBrain = (brain: BrainState) => {
    if (!activeProject) return;
    setConfig((c) =>
      c
        ? { ...c, projects: c.projects.map((p) => (p.id === activeProject.id ? { ...p, brain } : p)) }
        : c
    );
  };

  const switchProject = async (id: string) => {
    setConfig(await api.activateProject(id));
    setQueue(await api.getQueue());
  };

  const newProject = async () => {
    setConfig(await api.createProject());
    setQueue(await api.getQueue());
    setActiveView('settings');
  };

  const removeProject = async (id: string) => {
    setConfig(await api.deleteProject(id));
    setQueue(await api.getQueue());
  };

  if (!config || !activeProject) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg text-ink-5 text-[13px]">
        {error ? <span className="text-red-600 max-w-sm text-center">{error}</span> : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-bg text-ink">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        queueCount={queue.length}
        scheduledCount={0}
        projects={config.projects}
        activeProjectId={config.activeProjectId}
        onSwitchProject={switchProject}
        onNewProject={newProject}
      />
      <main className="flex-1 h-full overflow-hidden flex flex-col">
        {error && activeView !== 'settings' && (
          <div className="px-8 py-2 bg-red-50 border-b border-red-200 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {activeView === 'queue' && (
          <QueueView
            slideshows={queue}
            generating={generating}
            canGenerate={hasGenerationKey}
            onGenerate={() => setGenerateOpen(true)}
            selectedIds={visibleSelectedIds}
            onApprove={(id) => setScheduling(queue.find((s) => s.id === id) || null)}
            onReject={reject}
            onEdit={(id) => setEditing(queue.find((s) => s.id === id) || null)}
            onToggleSelect={toggleSelect}
            onSelectAll={() => setSelectedIds(queue.map((s) => s.id))}
            onClearSelection={() => setSelectedIds([])}
            onBulkSchedule={() => setBulkOpen(true)}
            onBulkDelete={bulkDelete}
            brandKit={activeProject.brandKit}
            note={queueNote}
            onFeedback={handleQueueFeedback}
          />
        )}
        {activeView === 'slideshows' && <SlideshowLibraryView brandKit={activeProject.brandKit} />}
        {activeView === 'library' && <LibraryView hasApify={hasApify} />}
        {activeView === 'schedule' && <ScheduleView configured={hasPostbridge} />}
        {activeView === 'results' && <ResultsView configured={hasPostbridge} onBrainUpdated={syncLearnedBrain} />}
        {activeView === 'brain' && (
          <BrainView
            project={activeProject}
            onBrainChange={saveBrain}
            onGenerationPresetsChange={saveGenerationPresets}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView
            key={activeProject.id}
            config={config}
            project={activeProject}
            accounts={accounts}
            canDelete={config.projects.length > 1}
            onSave={saveSettings}
            onDeleteProject={() => removeProject(activeProject.id)}
            onReloadAccounts={loadAccounts}
          />
        )}
      </main>

      {scheduling && (
        <ScheduleModal
          slideshow={scheduling}
          brandKit={activeProject.brandKit}
          accounts={accounts}
          defaults={activeProject.defaults}
          onClose={() => setScheduling(null)}
          onConfirm={confirmSchedule}
        />
      )}

      {editing && (
        <SlideshowEditorModal
          slideshow={editing}
          brandKit={activeProject.brandKit}
          canUseAI={hasGenerationKey}
          defaultLinkText={displayLinkDomain(activeProject.brain.linkUrl)}
          onAiEdit={runSlideAiEdit}
          onClose={() => setEditing(null)}
          onSave={saveEdits}
        />
      )}

      {bulkOpen && visibleSelectedIds.length > 0 && (
        <BulkScheduleModal
          slideshows={queue.filter((s) => visibleSelectedIds.includes(s.id))}
          accounts={accounts}
          defaults={activeProject.defaults}
          brandKit={activeProject.brandKit}
          // Closing via the X/backdrop must still drop any now-scheduled items
          // from the queue — otherwise it looks stale until a browser reload.
          onClose={async () => {
            setBulkOpen(false);
            setSelectedIds([]);
            setQueue(await api.getQueue());
          }}
          onDone={bulkDone}
        />
      )}

      {generateOpen && (
        <GenerateModal
          defaultPacks={activeProject.imagePacks}
          pillars={activeProject.brain.contentPillars}
          presets={activeProject.generationPresets}
          generating={generating}
          progress={generationProgress}
          onClose={() => setGenerateOpen(false)}
          onGenerate={generate}
        />
      )}
    </div>
  );
}
