import { useEffect, useState } from 'react'
import { ChoiceList } from '../../components/ChoiceList.tsx'
import { Leaderboard } from '../../components/Leaderboard.tsx'
import { StatusBar, Timer } from '../../components/LiveBits.tsx'
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../../core/types.ts'
import { api } from '../../services/liveClient.ts'
import { useCountdown, useRoom } from '../../services/useRoom.ts'
import type { LiveSession } from '../../services/session.ts'

export function PlayerRoom({ session, onExit }: { session: LiveSession; onExit: () => void }) {
  const { snapshot: s, status, serverNow } = useRoom(session.code, 'player', session.token)
  const left = useCountdown(s?.phase === 'question' ? s.deadline : undefined, serverNow)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const qIndex = s?.question?.index

  useEffect(() => {
    setText('')
    setError('')
  }, [qIndex])

  if (status === 'gone')
    return (
      <div className="card center stack">
        <h1>This game is no longer available</h1>
        <p className="muted">The host closed it, it expired, or the server restarted.</p>
        <button className="btn gold" onClick={onExit}>Back to home</button>
      </div>
    )
  if (!s || !s.self) return <div className="card" role="status">Joining the game...</div>

  const self = s.self
  const q = s.question

  async function submit(answer: { choice: number } | { text: string }) {
    if (!q || sending || self.answered) return
    setSending(true)
    setError('')
    const r = await api.answer(session.code, session.token, q.index, answer)
    setSending(false)
    if (!r.ok) setError(r.error)
  }

  const myChoiceIndex = q?.choices && self.myAnswer ? q.choices.indexOf(self.myAnswer) : -1

  return (
    <div className="stack live">
      <StatusBar status={status} hostConnected={s.hostConnected} role="player" />

      {s.phase === 'lobby' && (
        <div className="card center stack">
          <div className="big-state"><div className="icon" aria-hidden="true">✓</div><h1>You're in, {self.name}!</h1></div>
          <p>Waiting for the host to start the game...</p>
          <div className="players" aria-live="polite">
            {s.players.map((p) => <span key={p.name} className="player-chip">{p.name}</span>)}
          </div>
          <button className="btn ghost" onClick={onExit}>Leave game</button>
        </div>
      )}

      {s.phase === 'question' && q && (
        <div className="card">
          <div className="qhead">
            <div>
              <strong>Question {q.index + 1} of {q.total}</strong>
              <div className="pills" style={{ marginTop: '0.4rem' }}>
                <span className="pill">{q.category}</span><span className="pill">{DIFFICULTY_LABEL[q.difficulty]}</span>
                <span className="pill">{TYPE_LABEL[q.type]}</span><span className="pill gold">{q.points} pts</span>
              </div>
            </div>
          </div>
          <Timer leftMs={left} totalSeconds={s.settings.timerSeconds} />
          <h2 className="qtext">{q.text}</h2>
          {q.type === 'mc' && q.choices ? (
            <ChoiceList choices={q.choices} disabled={self.answered || sending || left <= 0} selectedIndex={myChoiceIndex >= 0 ? myChoiceIndex : null} onPick={(i) => void submit({ choice: i })} />
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) void submit({ text }) }}>
              <div className="field">
                <label htmlFor="p-answer">Your answer</label>
                <input id="p-answer" className="input" value={self.answered ? self.myAnswer ?? '' : text} disabled={self.answered || sending || left <= 0} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <button type="submit" className="btn" disabled={self.answered || sending || left <= 0 || !text.trim()}>Lock in answer</button>
            </form>
          )}
          <div aria-live="polite">
            {self.answered && <div className="feedback info"><strong>Answer locked in.</strong>Waiting for the reveal. You cannot change it.</div>}
            {left <= 0 && !self.answered && <div className="feedback bad"><strong>Time is up.</strong>No answer was recorded for this question.</div>}
            {error && <p className="notice error">{error}</p>}
          </div>
        </div>
      )}

      {s.phase === 'reveal' && q && s.reveal && (
        <>
          <div className="card">
            <strong>Question {q.index + 1} of {q.total}</strong>
            <h2 className="qtext">{q.text}</h2>
            {q.choices ? (
              <ChoiceList choices={q.choices} disabled selectedIndex={myChoiceIndex >= 0 ? myChoiceIndex : null} correctIndex={q.choices.indexOf(s.reveal.correctAnswer)} counts={s.reveal.distribution} />
            ) : (
              <p><b>Your answer:</b> {self.myAnswer || '(none)'}</p>
            )}
            <div className={`feedback ${self.lastResult?.correct ? 'ok' : 'bad'}`} role="status">
              <strong>
                {self.lastResult?.correct ? `✓ Correct! +${self.lastResult.earned} points` : self.myAnswer ? '✗ Not quite. +0 points' : '✗ No answer. +0 points'}
              </strong>
              {!self.lastResult?.correct && <div>Correct answer: <b>{s.reveal.correctAnswer}</b></div>}
              {s.reveal.explanation && <div style={{ marginTop: '0.4rem' }}>{s.reveal.explanation}</div>}
            </div>
            <p style={{ marginTop: '1rem' }}><b>You are #{self.rank} with {self.score} points.</b> Waiting for the host to continue...</p>
          </div>
          <div className="card"><h2>Standings</h2><Leaderboard rows={s.leaderboard} caption="Top standings" /></div>
        </>
      )}

      {s.phase === 'finished' && (
        <div className="card stack">
          <div className="big-state"><h1>Game over!</h1><p>You finished <b>#{self.rank}</b> with <b>{self.score} points</b>.</p></div>
          <Leaderboard rows={s.leaderboard} caption="Final standings" />
          <button className="btn gold" onClick={onExit}>Back to home</button>
        </div>
      )}
    </div>
  )
}
