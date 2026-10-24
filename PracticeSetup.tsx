import { useState } from 'react'
import { ImportPanel } from '../../components/ImportPanel.tsx'
import { PoolFilters, defaultFilter, toCriteria } from '../../components/PoolFilters.tsx'
import type { FilterState } from '../../components/PoolFilters.tsx'
import { selectQuestions, shuffle } from '../../core/selection.ts'
import type { OrderMode } from '../../core/selection.ts'
import type { Question } from '../../core/types.ts'
import { DEFAULT_QUESTIONS } from '../../data/defaultQuestions.ts'

export interface PlayItem {
  question: Question
  /** Multiple choice options in the order shown for this run. */
  choices?: string[]
}

export interface PracticeRunSetup {
  name: string
  items: PlayItem[]
}

export function PracticeSetup({ initialName, onStart }: { initialName: string; onStart: (run: PracticeRunSetup) => void }) {
  const [name, setName] = useState(initialName)
  const [source, setSource] = useState<'default' | 'custom'>('default')
  const [custom, setCustom] = useState<Question[] | null>(null)
  const [filter, setFilter] = useState<FilterState>(() => defaultFilter(DEFAULT_QUESTIONS, 40))
  const [order, setOrder] = useState<OrderMode>('mcFirst')

  const pool = source === 'default' ? DEFAULT_QUESTIONS : custom ?? []

  function changeSource(next: 'default' | 'custom') {
    setSource(next)
    const nextPool = next === 'default' ? DEFAULT_QUESTIONS : custom ?? []
    setFilter(defaultFilter(nextPool, next === 'default' ? 40 : 20))
  }

  function loaded(qs: Question[] | null) {
    setCustom(qs)
    setFilter(defaultFilter(qs ?? [], 20))
  }

  const result = selectQuestions(pool, toCriteria(filter, order))
  const canStart = result.questions.length > 0

  function start() {
    if (!canStart) return
    const items = result.questions.map((q) => ({ question: q, choices: q.type === 'mc' && q.choices ? shuffle(q.choices) : undefined }))
    onStart({ name: name.trim(), items })
  }

  return (
    <div className="stack">
      <div className="hero">
        <h1>Practice Mode</h1>
        <p>Study at your own pace. Answers and explanations appear right after each question.</p>
      </div>

      <form className="card" onSubmit={(e) => { e.preventDefault(); start() }}>
        <div className="field">
          <label htmlFor="pr-name">Your name or team (optional)</label>
          <input id="pr-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </div>

        <fieldset>
          <legend>Question source</legend>
          <label className="check"><input type="radio" name="pr-src" checked={source === 'default'} onChange={() => changeSource('default')} /> Built-in Philippine Social Science bank ({DEFAULT_QUESTIONS.length} questions)</label>
          <label className="check"><input type="radio" name="pr-src" checked={source === 'custom'} onChange={() => changeSource('custom')} /> My own questionnaire file</label>
        </fieldset>

        {source === 'custom' && <ImportPanel idPrefix="pr" onLoaded={loaded} />}

        {pool.length > 0 && (
          <>
            <PoolFilters pool={pool} value={filter} onChange={setFilter} idPrefix="pr" />
            <div className="field">
              <label htmlFor="pr-order">Question order</label>
              <select id="pr-order" className="input" value={order} onChange={(e) => setOrder(e.target.value as OrderMode)}>
                <option value="mcFirst">Classic: multiple choice first, then identification</option>
                <option value="random">Mixed: all types shuffled together</option>
              </select>
            </div>
          </>
        )}

        <button type="submit" className="btn gold big" disabled={!canStart}>Start practice ({result.questions.length} questions)</button>
      </form>
    </div>
  )
}
