// Temporary: renders just the map so it can be checked by eye. The next task replaces this file.
import { useMemo } from 'react';
import { COUNTRIES } from './data/countries.ts';
import { GEO_META } from './data/geoMeta.ts';
import { useShapes } from './map/useShapes.ts';
import { WorldMap } from './map/WorldMap.tsx';
import { useMediaQuery, useSize } from './ui/hooks.ts';
import { shapeStates } from './ui/shapeStates.ts';

const POOL = COUNTRIES.map((c) => c.id);

export function App() {
  const shapes = useShapes();
  const [ref, size] = useSize<HTMLDivElement>();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const list = Array.isArray(shapes) ? shapes : null;
  const states = useMemo(() => shapeStates(list?.map((s) => s.id) ?? [], 'setup', POOL, [], [], null), [list]);
  return (
    <div className="map-wrap" ref={ref}>
      {list && size.width > 0 && (
        <WorldMap
          shapes={list}
          width={size.width}
          height={size.height}
          rotate={0}
          frame="world"
          safe={{ x: 24, y: 24, width: size.width - 48, height: size.height - 48 }}
          states={states}
          markers={POOL.filter((id) => GEO_META[id]?.tiny)}
          highlights={[]}
          areaPulse={null}
          mode="browse"
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}
