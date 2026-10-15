import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, signInHref, type ApiError } from './api/client.ts';
import { addClaim, migrateClaims, readClaims, removeClaims, saveResume, sessionStore, takeResume, type Run, type SaveState } from './api/resume.ts';
import { useSession } from './api/session.ts';
import { LOCAL_IMPORT_BEFORE, MAX_CLAIMS_PER_REQUEST, MAX_IMPORTS_PER_REQUEST, type BestSummary } from './api/types.ts';
import { capitalOf } from './data/capitals.ts';
import { COUNTRIES } from './data/countries.ts';
import { flagSrc } from './data/flags.ts';
import { GEO_META } from './data/geoMeta.ts';
import { COUNTRY, nameOf } from './data/lookup.ts';
import { TERRITORIES } from './data/territories.ts';
import { formatClock, formatCountdown } from './game/format.ts';
import { FACTS } from './data/facts.ts';
import { capitalChoices } from './game/capitalChoices.ts';
import { removedChoices } from './game/choices.ts';
import { flagChoices } from './game/flagChoices.ts';
import { clueFor } from './game/hints.ts';
import { learnStats } from './game/learn.ts';
import type { LogEntry } from './game/log.ts';
import { boardFor, boardKey, parseBoard, type Board } from './game/ranking.ts';
import { groupOf, progressRows } from './game/progress.ts';
import { elapsed, initialState, reduce, target } from './game/reducer.ts';
import { seededRandom, shuffle } from './game/rng.ts';
import { isWorld, poolFor, scopeLabel, WORLD } from './game/scope.ts';
import { hintLevels, isPick, rulesFor, TOPIC_LABEL, topicOf } from './game/topics.ts';
import type { GameConfig } from './game/types.ts';
import { rotationFor, type Rect } from './map/geometry.ts';
import { useShapes } from './map/useShapes.ts';
import { WorldMap, type Highlight, type MapHandle } from './map/WorldMap.tsx';
import { buildIndex } from './match/nameIndex.ts';
import { localBests, readBest, recordResult } from './store/bests.ts';
import { emailKey, hasImported, markImported } from './store/imported.ts';
import { readJson, safeStorage, writeJson } from './store/storage.ts';
import { readLearned, resetLearned } from './store/learned.ts';
import { readTheme, writeTheme, type Theme } from './store/theme.ts';
import { GuessInput } from './ui/GuessInput.tsx';
import { useKeyboardInset, useMediaQuery, useNow, useSize, useTransient } from './ui/hooks.ts';
import { Icon } from './ui/Icon.tsx';
import { LocatePrompt } from './ui/LocatePrompt.tsx';
import { GiveUpDialog } from './ui/GiveUpDialog.tsx';
import { RegionProgress } from './ui/RegionProgress.tsx';
import { ReviewPanel } from './ui/ReviewPanel.tsx';
import { MODES, SetupCard } from './ui/SetupCard.tsx';
import { shapeStates } from './ui/shapeStates.ts';
import { Toast, type ToastMessage } from './ui/Toast.tsx';
import { HintCard } from './ui/HintCard.tsx';
import { DeleteAccount } from './ui/DeleteAccount.tsx';
import { FlagCard } from './ui/FlagCard.tsx';
import { Choices } from './ui/Choices.tsx';
import { CountryPrompt } from './ui/CountryPrompt.tsx';
import { Leaderboard } from './ui/Leaderboard.tsx';
import { NameCard } from './ui/NameCard.tsx';
import { routePath, useRoute } from './ui/router.ts';
import { SaveCard } from './ui/SaveCard.tsx';
import { SignInCard } from './ui/SignInCard.tsx';
import { UserMenu } from './ui/UserMenu.tsx';
import { YourGames } from './ui/YourGames.tsx';
import { GiveUpButton, Score, ThemeToggle, TopBar, Wordmark } from './ui/TopBar.tsx';
import { useGuess } from './ui/useGuess.ts';
import { LearnCard } from './ui/LearnCard.tsx';
import { LearnSummary } from './ui/LearnSummary.tsx';
import { useLearn } from './ui/useLearn.ts';
import { ZoomControls } from './ui/ZoomControls.tsx';

