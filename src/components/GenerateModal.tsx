import { useState } from 'react';
import { X, Loader2, Sparkles, Target, Zap } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import type { GenerationPreset, GenerationProgressStatus } from '../types';

interface GenerateModalProps {
  defaultPacks: string[];
  pillars: string[];
  presets: GenerationPreset[];
  generating: boolean;
  progress?: GenerationProgressStatus | null;
  onClose: () => void;
  onGenerate: (count: number, packs: string[], direction: string, pillar: string, preset: string) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];

export function GenerateModal({ defaultPacks, pillars, presets, generating, progress, onClose, onGenerate }: GenerateModalProps) {
  const [count, setCount] = useState(3);
  const [packs, setPacks] = useState<string[]>(defaultPacks);
  const [direction, setDirection] = useState('');
  const [pillar, setPillar] = useState('');
  const [presetId, setPresetId] = useState('');
  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const presetDirection = selectedPreset
    ? `${selectedPreset.name}: ${selectedPreset.direction}`.trim()
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={generating ? undefined : onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <Sparkles size={15} /> Generate slideshows
          </h2>
          {!generating && <button onClick={onClose} className="text-ink-5 hover:text-ink"><X size={18} /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {generating && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-ink">
                    {progress?.message || 'Starting generation…'}
                  </div>
                  <div className="text-[11px] text-ink-6 mt-0.5 capitalize">
                    {progress?.phase || 'queued'}
                    {progress && progress.total > 1 ? ` · ${progress.done} / ${progress.total}` : ''}
                  </div>
                </div>
                <span className="text-[12px] text-ink-5 tabular-nums">
                  {progress?.percent ?? 0}%
                </span>
              </div>
              <div className="h-1.5 bg-raised rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-ink rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(4, progress?.percent ?? 4)}%` }}
                />
              </div>
            </div>
          )}

          {/* Count */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">How many?</label>
            <div className="flex items-center gap-2">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  disabled={generating}
                  className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    count === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                disabled={generating}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))))}
                className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-ink-6 mt-1">1–100. Large batches take a while — they generate in chunks.</p>
          </div>

          {/* Strategy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="generate-pillar" className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 flex items-center gap-1.5">
                <Target size={12} /> Pillar
              </label>
              <select
                id="generate-pillar"
                value={pillar}
                disabled={generating}
                onChange={(e) => setPillar(e.target.value)}
                className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Any pillar</option>
                {pillars.filter(Boolean).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="generate-preset" className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 flex items-center gap-1.5">
                <Zap size={12} /> Preset
              </label>
              <select
                id="generate-preset"
                value={presetId}
                disabled={generating}
                onChange={(e) => setPresetId(e.target.value)}
                className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">No preset</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.slice(0, 5).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setPresetId((current) => (current === preset.id ? '' : preset.id))}
                  disabled={generating}
                  className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    presetId === preset.id
                      ? 'border-ink bg-ink text-bg'
                      : 'border-line bg-card text-ink-4 hover:border-line-2 hover:text-ink'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}

          {/* Direction */}
          <div>
            <label htmlFor="generate-direction" className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
              Custom direction
            </label>
            <input
              id="generate-direction"
              type="text"
              value={direction}
              disabled={generating}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="e.g. focus on retention mistakes, use sharper numbers"
              className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 placeholder:text-ink-6 disabled:opacity-50"
            />
            {selectedPreset && (
              <p className="text-[11px] text-ink-6 mt-1 leading-snug line-clamp-2">{selectedPreset.direction}</p>
            )}
          </div>

          {/* Packs */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Background packs</label>
            <PackPicker selected={packs} onChange={setPacks} disabled={generating} />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button
            variant="primary"
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            onClick={() => onGenerate(count, packs, direction.trim(), pillar, presetDirection)}
            disabled={generating}
          >
            {generating ? 'Generating…' : `Generate ${count}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
