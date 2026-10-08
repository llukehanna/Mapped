// Copies the 4:3 flag of every country from flag-icons (MIT) into public/flags/<ID>.svg. Run: npm run build-flags
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES } from '../src/data/countries.ts';

/** alpha-3 → flag-icons file name (ISO 3166-1 alpha-2, lower case; Kosovo is xk). */
const ALPHA2: Record<string, string> = {
  // Africa
  DZA: 'dz', EGY: 'eg', LBY: 'ly', MAR: 'ma', SDN: 'sd', TUN: 'tn', BEN: 'bj', BFA: 'bf', CPV: 'cv', CIV: 'ci',
  GMB: 'gm', GHA: 'gh', GIN: 'gn', GNB: 'gw', LBR: 'lr', MLI: 'ml', MRT: 'mr', NER: 'ne', NGA: 'ng', SEN: 'sn',
  SLE: 'sl', TGO: 'tg', AGO: 'ao', CMR: 'cm', CAF: 'cf', TCD: 'td', COG: 'cg', COD: 'cd', GNQ: 'gq', GAB: 'ga',
  STP: 'st', BDI: 'bi', COM: 'km', DJI: 'dj', ERI: 'er', ETH: 'et', KEN: 'ke', MDG: 'mg', MWI: 'mw', MUS: 'mu',
  MOZ: 'mz', RWA: 'rw', SYC: 'sc', SOM: 'so', SSD: 'ss', TZA: 'tz', UGA: 'ug', ZMB: 'zm', ZWE: 'zw', BWA: 'bw',
  SWZ: 'sz', LSO: 'ls', NAM: 'na', ZAF: 'za',
  // Asia
  BHR: 'bh', CYP: 'cy', IRN: 'ir', IRQ: 'iq', ISR: 'il', JOR: 'jo', KWT: 'kw', LBN: 'lb', OMN: 'om', PSE: 'ps',
  QAT: 'qa', SAU: 'sa', SYR: 'sy', TUR: 'tr', ARE: 'ae', YEM: 'ye', ARM: 'am', AZE: 'az', GEO: 'ge', KAZ: 'kz',
  KGZ: 'kg', TJK: 'tj', TKM: 'tm', UZB: 'uz', AFG: 'af', BGD: 'bd', BTN: 'bt', IND: 'in', MDV: 'mv', NPL: 'np',
  PAK: 'pk', LKA: 'lk', CHN: 'cn', JPN: 'jp', MNG: 'mn', PRK: 'kp', KOR: 'kr', TWN: 'tw', BRN: 'bn', KHM: 'kh',
  IDN: 'id', LAO: 'la', MYS: 'my', MMR: 'mm', PHL: 'ph', SGP: 'sg', THA: 'th', TLS: 'tl', VNM: 'vn',
  // Europe
  DNK: 'dk', EST: 'ee', FIN: 'fi', ISL: 'is', IRL: 'ie', LVA: 'lv', LTU: 'lt', NOR: 'no', SWE: 'se', GBR: 'gb',
  AUT: 'at', BEL: 'be', FRA: 'fr', DEU: 'de', LIE: 'li', LUX: 'lu', MCO: 'mc', NLD: 'nl', CHE: 'ch', AND: 'ad',
  GRC: 'gr', ITA: 'it', MLT: 'mt', PRT: 'pt', SMR: 'sm', ESP: 'es', VAT: 'va', ALB: 'al', BIH: 'ba', BGR: 'bg',
  HRV: 'hr', XKX: 'xk', MNE: 'me', MKD: 'mk', SRB: 'rs', SVN: 'si', BLR: 'by', CZE: 'cz', HUN: 'hu', MDA: 'md',
  POL: 'pl', ROU: 'ro', RUS: 'ru', SVK: 'sk', UKR: 'ua',
  // North America
  CAN: 'ca', MEX: 'mx', USA: 'us', BLZ: 'bz', CRI: 'cr', SLV: 'sv', GTM: 'gt', HND: 'hn', NIC: 'ni', PAN: 'pa',
  ATG: 'ag', BHS: 'bs', BRB: 'bb', CUB: 'cu', DMA: 'dm', DOM: 'do', GRD: 'gd', HTI: 'ht', JAM: 'jm', KNA: 'kn',
  LCA: 'lc', VCT: 'vc', TTO: 'tt',
  // South America
  ARG: 'ar', BOL: 'bo', BRA: 'br', CHL: 'cl', COL: 'co', ECU: 'ec', GUY: 'gy', PRY: 'py', PER: 'pe', SUR: 'sr',
  URY: 'uy', VEN: 've',
  // Oceania
  AUS: 'au', NZL: 'nz', FJI: 'fj', PNG: 'pg', SLB: 'sb', VUT: 'vu', KIR: 'ki', MHL: 'mh', FSM: 'fm', NRU: 'nr',
  PLW: 'pw', WSM: 'ws', TON: 'to', TUV: 'tv',
};

mkdirSync('public/flags', { recursive: true });
const missing: string[] = [];
for (const c of COUNTRIES) {
  const a2 = ALPHA2[c.id];
  if (!a2) {
    missing.push(c.id);
    continue;
  }
  const svg = readFileSync(`node_modules/flag-icons/flags/4x3/${a2}.svg`, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
  writeFileSync(`public/flags/${c.id}.svg`, svg + '\n');
}
if (missing.length) throw new Error(`No alpha-2 code for: ${missing.join(', ')}`);
console.log(`Wrote ${COUNTRIES.length} flags`);