/** How much taller than an input the dock stands with the capital choices (measured 102 px as 2×2 on phones, 62 as one row wide, plus room
 * for a capital that wraps to two lines), or with the "Capital of" line above the input (44 px and the dock's 10 px gap). */
const CAPITAL_CHOICES_EXTRA = { small: 110, wide: 70 };
const COUNTRY_PROMPT_EXTRA = 54;
/** Flags · Learn: how much taller than an input the learn card stands (flag, answer line, the four names: measured 306 px on phones, 320 wide). */
const LEARN_CARD_EXTRA = { small: 254, wide: 268 };
const DEFAULT_CONFIG: GameConfig = { mode: 'type', scope: WORLD, timeLimitSec: null };
const INDEX = buildIndex(COUNTRIES, TERRITORIES);
/** Territory shape → the country whose color it shares (Greenland → Denmark). */
const OWNERS = new Map(TERRITORIES.flatMap((t) => (t.sovereign && t.geo ? [[t.id, t.sovereign] as const] : [])));
const clue = (config: GameConfig, level: number, id: string) =>
  clueFor(config, level, { country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });
const storage = safeStorage();
/** Wait before the one automatic retry of /finish after a network failure. */
const FINISH_RETRY_MS = 800;
const session = sessionStore();
/** The name card opens by itself once per browser session; the user menu can open it any time. */
const NAME_ASKED = 'mapped:name-asked:v1';
/** `?seed=42` makes target order reproducible (used by end-to-end tests). */
const SEED = Number(new URLSearchParams(window.location.search).get('seed')) || null;
const random = SEED ? seededRandom(SEED) : Math.random;

