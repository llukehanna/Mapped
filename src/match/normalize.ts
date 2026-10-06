// Words that never distinguish one country from another, so players may type or skip them.
const FILLER = new Set(['the', 'and', 'of']);

/**
 * Reduce a name to a comparison key: no accents, case, punctuation, spaces or
 * filler words, with "st" spelled "saint". "St. Kitts & Nevis" -> "saintkittsnevis".
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !FILLER.has(t))
    .map((t) => (t === 'st' ? 'saint' : t))
    .join('');
}
