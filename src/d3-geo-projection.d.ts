// d3-geo-projection ships no types; this declares the parts Mapped uses (geoProject and geoStitch: the seas build only).
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';
  export function geoPatterson(): GeoProjection;
  export function geoProject<T extends GeoJSON.GeoJSON>(object: T, projection: GeoProjection): T;
  export function geoStitch<T extends GeoJSON.GeoJSON>(object: T): T;
}
