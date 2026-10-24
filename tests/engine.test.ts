import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GameRoom } from '../server/room.ts'
import { DEFAULT_SETTINGS } from '../src/core/liveTypes.ts'
import type { RoomSettings } from '../src/core/liveTypes.ts'
import type { Question } from '../src/core/types.ts'

const Q: Question[] = [
  { id: 'q1', type: 'mc', category: 'A', difficulty: 'easy', text: 'Pick two', choices: ['one', 'two', 'three'], correct: 'two', explanation: 'because', points: 1 },
  { id: 'q2', type: 'id', category: 'A', difficulty: 'easy', text: 'Name it', correct: 'Rizal', accepted: ['jose rizal', 'rizal'], explanation: 'national hero', points: 2 },
]

function setup(over: Partial<RoomSettings> = {}) {
  let t = 1_000_000
  const clock = { now: () => t, advance: (ms: number) => (t += ms) }
  const settings = { ...DEFAULT_SETTINGS, timerSeconds: 10, shuffleChoices: false, ...over }
  const room = new GameRoom({ code: 'ABC234', questions: Q, settings, now: clock.now })
  const join = (name: string) => {
    const r = room.join(name)
    assert.ok(r.ok)
    return (r as { token: string }).token
  }
  return { room, clock, join }
}

test('host-only actions require the host token', () => {
  const { room, join } = setup()
  const p = join('Ana')
  assert.equal(room.hostAction(p, 'start').ok, false)
  assert.equal(room.hostAction('wrong', 'start').ok, false)
  assert.equal(room.hostAction(room.hostToken, 'start').ok, true)
})

test('cannot start with no players; invalid transitions are rejected', () => {
  const { room, join } = setup()
  assert.equal(room.hostAction(room.hostToken, 'start').ok, false)
  join('Ana')
  assert.equal(room.hostAction(room.hostToken, 'reveal').ok, false)
  assert.equal(room.hostAction(room.hostToken, 'next').ok, false)
  room.hostAction(room.hostToken, 'start')
  assert.equal(room.hostAction(room.hostToken, 'start').ok, false)
  assert.equal(room.hostAction(room.hostToken, 'next').ok, false) // must reveal first
})

test('names: trimmed, validated, duplicates rejected case-insensitively, late joins blocked', () => {
  const { room, join } = setup()
  assert.equal(room.join('   ').ok, false)
  assert.equal(room.join('x'.repeat(25)).ok, false)
  const a = room.join('  Ana   Lou ')
  assert.ok(a.ok && a.name === 'Ana Lou')
  assert.equal(room.join('ana lou').ok, false)
  join('Ben')
  room.hostAction(room.hostToken, 'start')
  const late = room.join('Cara')
  assert.ok(!late.ok && late.code === 'GAME_STARTED')
})

test('answers: only while open, one per question, none after the deadline', () => {
  const { room, clock, join } = setup({ autoReveal: false })
  const ana = join('Ana')
  join('Ben')
  assert.equal(room.submit(ana, 0, { choice: 1 }).ok, false) // lobby
  room.hostAction(room.hostToken, 'start')
  assert.equal(room.submit('nope', 0, { choice: 1 }).ok, false)
  assert.equal(room.submit(ana, 1, { choice: 1 }).ok, false) // wrong question index
  assert.equal(room.submit(ana, 0, { choice: 9 }).ok, false) // bad choice
  assert.equal(room.submit(ana, 0, { choice: 1 }).ok, true)
  const dup = room.submit(ana, 0, { choice: 0 })
  assert.ok(!dup.ok && dup.code === 'ALREADY_ANSWERED')
  clock.advance(10_001)
  const late = room.submit(ana, 0, { choice: 0 })
  assert.equal(late.ok, false)
  assert.equal(room.phase, 'reveal') // the deadline closed the question
})

test('server-side deadline enforced to the millisecond', () => {
  const { room, clock, join } = setup({ autoReveal: false })
  const ana = join('Ana')
  const ben = join('Ben')
  room.hostAction(room.hostToken, 'start')
  clock.advance(9_999)
  assert.equal(room.submit(ana, 0, { choice: 1 }).ok, true)
  clock.advance(2)
  const r = room.submit(ben, 0, { choice: 1 })
  assert.ok(!r.ok && (r.code === 'NOT_OPEN' || r.code === 'TOO_LATE'))
})

test('no score or correctness leaks before the reveal; hostKey is host-only', () => {
  const { room, join } = setup({ autoReveal: false })
  const ana = join('Ana')
  join('Ben')
  room.hostAction(room.hostToken, 'start')
  room.submit(ana, 0, { choice: 1 })
  const player = room.snapshot({ role: 'player', token: ana })
  assert.equal(player.self!.answered, true)
  assert.equal(player.self!.score, 0)
  assert.equal(player.self!.correct, 0)
  assert.equal(player.reveal, undefined)
  assert.equal(player.hostKey, undefined)
  assert.equal(player.self!.lastResult, undefined)
  assert.ok(!JSON.stringify(player).includes('"correctAnswer"'))
  assert.equal(room.snapshot({ role: 'host' }).hostKey!.correctAnswer, 'two')
})

