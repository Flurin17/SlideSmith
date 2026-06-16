import { useEffect, useState, type ChangeEvent } from 'react';
import { Check, X, Loader2, KeyRound, Trash2, Info, Upload, BrainCircuit, RefreshCw } from 'lucide-react';
import type { AppConfig, Project, SocialAccount, ModelOption, ImageTranscriptionStatus } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { testKeys, getModels, getImageTranscriptionStatus, startImageTranscriptions } from '../lib/api';
import { PackPicker } from '../components/PackPicker';
import { SlidePreview } from '../components/SlidePreview';
import {
  BRAND_FONT_LABELS,
  BRAND_LOGO_POSITION_LABELS,
  normalizeBrandKit,
} from '../lib/brandKit';

interface SettingsViewProps {
  config: AppConfig;
  project: Project;
  accounts: SocialAccount[];
  canDelete: boolean;
  onSave: (patch: {
    keys?: AppConfig['keys'];
    aiProvider?: AppConfig['aiProvider'];
    model?: string;
    azureOpenAI?: AppConfig['azureOpenAI'];
    pinterestActor?: string;
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
    brandKit?: Project['brandKit'];
    aiCreativeControl?: boolean;
  }) => Promise<void>;
  onDeleteProject: () => void;
  onReloadAccounts: () => void;
}

const POSTBRIDGE_URL = 'https://post-bridge.com?atp=clip-factory';

const PostBridgeLink = ({ children }: { children: React.ReactNode }) => (
  <a href={POSTBRIDGE_URL} target="_blank" rel="noreferrer" className="text-ink-4 underline hover:text-ink">
    {children}
  </a>
);

const inputClass =
  'w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

