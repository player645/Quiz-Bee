import type { Question } from './types.ts'

/**
 * Display metadata for the built-in categories. Categories are otherwise
 * discovered from the question data, so a new category in a questionnaire
 * (or in defaultQuestions.ts) works everywhere without code changes.
 */
export const CATEGORY_ORDER: readonly string[] = ['History', 'Culture', 'Geography', 'Government']

/** Returns the distinct categories of a pool: built-in ones first, then others A-Z. */
export function categoriesOf(pool: readonly Question[]): string[] {
  const seen = new Set(pool.map((q) => q.category))
  const known = CATEGORY_ORDER.filter((c) => seen.has(c))
  const extra = [...seen].filter((c) => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b))
  return [...known, ...extra]
}
