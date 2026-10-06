import type { TerritoryDef } from './types.ts';

// [name, note, aliases, geo?]. `geo` defaults to `name`; null = no shape, name-only note.
type Row = [string, string, string[], (string | null)?];

const ROWS: Row[] = [
  // Shapes in countries-50m that are not one of the 197
  ['Greenland', 'Territory of Denmark', []],
  ['Faroe Islands', 'Territory of Denmark', ['Faroes'], 'Faeroe Is.'],
  ['Åland', 'Autonomous region of Finland', ['Aland Islands']],
  ['Western Sahara', 'Disputed territory, mostly administered by Morocco', [], 'W. Sahara'],
  ['Puerto Rico', 'Territory of the United States', []],
  ['U.S. Virgin Islands', 'Territory of the United States', [], 'U.S. Virgin Is.'],
  ['Guam', 'Territory of the United States', []],
  ['Northern Mariana Islands', 'Territory of the United States', [], 'N. Mariana Is.'],
  ['American Samoa', 'Territory of the United States', []],
  ['Falkland Islands', 'Territory of the United Kingdom', ['Falklands', 'Malvinas'], 'Falkland Is.'],
  ['South Georgia', 'Territory of the United Kingdom', [], 'S. Geo. and the Is.'],
  ['British Indian Ocean Territory', 'Territory of the United Kingdom', ['Chagos Islands'], 'Br. Indian Ocean Ter.'],
  ['Saint Helena', 'Territory of the United Kingdom', []],
  ['Pitcairn Islands', 'Territory of the United Kingdom', [], 'Pitcairn Is.'],
  ['Anguilla', 'Territory of the United Kingdom', []],
  ['Cayman Islands', 'Territory of the United Kingdom', [], 'Cayman Is.'],
  ['Bermuda', 'Territory of the United Kingdom', []],
  ['British Virgin Islands', 'Territory of the United Kingdom', [], 'British Virgin Is.'],
  ['Turks and Caicos', 'Territory of the United Kingdom', [], 'Turks and Caicos Is.'],
  ['Montserrat', 'Territory of the United Kingdom', []],
  ['Jersey', 'British Crown Dependency', []],
  ['Guernsey', 'British Crown Dependency', []],
  ['Isle of Man', 'British Crown Dependency', []],
  ['Aruba', 'Part of the Kingdom of the Netherlands', []],
  ['Curaçao', 'Part of the Kingdom of the Netherlands', []],
  ['Sint Maarten', 'Part of the Kingdom of the Netherlands', []],
  ['Saint Pierre and Miquelon', 'Territory of France', [], 'St. Pierre and Miquelon'],
  ['Wallis and Futuna', 'Territory of France', [], 'Wallis and Futuna Is.'],
  ['Saint Martin', 'Territory of France', [], 'St-Martin'],
  ['Saint Barthélemy', 'Territory of France', ['Saint Barts'], 'St-Barthélemy'],
  ['French Polynesia', 'Territory of France', ['Tahiti'], 'Fr. Polynesia'],
  ['New Caledonia', 'Territory of France', []],
  ['French Southern Lands', 'Territory of France', [], 'Fr. S. Antarctic Lands'],
  ['Niue', 'Self-governing in free association with New Zealand', []],
  ['Cook Islands', 'Self-governing in free association with New Zealand', [], 'Cook Is.'],
  ['Hong Kong', 'Special administrative region of China', []],
  ['Macau', 'Special administrative region of China', ['Macao'], 'Macao'],
  ['Christmas Island', 'Territory of Australia', ['Cocos Islands'], 'Indian Ocean Ter.'],
  ['Heard Island', 'Territory of Australia', [], 'Heard I. and McDonald Is.'],
  ['Norfolk Island', 'Territory of Australia', []],
  ['Ashmore and Cartier Islands', 'Territory of Australia', [], 'Ashmore and Cartier Is.'],
  // Names people type that are not countries and have no separate shape
  ['Antarctica', 'A continent, not a country', [], null],
  ['England', 'Part of the United Kingdom', [], null],
  ['Scotland', 'Part of the United Kingdom', [], null],
  ['Wales', 'Part of the United Kingdom', [], null],
  ['Northern Ireland', 'Part of the United Kingdom', [], null],
  ['French Guiana', 'Part of France', [], null],
  ['Guadeloupe', 'Part of France', [], null],
  ['Martinique', 'Part of France', [], null],
  ['Réunion', 'Part of France', [], null],
  ['Mayotte', 'Part of France', [], null],
  ['Somaliland', 'Self-declared state, recognized as part of Somalia', [], null],
  ['Northern Cyprus', 'Recognized only by Turkey; counted as part of Cyprus', [], null],
  ['Tibet', 'Part of China', [], null],
  ['Hawaii', 'A U.S. state', [], null],
  ['Alaska', 'A U.S. state', [], null],
];

const slug = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const TERRITORIES: TerritoryDef[] = ROWS.map(([name, note, aliases, geo]) => ({
  id: 't-' + slug(name),
  name,
  note,
  aliases,
  geo: geo === undefined ? name : geo,
}));
