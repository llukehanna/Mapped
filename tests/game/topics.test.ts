import { describe, expect, it } from 'vitest';
import { hintLevels, rulesFor, topicOf } from '../../src/game/topics.ts';

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
    expect(rulesFor({ mode: 'type', topic: 'capitals' })).toEqual({ ordered: false, prompt: null, answer: 'capital' });
    expect(rulesFor({ mode: 'locate', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'capital', answer: 'click' });
    expect(rulesFor({ mode: 'identify', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'map', answer: 'capital' });
  });
  it('a missing topic is countries', () => expect(topicOf({})).toBe('countries'));
  it('hint ladders', () => {
    expect([hintLevels({ mode: 'type' }), hintLevels({ mode: 'locate' }), hintLevels({ mode: 'identify' })]).toEqual([4, 3, 4]);
    expect(hintLevels({ mode: 'type', topic: 'flags' })).toBe(4);
    expect(hintLevels({ mode: 'locate', topic: 'capitals' })).toBe(3);
    expect(hintLevels({ mode: 'identify', topic: 'flags' })).toBe(2);
    expect(hintLevels({ mode: 'type', topic: 'capitals' })).toBe(4);
  });
});
