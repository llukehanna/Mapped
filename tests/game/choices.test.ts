import { describe, expect, it } from 'vitest';
import { removedChoices } from '../../src/game/choices.ts';

describe('removedChoices', () => {
  const choices = ['A', 'KEN', 'B', 'C'];
  it('removes nothing without hints', () => expect(removedChoices(choices, 'KEN', [], 0)).toEqual([]));
  it('removes wrong choices in the order shown, never the target', () => {
    expect(removedChoices(choices, 'KEN', [], 1)).toEqual(['A']);
    expect(removedChoices(choices, 'KEN', [], 2)).toEqual(['A', 'B']);
  });
  it('skips choices already picked wrongly', () => expect(removedChoices(choices, 'KEN', ['A'], 2)).toEqual(['B', 'C']));
  it('never takes more than the wrong choices left', () => expect(removedChoices(choices, 'KEN', ['A', 'B'], 2)).toEqual(['C']));
});
