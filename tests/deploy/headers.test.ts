import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP } from '../../src/headers.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('deploy headers', () => {
  it('Cloudflare _headers carries the same CSP', () => {
    expect(read('public/_headers')).toContain(`Content-Security-Policy: ${CSP}`);
  });

  it('vercel.json carries the same CSP', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const all = vercel.headers.find((h: { source: string }) => h.source === '/(.*)');
    expect(all.headers).toContainEqual({ key: 'Content-Security-Policy', value: CSP });
  });

  it('wrangler serves static assets only, with no Worker script', () => {
    const config = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
    expect(config.main).toBeUndefined();
    expect(config.assets.directory).toBe('./dist');
    expect(config.routes).toContainEqual({ pattern: 'mapped.lukeghanna.com', custom_domain: true });
  });
});
