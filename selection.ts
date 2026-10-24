import type { Difficulty, Question, QuestionType } from './types.ts'

export type OrderMode = 'random' | 'mcFirst' | 'bank'

export interface SelectionCriteria {
  categories: readonly string[]
  /** Empty array means "any difficulty". */
  difficulties: readonly Difficulty[]
  types: readonly QuestionType[]
  count: number
  order?: OrderMode
}

export interface SelectionResult {
  questions: Question[]
  /** Size of the pool that matches the filters. */
  available: number
  requested: number
  /** True when fewer questions exist than were requested. */
  shortfall: boolean
}

export type Rng = () => number

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function filterPool(pool: readonly Question[], c: Omit<SelectionCriteria, 'count' | 'order'>): Question[] {
  return pool.filter(
    (q) =>
      c.categories.includes(q.category) &&
      c.types.includes(q.type) &&
      (c.difficulties.length === 0 || c.difficulties.includes(q.difficulty)),
  )
}

/**
 * Picks `count` distinct questions. Selection is balanced: questions are drawn
 * round-robin from every (category, type) group, so the default 40-question
 * practice run is exactly 5 per category per type, as in the original quiz.
 * Never duplicates a question to reach the requested count.
 */
export function selectQuestions(pool: readonly Question[], c: SelectionCriteria, rng: Rng = Math.random): SelectionResult {
  const matching = filterPool(pool, c)
  const requested = Math.max(0, Math.floor(c.count))
  const target = Math.min(requested, matching.length)

  const groups = new Map<string, Question[]>()
  for (const q of matching) {
    const key = `${q.category}\u0000${q.type}`
    const g = groups.get(key)
    if (g) g.push(q)
    else groups.set(key, [q])
  }
  const lists = shuffle([...groups.values()].map((g) => shuffle(g, rng)), rng)

  const picked: Question[] = []
  while (picked.length < target) {
    let tookAny = false
    for (const list of lists) {
      if (picked.length >= target) break
      const next = list.pop()
      if (next) {
        picked.push(next)
        tookAny = true
      }
    }
    if (!tookAny) break
  }

  const order = c.order ?? 'random'
  let ordered: Question[]
  if (order === 'bank') {
    const index = new Map(pool.map((q, i) => [q.id, i]))
    ordered = picked.sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0))
  } else if (order === 'mcFirst') {
    const mc = shuffle(picked.filter((q) => q.type === 'mc'), rng)
    const rest = shuffle(picked.filter((q) => q.type !== 'mc'), rng)
    ordered = [...mc, ...rest]
  } else {
    ordered = shuffle(picked, rng)
  }

  return { questions: ordered, available: matching.length, requested, shortfall: requested > matching.length }
}
