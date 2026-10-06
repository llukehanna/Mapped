import { readFileSync } from 'node:fs';
import { geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import { describe, expect, it } from 'vitest';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { baseProjection, fitTransform, frameBounds, prepareShapes, rotationFor, WORLD_OVERSCAN } from '../../src/map/geometry.ts';

const topo = JSON.parse(readFileSync(new URL('../../src/data/world.topo.json', import.meta.url), 'utf8'));
const shapes = prepareShapes((feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>).features);
const byId = new Map(shapes.map((s) => [s.id, s]));

describe('prepareShapes', () => {
  it('frames France without its overseas departments', () => {
    const fra = byId.get('FRA')!;
    for (const poly of fra.near.coordinates) expect(geoCentroid({ type: 'Polygon', coordinates: poly })[0]).toBeGreaterThan(-20);
  });

  it('frames the United States without Hawaii', () => {
    const usa = byId.get('USA')!;
    for (const poly of usa.near.coordinates) expect(geoCentroid({ type: 'Polygon', coordinates: poly })[0]).toBeGreaterThan(-140);
  });
});

describe('framing', () => {
  const projection = baseProjection(1280, 720, -10);
  const safe = { x: 0, y: 0, width: 1280, height: 720 };

  it('frames the world by its land, edge to edge, slightly closer than the whole globe', () => {
    const t = fitTransform(frameBounds(projection, shapes, 'world', GEO_META), safe, 12, WORLD_OVERSCAN);
    expect(t.k).toBeGreaterThan(1);
    expect(t.k).toBeLessThan(1.3);
    // The land band (56°S to 83°N) spans the full safe width.
    const [[x0], [x1]] = frameBounds(projection, shapes, 'world', GEO_META);
    expect(t.k * (x1 - x0)).toBeGreaterThanOrEqual(1280);
  });

  it('zooms in on a small selection and centers it in the safe area', () => {
    const ids = new Set(['BEL', 'NLD', 'LUX']);
    const bounds = frameBounds(projection, shapes, ids, GEO_META);
    const t = fitTransform(bounds, safe, 40);
    expect(t.k).toBeGreaterThan(10);
    const [[x0, y0], [x1, y1]] = bounds;
    const [cx, cy] = t.apply([(x0 + x1) / 2, (y0 + y1) / 2]);
    expect(cx).toBeCloseTo(640, 0);
    expect(cy).toBeCloseTo(360, 0);
  });

  it('frames Europe around European Russia, not all of Siberia', () => {
    const europe = new Set(['RUS', 'FRA', 'ESP', 'NOR', 'GRC']);
    const [[x0], [x1]] = frameBounds(projection, shapes, europe, GEO_META);
    expect(x1 - x0).toBeLessThan(1280 * 0.3);
  });

  it('caps zoom at maxK', () => {
    expect(fitTransform(frameBounds(projection, shapes, new Set(['VAT']), GEO_META), safe, 12).k).toBe(12);
  });

  it('includes marker-only countries via their anchor', () => {
    const [[x0], [x1]] = frameBounds(projection, shapes, new Set(['TUV']), GEO_META);
    expect(Number.isFinite(x0) && x0 === x1).toBe(true);
  });
});

describe('rotationFor', () => {
  it('centers on 10°E so Pacific islands stay together, and on 160°E for Oceania-only selections', () => {
    expect(rotationFor(['oceania'])).toBe(-160);
    expect(rotationFor(['oceania', 'asia'])).toBe(-10);
    expect(rotationFor([])).toBe(-10);
  });
});
