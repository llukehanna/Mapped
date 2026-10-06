import { describe, expect, it } from 'vitest';
import { shapeStates } from '../../src/ui/shapeStates.ts';

const IDS = ['BRA', 'ARG', 'CHL', 'FRA', 't-greenland'];
const POOL = ['BRA', 'ARG', 'CHL'];

describe('shapeStates', () => {
  it('during setup, highlights the pool and dims the rest', () => {
    expect(shapeStates(IDS, 'setup', POOL, [], [], null)).toEqual({ BRA: 'todo', ARG: 'todo', CHL: 'todo', FRA: 'off', 't-greenland': 'territory' });
  });

  it('while playing, marks found and the newest find', () => {
    const s = shapeStates(IDS, 'playing', POOL, ['BRA', 'ARG'], [], 'ARG');
    expect([s.BRA, s.ARG, s.CHL]).toEqual(['found', 'just', 'todo']);
  });

  it('in review, marks missed', () => {
    const s = shapeStates(IDS, 'review', POOL, ['BRA'], ['ARG', 'CHL'], null);
    expect([s.BRA, s.ARG, s.CHL]).toEqual(['found', 'missed', 'missed']);
  });
});
