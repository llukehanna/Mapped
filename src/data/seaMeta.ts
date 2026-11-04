import raw from './seas-meta.json';

export interface SeaMeta {
  /** label and hint-circle position, [lon, lat]: inside the sea's largest polygon */
  anchor: [number, number];
  /** country and territory ids on its shores, sorted (Locate hint); empty for the Sargasso and the Antarctic answers */
  coast: string[];
}

export const SEA_META = raw as unknown as Readonly<Record<string, SeaMeta>>;
