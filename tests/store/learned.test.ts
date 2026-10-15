import { describe, expect, it } from 'vitest';
import { addLearned, LEARNED_KEY, readLearned, resetLearned } from '../../src/store/learned.ts';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('learned flags', () => {
  it('uses the documented key', () => {
    expect(LEARNED_KEY).toBe('mapped:learn:v1:flags');
  });

  it('starts empty, then accumulates without duplicates', () => {
    const s = memoryStorage();
    expect(readLearned(s).size).toBe(0);
    addLearned(s, ['FRA', 'DEU']);
    addLearned(s, ['DEU', 'ITA']);
    expect([...readLearned(s)].sort()).toEqual(['DEU', 'FRA', 'ITA']);
    expect(JSON.parse(s.getItem(LEARNED_KEY)!)).toHaveLength(3);
  });

  it('reset removes only the given ids', () => {
    const s = memoryStorage();
    addLearned(s, ['FRA', 'DEU', 'JPN']);
    resetLearned(s, ['FRA', 'DEU', 'XXX']);
    expect([...readLearned(s)]).toEqual(['JPN']);
  });

  it('treats a corrupt value as empty and recovers on the next add', () => {
    const s = memoryStorage();
    for (const bad of ['{"a":1}', '"text"', '7', 'null', '{oops']) {
      s.setItem(LEARNED_KEY, bad);
      expect(readLearned(s).size).toBe(0);
    }
    s.setItem(LEARNED_KEY, '["FRA", 3, null, "DEU"]');
    expect([...readLearned(s)]).toEqual(['FRA', 'DEU']);
    s.setItem(LEARNED_KEY, '{oops');
    addLearned(s, ['ITA']);
    expect([...readLearned(s)]).toEqual(['ITA']);
  });

  it('is a no-op when storage is blocked', () => {
    expect(readLearned(null).size).toBe(0);
    expect(() => addLearned(null, ['FRA'])).not.toThrow();
    expect(() => resetLearned(null, ['FRA'])).not.toThrow();
  });
});
