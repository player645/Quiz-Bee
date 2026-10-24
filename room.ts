import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isAcceptedAnswer } from '../src/core/answerMatching.ts'
import { rankPlayers, } from '../src/core/scoring.ts'
import { shuffle } from '../src/core/selection.ts'
import { LIVE_LIMITS } from '../src/core/liveTypes.ts'
import type { AnswerPayload, HostAction, LeaderRow, Phase, PlayerSelf, RoomSettings, RoomSnapshot } from '../src/core/liveTypes.ts'
import type { Question } from '../src/core/types.ts'

interface StoredAnswer {
  /** Choice text (MC) or typed text (ID). */
  answer: string
  choiceIndex?: number
  correct: boolean
  earned: number
}

interface Player {
  id: string
  name: string
  token: string
  connections: number
  answers: Map<number, StoredAnswer>
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; code: string; status: number }

const fail = (status: number, code: string, error: string): { ok: false; error: string; code: string; status: number } => ({
  ok: false,
  status,
  code,
  error,
})

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Authoritative game state for one room. It knows nothing about HTTP: time is
 * injected through `now`, and the server layer calls tick() to close questions
 * whose deadline passed. All scoring happens here, never in the browser.
 */
export class GameRoom {
  readonly code: string
  readonly hostToken: string
  readonly settings: RoomSettings
  readonly createdAt: number
  phase: Phase = 'lobby'
  qIndex = -1
  deadline = 0
  /** Number of questions that have been closed (their results are visible). */
  closed = 0
  finishedAt = 0
  lastActivity: number
  hostConnections = 0
  onChange: () => void = () => {}

  private questions: Question[]
  private players = new Map<string, Player>()
  private byToken = new Map<string, Player>()
  private now: () => number
  private version = 0
  private boardCache: { version: number; rows: LeaderRow[] } | null = null

  constructor(opts: { code: string; questions: Question[]; settings: RoomSettings; now?: () => number; rng?: () => number }) {
    this.now = opts.now ?? Date.now
    this.code = opts.code
    this.settings = opts.settings
    this.hostToken = randomBytes(24).toString('hex')
    this.createdAt = this.lastActivity = this.now()
    const rng = opts.rng ?? Math.random
    this.questions = opts.questions.map((q) => {
      const copy: Question = { ...q }
      if (copy.type === 'mc' && copy.choices && opts.settings.shuffleChoices) copy.choices = shuffle(copy.choices, rng)
      return copy
    })
  }

  get totalQuestions(): number {
    return this.questions.length
  }
  get playerCount(): number {
    return this.players.size
  }

  private changed(): void {
    this.version++
    this.lastActivity = this.now()
    this.onChange()
  }

  /* ------------------------------- Players ------------------------------- */

  join(rawName: unknown, token?: unknown): Result<{ playerId: string; token: string; resumed: boolean; name: string }> {
    if (typeof token === 'string' && token) {
      const existing = this.byToken.get(token)
      if (existing) return { ok: true, playerId: existing.id, token: existing.token, resumed: true, name: existing.name }
    }
    if (this.phase !== 'lobby') return fail(409, 'GAME_STARTED', 'This game has already started. New players can only join in the lobby.')
    const name = cleanName(rawName)
    if (name.length < 1 || name.length > LIVE_LIMITS.nameMax) return fail(400, 'BAD_NAME', `Enter a name of 1 to ${LIVE_LIMITS.nameMax} characters.`)
    const lower = name.toLowerCase()
    for (const p of this.players.values()) if (p.name.toLowerCase() === lower) return fail(409, 'NAME_TAKEN', 'That name is already taken in this game. Choose another.')
    if (this.players.size >= LIVE_LIMITS.maxPlayers) return fail(409, 'ROOM_FULL', 'This game is full.')
    const player: Player = { id: randomBytes(6).toString('hex'), name, token: randomBytes(16).toString('hex'), connections: 0, answers: new Map() }
    this.players.set(player.id, player)
    this.byToken.set(player.token, player)
    this.changed()
    return { ok: true, playerId: player.id, token: player.token, resumed: false, name }
  }

  playerByToken(token: unknown): Player | undefined {
    return typeof token === 'string' ? this.byToken.get(token) : undefined
  }

  isHost(token: unknown): boolean {
    return typeof token === 'string' && safeEqual(token, this.hostToken)
  }

