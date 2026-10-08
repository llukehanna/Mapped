// Groups of flags people confuse. Flags · Identify offers a target's lookalikes as the wrong answers before anything else.
// A country may be in several groups. Keep a group to real resemblance; subregion fills the rest.
export const FLAG_LOOKALIKES: readonly (readonly string[])[] = [
  ['TCD', 'ROU', 'AND', 'MDA'], // blue, yellow and red verticals
  ['IDN', 'MCO', 'POL', 'SGP'], // red and white
  ['IRL', 'CIV', 'ITA'], // green, white and orange/red verticals
  ['NLD', 'LUX', 'PRY', 'HRV'], // red, white and blue horizontals
  ['FRA', 'NLD', 'RUS'], // plain tricolours in the same three colours
  ['AUS', 'NZL'], // Southern Cross on a blue ensign
  ['AUS', 'FJI', 'TUV'], // Union Jack ensigns
  ['SEN', 'MLI', 'GIN', 'CMR'], // Pan-African green, yellow and red
  ['NOR', 'ISL', 'DNK', 'FIN', 'SWE'], // Nordic crosses
  ['SVN', 'SVK', 'RUS', 'SRB'], // white, blue and red with a crest
  ['VEN', 'ECU', 'COL'], // Gran Colombia tricolours
  ['HND', 'SLV', 'NIC', 'GTM', 'ARG'], // blue and white with a central emblem
  ['QAT', 'BHR'], // white serrated edge on maroon or red
  ['JOR', 'PSE', 'SDN', 'KWT', 'ARE'], // Pan-Arab colours with a triangle or band
  ['SYR', 'IRQ', 'EGY', 'YEM'], // red, white and black horizontals
  ['AUT', 'LVA', 'LBN'], // red and white bands
  ['BEL', 'DEU'], // black, yellow and red
  ['HUN', 'ITA', 'BGR', 'TJK'], // red, white and green
  ['GHA', 'BOL', 'LTU', 'GNB'], // red, yellow and green
  ['JPN', 'BGD', 'PLW'], // a disc on a plain field
  ['HTI', 'LIE'], // blue over red with a crest
  ['CUB', 'URY', 'GRC'], // blue and white stripes with a canton
  ['NER', 'IND'], // orange, white and green
  ['MEX', 'ITA'], // green, white and red with an emblem
  ['EST', 'BWA'], // blue, black and white
  ['THA', 'CRI'], // blue and red stripes on white
  ['MYS', 'USA', 'LBR', 'TGO'], // stripes with a starred canton
  ['KEN', 'SSD', 'MWI', 'ZMB'], // black, red and green
  ['MRT', 'PAK'], // green with a crescent
  ['TUR', 'TUN'], // red with a white crescent and star
  ['CZE', 'PHL'], // white, red and blue with a triangle
  ['UKR', 'KAZ'], // blue and yellow
  ['GAB', 'SLE'], // green, yellow or white, and blue horizontals
  ['CHE', 'TON', 'GEO'], // red and white crosses
  ['VNM', 'CHN', 'MAR'], // red with a star
  ['ISR', 'GRC', 'FIN'], // blue and white
  ['PER', 'CAN'], // red, white and red
];
