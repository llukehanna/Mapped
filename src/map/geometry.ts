import { geoArea, geoCentroid, geoDistance, geoPath, type GeoProjection } from 'd3-geo';
import { geoPatterson } from 'd3-geo-projection';
import { zoomIdentity, type ZoomTransform } from 'd3-zoom';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

export interface MapShape {
  id: string;
  geometry: Polygon | MultiPolygon;
  /** Largest polygon: sizes markers and decides when they fade. */
  main: Polygon;
  /** Polygons within 30° of the main one: what framing uses, so France frames without French Guiana. */
  near: MultiPolygon;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Bounds = [[number, number], [number, number]];

const NEAR_RADIANS = (30 * Math.PI) / 180;
/** Countries that would drag a regional frame far off: frame this [[west, south], [east, north]] box instead. */
const FRAME_BOX: Record<string, [[number, number], [number, number]]> = {
  RUS: [[27, 42], [60, 70]], // European Russia, up to the Urals
};
const asPolygon = (coordinates: Position[][]): Polygon => ({ type: 'Polygon', coordinates });

export function prepareShapes(features: Feature<Polygon | MultiPolygon>[]): MapShape[] {
  return features.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const main = polys.map(asPolygon).reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
    const center = geoCentroid(main);
    const near = polys.filter((p) => geoDistance(geoCentroid(asPolygon(p)), center) <= NEAR_RADIANS);
    return { id: String(f.id), geometry: f.geometry, main, near: { type: 'MultiPolygon', coordinates: near } };
  });
}

/** Land runs from about 56°S (Cape Horn) to 83°N (northern Greenland); the world view frames this band. */
const LAND_SOUTH = -56;
const LAND_NORTH = 83;
/** The world view overscans a little: the outermost few % at the left and right edges are open ocean. */
export const WORLD_OVERSCAN = 1.04;

/**
 * The whole world fitted to the viewport, in Patterson: a cylindrical compromise that keeps the map
 * rectangular and edge to edge like Mercator without blowing up the far north. Zoom transforms do all framing.
 */
export function baseProjection(width: number, height: number, rotate: number): GeoProjection {
  const pad = 12;
  return geoPatterson()
    .rotate([rotate, 0])
    .fitExtent([[pad, pad], [Math.max(pad + 1, width - pad), Math.max(pad + 1, height - pad)]], { type: 'Sphere' });
}

/** Pixel bounds, under `projection`, of the countries `ids` (or the whole sphere). */
export function frameBounds(
  projection: GeoProjection,
  shapes: readonly MapShape[],
  ids: ReadonlySet<string> | 'world',
  anchors: Readonly<Record<string, { anchor: [number, number] }>>,
): Bounds {
  const path = geoPath(projection);
  if (ids === 'world') return worldBounds(projection);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const extend = ([[a, b], [c, d]]: Bounds) => {
    [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, c), Math.max(y1, d)];
  };
  const drawn = new Set<string>();
  for (const s of shapes) {
    if (!ids.has(s.id)) continue;
    drawn.add(s.id);
    const box = FRAME_BOX[s.id];
    const corners = box && [box[0], [box[1][0], box[0][1]], [box[0][0], box[1][1]], box[1], [(box[0][0] + box[1][0]) / 2, box[1][1]]];
    extend(path.bounds(corners ? { type: 'MultiPoint', coordinates: corners } : s.near) as Bounds);
  }
  for (const id of ids) {
    const p = drawn.has(id) ? null : projection(anchors[id]?.anchor ?? [0, 0]);
    if (p) extend([p, p] as Bounds);
  }
  return Number.isFinite(x0) ? [[x0, y0], [x1, y1]] : worldBounds(projection);
}

/** The full width of the map, between the land's southern and northern limits. */
function worldBounds(projection: GeoProjection): Bounds {
  const [[x0], [x1]] = geoPath(projection).bounds({ type: 'Sphere' });
  const center = -projection.rotate()[0];
  const north = projection([center, LAND_NORTH])![1];
  const south = projection([center, LAND_SOUTH])![1];
  return [[x0, north], [x1, south]];
}

/**
 * Zoom transform that centers `bounds` inside `safe`, no closer than `maxK`. `fill` below 1 leaves a margin;
 * above 1 overscans (the world view uses WORLD_OVERSCAN).
 */
export function fitTransform([[x0, y0], [x1, y1]]: Bounds, safe: Rect, maxK = 12, fill = 0.92): ZoomTransform {
  const k = Math.min(maxK, fill * Math.min(safe.width / Math.max(1, x1 - x0), safe.height / Math.max(1, y1 - y0)));
  return zoomIdentity
    .translate(safe.x + safe.width / 2 - (k * (x0 + x1)) / 2, safe.y + safe.height / 2 - (k * (y0 + y1)) / 2)
    .scale(k);
}

/**
 * Maps are centered on 10°E, which puts the edge at 170°W so Samoa, Tonga and Fiji stay together on one side.
 * Pacific-only selections are centered on 160°E so island chains don't split at the map edge.
 */
export function rotationFor(continents: Iterable<string>): number {
  const list = [...continents];
  return list.length > 0 && list.every((c) => c === 'oceania') ? -160 : -10;
}
