// Builds src/data/world.topo.json and src/data/geo-meta.json from world-atlas
// (Natural Earth 1:50m). Run with `npm run geo`. Outputs are committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoCentroid, geoPath } from 'd3-geo';
import { geoPatterson } from 'd3-geo-projection';
import { feature, merge } from 'topojson-client';
import { topology } from 'topojson-server';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { COUNTRIES } from '../src/data/countries.ts';
import { TERRITORIES } from '../src/data/territories.ts';

const OUT_TOPO = new URL('../src/data/world.topo.json', import.meta.url);
const OUT_META = new URL('../src/data/geo-meta.json', import.meta.url);

// Features folded into a neighbor, and features dropped entirely.
const MERGE_INTO: Record<string, string> = { Somaliland: 'Somalia', 'N. Cyprus': 'Cyprus', 'Siachen Glacier': 'India' };
const DROP = new Set(['Antarctica']);
// Countries with no polygon at 1:50m: marker position only.
const FALLBACK_ANCHOR: Record<string, [number, number]> = { TUV: [179.2, -8.52] };
// Grid resolution for the delta-encoded output coordinates. Every 1:50m point is kept: coastlines stay
// smooth when zoomed in, for about 680 KB (230 KB gzipped).
const QUANTIZE = 1e5;
// A country is "tiny" when its largest landmass is under this many px across on
// a 1280px-wide world map: too small to see or click without a marker.
const TINY_PX = 9;

const require = createRequire(import.meta.url);
const atlas = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const geoms: any[] = atlas.objects.countries.geometries;
const byName = new Map<string, any[]>();
for (const g of geoms) byName.set(g.properties.name, [...(byName.get(g.properties.name) ?? []), g]);

const claimed = new Set<string>();
function take(name: string): any[] {
  const gs = byName.get(name);
  if (!gs) throw new Error(`No feature named "${name}" in countries-50m`);
  claimed.add(name);
  return gs;
}

const features: Feature<Polygon | MultiPolygon>[] = [];
function add(id: string, name: string) {
  const parts = [...take(name), ...Object.entries(MERGE_INTO).filter(([, into]) => into === name).flatMap(([src]) => take(src))];
  const geometry = parts.length === 1
    ? (feature(atlas, parts[0]) as unknown as Feature<Polygon | MultiPolygon>).geometry
    : merge(atlas, parts);
  features.push({ type: 'Feature', id, properties: {}, geometry });
}

for (const c of COUNTRIES) if (c.geo) add(c.id, c.geo);
for (const t of TERRITORIES) if (t.geo) add(t.id, t.geo);
for (const name of DROP) take(name);
const unclaimed = [...byName.keys()].filter((n) => !claimed.has(n));
if (unclaimed.length) throw new Error(`Unclaimed features: ${unclaimed.join(', ')}`);

// Largest first, so enclaves (Vatican City, San Marino, Lesotho) draw on top and win clicks.
features.sort((a, b) => geoArea(b) - geoArea(a));

const topo: any = topology({ countries: { type: 'FeatureCollection', features } as FeatureCollection }, QUANTIZE);
writeFileSync(OUT_TOPO, JSON.stringify(topo));

// Meta: anchor (centroid of the largest polygon) and tiny flag, from the shapes as stored.
const simplified = (feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>).features;
const proj = geoPatterson().fitWidth(1280, { type: 'Sphere' });
const path = geoPath(proj);
const meta: Record<string, { anchor: [number, number]; tiny: boolean }> = {};
for (const f of simplified) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const largest = polys
    .map((coordinates) => ({ type: 'Polygon' as const, coordinates }))
    .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  const [[x0, y0], [x1, y1]] = path.bounds(largest);
  const round = (n: number) => Math.round(n * 100) / 100;
  const [lon, lat] = geoCentroid(largest);
  meta[f.id as string] = { anchor: [round(lon), round(lat)], tiny: Math.max(x1 - x0, y1 - y0) < TINY_PX };
  if (!isFinite(x0) || x1 - x0 <= 0) throw new Error(`${f.id} has no area after quantization`);
}
for (const [id, anchor] of Object.entries(FALLBACK_ANCHOR)) meta[id] = { anchor, tiny: true };
writeFileSync(OUT_META, JSON.stringify(meta, null, 0) + '\n');

const bytes = Buffer.byteLength(JSON.stringify(topo));
console.log(`world.topo.json: ${(bytes / 1024).toFixed(0)} KB, ${simplified.length} shapes, ${Object.values(meta).filter((m) => m.tiny).length} tiny`);
