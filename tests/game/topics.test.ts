import { describe, expect, it } from 'vitest';
import { hintLevels, isPick, MODE_BLURB, rulesFor, topicOf } from '../../src/game/topics.ts';

describe('topic rules', () => {
  it('countries keeps today’s rules', () => {
    expect(rulesFor({ mode: 'type' })).toEqual({ ordered: false, prompt: null, answer: 'country' });
    expect(rulesFor({ mode: 'locate', topic: 'countries' })).toEqual({ ordered: true, prompt: 'name', answer: 'click' });
    expect(rulesFor({ mode: 'identify' })).toEqual({ ordered: true, prompt: 'map', answer: 'country' });
  });
  it('flags', () => {
    expect(rulesFor({ mode: 'type', topic: 'flags' })).toEqual({ ordered: true, prompt: 'flag', answer: 'country' });
    expect(rulesFor({ mode: 'locate', topic: 'flags' })).toEqual({ ordered: true, prompt: 'flag', answer: 'click' });
    expect(rulesFor({ mode: 'identify', topic: 'flags' })).toEqual({ ordered: true, prompt: 'map', answer: 'flag' });
  });
  it('capitals', () => {
    expect(rulesFor({ mode: 'type', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'country', answer: 'capital' });
    expect(rulesFor({ mode: 'locate', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'capital', answer: 'click' });
    expect(rulesFor({ mode: 'identify', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'country', answer: 'capitalPick' });
  });
  it('a missing topic is countries', () => expect(topicOf({})).toBe('countries'));
  it('hint ladders', () => {
    expect([hintLevels({ mode: 'type' }), hintLevels({ mode: 'locate' }), hintLevels({ mode: 'identify' })]).toEqual([4, 3, 4]);
    expect(hintLevels({ mode: 'type', topic: 'flags' })).toBe(5);
    expect(hintLevels({ mode: 'locate', topic: 'capitals' })).toBe(3);
    expect(hintLevels({ mode: 'identify', topic: 'flags' })).toBe(2);
    expect(hintLevels({ mode: 'type', topic: 'capitals' })).toBe(4);
    expect(hintLevels({ mode: 'identify', topic: 'capitals' })).toBe(2);
  });
});

describe('picks and blurbs', () => {
  it('isPick is true for flag and capitalPick only', () => {
    expect(['country', 'capital', 'click', 'flag', 'capitalPick'].map((a) => isPick(a as never))).toEqual([false, false, false, true, true]);
  });
  it('capitals blurbs name the country', () => {
    expect(MODE_BLURB.capitals).toEqual({
      type: "Type the named country's capital",
      locate: "Click the capital's country",
      identify: "Pick the named country's capital",
    });
  });
});
