import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The hosted web app's headers live in public/_headers (Cloudflare and Netlify both read it).
describe('hosting contracts', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const wrangler = readFileSync('wrangler.jsonc', 'utf8');

  it('sends the security headers on every path', () => {
    expect(headers).toMatch(/^\/\*\n/m);
    for (const name of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy']) {
      expect(headers).toContain(`  ${name}: `);
    }
    expect(headers).toContain("frame-ancestors 'none'");
  });

  it('lets the page use the camera (QR scan) and microphone (voice entry)', () => {
    const policy = headers.match(/Permissions-Policy: (.*)/)?.[1] ?? '';
    expect(policy).toContain('camera=(self)');
    expect(policy).toContain('microphone=(self)');
  });

  it('caches hashed assets for good but never puts Cache-Control on every path', () => {
    expect(headers).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    const everyPath = headers.split(/\n\s*\n/).find(block => /^\/\*$/m.test(block)) ?? '';
    expect(everyPath).not.toContain('Cache-Control');
  });

  it('serves the built app with the single-page fallback on Cloudflare', () => {
    expect(wrangler).toContain('"directory": "./dist"');
    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
  });
});
