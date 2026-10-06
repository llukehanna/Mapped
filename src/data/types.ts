export type Continent = 'africa' | 'asia' | 'europe' | 'north-america' | 'south-america' | 'oceania';

export interface CountryDef {
  id: string;           // ISO 3166-1 alpha-3 (Kosovo: XKX)
  name: string;         // display name
  continent: Continent;
  subregion: string;
  aliases: string[];
  geo: string | null;   // feature name in world-atlas countries-50m; null = marker only
}

export interface TerritoryDef {
  id: string;           // 't-' + slug
  name: string;
  note: string;         // shown when someone types it, e.g. "Territory of Denmark"
  aliases: string[];
  geo: string | null;   // feature name in countries-50m; null = name-only note, no shape
}
