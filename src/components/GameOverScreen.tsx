import type { MatchResult, HighScore, HudSnapshot } from '../game/types';
import { HighScoreTable } from './HighScoreTable';
import { Scoreboard } from './Scoreboard';

interface Props {
  result: MatchResult;
  scores: HighScore[];
  rank: number;
  hud: HudSnapshot;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOverScreen({ result, scores, rank, hud, onRestart, onMenu }: Props) {
  const won = result.won;
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-md overflow-y-auto scanlines scrollable z-30">
      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8 gap-5">
        <div className="text-center fade-in">
          <div className={`text-xs tracking-[0.45em] font-bold ${won ? 'text-sky-400' : 'text-red-400'}`}>MATCH COMPLETE</div>
          <div
            className={`font-display text-7xl sm:text-9xl font-bold leading-none ${won ? 'text-sky-300' : 'text-red-400'}`}
            style={{ textShadow: `0 0 40px ${won ? 'rgba(56,189,248,0.5)' : 'rgba(255,77,77,0.5)'}` }}
          >
            {won ? 'VICTORY' : result.teamScore[0] === result.teamScore[1] ? 'DRAW' : 'DEFEAT'}
          </div>
          <div className="mt-1 font-display text-3xl text-white/80 tabular-nums">
            <span className="text-sky-300">{result.teamScore[0]}</span> <span className="text-white/30">—</span>{' '}
            <span className="text-red-300">{result.teamScore[1]}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full max-w-3xl fade-in" style={{ animationDelay: '0.1s' }}>
          {[
            ['SCORE', result.score.toLocaleString(), 'text-amber-300'],
            ['KILLS', result.kills, 'text-white'],
            ['DEATHS', result.deaths, 'text-white'],
            ['BEST STREAK', result.bestStreak, 'text-orange-300'],
            ['ACCURACY', Math.round(result.accuracy * 100) + '%', 'text-white'],
          ].map(([l, v, c]) => (
            <div key={l as string} className="bg-white/[0.05] border border-white/10 panel p-3 text-center">
              <div className="text-[10px] tracking-[0.25em] text-white/45 font-bold">{l}</div>
              <div className={`font-display text-3xl font-bold tabular-nums ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {rank >= 0 && (
          <div className="text-amber-300 font-bold tracking-[0.3em] text-sm animate-pulse fade-in">
            ★ NEW RECORD — RANK #{rank + 1} ON THE LEADERBOARD ★
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 fade-in" style={{ animationDelay: '0.2s' }}>
          <button onClick={onRestart} className="btn-tactical pulse-glow bg-amber-400 text-black font-display text-3xl font-bold px-10 py-2 tracking-wider cursor-pointer">
            ↻ PLAY AGAIN
          </button>
          <button onClick={onMenu} className="btn-tactical bg-white/10 border border-white/20 text-white font-display text-3xl font-bold px-8 py-2 tracking-wider cursor-pointer hover:bg-white/20">
            ☰ MENU
          </button>
        </div>

        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 fade-in" style={{ animationDelay: '0.3s' }}>
          <Scoreboard rows={hud.scoreboard} teamScore={hud.teamScore} />
          <div className="bg-black/60 border border-white/10 panel p-3">
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2 font-semibold">Local Leaderboard</div>
            <HighScoreTable scores={scores} highlight={rank} />
          </div>
        </div>
      </div>
    </div>
  );
}
