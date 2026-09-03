import type { ScoreRow } from '../game/types';

export function Scoreboard({ rows, teamScore }: { rows: ScoreRow[]; teamScore: [number, number] }) {
  const teams: [ScoreRow[], ScoreRow[]] = [rows.filter((r) => r.team === 0), rows.filter((r) => r.team === 1)];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-4xl">
      {teams.map((list, t) => (
        <div key={t} className={`bg-black/60 border ${t === 0 ? 'border-sky-400/40' : 'border-red-400/40'} panel p-3`}>
          <div className={`flex justify-between items-center mb-2 px-1 ${t === 0 ? 'text-sky-300' : 'text-red-300'}`}>
            <span className="font-display text-2xl font-bold tracking-wider">{t === 0 ? 'GHOSTS' : 'VIPERS'}</span>
            <span className="font-display text-3xl font-bold tabular-nums">{teamScore[t]}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-[10px] uppercase tracking-[0.2em]">
                <th className="text-left font-semibold pl-1">Player</th>
                <th className="text-right font-semibold">Score</th>
                <th className="text-right font-semibold">K</th>
                <th className="text-right font-semibold pr-1">D</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className={r.isPlayer ? 'bg-amber-400/15 text-amber-200' : i % 2 ? 'bg-white/[0.03]' : ''}>
                  <td className="py-1 pl-1 font-bold tracking-wide">
                    {r.name.toUpperCase()}
                    {r.isPlayer && <span className="ml-2 text-[9px] text-amber-400">YOU</span>}
                  </td>
                  <td className="py-1 text-right tabular-nums font-display text-lg">{r.score}</td>
                  <td className="py-1 text-right tabular-nums">{r.kills}</td>
                  <td className="py-1 text-right tabular-nums pr-1">{r.deaths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
