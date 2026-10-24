import { isAcceptedAnswer } from './answerMatching.ts'
import type { Question, QuestionType } from './types.ts'

/* ----------------------------- Practice mode ----------------------------- */

export interface PracticeAnswer {
  question: Question
  /** What the participant answered. */
  answer: string
  ok: boolean
  earned: number
}

export function evaluatePractice(question: Question, answer: string): { ok: boolean; earned: number } {
  const ok =
    question.type === 'mc'
      ? answer === question.correct
      : isAcceptedAnswer(answer, question.accepted ?? [question.correct])
  return { ok, earned: ok ? question.points : 0 }
}

export type RatingLabel = 'Outstanding' | 'Excellent' | 'Good' | 'Fair' | 'Needs Improvement'

const RATING_MESSAGES: Record<RatingLabel, string> = {
  Outstanding: 'Superb command of Philippine Social Science.',
  Excellent: 'Strong, well-rounded knowledge.',
  Good: 'Solid performance with room to sharpen.',
  Fair: 'A passing effort. Review the answer sheet and try again.',
  'Needs Improvement': 'Keep studying. The answer sheet explains every item.',
}

/** Same bands as the original quiz. */
export function performanceRating(pct: number): { label: RatingLabel; message: string } {
  let label: RatingLabel = 'Needs Improvement'
  if (pct >= 90) label = 'Outstanding'
  else if (pct >= 80) label = 'Excellent'
  else if (pct >= 70) label = 'Good'
  else if (pct >= 60) label = 'Fair'
  return { label, message: RATING_MESSAGES[label] }
}

export interface Breakdown {
  key: string
  correct: number
  total: number
  earned: number
  max: number
}

export interface PracticeSummary {
  earned: number
  max: number
  pct: number
  correct: number
  incorrect: number
  total: number
  rating: { label: RatingLabel; message: string }
  byCategory: Breakdown[]
  byType: Breakdown[]
}

function breakdown(answers: readonly PracticeAnswer[], keyOf: (a: PracticeAnswer) => string, order: readonly string[]): Breakdown[] {
  const keys = [...new Set([...order, ...answers.map(keyOf)])].filter((k) => answers.some((a) => keyOf(a) === k))
  return keys.map((key) => {
    const items = answers.filter((a) => keyOf(a) === key)
    return {
      key,
      correct: items.filter((a) => a.ok).length,
      total: items.length,
      earned: items.reduce((s, a) => s + a.earned, 0),
      max: items.reduce((s, a) => s + a.question.points, 0),
    }
  })
}

export function summarizePractice(answers: readonly PracticeAnswer[], categoryOrder: readonly string[] = []): PracticeSummary {
  const earned = answers.reduce((s, a) => s + a.earned, 0)
  const max = answers.reduce((s, a) => s + a.question.points, 0)
  const correct = answers.filter((a) => a.ok).length
  const pct = max === 0 ? 0 : (earned / max) * 100
  const typeOrder: QuestionType[] = ['mc', 'id']
  return {
    earned,
    max,
    pct,
    correct,
    incorrect: answers.length - correct,
    total: answers.length,
    rating: performanceRating(pct),
    byCategory: breakdown(answers, (a) => a.question.category, categoryOrder),
    byType: breakdown(answers, (a) => a.question.type, typeOrder),
  }
}

/* ------------------------------ Live ranking ------------------------------ */

export interface Rankable {
  name: string
  score: number
  correct: number
}

/**
 * Tie policy (documented in the README): players are ordered by score, then by
 * number of correct answers, then alphabetically for a stable display order.
 * Players with the same score AND the same correct count share a rank
 * ("competition ranking": 1, 1, 3, ...).
 */
export function rankPlayers<T extends Rankable>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = rows
    .slice()
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name))
  const out: (T & { rank: number })[] = []
  sorted.forEach((row, i) => {
    const prev = out[i - 1]
    const rank = prev && prev.score === row.score && prev.correct === row.correct ? prev.rank : i + 1
    out.push({ ...row, rank })
  })
  return out
}
