export interface ChartBounds {
  width: number;
  height: number;
  min: number;
  max: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number) => Number(value.toFixed(3));

const scaleY = (value: number, bounds: ChartBounds) => {
  const range = bounds.max - bounds.min || 1;
  const ratio = (value - bounds.min) / range;
  return round(bounds.height - ratio * bounds.height);
};

export const buildLinearTicks = (min: number, max: number, count = 4): number[] => {
  if (min === max) {
    return [round(min)];
  }

  const safeCount = Math.max(2, count);
  const step = (max - min) / (safeCount - 1);
  return Array.from({ length: safeCount }, (_, index) => round(min + step * index));
};

export const buildPolylinePoints = (values: number[], bounds: ChartBounds) => {
  if (values.length === 0) {
    return [];
  }

  if (values.length === 1) {
    return [{ x: 0, y: scaleY(values[0], bounds) }];
  }

  const stepX = bounds.width / (values.length - 1);

  return values.map((value, index) => ({
    x: round(stepX * index),
    y: scaleY(value, bounds),
  }));
};

export const describeDonutArc = ({
  cx,
  cy,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
}: {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
}) => {
  const toPoint = (radius: number, angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: round(cx + Math.cos(radians) * radius),
      y: round(cy + Math.sin(radians) * radius),
    };
  };

  const startOuter = toPoint(outerRadius, startAngle);
  const endOuter = toPoint(outerRadius, endAngle);
  const startInner = toPoint(innerRadius, startAngle);
  const endInner = toPoint(innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
};

export const getStackedAreaPolygons = ({
  rows,
  keys,
  width,
  height,
  min,
  max,
}: {
  rows: Record<string, number>[];
  keys: string[];
  width: number;
  height: number;
  min: number;
  max: number;
}) => {
  const bounds = { width, height, min, max };
  const positiveStack = Array(rows.length).fill(0);
  const negativeStack = Array(rows.length).fill(0);
  const result: Record<string, string> = {};

  keys.forEach((key) => {
    const topPoints: string[] = [];
    const bottomPoints: string[] = [];

    rows.forEach((row, index) => {
      const value = row[key] ?? 0;
      const x = rows.length === 1 ? 0 : round((width / (rows.length - 1)) * index);
      const start = value >= 0 ? positiveStack[index] : negativeStack[index];
      const end = start + value;

      topPoints.push(`${x},${scaleY(end, bounds)}`);
      bottomPoints.push(`${x},${scaleY(start, bounds)}`);

      if (value >= 0) {
        positiveStack[index] = end;
      } else {
        negativeStack[index] = end;
      }
    });

    result[key] = [...topPoints, ...bottomPoints.reverse()].join(' ');
  });

  return result;
};