test('scoring, auto-reveal, leaderboard, unanswered counts and final results', () => {
  const { room, join } = setup()
  const ana = join('Ana')
  const ben = join('Ben')
  const cara = join('Cara')
  room.hostAction(room.hostToken, 'start')
  room.submit(ana, 0, { choice: 1 }) // correct
  room.submit(ben, 0, { choice: 0 }) // wrong
  assert.equal(room.phase, 'question') // Cara hasn't answered
  room.submit(cara, 0, { choice: 1 })
  assert.equal(room.phase, 'reveal') // everyone answered -> auto reveal
  let snap = room.snapshot({ role: 'player', token: ben })
  assert.equal(snap.reveal!.correctAnswer, 'two')
  assert.deepEqual(snap.reveal!.distribution, [1, 2, 0])
  assert.deepEqual(snap.self!.lastResult, { correct: false, earned: 0 })
  room.hostAction(room.hostToken, 'next')
  room.submit(ana, 1, { text: '  JOSE   Rizal ' }) // identification: normalized match, 2 pts
  room.submit(ben, 1, { text: 'bonifacio' })
  // Cara does not answer; time runs out
  room.hostAction(room.hostToken, 'reveal')
  room.hostAction(room.hostToken, 'next')
  assert.equal(room.phase, 'finished')
  snap = room.snapshot({ role: 'host' })
  const byName = Object.fromEntries(snap.leaderboard.map((r) => [r.name, r]))
  assert.deepEqual([byName.Ana.score, byName.Ana.correct, byName.Ana.incorrect, byName.Ana.unanswered], [3, 2, 0, 0])
  assert.deepEqual([byName.Ben.score, byName.Ben.correct, byName.Ben.incorrect, byName.Ben.unanswered], [0, 0, 2, 0])
  assert.deepEqual([byName.Cara.score, byName.Cara.correct, byName.Cara.incorrect, byName.Cara.unanswered], [1, 1, 0, 1])
  assert.deepEqual(snap.leaderboard.map((r) => r.name), ['Ana', 'Cara', 'Ben'])
  assert.equal(snap.leaderboard[0].rank, 1)
})

test('speed bonus formula and flat scoring', () => {
  const { room, clock, join } = setup({ speedBonus: true, scoring: 'flat', flatPoints: 10, autoReveal: false })
  const ana = join('Ana')
  const ben = join('Ben')
  room.hostAction(room.hostToken, 'start')
  room.submit(ana, 0, { choice: 1 }) // instant: 10 + round(10*0.5*1) = 15
  clock.advance(5_000)
  room.submit(ben, 0, { choice: 1 }) // half the time left: 10 + round(10*0.5*0.5) = 13 (12.5 rounds to 13)
  room.hostAction(room.hostToken, 'reveal')
  const rows = room.snapshot({ role: 'host' }).leaderboard
  assert.equal(rows.find((r) => r.name === 'Ana')!.score, 15)
  assert.equal(rows.find((r) => r.name === 'Ben')!.score, 13)
})

test('refresh/reconnect with the same token resumes the player and gives no extra attempt', () => {
  const { room, join } = setup({ autoReveal: false })
  const ana = join('Ana')
  join('Ben')
  room.hostAction(room.hostToken, 'start')
  room.submit(ana, 0, { choice: 0 })
  const back = room.join('ignored', ana)
  assert.ok(back.ok && back.resumed && back.name === 'Ana')
  assert.equal(room.submit(ana, 0, { choice: 1 }).ok, false)
  assert.equal(room.snapshot({ role: 'player', token: ana }).self!.myAnswer, 'one')
})

test('ending early closes the open question and finishes the game; ties share a rank', () => {
  const { room, join } = setup({ autoReveal: false })
  const ana = join('Ana')
  const ben = join('Ben')
  room.hostAction(room.hostToken, 'start')
  room.submit(ana, 0, { choice: 1 })
  room.submit(ben, 0, { choice: 1 })
  assert.equal(room.hostAction(room.hostToken, 'end').ok, true)
  assert.equal(room.phase, 'finished')
  const rows = room.snapshot({ role: 'host' }).leaderboard
  assert.deepEqual(rows.map((r) => r.rank), [1, 1])
  assert.equal(room.hostAction(room.hostToken, 'end').ok, false)
})

test('connection tracking drives the connected flags', () => {
  const { room, join } = setup()
  const ana = join('Ana')
  room.setConnection({ role: 'player', token: ana }, 1)
  room.setConnection({ role: 'host' }, 1)
  let snap = room.snapshot({ role: 'host' })
  assert.equal(snap.hostConnected, true)
  assert.equal(snap.players[0].connected, true)
  room.setConnection({ role: 'player', token: ana }, -1)
  room.setConnection({ role: 'host' }, -1)
  snap = room.snapshot({ role: 'host' })
  assert.equal(snap.hostConnected, false)
  assert.equal(snap.players[0].connected, false)
})
