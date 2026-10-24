import type { CSSProperties } from 'react'
import { categoriesOf } from '../../core/categories.ts'
import { summarizePractice } from '../../core/scoring.ts'
import type { Breakdown, PracticeAnswer } from '../../core/scoring.ts'
import { TYPE_LABEL } from '../../core/types.ts'
import type { QuestionType } from '../../core/types.ts'

function BreakdownTable({ title, rows, label }: { title: string; rows: Breakdown[]; label: (k: string) => string }) {
  return (
    <div className="table-wrap">
      <table>
        <caption style={{ textAlign: 'left', fontWeight: 700, color: 'var(--navy)', padding: '0.4rem 0' }}>{title}</caption>
        <thead><tr><th>Group</th><th className="num">Correct</th><th className="num">Points</th><th className="num">Score</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{label(r.key)}</td>
              <td className="num">{r.correct}/{r.total}</td>
              <td className="num">{r.earned}/{r.max}</td>
              <td className="num">{r.max ? Math.round((r.earned / r.max) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PracticeResults({ name, answers, onReview, onAgain }: { name: string; answers: PracticeAnswer[]; onReview: () => void; onAgain: () => void }) {
  const s = summarizePractice(answers, categoriesOf(answers.map((a) => a.question)))
  const pct = Math.round(s.pct)
  return (
    <div className="stack">
      <div className="card center">
        <h1>{name ? `Well played, ${name}!` : 'Practice complete'}</h1>
        <div className="score-ring" style={{ '--pct': pct } as CSSProperties} role="img" aria-label={`${pct} percent`}>
          <div>{pct}%</div>
        </div>
        <p><b>{s.earned} of {s.max} points</b></p>
        <h2>{s.rating.label}</h2>
        <p className="muted">{s.rating.message}</p>
        <div className="stat-row">
          <div className="stat"><b>{s.correct}</b>correct</div>
          <div className="stat"><b>{s.incorrect}</b>incorrect</div>
          <div className="stat"><b>{s.total}</b>questions</div>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn gold" onClick={onReview}>Review answers</button>
          <button className="btn ghost" onClick={onAgain}>Start another practice</button>
        </div>
      </div>
      <div className="card grid-2">
        <BreakdownTable title="By category" rows={s.byCategory} label={(k) => k} />
        <BreakdownTable title="By question type" rows={s.byType} label={(k) => TYPE_LABEL[k as QuestionType]} />
      </div>
    </div>
  )
}
