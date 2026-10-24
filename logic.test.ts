import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_QUESTIONS } from '../src/data/defaultQuestions.ts'
import { filterPool, selectQuestions } from '../src/core/selection.ts'
import { evaluatePractice, performanceRating, rankPlayers, summarizePractice } from '../src/core/scoring.ts'
import type { PracticeAnswer } from '../src/core/scoring.ts'
import { parseCsv, parseQuestionnaire } from '../src/core/questionnaire.ts'
import { normalizeSettings } from '../src/core/liveTypes.ts'

const ALL = ['History', 'Culture', 'Geography', 'Government']
const BOTH = ['mc', 'id'] as const

function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

test('default practice run: 40 questions, 5 per category per type, 60 max points, no duplicates', () => {
  const r = selectQuestions(DEFAULT_QUESTIONS, { categories: ALL, difficulties: [], types: BOTH, count: 40, order: 'mcFirst' }, seeded(1))
  assert.equal(r.questions.length, 40)
  assert.equal(new Set(r.questions.map((q) => q.id)).size, 40)
  for (const c of ALL) for (const t of BOTH) assert.equal(r.questions.filter((q) => q.category === c && q.type === t).length, 5)
  assert.equal(r.questions.reduce((s, q) => s + q.points, 0), 60)
  assert.ok(r.questions.slice(0, 20).every((q) => q.type === 'mc') && r.questions.slice(20).every((q) => q.type === 'id'))
})

test('category, difficulty and type filters match the real pool', () => {
  const hard = filterPool(DEFAULT_QUESTIONS, { categories: ALL, difficulties: ['hard'], types: BOTH })
  assert.ok(hard.length > 0 && hard.every((q) => q.difficulty === 'hard'))
  const geoMc = filterPool(DEFAULT_QUESTIONS, { categories: ['Geography'], difficulties: [], types: ['mc'] })
  assert.equal(geoMc.length, 8)
  assert.equal(filterPool(DEFAULT_QUESTIONS, { categories: [], difficulties: [], types: BOTH }).length, 0)
})

test('insufficient pool: returns the maximum available, never duplicates, flags shortfall', () => {
  const r = selectQuestions(DEFAULT_QUESTIONS, { categories: ['History'], difficulties: ['hard'], types: ['mc'], count: 20 })
  assert.equal(r.available, 1)
  assert.equal(r.questions.length, 1)
  assert.equal(r.shortfall, true)
  const none = selectQuestions(DEFAULT_QUESTIONS, { categories: ['History'], difficulties: ['hard'], types: ['mc'], count: 0 })
  assert.equal(none.questions.length, 0)
  const empty = selectQuestions(DEFAULT_QUESTIONS, { categories: [], difficulties: [], types: BOTH, count: 10 })
  assert.equal(empty.available, 0)
})

test('"bank" order follows the question bank', () => {
  const r = selectQuestions(DEFAULT_QUESTIONS, { categories: ALL, difficulties: [], types: BOTH, count: 64, order: 'bank' })
  assert.deepEqual(r.questions.map((q) => q.id), DEFAULT_QUESTIONS.map((q) => q.id))
})

test('practice scoring: MC 1 point, identification 2 points, wrong = 0', () => {
  const mc = DEFAULT_QUESTIONS.find((q) => q.type === 'mc')!
  const id = DEFAULT_QUESTIONS.find((q) => q.type === 'id')!
  assert.deepEqual(evaluatePractice(mc, mc.correct), { ok: true, earned: 1 })
  assert.deepEqual(evaluatePractice(mc, 'nope'), { ok: false, earned: 0 })
  assert.deepEqual(evaluatePractice(id, id.accepted![0].toUpperCase()), { ok: true, earned: 2 })
  assert.deepEqual(evaluatePractice(id, 'zzz'), { ok: false, earned: 0 })
})

test('practice summary, breakdowns and rating bands', () => {
  const mc = DEFAULT_QUESTIONS.find((q) => q.type === 'mc' && q.category === 'History')!
  const id = DEFAULT_QUESTIONS.find((q) => q.type === 'id' && q.category === 'Culture')!
  const answers: PracticeAnswer[] = [
    { question: mc, answer: mc.correct, ...evaluatePractice(mc, mc.correct) },
    { question: id, answer: 'wrong', ...evaluatePractice(id, 'wrong') },
  ]
  const s = summarizePractice(answers, ['History', 'Culture'])
  assert.equal(s.earned, 1)
  assert.equal(s.max, 3)
  assert.equal(s.correct, 1)
  assert.equal(s.incorrect, 1)
  assert.deepEqual(s.byCategory.map((b) => [b.key, b.earned, b.max]), [['History', 1, 1], ['Culture', 0, 2]])
  assert.deepEqual(s.byType.map((b) => b.key), ['mc', 'id'])
  assert.equal(summarizePractice([]).pct, 0)
  assert.equal(performanceRating(95).label, 'Outstanding')
  assert.equal(performanceRating(80).label, 'Excellent')
  assert.equal(performanceRating(70).label, 'Good')
  assert.equal(performanceRating(60).label, 'Fair')
  assert.equal(performanceRating(59.9).label, 'Needs Improvement')
})

