import { useState } from 'react'
import { ImportPanel } from '../../components/ImportPanel.tsx'
import { PoolFilters, defaultFilter, toCriteria } from '../../components/PoolFilters.tsx'
import type { FilterState } from '../../components/PoolFilters.tsx'
import { LIVE_LIMITS, DEFAULT_SETTINGS } from '../../core/liveTypes.ts'
import type { RoomSettings } from '../../core/liveTypes.ts'
import { selectQuestions } from '../../core/selection.ts'
import type { OrderMode } from '../../core/selection.ts'
import type { Question } from '../../core/types.ts'
import { DEFAULT_QUESTIONS } from '../../data/defaultQuestions.ts'
import { api } from '../../services/liveClient.ts'
import { saveSession } from '../../services/session.ts'
import type { LiveSession } from '../../services/session.ts'

export function HostSetup({ onCreated }: { onCreated: (s: LiveSession) => void }) {
  const [source, setSource] = useState<'default' | 'custom'>('default')
  const [custom, setCustom] = useState<Question[] | null>(null)
  const [filter, setFilter] = useState<FilterState>(() => defaultFilter(DEFAULT_QUESTIONS, 10))
  const [order, setOrder] = useState<OrderMode>('random')
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pool = source === 'default' ? DEFAULT_QUESTIONS : custom ?? []
  const picked = selectQuestions(pool, toCriteria(filter, order))
  const timerOk = Number.isInteger(settings.timerSeconds) && settings.timerSeconds >= LIVE_LIMITS.timerMin && settings.timerSeconds <= LIVE_LIMITS.timerMax
  const flatOk = settings.scoring !== 'flat' || (Number.isInteger(settings.flatPoints) && settings.flatPoints >= 1 && settings.flatPoints <= LIVE_LIMITS.flatPointsMax)
  const canCreate = picked.questions.length > 0 && timerOk && flatOk && !busy

  function changeSource(next: 'default' | 'custom') {
    setSource(next)
    setFilter(defaultFilter(next === 'default' ? DEFAULT_QUESTIONS : custom ?? [], 10))
  }
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => setSettings((s) => ({ ...s, [k]: v }))

  async function create() {
    if (!canCreate) return
    setBusy(true)
    setError('')
    const r = await api.createRoom(picked.questions, settings)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const session: LiveSession = { role: 'host', code: r.data.code, token: r.data.hostToken }
    saveSession(session)
    onCreated(session)
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void create() }}>
      <div className="hero">
        <h1>Host a game</h1>
        <p>Choose your questions, set the rules, then share the room code with your players.</p>
      </div>

      <div className="card">
        <h2>1. Questions</h2>
        <fieldset>
          <legend>Question source</legend>
          <label className="check"><input type="radio" name="h-src" checked={source === 'default'} onChange={() => changeSource('default')} /> Built-in Philippine Social Science bank</label>
          <label className="check"><input type="radio" name="h-src" checked={source === 'custom'} onChange={() => changeSource('custom')} /> My own questionnaire file</label>
        </fieldset>
        {source === 'custom' && <ImportPanel idPrefix="h" onLoaded={(qs) => { setCustom(qs); setFilter(defaultFilter(qs ?? [], 10)) }} />}
        {pool.length > 0 && <PoolFilters pool={pool} value={filter} onChange={setFilter} idPrefix="h" />}
        <div className="field">
          <label htmlFor="h-order">Question order</label>
          <select id="h-order" className="input" value={order} onChange={(e) => setOrder(e.target.value as OrderMode)}>
            <option value="random">Random (same order for everyone)</option>
            <option value="mcFirst">Multiple choice first, then identification</option>
            <option value="bank">Order of the question list</option>
          </select>
        </div>
        <label className="check"><input type="checkbox" checked={settings.shuffleChoices} onChange={(e) => set('shuffleChoices', e.target.checked)} /> Shuffle multiple-choice options</label>
      </div>

      <div className="card">
        <h2>2. Timer and scoring</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="h-timer">Seconds per question ({LIVE_LIMITS.timerMin} to {LIVE_LIMITS.timerMax})</label>
            <input id="h-timer" className="input" type="number" inputMode="numeric" min={LIVE_LIMITS.timerMin} max={LIVE_LIMITS.timerMax} value={Number.isFinite(settings.timerSeconds) ? settings.timerSeconds : ''} onChange={(e) => set('timerSeconds', e.target.value === '' ? NaN : Math.floor(Number(e.target.value)))} />
          </div>
          <div className="field">
            <label htmlFor="h-scoring">Points per correct answer</label>
            <select id="h-scoring" className="input" value={settings.scoring} onChange={(e) => set('scoring', e.target.value as RoomSettings['scoring'])}>
              <option value="question">Each question's own points (multiple choice 1, identification 2)</option>
              <option value="flat">Same points for every question</option>
            </select>
          </div>
        </div>
        {settings.scoring === 'flat' && (
          <div className="field">
            <label htmlFor="h-flat">Points for every question</label>
            <input id="h-flat" className="input" type="number" inputMode="numeric" min={1} max={LIVE_LIMITS.flatPointsMax} value={Number.isFinite(settings.flatPoints) ? settings.flatPoints : ''} onChange={(e) => set('flatPoints', e.target.value === '' ? NaN : Math.floor(Number(e.target.value)))} />
          </div>
        )}
        <label className="check"><input type="checkbox" checked={settings.speedBonus} onChange={(e) => set('speedBonus', e.target.checked)} /> Speed bonus: up to +50% of the question's points, shrinking as time runs out</label>
        <label className="check"><input type="checkbox" checked={settings.autoReveal} onChange={(e) => set('autoReveal', e.target.checked)} /> Reveal automatically when everyone has answered</label>
        <p className="hint">Wrong or missing answers always score 0. The timer is enforced by the server. When time runs out the question closes automatically; you can also reveal early, then move on when you are ready.</p>
        {!timerOk && <p className="notice warn">Timer must be a whole number from {LIVE_LIMITS.timerMin} to {LIVE_LIMITS.timerMax}.</p>}
      </div>

      <div aria-live="polite">{error && <p className="notice error">{error}</p>}</div>
      <button type="submit" className="btn gold big" disabled={!canCreate}>{busy ? 'Creating game...' : `Create game (${picked.questions.length} questions)`}</button>
    </form>
  )
}
