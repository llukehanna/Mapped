// Builds src/data/seas.topo.json and src/data/seas-meta.json for the Seas topic from Natural Earth's 1:50m marine
// areas (scripts/data/ne_50m_geography_marine_polys.geojson, public domain) and world-atlas land. Run with
// `npm run seas`. Outputs are committed.
//
// Boolean operations (polygon-clipping) work in planar lon/lat, with everything cut at ±180. On the way out, every long
// straight edge is densified to 1° steps, which keeps d3's great-circle edges on the planar line (the 60°S cut most of
// all), and the cuts at ±180 are stitched back together so no seam shows down the antimeridian.
// 1. Each answer is the union of its Natural Earth features. Oceans give way to the seas inside them, so no two
//    answers overlap.
// 2. Water no feature covers (world − land − every feature) is split into pieces. Each joins the answer it shares the
//    longest boundary with. A piece touching only non-game water joins the nearest answer if it is 1,000 km² or more,
//    else the non-game water it shares the longest boundary with. Pieces touching no feature at all are lakes, dropped.
// 3. The Atlantic, Pacific and Indian Oceans stop at 60°S. Everything south of it that isn't land or the Weddell, Ross,
//    Amundsen or Bellingshausen Sea is the Southern Ocean: a full band, with no non-game water in it.
// 4. Non-game water (gulfs, bays, straits...) is each feature less the answers, so it fills only what they leave.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoEquirectangular } from 'd3-geo';
import { geoProject, geoStitch } from 'd3-geo-projection';
import pc from 'polygon-clipping';
import type { MultiPolygon as PcMulti, Pair, Polygon as PcPolygon, Ring } from 'polygon-clipping';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { OCEANS, SEA, SEAS, SKIP_NE, WATER, WATERS } from '../src/data/seas.ts';

const SOURCE = new URL('./data/ne_50m_geography_marine_polys.geojson', import.meta.url);
const WORLD = new URL('../src/data/world.topo.json', import.meta.url);
const OUT_TOPO = new URL('../src/data/seas.topo.json', import.meta.url);
const OUT_META = new URL('../src/data/seas-meta.json', import.meta.url);

// Grid resolution for the delta-encoded output coordinates (as in build-geo).
const QUANTIZE = 1e5;
// Oceans that stop at 60°S, and the seas carved out of the Southern Ocean below it.
const CUT_AT_60S = ['atl', 'pac', 'ind'];
const ANTARCTIC_SEAS = ['weddell', 'ross', 'amundsen', 'belling'];
// Uncovered pieces touching only non-game water: from this size they join the nearest answer, below it that water.
const NEAREST_KM2 = 1_000;
const PRINT_GAP_KM2 = 5_000;
// Polygons smaller than this are slivers left by the boolean operations (or between two coastlines): dropped.
const SLIVER_KM2 = 1;
// Non-game water that lies wholly inside an answer, so it has no shape of its own (still named in notes when typed).
const SWALLOWED = new Set([
  'w-drake-passage', // covered by the Atlantic and Pacific north of 60°S, the Southern Ocean south of it
  'w-luzon-strait', // a zero-area feature at 1:50m
  'w-scotia-sea', // south of 60°S: the Southern Ocean, and Elephant Island
]);
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
  // The centroid of the polar cap is a hair from the pole, on the antimeridian side.
  arc: [0, 87],
};
for (const id of Object.keys(ANCHOR_OVERRIDES)) if (!SEA.has(id)) throw new Error(`Anchor override for unknown sea ${id}`);
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
// polygon-clipping occasionally loses a segment (or recurses forever) on points its own earlier output computed;
// rounding those to the 1e-6 grid and trying again gets past it.
function robust(op: (first: PcMulti, ...rest: PcMulti[]) => PcMulti, gs: PcMulti[]): PcMulti {
  try {
    return op(gs[0], ...gs.slice(1));
  } catch {
    const snapped = gs.map(snap);
    return op(snapped[0], ...snapped.slice(1));
  }
}
const union = (gs: PcMulti[]): PcMulti => (gs.length ? robust(pc.union, gs) : []);

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
// hole) or a ring with no area; holes go back into the polygon around them, empty rings are dropped. The build fails
// if the stitched shape's area differs from the cut one.
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
  if (!stitched.length || Math.abs(total(stitched) - total(cut)) >= 1e-6) throw new Error(`${id}: stitching across ±180 changed the area`);
  for (const c of stitched) {
    if (areaOf(c) >= 2 * Math.PI) throw new Error(`${id}: a polygon is inverted`);
    if (areaOf([c[0]]) >= 2 * Math.PI || c.slice(1).some((h) => areaOf([h]) < 2 * Math.PI)) throw new Error(`${id}: rings out of order`);
  }
  return { type: 'Feature', id, properties: {}, geometry: { type: 'MultiPolygon', coordinates: stitched } };
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

// The oceans' parts south of 60°S go to the Southern Ocean here only so the gap probes below see an answer there;
// the band itself is rebuilt in step 3.
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
  .filter((g) => g.area >= SLIVER_KM2)
  .map((g) => ({ ...g, centroid: geoCentroid({ type: 'Polygon', coordinates: g.poly.map((r) => r.slice().reverse()) }) as Pair }));