test('ranking: shared ranks for equal score and correct count, deterministic order', () => {
  const rows = rankPlayers([
    { name: 'Cara', score: 10, correct: 5 },
    { name: 'Ana', score: 10, correct: 5 },
    { name: 'Ben', score: 12, correct: 4 },
    { name: 'Dan', score: 10, correct: 4 },
  ])
  assert.deepEqual(rows.map((r) => [r.name, r.rank]), [['Ben', 1], ['Ana', 2], ['Cara', 2], ['Dan', 4]])
})

test('CSV parser handles quotes, commas, newlines and BOM', () => {
  const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\n"line1\nline2",z\n')
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']])
})

test('sample JSON and CSV files import cleanly and produce the same questions', () => {
  const json = parseQuestionnaire(readFileSync(new URL('../samples/questionnaire.json', import.meta.url), 'utf8'), 'json')
  const csv = parseQuestionnaire(readFileSync(new URL('../samples/questionnaire.csv', import.meta.url), 'utf8'), 'csv')
  assert.deepEqual(json.errors, [])
  assert.deepEqual(csv.errors, [])
  assert.ok(json.questions.length >= 4)
  assert.deepEqual(csv.questions.map((q) => [q.type, q.text, q.correct]), json.questions.map((q) => [q.type, q.text, q.correct]))
})

test('invalid questionnaires report row numbers and field names', () => {
  const csv = [
    'type,category,difficulty,points,question,correct,choice1,choice2,choice3,choice4,accepted',
    'mc,Math,easy,1,2+2?,4,3,4,5,6,',
    'mc,Math,extreme,1,Bad difficulty,A,x,y,,,',
    'mc,Math,easy,0,Bad points,A,x,y,,,',
    'mc,Math,easy,1,Missing correct,Z,x,y,,,',
    'id,,easy,1,No category,answer,,,,,',
    'xx,Math,easy,1,Bad type,a,,,,,',
    'mc,Math,easy,1,One choice,x,x,,,,',
    'id,Math,easy,1,   ,answer,,,,,',
  ].join('\n')
  const r = parseQuestionnaire(csv, 'csv')
  assert.equal(r.ok, false)
  const where = (row: string, field: string) => r.errors.some((e) => e.where === row && e.field === field)
  assert.ok(where('Row 3', 'difficulty'))
  assert.ok(where('Row 4', 'points'))
  assert.ok(where('Row 5', 'correct'))
  assert.ok(where('Row 6', 'category'))
  assert.ok(where('Row 7', 'type'))
  assert.ok(where('Row 8', 'choices'))
  assert.ok(where('Row 9', 'question'))
  assert.ok(!r.errors.some((e) => e.where === 'Row 2'))
  assert.equal(r.questions.length, 1)
})

test('JSON import: file-level problems, defaults, letter answers, accepted lists', () => {
  assert.equal(parseQuestionnaire('{oops', 'json').ok, false)
  assert.equal(parseQuestionnaire('[]', 'json').ok, false)
  assert.equal(parseQuestionnaire('{"questions": 5}', 'json').ok, false)
  assert.equal(parseCsv('').length, 0)
  assert.equal(parseQuestionnaire('type,category\nmc,x', 'csv').ok, false)

  const r = parseQuestionnaire(
    JSON.stringify([
      { type: 'multiple_choice', category: 'Science', question: 'Pick B', choices: ['a', 'b'], correct: 'B' },
      { type: 'identification', category: 'Science', question: 'Name it', correct: 'Water', accepted: ['H2O'], points: 3, difficulty: 'HARD' },
    ]),
    'json',
  )
  assert.equal(r.ok, true)
  assert.equal(r.questions[0].correct, 'b')
  assert.equal(r.questions[0].difficulty, 'medium')
  assert.equal(r.questions[0].points, 1)
  assert.deepEqual(r.questions[1].accepted, ['Water', 'H2O'])
  assert.equal(r.questions[1].difficulty, 'hard')
  assert.equal(r.questions[1].points, 3)
  assert.equal(r.warnings.length, 1)
})

test('duplicate ids and HTML-looking text are handled as plain data', () => {
  const dup = parseQuestionnaire(
    JSON.stringify([
      { id: 'a', type: 'id', category: 'X', question: 'q1', correct: 'a' },
      { id: 'a', type: 'id', category: 'X', question: '<img src=x onerror=alert(1)>', correct: 'b' },
    ]),
    'json',
  )
  assert.equal(dup.ok, false)
  const html = parseQuestionnaire(JSON.stringify([{ type: 'id', category: 'X', question: '<b>bold</b>', correct: 'b' }]), 'json')
  assert.equal(html.questions[0].text, '<b>bold</b>') // stored verbatim; React renders it as text, never as HTML
})

test('live settings validation', () => {
  assert.equal(normalizeSettings({}).ok, true)
  assert.equal(normalizeSettings({ timerSeconds: 4 }).ok, false)
  assert.equal(normalizeSettings({ timerSeconds: 121 }).ok, false)
  assert.equal(normalizeSettings({ timerSeconds: 30, speedBonus: true }).ok, true)
  assert.equal(normalizeSettings({ scoring: 'weird' }).ok, false)
  assert.equal(normalizeSettings({ speedBonus: 'yes' }).ok, false)
})
