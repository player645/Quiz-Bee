import { useState } from 'react'
import { IMPORT_LIMITS, parseQuestionnaire } from '../core/questionnaire.ts'
import type { ImportResult } from '../core/questionnaire.ts'
import { TYPE_LABEL } from '../core/types.ts'
import type { Question } from '../core/types.ts'
import sampleJson from '../../samples/questionnaire.json?raw'
import sampleCsv from '../../samples/questionnaire.csv?raw'

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  /** Called with the validated questions, or null while the file is missing or invalid. */
  onLoaded: (questions: Question[] | null) => void
  idPrefix: string
}

export function ImportPanel({ onLoaded, idPrefix }: Props) {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [readError, setReadError] = useState('')

  async function onFile(file: File | undefined) {
    setReadError('')
    setResult(null)
    onLoaded(null)
    if (!file) return
    setFileName(file.name)
    const lower = file.name.toLowerCase()
    const format = lower.endsWith('.json') ? 'json' : lower.endsWith('.csv') ? 'csv' : null
    if (!format) return setReadError('Choose a .json or .csv file.')
    if (file.size > IMPORT_LIMITS.maxFileBytes) return setReadError('The file is too large (limit 1 MB).')
    try {
      const parsed = parseQuestionnaire(await file.text(), format)
      setResult(parsed)
      onLoaded(parsed.ok ? parsed.questions : null)
    } catch {
      setReadError('The file could not be read. Try saving it again as UTF-8.')
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`${idPrefix}-file`}>Questionnaire file (.json or .csv)</label>
        <input id={`${idPrefix}-file`} className="input" type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        <span className="hint">Your file is used for this session only. The built-in question bank is not changed.</span>
      </div>

      <div className="row">
        <button type="button" className="btn ghost" onClick={() => download('quizbee-sample.json', sampleJson, 'application/json')}>Download sample JSON</button>
        <button type="button" className="btn ghost" onClick={() => download('quizbee-sample.csv', sampleCsv, 'text/csv')}>Download sample CSV</button>
      </div>

      <details>
        <summary>File format help</summary>
        <div className="small stack">
          <p><b>CSV columns:</b> type, category, question, correct (required); difficulty, points, choice1 to choice6, accepted, explanation, id, tags (optional).</p>
          <p><b>type</b> is <code>mc</code> or <code>id</code>. For <code>mc</code>, give 2 to 6 choices and set <code>correct</code> to the correct choice text or its letter (A, B, ...). For <code>id</code>, <code>correct</code> is the answer and <code>accepted</code> lists extra accepted answers separated by <code>|</code>.</p>
          <p><b>difficulty</b> is easy, medium or hard (missing values become medium). <b>points</b> is a whole number from 1 to 100 (defaults: 1 for mc, 2 for id). Up to {IMPORT_LIMITS.maxQuestions} questions per file.</p>
          <p>JSON files use the same field names: a list of question objects, or <code>{'{ "questions": [ ... ] }'}</code>, with <code>choices</code> and <code>accepted</code> as lists.</p>
        </div>
      </details>

      <div aria-live="polite">
        {readError && <p className="notice error">{readError}</p>}
        {result && result.errors.length > 0 && (
          <div className="notice error">
            <b>{fileName} has {result.errors.length} problem{result.errors.length === 1 ? '' : 's'}. Fix them and choose the file again.</b>
            <ul>
              {result.errors.slice(0, 25).map((e, i) => (
                <li key={i}>{e.where}{e.field ? `, ${e.field}` : ''}: {e.message}</li>
              ))}
            </ul>
            {result.errors.length > 25 && <p>...and {result.errors.length - 25} more.</p>}
          </div>
        )}
        {result?.ok && (
          <div className="notice ok">
            <b>{fileName}: {result.questions.length} questions are ready.</b>
            {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
      </div>

      {result?.ok && (
        <div>
          <h3>Preview</h3>
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>#</th><th>Type</th><th>Category</th><th>Level</th><th className="num">Pts</th><th>Question</th><th>Answer</th></tr>
              </thead>
              <tbody>
                {result.questions.map((q, i) => (
                  <tr key={q.id}>
                    <td>{i + 1}</td><td>{TYPE_LABEL[q.type]}</td><td>{q.category}</td><td>{q.difficulty}</td><td className="num">{q.points}</td>
                    <td>{q.text}</td><td>{q.correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
