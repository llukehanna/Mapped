import raw from './geo-meta.json';

export interface GeoMeta {
  /** marker and label position, [lon, lat] */
  anchor: [number, number];
  /** too small to see or click at world zoom: drawn with a marker */
  tiny: boolean;
}

export const GEO_META = raw as unknown as Readonly<Record<string, GeoMeta>>;
