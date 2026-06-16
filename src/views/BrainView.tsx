import { Plus, Trash2 } from 'lucide-react';
import type { BrainState, GenerationPreset, Project } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';

interface BrainViewProps {
  project: Project;
  onBrainChange: (brain: BrainState) => void;
  onGenerationPresetsChange: (presets: GenerationPreset[]) => void;
}

const inputClass =
  'w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

const textareaClass =
  'w-full bg-card border border-line rounded-lg px-3 py-2.5 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors resize-none ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

export function BrainView({ project, onBrainChange, onGenerationPresetsChange }: BrainViewProps) {
  const brain = project.brain;
  const pillars = brain.contentPillars || [];
  const presets = project.generationPresets || [];
  const updatePillar = (index: number, value: string) => {
    const next = pillars.map((pillar, i) => (i === index ? value : pillar));
    onBrainChange({ ...brain, contentPillars: next });
  };
  const addPillar = () => onBrainChange({ ...brain, contentPillars: [...pillars, ''] });
  const removePillar = (index: number) =>
    onBrainChange({ ...brain, contentPillars: pillars.filter((_, i) => i !== index) });
  const updatePreset = (id: string, patch: Partial<GenerationPreset>) =>
    onGenerationPresetsChange(presets.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)));
  const addPreset = () =>
    onGenerationPresetsChange([
      ...presets,
      {
        id: newId('preset'),
        name: '',
        direction: '',
      },
    ]);
  const removePreset = (id: string) =>
    onGenerationPresetsChange(presets.filter((preset) => preset.id !== id));

  return (
    <>
      <ViewHeader
        title="Brain"
        subtitle="What the AI knows about this project. Edits apply to all future generations."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8 space-y-8">
          {/* Niche & app */}
          <Section title="Account context" description="Rarely changes. Defines who the AI is writing for.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Niche">
                <input
                  value={brain.niche}
                  onChange={(e) => onBrainChange({ ...brain, niche: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="App name">
                <input
                  value={brain.appName}
                  onChange={(e) => onBrainChange({ ...brain, appName: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="App description">
              <textarea
                value={brain.appDescription}
                onChange={(e) => onBrainChange({ ...brain, appDescription: e.target.value })}
                rows={2}
                className={textareaClass}
              />
            </Field>
            <Field label="Audience">
              <input
                value={brain.audience}
                onChange={(e) => onBrainChange({ ...brain, audience: e.target.value })}
                className={inputClass}
              />
            </Field>
          </Section>

          <Section
            title="Link sticker"
            description="The domain AI can place as a native-looking visual link sticker on future slides."
          >
            <Field label="Link or domain">
              <input
                value={brain.linkUrl}
                onChange={(e) => onBrainChange({ ...brain, linkUrl: e.target.value })}
                placeholder="https://yourdomain.com"
                className={inputClass}
              />
            </Field>
          </Section>

          <Section
            title="Content pillars"
            description="Recurring themes the Generate modal can target for this project."
          >
            <div className="space-y-2">
              {pillars.map((pillar, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={pillar}
                    onChange={(e) => updatePillar(index, e.target.value)}
                    placeholder="e.g. retention mistakes, founder lessons, customer proof"
                    className={inputClass}
                  />
                  <Button
                    variant="ghost"
                    icon={<Trash2 size={12} />}
                    onClick={() => removePillar(index)}
                    aria-label="Remove pillar"
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button variant="secondary" icon={<Plus size={13} />} onClick={addPillar}>
                Add pillar
              </Button>
            </div>
          </Section>

          <Section
            title="Generation presets"
            description="Quick directions available when starting a new batch."
          >
            <div className="space-y-3">
              {presets.map((preset) => (
                <div key={preset.id} className="rounded-lg border border-line bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={preset.name}
                      onChange={(e) => updatePreset(preset.id, { name: e.target.value })}
                      placeholder="Preset name"
                      className={inputClass}
                    />
                    <Button
                      variant="ghost"
                      icon={<Trash2 size={12} />}
                      onClick={() => removePreset(preset.id)}
                      aria-label="Remove preset"
                    >
                      Remove
                    </Button>
                  </div>
                  <textarea
                    value={preset.direction}
                    onChange={(e) => updatePreset(preset.id, { direction: e.target.value })}
                    rows={2}
                    placeholder="Describe the angle, format, or creative constraint this preset should apply."
                    className={textareaClass}
                  />
                </div>
              ))}
              <Button variant="secondary" icon={<Plus size={13} />} onClick={addPreset}>
                Add preset
              </Button>
            </div>
          </Section>

          {/* Style memory */}
          <Section
            title="Style memory"
            description="The voice and patterns that work for you. Describe your hooks, slide structure, and CTAs — the AI follows this closely."
          >
            <textarea
              value={brain.styleMemory}
              onChange={(e) => onBrainChange({ ...brain, styleMemory: e.target.value })}
              rows={16}
              className={`${textareaClass} font-mono text-[12px] leading-relaxed`}
            />
          </Section>
        </div>
      </div>
    </>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
