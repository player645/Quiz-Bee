import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_QUESTIONS } from '../src/data/defaultQuestions.ts'
import { categoriesOf } from '../src/core/categories.ts'
import { isAcceptedAnswer, normalizeAnswer } from '../src/core/answerMatching.ts'

// Parse the untouched original HTML and compare it with the migrated bank.
const html = readFileSync(new URL('../legacy/original-index.html', import.meta.url), 'utf8')
const script = html.match(/<script>([\s\S]*)<\/script>/)![1]
const { MC, ID, CATS } = new Function(`${script.split('/* ---------- helpers')[0]}; return { MC, ID, CATS }`)() as {
  MC: Record<string, [string, string, string[], string][]>
  ID: Record<string, [string, string[], string, string][]>
  CATS: string[]
}

test('all 64 original questions are present (32 MC + 32 identification)', () => {
  assert.equal(DEFAULT_QUESTIONS.length, 64)
  assert.equal(DEFAULT_QUESTIONS.filter((q) => q.type === 'mc').length, 32)
  assert.equal(DEFAULT_QUESTIONS.filter((q) => q.type === 'id').length, 32)
  assert.deepEqual(categoriesOf(DEFAULT_QUESTIONS), ['History', 'Culture', 'Geography', 'Government'])
  for (const cat of CATS) {
    assert.equal(DEFAULT_QUESTIONS.filter((q) => q.category === cat && q.type === 'mc').length, 8, `${cat} MC`)
    assert.equal(DEFAULT_QUESTIONS.filter((q) => q.category === cat && q.type === 'id').length, 8, `${cat} ID`)
  }
})

test('every migrated question matches the original text, answers and explanation exactly', () => {
  for (const cat of CATS) {
    const mc = DEFAULT_QUESTIONS.filter((q) => q.category === cat && q.type === 'mc')
    MC[cat].forEach(([text, correct, wrong, explanation], i) => {
      assert.equal(mc[i].text, text)
      assert.equal(mc[i].correct, correct)
      assert.deepEqual([...mc[i].choices!].sort(), [correct, ...wrong].sort())
      assert.equal(mc[i].explanation, explanation)
      assert.equal(mc[i].points, 1)
    })
    const id = DEFAULT_QUESTIONS.filter((q) => q.category === cat && q.type === 'id')
    ID[cat].forEach(([text, accepted, display, explanation], i) => {
      assert.equal(id[i].text, text)
      assert.deepEqual(id[i].accepted, accepted)
      assert.equal(id[i].correct, display)
      assert.equal(id[i].explanation, explanation)
      assert.equal(id[i].points, 2)
    })
  }
})

test('ids are unique, difficulties valid, MC correct answer is among the choices', () => {
  assert.equal(new Set(DEFAULT_QUESTIONS.map((q) => q.id)).size, 64)
  for (const q of DEFAULT_QUESTIONS) {
    assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty), q.id)
    if (q.type === 'mc') {
      assert.equal(q.choices!.length, 4, q.id)
      assert.ok(q.choices!.includes(q.correct), q.id)
    } else assert.ok(q.accepted && q.accepted.length > 0, q.id)
  }
})

test('every identification display answer is accepted by its own answer list', () => {
  for (const q of DEFAULT_QUESTIONS.filter((x) => x.type === 'id')) {
    assert.ok(isAcceptedAnswer(q.correct, q.accepted!), `${q.id}: "${q.correct}" not accepted`)
  }
})

test('normalization behaves like the original', () => {
  assert.equal(normalizeAnswer('  The Cagayán   River. '), 'cagayan river')
  assert.equal(normalizeAnswer('Tydings–McDuffie'.replace('–', '-')), 'tydings mcduffie')
  assert.equal(normalizeAnswer('Bell & Trade'), 'bell and trade')
  assert.ok(isAcceptedAnswer('KARTILYA', ['kartilya ng katipunan', 'kartilya']))
  assert.ok(!isAcceptedAnswer('kartilyas', ['kartilya']), 'no fuzzy matching')
  assert.ok(!isAcceptedAnswer('   ', ['x']))
})
