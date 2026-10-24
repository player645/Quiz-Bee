import type { LeaderRow } from '../core/liveTypes.ts'

export function Leaderboard({ rows, caption }: { rows: LeaderRow[]; caption: string }) {
  if (rows.length === 0) return <p className="muted">No standings yet.</p>
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className="num">Rank</th><th>Player</th><th className="num">Points</th>
            <th className="num">Correct</th><th className="num">Incorrect</th><th className="num">Unanswered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={[r.you ? 'you' : '', r.rank === 1 ? 'podium-1' : ''].join(' ').trim()}>
              <td className="num">{r.rank}</td>
              <td>{r.name}{r.you ? ' (you)' : ''}</td>
              <td className="num">{r.score}</td><td className="num">{r.correct}</td>
              <td className="num">{r.incorrect}</td><td className="num">{r.unanswered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
