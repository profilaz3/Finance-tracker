import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyScannedQr, pickQrText, tileStarts } from '../components/receipt-scan/qr';

const fiscalUrl = readFileSync('tests/fixtures/fiscal/sample1.json', 'utf8')
  .match(/https:\/\/suf\.purs\.gov\.rs\/v\/\?vl=[A-Za-z0-9%+/=]+/)![0];

describe('tileStarts', () => {
  it('covers the length with the last tile flush with the end', () => {
    expect(tileStarts(3200, 1200, 400)).toEqual([0, 400, 800, 1200, 1600, 2000]);
    expect(tileStarts(2500, 1200, 400)).toEqual([0, 400, 800, 1200, 1300]);
  });

  it('uses one tile when the length fits', () => {
    expect(tileStarts(900, 1200, 400)).toEqual([0]);
    expect(tileStarts(1200, 1200, 400)).toEqual([0]);
  });

  it('puts every code up to tile - step wholly inside some tile', () => {
    const tile = 1000;
    const step = 400;
    const length = 2731;
    const starts = tileStarts(length, tile, step);
    for (let codeStart = 0; codeStart + (tile - step) <= length; codeStart += 37) {
      const codeEnd = codeStart + (tile - step);
      expect(starts.some(start => start <= codeStart && codeEnd <= start + tile)).toBe(true);
    }
  });
});

describe('pickQrText', () => {
  it('prefers a code the app can use over others in view', () => {
    expect(classifyScannedQr(fiscalUrl)?.kind).toBe('fiscal');
    expect(pickQrText(['https://example.com/menu', fiscalUrl])).toBe(fiscalUrl);
  });

  it('falls back to the first code so the scanner can say it is not a receipt', () => {
    expect(pickQrText(['https://example.com/menu', 'hello'])).toBe('https://example.com/menu');
    expect(pickQrText([])).toBeNull();
  });
});
