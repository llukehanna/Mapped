import { describe, expect, it } from 'vitest';
import { emailKey, hasImported, markImported } from '../../src/store/imported.ts';

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

describe('imported accounts', () => {
  it('hashes the lowercased email to SHA-256 hex', async () => {
    expect(await emailKey('Ana@Example.com')).toBe(await emailKey('ana@example.com'));
    expect(await emailKey('ana@example.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(await emailKey('ana@example.com')).not.toBe(await emailKey('bo@example.com'));
    // sha256("abc"), to pin the algorithm.
    expect(await emailKey('ABC')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('remembers accounts without storing their email', async () => {
    const s = memoryStorage();
    const ana = await emailKey('ana@example.com');
    expect(hasImported(s, ana)).toBe(false);
    markImported(s, ana);
    markImported(s, await emailKey('bo@example.com'));
    expect(hasImported(s, ana)).toBe(true);
    expect(s.getItem('mapped:imported:v1')).not.toContain('ana');
  });

  it('treats a corrupt value as empty', () => {
    const s = memoryStorage();
    for (const bad of ['{"a":1}', '"text"', '7', 'null', '{oops']) {
      s.setItem('mapped:imported:v1', bad);
      expect(hasImported(s, 'x')).toBe(false);
      markImported(s, 'x');
      expect(hasImported(s, 'x')).toBe(true);
    }
    expect(hasImported(null, 'x')).toBe(false);
  });
});
