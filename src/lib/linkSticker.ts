import type { CSSProperties } from 'react';
import type { LinkSticker, LinkStickerPosition } from '../types';

export const LINK_STICKER_POSITIONS: LinkStickerPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'upper-center',
  'lower-center',
];

export const LINK_STICKER_POSITION_LABELS: Record<LinkStickerPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  'upper-center': 'Upper center',
  'lower-center': 'Lower center',
};

export function displayLinkDomain(value = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/^@+/, '').split(/\s+/)[0];
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(compact) ? compact : `https://${compact}`);
    return url.hostname.replace(/^www\./i, '') || compact.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
  } catch {
    return compact.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
  }
}

export function linkStickerPositionStyle(position: LinkStickerPosition): CSSProperties {
  const edgeX = '6.8cqw';
  const topY = '7.4cqh';
  const bottomY = '9.4cqh';

  switch (position) {
    case 'top-left':
      return { left: edgeX, top: topY };
    case 'top-right':
      return { right: edgeX, top: topY };
    case 'bottom-left':
      return { left: edgeX, bottom: bottomY };
    case 'bottom-right':
      return { right: edgeX, bottom: bottomY };
    case 'upper-center':
      return { left: '50%', top: '16.2cqh', transform: 'translateX(-50%)' };
    case 'lower-center':
      return { left: '50%', bottom: '19cqh', transform: 'translateX(-50%)' };
  }
}

export function linkStickerClassName(sticker: LinkSticker): string {
  const base =
    'absolute z-10 max-w-[76%] min-w-0 inline-flex items-center gap-[0.75cqh] whitespace-nowrap overflow-hidden';
  return sticker.style === 'instagram'
    ? `${base} rounded-[1.55cqh] bg-white/95 px-[1.35cqh] py-[0.82cqh] text-black shadow-[0_0.8cqh_2.1cqh_rgba(0,0,0,0.32)]`
    : `${base} rounded-[1.05cqh] bg-black/[0.88] px-[1.18cqh] py-[0.74cqh] text-white shadow-[0.22cqh_0.22cqh_0_#25f4ee,-0.22cqh_-0.22cqh_0_#fe2c55,0_0.95cqh_2.2cqh_rgba(0,0,0,0.38)]`;
}

export function linkStickerTextStyle(): CSSProperties {
  return {
    fontSize: '2.15cqh',
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

export function linkStickerIconStyle(sticker: LinkSticker): CSSProperties {
  return {
    width: '2.45cqh',
    height: '2.45cqh',
    flex: '0 0 auto',
    padding: '0.42cqh',
    borderRadius: sticker.style === 'instagram' ? '0.8cqh' : '0.55cqh',
    background: sticker.style === 'instagram' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.16)',
  };
}
