// Facts behind the hint ladder. Populations are rounded recent estimates (thousands); areas are
// official totals (km²), including overseas parts where a country counts them (France, Norway).
type Row = [id: string, capital: string, populationK: number, areaKm2: number];

const ROWS: Row[] = [
  // Africa
  ['DZA', 'Algiers', 46000, 2381741], ['EGY', 'Cairo', 113000, 1002450], ['LBY', 'Tripoli', 7300, 1759540],
  ['MAR', 'Rabat', 37800, 446550], ['SDN', 'Khartoum', 48000, 1861484], ['TUN', 'Tunis', 12200, 163610],
  ['BEN', 'Porto-Novo', 13700, 114763], ['BFA', 'Ouagadougou', 23000, 274200], ['CPV', 'Praia', 525, 4033],
  ['CIV', 'Yamoussoukro', 31000, 322463], ['GMB', 'Banjul', 2700, 11295], ['GHA', 'Accra', 34000, 238535],
  ['GIN', 'Conakry', 14500, 245857], ['GNB', 'Bissau', 2200, 36125], ['LBR', 'Monrovia', 5500, 111369],
  ['MLI', 'Bamako', 23000, 1240192], ['MRT', 'Nouakchott', 5000, 1030700], ['NER', 'Niamey', 27000, 1267000],
  ['NGA', 'Abuja', 229000, 923768], ['SEN', 'Dakar', 18500, 196722], ['SLE', 'Freetown', 8600, 71740],
  ['TGO', 'Lomé', 9300, 56785], ['AGO', 'Luanda', 37000, 1246700], ['CMR', 'Yaoundé', 29000, 475442],
  ['CAF', 'Bangui', 5300, 622984], ['TCD', "N'Djamena", 19000, 1284000], ['COG', 'Brazzaville', 6200, 342000],
  ['COD', 'Kinshasa', 109000, 2344858], ['GNQ', 'Malabo', 1900, 28051], ['GAB', 'Libreville', 2500, 267668],
  ['STP', 'São Tomé', 230, 964], ['BDI', 'Gitega', 14000, 27834], ['COM', 'Moroni', 870, 1862],
  ['DJI', 'Djibouti', 1150, 23200], ['ERI', 'Asmara', 3700, 117600], ['ETH', 'Addis Ababa', 129000, 1104300],
  ['KEN', 'Nairobi', 56000, 580367], ['MDG', 'Antananarivo', 31000, 587041], ['MWI', 'Lilongwe', 21000, 118484],
  ['MUS', 'Port Louis', 1270, 2040], ['MOZ', 'Maputo', 34000, 801590], ['RWA', 'Kigali', 14000, 26338],
  ['SYC', 'Victoria', 120, 459], ['SOM', 'Mogadishu', 19000, 637657], ['SSD', 'Juba', 11900, 619745],
  ['TZA', 'Dodoma', 68000, 945087], ['UGA', 'Kampala', 49000, 241550], ['ZMB', 'Lusaka', 21000, 752618],
  ['ZWE', 'Harare', 16600, 390757], ['BWA', 'Gaborone', 2500, 581730], ['SWZ', 'Mbabane', 1200, 17364],
  ['LSO', 'Maseru', 2300, 30355], ['NAM', 'Windhoek', 3000, 825615], ['ZAF', 'Pretoria', 63000, 1221037],
  // Asia
  ['BHR', 'Manama', 1600, 786], ['CYP', 'Nicosia', 1300, 9251], ['IRN', 'Tehran', 90000, 1648195],
  ['IRQ', 'Baghdad', 46000, 438317], ['ISR', 'Jerusalem', 9900, 22145], ['JOR', 'Amman', 11500, 89342],
  ['KWT', 'Kuwait City', 4900, 17818], ['LBN', 'Beirut', 5800, 10452], ['OMN', 'Muscat', 5300, 309500],
  ['PSE', 'Ramallah (seat of government)', 5500, 6020], ['QAT', 'Doha', 3000, 11586], ['SAU', 'Riyadh', 33000, 2149690],
  ['SYR', 'Damascus', 24000, 185180], ['TUR', 'Ankara', 85000, 783562], ['ARE', 'Abu Dhabi', 10000, 83600],
  ['YEM', "Sana'a", 34000, 527968], ['ARM', 'Yerevan', 3000, 29743], ['AZE', 'Baku', 10200, 86600],
  ['GEO', 'Tbilisi', 3700, 69700], ['KAZ', 'Astana', 20000, 2724900], ['KGZ', 'Bishkek', 7100, 199951],
  ['TJK', 'Dushanbe', 10300, 143100], ['TKM', 'Ashgabat', 7000, 488100], ['UZB', 'Tashkent', 36000, 448978],
  ['AFG', 'Kabul', 42000, 652230], ['BGD', 'Dhaka', 173000, 147570], ['BTN', 'Thimphu', 790, 38394],
  ['IND', 'New Delhi', 1440000, 3287263], ['MDV', 'Malé', 525, 298], ['NPL', 'Kathmandu', 30000, 147516],
  ['PAK', 'Islamabad', 245000, 881913], ['LKA', 'Sri Jayawardenepura Kotte', 22000, 65610], ['CHN', 'Beijing', 1410000, 9596961],
  ['JPN', 'Tokyo', 124000, 377975], ['MNG', 'Ulaanbaatar', 3500, 1564116], ['PRK', 'Pyongyang', 26000, 120538],
  ['KOR', 'Seoul', 51700, 100210], ['TWN', 'Taipei', 23400, 36197], ['BRN', 'Bandar Seri Begawan', 460, 5765],
  ['KHM', 'Phnom Penh', 17600, 181035], ['IDN', 'Jakarta', 280000, 1904569], ['LAO', 'Vientiane', 7700, 236800],
  ['MYS', 'Kuala Lumpur', 34000, 330803], ['MMR', 'Naypyidaw', 54000, 676578], ['PHL', 'Manila', 115000, 300000],
  ['SGP', 'Singapore', 5900, 734], ['THA', 'Bangkok', 71000, 513120], ['TLS', 'Dili', 1400, 14874],
  ['VNM', 'Hanoi', 100000, 331212],
  // Europe
  ['DNK', 'Copenhagen', 5950, 42933], ['EST', 'Tallinn', 1370, 45339], ['FIN', 'Helsinki', 5600, 338455],
  ['ISL', 'Reykjavík', 390, 103000], ['IRL', 'Dublin', 5300, 70273], ['LVA', 'Riga', 1870, 64589],
  ['LTU', 'Vilnius', 2880, 65300], ['NOR', 'Oslo', 5550, 385207], ['SWE', 'Stockholm', 10550, 450295],
  ['GBR', 'London', 68500, 242495], ['AUT', 'Vienna', 9150, 83879], ['BEL', 'Brussels', 11800, 30689],
  ['FRA', 'Paris', 68400, 643801], ['DEU', 'Berlin', 84000, 357022], ['LIE', 'Vaduz', 40, 160],
  ['LUX', 'Luxembourg', 670, 2586], ['MCO', 'Monaco', 39, 2], ['NLD', 'Amsterdam', 18000, 41543],
  ['CHE', 'Bern', 8900, 41285], ['AND', 'Andorra la Vella', 81, 468], ['GRC', 'Athens', 10400, 131957],
  ['ITA', 'Rome', 59000, 301340], ['MLT', 'Valletta', 540, 316], ['PRT', 'Lisbon', 10600, 92212],
  ['SMR', 'San Marino', 34, 61], ['ESP', 'Madrid', 48500, 505990], ['VAT', 'Vatican City', 1, 0.44],
  ['ALB', 'Tirana', 2750, 28748], ['BIH', 'Sarajevo', 3200, 51197], ['BGR', 'Sofia', 6450, 110879],
  ['HRV', 'Zagreb', 3850, 56594], ['XKX', 'Pristina', 1600, 10887], ['MNE', 'Podgorica', 620, 13812],
  ['MKD', 'Skopje', 1830, 25713], ['SRB', 'Belgrade', 6600, 77474], ['SVN', 'Ljubljana', 2120, 20273],
  ['BLR', 'Minsk', 9200, 207600], ['CZE', 'Prague', 10900, 78867], ['HUN', 'Budapest', 9600, 93028],
  ['MDA', 'Chișinău', 2400, 33846], ['POL', 'Warsaw', 36600, 312696], ['ROU', 'Bucharest', 19000, 238397],
  ['RUS', 'Moscow', 144000, 17098246], ['SVK', 'Bratislava', 5420, 49035], ['UKR', 'Kyiv', 37000, 603550],
  // North America
  ['CAN', 'Ottawa', 41000, 9984670], ['MEX', 'Mexico City', 130000, 1964375], ['USA', 'Washington, D.C.', 336000, 9833520],
  ['BLZ', 'Belmopan', 410, 22966], ['CRI', 'San José', 5200, 51100], ['SLV', 'San Salvador', 6300, 21041],
  ['GTM', 'Guatemala City', 18000, 108889], ['HND', 'Tegucigalpa', 10600, 112492], ['NIC', 'Managua', 7000, 130373],
  ['PAN', 'Panama City', 4500, 75417], ['ATG', "St. John's", 94, 442], ['BHS', 'Nassau', 410, 13943],
  ['BRB', 'Bridgetown', 282, 430], ['CUB', 'Havana', 10000, 109884], ['DMA', 'Roseau', 73, 751],
  ['DOM', 'Santo Domingo', 11400, 48671], ['GRD', "St. George's", 126, 344], ['HTI', 'Port-au-Prince', 11800, 27750],
  ['JAM', 'Kingston', 2830, 10991], ['KNA', 'Basseterre', 47, 261], ['LCA', 'Castries', 180, 617],
  ['VCT', 'Kingstown', 104, 389], ['TTO', 'Port of Spain', 1500, 5130],
  // South America
  ['ARG', 'Buenos Aires', 46000, 2780400], ['BOL', 'Sucre and La Paz', 12400, 1098581], ['BRA', 'Brasília', 212000, 8515767],
  ['CHL', 'Santiago', 19700, 756102], ['COL', 'Bogotá', 52000, 1141748], ['ECU', 'Quito', 18000, 283561],
  ['GUY', 'Georgetown', 810, 214969], ['PRY', 'Asunción', 6900, 406752], ['PER', 'Lima', 34000, 1285216],
  ['SUR', 'Paramaribo', 620, 163820], ['URY', 'Montevideo', 3400, 176215], ['VEN', 'Caracas', 28000, 916445],
  // Oceania
  ['AUS', 'Canberra', 27000, 7692024], ['NZL', 'Wellington', 5300, 268021], ['FJI', 'Suva', 930, 18274],
  ['PNG', 'Port Moresby', 10300, 462840], ['SLB', 'Honiara', 740, 28896], ['VUT', 'Port Vila', 330, 12189],
  ['KIR', 'Tarawa', 133, 811], ['MHL', 'Majuro', 42, 181], ['FSM', 'Palikir', 115, 702],
  ['NRU', 'Yaren (no official capital)', 12, 21], ['PLW', 'Ngerulmud', 18, 459], ['WSM', 'Apia', 220, 2842],
  ['TON', 'Nukuʻalofa', 108, 747], ['TUV', 'Funafuti', 11, 26],
];

export interface Facts {
  capital: string;
  /** people */
  population: number;
  areaKm2: number;
  landlocked: boolean;
}

/** The 45 landlocked countries among the 197 (Caspian shores don't count as sea). */
export const LANDLOCKED = new Set([
  'BWA', 'BFA', 'BDI', 'CAF', 'TCD', 'ETH', 'LSO', 'MWI', 'MLI', 'NER', 'RWA', 'SSD', 'SWZ', 'UGA', 'ZMB', 'ZWE',
  'AFG', 'ARM', 'AZE', 'BTN', 'KAZ', 'KGZ', 'LAO', 'MNG', 'NPL', 'TJK', 'TKM', 'UZB',
  'AND', 'AUT', 'BLR', 'CZE', 'HUN', 'XKX', 'LIE', 'LUX', 'MKD', 'MDA', 'SMR', 'SRB', 'SVK', 'CHE', 'VAT',
  'BOL', 'PRY',
]);

export const FACTS: ReadonlyMap<string, Facts> = new Map(
  ROWS.map(([id, capital, populationK, areaKm2]) => [id, { capital, population: populationK * 1000, areaKm2, landlocked: LANDLOCKED.has(id) }]),
);
