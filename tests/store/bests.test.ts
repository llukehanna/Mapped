import { describe, expect, it } from 'vitest';
import { bestKey, isBetter, readBest, recordResult, type Result } from '../../src/store/bests.ts';
import { readTheme, writeTheme } from '../../src/store/theme.ts';
import type { GameConfig } from '../../src/game/types.ts';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

class BrokenStorage extends MemoryStorage {
  getItem(): string | null { throw new Error('blocked'); }
  setItem(): void { throw new Error('blocked'); }
}

const config: GameConfig = { mode: 'type', scope: { continents: ['europe', 'africa'], subregions: [] }, timeLimitSec: null };
const r = (found: number, ms: number, hints = 0): Result => ({ found, total: 98, ms, hints, at: 1 });

describe('bests', () => {
  it('keys by mode, sorted scope and limit', () => {
    expect(bestKey(config)).toBe('mapped:best:v1:type:africa,europe:none');
    expect(bestKey({ ...config, mode: 'locate', timeLimitSec: 600 })).toBe('mapped:best:v1:locate:africa,europe:600');
  });

  it('ranks by found, then time, then hints', () => {
    expect(isBetter(r(90, 999_999), r(89, 1))).toBe(true);
    expect(isBetter(r(90, 500), r(90, 600))).toBe(true);
    expect(isBetter(r(90, 500, 1), r(90, 500, 2))).toBe(true);
    expect(isBetter(r(90, 500, 2), r(90, 500, 2))).toBe(false);
    expect(isBetter(r(1, 1), null)).toBe(true);
  });

  it('records only improvements', () => {
    const s = new MemoryStorage();
    expect(recordResult(s, config, r(80, 700_000))).toBe(true);
    expect(recordResult(s, config, r(79, 100))).toBe(false);
    expect(recordResult(s, config, r(80, 600_000))).toBe(true);
    expect(readBest(s, config)).toEqual(r(80, 600_000));
  });

  it('works without storage and survives storage that throws', () => {
    expect(readBest(null, config)).toBeNull();
    expect(recordResult(null, config, r(1, 1))).toBe(true);
    expect(readBest(new BrokenStorage(), config)).toBeNull();
    expect(() => recordResult(new BrokenStorage(), config, r(1, 1))).not.toThrow();
  });
});

describe('theme', () => {
  it('defaults to dark and remembers light', () => {
    const s = new MemoryStorage();
    expect(readTheme(s)).toBe('dark');
    writeTheme(s, 'light');
    expect(readTheme(s)).toBe('light');
    expect(readTheme(new BrokenStorage())).toBe('dark');
  });
});