  setConnection(viewer: { role: 'host' } | { role: 'player'; token: string }, delta: 1 | -1): void {
    if (viewer.role === 'host') this.hostConnections = Math.max(0, this.hostConnections + delta)
    else {
      const p = this.byToken.get(viewer.token)
      if (p) p.connections = Math.max(0, p.connections + delta)
    }
    this.changed()
  }

  /* ------------------------------ Host actions ----------------------------- */

  hostAction(token: unknown, action: HostAction): Result {
    if (!this.isHost(token)) return fail(403, 'NOT_HOST', 'Only the host can do that.')
    this.tick()
    switch (action) {
      case 'start':
        if (this.phase !== 'lobby') return fail(409, 'BAD_STATE', 'The game has already started.')
        if (this.players.size < 1) return fail(409, 'NO_PLAYERS', 'At least one player must join before you start.')
        this.openQuestion(0)
        return { ok: true }
      case 'reveal':
        if (this.phase !== 'question') return fail(409, 'BAD_STATE', 'There is no open question to reveal.')
        this.closeQuestion()
        return { ok: true }
      case 'next':
        if (this.phase !== 'reveal') return fail(409, 'BAD_STATE', 'Reveal the answer before moving on.')
        if (this.qIndex + 1 < this.questions.length) this.openQuestion(this.qIndex + 1)
        else this.finish()
        return { ok: true }
      case 'end':
        if (this.phase === 'finished') return fail(409, 'BAD_STATE', 'The game is already over.')
        if (this.phase === 'question') this.closed = this.qIndex + 1
        this.finish()
        return { ok: true }
      default:
        return fail(400, 'BAD_ACTION', 'Unknown action.')
    }
  }

  private openQuestion(i: number): void {
    this.phase = 'question'
    this.qIndex = i
    this.deadline = this.now() + this.settings.timerSeconds * 1000
    this.changed()
  }

  private closeQuestion(): void {
    this.phase = 'reveal'
    this.closed = this.qIndex + 1
    this.changed()
  }

  private finish(): void {
    this.phase = 'finished'
    this.finishedAt = this.now()
    this.changed()
  }

  /** Closes the open question once its deadline has passed. Safe to call any time. */
  tick(): void {
    if (this.phase === 'question' && this.now() >= this.deadline) this.closeQuestion()
  }

  /* -------------------------------- Answers -------------------------------- */

  submit(token: unknown, questionIndex: unknown, payload: unknown): Result {
    const player = this.playerByToken(token)
    if (!player) return fail(403, 'NOT_PLAYER', 'You are not part of this game.')
    this.tick()
    if (this.phase !== 'question') return fail(409, 'NOT_OPEN', 'No question is open right now.')
    if (questionIndex !== this.qIndex) return fail(409, 'WRONG_QUESTION', 'That question is no longer open.')
    if (this.now() > this.deadline) return fail(409, 'TOO_LATE', 'Time is up for this question.')
    if (player.answers.has(this.qIndex)) return fail(409, 'ALREADY_ANSWERED', 'You already answered this question.')

    const q = this.questions[this.qIndex]
    const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>
    let stored: Omit<StoredAnswer, 'earned'>
    if (q.type === 'mc') {
      const choice = p.choice
      if (typeof choice !== 'number' || !Number.isInteger(choice) || !q.choices || choice < 0 || choice >= q.choices.length)
        return fail(400, 'BAD_ANSWER', 'Pick one of the choices.')
      const answer = q.choices[choice]
      stored = { answer, choiceIndex: choice, correct: answer === q.correct }
    } else {
      const text = typeof p.text === 'string' ? p.text.trim() : ''
      if (!text || text.length > 200) return fail(400, 'BAD_ANSWER', 'Type an answer of up to 200 characters.')
      stored = { answer: text, correct: isAcceptedAnswer(text, q.accepted ?? [q.correct]) }
    }

    let earned = 0
    if (stored.correct) {
      const base = this.settings.scoring === 'flat' ? this.settings.flatPoints : q.points
      const total = this.settings.timerSeconds * 1000
      const remaining = Math.min(total, Math.max(0, this.deadline - this.now()))
      earned = base + (this.settings.speedBonus ? Math.round(base * 0.5 * (remaining / total)) : 0)
    }
    player.answers.set(this.qIndex, { ...stored, earned })

    if (this.settings.autoReveal && [...this.players.values()].every((x) => x.answers.has(this.qIndex))) this.closeQuestion()
    else this.changed()
    return { ok: true }
  }

