import type { BrandKit } from '../types';

export const DEFAULT_BRAND_KIT: BrandKit = {
  primaryColor: '#0a0a0a',
  accentColor: '#f97316',
  backgroundColor: '#111827',
  textColor: '#ffffff',
  overlayOpacity: 0.45,
  logoDataUrl: '',
  logoPosition: 'bottom-right',
  fontStyle: 'bold',
};

export const BRAND_FONT_LABELS: Record<BrandKit['fontStyle'], string> = {
  bold: 'Clean bold',
  editorial: 'Editorial serif',
  compact: 'Compact mono',
};

export const BRAND_LOGO_POSITION_LABELS: Record<BrandKit['logoPosition'], string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function colorOr(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback;
}

export function normalizeBrandKit(kit?: Partial<BrandKit> | null): BrandKit {
  const fontStyle = kit?.fontStyle && kit.fontStyle in BRAND_FONT_LABELS ? kit.fontStyle : DEFAULT_BRAND_KIT.fontStyle;
  const logoPosition =
    kit?.logoPosition && kit.logoPosition in BRAND_LOGO_POSITION_LABELS
      ? kit.logoPosition
      : DEFAULT_BRAND_KIT.logoPosition;

  return {
    primaryColor: colorOr(kit?.primaryColor, DEFAULT_BRAND_KIT.primaryColor),
    accentColor: colorOr(kit?.accentColor, DEFAULT_BRAND_KIT.accentColor),
    backgroundColor: colorOr(kit?.backgroundColor, DEFAULT_BRAND_KIT.backgroundColor),
    textColor: colorOr(kit?.textColor, DEFAULT_BRAND_KIT.textColor),
    overlayOpacity: Math.min(0.85, Math.max(0, Number(kit?.overlayOpacity ?? DEFAULT_BRAND_KIT.overlayOpacity))),
    logoDataUrl: kit?.logoDataUrl?.startsWith('data:image/') ? kit.logoDataUrl : '',
    logoPosition,
    fontStyle,
  };
}

function hexToRgb(hex: string) {
  const clean = colorOr(hex, '#000000').slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

export function captionFontStack(style: BrandKit['fontStyle']): string {
  switch (style) {
    case 'editorial':
      return 'Georgia, Cambria, "Times New Roman", serif';
    case 'compact':
      return '"SFMono-Regular", "Roboto Mono", Consolas, monospace';
    case 'bold':
    default:
      return 'Inter, ui-sans-serif, system-ui, sans-serif';
  }
}

export function captionFontWeight(style: BrandKit['fontStyle']): number {
  return style === 'editorial' ? 700 : 800;
}

export function captionStrokeColor(textColor: string): string {
  const { r, g, b } = hexToRgb(textColor);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? '#000000' : 'rgba(255,255,255,0.88)';
}

export function brandGradient(kit: BrandKit): string {
  return `linear-gradient(135deg, ${kit.backgroundColor} 0%, ${kit.primaryColor} 62%, ${kit.accentColor} 100%)`;
}