export function SettingsView({
  config,
  project,
  accounts,
  canDelete,
  onSave,
  onDeleteProject,
  onReloadAccounts,
}: SettingsViewProps) {
  const [postbridge, setPostbridge] = useState(config.keys.postbridge);
  const [openrouter, setOpenrouter] = useState(config.keys.openrouter);
  const [azureOpenAI, setAzureOpenAI] = useState(config.keys.azureOpenAI);
  const [azureEndpoint, setAzureEndpoint] = useState(config.azureOpenAI.endpoint);
  const [apify, setApify] = useState(config.keys.apify);
  const [aiProvider, setAiProvider] = useState<AppConfig['aiProvider']>(config.aiProvider);
  const [pinterestActor, setPinterestActor] = useState(config.pinterestActor);
  const [model, setModel] = useState(config.model);
  const [name, setName] = useState(project.name);
  const [mode, setMode] = useState(project.defaults.mode);
  const [selected, setSelected] = useState<number[]>(project.defaults.socialAccountIds);
  const [imagePacks, setImagePacks] = useState<string[]>(project.imagePacks);
  const [brandKit, setBrandKit] = useState(() => normalizeBrandKit(project.brandKit));
  const [aiCreativeControl, setAiCreativeControl] = useState(project.aiCreativeControl);
  const [transcriptionStatus, setTranscriptionStatus] = useState<ImageTranscriptionStatus | null>(null);
  const [transcriptionBusy, setTranscriptionBusy] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelFilter, setModelFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [test, setTest] = useState<{
    postbridge: boolean;
    openrouter: boolean;
    azureOpenAI: boolean;
    apify: boolean;
    errors: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    getModels().then(setModels).catch(() => setModels([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const next = await getImageTranscriptionStatus();
        if (!cancelled) setTranscriptionStatus(next);
      } catch {
        if (!cancelled) setTranscriptionStatus(null);
      }
    };
    void loadStatus();
    const id = window.setInterval(() => {
      if (aiCreativeControl || transcriptionStatus?.running) void loadStatus();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [aiCreativeControl, transcriptionStatus?.running]);

  const startTranscriptions = async () => {
    setTranscriptionBusy(true);
    setSaveError(null);
    try {
      setTranscriptionStatus(await startImageTranscriptions());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscriptionBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave({
        keys: { postbridge, openrouter, azureOpenAI, apify },
        aiProvider,
        model,
        azureOpenAI: { endpoint: azureEndpoint },
        pinterestActor,
        name,
        defaults: { socialAccountIds: selected, mode },
        imagePacks,
        brandKit,
        aiCreativeControl,
      });
      if (aiCreativeControl) await startTranscriptions();
      onReloadAccounts();
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      await save();
      setTest(await testKeys());
      onReloadAccounts();
    } finally {
      setTesting(false);
    }
  };

  const toggleAccount = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const patchBrandKit = (patch: Partial<Project['brandKit']>) => {
    setBrandKit((prev) => normalizeBrandKit({ ...prev, ...patch }));
    setSaved(false);
  };

  const uploadLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveError('Logo must be an image file.');
      return;
    }
    if (file.size > 1_500_000) {
      setSaveError('Logo image must be under 1.5 MB.');
      return;
    }

    setSaveError(null);
    const reader = new FileReader();
    reader.onload = () => patchBrandKit({ logoDataUrl: String(reader.result || '') });
    reader.onerror = () => setSaveError('Could not read logo image.');
    reader.readAsDataURL(file);
  };

  const filtered = modelFilter
    ? models.filter(
        (m) =>
          m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
          m.name.toLowerCase().includes(modelFilter.toLowerCase())
      )
    : models;

  return (
    <>
      <ViewHeader
        title="Settings"
        subtitle="Your own API keys, stored locally on this machine — never sent anywhere but the services they belong to."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8 space-y-8">
          {/* Project */}
          <Section
            title="Project"
            description="A project is one brand/account. Its Brain and default posting accounts are separate — your API keys and model are shared across all projects."
          >
            <Field label="Project name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            {canDelete && (
              <Button variant="danger-ghost" icon={<Trash2 size={13} />} onClick={onDeleteProject}>
                Delete this project
              </Button>
            )}
          </Section>

          {/* Brand kit (per project) */}
          <Section
            title="Brand kit"
            description="Applied to this project's slide previews and scheduled PNG exports."
          >
            <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-start">
              <div className="w-[150px] mx-auto sm:mx-0">
                <SlidePreview
                  slide={{ id: 'brand-preview', text: 'MAKE IT EASY TO REMEMBER', bgFrom: '#0f172a', bgTo: '#1e293b' }}
                  brandKit={brandKit}
                />
              </div>
              <div className="space-y-4 min-w-0">
                <Field label="Logo">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg border border-line bg-surface flex items-center justify-center overflow-hidden">
                      {brandKit.logoDataUrl ? (
                        <img src={brandKit.logoDataUrl} alt="" className="w-full h-full object-contain p-1.5" />
                      ) : (
                        <span className="text-[10px] text-ink-6 uppercase tracking-wider">None</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-line bg-card text-[13px] font-medium text-ink hover:border-line-2 cursor-pointer">
                        <Upload size={13} />
                        Upload
                        <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
                      </label>
                      {brandKit.logoDataUrl && (
                        <Button variant="ghost" onClick={() => patchBrandKit({ logoDataUrl: '' })}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    label="Primary"
                    value={brandKit.primaryColor}
                    onChange={(primaryColor) => patchBrandKit({ primaryColor })}
                  />
                  <ColorField
                    label="Accent"
                    value={brandKit.accentColor}
                    onChange={(accentColor) => patchBrandKit({ accentColor })}
                  />
                  <ColorField
                    label="Background"
                    value={brandKit.backgroundColor}
                    onChange={(backgroundColor) => patchBrandKit({ backgroundColor })}
                  />
                  <ColorField
                    label="Text"
                    value={brandKit.textColor}
                    onChange={(textColor) => patchBrandKit({ textColor })}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Caption style">
                    <select
                      value={brandKit.fontStyle}
                      onChange={(e) => patchBrandKit({ fontStyle: e.target.value as Project['brandKit']['fontStyle'] })}
                      className={inputClass}
                    >
                      {Object.entries(BRAND_FONT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Logo position">
                    <select
                      value={brandKit.logoPosition}
                      onChange={(e) => patchBrandKit({ logoPosition: e.target.value as Project['brandKit']['logoPosition'] })}
                      className={inputClass}
                      disabled={!brandKit.logoDataUrl}
                    >
                      {Object.entries(BRAND_LOGO_POSITION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label={`Overlay strength ${Math.round(brandKit.overlayOpacity * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={85}
                    value={Math.round(brandKit.overlayOpacity * 100)}
                    onChange={(e) => patchBrandKit({ overlayOpacity: Number(e.target.value) / 100 })}
                    className="w-full accent-ink"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section
            title="AI creative control"
            description="Let the selected AI model choose caption style and match described library images to each slide."
          >
            <div className="rounded-lg border border-line bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <BrainCircuit size={15} />
                    AI chooses fonts and backgrounds
                  </div>
                  <p className="text-[12px] text-ink-5 mt-1 leading-snug">
                    When enabled, Slidesmith transcribes missing library images in parallel and sends those descriptions to generation so the model can pick the right image and font style.
                  </p>
                </div>
                <label className="shrink-0 inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiCreativeControl}
                    onChange={(e) => {
                      setAiCreativeControl(e.target.checked);
                      setSaved(false);
                    }}
                    className="sr-only peer"
                  />
                  <span className="w-10 h-6 rounded-full bg-raised border border-line relative transition-colors peer-checked:bg-ink after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-card after:border after:border-line after:transition-transform peer-checked:after:translate-x-4" />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-5">
                <span>
                  {transcriptionStatus
                    ? `${transcriptionStatus.described} / ${transcriptionStatus.total} images described`
                    : 'Image description status unavailable'}
                </span>
                {transcriptionStatus?.running && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Loader2 size={12} className="animate-spin" />
                    processing {transcriptionStatus.done + transcriptionStatus.failed}
                  </span>
                )}
                {transcriptionStatus?.lastError && (
                  <span className="text-red-600 truncate max-w-full">{transcriptionStatus.lastError}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={transcriptionBusy || transcriptionStatus?.running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  onClick={startTranscriptions}
                  disabled={transcriptionBusy || transcriptionStatus?.running || !aiCreativeControl}
                >
                  Transcribe missing images
                </Button>
                {!aiCreativeControl && (
                  <span className="text-[11px] text-ink-6 self-center">Enable and save to start automatically.</span>
                )}
              </div>
            </div>
          </Section>

          {/* Keys (global) */}
          <Section
            title="API keys"
            description="Shared across all projects. Stored in ~/.slidesmith/config.json on your computer."
          >
            <Field
              label="post-bridge API key"
              hint={<>Handles scheduling, posting &amp; analytics. Get one at <PostBridgeLink>post-bridge.com</PostBridgeLink>.</>}
            >
              <input
                value={postbridge}
                onChange={(e) => setPostbridge(e.target.value)}
                placeholder="pb_..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.postbridge} error={test?.errors?.postbridge} />
            </Field>
            <Field label="OpenRouter API key" hint="Runs the AI that writes your slideshows — one key, any model. Get one at openrouter.ai/keys.">
              <input
                value={openrouter}
                onChange={(e) => setOpenrouter(e.target.value)}
                placeholder="sk-or-..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.openrouter} error={test?.errors?.openrouter} />
            </Field>
            <Field label="Azure OpenAI API key" hint="Used when Azure OpenAI is selected below. The v1 API uses your Azure resource endpoint plus /openai/v1.">
              <input
                value={azureOpenAI}
                onChange={(e) => setAzureOpenAI(e.target.value)}
                placeholder="Azure API key"
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.azureOpenAI} error={test?.errors?.azureOpenAI} />
            </Field>
            <Field label="Apify API key (optional)" hint="Only needed to scrape MORE Pinterest images. The bundled aesthetic packs work without it. Get one at console.apify.com.">
              <input
                value={apify}
                onChange={(e) => setApify(e.target.value)}
                placeholder="apify_api_..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.apify} error={test?.errors?.apify} />
            </Field>
            <Field label="Pinterest Apify actor" hint="The Apify actor used for scraping. Change only if you prefer a different one.">
              <input
                value={pinterestActor}
                onChange={(e) => setPinterestActor(e.target.value)}
                placeholder="fatihtahta/pinterest-scraper-search"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="AI provider" hint="OpenRouter uses the public model catalog. Azure OpenAI uses your v1 resource endpoint and model deployment name.">
              <div className="flex gap-2">
                <Button variant={aiProvider === 'openrouter' ? 'primary' : 'secondary'} onClick={() => setAiProvider('openrouter')}>
                  OpenRouter
                </Button>
                <Button variant={aiProvider === 'azure-openai' ? 'primary' : 'secondary'} onClick={() => setAiProvider('azure-openai')}>
                  Azure OpenAI
                </Button>
              </div>
            </Field>
            {aiProvider === 'azure-openai' ? (
              <>
                <Field label="Azure OpenAI endpoint" hint="Example: https://your-resource.openai.azure.com. /openai/v1 is added automatically if omitted.">
                  <input
                    value={azureEndpoint}
                    onChange={(e) => setAzureEndpoint(e.target.value)}
                    placeholder="https://your-resource.openai.azure.com"
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label="Azure model deployment" hint="Use the Azure deployment/model name configured on your resource.">
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4o-mini"
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </>
            ) : (
              <Field label="Model" hint={`Pick any model OpenRouter offers${models.length ? ` (${models.length} available)` : ''}.`}>
                <input
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder="Filter models… e.g. claude, gpt, llama"
                  className={`${inputClass} mb-2`}
                />
                <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
                  {model && !filtered.some((m) => m.id === model) && <option value={model}>{model}</option>}
                  {filtered.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Section>

          {/* Posting defaults (per project) */}
          <Section
            title="Posting defaults"
            description="Which connected accounts this project posts to, and whether to schedule directly or save as a draft in post-bridge."
          >
            {accounts.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                No connected accounts yet. Add your post-bridge key above, hit Test, then connect
                accounts at <PostBridgeLink>post-bridge.com</PostBridgeLink> — they'll appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card cursor-pointer hover:border-line-2"
                  >
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                    <span className="text-[13px] text-ink font-medium">{a.username}</span>
                    <span className="text-[11px] text-ink-5 uppercase tracking-wide">{a.platform}</span>
                  </label>
                ))}
              </div>
            )}

            <Field label="Default mode">
              <div className="flex gap-2">
                <Button variant={mode === 'draft' ? 'primary' : 'secondary'} onClick={() => setMode('draft')}>
                  Save as draft
                </Button>
                <Button variant={mode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setMode('schedule')}>
                  Schedule directly
                </Button>
              </div>
            </Field>
            <DraftNote />
          </Section>

          {/* Background packs (per project) */}
          <Section
            title="Background packs"
            description="Which image packs new slideshows pull backgrounds from when you hit Generate. Select none to generate with plain gradients."
          >
            <PackPicker selected={imagePacks} onChange={setImagePacks} />
          </Section>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button variant="secondary" size="lg" onClick={runTest} disabled={testing || saving}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : null}
              Test connection
            </Button>
            {saved && !saveError && (
              <span className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Saved
              </span>
            )}
            {saveError && (
              <span className="text-[12px] text-red-600 flex items-center gap-1">
                <X size={13} /> {saveError}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function DraftNote() {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-line">
      <Info size={13} className="text-ink-5 mt-0.5 shrink-0" />
      <p className="text-[12px] text-ink-4 leading-snug">
        <span className="font-medium text-ink-3">Drafts vs. scheduling:</span> drafts land in your
        post-bridge inbox to post by hand. You won't get analytics back on drafts — TikTok only
        reports on content it publishes itself — but posting manually avoids automation detection,
        so reach potential is often higher. Scheduling posts automatically and does report analytics.
      </p>
    </div>
  );
}

function TestBadge({ ok, error }: { ok?: boolean; error?: string }) {
  if (ok === undefined) return null;
  return ok ? (
    <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
      <Check size={11} /> Connected
    </p>
  ) : (
    <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
      <X size={11} /> {error || 'Failed'}
    </p>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{title}</h2>
        <p className="text-[12px] text-ink-5 mt-1">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-6 mt-1">{hint}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 rounded-lg border border-line bg-card p-1 cursor-pointer"
        />
        <input
          value={value}
          readOnly
          className={`${inputClass} font-mono uppercase`}
        />
      </div>
    </Field>
  );
}
