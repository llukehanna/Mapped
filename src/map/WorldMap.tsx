import { geoContains, geoGraticule10, geoPath, type GeoProjection } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent, type Ref } from 'react';
import { GEO_META } from '../data/geoMeta.ts';
import type { ShapeState } from '../ui/shapeStates.ts';
import { baseProjection, fitTransform, frameBounds, LAND_BAND, WORLD_OVERSCAN, type Band, type Bounds, type MapShape, type Rect } from './geometry.ts';

export type HighlightKind = 'hint' | 'target' | 'wrong' | 'reveal' | 'hover';

export interface Highlight {
  id: string;
  kind: HighlightKind;
  /** shown next to the country, e.g. its name after a wrong click */
  label?: string;
  /** changes retrigger the animation */
  seq?: number;
}

export interface MapHandle {
  zoomBy(factor: number): void;
  /** Re-frame the current selection. */
  fit(): void;
  /** Zoom to one country, no closer than `maxK`. */
  focus(id: string, maxK?: number): void;
  /** Zoom to frame several countries (e.g. a subregion), no closer than `maxK`. */
  frameIds(ids: readonly string[], maxK?: number): void;
  /** Is the country inside the safe area, with its largest landmass at least `minPx` across? */
  isVisible(id: string, minPx: number): boolean;
}

interface WorldMapProps {
  ref?: Ref<MapHandle>;
  shapes: readonly MapShape[];
  /** disputed areas inside a country's shape, striped on top of it */
  disputed: readonly Feature<Polygon | MultiPolygon>[];
  width: number;
  height: number;
  rotate: number;
  /** what to frame: these countries, or the whole world */
  frame: ReadonlySet<string> | 'world';
  /** part of the viewport not covered by chrome */
  safe: Rect;
  states: Readonly<Record<string, ShapeState>>;
  /** tiny countries to mark with a circle */
  markers: readonly string[];
  highlights: readonly Highlight[];
  /** locate hint level 2: a circle near (not exactly on) this country */
  areaPulse: string | null;
  mode: 'browse' | 'pick' | 'locate' | 'review';
  reducedMotion: boolean;
  onShapeClick?: (id: string, pointerType: string) => void;
  onShapeHover?: (id: string | null, x: number, y: number) => void;
  /** the striped area under the pointer (a disputed area, or a territory outside every country), if any */
  onAreaHover?: (id: string | null, x: number, y: number) => void;
  /** where each shape's label, marker and bounds fall when it has no shape of its own; defaults to the countries' */
  anchors?: Readonly<Record<string, { anchor: [number, number] }>>;
  /** the latitudes the world view frames; defaults to the land's */
  band?: Band;
  /** water in no one's game: hatched, drawn under the shapes, never clickable */
  underlay?: readonly Feature<Polygon | MultiPolygon>[];
  /** quiet land drawn over everything but the labels: hides the coast of the shapes under it and swallows their clicks */
  overlay?: readonly Feature<Polygon | MultiPolygon>[];
  /** 'seas' marks the svg for the seas styles */
  variant?: 'land' | 'seas';
}

const MARKER_R = 5;
const MARKER_HIT_R = 14;
/** Markers fade out once the real shape is this many px across, and are gone by twice that. */
const MARKER_FADE_PX = 12;
const MAX_ZOOM = 60;
const GRATICULE = geoGraticule10();

const ShapeLayer = memo(function ShapeLayer({
  shapes,
  paths,
  states,
}: {
  shapes: readonly MapShape[];
  paths: ReadonlyMap<string, string>;
  states: Readonly<Record<string, ShapeState>>;
}) {
  // Territories ("dep") share their owner's look but never take clicks or hovers of their own.
  return shapes.map((s) => (
    <path key={s.id} d={paths.get(s.id)} data-id={s.id} className={`shape ${states[s.id] ?? 'off'}${s.id.startsWith('t-') ? ' dep' : ''}`} />
  ));
});

/** Stable pseudo-random offset so the locate area hint never sits exactly on the answer. */
function offsetFor(id: string, radius: number): [number, number] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

