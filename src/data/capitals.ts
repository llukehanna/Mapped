// The capital to ask for in Capitals · Name it, with the alternatives a player may type instead (disputed or split
// capitals, old names). Accents, case, punctuation and "St"/"Saint" never matter: the matcher normalizes them. A capital
// name or alias belongs to one country only; tests enforce it. Country names are a separate index, so a capital may
// share a country's name (Singapore, Luxembourg).
type Row = [id: string, name: string, aliases?: string[]];

const ROWS: Row[] = [
  ['DZA', 'Algiers'], ['EGY', 'Cairo'], ['LBY', 'Tripoli'], ['MAR', 'Rabat'], ['SDN', 'Khartoum'], ['TUN', 'Tunis'],
  ['BEN', 'Porto-Novo'], ['BFA', 'Ouagadougou'], ['CPV', 'Praia'], ['CIV', 'Yamoussoukro'], ['GMB', 'Banjul'],
  ['GHA', 'Accra'], ['GIN', 'Conakry'], ['GNB', 'Bissau'], ['LBR', 'Monrovia'], ['MLI', 'Bamako'],
  ['MRT', 'Nouakchott'], ['NER', 'Niamey'], ['NGA', 'Abuja'], ['SEN', 'Dakar'], ['SLE', 'Freetown'], ['TGO', 'Lomé'],
  ['AGO', 'Luanda'], ['CMR', 'Yaoundé'], ['CAF', 'Bangui'], ['TCD', "N'Djamena"], ['COG', 'Brazzaville'],
  ['COD', 'Kinshasa'], ['GNQ', 'Malabo'], ['GAB', 'Libreville'], ['STP', 'São Tomé'], ['BDI', 'Gitega'],
  ['COM', 'Moroni'], ['DJI', 'Djibouti'], ['ERI', 'Asmara'], ['ETH', 'Addis Ababa'], ['KEN', 'Nairobi'],
  ['MDG', 'Antananarivo'], ['MWI', 'Lilongwe'], ['MUS', 'Port Louis'], ['MOZ', 'Maputo'], ['RWA', 'Kigali'],
  ['SYC', 'Victoria'], ['SOM', 'Mogadishu'], ['SSD', 'Juba'], ['TZA', 'Dodoma'], ['UGA', 'Kampala'],
  ['ZMB', 'Lusaka'], ['ZWE', 'Harare'], ['BWA', 'Gaborone'], ['SWZ', 'Mbabane', ['Lobamba']], ['LSO', 'Maseru'],
  ['NAM', 'Windhoek'], ['ZAF', 'Pretoria', ['Cape Town', 'Bloemfontein']], ['BHR', 'Manama'], ['CYP', 'Nicosia'],
  ['IRN', 'Tehran'], ['IRQ', 'Baghdad'], ['ISR', 'Jerusalem'], ['JOR', 'Amman'], ['KWT', 'Kuwait City', ['Kuwait']],
  ['LBN', 'Beirut'], ['OMN', 'Muscat'], ['PSE', 'Ramallah', ['East Jerusalem']], ['QAT', 'Doha'], ['SAU', 'Riyadh'],
  ['SYR', 'Damascus'], ['TUR', 'Ankara'], ['ARE', 'Abu Dhabi'], ['YEM', "Sana'a"], ['ARM', 'Yerevan'],
  ['AZE', 'Baku'], ['GEO', 'Tbilisi'], ['KAZ', 'Astana', ['Nur-Sultan']], ['KGZ', 'Bishkek'], ['TJK', 'Dushanbe'],
  ['TKM', 'Ashgabat'], ['UZB', 'Tashkent'], ['AFG', 'Kabul'], ['BGD', 'Dhaka'], ['BTN', 'Thimphu'],
  ['IND', 'New Delhi', ['Delhi']], ['MDV', 'Malé'], ['NPL', 'Kathmandu'], ['PAK', 'Islamabad'],
  ['LKA', 'Sri Jayawardenepura Kotte', ['Kotte', 'Colombo']], ['CHN', 'Beijing'], ['JPN', 'Tokyo'],
  ['MNG', 'Ulaanbaatar', ['Ulan Bator']], ['PRK', 'Pyongyang'], ['KOR', 'Seoul'], ['TWN', 'Taipei'],
  ['BRN', 'Bandar Seri Begawan'], ['KHM', 'Phnom Penh'], ['IDN', 'Jakarta'], ['LAO', 'Vientiane'],
  ['MYS', 'Kuala Lumpur', ['Putrajaya']], ['MMR', 'Naypyidaw', ['Nay Pyi Taw', 'Naypyitaw']], ['PHL', 'Manila'],
  ['SGP', 'Singapore'], ['THA', 'Bangkok'], ['TLS', 'Dili'], ['VNM', 'Hanoi'], ['DNK', 'Copenhagen'],
  ['EST', 'Tallinn'], ['FIN', 'Helsinki'], ['ISL', 'Reykjavík'], ['IRL', 'Dublin'], ['LVA', 'Riga'],
  ['LTU', 'Vilnius'], ['NOR', 'Oslo'], ['SWE', 'Stockholm'], ['GBR', 'London'], ['AUT', 'Vienna'],
  ['BEL', 'Brussels'], ['FRA', 'Paris'], ['DEU', 'Berlin'], ['LIE', 'Vaduz'], ['LUX', 'Luxembourg'],
  ['MCO', 'Monaco'], ['NLD', 'Amsterdam'], ['CHE', 'Bern'], ['AND', 'Andorra la Vella'], ['GRC', 'Athens'],
  ['ITA', 'Rome'], ['MLT', 'Valletta'], ['PRT', 'Lisbon'], ['SMR', 'San Marino'], ['ESP', 'Madrid'],
  ['VAT', 'Vatican City', ['Vatican']], ['ALB', 'Tirana'], ['BIH', 'Sarajevo'], ['BGR', 'Sofia'], ['HRV', 'Zagreb'],
  ['XKX', 'Pristina'], ['MNE', 'Podgorica'], ['MKD', 'Skopje'], ['SRB', 'Belgrade'], ['SVN', 'Ljubljana'],
  ['BLR', 'Minsk'], ['CZE', 'Prague'], ['HUN', 'Budapest'], ['MDA', 'Chișinău'], ['POL', 'Warsaw'],
  ['ROU', 'Bucharest'], ['RUS', 'Moscow'], ['SVK', 'Bratislava'], ['UKR', 'Kyiv', ['Kiev']], ['CAN', 'Ottawa'],
  ['MEX', 'Mexico City'], ['USA', 'Washington, D.C.', ['Washington', 'Washington DC']], ['BLZ', 'Belmopan'],
  ['CRI', 'San José'], ['SLV', 'San Salvador'], ['GTM', 'Guatemala City', ['Guatemala']], ['HND', 'Tegucigalpa'],
  ['NIC', 'Managua'], ['PAN', 'Panama City', ['Panama']], ['ATG', "St. John's"], ['BHS', 'Nassau'],
  ['BRB', 'Bridgetown'], ['CUB', 'Havana'], ['DMA', 'Roseau'], ['DOM', 'Santo Domingo'], ['GRD', "St. George's"],
  ['HTI', 'Port-au-Prince'], ['JAM', 'Kingston'], ['KNA', 'Basseterre'], ['LCA', 'Castries'], ['VCT', 'Kingstown'],
  ['TTO', 'Port of Spain', ['Port-of-Spain']], ['ARG', 'Buenos Aires'], ['BOL', 'Sucre', ['La Paz']],
  ['BRA', 'Brasília'], ['CHL', 'Santiago'], ['COL', 'Bogotá'], ['ECU', 'Quito'], ['GUY', 'Georgetown'],
  ['PRY', 'Asunción'], ['PER', 'Lima'], ['SUR', 'Paramaribo'], ['URY', 'Montevideo'], ['VEN', 'Caracas'],
  ['AUS', 'Canberra'], ['NZL', 'Wellington'], ['FJI', 'Suva'], ['PNG', 'Port Moresby'], ['SLB', 'Honiara'],
  ['VUT', 'Port Vila'], ['KIR', 'Tarawa', ['South Tarawa']], ['MHL', 'Majuro'], ['FSM', 'Palikir'], ['NRU', 'Yaren'],
  ['PLW', 'Ngerulmud'], ['WSM', 'Apia'], ['TON', 'Nukuʻalofa', ['Nukualofa']], ['TUV', 'Funafuti'],
];

export const CAPITALS: ReadonlyMap<string, { name: string; aliases: string[] }> = new Map(
  ROWS.map(([id, name, aliases = []]) => [id, { name, aliases }]),
);

/** The capital shown as the answer for a country id. */
export const capitalOf = (id: string): string => CAPITALS.get(id)!.name;
