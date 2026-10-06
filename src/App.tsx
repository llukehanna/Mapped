import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, signInHref, type ApiError } from './api/client.ts';
import { addClaim, migrateClaims, readClaims, removeClaims, saveResume, sessionStore, takeResume, type Run, type SaveState } from './api/resume.ts';
import { useSession } from './api/session.ts';
import { MAX_CLAIMS_PER_REQUEST, type BestSummary } from './api/types.ts';
import { COUNTRIES } from './data/countries.ts';
import { GEO_META } from './data/geoMeta.ts';
import { COUNTRY, nameOf } from './data/lookup.ts';
import { TERRITORIES } from './data/territories.ts';
import { formatClock, formatCountdown } from './game/format.ts';
import { FACTS } from './data/facts.ts';
import { clueText, HINT_LEVELS } from './game/hints.ts';
import type { LogEntry } from './game/log.ts';
import { boardFor, parseBoard, type Board } from './game/ranking.ts';
import { groupOf, progressRows } from './game/progress.ts';
import { elapsed, initialState, reduce, target } from './game/reducer.ts';
import { seededRandom, shuffle } from './game/rng.ts';
import { isWorld, poolFor, scopeLabel, WORLD } from './game/scope.ts';
import type { GameConfig } from './game/types.ts';
import { rotationFor, type Rect } from './map/geometry.ts';
import { useShapes } from './map/useShapes.ts';
import { WorldMap, type Highlight, type MapHandle } from './map/WorldMap.tsx';
import { buildIndex } from './match/nameIndex.ts';
import { readBest, recordResult } from './store/bests.ts';
import { readJson, safeStorage, writeJson } from './store/storage.ts';
import { readTheme, writeTheme, type Theme } from './store/theme.ts';
import { GuessInput } from './ui/GuessInput.tsx';
import { useKeyboardInset, useMediaQuery, useNow, useSize, useTransient } from './ui/hooks.ts';
import { Icon } from './ui/Icon.tsx';
import { LocatePrompt } from './ui/LocatePrompt.tsx';
import { PauseOverlay } from './ui/PauseOverlay.tsx';
import { RegionProgress } from './ui/RegionProgress.tsx';
import { ReviewPanel } from './ui/ReviewPanel.tsx';
import { MODES, SetupCard } from './ui/SetupCard.tsx';
import { shapeStates } from './ui/shapeStates.ts';
import { Toast, type ToastMessage } from './ui/Toast.tsx';
import { HintCard } from './ui/HintCard.tsx';
import { DeleteAccount } from './ui/DeleteAccount.tsx';
import { Leaderboard } from './ui/Leaderboard.tsx';
import { NameCard } from './ui/NameCard.tsx';
import { routePath, useRoute } from './ui/router.ts';
import { SaveCard } from './ui/SaveCard.tsx';
import { SignInCard } from './ui/SignInCard.tsx';
import { UserMenu } from './ui/UserMenu.tsx';
import { YourGames } from './ui/YourGames.tsx';
import { GiveUpButton, Score, ThemeToggle, TopBar, Wordmark } from './ui/TopBar.tsx';
import { useGuess } from './ui/useGuess.ts';
import { ZoomControls } from './ui/ZoomControls.tsx';

const DEFAULT_CONFIG: GameConfig = { mode: 'type', scope: WORLD, timeLimitSec: null };
const INDEX = buildIndex(COUNTRIES, TERRITORIES);
/** Territory shape → the country whose color it shares (Greenland → Denmark). */
const OWNERS = new Map(TERRITORIES.flatMap((t) => (t.sovereign && t.geo ? [[t.id, t.sovereign] as const] : [])));
const clue = (mode: GameConfig['mode'], level: number, id: string) =>
  clueText(mode, level, { country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });
const storage = safeStorage();
/** Wait before the one automatic retry of /finish after a network failure. */
const FINISH_RETRY_MS = 800;
const session = sessionStore();
/** The name card opens by itself once per browser session; the user menu can open it any time. */
const NAME_ASKED = 'mapped:name-asked:v1';
/** `?seed=42` makes target order reproducible (used by end-to-end tests). */
const SEED = Number(new URLSearchParams(window.location.search).get('seed')) || null;
const random = SEED ? seededRandom(SEED) : Math.random;

