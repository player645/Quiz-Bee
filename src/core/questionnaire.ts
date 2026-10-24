import { DEFAULT_POINTS, DIFFICULTIES } from './types.ts'
import type { Difficulty, Question, QuestionType } from './types.ts'

export const IMPORT_LIMITS = {
  maxQuestions: 200,
  maxFileBytes: 1_000_000,
  maxText: 500,
  maxChoice: 200,
  maxExplanation: 1000,
  maxCategory: 40,
  maxAccepted: 20,
} as const

/** Difficulty used when a questionnaire does not provide one. */
export const DEFAULT_IMPORT_DIFFICULTY: Difficulty = 'medium'

export interface ImportIssue {
  /** "Row 4" (CSV), "Question 3" (JSON) or "File". */
  where: string
  field?: string
  message: string
}

export interface ImportResult {
  ok: boolean
  format: 'json' | 'csv'
  questions: Question[]
  errors: ImportIssue[]
  warnings: string[]
}

/* ------------------------------- CSV parsing ------------------------------ */

/** Minimal RFC-4180 style parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/* ------------------------------ Normalization ----------------------------- */

const TYPE_ALIASES: Record<string, QuestionType> = {
  mc: 'mc',
  multiplechoice: 'mc',
  multiple_choice: 'mc',
  'multiple choice': 'mc',
  id: 'id',
  identification: 'id',
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null
}

/**
 * Validates and normalizes raw question objects (from a JSON file, from a CSV
 * converted to objects, or from the host's browser as received by the server).
 * Also used by the server, so untrusted data is always re-validated.
 */
export function validateRawQuestions(rawList: unknown, label: (i: number) => string = (i) => `Question ${i + 1}`): {
  questions: Question[]
  errors: ImportIssue[]
  warnings: string[]
} {
  const errors: ImportIssue[] = []
  const questions: Question[] = []
  let defaultedDifficulty = 0

  if (!Array.isArray(rawList)) {
    return { questions, errors: [{ where: 'File', message: 'Expected a list of questions.' }], warnings: [] }
  }
  if (rawList.length === 0) {
    return { questions, errors: [{ where: 'File', message: 'The questionnaire has no questions.' }], warnings: [] }
  }
  if (rawList.length > IMPORT_LIMITS.maxQuestions) {
    return {
      questions,
      errors: [{ where: 'File', message: `Too many questions (${rawList.length}). The limit is ${IMPORT_LIMITS.maxQuestions}.` }],
      warnings: [],
    }
  }

  const seenIds = new Set<string>()
  rawList.forEach((raw, i) => {
    const where = label(i)
    const err = (field: string, message: string) => errors.push({ where, field, message })
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push({ where, message: 'Not a valid question entry.' })
      return
    }
    const r = raw as Record<string, unknown>
    const before = errors.length

    // type
    const typeRaw = str(r.type)
    const type = typeRaw ? TYPE_ALIASES[typeRaw.toLowerCase()] : undefined
    if (!type) err('type', 'Required. Use "mc" (multiple choice) or "id" (identification).')

    // category
    const category = str(r.category)
    if (!category) err('category', 'Required.')
    else if (category.length > IMPORT_LIMITS.maxCategory) err('category', `Must be ${IMPORT_LIMITS.maxCategory} characters or fewer.`)

    // question text
    const text = str(r.question ?? r.text)
    if (!text) err('question', 'Required.')
    else if (text.length > IMPORT_LIMITS.maxText) err('question', `Must be ${IMPORT_LIMITS.maxText} characters or fewer.`)

    // difficulty
    let difficulty: Difficulty = DEFAULT_IMPORT_DIFFICULTY
    const diffRaw = r.difficulty === undefined || r.difficulty === null || r.difficulty === '' ? null : str(r.difficulty)
    if (diffRaw === null) defaultedDifficulty++
    else if (DIFFICULTIES.includes(diffRaw.toLowerCase() as Difficulty)) difficulty = diffRaw.toLowerCase() as Difficulty
    else err('difficulty', 'Must be easy, medium or hard.')

    // points
    let points: number | null = null
    if (r.points !== undefined && r.points !== null && r.points !== '') {
      const n = typeof r.points === 'number' ? r.points : Number(String(r.points).trim())
      if (!Number.isInteger(n) || n < 1 || n > 100) err('points', 'Must be a whole number from 1 to 100.')
      else points = n
    }

    // explanation
    let explanation = ''
    if (r.explanation !== undefined && r.explanation !== null) {
      const e = str(r.explanation)
      if (e === null) err('explanation', 'Must be text.')
      else if (e.length > IMPORT_LIMITS.maxExplanation) err('explanation', `Must be ${IMPORT_LIMITS.maxExplanation} characters or fewer.`)
      else explanation = e
    }

    // id
    let id = `custom-${i + 1}`
    if (r.id !== undefined && r.id !== null && r.id !== '') {
      const s = str(r.id)
      if (!s || !/^[\w.-]{1,64}$/.test(s)) err('id', 'Use up to 64 letters, digits, "_", "-" or ".".')
      else id = s
    }
    if (seenIds.has(id)) err('id', `Duplicate id "${id}".`)
    seenIds.add(id)

    // tags
    let tags: string[] | undefined
    if (Array.isArray(r.tags)) {
      tags = r.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).slice(0, 10)
    }

    // answers
    let choices: string[] | undefined
    let correct = ''
    let accepted: string[] | undefined
    const correctRaw = str(r.correct)

    if (type === 'mc') {
      if (!Array.isArray(r.choices)) err('choices', 'Multiple choice needs a list of 2 to 6 choices.')
      else {
        const list = r.choices.map((c) => (typeof c === 'string' ? c.trim() : ''))
        const filled = list.filter(Boolean)
        if (filled.length < 2 || filled.length > 6) err('choices', 'Provide between 2 and 6 non-empty choices.')
        else if (filled.some((c) => c.length > IMPORT_LIMITS.maxChoice)) err('choices', `Each choice must be ${IMPORT_LIMITS.maxChoice} characters or fewer.`)
        else if (new Set(filled.map((c) => c.toLowerCase())).size !== filled.length) err('choices', 'Choices must be different from each other.')
        else {
          choices = filled
          if (!correctRaw) err('correct', 'Required. Give the correct choice text or its letter (A, B, ...).')
          else {
            const exact = filled.find((c) => c === correctRaw) ?? filled.find((c) => c.toLowerCase() === correctRaw.toLowerCase())
            const letterIndex = /^[A-Fa-f]$/.test(correctRaw) ? correctRaw.toUpperCase().charCodeAt(0) - 65 : -1
            if (exact) correct = exact
            else if (letterIndex >= 0 && letterIndex < filled.length) correct = filled[letterIndex]
            else err('correct', 'Must match one of the choices (text or letter).')
          }
        }
      }
    } else if (type === 'id') {
      if (!correctRaw) err('correct', 'Required.')
      else if (correctRaw.length > IMPORT_LIMITS.maxChoice) err('correct', `Must be ${IMPORT_LIMITS.maxChoice} characters or fewer.`)
      else {
        correct = correctRaw
        let extra: string[] = []
        if (r.accepted !== undefined && r.accepted !== null && r.accepted !== '') {
          if (Array.isArray(r.accepted) && r.accepted.every((a) => typeof a === 'string')) extra = (r.accepted as string[]).map((a) => a.trim()).filter(Boolean)
          else if (typeof r.accepted === 'string') extra = r.accepted.split('|').map((a) => a.trim()).filter(Boolean)
          else err('accepted', 'Must be a list of text answers (JSON) or answers separated by "|" (CSV).')
        }
        if (extra.some((a) => a.length > IMPORT_LIMITS.maxChoice) || extra.length > IMPORT_LIMITS.maxAccepted)
          err('accepted', `At most ${IMPORT_LIMITS.maxAccepted} accepted answers of ${IMPORT_LIMITS.maxChoice} characters each.`)
        accepted = [...new Set([correct, ...extra])]
      }
    }

    if (errors.length === before && type && category && text) {
      const q: Question = {
        id,
        type,
        category,
        difficulty,
        text,
        correct,
        explanation,
        points: points ?? DEFAULT_POINTS[type],
      }
      if (type === 'mc') q.choices = choices
      else q.accepted = accepted
      if (tags && tags.length) q.tags = tags
      questions.push(q)
    }
  })

  const warnings: string[] = []
  if (defaultedDifficulty > 0)
    warnings.push(`${defaultedDifficulty} question(s) had no difficulty and were set to "${DEFAULT_IMPORT_DIFFICULTY}".`)
  return { questions, errors, warnings }
}

