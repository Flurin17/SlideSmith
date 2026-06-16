// Client-side slide renderer. Each slide becomes a 1080×1920 PNG drawn on a
// canvas — text over a gradient. No image-generation API, no cost, deterministic
// output. The resulting data URLs are sent to the server, which uploads them to
// post-bridge as the post's media.
//
// Caption geometry (font %, stroke, line-height, padding, centering) comes from
// lib/captionStyle.ts — the SAME constants the editor preview uses — so the
// scheduled PNG matches what the user saw when editing.
import type { BrandKit, LinkSticker, Slide, Slideshow } from '../types';
import { FONT_SIZE_PCT, STROKE_RATIO, LINE_HEIGHT, SIDE_PAD_PCT, pct } from './captionStyle';
import {
  captionFontStack,
  captionFontWeight,
  captionStrokeColor,
  normalizeBrandKit,
  rgba,
} from './brandKit';

const W = 1080;
const H = 1920;

// Word-wrap within hard newlines, mirroring the preview's wrapping.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { out.push(''); continue; }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

// Draw an image to cover the whole canvas (object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  maxW: number,
  maxH: number
) {
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x + (maxW - w) / 2, y + (maxH - h) / 2, w, h);
}

function fillBrandGradient(ctx: CanvasRenderingContext2D, kit: BrandKit) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, kit.backgroundColor);
  grad.addColorStop(0.62, kit.primaryColor);
  grad.addColorStop(1, kit.accentColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.82, H * 0.18, 0, W * 0.82, H * 0.18, H * 0.72);
  glow.addColorStop(0, rgba(kit.accentColor, Math.min(0.38, kit.overlayOpacity * 0.55)));
  glow.addColorStop(1, rgba(kit.accentColor, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function logoBox(position: BrandKit['logoPosition']) {
  const maxW = Math.round(W * 0.23);
  const maxH = Math.round(H * 0.1);
  const edgeX = Math.round(W * 0.068);
  const edgeY = Math.round(H * 0.058);

  switch (position) {
    case 'top-left':
      return { x: edgeX, y: edgeY, maxW, maxH };
    case 'top-right':
      return { x: W - edgeX - maxW, y: edgeY, maxW, maxH };
    case 'bottom-left':
      return { x: edgeX, y: H - edgeY - maxH, maxW, maxH };
    case 'bottom-right':
      return { x: W - edgeX - maxW, y: H - edgeY - maxH, maxW, maxH };
  }
}

async function drawLogo(ctx: CanvasRenderingContext2D, kit: BrandKit) {
  if (!kit.logoDataUrl) return;
  try {
    const logo = await loadImage(kit.logoDataUrl);
    const box = logoBox(kit.logoPosition);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.round(H * 0.012);
    ctx.shadowOffsetY = Math.round(H * 0.004);
    drawContain(ctx, logo, box.x, box.y, box.maxW, box.maxH);
    ctx.restore();
  } catch {
    // Ignore a stale or unsupported data URL; the rest of the slide should render.
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function ellipseText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let next = text.trim();
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1).trimEnd();
  }
  return `${next || text.slice(0, 1)}...`;
}

function linkStickerRect(sticker: LinkSticker, w: number, h: number) {
  const edgeX = Math.round(W * 0.068);
  const topY = Math.round(H * 0.074);
  const bottomY = Math.round(H * 0.094);
  const upperY = Math.round(H * 0.162);
  const lowerBottom = Math.round(H * 0.19);

  switch (sticker.position) {
    case 'top-left':
      return { x: edgeX, y: topY };
    case 'top-right':
      return { x: W - edgeX - w, y: topY };
    case 'bottom-left':
      return { x: edgeX, y: H - bottomY - h };
    case 'bottom-right':
      return { x: W - edgeX - w, y: H - bottomY - h };
    case 'upper-center':
      return { x: (W - w) / 2, y: upperY };
    case 'lower-center':
      return { x: (W - w) / 2, y: H - lowerBottom - h };
  }
}

function drawLinkIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, bg: string, radius: number) {
  const box = radius * 2;
  roundedRect(ctx, cx - radius, cy - radius, box, box, radius * 0.34);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, radius * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(-radius * 0.72, -radius * 0.17, radius * 0.88, radius * 0.34, radius * 0.17);
  ctx.roundRect(-radius * 0.16, -radius * 0.17, radius * 0.88, radius * 0.34, radius * 0.17);
  ctx.stroke();
  ctx.restore();
}

