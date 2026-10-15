import type { GameConfig, Mode } from './types.ts';

export type Topic = 'countries' | 'flags' | 'capitals';
export const TOPICS: Topic[] = ['countries', 'flags', 'capitals'];
export const TOPIC_LABEL: Record<Topic, string> = { countries: 'Countries', flags: 'Flags', capitals: 'Capitals' };

/** What the dock shows for the current target: a country's name, its flag, a capital, the lit-up map, or a named country (Capitals · Type and Identify). */
export type Prompt = 'name' | 'flag' | 'capital' | 'map' | 'country';
/** How the player answers: type a country, type a capital, click the country, pick its flag, or pick its capital. */
export type Answer = 'country' | 'capital' | 'click' | 'flag' | 'capitalPick';
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
    type: { ordered: true, prompt: 'country', answer: 'capital' },
    locate: { ordered: true, prompt: 'capital', answer: 'click' },
    identify: { ordered: true, prompt: 'country', answer: 'capitalPick' },
  },
};

/** Answers given by picking one of four choices: logged as a click on the picked country, and any country may be picked. */
export const isPick = (answer: Answer): boolean => answer === 'flag' || answer === 'capitalPick';

export const rulesFor = (config: Pick<GameConfig, 'mode' | 'topic'>): Rules => RULES[topicOf(config)][config.mode];

/** Rungs on the hint ladder: clicking answers get the 3 Locate rungs, picking a flag or capital 2 (each removes a wrong choice), naming 4 letter
 * rungs; Flags · Type adds a region rung in front of the letters. */
export function hintLevels(config: Pick<GameConfig, 'mode' | 'topic'>): number {
  if (topicOf(config) === 'flags' && config.mode === 'type') return 5;
  const { answer } = rulesFor(config);
  return answer === 'click' ? 3 : isPick(answer) ? 2 : 4;
}

export const MODE_BLURB: Record<Topic, Record<Mode, string>> = {
  countries: { type: 'Name them all, any order', locate: 'Click the named country', identify: 'Name the lit-up country' },
  flags: { type: "Type the flag's country", locate: "Click the flag's country", identify: "Pick the lit-up country's flag" },
  capitals: { type: "Type the named country's capital", locate: "Click the capital's country", identify: "Pick the named country's capital" },
};
