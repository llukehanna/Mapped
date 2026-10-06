/** 462_000 -> "7:42", 3_723_000 -> "1:02:03". Rounds down to whole seconds. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Countdown display rounds up, so "0:01" shows until time is fully gone. */
export function formatCountdown(msLeft: number): string {
  return formatClock(Math.ceil(Math.max(0, msLeft) / 1000) * 1000);
}
