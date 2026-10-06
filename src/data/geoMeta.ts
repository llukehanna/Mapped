import raw from './geo-meta.json';

export interface GeoMeta {
  /** marker and label position, [lon, lat] */
  anchor: [number, number];
  /** too small to see or click at world zoom: drawn with a marker */
  tiny: boolean;
  /** countries sharing a land border (hint ladder); empty for island nations and territories */
  neighbors: string[];
  /** island nations only: the two nearest countries */
  nearest?: string[];
}

export const GEO_META = raw as unknown as Readonly<Record<string, GeoMeta>>;
