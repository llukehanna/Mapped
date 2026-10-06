import type { Phase } from '../game/types.ts';

export type ShapeState = 'off' | 'todo' | 'found' | 'just' | 'missed' | 'territory';

/**
 * How every shape on the map should look right now. A territory with an owner (Greenland → Denmark) takes on its
 * owner's state, so it lights up, fills and is missed together with it; one without stays neutral.
 */
export function shapeStates(
  ids: readonly string[],
  phase: Phase,
  pool: readonly string[],
  found: readonly string[],
  missed: readonly string[],
  justFound: string | null,
  owners: ReadonlyMap<string, string> = new Map(),
): Record<string, ShapeState> {
  const inPool = new Set(pool);
  const done = new Set(found);
  const lost = new Set(missed);
  const stateOf = (id: string): ShapeState => {
    if (!inPool.has(id)) return 'off';
    if (phase === 'setup') return 'todo';
    if (lost.has(id)) return 'missed';
    if (id === justFound) return 'just';
    if (done.has(id)) return 'found';
    return 'todo';
  };
  const out: Record<string, ShapeState> = {};
  for (const id of ids) {
    const owner = owners.get(id);
    out[id] = id.startsWith('t-') ? (owner ? stateOf(owner) : 'territory') : stateOf(id);
  }
  return out;
}
