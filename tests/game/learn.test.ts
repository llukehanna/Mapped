import { describe, expect, it } from 'vitest';
import { hardest, LEARN_STREAK, learnReduce, learnStats, REQUEUE_AFTER, roundFor } from '../../src/game/learn.ts';
import type { LearnState } from '../../src/game/learn.ts';

const POOL = ['A', 'B', 'C', 'D', 'E'];
const start = (order = POOL, now = 1000): LearnState => learnReduce(null, { type: 'start', pool: POOL, order, now });
const cur = (s: LearnState) => s.queue[0]!;
const right = (s: LearnState) => learnReduce(s, { type: 'pick', id: cur(s) });
const wrong = (s: LearnState) => learnReduce(s, { type: 'pick', id: cur(s) === 'Z' ? 'Y' : 'Z' });
const next = (s: LearnState, now = 2000) => learnReduce(s, { type: 'continue', now });

describe('learn drill', () => {
  it('starts asking with the shuffled order as the queue', () => {
    const s = start(['C', 'A', 'B', 'D', 'E']);
    expect(s).toMatchObject({ phase: 'asking', queue: ['C', 'A', 'B', 'D', 'E'], pool: POOL, learned: [], misses: {}, last: null, startedAt: 1000, endedAt: null });
    expect(LEARN_STREAK).toBe(2);
    expect(REQUEUE_AFTER).toBe(3);
  });

  it('a right answer sends the flag to the back and records the answer', () => {
    const s = right(start());
    expect(s.phase).toBe('answered');
    expect(s.queue).toEqual(['B', 'C', 'D', 'E', 'A']);
    expect(s.streak).toEqual({ A: 1 });
    expect(s.last).toEqual({ picked: 'A', target: 'A', right: true });
  });

  it('two rights in a row learn the flag and drop it from the round', () => {
    let s = start(['A', 'B']);
    s = next(right(s)); // A 1, queue B A
    s = next(right(s)); // B 1, queue A B
    s = next(right(s)); // A 2 -> learned
    expect(s.learned).toEqual(['A']);
    expect(s.queue).toEqual(['B']);
    expect(s.streak.A).toBe(2);
    expect(s.phase).toBe('asking');
  });

  it('a wrong answer requeues the flag three cards later and counts a miss', () => {
    const s = wrong(start());
    expect(s.phase).toBe('answered');
    expect(s.queue).toEqual(['B', 'C', 'D', 'A', 'E']);
    expect(s.misses).toEqual({ A: 1 });
    expect(s.streak.A).toBe(0);
    expect(s.last).toEqual({ picked: 'Z', target: 'A', right: false });
  });

  it('requeues at the end when fewer than three cards remain', () => {
    expect(wrong(start(['A', 'B', 'C'])).queue).toEqual(['B', 'C', 'A']);
    expect(wrong(start(['A', 'B'])).queue).toEqual(['B', 'A']);
    expect(wrong(start(['A'])).queue).toEqual(['A']);
  });

  it('a wrong answer resets the streak: right, wrong, right is not learned', () => {
    let s = start(['A']);
    s = next(right(s));
    s = next(wrong(s));
    s = next(right(s));
    expect(s.learned).toEqual([]);
    expect(s.queue).toEqual(['A']);
    expect(s.streak.A).toBe(1);
    s = next(right(s));
    expect(s.learned).toEqual(['A']);
  });

  it('is done after continuing past the last learned flag', () => {
    let s = start(['A']);
    s = next(right(s));
    s = right(s);
    expect(s.phase).toBe('answered');
    expect(s.queue).toEqual([]);
    s = next(s, 9000);
    expect(s).toMatchObject({ phase: 'done', endedAt: 9000, learned: ['A'] });
  });

  it('stop ends the round from any phase', () => {
    expect(learnReduce(start(), { type: 'stop', now: 5000 })).toMatchObject({ phase: 'done', endedAt: 5000 });
    expect(learnReduce(right(start()), { type: 'stop', now: 6000 })).toMatchObject({ phase: 'done', endedAt: 6000 });
  });

  it('ignores pick unless asking, and continue unless answered', () => {
    const answered = right(start());
    expect(learnReduce(answered, { type: 'pick', id: 'B' })).toBe(answered);
    const asking = start();
    expect(learnReduce(asking, { type: 'continue', now: 2000 })).toBe(asking);
    const done = learnReduce(asking, { type: 'stop', now: 3000 });
    expect(learnReduce(done, { type: 'pick', id: 'A' })).toBe(done);
    expect(learnReduce(done, { type: 'stop', now: 4000 })).toBe(done);
  });

  it('does not mutate the previous state', () => {
    const s = start();
    const frozen = JSON.stringify(s);
    wrong(s);
    right(s);
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('an empty round is done immediately', () => {
    expect(start([], 1000)).toMatchObject({ phase: 'done', endedAt: 1000 });
  });
});

describe('learnStats', () => {
  it('no answers yet: no percentage', () => {
    expect(learnStats(start())).toEqual({ answered: 0, wrong: 0, percentRight: null });
  });

  it('counts every answer and every wrong one, and rounds the percentage', () => {
    const s = next(right(next(wrong(next(right(start()))))));
    expect(learnStats(s)).toEqual({ answered: 3, wrong: 1, percentRight: 67 });
  });
});

describe('hardest', () => {
  it('ranks the most-missed first, ties by first miss, default 3', () => {
    let s = start(['A', 'B', 'C', 'D', 'E']);
    s = next(wrong(s)); // A miss
    s = next(wrong(s)); // B miss
    expect(hardest(s)).toEqual(['A', 'B']);
    s = next(wrong(s)); // C miss
    expect(hardest(s)).toEqual(['A', 'B', 'C']);
    while (cur(s) !== 'C') s = next(right(s));
    s = next(wrong(s)); // C second miss
    expect(hardest(s)[0]).toBe('C');
    expect(hardest(s)).toHaveLength(3);
    expect(hardest(s, 1)).toEqual(['C']);
    expect(hardest(start())).toEqual([]);
  });
});

describe('roundFor', () => {
  it('leaves out learned flags, or takes them all once every one is learned', () => {
    expect(roundFor(['A', 'B', 'C'], new Set(['B', 'X']))).toEqual(['A', 'C']);
    expect(roundFor(['A', 'B'], new Set(['A', 'B']))).toEqual(['A', 'B']);
    expect(roundFor(['A', 'B'], new Set())).toEqual(['A', 'B']);
  });
});
