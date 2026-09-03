import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game } from './game/engine';
import { Renderer } from './game/render';
import { createInput, attachInput, isTouchDevice } from './game/input';
import { audio } from './game/audio';
import { LOADOUTS } from './game/weapons';
import { loadHighScores, saveHighScore, loadName, saveName, loadPrefs, savePrefs } from './game/storage';
import type { Announcement, Difficulty, HighScore, HudSnapshot, KillFeedItem, MatchResult } from './game/types';
import { StartScreen } from './components/StartScreen';
import { HUD } from './components/HUD';
import { PauseMenu } from './components/PauseMenu';
import { GameOverScreen } from './components/GameOverScreen';
import { TouchControls } from './components/TouchControls';
import { Scoreboard } from './components/Scoreboard';

type Screen = 'menu' | 'playing' | 'over';

const EMPTY_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  mag: 30,
  reserve: 180,
  weaponName: '',
  weaponId: 'ar',
  secondaryName: '',
  reloading: false,
  reloadProgress: 0,
  grenades: 2,
  kills: 0,
  deaths: 0,
  streak: 0,
  score: 0,
  teamScore: [0, 0],
  timeLeft: 300,
  alive: true,
  respawnIn: 0,
  uavT: 0,
  airstrikeReady: false,
  scoreLimit: 30,
  lowHp: false,
  scoreboard: [],
};

