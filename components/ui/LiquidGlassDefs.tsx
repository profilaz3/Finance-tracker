import React from 'react';
import { displacementMapUri, supportsLiquidGlass } from '../../utils/liquidGlass';

/** Fixed-size chrome that gets the refracting rim. Sizes match the rendered elements. */
const FILTERS = [
  { id: 'lg-nav', w: 286, h: 62, r: 31, bezel: 14, scale: 34 },
  { id: 'lg-fab', w: 62, h: 62, r: 31, bezel: 12, scale: 28 },
  { id: 'lg-pill', w: 132, h: 44, r: 22, bezel: 10, scale: 24 },
  { id: 'lg-round', w: 44, h: 44, r: 22, bezel: 10, scale: 22 },
] as const;

export type LiquidGlassId = (typeof FILTERS)[number]['id'];

/** Inline style that adds the displacement filter on Chromium; elsewhere `.glass` keeps its plain blur. */
export const lgStyle = (id: LiquidGlassId): React.CSSProperties | undefined =>
  supportsLiquidGlass() ? ({ '--lg': `url(#${id})` } as React.CSSProperties) : undefined;

/** Hidden SVG holding the displacement filters. Render once near the app root. */
export const LiquidGlassDefs: React.FC = () => {
  if (!supportsLiquidGlass()) return null;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        {FILTERS.map(filter => (
          <filter key={filter.id} id={filter.id} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feImage
              href={displacementMapUri(filter.w, filter.h, filter.r, filter.bezel)}
              x="0"
              y="0"
              width={filter.w}
              height={filter.h}
              preserveAspectRatio="none"
              result="map"
            />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={filter.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
};
