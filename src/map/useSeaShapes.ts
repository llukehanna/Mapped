import { feature } from 'topojson-client';
import { useEffect, useState } from 'react';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import seasUrl from '../data/seas.topo.json?url';
import { prepareShapes, type MapShape } from './geometry.ts';

export interface SeaMapData {
  /** The game's seas: the board. */
  seas: MapShape[];
  /** Water that is in no one's game (a few straits, the Scotia Sea): hatched under the seas. */
  waters: Feature<Polygon | MultiPolygon>[];
  /** The Antarctic continent, drawn quiet over the Southern Ocean. */
  antarctica: Feature<Polygon | MultiPolygon>;
}

/** Loads the seas geometry the first time `enabled` is true, then keeps it. Null until it arrives, or an Error if it can't. */
export function useSeaShapes(enabled: boolean): SeaMapData | Error | null {
  const [data, setData] = useState<SeaMapData | Error | null>(null);
  const [started, setStarted] = useState(false);
  if (enabled && !started) setStarted(true);
  useEffect(() => {
    if (!started) return;
    let live = true;
    fetch(seasUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Sea data failed to load (${r.status})`);
        return r.json();
      })
      .then((topo) => {
        const fc = (name: string) => feature(topo, topo.objects[name]) as unknown as FeatureCollection<Polygon | MultiPolygon>;
        const antarctica = fc('antarctica').features[0];
        if (!antarctica) throw new Error('Sea data is missing Antarctica');
        if (live) setData({ seas: prepareShapes(fc('seas').features), waters: fc('waters').features, antarctica });
      })
      .catch((e: unknown) => live && setData(e instanceof Error ? e : new Error(String(e))));
    return () => {
      live = false;
    };
  }, [started]);
  return data;
}
