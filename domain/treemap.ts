export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Index into the input values. */
  index: number;
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk). Values should be sorted largest first.
 * Returns one rect per positive value, in the same coordinate space as width x height.
 */
export function squarify(values: number[], width: number, height: number): TreemapRect[] {
  const items = values
    .map((value, index) => ({ value, index }))
    .filter(item => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const areas = items.map(item => ({ area: item.value * scale, index: item.index }));
  const rects: TreemapRect[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let i = 0;

  const worst = (row: typeof areas, rowArea: number, side: number): number => {
    let max = 0;
    let min = Infinity;
    for (const entry of row) {
      max = Math.max(max, entry.area);
      min = Math.min(min, entry.area);
    }
    const side2 = side * side;
    const area2 = rowArea * rowArea;
    return Math.max((side2 * max) / area2, area2 / (side2 * min));
  };

  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let rowArea = areas[i].area;
    i += 1;
    while (i < areas.length) {
      const nextArea = rowArea + areas[i].area;
      if (worst([...row, areas[i]], nextArea, side) > worst(row, rowArea, side)) break;
      row.push(areas[i]);
      rowArea = nextArea;
      i += 1;
    }

    const thickness = rowArea / side;
    let offset = 0;
    if (w >= h) {
      for (const entry of row) {
        const length = entry.area / thickness;
        rects.push({ x, y: y + offset, w: thickness, h: length, index: entry.index });
        offset += length;
      }
      x += thickness;
      w -= thickness;
    } else {
      for (const entry of row) {
        const length = entry.area / thickness;
        rects.push({ x: x + offset, y, w: length, h: thickness, index: entry.index });
        offset += length;
      }
      y += thickness;
      h -= thickness;
    }
  }

  return rects;
}

/** White or near-black text, whichever reads better on a #rrggbb background. */
export function readableTextOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#FFFFFF';
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  // Contrast against white vs. against #141414.
  const onWhite = 1.05 / (luminance + 0.05);
  const onDark = (luminance + 0.05) / (0.0069 + 0.05);
  return onWhite >= onDark ? '#FFFFFF' : '#141414';
}