/** Where chrome doesn't cover the map, per screen. The map frames selections inside this. */
function safeArea(phase: string, small: boolean, width: number, height: number, keyboard: number): Rect {
  const box = (top: number, right: number, bottom: number, left: number): Rect => ({
    x: left,
    y: top,
    width: Math.max(80, width - left - right),
    height: Math.max(80, height - top - bottom),
  });
  if (small) {
    if (phase === 'setup') return box(56, 12, Math.round(height * 0.58), 12);
    if (phase === 'review') return box(64, 12, Math.round(height * 0.42), 12);
    return box(64, 12, 84 + keyboard, 12);
  }
  if (phase === 'setup') return box(64, 470, 32, 32);
  if (phase === 'review') return box(84, 300, 28, 28);
  return box(80, 32, 96, 32);
}

export function App() {
  const shapes = useShapes();
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const mapRef = useRef<MapHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const small = useMediaQuery('(max-width: 767px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const keyboard = useKeyboardInset();

  const [theme, setTheme] = useState<Theme>(() => readTheme(storage));
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [state, dispatch] = useReducer(reduce, DEFAULT_CONFIG, initialState);
  const now = useNow(state.phase === 'playing');
  const [toast, setToast] = useTransient<ToastMessage>(2400);
  const [announcement, setAnnouncement] = useState('');
  const [justFound, flashJust] = useTransient<string>(2000);
  const [mapFlash, setMapFlash] = useTransient<Highlight>(1800);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  /** The "Give up?" dialog is open. `resume`: it paused a running game, so cancelling resumes it. */
  const [confirming, setConfirming] = useState<{ resume: boolean } | null>(null);
  const toastSeq = useRef(0);
  const { user, setUser, signOut } = useSession();
  const [route, go] = useRoute();
  /** The server's record of the current game; null when it started offline. */
  const [run, setRun] = useState<Run | null>(null);
  const [save, setSave] = useState<SaveState | null>(null);
  /** Signed in: your best on each board, for the setup card. */
  const [bests, setBests] = useState<Map<Board, BestSummary>>(new Map());
  const [card, setCard] = useState<'name' | 'delete' | null>(null);
  const starting = useRef(false);
  /** startedAt of the last game whose end was handled, so a restored review isn't saved twice. */
  const finished = useRef<number | null>(null);
  /** The ID of the game currently on screen, to ignore stale /finish responses from earlier games. */
  const currentRun = useRef<string | null>(null);

  const say = (text: string, tone: ToastMessage['tone']) => {
    toastSeq.current += 1;
    setToast({ text, tone, seq: toastSeq.current });
    setAnnouncement(text);
  };
  const guess = useGuess({ state, dispatch, index: INDEX, say, flash: flashJust, onHint: () => dispatch({ type: 'hint', rand: random(), now: Date.now() }) });

  const playing = state.phase === 'playing' || state.phase === 'paused';
  const mode = state.config.mode;
  const goal = target(state);
  const limitMs = state.config.timeLimitSec === null ? null : state.config.timeLimitSec * 1000;
  const spent = elapsed(state, now);
  const left = limitMs === null ? Infinity : limitMs - spent;
  const rankedRun = run?.board != null;

  // Theme: <html data-theme>, browser chrome color, and remember the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ebe6dc' : '#13110f');
    writeTheme(storage, theme);
  }, [theme]);

  // Countdown expiry.
  useEffect(() => {
    if (state.phase === 'playing') dispatch({ type: 'tick', now: Date.now() });
  }, [now, state.phase]);

  // Screen readers hear the clock only at one minute and ten seconds left, once each.
  const warned = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const mark = left <= 10_000 ? 10 : left <= 60_000 ? 60 : null;
    if (mark && warned.current !== mark) {
      warned.current = mark;
      setAnnouncement(mark === 60 ? 'One minute left.' : 'Ten seconds left.');
    }
  }, [left, state.phase]);

  // Leaving the tab pauses a stopwatch game. A countdown keeps running so looking answers up costs time,
  // and so does a ranked run, since pausing would unrank it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && state.phase === 'playing' && limitMs === null && !rankedRun) dispatch({ type: 'pause', now: Date.now() });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [state.phase, limitMs, rankedRun]);

  // React to game events: glow, flashes, toasts, screen-reader announcements.
  useEffect(() => {
    const e = state.event;
    if (!e) return;
    const name = nameOf(e.id);
    if (e.kind === 'found') {
      flashJust(e.id);
      const group = groupOf(e.id, state.pool, COUNTRY);
      const row = progressRows(state.pool, state.found, COUNTRY).find((r) => r.label === group);
      setAnnouncement(`${name}, found. ${state.found.length} of ${state.pool.length}.`);
      if (e.corrected) say(`Accepted as ${name}`, 'good');
      else if (mode === 'type') say(`${name}${row && row.total > 1 ? ` · ${group} ${row.found}/${row.total}` : ''}`, 'good');
    } else if (e.kind === 'wrong') {
      setMapFlash({ id: e.id, kind: 'wrong', label: name, seq: e.seq });
      setAnnouncement(`No, that's ${name}.`);
    } else if (e.kind === 'revealed') {
      setMapFlash({ id: e.id, kind: 'reveal', label: name, seq: e.seq });
      say(`That was ${name}`, 'warn');
    } else if (e.kind === 'hint') {
      setAnnouncement(`Hint: ${clue(mode, e.level, e.id)}`);
      // Type: show the hinted country. Locate: show its region only, then close in for the circle.
      if (mode === 'type' && e.level === 1) mapRef.current?.focus(e.id, 5);
      if (mode === 'locate' && e.level === 1) {
        const sub = COUNTRY.get(e.id)!.subregion;
        mapRef.current?.frameIds(COUNTRIES.filter((c) => c.subregion === sub).map((c) => c.id), 6);
      }
      if (mode === 'locate' && e.level === 3) mapRef.current?.focus(e.id, 3);
    }
  }, [state.event?.seq]);

  // Identify: bring a tiny or off-screen target into view.
  useEffect(() => {
    if (mode !== 'identify' || state.phase !== 'playing' || !goal) return;
    const id = window.setTimeout(() => {
      if (!mapRef.current?.isVisible(goal, 10)) mapRef.current?.focus(goal, 6);
    }, 120);
    return () => window.clearTimeout(id);
  }, [goal, mode, state.phase]);

  // Entering review: save a local best if earned, and send the game to the server.
  useEffect(() => {
    if (state.phase !== 'review' || finished.current === state.startedAt) return;
    finished.current = state.startedAt;
    if (run) finish(run, state.log);
    setNewBest(
      recordResult(storage, state.config, {
        found: state.found.length,
        total: state.pool.length,
        ms: state.elapsedMs,
        hints: state.hintsUsed,
        at: Date.now(),
      }),
    );
    setAnnouncement(`Game over. ${state.found.length} of ${state.pool.length}.`);
  }, [state.phase]);

  // Once we know who's signed in: come back from Google, claim games played signed out, load bests.
  const loaded = useRef(false);
  useEffect(() => {
    if (user === undefined || loaded.current) return;
    loaded.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'failed') {
      say("Sign-in didn't finish. Try again.", 'warn');
      params.delete('auth');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
    const resume = takeResume(session, Date.now());
    if (resume?.state.phase === 'review' && keys.current.state.phase === 'setup') {
      finished.current = resume.state.startedAt;
      currentRun.current = resume.run?.id ?? null;
      dispatch({ type: 'restore', state: { ...resume.state, event: null } });
      setRun(resume.run);
      setSave(resume.save);
    }
    if (!user) return;
    if (user.name === null && !readJson<boolean>(session, NAME_ASKED)) {
      writeJson(session, NAME_ASKED, true);
      setCard('name');
    }
    // Claims used to live in sessionStorage; they last 90 days in localStorage now.
    migrateClaims(session, storage, Date.now());
    const claims = readClaims(storage, Date.now());
    if (claims.length === 0) refreshBests();
    else void claimAll(claims, resume?.run?.id);
  }, [user]);

  // Already signed in: /signin has nothing to show.
  useEffect(() => {
    if (user && route.name === 'signin') go({ name: 'home' }, { replace: true });
  }, [user, route.name]);

  /** Sends claims to the server a few at a time, dropping from storage only those it took. */
  async function claimAll(claims: { id: string; claim: string }[], resumedId: string | undefined) {
    for (let i = 0; i < claims.length; i += MAX_CLAIMS_PER_REQUEST) {
      const chunk = claims.slice(i, i + MAX_CLAIMS_PER_REQUEST).map(({ id, claim }) => ({ id, claim }));
      try {
        const { results } = await api.claim(chunk);
        removeClaims(storage, chunk.map((c) => c.id));
        const mine = results.find((r) => r.id === resumedId);
        if (mine && currentRun.current === mine.id) setSave({ status: 'saved', result: mine });
      } catch (e) {
        if ((e as ApiError).status === 401) return void setUser(null);
        break;
      }
    }
    refreshBests();
  }

  /** Reloads your bests, and the rank on the save card (it changes once you pick a name). */
  function refreshBests() {
    api.myGames().then(({ bests: list }) => {
      const map = new Map(list.map((b) => [b.board, b]));
      setBests(map);
      setSave((s) => {
        const best = s?.status === 'saved' && s.result.ranked && s.result.board ? map.get(s.result.board) : undefined;
        return best && s?.status === 'saved' ? { status: 'saved', result: { ...s.result, best } } : s;
      });
    }, signedOutOn401);
  }

  /** A 401 from a signed-in call means the session is gone: show Sign in again. */
  function signedOutOn401(e: ApiError) {
    if (e.status === 401) setUser(null);
  }

  function finish(game: Run, log: LogEntry[]) {
    setSave({ status: 'saving' });
    const attempt = (retry: boolean) => {
      api.finishGame(game.id, log).then(
        (result) => {
          if (currentRun.current === game.id) setSave({ status: 'saved', result });
          if (game.claim) addClaim(storage, { id: game.id, claim: game.claim }, Date.now());
          if (result.board && result.best) setBests((m) => new Map(m).set(result.board!, result.best!));
        },
        (e: ApiError) => {
          // Offline or timed out: once more after a moment (finishing is idempotent) before showing the error.
          if (e.status === 0 && retry) return void window.setTimeout(() => attempt(false), FINISH_RETRY_MS);
          if (currentRun.current === game.id) setSave(e.code === 'unverified' ? { status: 'unverified' } : { status: 'error' });
        },
      );
    };
    attempt(true);
  }

  /** Off to Google. A finished game's review comes back with us. */
  function beginSignIn() {
    if (state.phase === 'review') saveResume(session, { state, run, save }, Date.now());
    window.location.assign(signInHref(route.name === 'signin' ? '/' : routePath(route)));
  }

  const openBoard = (board: Board) => {
    const { mode, region } = parseBoard(board)!;
    go({ name: 'board', mode, region });
  };

  async function start(config: GameConfig = draft) {
    if (starting.current) return;
    starting.current = true;
    // The server picks the target order and times the game. If it can't be reached quickly, play offline.
    const online = await api.startGame(config).catch(() => null);
    starting.current = false;
    const pool = poolFor(config.scope, COUNTRIES);
    currentRun.current = online?.id ?? null;
    setRun(online && { id: online.id, claim: online.claim, board: online.board });
    setSave(online ? null : { status: 'offline' });
    dispatch({ type: 'start', config, pool, order: shuffle(pool, online ? seededRandom(online.seed) : random), now: Date.now() });
    setNewBest(false);
    warned.current = null;
    setMenuOpen(false);
    setArmed(null);
    setTip(null);
    setConfirming(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }
  const hint = () => dispatch({ type: 'hint', rand: random(), now: Date.now() });
  const togglePause = () =>
    dispatch(state.phase === 'paused' ? { type: 'resume', now: Date.now() } : { type: 'pause', now: Date.now() });
  // Give up always goes through one central dialog, which pauses the clock while it's open.
  const askGiveUp = () => {
    setMenuOpen(false);
    if (state.phase === 'playing') dispatch({ type: 'pause', now: Date.now() });
    setConfirming({ resume: state.phase === 'playing' });
  };
  const cancelGiveUp = () => {
    if (confirming?.resume) dispatch({ type: 'resume', now: Date.now() });
    setConfirming(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const giveUp = () => {
    setConfirming(null);
    dispatch({ type: 'giveUp', now: Date.now() });
  };

  function onShapeClick(id: string, pointerType: string) {
    if (state.phase === 'review') {
      if (state.pool.includes(id)) mapRef.current?.focus(id, 8);
      return;
    }
    if (state.phase !== 'playing' || mode !== 'locate') return;
    // On touch, a tap on something too small to hit reliably zooms first; a second tap answers.
    if (pointerType === 'touch' && armed !== id && !mapRef.current?.isVisible(id, 24)) {
      setArmed(id);
      mapRef.current?.focus(id, 10);
      say('Tap again to choose', 'info');
      return;
    }
    setArmed(null);
    dispatch({ type: 'click', id, now: Date.now() });
  }

  // Keyboard: Esc pause, ? hint, S skip, + − 0 zoom, Enter start/replay, typing goes to the input.
  const overlay = renderOverlay();
  const keys = useRef({ state, guess, start, hint, togglePause, confirming, cancelGiveUp, blocked: false });
  useLayoutEffect(() => {
    keys.current = { state, guess, start, hint, togglePause, confirming, cancelGiveUp, blocked: overlay !== null };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { state: s, guess: g, start: go, hint: h, togglePause: pause, confirming: asking, cancelGiveUp: cancel, blocked } = keys.current;
      // A card is open over the map: it handles its own keys.
      if (blocked) return;
      const inField = e.target instanceof HTMLInputElement;
      const onButton = e.target instanceof HTMLButtonElement;
      const inCorner = e.target instanceof Element && !!e.target.closest('.corner, [role="menuitem"]');
      if (e.key === 'Escape' && asking) return void cancel();
      if (e.key === 'Escape' && (s.phase === 'playing' || s.phase === 'paused')) return void pause();
      // In setup, Enter always starts (Space still toggles a focused chip). In review it replays unless a button has focus.
      if (e.key === 'Enter' && s.phase === 'setup' && !inField && !inCorner) {
        e.preventDefault();
        return void go();
      }
      if (e.key === 'Enter' && s.phase === 'review' && !onButton) return void go(s.config);
      if (s.phase !== 'playing') return;
      if (e.key === '?') {
        e.preventDefault();
        return void h();
      }
      const typing = s.config.mode !== 'locate';
      if (!typing && (e.key === 's' || e.key === 'S')) return void dispatch({ type: 'skip', now: Date.now() });
      if (!inField) {
        if (e.key === '+' || e.key === '=') return void mapRef.current?.zoomBy(1.6);
        if (e.key === '-' || e.key === '_') return void mapRef.current?.zoomBy(1 / 1.6);
        if (e.key === '0') return void mapRef.current?.fit();
        if (typing && e.key.length === 1 && !onButton) {
          e.preventDefault();
          inputRef.current?.focus();
          g.onChange(g.value + e.key);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // What the map shows.
  const config = state.phase === 'setup' ? draft : state.config;
  const pool = useMemo(() => (state.phase === 'setup' ? poolFor(draft.scope, COUNTRIES) : state.pool), [state.phase, draft.scope, state.pool]);
  const frame = useMemo(() => (isWorld(config.scope) ? ('world' as const) : new Set(pool)), [config.scope, pool]);
  const rotate = rotationFor(new Set(pool.map((id) => COUNTRY.get(id)!.continent)));
  const shapeList = Array.isArray(shapes) ? shapes : null;
  const allIds = useMemo(() => shapeList?.map((s) => s.id) ?? [], [shapeList]);
  const states = useMemo(
    () => shapeStates(allIds, state.phase, pool, state.found, state.missed, justFound, OWNERS),
    [allIds, state.phase, pool, state.found, state.missed, justFound],
  );
  const markers = useMemo(() => pool.filter((id) => GEO_META[id]?.tiny), [pool]);
  const highlights: Highlight[] = [];
  if (state.hint && state.phase === 'playing' && mode === 'type') highlights.push({ id: state.hint.id, kind: 'hint' });
  if (goal && mode === 'identify' && state.phase === 'playing') highlights.push({ id: goal, kind: 'target' });
  if (mapFlash) highlights.push(mapFlash);
  if (hovered && state.phase === 'review') highlights.push({ id: hovered, kind: 'hover' });
  const areaPulse = mode === 'locate' && (state.hint?.level ?? 0) >= 3 && state.phase === 'playing' ? state.hint!.id : null;
  // Clues so far for the hinted country (Type: any missing country; Locate/Identify: the current target).
  const hinted = state.hint && state.phase === 'playing' && (mode === 'type' || state.hint.id === goal) ? state.hint : null;
  const clues = hinted ? Array.from({ length: hinted.level }, (_, i) => clue(mode, i + 1, hinted.id)) : [];
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const draftBoard = boardFor(draft);

  /** The card over the map, if any: from the URL (sign in, leaderboards, your games) or opened in place. */
  function renderOverlay(): ReactNode {
    if ((state.phase !== 'setup' && state.phase !== 'review') || user === undefined) return null;
    const home = () => go({ name: 'home' });
    if (card === 'name' && user) {
      return (
        <NameCard
          onDone={(u) => {
            setUser(u);
            setCard(null);
            refreshBests();
          }}
          onClose={() => setCard(null)}
        />
      );
    }
    if (card === 'delete' && user) {
      return (
        <DeleteAccount
          user={user}
          onDeleted={() => {
            setUser(null);
            setBests(new Map());
            setCard(null);
            home();
            say('Account deleted', 'info');
          }}
          onClose={() => setCard(null)}
        />
      );
    }
    if (route.name === 'board') {
      return <Leaderboard mode={route.mode} region={route.region} onPick={(mode, region) => go({ name: 'board', mode, region }, { replace: true })} onClose={home} />;
    }
    if (route.name === 'me' && user) return <YourGames user={user} onBoard={openBoard} onClose={home} onSignedOut={() => setUser(null)} />;
    if ((route.name === 'me' || route.name === 'signin') && !user) return <SignInCard onSignIn={beginSignIn} onClose={home} />;
    return null;
  }
  const safe = safeArea(state.phase === 'paused' ? 'playing' : state.phase, small, size.width, size.height, keyboard);

  const clock = limitMs === null ? formatClock(spent) : formatCountdown(limitMs - spent);
  const clockLevel = left <= 10_000 ? 'crit' : left <= 60_000 ? 'warn' : '';
  const rows = progressRows(state.pool, state.found, COUNTRY);
  const modeLabel = MODES.find((m) => m.id === mode)!.label;
  const pill = `${scopeLabel(state.config.scope)} · ${modeLabel}`;

  return (
    <div className={`app phase-${state.phase}`} style={{ '--kb': `${keyboard}px` } as CSSProperties}>
      <div className="map-wrap" ref={wrapRef} aria-hidden={state.phase === 'paused'}>
        {shapeList && size.width > 0 && (
          <WorldMap
            ref={mapRef}
            shapes={shapeList}
            width={size.width}
            height={size.height}
            rotate={rotate}
            frame={frame}
            safe={safe}
            states={states}
            markers={markers}
            highlights={highlights}
            areaPulse={areaPulse}
            mode={state.phase === 'review' ? 'review' : mode === 'locate' && playing ? 'locate' : 'browse'}
            reducedMotion={reducedMotion}
            onShapeClick={onShapeClick}
            onShapeHover={
              state.phase === 'review'
                ? (id, x, y) => setTip(id && state.pool.includes(id) ? { id, x, y } : null)
                : undefined
            }
          />
        )}
      </div>
      {shapes === null && <div className="loading mute">Loading the map…</div>}
      {shapes instanceof Error && <div className="loading">{shapes.message}. Reload to try again.</div>}

      {state.phase === 'setup' && (
        <>
          <div className="corner">
            <Wordmark />
            <div className="corner-actions">
              <button type="button" className="btn" aria-label="Leaderboards" onClick={() => openBoard(draftBoard ?? 'type:world')}>
                <Icon name="trophy" size={15} />
                <span className="btn-label">Leaderboards</span>
              </button>
              {user ? (
                <UserMenu
                  user={user}
                  onGames={() => go({ name: 'me' })}
                  onBoards={() => openBoard(draftBoard ?? 'type:world')}
                  onPickName={() => setCard('name')}
                  onSignOut={() => {
                    void signOut();
                    setBests(new Map());
                    say('Signed out', 'info');
                  }}
                  onDelete={() => setCard('delete')}
                />
              ) : (
                user === null && (
                  <button type="button" className="btn" onClick={() => go({ name: 'signin' })}>
                    Sign in
                  </button>
                )
              )}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
          <SetupCard
            config={draft}
            best={readBest(storage, draft)}
            serverBest={user && draftBoard ? (bests.get(draftBoard) ?? null) : null}
            onChange={setDraft}
            onStart={() => start()}
          />
        </>
      )}

      {playing && (
        <>
          <TopBar
            pill={pill}
            ranked={rankedRun}
            found={state.found.length}
            total={state.pool.length}
            clock={clock}
            clockLevel={clockLevel}
            paused={state.phase === 'paused'}
            theme={theme}
            onTheme={toggleTheme}
            onHint={hint}
            onPause={togglePause}
            onGiveUp={askGiveUp}
            onMenu={() => setMenuOpen(!menuOpen)}
          />
          <div className="dock">
            <Toast toast={toast} />
            <HintCard clues={clues} levels={HINT_LEVELS[mode]} />
            {mode === 'locate' && goal ? (
              <LocatePrompt
                targetId={goal}
                name={nameOf(goal)}
                triesLeft={state.triesLeft}
                onSkip={() => dispatch({ type: 'skip', now: Date.now() })}
              />
            ) : (
              <GuessInput
                ref={inputRef}
                value={guess.value}
                placeholder={mode === 'identify' ? 'Name the highlighted country…' : 'Type a country…'}
                shakeSeq={guess.shakeSeq}
                targetId={mode === 'identify' ? goal : null}
                onChange={guess.onChange}
                onSubmit={guess.onSubmit}
              />
            )}
            {mode === 'identify' && (
              <button type="button" className="skip-link mute" onClick={() => dispatch({ type: 'skip', now: Date.now() })}>
                Skip
              </button>
            )}
          </div>
          {!small && <RegionProgress rows={rows} />}
          <ZoomControls onIn={() => mapRef.current?.zoomBy(1.6)} onOut={() => mapRef.current?.zoomBy(1 / 1.6)} onFit={() => mapRef.current?.fit()} />
          {state.phase === 'paused' && (
            <PauseOverlay
              confirming={confirming !== null}
              ranked={rankedRun}
              onResume={togglePause}
              onAskGiveUp={askGiveUp}
              onCancel={cancelGiveUp}
              onGiveUp={giveUp}
            />
          )}
          {menuOpen && small && (
            <div className="sheet glass" role="dialog" aria-label="Menu">
              <div className="sheet-actions">
                <button type="button" className="btn" onClick={() => (setMenuOpen(false), hint())}>
                  <Icon name="hint" /> Hint
                </button>
                <button type="button" className="btn" onClick={() => (setMenuOpen(false), togglePause())}>
                  <Icon name="pause" /> Pause
                </button>
                <GiveUpButton onGiveUp={askGiveUp} />
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
              </div>
              <div className="bars">
                {rows.map((r) => (
                  <div key={r.label} className="bar">
                    <span>{r.label}</span>
                    <span className="track">
                      <i style={{ width: `${(r.found / r.total) * 100}%` }} />
                    </span>
                    <span className="mono n">
                      {r.found}/{r.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {state.phase === 'review' && (
        <>
          <header className="topbar glass review-bar">
            <Wordmark />
            <span className="pill mono hide-sm">{pill}</span>
            <div className="tb-spacer" />
            <Score found={state.found.length} total={state.pool.length} />
            <span className="mute">·</span>
            <span className="clock mono">{formatClock(state.elapsedMs)}</span>
            {state.hintsUsed > 0 && <span className="mute hide-sm">· {state.hintsUsed} hint{state.hintsUsed === 1 ? '' : 's'}</span>}
            {newBest && <span className="badge">New best</span>}
            <div className="tb-spacer" />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button type="button" className="btn hide-sm" onClick={() => dispatch({ type: 'toSetup' })}>
              Change setup
            </button>
            <button type="button" className="btn primary" onClick={() => start(state.config)}>
              Play again <kbd>↵</kbd>
            </button>
          </header>
          {save && (
            <div className="save-dock">
              <SaveCard save={save} signedIn={!!user} onSignIn={beginSignIn} onRetry={() => run && finish(run, state.log)} onBoard={openBoard} />
            </div>
          )}
          <ReviewPanel
            pool={state.pool}
            missed={state.missed}
            hovered={hovered}
            onHover={setHovered}
            onPick={(id) => mapRef.current?.focus(id, 8)}
          />
          {small && (
            <button type="button" className="btn change-setup-sm" onClick={() => dispatch({ type: 'toSetup' })}>
              <Icon name="back" /> Setup
            </button>
          )}
          <ZoomControls onIn={() => mapRef.current?.zoomBy(1.6)} onOut={() => mapRef.current?.zoomBy(1 / 1.6)} onFit={() => mapRef.current?.fit()} />
          {tip && (
            <div className="tip glass" style={{ left: tip.x + 14, top: tip.y - 40 }}>
              <b>{nameOf(tip.id)}</b> <span className="mute">· {COUNTRY.get(tip.id)!.subregion}</span>
            </div>
          )}
        </>
      )}

      {overlay}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
