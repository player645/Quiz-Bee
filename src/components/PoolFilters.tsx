import { categoriesOf } from '../core/categories.ts'
import { filterPool } from '../core/selection.ts'
import type { SelectionCriteria } from '../core/selection.ts'
import { DIFFICULTIES, DIFFICULTY_LABEL, TYPE_LABEL } from '../core/types.ts'
import type { Difficulty, Question, QuestionType } from '../core/types.ts'

export interface FilterState {
  categories: string[]
  difficulty: 'any' | Difficulty
  types: 'both' | QuestionType
  count: number
}

export function defaultFilter(pool: readonly Question[], count: number): FilterState {
  return { categories: categoriesOf(pool), difficulty: 'any', types: 'both', count: Math.min(count, pool.length) }
}

export function toCriteria(f: FilterState, order: SelectionCriteria['order']): SelectionCriteria {
  return {
    categories: f.categories,
    difficulties: f.difficulty === 'any' ? [] : [f.difficulty],
    types: f.types === 'both' ? ['mc', 'id'] : [f.types],
    count: f.count,
    order,
  }
}

interface Props {
  pool: readonly Question[]
  value: FilterState
  onChange: (next: FilterState) => void
  /** Prefix for element ids so two instances never clash. */
  idPrefix: string
}

/** Category / difficulty / type / count controls with live availability feedback. */
export function PoolFilters({ pool, value, onChange, idPrefix }: Props) {
  const allCategories = categoriesOf(pool)
  const matching = filterPool(pool, {
    categories: value.categories,
    difficulties: value.difficulty === 'any' ? [] : [value.difficulty],
    types: value.types === 'both' ? ['mc', 'id'] : [value.types],
  })
  const available = matching.length
  const points = matching.reduce((s, q) => s + q.points, 0)

  const toggle = (c: string) =>
    onChange({ ...value, categories: value.categories.includes(c) ? value.categories.filter((x) => x !== c) : [...value.categories, c] })

  return (
    <div>
      <fieldset>
        <legend>Categories</legend>
        <div className="checks">
          {allCategories.map((c) => (
            <label key={c} className="check">
              <input type="checkbox" checked={value.categories.includes(c)} onChange={() => toggle(c)} />
              {c}
            </label>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn link" onClick={() => onChange({ ...value, categories: allCategories })}>Select all</button>
          <button type="button" className="btn link" onClick={() => onChange({ ...value, categories: [] })}>Clear</button>
        </div>
      </fieldset>

      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-diff`}>Difficulty</label>
          <select id={`${idPrefix}-diff`} className="input" value={value.difficulty} onChange={(e) => onChange({ ...value, difficulty: e.target.value as FilterState['difficulty'] })}>
            <option value="any">Any difficulty</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-type`}>Question type</label>
          <select id={`${idPrefix}-type`} className="input" value={value.types} onChange={(e) => onChange({ ...value, types: e.target.value as FilterState['types'] })}>
            <option value="both">Both types</option>
            <option value="mc">{TYPE_LABEL.mc} only</option>
            <option value="id">{TYPE_LABEL.id} only</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-count`}>Number of questions</label>
        <input
          id={`${idPrefix}-count`}
          className="input"
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(1, available)}
          value={Number.isFinite(value.count) ? value.count : ''}
          onChange={(e) => onChange({ ...value, count: e.target.value === '' ? NaN : Math.floor(Number(e.target.value)) })}
        />
      </div>

      <div aria-live="polite">
        {value.categories.length === 0 ? (
          <p className="notice warn">Select at least one category.</p>
        ) : available === 0 ? (
          <p className="notice warn">No questions match these filters. Try another difficulty or question type, or add more categories.</p>
        ) : !(value.count >= 1) ? (
          <p className="notice warn">Enter how many questions you want.</p>
        ) : value.count > available ? (
          <div className="notice warn">
            Only {available} question{available === 1 ? '' : 's'} match these filters, so you will get {available}.{' '}
            <button type="button" className="btn link" onClick={() => onChange({ ...value, count: available })}>Use {available}</button>
          </div>
        ) : (
          <p className="hint">{available} questions match ({points} points if all were used).</p>
        )}
      </div>
    </div>
  )
}
