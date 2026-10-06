import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../src/data/countries.ts';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { TERRITORIES } from '../../src/data/territories.ts';

const TOPO_URL = new URL('../../src/data/world.topo.json', import.meta.url);
const topo = JSON.parse(readFileSync(TOPO_URL, 'utf8'));
const ids: string[] = topo.objects.countries.geometries.map((g: { id: string }) => g.id);

describe('generated map data', () => {
  it('has a shape for every country and territory that should have one', () => {
    for (const e of [...COUNTRIES, ...TERRITORIES]) if (e.geo) expect(ids, e.id).toContain(e.id);
    expect(ids).not.toContain('TUV'); // no polygon at 1:50m; marker only
  });

  it('has an anchor for every country, including marker-only ones', () => {
    for (const c of COUNTRIES) {
      const m = GEO_META[c.id];
      expect(m, c.id).toBeDefined();
      expect(Math.abs(m.anchor[0])).toBeLessThanOrEqual(180);
      expect(Math.abs(m.anchor[1])).toBeLessThanOrEqual(90);
    }
  });

  it('marks microstates and island nations as tiny, and big countries not', () => {
    for (const id of ['VAT', 'MCO', 'SGP', 'MDV', 'TUV', 'KIR', 'GRD']) expect(GEO_META[id].tiny, id).toBe(true);
    for (const id of ['FRA', 'BRA', 'NZL', 'JPN']) expect(GEO_META[id].tiny, id).toBe(false);
  });

  it('draws large shapes first so enclaves sit on top', () => {
    expect(ids.indexOf('VAT')).toBeGreaterThan(ids.indexOf('ITA'));
    expect(ids.indexOf('LSO')).toBeGreaterThan(ids.indexOf('ZAF'));
  });

  it('stays within the size budget', () => {
    expect(statSync(TOPO_URL).size).toBeLessThan(800 * 1024);
  });
});