export default function App() {
  const touch = useMemo(() => isTouchDevice(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef(createInput(touch));
  const rafRef = useRef(0);
  const annId = useRef(1);

  const [screen, setScreen] = useState<Screen>('menu');
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [feed, setFeed] = useState<KillFeedItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [rank, setRank] = useState(-1);
  const [scores, setScores] = useState<HighScore[]>(() => loadHighScores());
  const [showBoard, setShowBoard] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('cos_muted') === '1';
    } catch {
      return false;
    }
  });

  const prefs = useMemo(() => loadPrefs(), []);
  const [name, setNameState] = useState(() => loadName());
  const [loadoutId, setLoadoutIdState] = useState(prefs.loadout);
  const [difficulty, setDifficultyState] = useState<Difficulty>((prefs.difficulty as Difficulty) || 'regular');

  const setName = (n: string) => {
    setNameState(n);
    saveName(n);
  };
  const setLoadoutId = (id: string) => {
    setLoadoutIdState(id);
    savePrefs({ loadout: id, difficulty });
  };
  const setDifficulty = (d: Difficulty) => {
    setDifficultyState(d);
    savePrefs({ loadout: loadoutId, difficulty: d });
  };
  const toggleMute = () => {
    audio.init();
    const m = !muted;
    setMuted(m);
    audio.setMuted(m);
  };

  const announce = useCallback((a: Omit<Announcement, 'id'>) => {
    const id = annId.current++;
    setAnnouncements((prev) => [...prev.slice(-1), { ...a, id }]);
    setTimeout(() => setAnnouncements((prev) => prev.filter((x) => x.id !== id)), 2200);
  }, []);

  // ----- resize -----
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      rendererRef.current?.resize(w, h);
      gameRef.current?.resize(w, h);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // ----- kill feed pruning -----
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now();
      setFeed((prev) => (prev.some((f) => now - f.time > 5000) ? prev.filter((f) => now - f.time <= 5000) : prev));
    }, 500);
    return () => clearInterval(t);
  }, []);

  // ----- game lifecycle -----
  const stopLoop = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const startGame = useCallback(() => {
    stopLoop();
    audio.init();
    audio.startAmbient();
    const canvas = canvasRef.current!;
    const loadout = LOADOUTS.find((l) => l.id === loadoutId) ?? LOADOUTS[0];
    const game = new Game(
      { loadout, difficulty, playerName: name.trim() || 'YOU', touch },
      {
        onKillFeed: (item) => setFeed((prev) => [...prev.slice(-4), { ...item, time: performance.now() }]),
        onAnnounce: announce,
        onHud: (h) => setHud(h),
        onGameOver: (r) => {
          setResult(r);
          const { list, rank } = saveHighScore(name.trim() || 'SOLDIER', r);
          setScores(list);
          setRank(rank);
          setScreen('over');
          setPaused(false);
        },
        onHitMarker: () => {},
      },
    );
    const renderer = new Renderer(canvas, game.map);
    gameRef.current = game;
    rendererRef.current = renderer;
    renderer.resize(window.innerWidth, window.innerHeight);
    game.resize(window.innerWidth, window.innerHeight);
    game.cam.x = game.player.x;
    game.cam.y = game.player.y;
    setFeed([]);
    setAnnouncements([]);
    setHud(game.snapshot());
    setPaused(false);
    setResult(null);
    setRank(-1);
    setScreen('playing');
    // reset transient input
    const inp = inputRef.current;
    inp.fire = inp.reload = inp.swap = inp.grenade = inp.killstreak = false;
    inp.moveX = inp.moveY = 0;
    inp.mouseDown = false;
    if (!touch && inp.mouseX === 0 && inp.mouseY === 0) {
      inp.mouseX = window.innerWidth / 2 + 120;
      inp.mouseY = window.innerHeight / 2;
    }

    let last = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      const r = rendererRef.current;
      if (!g || !r) return;
      g.update(dt, inp);
      r.render(g, inp, dt);
    };
    rafRef.current = requestAnimationFrame(loop);

    if (touch) {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      try {
        (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
      } catch {
        /* ignore */
      }
      try {
        const so = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        so.lock?.('landscape').catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }, [loadoutId, difficulty, name, touch, announce]);

  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.state === 'over') return;
    g.togglePause();
    setPaused(g.state === 'paused');
    const inp = inputRef.current;
    inp.moveX = inp.moveY = 0;
    inp.fire = inp.aimActive = inp.mouseDown = false;
    inp.keys.clear();
    audio.init();
    if (g.state === 'paused') audio.uiBack();
    else audio.ui();
  }, []);

  const quitToMenu = useCallback(() => {
    stopLoop();
    gameRef.current = null;
    setScreen('menu');
    setPaused(false);
    setScores(loadHighScores());
    audio.uiBack();
  }, []);

  // input listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cleanup = attachInput(inputRef.current, canvas, {
      onPause: () => {
        if (gameRef.current && gameRef.current.state !== 'over') togglePause();
      },
      onScoreboard: (d) => setShowBoard(d),
    });
    return cleanup;
  }, [togglePause]);

  // auto-pause when tab hidden
  useEffect(() => {
    const onVis = () => {
      const g = gameRef.current;
      if (document.hidden && g && g.state === 'playing') {
        g.togglePause();
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // keyboard shortcuts on menus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === 'over' && (e.code === 'Enter' || e.code === 'Space')) startGame();
      if (screen === 'menu' && e.code === 'Enter' && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') startGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, startGame]);

  const playing = screen === 'playing';

  return (
    <div className="relative w-full h-full bg-[#0b0f14] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: playing && !paused && !touch ? 'none' : 'default', visibility: screen === 'menu' ? 'hidden' : 'visible' }}
      />

      {screen !== 'menu' && (
        <HUD hud={hud} feed={feed} announcements={announcements} touch={touch} onPause={togglePause} playerName={name} />
      )}

      {playing && touch && !paused && <TouchControls input={inputRef.current} airstrikeReady={hud.airstrikeReady} grenades={hud.grenades} />}

      {playing && showBoard && !paused && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none bg-black/30">
          <Scoreboard rows={hud.scoreboard} teamScore={hud.teamScore} />
        </div>
      )}

      {playing && paused && (
        <PauseMenu
          hud={hud}
          muted={muted}
          onResume={togglePause}
          onRestart={() => {
            audio.ui();
            startGame();
          }}
          onQuit={quitToMenu}
          onToggleMute={toggleMute}
        />
      )}

      {screen === 'over' && result && (
        <GameOverScreen
          result={result}
          scores={scores}
          rank={rank}
          hud={hud}
          onRestart={() => {
            audio.ui();
            startGame();
          }}
          onMenu={quitToMenu}
        />
      )}

      {screen === 'menu' && (
        <StartScreen
          name={name}
          setName={setName}
          loadoutId={loadoutId}
          setLoadoutId={setLoadoutId}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          scores={scores}
          muted={muted}
          toggleMute={toggleMute}
          touch={touch}
          onStart={startGame}
        />
      )}
    </div>
  );
}