export function WorldMap(props: WorldMapProps) {
  const { shapes, disputed, width, height, rotate, frame, safe, states, markers, highlights, areaPulse, mode, reducedMotion } = props;
  const anchors = props.anchors ?? GEO_META;
  const band = props.band ?? LAND_BAND;
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);

  const projection = useMemo<GeoProjection>(() => baseProjection(width, height, rotate), [width, height, rotate]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const paths = useMemo(() => new Map(shapes.map((s) => [s.id, path(s.geometry) ?? ''])), [shapes, path]);
  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes]);
  const underlayPaths = useMemo(() => (props.underlay ?? []).map((f) => ({ id: String(f.id), d: path(f) ?? '' })), [props.underlay, path]);
  const overlayPaths = useMemo(() => (props.overlay ?? []).map((f) => ({ id: String(f.id), d: path(f) ?? '' })), [props.overlay, path]);
  const disputedPaths = useMemo(() => disputed.map((f) => ({ id: String(f.id), d: path(f) ?? '' })), [disputed, path]);
  /** px across of each country's main landmass at zoom 1 */
  const mainSize = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of shapes) {
      const [[x0, y0], [x1, y1]] = path.bounds(s.main);
      out.set(s.id, Math.max(x1 - x0, y1 - y0));
    }
    return out;
  }, [shapes, path]);

  const frameKey = frame === 'world' ? 'world' : [...frame].sort().join(',');
  const target = useMemo(
    () => fitTransform(frameBounds(projection, shapes, frame, anchors, band), safe, 12, frame === 'world' ? WORLD_OVERSCAN : undefined),
    [projection, shapes, anchors, band, frameKey, safe.x, safe.y, safe.width, safe.height],
  );

  function apply(next: ZoomTransform, ms: number) {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    const sel = select(svg);
    if (reducedMotion || ms === 0) sel.interrupt().call(z.transform, next);
    else sel.transition().duration(ms).call(z.transform, next);
  }

  useEffect(() => {
    const svg = svgRef.current!;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, MAX_ZOOM])
      .clickDistance(5)
      .on('zoom', (e: { transform: ZoomTransform }) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        setT(e.transform);
      });
    zoomRef.current = z;
    select(svg).call(z);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    zoomRef.current?.translateExtent([[-width, -height], [width * 2, height * 2]]);
  }, [width, height]);

  // Re-frame when the selection or chrome changes (animated) or the viewport resizes (instant).
  const lastProjection = useRef<GeoProjection | null>(null);
  useEffect(() => {
    const resized = lastProjection.current !== projection;
    lastProjection.current = projection;
    apply(target, resized ? 0 : 550);
  }, [target]);

  function boundsOf(id: string): Bounds | null {
    const s = byId.get(id);
    if (s) return path.bounds(s.near) as Bounds;
    const p = projection(anchors[id]?.anchor ?? [0, 0]);
    return p ? [[p[0] - 2, p[1] - 2], [p[0] + 2, p[1] + 2]] : null;
  }

  useImperativeHandle(props.ref, () => ({
    zoomBy(factor) {
      const svg = svgRef.current;
      if (svg && zoomRef.current) select(svg).transition().duration(reducedMotion ? 0 : 250).call(zoomRef.current.scaleBy, factor);
    },
    fit() {
      apply(target, 550);
    },
    focus(id, maxK = 8) {
      const b = boundsOf(id);
      if (b) apply(fitTransform(b, safe, maxK), 650);
    },
    frameIds(ids, maxK = 8) {
      apply(fitTransform(frameBounds(projection, shapes, new Set(ids), anchors, band), safe, maxK), 650);
    },
    isVisible(id, minPx) {
      const b = boundsOf(id);
      if (!b) return false;
      const [[x0, y0], [x1, y1]] = [t.apply(b[0]), t.apply(b[1])];
      // On screen by its whole footprint, but big enough only if its largest landmass is.
      const size = (mainSize.get(id) ?? 0) * t.k;
      return x1 > safe.x && x0 < safe.x + safe.width && y1 > safe.y && y0 < safe.y + safe.height && size >= minPx;
    },
  }));

  /** Striped areas take no clicks (those go to the country underneath), so hover finds them by geography instead. */
  function areaAt(x: number, y: number): string | null {
    const p = projection.invert?.(t.invert([x, y]));
    if (!p) return null;
    const hit = disputed.find((f) => geoContains(f, p)) ?? shapes.find((s) => states[s.id] === 'territory' && geoContains(s.geometry, p));
    return hit ? String(hit.id) : null;
  }

  function idAt(e: MouseEvent): string | null {
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
    return id && !id.startsWith('t-') ? id : null;
  }

  const screen = (id: string): [number, number] | null => {
    const p = projection(anchors[id]?.anchor ?? [0, 0]);
    return p ? (t.apply(p) as [number, number]) : null;
  };

  const markerOpacity = (id: string) => {
    const px = (mainSize.get(id) ?? 0) * t.k;
    return Math.max(0, Math.min(1, (2 * MARKER_FADE_PX - px) / MARKER_FADE_PX));
  };

  const highlightOf = new Map(highlights.map((h) => [h.id, h.kind]));
  const pulseAt = areaPulse ? screen(areaPulse) : null;
  const pulseOffset = areaPulse ? offsetFor(areaPulse, 34) : [0, 0];

  return (
    <svg
      ref={svgRef}
      className={`map${props.variant === 'seas' ? ' seas' : ''} ${mode === 'locate' ? 'locating' : mode === 'pick' ? 'picking' : mode === 'review' ? 'reviewing' : ''}`}
      width={width}
      height={height}
      role="img"
      aria-label="World map"
      onClick={(e) => {
        const id = idAt(e);
        if (id) props.onShapeClick?.(id, (e.nativeEvent as globalThis.PointerEvent).pointerType || 'mouse');
      }}
      onPointerMove={(e) => {
        if (!props.onShapeHover && !props.onAreaHover) return;
        const box = svgRef.current!.getBoundingClientRect();
        const [x, y] = [e.clientX - box.left, e.clientY - box.top];
        props.onShapeHover?.(idAt(e), x, y);
        props.onAreaHover?.(areaAt(x, y), x, y);
      }}
      onPointerLeave={() => {
        props.onShapeHover?.(null, 0, 0);
        props.onAreaHover?.(null, 0, 0);
      }}
    >
      <defs>
        <pattern id="missed-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect className="hatch-bg" width="5" height="5" />
          <line className="hatch-line" x1="0" y1="0" x2="0" y2="5" />
        </pattern>
        {/* Land that is in no one's game (Western Sahara): hatched, the usual map sign for a disputed area. Stripes keep
            their screen size at any zoom. */}
        <pattern id="territory-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform={`scale(${1 / t.k}) rotate(-45)`}>
          <rect className="territory-bg" width="4" height="4" />
          <line className="territory-line" x1="0" y1="0" x2="0" y2="4" />
        </pattern>
        {/* The same stripes with no ground, over a disputed area that is counted as part of a country (Somaliland). */}
        <pattern id="disputed-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform={`scale(${1 / t.k}) rotate(-45)`}>
          <line className="territory-line" x1="0" y1="0" x2="0" y2="4" />
        </pattern>
      </defs>
      {/* Ocean fills the whole viewport: the map runs edge to edge with no globe outline. */}
      <rect className="ocean" width={width} height={height} />
      <g ref={gRef}>
        <path className="grat" d={path(GRATICULE) ?? ''} />
        {underlayPaths.map((a) => (
          <path key={a.id} className="water" d={a.d} />
        ))}
        <ShapeLayer shapes={shapes} paths={paths} states={states} />
        {disputedPaths.map((a) => (
          <path key={a.id} className="disputed" data-area={a.id} d={a.d} />
        ))}
        {highlights.map((h) =>
          paths.has(h.id) ? <path key={`${h.kind}-${h.id}-${h.seq ?? 0}`} className={`hl ${h.kind}`} d={paths.get(h.id)} /> : null,
        )}
        {overlayPaths.map((a) => (
          <path key={a.id} className="cover" d={a.d} />
        ))}
      </g>
      <g>
        {markers.map((id) => {
          const p = screen(id);
          if (!p) return null;
          const opacity = markerOpacity(id);
          const hl = highlightOf.get(id);
          return (
            <g key={id} style={{ opacity: hl ? 1 : opacity }}>
              <circle className={`marker ${states[id] ?? ''} ${hl ? `hl-${hl}` : ''}`} cx={p[0]} cy={p[1]} r={MARKER_R} />
              <circle className={`marker-hit ${opacity < 0.2 ? 'inert' : ''}`} data-id={id} cx={p[0]} cy={p[1]} r={MARKER_HIT_R} />
            </g>
          );
        })}
        {pulseAt && <circle className="area-pulse" cx={pulseAt[0] + pulseOffset[0]} cy={pulseAt[1] + pulseOffset[1]} r={70} />}
        {highlights
          .filter((h) => h.label)
          .map((h) => {
            const p = screen(h.id);
            return p ? (
              <text key={`label-${h.id}-${h.seq ?? 0}`} className="map-label" x={p[0]} y={p[1] - 12} textAnchor="middle">
                {h.label}
              </text>
            ) : null;
          })}
      </g>
    </svg>
  );
}