/* --------------------------------- Entry --------------------------------- */

const CSV_KNOWN = new Set([
  'id', 'type', 'category', 'difficulty', 'points', 'question', 'correct', 'accepted', 'explanation', 'tags',
  'choice1', 'choice2', 'choice3', 'choice4', 'choice5', 'choice6',
])

export function parseQuestionnaire(text: string, format: 'json' | 'csv'): ImportResult {
  const fail = (message: string): ImportResult => ({ ok: false, format, questions: [], errors: [{ where: 'File', message }], warnings: [] })

  if (text.length > IMPORT_LIMITS.maxFileBytes) return fail('The file is too large (limit 1 MB).')

  if (format === 'json') {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return fail('The file is not valid JSON.')
    }
    const list = Array.isArray(data) ? data : (data as { questions?: unknown } | null)?.questions
    const v = validateRawQuestions(list)
    return { ok: v.errors.length === 0, format, ...v }
  }

  const rows = parseCsv(text)
  if (rows.length < 2) return fail('The CSV needs a header row and at least one question row.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const required = ['type', 'category', 'question', 'correct']
  const missing = required.filter((h) => !header.includes(h))
  if (missing.length) return fail(`Missing required column(s): ${missing.join(', ')}.`)

  const warnings: string[] = []
  const unknown = header.filter((h) => h && !CSV_KNOWN.has(h))
  if (unknown.length) warnings.push(`Ignored unknown column(s): ${unknown.join(', ')}.`)

  const objects = rows.slice(1).map((cells) => {
    const o: Record<string, unknown> = {}
    header.forEach((h, idx) => {
      if (CSV_KNOWN.has(h)) o[h] = cells[idx] ?? ''
    })
    const choices = ['choice1', 'choice2', 'choice3', 'choice4', 'choice5', 'choice6']
      .map((k) => String(o[k] ?? '').trim())
      .filter(Boolean)
    if (choices.length) o.choices = choices
    if (typeof o.tags === 'string') o.tags = o.tags.split('|').map((t) => t.trim()).filter(Boolean)
    return o
  })
  // Spreadsheet row numbers: the header is row 1, so the first question is row 2.
  const v = validateRawQuestions(objects, (i) => `Row ${i + 2}`)
  return { ok: v.errors.length === 0, format, questions: v.questions, errors: v.errors, warnings: [...warnings, ...v.warnings] }
}
