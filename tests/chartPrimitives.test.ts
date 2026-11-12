import { describe, expect, it } from 'vitest';
import {
  buildLinearTicks,
  buildPolylinePoints,
  describeDonutArc,
  getStackedAreaPolygons,
} from '../components/stats/chartPrimitives';

describe('chartPrimitives', () => {
  it('builds evenly spaced linear ticks including zero', () => {
    expect(buildLinearTicks(-25, 75, 5)).toEqual([-25, 0, 25, 50, 75]);
    expect(buildLinearTicks(0, 0, 4)).toEqual([0]);
  });

  it('builds svg polyline points within the chart box', () => {
    const points = buildPolylinePoints([0, 50, 100], {
      width: 200,
      height: 100,
      min: 0,
      max: 100,
    });

    expect(points).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ]);
  });

  it('describes donut segments with deterministic start and end points', () => {
    const path = describeDonutArc({
      cx: 100,
      cy: 100,
      innerRadius: 40,
      outerRadius: 60,
      startAngle: 0,
      endAngle: 90,
    });

    expect(path).toContain('M 160 100');
    expect(path).toContain('L 100 140');
    expect(path).toContain('Z');
  });

  it('builds stacked polygons that separate positive and negative series', () => {
    const polygons = getStackedAreaPolygons({
      rows: [
        { cash: 20, receivables: 10, payables: -5 },
        { cash: 30, receivables: 5, payables: -10 },
      ],
      keys: ['cash', 'receivables', 'payables'],
      width: 100,
      height: 100,
      min: -20,
      max: 40,
    });

    expect(polygons.cash.length).toBeGreaterThan(0);
    expect(polygons.receivables.length).toBeGreaterThan(0);
    expect(polygons.payables.length).toBeGreaterThan(0);
  });
});
