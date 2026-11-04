// The Seas topic: 55 oceans and seas (the answers), and every other Natural Earth marine feature as non-game water
// (gulfs, bays, straits...: drawn hatched, named in a note when typed). Shapes come from scripts/build-seas.ts.

export type Basin = 'atlantic' | 'mediterranean' | 'pacific' | 'indian' | 'arctic' | 'southern' | 'inland';

export const BASINS: { id: Basin; label: string; place: string }[] = [
  { id: 'atlantic', label: 'Atlantic', place: 'the Atlantic' },
  { id: 'mediterranean', label: 'Mediterranean', place: 'the Mediterranean' },
  { id: 'pacific', label: 'Pacific', place: 'the Pacific' },
  { id: 'indian', label: 'Indian', place: 'the Indian Ocean' },
  { id: 'arctic', label: 'Arctic', place: 'the Arctic' },
  { id: 'southern', label: 'Southern', place: 'the Southern Ocean' },
  { id: 'inland', label: 'Inland', place: '—' },
];

export interface SeaDef {
  id: string;        // lowercase, at most 8 letters, so it can never collide with an ISO-3 country id
  name: string;
  basin: Basin;
  aliases: string[]; // beyond the short name ("Pacific"), which matching adds by itself
  ne: string[];      // Natural Earth feature names merged into this answer
}

// [id, name, aliases, ne?]. `ne` defaults to [name].
type Row = [string, string, string[], string[]?];

const ROWS: Record<Basin, Row[]> = {
  atlantic: [
    ['atl', 'Atlantic Ocean', [], ['North Atlantic Ocean', 'South Atlantic Ocean']],
    ['carib', 'Caribbean Sea', []],
    ['sargasso', 'Sargasso Sea', []],
    ['north', 'North Sea', []],
    ['baltic', 'Baltic Sea', []],
    ['irish', 'Irish Sea', []],
    ['labrador', 'Labrador Sea', []],
  ],
  mediterranean: [
    ['med', 'Mediterranean Sea', ['Med']],
    ['adriatic', 'Adriatic Sea', []],
    ['aegean', 'Aegean Sea', []],
    ['ionian', 'Ionian Sea', []],
    ['tyrrhen', 'Tyrrhenian Sea', []],
    ['balearic', 'Balearic Sea', []],
    ['black', 'Black Sea', []],
  ],
  pacific: [
    ['pac', 'Pacific Ocean', [], ['North Pacific Ocean', 'South Pacific Ocean']],
    ['bering', 'Bering Sea', []],
    ['okhotsk', 'Sea of Okhotsk', ['Okhotsk Sea']],
    ['japan', 'Sea of Japan', ['East Sea', 'Japan Sea']],
    ['yellow', 'Yellow Sea', []],
    ['bohai', 'Bo Hai', ['Bohai Sea', 'Bohai']],
    ['ecs', 'East China Sea', []],
    ['scs', 'South China Sea', []],
    ['philip', 'Philippine Sea', []],
    ['sulu', 'Sulu Sea', []],
    ['celebes', 'Celebes Sea', ['Sulawesi Sea']],
    ['molucca', 'Molucca Sea', ['Maluku Sea']],
    ['ceram', 'Ceram Sea', ['Seram Sea']],
    ['banda', 'Banda Sea', []],
    ['java', 'Java Sea', []],
    ['bismarck', 'Bismarck Sea', []],
    ['solomon', 'Solomon Sea', []],
    ['coral', 'Coral Sea', []],
    ['tasman', 'Tasman Sea', []],
    ['arafura', 'Arafura Sea', []],
  ],
  indian: [
    ['ind', 'Indian Ocean', [], ['INDIAN OCEAN']],
    ['arabian', 'Arabian Sea', []],
    ['red', 'Red Sea', []],
    ['andaman', 'Andaman Sea', []],
    ['laccad', 'Laccadive Sea', ['Lakshadweep Sea']],
    ['timor', 'Timor Sea', []],
  ],
  arctic: [
    ['arc', 'Arctic Ocean', []],
    ['barents', 'Barents Sea', []],
    ['kara', 'Kara Sea', []],
    ['laptev', 'Laptev Sea', []],
    ['chukchi', 'Chukchi Sea', []],
    ['beaufort', 'Beaufort Sea', []],
    ['greenl', 'Greenland Sea', []],
    ['norweg', 'Norwegian Sea', []],
    ['white', 'White Sea', []],
  ],
  // The Southern Ocean is rebuilt by the build script as everything south of 60°S; its `ne` is NE's own strip.
  southern: [
    ['sou', 'Southern Ocean', ['Antarctic Ocean'], ['SOUTHERN OCEAN']],
    ['weddell', 'Weddell Sea', []],
    ['ross', 'Ross Sea', []],
    ['amundsen', 'Amundsen Sea', []],
    ['belling', 'Bellingshausen Sea', []],
  ],
  inland: [['caspian', 'Caspian Sea', []]],
};

