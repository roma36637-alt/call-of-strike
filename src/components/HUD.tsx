import type { HudSnapshot, KillFeedItem, Announcement } from '../game/types';

interface Props {
  hud: HudSnapshot;
  feed: KillFeedItem[];
  announcements: Announcement[];
  touch: boolean;
  onPause: () => void;
  playerName: string;
}

const WEAPON_LABEL: Record<string, string> = {
  ar: 'M4',
  smg: 'MP5',
  shotgun: 'SPAS-12',
  sniper: 'AWM',
  lmg: 'M249',
  pistol: 'M1911',
  grenade: 'FRAG',
  airstrike: 'AIRSTRIKE',
  suicide: 'SELF',
};

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HUD({ hud, feed, announcements, touch, onPause, playerName }: Props) {
  const hpPct = Math.max(0, hud.hp / hud.maxHp) * 100;
  const lowTime = hud.timeLeft < 30;
  const teamLead = hud.teamScore[0] > hud.teamScore[1] ? 0 : hud.teamScore[1] > hud.teamScore[0] ? 1 : -1;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20">
      {/* Top center: team score + timer */}
      <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="flex items-stretch bg-black/55 backdrop-blur-sm border border-white/10 panel overflow-hidden">
          <div className={`px-3 sm:px-4 py-1 flex items-center gap-2 ${teamLead === 0 ? 'bg-sky-400/20' : ''}`}>
            <span className="hidden sm:inline text-sky-400 text-[11px] font-bold tracking-[0.2em]">GHOSTS</span>
            <span className="font-display text-3xl sm:text-4xl font-bold text-sky-300 tabular-nums leading-none">{hud.teamScore[0]}</span>
          </div>
          <div className="px-2 sm:px-3 flex flex-col items-center justify-center border-x border-white/10">
            <span className={`font-display text-xl sm:text-2xl tabular-nums leading-none ${lowTime ? 'text-red-400 animate-pulse' : 'text-white'}`}>
              {fmtTime(hud.timeLeft)}
            </span>
            <span className="text-[9px] tracking-[0.25em] text-white/40 -mt-0.5">TO {hud.scoreLimit}</span>
          </div>
          <div className={`px-3 sm:px-4 py-1 flex items-center gap-2 ${teamLead === 1 ? 'bg-red-400/20' : ''}`}>
            <span className="font-display text-3xl sm:text-4xl font-bold text-red-300 tabular-nums leading-none">{hud.teamScore[1]}</span>
            <span className="hidden sm:inline text-red-400 text-[11px] font-bold tracking-[0.2em]">VIPERS</span>
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div className="absolute top-[18%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-full px-4">
        {announcements.map((a) => (
          <div key={a.id} className="announce text-center">
            <div
              className="font-display text-4xl sm:text-6xl font-bold leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
              style={{ color: a.color, textShadow: `0 0 30px ${a.color}66` }}
            >
              {a.title}
            </div>
            {a.sub && <div className="text-white/80 text-xs sm:text-sm font-bold tracking-[0.3em] mt-1 uppercase">{a.sub}</div>}
          </div>
        ))}
      </div>

      {/* Kill feed */}
      <div className="absolute top-2 sm:top-3 right-2 sm:right-3 flex flex-col items-end gap-1 max-w-[70vw]" style={{ marginTop: 44 }}>
        {feed.map((f) => (
          <div key={f.id} className="feed-in bg-black/55 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs sm:text-sm font-bold tracking-wide flex items-center gap-2">
            <span className={f.killerTeam === 0 ? 'text-sky-300' : 'text-red-300'}>{f.killer.toUpperCase()}</span>
            <span className="text-white/50 text-[10px] px-1.5 py-0.5 border border-white/20 rounded-sm">{WEAPON_LABEL[f.weapon] ?? f.weapon.toUpperCase()}</span>
            <span className={f.victimTeam === 0 ? 'text-sky-300' : 'text-red-300'}>{f.victim.toUpperCase()}</span>
          </div>
        ))}
      </div>

      {/* Pause button */}
      <button
        onClick={onPause}
        className="absolute top-2 sm:top-3 right-2 sm:right-3 pointer-events-auto h-9 px-3 flex items-center justify-center gap-2 bg-black/55 border border-white/15 text-white/80 hover:text-white cursor-pointer panel text-xs font-bold tracking-widest"
        aria-label="Pause"
      >
        ❚❚ {!touch && <span className="text-white/40">ESC</span>}
      </button>

      {/* Bottom left: health */}
      <div className={`absolute left-3 sm:left-5 flex flex-col gap-1 ${touch ? 'bottom-[150px] sm:bottom-[170px]' : 'bottom-4 sm:bottom-6'}`}>
        <div className="flex items-end gap-2">
          <span className={`font-display text-4xl sm:text-5xl font-bold leading-none tabular-nums ${hud.lowHp ? 'text-red-400' : 'text-white'}`}>{hud.hp}</span>
          <span className="text-white/50 text-xs font-bold tracking-widest mb-1.5">HP</span>
          <span className="text-white/70 text-xs font-bold tracking-widest mb-1.5 ml-3 uppercase">{playerName || 'YOU'}</span>
        </div>
        <div className="w-40 sm:w-56 h-2 bg-black/60 border border-white/15 skew-x-[-12deg] overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${hud.lowHp ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-300'}`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] font-bold tracking-widest">
          <span className="text-amber-300">
            SCORE <span className="font-display text-lg tabular-nums">{hud.score.toLocaleString()}</span>
          </span>
          <span className="text-white/60">
            K <span className="text-white">{hud.kills}</span> · D <span className="text-white">{hud.deaths}</span>
          </span>
          {hud.streak >= 2 && <span className="text-orange-400">🔥 {hud.streak}</span>}
        </div>
        {/* streak badges */}
        <div className="flex gap-1.5 mt-1">
          <div className={`px-2 py-0.5 text-[10px] font-bold tracking-widest border ${hud.uavT > 0 ? 'border-sky-400 text-sky-300 bg-sky-400/15' : 'border-white/10 text-white/25'}`}>
            UAV {hud.uavT > 0 ? Math.ceil(hud.uavT) + 's' : '3'}
          </div>
          <div
            className={`px-2 py-0.5 text-[10px] font-bold tracking-widest border ${hud.airstrikeReady ? 'border-amber-400 text-amber-300 bg-amber-400/20 animate-pulse' : 'border-white/10 text-white/25'}`}
          >
            ✈ STRIKE {hud.airstrikeReady ? (touch ? 'READY' : '[F]') : '5'}
          </div>
        </div>
      </div>

      {/* Bottom right: weapon / ammo */}
      <div className={`absolute right-3 sm:right-5 flex flex-col items-end ${touch ? 'bottom-[150px] sm:bottom-[170px]' : 'bottom-4 sm:bottom-6'}`}>
        <div className="text-white/60 text-[11px] font-bold tracking-[0.25em]">{hud.weaponName}</div>
        <div className="flex items-end gap-1.5">
          <span className={`font-display text-5xl sm:text-6xl font-bold leading-none tabular-nums ${hud.mag === 0 ? 'text-red-400' : hud.mag <= 5 ? 'text-amber-300' : 'text-white'}`}>
            {hud.mag}
          </span>
          <span className="font-display text-2xl text-white/50 leading-none mb-1 tabular-nums">/ {hud.reserve}</span>
        </div>
        {hud.reloading ? (
          <div className="w-32 h-1.5 bg-black/60 border border-white/15 mt-1 overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: `${hud.reloadProgress * 100}%` }} />
          </div>
        ) : (
          <div className="h-1.5 mt-1 text-[10px] text-white/40 tracking-widest leading-none">
            {hud.mag === 0 && hud.reserve > 0 ? (touch ? 'TAP RELOAD' : 'PRESS R') : ''}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 text-[11px] font-bold tracking-widest text-white/60">
          <span>
            {!touch && <span className="text-white/40">[Q] </span>}
            {hud.secondaryName}
          </span>
          <span className="flex items-center gap-1">
            {Array.from({ length: Math.max(hud.grenades, 0) }).map((_, i) => (
              <span key={i} className="inline-block w-2.5 h-3 bg-green-500 rounded-sm border border-green-300/60" />
            ))}
            <span className="ml-1">FRAG</span>
          </span>
        </div>
      </div>

      {/* Respawn overlay */}
      {!hud.alive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-red-400 font-display text-5xl sm:text-7xl font-bold tracking-wider drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]">
            YOU ARE DOWN
          </div>
          <div className="text-white/80 text-sm sm:text-base tracking-[0.35em] font-bold mt-2">
            RESPAWNING IN <span className="font-display text-3xl text-amber-400 tabular-nums align-middle">{Math.ceil(hud.respawnIn)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
