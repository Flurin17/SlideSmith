import type { CSSProperties } from 'react';
import type { BrandKit } from '../types';
import { captionFontStack, captionFontWeight, captionStrokeColor, DEFAULT_BRAND_KIT, normalizeBrandKit } from './brandKit';

// ─── Single source of truth for caption styling ─────────────────────────────
// Both the on-screen editor preview (SlidePreview.tsx, plain CSS) AND the
// exported PNG (lib/render.ts, canvas) consume these exact numbers, so a slide
// in the editor looks pixel-equivalent to the baked image that gets scheduled —
// just at a different physical size. Tweak the look in ONE place.
//
// Values are percent-of-slide-height. The preview expresses them as container
// query height units (cqh); the bake multiplies them by the canvas height.

// Caption font size as a percent of slide height. 2.7% of a 1080×1920 slide
// ≈ 52px in the baked PNG — a clean, readable TikTok caption.
export const FONT_SIZE_PCT = 2.7;

// Black outline width as a fraction of the font size — the TikTok/CapCut look.
export const STROKE_RATIO = 0.08;

// Line-height multiple, shared by both renderers.
export const LINE_HEIGHT = 1.2;

// Horizontal safe-zone padding as a percent of slide width.
export const SIDE_PAD_PCT = 8;

// Convert a percent (e.g. 8) to a ratio (0.08) for canvas math.
export const pct = (p: number) => p / 100;

// ─── CSS for the preview overlay text ───────────────────────────────────────
// The slide container MUST carry SLIDE_CONTAINER_STYLE (containerType: 'size')
// so `cqh` resolves to a percent of the slide's height, not the viewport.
export function captionTextStyle(brandKit?: BrandKit): CSSProperties {
  const kit = normalizeBrandKit(brandKit || DEFAULT_BRAND_KIT);
  const strokePct = FONT_SIZE_PCT * STROKE_RATIO;
  return {
    fontSize: `${FONT_SIZE_PCT}cqh`,
    WebkitTextStroke: `${strokePct}cqh ${captionStrokeColor(kit.textColor)}`,
    paintOrder: 'stroke fill', // stroke under fill — clean outline, no eaten glyphs
    fontWeight: captionFontWeight(kit.fontStyle),
    fontFamily: captionFontStack(kit.fontStyle),
    color: kit.textColor,
    lineHeight: LINE_HEIGHT,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxWidth: '100%',
  };
}

// Put this on the slide container so the cqh units above work.
export const SLIDE_CONTAINER_STYLE: CSSProperties = { containerType: 'size' };
