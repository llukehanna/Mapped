import { useState } from 'react';
import { COUNTRIES } from '../data/countries.ts';
import type { Continent } from '../data/types.ts';
import { formatClock } from '../game/format.ts';
import { CONTINENTS, isWorld, poolFor, subregionsOf, WORLD } from '../game/scope.ts';
import type { GameConfig, Mode, Scope } from '../game/types.ts';
import type { BestSummary } from '../api/types.ts';
import { boardFor, boardLabel } from '../game/ranking.ts';
import type { Result } from '../store/bests.ts';
import { hintsText } from './accountText.ts';
import { RankedTag } from './RankedTag.tsx';

export const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'type', label: 'Type', blurb: 'Name them all, any order' },
  { id: 'locate', label: 'Locate', blurb: 'Click the named country' },
  { id: 'identify', label: 'Identify', blurb: 'Name the lit-up country' },
];

export const TIME_LIMITS: { sec: number | null; label: string }[] = [
  { sec: null, label: 'None' },
  { sec: 300, label: '5' },
  { sec: 600, label: '10' },
  { sec: 900, label: '15' },
  { sec: 1200, label: '20' },
  { sec: 1800, label: '30 min' },
];

const countIn = (scope: Scope) => poolFor(scope, COUNTRIES).length;
const continentOf = (subregion: string) => COUNTRIES.find((c) => c.subregion === subregion)!.continent;

/** Toggle a continent. Picking one drops its now-redundant subregions; emptying everything means World. */
export function toggleContinent(scope: Scope, id: Continent): Scope {
  const on = scope.continents.includes(id);
  return {
    continents: on ? scope.continents.filter((c) => c !== id) : [...scope.continents, id],
    subregions: scope.subregions.filter((s) => continentOf(s) !== id),
  };
}

export function toggleSubregion(scope: Scope, name: string): Scope {
  const on = scope.subregions.includes(name);
  return { continents: scope.continents, subregions: on ? scope.subregions.filter((s) => s !== name) : [...scope.subregions, name] };
}

interface SetupCardProps {
  config: GameConfig;
  best: Result | null;
  /** signed in: your best on this setup's board, from the server */
  serverBest: BestSummary | null;
  /** functional, so quick successive clicks never work from a stale config */
  onChange: (update: (config: GameConfig) => GameConfig) => void;
  onStart: () => void;
}

export function SetupCard({ config, best, serverBest, onChange, onStart }: SetupCardProps) {
  const [showSubs, setShowSubs] = useState(config.scope.subregions.length > 0);
  const scope = config.scope;
  const total = countIn(scope);
  const board = boardFor(config);
  const setScope = (update: (scope: Scope) => Scope) => onChange((c) => ({ ...c, scope: update(c.scope) }));

  return (
    <section className="setup glass" aria-label="Game setup">
      <div>
        <h1 className="setup-title">How well do you know the map?</h1>
        <p className="mute setup-sub">Pick regions, a mode and a time limit.</p>
      </div>

      <div>
        <div className="label">Regions</div>
        <div className="chips" role="group" aria-label="Regions">
          <button type="button" className={`chip ${isWorld(scope) ? 'on' : ''}`} aria-pressed={isWorld(scope)} onClick={() => setScope(() => WORLD)}>
            World <span className="n">{COUNTRIES.length}</span>
          </button>
          {CONTINENTS.map((c) => {
            const on = scope.continents.includes(c.id);
            return (
              <button key={c.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setScope((s) => toggleContinent(s, c.id))}>
                {c.label} <span className="n">{countIn({ continents: [c.id], subregions: [] })}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="disclosure mute" aria-expanded={showSubs} onClick={() => setShowSubs(!showSubs)}>
          Subregions {showSubs ? '▴' : '▾'}
        </button>
        {showSubs && (
          <div className="subregions">
            {CONTINENTS.map((c) => (
              <div key={c.id} className="chips sub" role="group" aria-label={`${c.label} subregions`}>
                {subregionsOf(c.id, COUNTRIES).map((name) => {
                  const implied = scope.continents.includes(c.id);
                  const on = implied || scope.subregions.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`chip small ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      disabled={implied}
                      onClick={() => setScope((s) => toggleSubregion(s, name))}
                    >
                      {name} <span className="n">{countIn({ continents: [], subregions: [name] })}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="label">Mode</div>
        <div className="modes" role="radiogroup" aria-label="Mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={config.mode === m.id}
              className={`mode ${config.mode === m.id ? 'on' : ''}`}
              onClick={() => onChange((c) => ({ ...c, mode: m.id }))}
            >
              <b>{m.label}</b>
              <span>{m.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">Time limit</div>
        <div className="seg" role="radiogroup" aria-label="Time limit">
          {TIME_LIMITS.map((t) => (
            <button
              key={t.label}
              type="button"
              role="radio"
              aria-checked={config.timeLimitSec === t.sec}
              className={config.timeLimitSec === t.sec ? 'on' : ''}
              onClick={() => onChange((c) => ({ ...c, timeLimitSec: t.sec }))}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="best">
        <span>
          {total} countries · {board ? <RankedTag text={`${boardLabel(board)} board`} /> : <span>Unranked: custom regions</span>}
        </span>
        {serverBest ? (
          <span>
            Best <b>{hintsText(serverBest.hints)}</b> · <b>{formatClock(serverBest.ms)}</b>
            {serverBest.rank && (
              <>
                {' '}
                · <b className="gold">#{serverBest.rank}</b>
              </>
            )}
          </span>
        ) : best ? (
          <span>
            Best <b>{best.found}/{best.total}</b> · <b>{formatClock(best.ms)}</b>
            {best.hints ? ` · ${best.hints} hint${best.hints === 1 ? '' : 's'}` : ''}
          </span>
        ) : (
          <span>No best yet</span>
        )}
      </div>

      <button type="button" className="start" onClick={onStart}>
        Start <kbd>↵</kbd>
      </button>
    </section>
  );
}
