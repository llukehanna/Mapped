import { COUNTRIES } from '../data/countries.ts';
import type { Continent } from '../data/types.ts';
import { CONTINENTS, isWorld } from './scope.ts';
import { TOPICS, TOPIC_LABEL, topicOf, type Topic } from './topics.ts';
import type { GameConfig, Mode, Scope } from './types.ts';

/** Anti-cheat thresholds, shared by the client (to explain) and the server (to judge). */
export const MIN_FIND_GAP_MS = 100;
export const MIN_MS_PER_COUNTRY = 300;
export const CLOCK_TOLERANCE_MS = 3000;

export type Region = 'world' | Continent;
export const BOARD_MODES: Mode[] = ['type', 'locate', 'identify'];
export const BOARD_REGIONS: Region[] = ['world', ...CONTINENTS.map((c) => c.id)];
export const BOARD_TOPICS: Topic[] = TOPICS;
export type Board = `${Mode}:${Region}` | `${Exclude<Topic, 'countries'>}:${Mode}:${Region}`;

export function boardKey(topic: Topic, mode: Mode, region: Region): Board {
  return (topic === 'countries' ? `${mode}:${region}` : `${topic}:${mode}:${region}`) as Board;
}

const MODE_LABEL: Record<Mode, string> = { type: 'Type', locate: 'Locate', identify: 'Identify' };
export const regionLabel = (region: Region) => (region === 'world' ? 'World' : CONTINENTS.find((c) => c.id === region)!.label);

/** The leaderboard a setup counts toward: World or exactly one whole continent. Any time limit. */
export function boardFor(config: GameConfig): Board | null {
  const { continents, subregions } = config.scope;
  const region: Region | null = isWorld(config.scope) ? 'world' : subregions.length === 0 && continents.length === 1 ? continents[0] : null;
  return region && boardKey(topicOf(config), config.mode, region);
}

export function parseBoard(board: string): { topic: Topic; mode: Mode; region: Region } | null {
  const parts = board.split(':');
  const [topic, mode, region] = parts.length === 2 ? ['countries', ...parts] : parts;
  if (parts.length === 3 && topic === 'countries') return null;
  if (parts.length > 3 || !TOPICS.includes(topic as Topic) || !BOARD_MODES.includes(mode as Mode) || !BOARD_REGIONS.includes(region as Region)) return null;
  return { topic: topic as Topic, mode: mode as Mode, region: region as Region };
}

/** "World · Type", or "World · Flags · Type" */
export function boardLabel(board: Board): string {
  const { topic, mode, region } = parseBoard(board)!;
  return [regionLabel(region), ...(topic === 'countries' ? [] : [TOPIC_LABEL[topic]]), MODE_LABEL[mode]].join(' · ');
}

export interface Run {
  found: number;
  hints: number;
  ms: number;
  finishedAt: number;
}

/** Negative when `a` ranks above `b`: more found, then fewer hints, then faster, then earlier. */
export function compareRuns(a: Run, b: Run): number {
  return b.found - a.found || a.hints - b.hints || a.ms - b.ms || a.finishedAt - b.finishedAt;
}

const SUBREGIONS = new Set(COUNTRIES.map((c) => c.subregion));
const CONTINENT_IDS = new Set<string>(CONTINENTS.map((c) => c.id));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 40 && v.every((x) => typeof x === 'string');

/** A game config from untrusted JSON, or null if it isn't one the setup card could have made. */
export function parseConfig(value: unknown): GameConfig | null {
  if (!value || typeof value !== 'object') return null;
  const { topic, mode, scope, timeLimitSec } = value as Record<string, unknown>;
  if (topic !== undefined && !TOPICS.includes(topic as Topic)) return null;
  if (!BOARD_MODES.includes(mode as Mode)) return null;
  if (!scope || typeof scope !== 'object') return null;
  const { continents, subregions } = scope as Record<string, unknown>;
  if (!strings(continents) || !strings(subregions)) return null;
  if (!continents.every((c) => CONTINENT_IDS.has(c)) || !subregions.every((s) => SUBREGIONS.has(s))) return null;
  if (new Set(continents).size !== continents.length || new Set(subregions).size !== subregions.length) return null;
  const limitOk = timeLimitSec === null || (Number.isInteger(timeLimitSec) && (timeLimitSec as number) >= 60 && (timeLimitSec as number) <= 3600);
  if (!limitOk) return null;
  const clean: Scope = { continents: continents as Continent[], subregions };
  return { ...(topic && topic !== 'countries' ? { topic: topic as Topic } : {}), mode: mode as Mode, scope: clean, timeLimitSec: timeLimitSec as number | null };
}
