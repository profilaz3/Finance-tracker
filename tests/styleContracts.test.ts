import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('style contracts', () => {
  it('removes dead one-off utility classes from the global theme stylesheet', () => {
    const themeCss = readFileSync('src/theme.css', 'utf8');

    expect(themeCss).not.toContain('button.btn-primary');
    expect(themeCss).not.toContain('.glass-strong {');
    expect(themeCss).not.toContain('.gradient-text {');
    expect(themeCss).not.toContain('.card-glow {');
    expect(themeCss).not.toContain('.focus-visible-ring:focus-visible');
    expect(themeCss).not.toContain('.shimmer {');
  });

  it('uses targeted interactive transitions instead of global transition-all rules', () => {
    const themeCss = readFileSync('src/theme.css', 'utf8');

    expect(themeCss).not.toContain('transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);');
    expect(themeCss).toContain('transition-property: background-color, color, border-color, box-shadow, transform, opacity;');
  });
});
