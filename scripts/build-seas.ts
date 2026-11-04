// Builds src/data/seas.topo.json and src/data/seas-meta.json for the Seas topic from Natural Earth's 1:50m marine
// areas (scripts/data/ne_50m_geography_marine_polys.geojson, public domain) and world-atlas land. Run with
// `npm run seas`. Outputs are committed.
//
// Boolean operations (polygon-clipping) work in planar lon/lat, with everything cut at ±180. On the way out, every long
// straight edge is densified to 1° steps, which keeps d3's great-circle edges on the planar line (the 60°S cut most of
// all), and the cuts at ±180 are stitched back together so no seam shows down the antimeridian.
// 1. Each answer is the union of its Natural Earth features. The Atlantic, Pacific and Indian Oceans stop at 60°S;
//    everything south of it is the Southern Ocean, less the Weddell, Ross, Amundsen and Bellingshausen Seas.
//    Oceans give way to the seas inside them, so no two answers overlap.
// 2. Water no feature covers (world − land − every feature) is split into pieces; each piece over 1,000 km² joins the
//    answer it shares the longest boundary with (or the nearest answer, when it touches only non-game water).
//    Pieces touching no feature at all are lakes and are dropped.
// 3. Non-game water (gulfs, bays, straits...) is each feature less the answers, so it fills only what they leave.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoEquirectangular } from 'd3-geo';
import { geoProject, geoStitch } from 'd3-geo-projection';
import pc from 'polygon-clipping';
import type { MultiPolygon as PcMulti, Pair, Polygon as PcPolygon, Ring } from 'polygon-clipping';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { OCEANS, SEAS, SKIP_NE, WATERS } from '../src/data/seas.ts';

const SOURCE = new URL('./data/ne_50m_geography_marine_polys.geojson', import.meta.url);
const WORLD = new URL('../src/data/world.topo.json', import.meta.url);
const OUT_TOPO = new URL('../src/data/seas.topo.json', import.meta.url);
const OUT_META = new URL('../src/data/seas-meta.json', import.meta.url);

// Grid resolution for the delta-encoded output coordinates (as in build-geo).
const QUANTIZE = 1e5;
// Oceans that stop at 60°S, and the seas carved out of the Southern Ocean below it.
const CUT_AT_60S = ['atl', 'pac', 'ind'];
const ANTARCTIC_SEAS = ['weddell', 'ross', 'amundsen', 'belling'];
const MIN_GAP_KM2 = 1_000;
const PRINT_GAP_KM2 = 5_000;
const EARTH_KM = 6371;
// Uncovered pieces whose longest-boundary answer is wrong: the piece containing `at` joins `to` instead.
const FOLD_OVERRIDES: { at: [number, number]; to: string }[] = [
  // Disko Bay and Uummannaq Fjord, west Greenland: touching only Baffin Bay and Davis Strait, "nearest" picks the
  // Atlantic across the ice sheet. The Labrador Sea is up Davis Strait, like the Baffin Island bays that fold into it.
  { at: [-52.1, 69.0], to: 'labrador' },
  { at: [-52.9, 71.0], to: 'labrador' },
];
// Hand-placed anchors where the computed one reads badly.
const ANCHOR_OVERRIDES: Record<string, [number, number]> = {
  // The band's widest point is on the antimeridian (by the Ross Sea), at the edge of a map centred on Greenwich.
  sou: [20, -64],
};
// Coastal countries: a country or territory vertex within this many degrees of the sea's boundary.
const COAST_DEG = 0.2;
const NO_COAST = new Set(['sou', ...ANTARCTIC_SEAS]); // "Off Antarctica", which is not a country