function drawLinkSticker(ctx: CanvasRenderingContext2D, sticker?: LinkSticker) {
  const text = sticker?.text?.trim();
  if (!sticker || !text) return;

  const isInstagram = sticker.style === 'instagram';
  const fontPx = Math.round(H * 0.0215);
  const stickerH = Math.round(H * (isInstagram ? 0.041 : 0.0365));
  const padX = Math.round(H * (isInstagram ? 0.0135 : 0.0118));
  const gap = Math.round(H * 0.0075);
  const iconSize = Math.round(H * 0.0245);
  const maxW = Math.round(W * 0.76);

  ctx.save();
  ctx.font = `800 ${fontPx}px Inter, sans-serif`;
  const textMaxW = maxW - padX * 2 - iconSize - gap;
  const label = ellipseText(ctx, text, textMaxW);
  const textW = Math.ceil(ctx.measureText(label).width);
  const stickerW = Math.min(maxW, padX * 2 + iconSize + gap + textW);
  const { x, y } = linkStickerRect(sticker, stickerW, stickerH);

  ctx.shadowColor = 'rgba(0,0,0,0.34)';
  ctx.shadowBlur = Math.round(H * 0.012);
  ctx.shadowOffsetY = Math.round(H * 0.006);
  roundedRect(ctx, x, y, stickerW, stickerH, Math.round(stickerH * (isInstagram ? 0.39 : 0.29)));
  ctx.fillStyle = isInstagram ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.88)';
  ctx.fill();

  if (!isInstagram) {
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(3, Math.round(H * 0.0023));
    roundedRect(ctx, x + 5, y + 5, stickerW, stickerH, Math.round(stickerH * 0.29));
    ctx.strokeStyle = '#25f4ee';
    ctx.stroke();
    roundedRect(ctx, x - 5, y - 5, stickerW, stickerH, Math.round(stickerH * 0.29));
    ctx.strokeStyle = '#fe2c55';
    ctx.stroke();
  }

  ctx.shadowColor = 'transparent';
  const iconCx = x + padX + iconSize / 2;
  const iconCy = y + stickerH / 2;
  drawLinkIcon(
    ctx,
    iconCx,
    iconCy,
    isInstagram ? '#0a0a0a' : '#ffffff',
    isInstagram ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.16)',
    iconSize / 2
  );

  ctx.fillStyle = isInstagram ? '#050505' : '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontPx}px Inter, sans-serif`;
  ctx.fillText(label, x + padX + iconSize + gap, y + stickerH / 2 + 1);
  ctx.restore();
}

export async function renderSlide(slide: Slide, brandKit?: BrandKit): Promise<string> {
  // Make sure the web font is ready, otherwise the first render uses a fallback.
  if (document.fonts?.ready) await document.fonts.ready;
  const kit = normalizeBrandKit({ ...brandKit, fontStyle: slide.fontStyle || brandKit?.fontStyle });

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (slide.imageUrl) {
    // Image background (same-origin: bundled at /library/… or scraped via /api/…).
    try {
      const img = await loadImage(slide.imageUrl);
      drawCover(ctx, img);
      // Brand overlay, matching SlidePreview.
      ctx.fillStyle = rgba(kit.backgroundColor, kit.overlayOpacity);
      ctx.fillRect(0, 0, W, H);
    } catch {
      fillBrandGradient(ctx, kit);
    }
  } else {
    fillBrandGradient(ctx, kit);
    const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, rgba(kit.backgroundColor, Math.min(0.55, kit.overlayOpacity)));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  await drawLogo(ctx, kit);

  // Caption style is driven by the SAME percentages/helpers the editor preview
  // uses, so the two always match.
  const fontPx = Math.round(H * pct(FONT_SIZE_PCT));
  const lineHeight = Math.round(fontPx * LINE_HEIGHT);
  const strokeW = Math.max(2, Math.round(fontPx * STROKE_RATIO));

  ctx.font = `${captionFontWeight(kit.fontStyle)} ${fontPx}px ${captionFontStack(kit.fontStyle)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const maxWidth = W * (1 - 2 * pct(SIDE_PAD_PCT));
  const lines = wrap(ctx, slide.text || '', maxWidth);
  const blockH = lines.length * lineHeight;
  const startY = (H - blockH) / 2; // vertically centered, matching the preview
  const x = W / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    // Paint stroke first, fill on top — same effect as CSS paint-order: stroke fill.
    ctx.strokeStyle = captionStrokeColor(kit.textColor);
    ctx.lineWidth = strokeW;
    ctx.strokeText(lines[i], x, y);
    ctx.fillStyle = kit.textColor;
    ctx.fillText(lines[i], x, y);
  }

  drawLinkSticker(ctx, slide.linkSticker);

  return canvas.toDataURL('image/png');
}

export async function renderSlideshow(show: Slideshow, brandKit?: BrandKit): Promise<string[]> {
  const out: string[] = [];
  for (const slide of show.slides) {
    out.push(await renderSlide(slide, brandKit));
  }
  return out;
}
