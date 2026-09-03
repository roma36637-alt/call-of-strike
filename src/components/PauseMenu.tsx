import type { HudSnapshot } from '../game/types';
import { Scoreboard } from './Scoreboard';

interface Props {
  hud: HudSnapshot;
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onToggleMute: () => void;
}

export function PauseMenu({ hud, muted, onResume, onRestart, onQuit, onToggleMute }: Props) {
  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 overflow-y-auto fade-in scrollable z-30">
      <div className="font-display text-6xl sm:text-7xl font-bold text-white tracking-widest">PAUSED</div>
      <div className="text-white/50 text-xs tracking-[0.35em] mb-5">MATCH ON HOLD</div>
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        <button onClick={onResume} className="btn-tactical bg-amber-400 text-black font-display text-2xl font-bold px-8 py-2 tracking-wider cursor-pointer">
          ▶ RESUME
        </button>
        <button onClick={onRestart} className="btn-tactical bg-white/10 border border-white/20 text-white font-display text-2xl font-bold px-6 py-2 tracking-wider cursor-pointer hover:bg-white/20">
          ↻ RESTART
        </button>
        <button onClick={onToggleMute} className="btn-tactical bg-white/10 border border-white/20 text-white font-display text-2xl font-bold px-6 py-2 tracking-wider cursor-pointer hover:bg-white/20">
          {muted ? '🔇 SOUND' : '🔊 SOUND'}
        </button>
        <button onClick={onQuit} className="btn-tactical bg-red-500/20 border border-red-400/40 text-red-200 font-display text-2xl font-bold px-6 py-2 tracking-wider cursor-pointer hover:bg-red-500/30">
          ✕ QUIT
        </button>
      </div>
      <Scoreboard rows={hud.scoreboard} teamScore={hud.teamScore} />
    </div>
  );
}
