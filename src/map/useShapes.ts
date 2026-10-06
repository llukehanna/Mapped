import { feature } from 'topojson-client';
import { useEffect, useState } from 'react';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import worldUrl from '../data/world.topo.json?url';
import { prepareShapes, type MapShape } from './geometry.ts';

/** Loads the map geometry once. Returns null until it arrives, or an Error if it can't. */
export function useShapes(): MapShape[] | Error | null {
  const [shapes, setShapes] = useState<MapShape[] | Error | null>(null);
  useEffect(() => {
    let live = true;
    fetch(worldUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Map data failed to load (${r.status})`);
        return r.json();
      })
      .then((topo) => {
        const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>;
        if (live) setShapes(prepareShapes(fc.features));
      })
      .catch((e: unknown) => live && setShapes(e instanceof Error ? e : new Error(String(e))));
    return () => {
      live = false;
    };
  }, []);
  return shapes;
}
