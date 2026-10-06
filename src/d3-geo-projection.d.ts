// d3-geo-projection ships no types; this declares the one projection Mapped uses.
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';
  export function geoPatterson(): GeoProjection;
}