const answerAt = new Map([...raw].map(([id, mp]) => [id, new Locator(mp)]));
const waterAt = new Map(WATERS.map((w) => [w.id, new Locator(neByName.get(w.ne)!.flat())]));
const neAt = new Locator(allNe);
// For "nearest answer": every boundary point, long edges filled in at 0.25° so a straight sea boundary counts along its length.
const boundaryPoints = new Map([...raw].map(([id, mp]) => [id, mp.flatMap((poly) => poly.flatMap((ring) => densify(ring, 0.25)))]));
const folds = new Map<string, PcMulti[]>([...SEAS, ...WATERS].map((s) => [s.id, []]));
const usedOverrides = new Set<(typeof FOLD_OVERRIDES)[number]>();
const report: string[] = [];
const count = { answer: 0, nearest: 0, water: 0, lake: 0 };
timed('folding', () => {
  for (const gap of gaps) {
    const score = new Map<string, number>();
    const waterScore = new Map<string, number>();
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
      const add = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + geoDistance(ring[i - 1], ring[i]));
      const id = [...answerAt].find(([, at]) => at.has(probe))?.[0];
      if (id) add(score, id);
      else {
        const w = [...waterAt].find(([, at]) => at.has(probe))?.[0];
        if (w) add(waterScore, w);
      }
    }
    const override = FOLD_OVERRIDES.find((o) => new Locator([gap.poly]).has(o.at));
    if (override) usedOverrides.add(override);
    const best = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
    let to = override?.to ?? best(score);
    let how = override ? ' (override)' : '';
    if (to) count.answer++;
    else if (!touchesFeature) {
      count.lake++;
      continue;
    } else if (gap.area >= NEAREST_KM2) {
      let d0 = Infinity;
      for (const [id, points] of boundaryPoints) for (const v of points) {
        const d = geoDistance(v, gap.centroid);
        if (d < d0) [d0, to] = [d, id];
      }
      how = ' (nearest)';
      count.nearest++;
    } else {
      to = best(waterScore);
      if (!to) throw new Error(`Gap at ${gap.centroid} touches a feature but neither an answer nor a water`);
      count.water++;
    }
    folds.get(to!)!.push([gap.poly]);
    if (gap.area > PRINT_GAP_KM2) {
      const [lon, lat] = gap.centroid;
      report.push(`${Math.round(gap.area).toLocaleString('en').padStart(10)} km²  ${lat.toFixed(1).padStart(6)}, ${lon.toFixed(1).padStart(6)}  → ${(SEA.get(to!) ?? WATER.get(to!))!.name}${how}`);
    }
  }
});
const unused = FOLD_OVERRIDES.filter((o) => !usedOverrides.has(o));
if (unused.length) throw new Error(`Fold overrides in no gap: ${unused.map((o) => o.at).join('; ')}`);
console.log(`Gaps over ${PRINT_GAP_KM2.toLocaleString('en')} km² (area, centroid lat/lon, answer):`);
for (const line of report) console.log(line);
console.log(
  `${gaps.length} gaps over ${SLIVER_KM2} km²: ${count.answer} joined the answer they border, ${count.nearest} the nearest answer, ` +
    `${count.water} small ones their non-game water; ${count.lake} lakes dropped`,
);

const folded = (id: string, mp: PcMulti) => (folds.get(id)!.length ? union([mp, ...folds.get(id)!]) : mp);
const answers = new Map([...raw].map(([id, mp]) => [id, folded(id, mp)]));

// ---- 3. The Southern Ocean: everything south of 60°S that is neither land nor another answer ----

const southLand = pc.intersection(land, SOUTH_OF_60S); // Antarctica and the islands: far fewer rings than the world
timed('southern ocean', () => {
  for (const id of CUT_AT_60S) answers.set(id, pc.intersection(answers.get(id)!, NORTH_OF_60S));
  const others = SEAS.filter((s) => s.id !== 'sou' && new Locator(answers.get(s.id)!).bounds[1] < -60).map((s) => answers.get(s.id)!);
  answers.set('sou', robust(pc.difference, [pc.difference(SOUTH_OF_60S, southLand), ...others]));
});

// ---- 4. Non-game water, Antarctica, output ----

// Slivers left by the boolean operations go, so no shape carries a polygon nobody could see or click.
const solid = (mp: PcMulti) => mp.filter((poly) => planarKm2(poly) >= SLIVER_KM2);
// Each water less the answers whose bounding boxes meet it (one union of every answer trips polygon-clipping), and
// south of 60°S less land too, so none is left there at all.
const overlaps = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const answerBounds = [...answers.values()].map((mp) => ({ mp, bounds: new Locator(mp).bounds }));
const waterShapes = timed('waters', () =>
  WATERS.map((w) => {
    const mp = folded(w.id, union(neByName.get(w.ne)!));
    const bounds = new Locator(mp).bounds;
    const clips = answerBounds.filter((a) => overlaps(a.bounds, bounds)).map((a) => a.mp);
    if (bounds[1] < -60) clips.push(southLand);
    return { id: w.id, mp: solid(robust(pc.difference, [mp, ...clips])) };
  }),
);

