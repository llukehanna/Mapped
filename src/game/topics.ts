import type { GameConfig, Mode } from './types.ts';

export type Topic = 'countries' | 'flags' | 'capitals';
export const TOPICS: Topic[] = ['countries', 'flags', 'capitals'];
export const TOPIC_LABEL: Record<Topic, string> = { countries: 'Countries', flags: 'Flags', capitals: 'Capitals' };

/** What the dock shows for the current target. */
export type Prompt = 'name' | 'flag' | 'capital' | 'map';
/** How the player answers: type a country, type a capital, click the country, or pick its flag. */
export type Answer = 'country' | 'capital' | 'click' | 'flag';
export interface Rules {
  /** one target at a time from the seeded queue; false = name them in any order */
  ordered: boolean;
  /** null for unordered games */
  prompt: Prompt | null;
  answer: Answer;
}

export const topicOf = (config: { topic?: Topic }): Topic => config.topic ?? 'countries';

const RULES: Record<Topic, Record<Mode, Rules>> = {
  countries: {
    type: { ordered: false, prompt: null, answer: 'country' },
    locate: { ordered: true, prompt: 'name', answer: 'click' },
    identify: { ordered: true, prompt: 'map', answer: 'country' },
  },
  flags: {
    type: { ordered: true, prompt: 'flag', answer: 'country' },
    locate: { ordered: true, prompt: 'flag', answer: 'click' },
    identify: { ordered: true, prompt: 'map', answer: 'flag' },
  },
  capitals: {
    type: { ordered: false, prompt: null, answer: 'capital' },
    locate: { ordered: true, prompt: 'capital', answer: 'click' },
    identify: { ordered: true, prompt: 'map', answer: 'capital' },
  },
};

export const rulesFor = (config: Pick<GameConfig, 'mode' | 'topic'>): Rules => RULES[topicOf(config)][config.mode];

/** Rungs on the hint ladder: clicking answers get the 3 Locate rungs, picking a flag 2 (each removes a wrong flag), naming 4 letter rungs. */
export function hintLevels(config: Pick<GameConfig, 'mode' | 'topic'>): number {
  const { answer } = rulesFor(config);
  return answer === 'click' ? 3 : answer === 'flag' ? 2 : 4;
}

export const MODE_BLURB: Record<Topic, Record<Mode, string>> = {
  countries: { type: 'Name them all, any order', locate: 'Click the named country', identify: 'Name the lit-up country' },
  flags: { type: "Type the flag's country", locate: "Click the flag's country", identify: "Pick the lit-up country's flag" },
  capitals: { type: 'Name every capital', locate: "Click the capital's country", identify: "Name the lit-up country's capital" },
};
