import { useState } from 'react'
import { categoriesOf } from '../../core/categories.ts'
import type { PracticeAnswer } from '../../core/scoring.ts'
import { TYPE_LABEL } from '../../core/types.ts'

/** Read-only: reviewing never changes the score. */
export function ReviewList({ answers, onBack }: { answers: PracticeAnswer[]; onBack: () => void }) {
  const [category, setCategory] = useState('all')
  const [result, setResult] = useState<'all' | 'correct' | 'wrong'>('all')
  const [type, setType] = useState<'all' | 'mc' | 'id'>('all')

  const cats = categoriesOf(answers.map((a) => a.question))
  const shown = answers
    .map((a, i) => ({ a, n: i + 1 }))
    .filter(({ a }) => (category === 'all' || a.question.category === category) && (result === 'all' || (result === 'correct') === a.ok) && (type === 'all' || a.question.type === type))

  return (
    <div className="card">
      <div className="row between">
        <h1>Answer review</h1>
        <button className="btn ghost" onClick={onBack}>Back to results</button>
      </div>
      <div className="grid-2">
        <div className="field"><label htmlFor="rv-cat">Category</label>
          <select id="rv-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label htmlFor="rv-res">Result</label>
          <select id="rv-res" className="input" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            <option value="all">All results</option><option value="correct">Correct only</option><option value="wrong">Incorrect only</option>
          </select></div>
        <div className="field"><label htmlFor="rv-type">Question type</label>
          <select id="rv-type" className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">All types</option><option value="mc">{TYPE_LABEL.mc}</option><option value="id">{TYPE_LABEL.id}</option>
          </select></div>
      </div>
      <p className="muted" aria-live="polite">Showing {shown.length} of {answers.length} questions.</p>
      {shown.length === 0 && <p className="notice warn">No questions match these filters.</p>}
      {shown.map(({ a, n }) => (
        <div key={a.question.id + n} className="review-item">
          <div className="row">
            <b>Question {n}</b>
            <span className={`badge ${a.ok ? 'ok' : 'bad'}`}>{a.ok ? '✓ Correct' : '✗ Incorrect'}</span>
            <span className="pill">{a.question.category}</span>
            <span className="pill">{TYPE_LABEL[a.question.type]}</span>
            <span className="pill gold">{a.earned}/{a.question.points} pts</span>
          </div>
          <p style={{ marginTop: '0.4rem' }}>{a.question.text}</p>
          <p><b>Your answer:</b> {a.answer || '(no answer)'}</p>
          {!a.ok && <p><b>Correct answer:</b> {a.question.correct}</p>}
          {a.question.explanation && <p className="muted">{a.question.explanation}</p>}
        </div>
      ))}
    </div>
  )
}
