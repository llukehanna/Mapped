import { feature } from 'topojson-client';
import { useEffect, useState } from 'react';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import worldUrl from '../data/world.topo.json?url';
import { prepareShapes, type MapShape } from './geometry.ts';

export interface MapData {
  shapes: MapShape[];
  /** Disputed areas inside a country's shape (Somaliland in Somalia): striped on top, and named on hover. */
  disputed: Feature<Polygon | MultiPolygon>[];
}

/** Loads the map geometry once. Returns null until it arrives, or an Error if it can't. */
export function useShapes(): MapData | Error | null {
  const [data, setData] = useState<MapData | Error | null>(null);
  useEffect(() => {
    let live = true;
    fetch(worldUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Map data failed to load (${r.status})`);
        return r.json();
      })
      .then((topo) => {
        const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>;
        const disputed = feature(topo, topo.objects.disputed) as unknown as FeatureCollection<Polygon | MultiPolygon>;
        if (live) setData({ shapes: prepareShapes(fc.features), disputed: disputed.features });
      })
      .catch((e: unknown) => live && setData(e instanceof Error ? e : new Error(String(e))));
    return () => {
      live = false;
    };
  }, []);
  return data;
}