export const SEAS: SeaDef[] = BASINS.flatMap(({ id: basin }) =>
  ROWS[basin].map(([id, name, aliases, ne]) => ({ id, name, basin, aliases, ne: ne ?? [name] })),
);

export const OCEANS: ReadonlySet<string> = new Set(['atl', 'pac', 'ind', 'arc', 'sou']);

export type WaterKind = 'gulf' | 'bay' | 'strait' | 'channel' | 'sound' | 'river' | 'sea';

export interface WaterDef {
  id: string;  // 'w-' + slug of the name
  name: string; // display name, cleaned up from Natural Earth's
  kind: WaterKind;
  ne: string;  // Natural Earth feature name
}

// [ne, kind (Natural Earth's featurecla), display name?]. The three seas dropped from the list are kind 'sea'.
const WATER_ROWS: [string, WaterKind, string?][] = [
  ['Amazon River', 'river'],
  ['Amundsen Gulf', 'gulf'],
  ['Baffin Bay', 'bay'],
  ['Bahía de Campeche', 'bay', 'Bay of Campeche'],
  ['Bay of Bengal', 'bay'],
  ['Bay of Biscay', 'bay'],
  ['Bay of Fundy', 'bay'],
  ['Bay of Plenty', 'bay'],
  ['Bristol Bay', 'bay'],
  ['Bristol Channel', 'channel'],
  ['Chesapeake Bay', 'bay'],
  ['Columbia River', 'river'],
  ['Cook Inlet', 'bay'],
  ['Davis Strait', 'strait'],
  ['Drake Passage', 'channel'],
  ['English Channel', 'channel'],
  ['Golfe du Lion', 'gulf', 'Gulf of Lion'],
  ['Golfo San Jorge', 'gulf', 'San Jorge Gulf'],
  ['Golfo de California', 'gulf', 'Gulf of California'],
  ['Golfo de Panamá', 'gulf', 'Gulf of Panama'],
  ['Great Australian Bight', 'gulf'],
  ['Gulf of Aden', 'gulf'],
  ['Gulf of Alaska', 'gulf'],
  ['Gulf of Bothnia', 'gulf'],
  ['Gulf of Carpentaria', 'gulf'],
  ['Gulf of Finland', 'gulf'],
  ['Gulf of Guinea', 'gulf'],
  ['Gulf of Honduras', 'gulf'],
  ['Gulf of Kutch', 'gulf'],
  ['Gulf of Maine', 'gulf'],
  ['Gulf of Mannar', 'gulf'],
  ['Gulf of Mexico', 'gulf'],
  ['Gulf of Oman', 'gulf'],
  ['Gulf of Saint Lawrence', 'gulf'],
  ['Gulf of Thailand', 'gulf'],
  ['Gulf of Tonkin', 'gulf'],
  ['Hudson Bay', 'bay'],
  ['Hudson Strait', 'strait'],
  ['Inner Sea', 'sea'],
  ['Inner Seas', 'sea'],
  ['James Bay', 'bay'],
  ['Korea Strait', 'strait'],
  ['Luzon Strait', 'strait'],
  ['Makassar Strait', 'strait'],
  ['Melville Bay', 'bay'],
  ['Mozambique Channel', 'channel'],
  ['Persian Gulf', 'gulf'],
  ['Río de la Plata', 'gulf'],
  ['Scotia Sea', 'sea'],
  ['Shelikhova Gulf', 'gulf'],
  ['Strait of Gibraltar', 'strait'],
  ['Strait of Malacca', 'strait'],
  ['Strait of Singapore', 'strait'],
  ['Straits of Florida', 'strait'],
  ['Taiwan Strait', 'strait'],
  ['The North Western Passages', 'channel', 'Northwest Passages'],
  ['Ungava Bay', 'bay'],
  ['Viscount Melville Sound', 'sound'],
  ['Yangtze River', 'river'],
];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const WATERS: WaterDef[] = WATER_ROWS.map(([ne, kind, name = ne]) => ({ id: `w-${slug(name)}`, name, kind, ne }));

// Natural Earth features drawn nowhere: the Coral Sea covers that water.
export const SKIP_NE = ['Great Barrier Reef'];

export const SEA: ReadonlyMap<string, SeaDef> = new Map(SEAS.map((s) => [s.id, s]));
export const WATER: ReadonlyMap<string, WaterDef> = new Map(WATERS.map((w) => [w.id, w]));

/** The name without "Sea of " in front or " Sea"/" Ocean" behind: "Sea of Japan" → "Japan", "Pacific Ocean" → "Pacific". */
export function shortName(name: string): string {
  return name.replace(/^Sea of /, '').replace(/ (Sea|Ocean)$/, '');
}