  /* ------------------------------- Snapshots ------------------------------- */

  private stats(p: Player): { score: number; correct: number; incorrect: number; unanswered: number } {
    // Only closed questions count, so nothing about correctness leaks before the reveal.
    let score = 0
    let correct = 0
    let incorrect = 0
    let answered = 0
    for (const [i, a] of p.answers) {
      if (i >= this.closed) continue
      answered++
      if (a.correct) {
        correct++
        score += a.earned
      } else incorrect++
    }
    return { score, correct, incorrect, unanswered: Math.max(0, this.closed - answered) }
  }

  private board(): LeaderRow[] {
    if (this.boardCache && this.boardCache.version === this.version) return this.boardCache.rows
    const rows = rankPlayers(
      [...this.players.values()].map((p) => ({ name: p.name, connected: p.connections > 0, ...this.stats(p) })),
    )
    this.boardCache = { version: this.version, rows }
    return rows
  }

  snapshot(viewer: { role: 'host' } | { role: 'player'; token: string }): RoomSnapshot {
    const isHost = viewer.role === 'host'
    const rows = this.board()
    const snap: RoomSnapshot = {
      role: viewer.role,
      code: this.code,
      phase: this.phase,
      serverNow: this.now(),
      hostConnected: this.hostConnections > 0,
      settings: this.settings,
      totalQuestions: this.questions.length,
      players: [...this.players.values()].map((p) => ({ name: p.name, connected: p.connections > 0 })),
      leaderboard: [],
    }

    const showBoard = this.phase === 'reveal' || this.phase === 'finished'
    if (showBoard) snap.leaderboard = isHost || this.phase === 'finished' ? rows : rows.slice(0, 10)

    if (this.phase === 'question' || this.phase === 'reveal') {
      const q = this.questions[this.qIndex]
      snap.question = {
        index: this.qIndex,
        total: this.questions.length,
        text: q.text,
        type: q.type,
        category: q.category,
        difficulty: q.difficulty,
        points: this.settings.scoring === 'flat' ? this.settings.flatPoints : q.points,
        choices: q.type === 'mc' ? q.choices : undefined,
      }
      const answeredCount = [...this.players.values()].filter((p) => p.answers.has(this.qIndex)).length
      snap.answeredCount = answeredCount
      if (this.phase === 'question') {
        snap.deadline = this.deadline
        if (isHost) snap.hostKey = { correctAnswer: q.correct }
      } else {
        const answers = [...this.players.values()].map((p) => p.answers.get(this.qIndex)).filter((a): a is StoredAnswer => !!a)
        let distribution: number[] | undefined
        if (q.type === 'mc' && q.choices) {
          distribution = q.choices.map(() => 0)
          for (const a of answers) if (a.choiceIndex !== undefined) distribution[a.choiceIndex]++
        }
        snap.reveal = {
          correctAnswer: q.correct,
          explanation: q.explanation,
          distribution,
          answered: answers.length,
          correctCount: answers.filter((a) => a.correct).length,
        }
      }
    }

    if (viewer.role === 'player') {
      const p = this.byToken.get(viewer.token)
      if (p) {
        const row = rows.find((r) => r.name === p.name)
        const current = p.answers.get(this.qIndex)
        const self: PlayerSelf = {
          name: p.name,
          rank: row?.rank ?? 0,
          score: row?.score ?? 0,
          correct: row?.correct ?? 0,
          incorrect: row?.incorrect ?? 0,
          unanswered: row?.unanswered ?? 0,
          answered: this.phase === 'question' && !!current,
        }
        if (this.phase === 'question' && current) self.myAnswer = current.answer
        if (this.phase === 'reveal') {
          self.myAnswer = current?.answer
          self.lastResult = { correct: !!current?.correct, earned: current?.earned ?? 0 }
        }
        snap.self = self
        // Players always see their own row even outside the top 10.
        if (showBoard && row && !snap.leaderboard.some((r) => r.name === p.name)) snap.leaderboard = [...snap.leaderboard, row]
        snap.leaderboard = snap.leaderboard.map((r) => (r.name === p.name ? { ...r, you: true } : r))
      }
    }
    return snap
  }
}
