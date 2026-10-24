import type { Difficulty, QuestionType } from './types.ts'

export const LIVE_LIMITS = {
  maxPlayers: 100,
  nameMax: 24,
  timerMin: 5,
  timerMax: 120,
  flatPointsMax: 1000,
  roomCodeLength: 6,
} as const

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

export type Phase = 'lobby' | 'question' | 'reveal' | 'finished'
export type HostAction = 'start' | 'reveal' | 'next' | 'end'

export interface RoomSettings {
  /** Seconds players have for each question. */
  timerSeconds: number
  /** 'question' = each question's own points; 'flat' = flatPoints for every question. */
  scoring: 'question' | 'flat'
  flatPoints: number
  /**
   * Optional speed bonus: a correct answer earns
   *   base + round(base * 0.5 * remainingTime / totalTime)
   * i.e. up to +50% of the base points, decreasing linearly with time used.
   */
  speedBonus: boolean
  /** Reveal automatically as soon as every joined player has answered. */
  autoReveal: boolean
  /** Shuffle multiple-choice options once when the room is created (same order for everyone). */
  shuffleChoices: boolean
}

export const DEFAULT_SETTINGS: RoomSettings = {
  timerSeconds: 20,
  scoring: 'question',
  flatPoints: 10,
  speedBonus: false,
  autoReveal: true,
  shuffleChoices: true,
}

export function normalizeSettings(raw: unknown): { ok: true; settings: RoomSettings } | { ok: false; error: string } {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const s: RoomSettings = { ...DEFAULT_SETTINGS }
  if (r.timerSeconds !== undefined) {
    const n = Number(r.timerSeconds)
    if (!Number.isInteger(n) || n < LIVE_LIMITS.timerMin || n > LIVE_LIMITS.timerMax)
      return { ok: false, error: `Timer must be a whole number from ${LIVE_LIMITS.timerMin} to ${LIVE_LIMITS.timerMax} seconds.` }
    s.timerSeconds = n
  }
  if (r.scoring !== undefined) {
    if (r.scoring !== 'question' && r.scoring !== 'flat') return { ok: false, error: 'Scoring must be "question" or "flat".' }
    s.scoring = r.scoring
  }
  if (r.flatPoints !== undefined) {
    const n = Number(r.flatPoints)
    if (!Number.isInteger(n) || n < 1 || n > LIVE_LIMITS.flatPointsMax)
      return { ok: false, error: `Flat points must be a whole number from 1 to ${LIVE_LIMITS.flatPointsMax}.` }
    s.flatPoints = n
  }
  for (const k of ['speedBonus', 'autoReveal', 'shuffleChoices'] as const) {
    if (r[k] !== undefined) {
      if (typeof r[k] !== 'boolean') return { ok: false, error: `${k} must be true or false.` }
      s[k] = r[k] as boolean
    }
  }
  return { ok: true, settings: s }
}

/* ------------------------- What clients are allowed to see ------------------------- */

export interface PublicQuestion {
  index: number
  total: number
  text: string
  type: QuestionType
  category: string
  difficulty: Difficulty
  points: number
  /** Multiple choice only, already in the order everyone sees. */
  choices?: string[]
}

export interface LeaderRow {
  rank: number
  name: string
  score: number
  correct: number
  incorrect: number
  unanswered: number
  connected: boolean
  you?: boolean
}

export interface RevealInfo {
  correctAnswer: string
  explanation: string
  /** MC only: how many players picked each choice. */
  distribution?: number[]
  answered: number
  correctCount: number
}

export interface PlayerSelf {
  name: string
  rank: number
  score: number
  correct: number
  incorrect: number
  unanswered: number
  /** True once this player has submitted for the open question. */
  answered: boolean
  /** The player's own submitted answer for the current question (restored after a refresh). */
  myAnswer?: string
  /** Only present in the reveal phase. */
  lastResult?: { correct: boolean; earned: number }
}

export interface RoomSnapshot {
  role: 'host' | 'player'
  code: string
  phase: Phase
  serverNow: number
  hostConnected: boolean
  settings: RoomSettings
  totalQuestions: number
  players: { name: string; connected: boolean }[]
  question?: PublicQuestion
  /** Absolute server time (ms) when answering closes. */
  deadline?: number
  answeredCount?: number
  reveal?: RevealInfo
  /** Host only: the answer key for the open question. */
  hostKey?: { correctAnswer: string }
  leaderboard: LeaderRow[]
  self?: PlayerSelf
}

export type AnswerPayload = { choice: number } | { text: string }
