import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP } from '../../src/headers.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('deploy headers', () => {
  it('Cloudflare _headers carries the same CSP', () => {
    expect(read('public/_headers')).toContain(`Content-Security-Policy: ${CSP}`);
  });

  it('wrangler runs the Worker only for /api/* and serves the app for client routes', () => {
    const config = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
    expect(config.main).toBe('worker/index.ts');
    expect(config.assets).toEqual({ directory: './dist', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] });
    expect(config.routes).toContainEqual({ pattern: 'mapped.lukeghanna.com', custom_domain: true });
    expect(config.d1_databases).toEqual([expect.objectContaining({ binding: 'DB', database_name: 'mapped', migrations_dir: 'migrations' })]);
    expect(config.vars.AUTH_MODE).toBe('google');
  });

  it('client routes are never cached', () => {
    for (const path of ['/index.html', '/signin', '/me', '/leaderboards/*']) expect(read('public/_headers')).toContain(`${path}\n  Cache-Control: no-cache`);
  });
});