const km2 = (steradians: number) => steradians * EARTH_KM * EARTH_KM;
const timed = <T>(label: string, f: () => T): T => {
  const t = Date.now();
  const out = f();
  console.log(`  ${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return out;
};

// ---- Geometry helpers (planar lon/lat, polygon-clipping's format) ----

function box(x0: number, y0: number, x1: number, y1: number): PcPolygon {
  return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
}
const asPolygons = (g: Polygon | MultiPolygon): PcMulti => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as PcMulti;
// Round to 1e-6° (about 10 cm), which keeps polygon-clipping clear of near-coincident points. Natural Earth ends its
// features at 179.999897 instead of 180: snapped to ±180, or a thin seam of uncovered water runs down the antimeridian.
const snapX = (x: number) => (180 - Math.abs(x) < 2e-4 ? Math.sign(x) * 180 : Math.round(x * 1e6) / 1e6);
const snap = (mp: PcMulti): PcMulti => mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [snapX(x), Math.round(y * 1e6) / 1e6])));
const union = (gs: PcMulti[]): PcMulti => (gs.length ? pc.union(gs[0], ...gs.slice(1)) : []);

// Fill in long edges at `step`° steps. Meridian edges and edges along a pole are left alone: they are already exact.
function densify(ring: Ring, step = 1): Ring {
  const out: Ring = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const [x0, y0] = ring[i - 1];
    const [x1, y1] = ring[i];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    if (steps > 1 && x0 !== x1 && !(Math.abs(y0) === 90 && y0 === y1)) {
      for (let s = 1; s < steps; s++) out.push([x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps]);
    }
    out.push(ring[i]);
  }
  return out;
}

// Where a boundary meets the antimeridian, the two sides must meet at the same latitude for geoStitch to join them.
// Each point on +180 moves to the nearest of `west` (latitudes on −180) within 0.2°.
function matchSeam(mp: PcMulti, west: number[]): PcMulti {
  return mp.map((poly) => poly.map((ring) => ring.map(([x, y]): Pair => {
    if (x !== 180) return [x, y];
    const near = west.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), Infinity);
    return [x, Math.abs(near - y) <= 0.2 ? near : y];
  })));
}
const westOf = (mps: PcMulti[]) => [...new Set(mps.flat(3).filter(([x]) => x === -180).map(([, y]) => y))];

// The output for d3: long edges densified, rings reversed (polygon-clipping winds exteriors counter-clockwise, d3 wants
// them clockwise), and the cuts at ±180 and the poles stitched back together with geoStitch, so no seam line runs down
// the antimeridian. geoStitch can hand back a joined hole as a polygon of its own (d3 reads it as the sphere minus the
// hole) or a ring with no area; holes go back into the polygon around them, empty rings are dropped. If the stitched
// shape's area still differs from the cut one, the cut one is kept.
function forD3(id: string, mp: PcMulti): Feature<MultiPolygon> {
  type Coords = Polygon['coordinates'];
  const areaOf = (c: Coords) => geoArea({ type: 'Polygon', coordinates: c });
  const total = (polys: Coords[]) => polys.reduce((n, c) => n + areaOf(c), 0);
  const cut = matchSeam(mp, westOf([mp])).map((poly) => poly.map((ring) => densify(ring).reverse())) as Coords[];
  const stitchedAll = asPolygons(
    (geoStitch({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: cut } }) as Feature<Polygon | MultiPolygon>).geometry,
  ) as Coords[];
  // geoStitch may also put a hole first; the exterior (the one ring that is clockwise on its own) goes back in front.
  const exteriorFirst = (c: Coords) => [...c].sort((a, b) => Number(areaOf([a]) >= 2 * Math.PI) - Number(areaOf([b]) >= 2 * Math.PI));
  const stitched = stitchedAll.filter((c) => areaOf(c) < 2 * Math.PI).map(exteriorFirst);
  for (const hole of stitchedAll.filter((c) => areaOf(c) >= 2 * Math.PI && 4 * Math.PI - areaOf(c) > 1e-9)) {
    const around = stitched.find((c) => geoContains({ type: 'Polygon', coordinates: [c[0]] }, hole[0][0] as Pair));
    if (around) around.push(...hole);
  }
  const ok = stitched.length > 0 && Math.abs(total(stitched) - total(cut)) < 1e-6;
  if (!ok) console.log(`  ${id}: stitching failed, kept cut at ±180`);
  const polys = ok ? stitched : cut;
  for (const c of polys) {
    if (areaOf(c) >= 2 * Math.PI) throw new Error(`${id}: a polygon is inverted`);
    if (areaOf([c[0]]) >= 2 * Math.PI || c.slice(1).some((h) => areaOf([h]) < 2 * Math.PI)) throw new Error(`${id}: rings out of order`);
  }
  return { type: 'Feature', id, properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } };
}

// Area on the sphere (km²) of a planar lon/lat polygon, its edges straight in lon/lat: ∮ sin φ dλ, exact per edge.
function planarKm2(poly: PcPolygon): number {
  const rad = Math.PI / 180;
  const ring = (r: Ring) => {
    let a = 0;
    for (let i = 1; i < r.length; i++) {
      const [l0, p0] = [r[i - 1][0] * rad, r[i - 1][1] * rad];
      const [l1, p1] = [r[i][0] * rad, r[i][1] * rad];
      a += Math.abs(p1 - p0) < 1e-12 ? (l1 - l0) * Math.sin(p0) : ((l1 - l0) * (Math.cos(p0) - Math.cos(p1))) / (p1 - p0);
    }
    return Math.abs(a);
  };
  return km2(ring(poly[0]) - poly.slice(1).reduce((n, r) => n + ring(r), 0));
}

// Point-in-polygon for many points: edges bucketed into 1° latitude strips, even-odd ray cast.
class Locator {
  private strips = new Map<number, number[][]>();
  bounds = [Infinity, Infinity, -Infinity, -Infinity];
  constructor(mp: PcMulti) {
    for (const poly of mp) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1];
      const [x1, y1] = ring[i];
      if (y0 === y1) continue;
      for (let s = Math.floor(Math.min(y0, y1)); s <= Math.floor(Math.max(y0, y1)); s++) {
        if (!this.strips.has(s)) this.strips.set(s, []);
        this.strips.get(s)!.push([x0, y0, x1, y1]);
      }
      this.bounds = [Math.min(this.bounds[0], x0, x1), Math.min(this.bounds[1], y0, y1), Math.max(this.bounds[2], x0, x1), Math.max(this.bounds[3], y0, y1)];
    }
  }
  has([x, y]: Pair): boolean {
    const [bx0, by0, bx1, by1] = this.bounds;
    if (x < bx0 || x > bx1 || y < by0 || y > by1) return false;
    let inside = false;
    for (const [x0, y0, x1, y1] of this.strips.get(Math.floor(y)) ?? []) {
      if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
    }
    return inside;
  }
}

// ---- Sources ----

// Natural Earth's marine features are already cut at ±180.
const ne: FeatureCollection<Polygon | MultiPolygon> = JSON.parse(readFileSync(SOURCE, 'utf8'));
const neByName = new Map<string, PcMulti[]>();
for (const f of ne.features) neByName.set(f.properties!.name, [...(neByName.get(f.properties!.name) ?? []), snap(asPolygons(f.geometry))]);

const claims = [...SEAS.flatMap((s) => s.ne), ...WATERS.map((w) => w.ne), ...SKIP_NE];
const twice = claims.filter((n, i) => claims.indexOf(n) !== i);
if (twice.length) throw new Error(`Claimed twice: ${twice.join(', ')}`);
const unknown = claims.filter((n) => !neByName.has(n));
if (unknown.length) throw new Error(`No Natural Earth feature named: ${unknown.join(', ')}`);
const unclaimed = [...neByName.keys()].filter((n) => !claims.includes(n));
if (unclaimed.length) throw new Error(`Unclaimed features: ${unclaimed.join(', ')}`);
const neUnion = (names: string[]) => union(names.flatMap((n) => neByName.get(n)!));

const require = createRequire(import.meta.url);
const atlas = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
// world-atlas rings cross ±180 (d3 handles that, planar operations don't): cut them there with d3's antimeridian clip,
// through a projection that maps lon/lat to itself.
const identity = geoEquirectangular().scale(180 / Math.PI).translate([0, 0]).reflectY(true).precision(0);
const atlasPolys = (g: any) =>
  snap(asPolygons((geoProject(feature(atlas, g) as unknown as Feature<Polygon | MultiPolygon>, identity) as Feature<Polygon | MultiPolygon>).geometry));
const antarcticaGeom = atlas.objects.countries.geometries.find((g: any) => g.properties.name === 'Antarctica');

console.log('Building seas');

// ---- 1. Answers ----

const WORLD_BOX = box(-180, -90, 180, 90);
const NORTH_OF_60S = box(-180, -60, 180, 90);
const SOUTH_OF_60S = box(-180, -90, 180, -60);

const landParts: PcMulti[] = atlas.objects.countries.geometries.map(atlasPolys);

// Natural Earth puts the Pacific/Bering boundary at 51.08°N on one side of the antimeridian, 50.99°N on the other.
const west = westOf([...[...neByName.values()].flat(), ...landParts]);
for (const [name, gs] of neByName) neByName.set(name, gs.map((g) => matchSeam(g, west)));

const land = timed('land', () => union(landParts.map((g) => matchSeam(g, west))));
const allNe = timed('all features', () => union([...neByName.entries()].filter(([n]) => !SKIP_NE.includes(n)).flatMap(([, gs]) => gs)));

const raw = new Map<string, PcMulti>();
timed('answers', () => {
  for (const s of SEAS) if (s.id !== 'sou') raw.set(s.id, neUnion(s.ne));
  const south = union([neUnion(SEAS.find((s) => s.id === 'sou')!.ne), ...CUT_AT_60S.map((id) => raw.get(id)!)]);
  raw.set('sou', pc.intersection(south, SOUTH_OF_60S));
  for (const id of CUT_AT_60S) raw.set(id, pc.intersection(raw.get(id)!, NORTH_OF_60S));
  const seasOnly = union(SEAS.filter((s) => !OCEANS.has(s.id)).map((s) => raw.get(s.id)!));
  for (const id of OCEANS) raw.set(id, pc.difference(raw.get(id)!, seasOnly));
  raw.set('sou', pc.difference(raw.get('sou')!, ...ANTARCTIC_SEAS.map((id) => raw.get(id)!)));
});

// ---- 2. Uncovered water ----

const gaps = timed('gaps', () => pc.difference(WORLD_BOX, land, allNe))
  .map((poly) => ({ poly, area: planarKm2(poly) }))
  .filter((g) => g.area >= MIN_GAP_KM2)
  .map((g) => ({ ...g, centroid: geoCentroid({ type: 'Polygon', coordinates: g.poly.map((r) => r.slice().reverse()) }) as Pair }));

const answerAt = new Map([...raw].map(([id, mp]) => [id, new Locator(mp)]));
const neAt = new Locator(allNe);
// For "nearest answer": every boundary point, long edges filled in at 0.25° so a straight sea boundary counts along its length.
const boundaryPoints = new Map([...raw].map(([id, mp]) => [id, mp.flatMap((poly) => poly.flatMap((ring) => densify(ring, 0.25)))]));
const folds = new Map<string, PcMulti[]>(SEAS.map((s) => [s.id, []]));
const report: string[] = [];
let lakes = 0;
timed('folding', () => {
  for (const gap of gaps) {
    const score = new Map<string, number>();
    let touchesFeature = false;
    for (const ring of gap.poly) for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1];
      const [x1, y1] = ring[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len === 0) continue;
      // Interior is on the left of every ring (exteriors counter-clockwise, holes clockwise): probe the right.
      const probe: Pair = [(x0 + x1) / 2 + ((y1 - y0) / len) * 0.01, (y0 + y1) / 2 - ((x1 - x0) / len) * 0.01];
      if (!neAt.has(probe)) continue;
      touchesFeature = true;
      const id = [...answerAt].find(([, at]) => at.has(probe))?.[0];
      if (id) score.set(id, (score.get(id) ?? 0) + geoDistance(ring[i - 1], ring[i]));
    }
    const override = FOLD_OVERRIDES.find((o) => new Locator([gap.poly]).has(o.at));
    if (!touchesFeature && !override) {
      lakes++;
      continue;
    }
    let to = override?.to ?? [...score].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!to) {
      let best = Infinity;
      for (const [id, points] of boundaryPoints) for (const v of points) {
        const d = geoDistance(v, gap.centroid);
        if (d < best) [best, to] = [d, id];
      }
    }
    folds.get(to!)!.push([gap.poly]);
    if (gap.area > PRINT_GAP_KM2) {
      const [lon, lat] = gap.centroid;
      report.push(`${Math.round(gap.area).toLocaleString('en').padStart(10)} km²  ${lat.toFixed(1).padStart(6)}, ${lon.toFixed(1).padStart(6)}  → ${SEAS.find((s) => s.id === to)!.name}${override ? ' (override)' : score.size ? '' : ' (nearest)'}`);
    }
  }
});
console.log(`Gaps over ${PRINT_GAP_KM2.toLocaleString('en')} km² (area, centroid lat/lon, answer):`);
for (const line of report) console.log(line);
console.log(`${gaps.length} gaps over ${MIN_GAP_KM2.toLocaleString('en')} km², ${lakes} of them lakes (dropped)`);

const answers = new Map([...raw].map(([id, mp]) => [id, folds.get(id)!.length ? union([mp, ...folds.get(id)!]) : mp]));

// ---- 3. Non-game water, Antarctica, output ----

const allAnswers = timed('answer union', () => union([...answers.values()]));
const waterShapes = timed('waters', () => WATERS.map((w) => ({ id: w.id, mp: pc.difference(union(neByName.get(w.ne)!), allAnswers) })));

const ordered = [...SEAS.filter((s) => OCEANS.has(s.id)), ...SEAS.filter((s) => !OCEANS.has(s.id))];
const seaFeatures = ordered.map((s) => forD3(s.id, answers.get(s.id)!));
const waterFeatures = waterShapes.filter((w) => w.mp.length).map((w) => forD3(w.id, w.mp));
const empty = WATERS.filter((w) => !waterFeatures.some((f) => f.id === w.id));
if (empty.length) throw new Error(`Non-game water covered entirely by answers: ${empty.map((w) => w.name).join(', ')}`);
const antarctica = feature(atlas, antarcticaGeom) as unknown as Feature<Polygon | MultiPolygon>;
for (const coordinates of asPolygons(antarctica.geometry)) {
  if (geoArea({ type: 'Polygon', coordinates }) >= 2 * Math.PI) throw new Error('Antarctica: a polygon is inverted');
}

const fc = (features: Feature[]) => ({ type: 'FeatureCollection', features }) as FeatureCollection;
const topo: any = topology(
  {
    seas: fc(seaFeatures),
    waters: fc(waterFeatures),
    antarctica: fc([{ type: 'Feature', id: 'antarctica', properties: {}, geometry: antarctica.geometry }]),
  },
  QUANTIZE,
);
writeFileSync(OUT_TOPO, JSON.stringify(topo));

// ---- Meta, from the shapes as stored ----

const stored = (feature(topo, topo.objects.seas) as unknown as FeatureCollection<Polygon | MultiPolygon>).features;
const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const coastal = (feature(world, world.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>).features;

function anchorOf(polys: Polygon[]): Pair {
  const largest = polys.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  const centroid = geoCentroid(largest) as Pair;
  if (geoContains(largest, centroid)) return centroid;
  // Otherwise the inside point of a 0.5° grid farthest from the boundary (shapes may cross ±180 now: lon wraps).
  const edge = largest.coordinates.flat();
  const [[x0, y0], [x1, y1]] = geoBounds(largest);
  const candidates: { p: Pair; d: number }[] = [];
  for (let x = Math.ceil(x0 * 2) / 2; x <= (x1 < x0 ? x1 + 360 : x1); x += 0.5) {
    for (let y = Math.ceil(y0 * 2) / 2; y <= y1; y += 0.5) {
      const k = Math.cos((y * Math.PI) / 180);
      let d = Infinity;
      for (const [ex, ey] of edge) {
        const dx = Math.abs(ex - x) % 360;
        d = Math.min(d, (Math.min(dx, 360 - dx) * k) ** 2 + (ey - y) ** 2);
      }
      candidates.push({ p: [x > 180 ? x - 360 : x, y], d });
    }
  }
  const inside = candidates.sort((a, b) => b.d - a.d).find((c) => geoContains(largest, c.p));
  if (!inside) throw new Error('No anchor inside the shape');
  return inside.p;
}

const cell = (x: number, y: number) => `${Math.floor(x * 2)},${Math.floor(y * 2)}`;
const meta: Record<string, { anchor: Pair; coast: string[] }> = {};
for (const f of stored) {
  const id = f.id as string;
  const polys = asPolygons(f.geometry).map((coordinates) => ({ type: 'Polygon' as const, coordinates: coordinates as Polygon['coordinates'] }));
  const round = (n: number) => Math.round(n * 100) / 100;
  const [lon, lat] = ANCHOR_OVERRIDES[id] ?? anchorOf(polys);
  const cells = new Map<string, Pair[]>();
  for (const v of polys.flatMap((p) => p.coordinates.flat()) as Pair[]) {
    const k = cell(v[0], v[1]);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(v);
  }
  const near = ([x, y]: Pair) => {
    for (const dx of [-0.5, 0, 0.5]) for (const dy of [-0.5, 0, 0.5]) {
      for (const [sx, sy] of cells.get(cell(x + dx, y + dy)) ?? []) if (Math.hypot(sx - x, sy - y) <= COAST_DEG) return true;
    }
    return false;
  };
  const coast = NO_COAST.has(id)
    ? []
    : coastal.filter((c) => asPolygons(c.geometry).some((p) => p.some((r) => r.some(near)))).map((c) => c.id as string).sort();
  const anchor: Pair = [round(lon), round(lat)];
  if (!polys.some((p) => geoContains(p, anchor))) throw new Error(`${id}: anchor ${anchor} is outside the shape`);
  meta[id] = { anchor, coast };
}
writeFileSync(OUT_META, JSON.stringify(meta, null, 0) + '\n');

const bytes = Buffer.byteLength(JSON.stringify(topo));
console.log(`seas.topo.json: ${(bytes / 1024).toFixed(0)} KB, ${seaFeatures.length} seas, ${waterFeatures.length} waters`);
