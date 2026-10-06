import { describe, expect, it } from 'vitest';
import { formatClock, formatCountdown } from '../../src/game/format.ts';

describe('clock formatting', () => {
  it.each([[0, '0:00'], [462_000, '7:42'], [462_999, '7:42'], [3_723_000, '1:02:03']])('%i ms -> %s', (ms, s) => expect(formatClock(ms)).toBe(s));
  it('countdown rounds up so the last second shows 0:01', () => {
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-50)).toBe('0:00');
  });
});
