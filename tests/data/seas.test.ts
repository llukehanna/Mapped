import { readFileSync } from 'node:fs';
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASINS, SEAS, SKIP_NE, WATERS, shortName, type Basin } from '../../src/data/seas.ts';
import type { SeaMeta } from '../../src/data/seaMeta.ts';

const NE_URL = new URL('../../scripts/data/ne_50m_geography_marine_polys.geojson', import.meta.url);

describe('the sea list', () => {
  it('has 55 answers with short lowercase ids', () => {
    expect(SEAS).toHaveLength(55);
    expect(new Set(SEAS.map((s) => s.id)).size).toBe(55);
    for (const s of SEAS) expect(s.id).toMatch(/^[a-z]{2,8}$/);
  });

  it('groups them by basin as the spec does', () => {
    const count = (b: Basin) => SEAS.filter((s) => s.basin === b).length;
    expect(BASINS.map((b) => count(b.id))).toEqual([7, 7, 20, 6, 9, 5, 1]);
  });

  it('claims every Natural Earth feature exactly once', () => {
    const ne = JSON.parse(readFileSync(NE_URL, 'utf8'));
    const names = new Set<string>(ne.features.map((f: { properties: { name: string } }) => f.properties.name));
    const claims = [...SEAS.flatMap((s) => s.ne), ...WATERS.map((w) => w.ne), ...SKIP_NE];
    expect(claims.length).toBe(new Set(claims).size);
    expect([...new Set(claims)].sort()).toEqual([...names].sort());
  });

  it('gives non-game water unique ids', () => {
    expect(new Set(WATERS.map((w) => w.id)).size).toBe(WATERS.length);
    for (const w of WATERS) expect(w.id).toMatch(/^w-[a-z0-9-]+$/);
  });

  it('shortName', () => {
    expect(shortName('Sea of Japan')).toBe('Japan');
    expect(shortName('Pacific Ocean')).toBe('Pacific');
    expect(shortName('Bo Hai')).toBe('Bo Hai');
  });
});

