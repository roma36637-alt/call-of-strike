import type { HighScore } from '../game/types';

export function HighScoreTable({ scores, highlight }: { scores: HighScore[]; highlight?: number }) {
  if (!scores.length)
    return (
      <div className="text-center text-white/40 py-6 text-sm tracking-widest uppercase">
        No records yet — be the first on the board
      </div>
    );
  return (
    <div className="w-full overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/40 uppercase text-[11px] tracking-[0.2em]">
            <th className="text-left py-1 pl-2 font-semibold">#</th>
            <th className="text-left py-1 font-semibold">Callsign</th>
            <th className="text-right py-1 font-semibold">Score</th>
            <th className="text-right py-1 font-semibold hidden sm:table-cell">K / D</th>
            <th className="text-right py-1 pr-2 font-semibold hidden sm:table-cell">Class</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, i) => {
            const hl = i === highlight;
            return (
              <tr
                key={s.date + '_' + i}
                className={`${hl ? 'bg-amber-400/20 text-amber-300' : i % 2 ? 'bg-white/[0.03]' : ''} ${i === 0 ? 'text-amber-200' : ''}`}
              >
                <td className="py-1.5 pl-2 font-bold tabular-nums">{i + 1}</td>
                <td className="py-1.5 font-semibold tracking-wide">
                  {s.name.toUpperCase()}
                  <span className={`ml-2 text-[10px] uppercase ${s.won ? 'text-sky-400' : 'text-red-400'}`}>{s.won ? 'W' : 'L'}</span>
                </td>
                <td className="py-1.5 text-right font-display text-lg tabular-nums">{s.score.toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">
                  {s.kills} / {s.deaths}
                </td>
                <td className="py-1.5 pr-2 text-right text-white/50 text-xs uppercase hidden sm:table-cell">
                  {s.loadout} · {s.difficulty}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
