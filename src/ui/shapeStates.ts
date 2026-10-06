import type { Phase } from '../game/types.ts';

export type ShapeState = 'off' | 'todo' | 'found' | 'just' | 'missed' | 'territory';

/** How every shape on the map should look right now. */
export function shapeStates(
  ids: readonly string[],
  phase: Phase,
  pool: readonly string[],
  found: readonly string[],
  missed: readonly string[],
  justFound: string | null,
): Record<string, ShapeState> {
  const inPool = new Set(pool);
  const done = new Set(found);
  const lost = new Set(missed);
  const out: Record<string, ShapeState> = {};
  for (const id of ids) {
    if (id.startsWith('t-')) out[id] = 'territory';
    else if (!inPool.has(id)) out[id] = 'off';
    else if (phase === 'setup') out[id] = 'todo';
    else if (lost.has(id)) out[id] = 'missed';
    else if (id === justFound) out[id] = 'just';
    else if (done.has(id)) out[id] = 'found';
    else out[id] = 'todo';
  }
  return out;
}