const ordered = [...SEAS.filter((s) => OCEANS.has(s.id)), ...SEAS.filter((s) => !OCEANS.has(s.id))];
const seaFeatures = ordered.map((s) => forD3(s.id, solid(answers.get(s.id)!)));
const waterFeatures = waterShapes.filter((w) => w.mp.length).map((w) => forD3(w.id, w.mp));
const shapeless = WATERS.filter((w) => !waterFeatures.some((f) => f.id === w.id)).map((w) => w.id);
if (shapeless.join() !== [...SWALLOWED].join()) throw new Error(`Non-game water with no shape: ${shapeless.join(', ')}; expected ${[...SWALLOWED].join(', ')}`);
const antarctica = feature(atlas, antarcticaGeom) as unknown as Feature<Polygon | MultiPolygon>;
for (const coordinates of asPolygons(antarctica.geometry)) {
  if (geoArea({ type: 'Polygon', coordinates }) >= 2 * Math.PI) throw new Error('Antarctica: a polygon is inverted');
}

const fc = (features: Feature[]) => ({ type: 'FeatureCollection', features }) as FeatureCollection;

// Quantize ourselves first, onto the grid topology() will use (same bounding box, same QUANTIZE), so the rings can be
// cleaned on the grid: two points that land on one grid point merge, and a there-and-back spike (a, b, a) goes. A
// spike that crosses the edge of a clipped view (an orthographic map's horizon) makes d3 fill the wrong side.
{
  const all = [...seaFeatures, ...waterFeatures, antarctica].flatMap((f) => asPolygons(f.geometry).flat(2));
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const [kx, ky] = [(x1 - x0) / (QUANTIZE - 1), (y1 - y0) / (QUANTIZE - 1)];
  const onGrid = ([x, y]: number[]): Pair => [x0 + Math.round((x - x0) / kx) * kx, y0 + Math.round((y - y0) / ky) * ky];
  const same = (a: Pair, b: Pair) => a[0] === b[0] && a[1] === b[1];
  const clean = (ring: number[][]): Pair[] => {
    const pts = ring.slice(0, -1).map(onGrid);
    for (let changed = true; changed && pts.length >= 3; ) {
      changed = false;
      for (let i = 0; i < pts.length && pts.length >= 3; i++) {
        const [prev, cur, next] = [pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]];
        if (same(cur, next)) pts.splice(i, 1);
        else if (same(prev, next)) pts.splice(i, 2 - Number(i === pts.length - 1));
        else continue;
        changed = true;
        i = Math.max(-1, i - 2);
      }
    }
    return pts.length >= 3 ? [...pts, pts[0]] : [];
  };
  for (const f of [...seaFeatures, ...waterFeatures]) {
    f.geometry.coordinates = f.geometry.coordinates
      .map((poly) => poly.map(clean))
      .filter((poly) => poly[0].length)
      .map((poly) => poly.filter((ring) => ring.length));
  }
}
// Quantization can collapse a thin polygon to nothing, or turn it or one of its holes inside out (d3 then reads a
// polygon as the whole sphere, or a hole as a second exterior, which breaks clipping at the map edge). Any such polygon
// (under 1 km² or inverted) or hole is dropped, and the topology built again.
let topo: any;
for (let round = 0; ; round++) {
  topo = topology(
    {
      seas: fc(seaFeatures),
      waters: fc(waterFeatures),
      antarctica: fc([{ type: 'Feature', id: 'antarctica', properties: {}, geometry: antarctica.geometry }]),
    },
    QUANTIZE,
  );
  let dropped = 0;
  for (const [name, input] of [['seas', seaFeatures], ['waters', waterFeatures]] as const) {
    const out = (feature(topo, topo.objects[name]) as unknown as FeatureCollection<MultiPolygon>).features;
    out.forEach((f, i) => {
      const polys = f.geometry.coordinates;
      const given = input[i].geometry.coordinates;
      if (polys.length !== given.length || polys.some((p, j) => p.length !== given[j].length)) throw new Error(`${f.id}: topology changed the rings`);
      const ringArea = (ring: Polygon['coordinates'][number]) => geoArea({ type: 'Polygon', coordinates: [ring] });
      const kept = given.flatMap((poly, j) => {
        const area = geoArea({ type: 'Polygon', coordinates: polys[j] });
        if (area >= 2 * Math.PI || km2(area) < SLIVER_KM2 || ringArea(polys[j][0]) >= 2 * Math.PI) return (dropped++, []);
        const holes = poly.slice(1).filter((_, k) => ringArea(polys[j][k + 1]) >= 2 * Math.PI);
        dropped += poly.length - 1 - holes.length;
        return [[poly[0], ...holes]];
      });
      if (!kept.length) throw new Error(`${f.id}: nothing left after quantization`);
      input[i].geometry.coordinates = kept;
    });
  }
  if (!dropped) break;
  console.log(`  quantization: dropped ${dropped} polygons or holes that collapsed`);
  if (round === 3) throw new Error('Quantization keeps collapsing polygons');
}
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
