import { describe, expect, it } from 'vitest';
import { shapeStates } from '../../src/ui/shapeStates.ts';

const IDS = ['BRA', 'ARG', 'CHL', 'FRA', 't-greenland', 't-french-guiana-shape'];
const OWNERS = new Map([['t-french-guiana-shape', 'BRA']]);
const POOL = ['BRA', 'ARG', 'CHL'];

describe('shapeStates', () => {
  it('during setup, highlights the pool and dims the rest', () => {
    expect(shapeStates(IDS, 'setup', POOL, [], [], null, OWNERS)).toEqual({
      BRA: 'todo', ARG: 'todo', CHL: 'todo', FRA: 'off', 't-greenland': 'territory', 't-french-guiana-shape': 'todo',
    });
  });

  it('while playing, marks found and the newest find', () => {
    const s = shapeStates(IDS, 'playing', POOL, ['BRA', 'ARG'], [], 'ARG');
    expect([s.BRA, s.ARG, s.CHL]).toEqual(['found', 'just', 'todo']);
  });

  it('territories take on their owner\'s state: found, glowing and missed together', () => {
    expect(shapeStates(IDS, 'playing', POOL, ['BRA'], [], 'BRA', OWNERS)['t-french-guiana-shape']).toBe('just');
    expect(shapeStates(IDS, 'playing', POOL, ['BRA'], [], null, OWNERS)['t-french-guiana-shape']).toBe('found');
    expect(shapeStates(IDS, 'review', POOL, [], ['BRA'], null, OWNERS)['t-french-guiana-shape']).toBe('missed');
  });

  it('in review, marks missed', () => {
    const s = shapeStates(IDS, 'review', POOL, ['BRA'], ['ARG', 'CHL'], null);
    expect([s.BRA, s.ARG, s.CHL]).toEqual(['found', 'missed', 'missed']);
  });
});
