export type QuestionType = 'mc' | 'id'
export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
export const QUESTION_TYPES: readonly QuestionType[] = ['mc', 'id']

export const TYPE_LABEL: Record<QuestionType, string> = {
  mc: 'Multiple Choice',
  id: 'Identification',
}
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/** Default point values, identical to the original quiz (MC = 1, Identification = 2). */
export const DEFAULT_POINTS: Record<QuestionType, number> = { mc: 1, id: 2 }

export interface Question {
  id: string
  type: QuestionType
  category: string
  difficulty: Difficulty
  text: string
  /** Multiple choice only: every option, in a stable (unshuffled) order. */
  choices?: string[]
  /** MC: the text of the correct choice. ID: the display answer. */
  correct: string
  /** Identification only: accepted answers (matched after normalization). */
  accepted?: string[]
  explanation: string
  points: number
  tags?: string[]
}