type Shape = Feature<Polygon | MultiPolygon>;
const polygonsOf = (f: Shape): Polygon[] =>
  (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((coordinates) => ({ type: 'Polygon', coordinates }));

// geoContains with a bounding-box check per polygon first, so a grid of points over the world stays quick. geoBounds
// misjudges the longitudes of a polygon wider than a hemisphere that crosses ±180 (the Pacific), so a polygon crossing
// ±180 gets its longitude range measured on 0..360 instead; one around a pole gets none.
function container(f: Shape): (p: [number, number]) => boolean {
  const parts = polygonsOf(f).map((poly) => {
    const [[, y0], [, y1]] = geoBounds(poly);
    const ring = poly.coordinates[0];
    const crosses = ring.some(([x], i) => i > 0 && Math.abs(x - ring[i - 1][0]) > 180);
    const shift = (x: number) => (crosses ? (x + 360) % 360 : x);
    const xs = ring.map(([x]) => shift(x));
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const polar = y0 <= -89 || y1 >= 89;
    return { poly, y0, y1, inLon: (lon: number) => polar || (shift(lon) >= x0 && shift(lon) <= x1) };
  });
  return ([lon, lat]) => parts.some(({ poly, y0, y1, inLon }) => lat >= y0 && lat <= y1 && inLon(lon) && geoContains(poly, [lon, lat]));
}

describe('generated sea data', () => {
  let seas: Shape[], waters: Shape[], antarctica: Shape[], land: Shape[], meta: Readonly<Record<string, SeaMeta>>;
  let inSea: Map<string, (p: [number, number]) => boolean>;
  const answerAt = (p: [number, number]) => {
    const hits = [...inSea].filter(([, has]) => has(p)).map(([id]) => id);
    return hits.length === 1 ? hits[0] : hits;
  };

  beforeAll(async () => {
    const topo = JSON.parse(readFileSync(new URL('../../src/data/seas.topo.json', import.meta.url), 'utf8'));
    const world = JSON.parse(readFileSync(new URL('../../src/data/world.topo.json', import.meta.url), 'utf8'));
    const get = (t: any, name: string) => (feature(t, t.objects[name]) as unknown as FeatureCollection<Polygon | MultiPolygon>).features;
    [seas, waters, antarctica, land] = [get(topo, 'seas'), get(topo, 'waters'), get(topo, 'antarctica'), get(world, 'countries')];
    meta = (await import('../../src/data/seaMeta.ts')).SEA_META;
    inSea = new Map(seas.map((f) => [f.id as string, container(f)]));
  });

  it('has a shape for every answer and every non-game water not swallowed by one, oceans first', () => {
    expect(seas.map((f) => f.id).sort()).toEqual(SEAS.map((s) => s.id).sort());
    expect(seas.slice(0, 5).map((f) => f.id).sort()).toEqual(['arc', 'atl', 'ind', 'pac', 'sou']);
    const swallowed = ['w-drake-passage', 'w-luzon-strait', 'w-scotia-sea'];
    expect(waters.map((f) => f.id).sort()).toEqual(WATERS.map((w) => w.id).filter((id) => !swallowed.includes(id)).sort());
    expect(antarctica.map((f) => f.id)).toEqual(['antarctica']);
  });

  const SAMPLES: [string, [number, number], string][] = [
    ['east of Gibraltar', [-4.0, 36.1], 'med'], ['Ligurian', [8.5, 43.7], 'med'], ['Sea of Azov', [36.5, 46.0], 'black'],
    ['East Siberian', [160, 73], 'arc'], ['62°S 20°E', [20, -62], 'sou'], ['50°S 20°E', [20, -50], 'ind'],
    ['65°S 120°W', [-120, -65], 'sou'], ['Aegean', [25, 38.5], 'aegean'], ['Tasman', [160, -38], 'tasman'],
    ['Natural Earth\'s Scotia Sea, south of 60°S', [-54.8, -61.15], 'sou'], ['Szczecin Lagoon', [14.25, 53.75], 'baltic'],
  ];
  it.each(SAMPLES)('%s is in the right answer', (_, point, id) => expect(answerAt(point)).toBe(id));

  it('every anchor lies inside its own sea', () => {
    for (const s of SEAS) expect(inSea.get(s.id)!(meta[s.id].anchor), s.id).toBe(true);
  });

  it('keeps anchors off the antimeridian, at the edge of a Greenwich-centred map, unless the sea straddles it', () => {
    const straddling = ['bering', 'chukchi'];
    for (const s of SEAS) if (!straddling.includes(s.id)) expect(180 - Math.abs(meta[s.id].anchor[0]), s.id).toBeGreaterThan(5);
  });

  it('coasts are known except open water and Antarctica', () => {
    const empty = SEAS.filter((s) => meta[s.id].coast.length === 0).map((s) => s.id).sort();
    expect(empty).toEqual(['amundsen', 'belling', 'ross', 'sargasso', 'sou', 'weddell']);
    for (const s of SEAS) expect(meta[s.id].coast, s.id).toEqual([...meta[s.id].coast].sort());
  });

  it('the Greenland Sea coast includes Greenland', () => expect(meta.greenl.coast).toContain('t-greenland'));

  it('ships no slivers: every polygon is at least 1 km²', () => {
    for (const f of [...seas, ...waters]) for (const p of polygonsOf(f)) expect(geoArea(p) * 6371 ** 2, String(f.id)).toBeGreaterThanOrEqual(1);
  });

  it('every polygon is wound for d3', () => {
    for (const f of [...seas, ...waters, ...antarctica]) for (const p of polygonsOf(f)) expect(geoArea(p), String(f.id)).toBeLessThan(2 * Math.PI);
  });

  it('has no there-and-back spikes (a, b, a) in any ring: one across a clipped view\'s horizon fills the wrong side', () => {
    for (const f of [...seas, ...waters]) {
      for (const ring of polygonsOf(f).flatMap((p) => p.coordinates)) {
        const n = ring.length - 1;
        for (let i = 0; i < n; i++) {
          const [a, c] = [ring[(i + n - 1) % n], ring[(i + 1) % n]];
          expect(a[0] === c[0] && a[1] === c[1], `${f.id} at ${ring[i]}`).toBe(false);
        }
      }
    }
  });

  it('every ring is wound for d3 too: the exterior clockwise, holes counter-clockwise (or clipping breaks at the map edge)', () => {
    const area = (ring: Polygon['coordinates'][number]) => geoArea({ type: 'Polygon', coordinates: [ring] });
    for (const f of [...seas, ...waters]) {
      for (const [exterior, ...holes] of polygonsOf(f).map((p) => p.coordinates)) {
        expect(area(exterior), String(f.id)).toBeLessThan(2 * Math.PI);
        for (const h of holes) expect(area(h), String(f.id)).toBeGreaterThan(2 * Math.PI);
      }
    }
  });

  it('open water is in exactly one shape', () => {
    const onLand = [...land, ...antarctica].map(container);
    const water = [...seas, ...waters].map(container);
    let total = 0;
    const bad: string[] = [];
    for (let lon = -179; lon <= 179; lon += 3) {
      for (let lat = -79; lat <= 83; lat += 3) {
        const p: [number, number] = [lon, lat];
        if (onLand.some((has) => has(p))) continue;
        total++;
        const n = water.filter((has) => has(p)).length;
        if (n !== 1) bad.push(`${lon},${lat}:${n}`);
      }
    }
    expect(bad.length / total, bad.join(' ')).toBeLessThanOrEqual(0.01);
  }, 60_000); // about 4,500 water points against every shape: a few seconds alone, more next to the rest of the suite
});
