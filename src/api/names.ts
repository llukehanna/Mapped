/** Display names: 3–20 letters, digits, spaces, - or _, trimmed, no double spaces. Shared by the name card and the Worker. */
export const NAME_RULE = '3–20 letters, numbers, spaces, - or _';

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return /^[A-Za-z0-9 _-]{3,20}$/.test(name) && !name.includes('  ') ? name : null;
}
