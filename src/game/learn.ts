/** Right answers in a row that make a flag learned. */
export const LEARN_STREAK = 2;
/** A missed flag comes back this many cards later. */
export const REQUEUE_AFTER = 3;

export interface LearnState {
  phase: 'asking' | 'answered' | 'done';
  /** queue[0] is the current flag */
  queue: string[];
  /** every flag in the round */
  pool: string[];
  streak: Record<string, number>;
  /** learned this round, in order */
  learned: string[];
  misses: Record<string, number>;
  /** answers given this round, right or wrong */
  answered: number;
  /** the last answer, while phase is 'answered' */
  last: { picked: string; target: string; right: boolean } | null;
  startedAt: number;
  endedAt: number | null;
}

export type LearnAction =
  | { type: 'start'; pool: string[]; order: string[]; now: number }
  | { type: 'pick'; id: string }
  | { type: 'continue'; now: number }
  | { type: 'stop'; now: number };

function begin(pool: string[], order: string[], now: number): LearnState {
  const empty = order.length === 0;
  return {
    phase: empty ? 'done' : 'asking',
    queue: [...order],
    pool: [...pool],
    streak: {},
    learned: [],
    misses: {},
    answered: 0,
    last: null,
    startedAt: now,
    endedAt: empty ? now : null,
  };
}

function answer(state: LearnState, picked: string): LearnState {
  const [target, ...rest] = state.queue;
  if (target === undefined) return state;
  const right = picked === target;
  const last = { picked, target, right };
  const answered = state.answered + 1;
  if (!right) {
    const queue = [...rest];
    queue.splice(Math.min(REQUEUE_AFTER, queue.length), 0, target);
    return { ...state, phase: 'answered', queue, streak: { ...state.streak, [target]: 0 }, misses: { ...state.misses, [target]: (state.misses[target] ?? 0) + 1 }, answered, last };
  }
  const streak = (state.streak[target] ?? 0) + 1;
  const learned = streak >= LEARN_STREAK;
  return {
    ...state,
    phase: 'answered',
    queue: learned ? rest : [...rest, target],
    streak: { ...state.streak, [target]: streak },
    learned: learned ? [...state.learned, target] : state.learned,
    answered,
    last,
  };
}

/** `state` is null before the first round; anything but `start` on it leaves an already-finished empty round. */
export function learnReduce(state: LearnState | null, action: LearnAction): LearnState {
  if (action.type === 'start') return begin(action.pool, action.order, action.now);
  if (!state) return begin([], [], 0);
  switch (action.type) {
    case 'pick':
      return state.phase === 'asking' ? answer(state, action.id) : state;
    case 'continue':
      if (state.phase !== 'answered') return state;
      return state.queue.length === 0 ? { ...state, phase: 'done', last: null, endedAt: action.now } : { ...state, phase: 'asking', last: null };
    case 'stop':
      return state.phase === 'done' ? state : { ...state, phase: 'done', endedAt: action.now };
  }
}

/** The round so far for the top bar: answers given, how many were wrong, and the share right (null before the first answer). */
export function learnStats(state: LearnState): { answered: number; wrong: number; percentRight: number | null } {
  const wrong = Object.values(state.misses).reduce((n, m) => n + m, 0);
  const percentRight = state.answered === 0 ? null : Math.round(((state.answered - wrong) / state.answered) * 100);
  return { answered: state.answered, wrong, percentRight };
}

/** Flags missed most this round, most-missed first; ties keep first-miss order. */
export function hardest(state: LearnState, n = 3): string[] {
  return Object.entries(state.misses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

/** A new round: the region's flags not learned yet, or all of them again once every one is (a review round). */
export function roundFor(pool: readonly string[], learned: ReadonlySet<string>): string[] {
  const left = pool.filter((id) => !learned.has(id));
  return left.length > 0 ? left : [...pool];
}
