import type { CSSProperties } from 'react';
import type { BrandKit, Slide } from '../types';
import { captionTextStyle, SLIDE_CONTAINER_STYLE, SIDE_PAD_PCT } from '../lib/captionStyle';
import { brandGradient, normalizeBrandKit } from '../lib/brandKit';
import {
  linkStickerClassName,
  linkStickerIconStyle,
  linkStickerPositionStyle,
  linkStickerTextStyle,
} from '../lib/linkSticker';
import { Link2 } from 'lucide-react';

interface SlidePreviewProps {
  slide: Slide;
  brandKit?: BrandKit;
  className?: string;
  showText?: boolean;
}

function logoPositionStyle(position: BrandKit['logoPosition']): CSSProperties {
  const edgeX = '6.8cqw';
  const edgeY = '5.8cqh';
  switch (position) {
    case 'top-left':
      return { left: edgeX, top: edgeY };
    case 'top-right':
      return { right: edgeX, top: edgeY };
    case 'bottom-left':
      return { left: edgeX, bottom: edgeY };
    case 'bottom-right':
      return { right: edgeX, bottom: edgeY };
  }
}

export function SlidePreview({ slide, brandKit, className = '', showText = true }: SlidePreviewProps) {
  const kit = normalizeBrandKit({ ...brandKit, fontStyle: slide.fontStyle || brandKit?.fontStyle });
  // Generated slides have no source image — render the same gradient the canvas
  // renderer uses, so the preview matches the exported PNG.
  const background = slide.imageUrl ? undefined : brandGradient(kit);

  return (
    <div
      // containerType: 'size' lets the caption's `cqh` units resolve to a percent
      // of THIS slide's height, so the text scales identically to the baked PNG.
      className={`relative aspect-[9/16] rounded-md overflow-hidden bg-raised ${className}`}
      style={background ? { background, ...SLIDE_CONTAINER_STYLE } : SLIDE_CONTAINER_STYLE}
    >
      {slide.imageUrl && (
        <>
          <img
            src={slide.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Match the canvas bake's brand overlay for readability. */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: kit.backgroundColor, opacity: kit.overlayOpacity }}
          />
        </>
      )}
      {kit.logoDataUrl && (
        <img
          src={kit.logoDataUrl}
          alt=""
          className="absolute z-10 max-w-[23cqw] max-h-[10cqh] object-contain drop-shadow-[0_0.45cqh_1.2cqh_rgba(0,0,0,0.35)]"
          style={logoPositionStyle(kit.logoPosition)}
        />
      )}
      {showText && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center"
          style={{ paddingLeft: `${SIDE_PAD_PCT}%`, paddingRight: `${SIDE_PAD_PCT}%` }}
        >
          <span style={captionTextStyle(kit)}>{slide.text}</span>
        </div>
      )}
      {slide.linkSticker?.text && (
        <div
          className={linkStickerClassName(slide.linkSticker)}
          style={linkStickerPositionStyle(slide.linkSticker.position)}
        >
          <Link2 strokeWidth={3} style={linkStickerIconStyle(slide.linkSticker)} />
          <span style={linkStickerTextStyle()}>{slide.linkSticker.text}</span>
        </div>
      )}
    </div>
  );
}
