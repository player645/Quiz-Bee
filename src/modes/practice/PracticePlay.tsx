import { useEffect, useRef, useState } from 'react'
import { ChoiceList } from '../../components/ChoiceList.tsx'
import { evaluatePractice } from '../../core/scoring.ts'
import type { PracticeAnswer } from '../../core/scoring.ts'
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../../core/types.ts'
import type { PlayItem } from './PracticeSetup.tsx'

export function PracticePlay({ items, onFinish }: { items: PlayItem[]; onFinish: (answers: PracticeAnswer[]) => void }) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<PracticeAnswer[]>([])
  const [text, setText] = useState('')
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)
  const lock = useRef(false)
  const nextRef = useRef<HTMLButtonElement>(null)

  const item = items[idx]
  const q = item.question
  const result = answers[idx] as PracticeAnswer | undefined
  const answered = result !== undefined
  const score = answers.reduce((s, a) => s + a.earned, 0)
  const maxSoFar = items.slice(0, answers.length).reduce((s, it) => s + it.question.points, 0)
  const correctIndex = q.type === 'mc' && answered ? (item.choices ?? []).indexOf(q.correct) : null

  useEffect(() => {
    if (answered) nextRef.current?.focus()
  }, [answered])

  function submit(answer: string) {
    // Both guards prevent a double click or double Enter from awarding points twice.
    if (lock.current || answers.length > idx) return
    lock.current = true
    const r = evaluatePractice(q, answer)
    setAnswers((prev) => (prev.length > idx ? prev : [...prev, { question: q, answer, ...r }]))
  }

  function next() {
    if (!answered) return
    if (idx + 1 >= items.length) return onFinish(answers)
    setIdx(idx + 1)
    setText('')
    setPickedIndex(null)
    lock.current = false
  }

  return (
    <div className="card">
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answers.length} aria-label="Quiz progress">
        <span style={{ width: `${(answers.length / items.length) * 100}%` }} />
      </div>
      <div className="qhead" style={{ marginTop: '0.75rem' }}>
        <div>
          <strong>Question {idx + 1} of {items.length}</strong>
          <div className="pills" style={{ marginTop: '0.4rem' }}>
            <span className="pill">{q.category}</span>
            <span className="pill">{DIFFICULTY_LABEL[q.difficulty]}</span>
            <span className="pill">{TYPE_LABEL[q.type]}</span>
            <span className="pill gold">{q.points} {q.points === 1 ? 'point' : 'points'}</span>
          </div>
        </div>
        <div className="stat"><b>{score}</b><span className="small">of {maxSoFar} pts</span></div>
      </div>

      <h2 className="qtext">{q.text}</h2>

      {q.type === 'mc' ? (
        <ChoiceList
          choices={item.choices ?? q.choices ?? []}
          disabled={answered}
          selectedIndex={pickedIndex}
          correctIndex={correctIndex}
          onPick={(i) => {
            setPickedIndex(i)
            submit((item.choices ?? q.choices ?? [])[i])
          }}
        />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit(text) }}>
          <div className="field">
            <label htmlFor="pr-answer">Your answer</label>
            <input id="pr-answer" className="input" value={text} onChange={(e) => setText(e.target.value)} disabled={answered} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>
          <button type="submit" className="btn" disabled={answered || !text.trim()}>Submit answer</button>
        </form>
      )}

      <div aria-live="assertive">
        {answered && (
          <div className={`feedback ${result.ok ? 'ok' : 'bad'}`}>
            <strong>{result.ok ? `✓ Correct! +${result.earned} ${result.earned === 1 ? 'point' : 'points'}` : '✗ Not quite. +0 points'}</strong>
            {!result.ok && <div>Correct answer: <b>{q.correct}</b></div>}
            {q.explanation && <div style={{ marginTop: '0.4rem' }}>{q.explanation}</div>}
          </div>
        )}
      </div>

      {answered && (
        <div className="row" style={{ marginTop: '1rem' }}>
          <button ref={nextRef} type="button" className="btn gold" onClick={next}>
            {idx + 1 >= items.length ? 'See results' : 'Next question'}
          </button>
        </div>
      )}
    </div>
  )
}
