// Client-side slide renderer. Each slide becomes a 1080×1920 PNG drawn on a
// canvas — text over a gradient. No image-generation API, no cost, deterministic
// output. The resulting data URLs are sent to the server, which uploads them to
// post-bridge as the post's media.
//
// Caption geometry (font %, stroke, line-height, padding, centering) comes from
// lib/captionStyle.ts — the SAME constants the editor preview uses — so the
// scheduled PNG matches what the user saw when editing.
import type { LinkSticker, Slide, Slideshow } from '../types';
import { FONT_SIZE_PCT, STROKE_RATIO, LINE_HEIGHT, SIDE_PAD_PCT, pct } from './captionStyle';

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

export async function renderSlide(slide: Slide): Promise<string> {
  // Make sure the web font is ready, otherwise the first render uses a fallback.
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (slide.imageUrl) {
    // Image background (same-origin: bundled at /library/… or scraped via /api/…).
    try {
      const img = await loadImage(slide.imageUrl);
      drawCover(ctx, img);
      // Darken so white text stays readable.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      ctx.fillStyle = slide.bgFrom || '#0f172a';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, slide.bgFrom || '#0f172a');
    grad.addColorStop(1, slide.bgTo || '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Subtle vignette for depth
    const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Caption: white bold text, black outline, centered — driven by the SAME
  // percentages the editor preview uses, so the two always match.
  const fontPx = Math.round(H * pct(FONT_SIZE_PCT));
  const lineHeight = Math.round(fontPx * LINE_HEIGHT);
  const strokeW = Math.max(2, Math.round(fontPx * STROKE_RATIO));

  ctx.font = `800 ${fontPx}px Inter, sans-serif`;
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
    ctx.strokeStyle = 'black';
    ctx.lineWidth = strokeW;
    ctx.strokeText(lines[i], x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], x, y);
  }

  drawLinkSticker(ctx, slide.linkSticker);

  return canvas.toDataURL('image/png');
}

export async function renderSlideshow(show: Slideshow): Promise<string[]> {
  const out: string[] = [];
  for (const slide of show.slides) {
    out.push(await renderSlide(slide));
  }
  return out;
}