/** Where chrome doesn't cover the map, per screen. The map frames selections inside this. `dock` is how much taller than an input the dock stands (a flag card, four choices, a "Capital of" line). */
function safeArea(phase: string, small: boolean, width: number, height: number, keyboard: number, dock = 0): Rect {
  const box = (top: number, right: number, bottom: number, left: number): Rect => ({
    x: left,
    y: top,
    width: Math.max(80, width - left - right),
    height: Math.max(80, height - top - bottom),
  });
  if (small) {
    if (phase === 'setup') return box(56, 12, Math.round(height * 0.58), 12);
    if (phase === 'review') return box(64, 12, Math.round(height * 0.42), 12);
    return box(64, 12, 84 + dock + keyboard, 12);
  }
  if (phase === 'setup') return box(64, 470, 32, 32);
  if (phase === 'review') return box(84, 300, 28, 28);
  return box(80, 32, 96 + dock, 32);
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
  /** Flags · Learn, kept apart from the ranked game: no server, no board. The setup's Play | Learn choice lasts for this visit only. */
  const learn = useLearn(storage, random);
  const [learnPicked, setLearnPicked] = useState(false);
  /** Bumped by Reset, so the setup re-reads the learned count. */
  const [, setLearnedSeq] = useState(0);
  const lesson = learn.session?.state ?? null;
  const learning = lesson !== null && lesson.phase !== 'done';
  const learnZoomed = useRef(false);
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
  /** Type: the missing country picked on the map for hints. */
  const [picked, setPicked] = useState<string | null>(null);
  /** Type: Hint was pressed with nothing picked, so the next pick gets the hint. */
  const [wantHint, setWantHint] = useState(false);
  /** Pick games (Flags · Identify, Capitals · Identify): choices picked wrongly for the current target (keyed by game and target, so they reset as it moves on). */
  const [wrongChoices, setWrongChoices] = useState<{ game: number | null; goal: string; ids: string[] } | null>(null);
  /** Mirrors wrongChoices synchronously, so a second click before the re-render can't spend another try on the same choice. */
  const wrongChoicesNow = useRef(wrongChoices);
  /** The "Give up?" dialog is open. The clock keeps running behind it. */
  const [confirming, setConfirming] = useState(false);
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
  const guess = useGuess({ state, dispatch, index: INDEX, say, flash: flashJust, onHint: () => hint() });

  const playing = state.phase === 'playing';
  const mode = state.config.mode;
  const topic = topicOf(state.config);
  const rules = rulesFor(state.config);
  const goal = target(state);
  const pick = playing && !rules.ordered && picked && !state.found.includes(picked) ? picked : null;
  const picking = isPick(rules.answer);
  /** The target is lit on the map: Identify games (prompt `map`) and Capitals · Type / Identify (prompt `country`, also named in the dock). */
  const lit = rules.prompt === 'map' || rules.prompt === 'country';
  /** Seeds the four choices: the server's seed, or the start time for games played offline. */
  const gameSeed = run?.seed ?? state.startedAt ?? 0;
  const choices = useMemo(
    () => (!goal ? [] : rules.answer === 'flag' ? flagChoices(goal, gameSeed) : rules.answer === 'capitalPick' ? capitalChoices(goal, gameSeed) : []),
    [goal, rules.answer, gameSeed],
  );
  const wrongPicks = wrongChoices && wrongChoices.game === state.startedAt && wrongChoices.goal === goal ? wrongChoices.ids : [];
  // Each rung of the hint ladder takes away one more wrong choice, in the order they're shown.
  const choiceHints = goal && state.hint?.id === goal && picking ? state.hint.level : 0;
  const disabledChoices = goal ? [...wrongPicks, ...removedChoices(choices, goal, wrongPicks, choiceHints)] : [];
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

  // There is no pause: the clock always runs. The "Give up?" question closes if the game ends under it (a countdown running out).
  useEffect(() => {
    if (state.phase !== 'playing') setConfirming(false);
  }, [state.phase]);

  // React to game events: glow, flashes, toasts, screen-reader announcements.
  useEffect(() => {
    const e = state.event;
    if (!e) return;
    const name = nameOf(e.id);
    // Capitals: "Nairobi · Kenya"; otherwise the country.
    const answerName = topic === 'capitals' ? `${capitalOf(e.id)} · ${name}` : name;
    if (e.kind === 'found') {
      flashJust(e.id);
      const group = groupOf(e.id, state.pool, COUNTRY);
      const row = progressRows(state.pool, state.found, COUNTRY).find((r) => r.label === group);
      const count = `${state.found.length} of ${state.pool.length}.`;
      setAnnouncement(rules.answer === 'flag' ? `Correct: ${name}. ${count}` : `${answerName}, found. ${count}`);
      if (e.corrected) say(`Accepted as ${answerName}`, 'good');
      else if (topic !== 'countries') say(answerName, 'good');
      else if (!rules.ordered) say(`${name}${row && row.total > 1 ? ` · ${group} ${row.found}/${row.total}` : ''}`, 'good');
    } else if (e.kind === 'wrong') {
      setMapFlash({ id: e.id, kind: 'wrong', label: name, seq: e.seq });
      if (rules.answer === 'capitalPick') say(`No, that's ${capitalOf(e.id)} (${name})`, 'warn');
      else setAnnouncement(rules.answer === 'flag' ? `No, that's ${name}'s flag.` : `No, that's ${name}.`);
    } else if (e.kind === 'revealed') {
      setMapFlash({ id: e.id, kind: 'reveal', label: name, seq: e.seq });
      say(topic === 'countries' ? `That was ${name}` : `It was ${answerName}`, 'warn');
    } else if (e.kind === 'hint') {
      setAnnouncement(`Hint: ${clue(state.config, e.level, e.id)}`);
      // Clicking answers: show the target's region only, then close in for the circle.
      if (rules.answer === 'click' && e.level === 1) {
        const sub = COUNTRY.get(e.id)!.subregion;
        mapRef.current?.frameIds(COUNTRIES.filter((c) => c.subregion === sub).map((c) => c.id), 6);
      }
      if (rules.answer === 'click' && e.level === 3) mapRef.current?.focus(e.id, 3);
    }
  }, [state.event?.seq]);

  // Lit-up targets: bring a tiny or off-screen one into view.
  useEffect(() => {
    if (!lit || state.phase !== 'playing' || !goal) return;
    const id = window.setTimeout(() => {
      if (!mapRef.current?.isVisible(goal, 10)) mapRef.current?.focus(goal, 6);
    }, 120);
    return () => window.clearTimeout(id);
  }, [goal, lit, state.phase]);

  // Learn: once answered, the right country lights up; bring it into view if it's tiny or off-screen, and frame the region again
  // for the next flag.
  useEffect(() => {
    if (!lesson) return;
    const map = mapRef.current;
    if (lesson.phase === 'answered' && lesson.last) {
      if (!map?.isVisible(lesson.last.target, 14)) {
        map?.focus(lesson.last.target, 6);
        learnZoomed.current = true;
      }
    } else if (learnZoomed.current) {
      learnZoomed.current = false;
      if (lesson.phase === 'asking') map?.fit();
    }
  }, [lesson]);

  // Flags: fetch the next target's flag (Identify: its four) while this one is played.
  useEffect(() => {
    if (state.phase !== 'playing' || topic !== 'flags') return;
    const next = state.queue[1];
    if (!next) return;
    for (const id of rules.answer === 'flag' ? flagChoices(next, gameSeed) : [next]) new Image().src = flagSrc(id);
  }, [state.queue[1], state.phase, topic, rules.answer, gameSeed]);

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

  // Once we know who's signed in: come back from Google, claim games played signed out, import old local bests, load bests.
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
    if (resume?.state.phase === 'review' && keys.current.state.phase === 'setup' && !keys.current.learnOn) {
      finished.current = resume.state.startedAt;
      currentRun.current = resume.run?.id ?? null;
      dispatch({ type: 'restore', state: { ...resume.state, event: null } });
      setRun(resume.run);
      setSave(resume.save);
    }
    // Claims used to live in sessionStorage; they last 90 days in localStorage now. Moved on every load, signed in or not.
    migrateClaims(session, storage, Date.now());
    if (!user) return;
    if (user.name === null && !readJson<boolean>(session, NAME_ASKED)) {
      writeJson(session, NAME_ASKED, true);
      setCard('name');
    }
    const claims = readClaims(storage, Date.now());
    if (claims.length === 0) refreshBests();
    else void claimAll(claims, resume?.run?.id);
    void importLocalBests(user.email);
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

  /** Once per account on this browser: sends the bests saved before accounts to Your games (unranked). A failure other than 401 leaves it to retry next load. */
  async function importLocalBests(email: string) {
    let key: string;
    try {
      key = await emailKey(email);
    } catch {
      return; // no crypto.subtle (insecure context): skip, nothing is lost
    }
    if (hasImported(storage, key)) return;
    const results = localBests(storage)
      .filter((b) => b.result.at < LOCAL_IMPORT_BEFORE)
      .map(({ config, result }) => ({ config, ...result }));
    try {
      for (let i = 0; i < results.length; i += MAX_IMPORTS_PER_REQUEST) await api.importBests(results.slice(i, i + MAX_IMPORTS_PER_REQUEST));
    } catch (e) {
      if ((e as ApiError).status === 401) setUser(null);
      return;
    }
    markImported(storage, key);
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
    go({ name: 'board', ...parseBoard(board)! });
  };

  async function start(config: GameConfig = draft) {
    if (starting.current) return;
    starting.current = true;
    // The server picks the target order and times the game. If it can't be reached quickly, play offline.
    const online = await api.startGame(config).catch(() => null);
    starting.current = false;
    const pool = poolFor(config.scope, COUNTRIES);
    currentRun.current = online?.id ?? null;
    setRun(online && { id: online.id, claim: online.claim, board: online.board, seed: online.seed });
    setSave(online ? null : { status: 'offline' });
    dispatch({ type: 'start', config, pool, order: shuffle(pool, online ? seededRandom(online.seed) : random), now: Date.now() });
    setNewBest(false);
    warned.current = null;
    setMenuOpen(false);
    setArmed(null);
    setPicked(null);
    setWantHint(false);
    wrongChoicesNow.current = null;
    setWrongChoices(null);
    setTip(null);
    setConfirming(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }
  /** Flags · Learn: a round of the selected region's flags not learned yet. */
  function startLearning(scope = draft.scope) {
    setMenuOpen(false);
    setTip(null);
    learnZoomed.current = false;
    learn.start(scope);
  }
  const startFromSetup = () => (learnPicked && topicOf(draft) === 'flags' ? startLearning() : void start());
  /** One target at a time: a hint about it. Any order: about the country picked on the map, or ask for a pick. */
  const hint = () => {
    const id = rules.ordered ? goal : pick;
    if (id) return void dispatch({ type: 'hint', id, now: Date.now() });
    if (rules.ordered) return;
    setWantHint(true);
    say("Click a country you haven't found", 'info');
  };
  // Give up always goes through one central dialog. The clock keeps running while it's open.
  const askGiveUp = () => {
    setMenuOpen(false);
    setConfirming(true);
  };
  const cancelGiveUp = () => {
    setConfirming(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const giveUp = () => {
    setConfirming(false);
    dispatch({ type: 'giveUp', now: Date.now() });
  };

  function onShapeClick(id: string, pointerType: string) {
    if (state.phase === 'review') {
      if (state.pool.includes(id)) mapRef.current?.focus(id, 8);
      return;
    }
    if (state.phase === 'playing' && !rules.ordered) {
      if (!state.pool.includes(id) || state.found.includes(id)) return;
      setPicked(id);
      if (wantHint) {
        setWantHint(false);
        dispatch({ type: 'hint', id, now: Date.now() });
      }
      return;
    }
    if (state.phase !== 'playing' || rules.answer !== 'click') return;
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

  /** Pick games: a choice button or its number key (a flag, or a capital logged as its country). A wrong pick stays disabled for this target. */
  function pickChoice(id: string) {
    if (state.phase !== 'playing' || !goal || !picking || disabledChoices.includes(id)) return;
    // Read the ref, not this render's wrongPicks: a double click lands before the re-render.
    const prev = wrongChoicesNow.current;
    const already = prev && prev.game === state.startedAt && prev.goal === goal ? prev.ids : [];
    if (already.includes(id)) return;
    if (id !== goal) {
      wrongChoicesNow.current = { game: state.startedAt, goal, ids: [...already, id] };
      setWrongChoices(wrongChoicesNow.current);
    }
    dispatch({ type: 'click', id, now: Date.now() });
  }

  // Keyboard: Esc give up, ? hint, S skip, 1–4 pick a choice, + − 0 zoom, Enter start/replay, typing goes to the input.
  const overlay = renderOverlay();
  const keys = useRef({ state, guess, start, startFromSetup, hint, askGiveUp, confirming, cancelGiveUp, choices, pickChoice, blocked: false, learnOn: false });
  useLayoutEffect(() => {
    keys.current = { state, guess, start, startFromSetup, hint, askGiveUp, confirming, cancelGiveUp, choices, pickChoice, blocked: overlay !== null, learnOn: learn.session !== null };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { state: s, guess: g, start: go, startFromSetup: begin, hint: h, askGiveUp: ask, confirming: asking, cancelGiveUp: cancel, choices: options, pickChoice: pickC, blocked, learnOn } =
        keys.current;
      // Learn: its card and summary handle their own keys; only zoom is left here.
      if (learnOn) {
        if (e.key === '+' || e.key === '=') mapRef.current?.zoomBy(1.6);
        if (e.key === '-' || e.key === '_') mapRef.current?.zoomBy(1 / 1.6);
        if (e.key === '0') mapRef.current?.fit();
        return;
      }
      // A card is open over the map: it handles its own keys.
      if (blocked) return;
      const inField = e.target instanceof HTMLInputElement;
      const onButton = e.target instanceof HTMLButtonElement;
      const inCorner = e.target instanceof Element && !!e.target.closest('.corner, [role="menuitem"]');
      if (e.key === 'Escape' && asking) return void cancel();
      // The give-up question handles its own buttons; nothing else reaches the game while it's open.
      if (asking) return;
      if (e.key === 'Escape' && s.phase === 'playing') return void ask();
      // In setup, Enter always starts (Space still toggles a focused chip). In review it replays unless a button has focus.
      if (e.key === 'Enter' && s.phase === 'setup' && !inField && !inCorner) {
        e.preventDefault();
        return void begin();
      }
      if (e.key === 'Enter' && s.phase === 'review' && !onButton) return void go(s.config);
      if (s.phase !== 'playing') return;
      if (e.key === '?') {
        e.preventDefault();
        return void h();
      }
      const { answer } = rulesFor(s.config);
      // Games answered by typing have an input; the others take single keys.
      const typing = answer === 'country' || answer === 'capital';
      if (!typing && (e.key === 's' || e.key === 'S')) return void dispatch({ type: 'skip', now: Date.now() });
      if (isPick(answer) && /^[1-4]$/.test(e.key) && options[Number(e.key) - 1]) return void pickC(options[Number(e.key) - 1]);
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
  if (pick) highlights.push({ id: pick, kind: 'hint' });
  if (goal && lit && state.phase === 'playing') highlights.push({ id: goal, kind: 'target' });
  if (mapFlash) highlights.push(mapFlash);
  if (hovered && state.phase === 'review') highlights.push({ id: hovered, kind: 'hover' });
  if (learning && lesson.phase === 'answered' && lesson.last) highlights.push({ id: lesson.last.target, kind: 'target', label: nameOf(lesson.last.target) });
  const areaPulse = rules.answer === 'click' && (state.hint?.level ?? 0) >= 3 && state.phase === 'playing' ? state.hint!.id : null;
  // Clues so far for the country being asked about (any order: the picked one; one at a time: the current target).
  const asked = rules.ordered ? goal : pick;
  const hinted = playing && state.hint && state.hint.id === asked ? state.hint : null;
  const levels = hintLevels(state.config);
  // A game from before the ladder was shortened can be further up it than there are rungs now.
  const clues = hinted ? Array.from({ length: Math.min(hinted.level, levels) }, (_, i) => clue(state.config, i + 1, hinted.id)) : [];
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const draftBoard = boardFor(draft);
  // Learned flags on this browser: the setup's "30 / 45 learned" and the summary.
  const learnedIds = state.phase === 'setup' && !learning ? readLearned(storage) : new Set<string>();
  const learnSummaryPool = lesson?.phase === 'done' && learn.session ? poolFor(learn.session.scope, COUNTRIES) : [];

  /** The card over the map, if any: from the URL (sign in, leaderboards, your games) or opened in place. */
  function renderOverlay(): ReactNode {
    if ((state.phase !== 'setup' && state.phase !== 'review') || user === undefined || learn.session) return null;
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
      return <Leaderboard topic={route.topic} mode={route.mode} region={route.region} onPick={(topic, mode, region) => go({ name: 'board', topic, mode, region }, { replace: true })} onClose={home} />;
    }
    if (route.name === 'me' && user) return <YourGames user={user} onBoard={openBoard} onClose={home} onSignedOut={() => setUser(null)} />;
    if ((route.name === 'me' || route.name === 'signin') && !user) return <SignInCard onSignIn={beginSignIn} onClose={home} />;
    return null;
  }
  // Flags and Capitals games stack more in the dock: the flag card above the input, the four choices, or the "Capital of" line.
  const dockExtra = !playing
    ? 0
    : rules.answer === 'flag'
      ? (small ? 190 : 130)
      : rules.answer === 'capitalPick'
        ? (small ? CAPITAL_CHOICES_EXTRA.small : CAPITAL_CHOICES_EXTRA.wide)
        : rules.prompt === 'flag' && rules.answer !== 'click'
          ? (small ? 160 : 200)
          : rules.prompt === 'country'
            ? COUNTRY_PROMPT_EXTRA
            : 0;
  const learnExtra = small ? LEARN_CARD_EXTRA.small : LEARN_CARD_EXTRA.wide;
  const safe = learn.session
    ? safeArea('learn', small, size.width, size.height, keyboard, learnExtra)
    : safeArea(state.phase, small, size.width, size.height, keyboard, dockExtra);

  const clock = limitMs === null ? formatClock(spent) : formatCountdown(limitMs - spent);
  const clockLevel = left <= 10_000 ? 'crit' : left <= 60_000 ? 'warn' : '';
  const rows = progressRows(state.pool, state.found, COUNTRY);
  const modeLabel = MODES.find((m) => m.id === mode)!.label;
  const pill = [scopeLabel(state.config.scope), ...(topic === 'countries' ? [] : [TOPIC_LABEL[topic]]), modeLabel].join(' · ');
  const skip = () => dispatch({ type: 'skip', now: Date.now() });
  // The dock's prompt for the current target, and how it's answered.
  const locateGoal = rules.answer === 'click' ? goal : null;
  const placeholder =
    rules.answer === 'capital'
      ? 'Type its capital…'
      : rules.prompt === 'flag'
        ? 'Type the country…'
        : rules.prompt === 'map'
          ? 'Name the highlighted country…'
          : 'Type a country…';

  return (
    <div className={`app phase-${learn.session ? 'learn' : state.phase}`} style={{ '--kb': `${keyboard}px` } as CSSProperties}>
      <div className="map-wrap" ref={wrapRef}>
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
            mode={state.phase === 'review' ? 'review' : !playing ? 'browse' : rules.answer === 'click' ? 'locate' : !rules.ordered ? 'pick' : 'browse'}
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

      {state.phase === 'setup' && !learn.session && (
        <>
          <div className="corner">
            <Wordmark />
            <div className="corner-actions">
              <button type="button" className="btn" aria-label="Leaderboards" onClick={() => openBoard(draftBoard ?? boardKey(topicOf(draft), 'type', 'world'))}>
                <Icon name="trophy" size={15} />
                <span className="btn-label">Leaderboards</span>
              </button>
              {user ? (
                <UserMenu
                  user={user}
                  onGames={() => go({ name: 'me' })}
                  onBoards={() => openBoard(draftBoard ?? boardKey(topicOf(draft), 'type', 'world'))}
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
            onStart={startFromSetup}
            learn={learnPicked}
            onLearn={setLearnPicked}
            learned={pool.filter((id) => learnedIds.has(id)).length}
            onResetLearned={() => {
              resetLearned(storage, pool);
              setLearnedSeq((n) => n + 1);
            }}
          />
        </>
      )}

      {learning && learn.session?.card && (
        <>
          <TopBar
            pill={`${scopeLabel(learn.session.scope)} · Flags · Learn`}
            ranked={false}
            learn={{ learned: lesson.learned.length, total: lesson.pool.length, ...learnStats(lesson) }}
            theme={theme}
            onTheme={toggleTheme}
            onStop={learn.stop}
          />
          <div className="dock">
            <LearnCard
              key={learn.session.asked}
              card={learn.session.card}
              phase={lesson.phase}
              last={lesson.last}
              upNext={lesson.phase === 'answered' ? lesson.queue[0] : lesson.queue[1]}
              onPick={learn.pick}
              onContinue={learn.next}
              onStop={learn.stop}
            />
          </div>
          <ZoomControls onIn={() => mapRef.current?.zoomBy(1.6)} onOut={() => mapRef.current?.zoomBy(1 / 1.6)} onFit={() => mapRef.current?.fit()} />
        </>
      )}

      {lesson?.phase === 'done' && learn.session && (
        <LearnSummary
          state={lesson}
          region={scopeLabel(learn.session.scope)}
          regionLearned={learnSummaryPool.filter((id) => learnedIds.has(id)).length}
          regionTotal={learnSummaryPool.length}
          onAgain={() => startLearning(learn.session!.scope)}
          onPlay={() => {
            learn.close();
            setLearnPicked(false);
          }}
          onClose={learn.close}
        />
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
            theme={theme}
            onTheme={toggleTheme}
            onHint={hint}
            onGiveUp={askGiveUp}
            onMenu={() => setMenuOpen(!menuOpen)}
          />
          <div className="dock">
            <Toast toast={toast} />
            <HintCard
              clues={clues}
              levels={levels}
              picked={pick !== null}
              spelled={rules.answer === 'country' || rules.answer === 'capital'}
              onHint={() => {
                hint();
                inputRef.current?.focus();
              }}
            />
            {locateGoal ? (
              <LocatePrompt
                targetId={locateGoal}
                label={rules.prompt === 'capital' ? 'Whose capital is' : 'Find'}
                name={rules.prompt === 'capital' ? capitalOf(locateGoal) : nameOf(locateGoal)}
                flagId={rules.prompt === 'flag' ? locateGoal : undefined}
                triesLeft={state.triesLeft}
                onSkip={skip}
              />
            ) : picking ? (
              goal && (
                <Choices
                  kind={rules.answer === 'flag' ? 'flag' : 'capital'}
                  targetId={goal}
                  head={
                    rules.answer === 'flag' ? (
                      'Pick its flag'
                    ) : (
                      <>
                        Capital of <b>{nameOf(goal)}</b>
                      </>
                    )
                  }
                  ids={choices}
                  disabled={disabledChoices}
                  wrong={wrongPicks}
                  triesLeft={state.triesLeft}
                  onPick={pickChoice}
                />
              )
            ) : (
              <>
                {rules.prompt === 'flag' && goal && <FlagCard key={goal} id={goal} />}
                {rules.prompt === 'country' && goal && <CountryPrompt key={goal} targetId={goal} name={nameOf(goal)} />}
                <GuessInput
                  ref={inputRef}
                  value={guess.value}
                  placeholder={placeholder}
                  label={rules.answer === 'capital' ? 'Capital' : 'Country name'}
                  shakeSeq={guess.shakeSeq}
                  targetId={rules.ordered ? goal : null}
                  onChange={guess.onChange}
                  onSubmit={guess.onSubmit}
                />
              </>
            )}
            {rules.ordered && rules.answer !== 'click' && (
              <button type="button" className="skip-link mute" onClick={skip}>
                Skip
              </button>
            )}
          </div>
          {!small && <RegionProgress rows={rows} />}
          <ZoomControls onIn={() => mapRef.current?.zoomBy(1.6)} onOut={() => mapRef.current?.zoomBy(1 / 1.6)} onFit={() => mapRef.current?.fit()} />
          {confirming && <GiveUpDialog onCancel={cancelGiveUp} onGiveUp={giveUp} />}
          {menuOpen && small && (
            <div className="sheet glass" role="dialog" aria-label="Menu">
              <div className="sheet-actions">
                <button type="button" className="btn" onClick={() => (setMenuOpen(false), hint())}>
                  <Icon name="hint" /> Hint
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
            topic={topic}
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
