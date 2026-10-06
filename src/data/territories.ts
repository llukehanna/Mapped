import type { TerritoryDef } from './types.ts';

// [name, note, sovereign, aliases, geo?]. `sovereign` is the country whose color the shape takes on the map
// (found, missed and highlighted with it); null keeps it neutral. `geo` defaults to `name`; null = no shape, name-only note.
type Row = [string, string, string | null, string[], (string | null)?];

const ROWS: Row[] = [
  // Shapes in countries-50m that are not one of the 197
  ['Greenland', 'Territory of Denmark', 'DNK', []],
  ['Faroe Islands', 'Territory of Denmark', 'DNK', ['Faroes'], 'Faeroe Is.'],
  ['Åland', 'Autonomous region of Finland', 'FIN', ['Aland Islands']],
  ['Western Sahara', 'Disputed territory, mostly administered by Morocco', null, [], 'W. Sahara'],
  ['Puerto Rico', 'Territory of the United States', 'USA', []],
  ['U.S. Virgin Islands', 'Territory of the United States', 'USA', [], 'U.S. Virgin Is.'],
  ['Guam', 'Territory of the United States', 'USA', []],
  ['Northern Mariana Islands', 'Territory of the United States', 'USA', [], 'N. Mariana Is.'],
  ['American Samoa', 'Territory of the United States', 'USA', []],
  ['Falkland Islands', 'Territory of the United Kingdom', 'GBR', ['Falklands', 'Malvinas'], 'Falkland Is.'],
  ['South Georgia', 'Territory of the United Kingdom', 'GBR', [], 'S. Geo. and the Is.'],
  ['British Indian Ocean Territory', 'Territory of the United Kingdom', 'GBR', ['Chagos Islands'], 'Br. Indian Ocean Ter.'],
  ['Saint Helena', 'Territory of the United Kingdom', 'GBR', []],
  ['Pitcairn Islands', 'Territory of the United Kingdom', 'GBR', [], 'Pitcairn Is.'],
  ['Anguilla', 'Territory of the United Kingdom', 'GBR', []],
  ['Cayman Islands', 'Territory of the United Kingdom', 'GBR', [], 'Cayman Is.'],
  ['Bermuda', 'Territory of the United Kingdom', 'GBR', []],
  ['British Virgin Islands', 'Territory of the United Kingdom', 'GBR', [], 'British Virgin Is.'],
  ['Turks and Caicos', 'Territory of the United Kingdom', 'GBR', [], 'Turks and Caicos Is.'],
  ['Montserrat', 'Territory of the United Kingdom', 'GBR', []],
  ['Jersey', 'British Crown Dependency', 'GBR', []],
  ['Guernsey', 'British Crown Dependency', 'GBR', []],
  ['Isle of Man', 'British Crown Dependency', 'GBR', []],
  ['Aruba', 'Part of the Kingdom of the Netherlands', 'NLD', []],
  ['Curaçao', 'Part of the Kingdom of the Netherlands', 'NLD', []],
  ['Sint Maarten', 'Part of the Kingdom of the Netherlands', 'NLD', []],
  ['Saint Pierre and Miquelon', 'Territory of France', 'FRA', [], 'St. Pierre and Miquelon'],
  ['Wallis and Futuna', 'Territory of France', 'FRA', [], 'Wallis and Futuna Is.'],
  ['Saint Martin', 'Territory of France', 'FRA', [], 'St-Martin'],
  ['Saint Barthélemy', 'Territory of France', 'FRA', ['Saint Barts'], 'St-Barthélemy'],
  ['French Polynesia', 'Territory of France', 'FRA', ['Tahiti'], 'Fr. Polynesia'],
  ['New Caledonia', 'Territory of France', 'FRA', []],
  ['French Southern Lands', 'Territory of France', 'FRA', [], 'Fr. S. Antarctic Lands'],
  ['Niue', 'Self-governing in free association with New Zealand', 'NZL', []],
  ['Cook Islands', 'Self-governing in free association with New Zealand', 'NZL', [], 'Cook Is.'],
  ['Hong Kong', 'Special administrative region of China', 'CHN', []],
  ['Macau', 'Special administrative region of China', 'CHN', ['Macao'], 'Macao'],
  ['Christmas Island', 'Territory of Australia', 'AUS', ['Cocos Islands'], 'Indian Ocean Ter.'],
  ['Heard Island', 'Territory of Australia', 'AUS', [], 'Heard I. and McDonald Is.'],
  ['Norfolk Island', 'Territory of Australia', 'AUS', []],
  ['Ashmore and Cartier Islands', 'Territory of Australia', 'AUS', [], 'Ashmore and Cartier Is.'],
  // Names people type that are not countries and have no separate shape
  ['Antarctica', 'A continent, not a country', null, [], null],
  ['England', 'Part of the United Kingdom', null, [], null],
  ['Scotland', 'Part of the United Kingdom', null, [], null],
  ['Wales', 'Part of the United Kingdom', null, [], null],
  ['Northern Ireland', 'Part of the United Kingdom', null, [], null],
  ['French Guiana', 'Part of France', null, [], null],
  ['Guadeloupe', 'Part of France', null, [], null],
  ['Martinique', 'Part of France', null, [], null],
  ['Réunion', 'Part of France', null, [], null],
  ['Mayotte', 'Part of France', null, [], null],
  ['Somaliland', 'Self-declared state, recognized as part of Somalia', null, [], null],
  ['Northern Cyprus', 'Recognized only by Turkey; counted as part of Cyprus', null, [], null],
  ['Tibet', 'Part of China', null, [], null],
  ['Hawaii', 'A U.S. state', null, [], null],
  ['Alaska', 'A U.S. state', null, [], null],
];

const slug = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const TERRITORIES: TerritoryDef[] = ROWS.map(([name, note, sovereign, aliases, geo]) => ({
  id: 't-' + slug(name),
  name,
  note,
  sovereign,
  aliases,
  geo: geo === undefined ? name : geo,
}));
