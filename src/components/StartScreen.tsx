import { useState } from 'react';
import { LOADOUTS, WEAPONS } from '../game/weapons';
import type { Difficulty, HighScore } from '../game/types';
import { HighScoreTable } from './HighScoreTable';
import { audio } from '../game/audio';
import bgUrl from '/images/bg.jpg';

interface Props {
  name: string;
  setName: (n: string) => void;
  loadoutId: string;
  setLoadoutId: (id: string) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  scores: HighScore[];
  muted: boolean;
  toggleMute: () => void;
  touch: boolean;
  onStart: () => void;
}

const DIFFS: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'recruit', name: 'RECRUIT', desc: 'Slow reactions, poor aim' },
  { id: 'regular', name: 'REGULAR', desc: 'Balanced firefights' },
  { id: 'veteran', name: 'VETERAN', desc: 'Deadly accurate, fast' },
];

export function StartScreen(p: Props) {
  const [tab, setTab] = useState<'loadout' | 'scores' | 'controls'>('loadout');

  return (
    <div className="absolute inset-0 overflow-hidden scanlines">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgUrl})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f14] via-[#0b0f14]/85 to-[#0b0f14]/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14] via-transparent to-[#0b0f14]/60" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative h-full w-full overflow-y-auto scrollable">
        <div className="min-h-full flex flex-col lg:flex-row gap-6 lg:gap-10 p-5 sm:p-8 lg:p-12 max-w-7xl mx-auto">
          {/* Left column */}
          <div className="flex-1 flex flex-col justify-center fade-in">
            <div className="flex items-center gap-2 text-amber-400 text-xs tracking-[0.35em] uppercase font-semibold mb-2">
              <span className="w-8 h-px bg-amber-400" /> Tactical Top-Down Shooter
            </div>
            <h1 className="font-display leading-[0.85] text-[64px] sm:text-[96px] lg:text-[120px] font-bold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
              CALL OF
              <br />
              <span className="text-amber-400">STRIKE</span>
            </h1>
            <div className="mt-3 text-white/70 text-lg sm:text-xl font-semibold tracking-widest uppercase">
              Team Deathmatch · 6 vs 6 · First to 30
            </div>

            <div className="mt-8 max-w-md">
              <label className="block text-[11px] uppercase tracking-[0.25em] text-white/50 mb-1.5 font-semibold">Callsign</label>
              <input
                value={p.name}
                onChange={(e) => p.setName(e.target.value.slice(0, 12))}
                placeholder="SOLDIER"
                className="w-full bg-black/40 border border-white/15 focus:border-amber-400 outline-none px-4 py-3 text-xl font-bold tracking-widest uppercase text-white placeholder:text-white/25 panel"
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  audio.init();
                  audio.ui();
                  p.onStart();
                }}
                className="btn-tactical pulse-glow bg-amber-400 text-black font-display text-3xl sm:text-4xl font-bold px-10 py-3 tracking-wider cursor-pointer"
              >
                ▶ DEPLOY
              </button>
              <button
                onClick={() => {
                  audio.init();
                  p.toggleMute();
                  audio.ui();
                }}
                className="btn-tactical bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold px-5 py-4 text-sm tracking-widest uppercase cursor-pointer"
              >
                {p.muted ? '🔇 Sound Off' : '🔊 Sound On'}
              </button>
            </div>

            <div className="mt-6 text-white/45 text-sm leading-relaxed max-w-lg">
              {p.touch ? (
                <>
                  <b className="text-white/70">Left stick</b> move · <b className="text-white/70">Right stick</b> aim &amp; fire ·
                  Buttons for reload, swap, frag, airstrike.
                </>
              ) : (
                <>
                  <b className="text-white/70">WASD</b> move · <b className="text-white/70">Mouse</b> aim · <b className="text-white/70">LMB</b> fire ·{' '}
                  <b className="text-white/70">R</b> reload · <b className="text-white/70">Q / Scroll</b> swap · <b className="text-white/70">G / RMB</b> frag ·{' '}
                  <b className="text-white/70">F</b> airstrike · <b className="text-white/70">Tab</b> scores · <b className="text-white/70">Esc</b> pause
                </>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="w-full lg:w-[460px] xl:w-[520px] flex flex-col justify-center fade-in" style={{ animationDelay: '0.15s' }}>
            <div className="bg-black/55 backdrop-blur-md border border-white/10 panel p-5 sm:p-6">
              <div className="flex gap-1 mb-5 border-b border-white/10">
                {(
                  [
                    ['loadout', 'LOADOUT'],
                    ['scores', 'RECORDS'],
                    ['controls', 'INTEL'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setTab(id);
                      audio.ui();
                    }}
                    className={`px-4 py-2 text-sm font-bold tracking-[0.2em] cursor-pointer border-b-2 -mb-px transition-colors ${
                      tab === id ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/50 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'loadout' && (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LOADOUTS.map((lo) => {
                      const sel = lo.id === p.loadoutId;
                      const w = WEAPONS[lo.primary];
                      return (
                        <button
                          key={lo.id}
                          onClick={() => {
                            p.setLoadoutId(lo.id);
                            audio.ui();
                          }}
                          className={`text-left p-3 border transition-all cursor-pointer panel ${
                            sel ? 'border-amber-400 bg-amber-400/15 shadow-[0_0_24px_rgba(255,183,43,0.25)]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-display text-2xl font-bold tracking-wider">
                              <span className="mr-2">{lo.icon}</span>
                              {lo.name}
                            </div>
                            {sel && <span className="text-amber-400 text-xs font-bold tracking-widest">ACTIVE</span>}
                          </div>
                          <div className="text-xs text-white/55 mt-1">{lo.desc}</div>
                          <div className="mt-2 flex gap-3 text-[10px] uppercase tracking-wider text-white/40">
                            <span>
                              DMG <b className="text-white/80">{w.damage * w.pellets}</b>
                            </span>
                            <span>
                              RPM <b className="text-white/80">{Math.round(60 / w.rof)}</b>
                            </span>
                            <span>
                              MAG <b className="text-white/80">{w.mag}</b>
                            </span>
                            <span>
                              FRAG <b className="text-white/80">{lo.grenades}</b>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <div className="text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2 font-semibold">Enemy Difficulty</div>
                    <div className="grid grid-cols-3 gap-2">
                      {DIFFS.map((d) => {
                        const sel = d.id === p.difficulty;
                        return (
                          <button
                            key={d.id}
                            onClick={() => {
                              p.setDifficulty(d.id);
                              audio.ui();
                            }}
                            className={`p-2.5 border text-center cursor-pointer transition-all panel ${
                              sel
                                ? d.id === 'veteran'
                                  ? 'border-red-400 bg-red-400/15 text-red-300'
                                  : 'border-sky-400 bg-sky-400/15 text-sky-300'
                                : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                            }`}
                          >
                            <div className="font-display text-xl font-bold tracking-wider">{d.name}</div>
                            <div className="text-[10px] text-white/45 leading-tight">{d.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'scores' && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2 font-semibold">Local Leaderboard · Top 10</div>
                  <HighScoreTable scores={p.scores} />
                </div>
              )}

              {tab === 'controls' && (
                <div className="text-sm text-white/70 space-y-3">
                  <div>
                    <div className="text-amber-400 font-bold tracking-widest text-xs mb-1">MISSION</div>
                    Lead the <span className="text-sky-400 font-bold">GHOSTS</span> against the <span className="text-red-400 font-bold">VIPERS</span>. First
                    team to 30 kills wins, or highest score when the 5-minute clock hits zero.
                  </div>
                  <div>
                    <div className="text-amber-400 font-bold tracking-widest text-xs mb-1">SCORING</div>
                    Kill <b>+100</b> · Double/Triple kills <b>+50/+100</b> · Longshot <b>+25</b> · Frag kill <b>+25</b> · Airstrike kill <b>+50</b> · Win{' '}
                    <b>+500</b>
                  </div>
                  <div>
                    <div className="text-amber-400 font-bold tracking-widest text-xs mb-1">KILLSTREAKS</div>
                    <b>3</b> UAV — enemies revealed on radar · <b>5</b> Airstrike — carpet bomb your aim point · <b>7</b> Unstoppable bonus · <b>10</b>{' '}
                    Godlike
                  </div>
                  <div>
                    <div className="text-amber-400 font-bold tracking-widest text-xs mb-1">TIPS</div>
                    Health regenerates after 4s out of combat. Grab <span className="text-green-400">medkits</span> and{' '}
                    <span className="text-amber-300">ammo crates</span>. Use crates and walls as cover — bullets don't go through them.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
