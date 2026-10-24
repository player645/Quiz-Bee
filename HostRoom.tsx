import { useState } from 'react'
import { Leaderboard } from '../../components/Leaderboard.tsx'
import { StatusBar, Timer } from '../../components/LiveBits.tsx'
import { ChoiceList } from '../../components/ChoiceList.tsx'
import type { HostAction } from '../../core/liveTypes.ts'
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../../core/types.ts'
import { api } from '../../services/liveClient.ts'
import { useCountdown, useRoom } from '../../services/useRoom.ts'
import type { LiveSession } from '../../services/session.ts'

export function HostRoom({ session, onExit }: { session: LiveSession; onExit: () => void }) {
  const { snapshot: s, status, serverNow } = useRoom(session.code, 'host', session.token)
  const left = useCountdown(s?.phase === 'question' ? s.deadline : undefined, serverNow)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'gone')
    return (
      <div className="card center stack">
        <h1>This game is no longer available</h1>
        <p className="muted">The room was closed or expired, or the server restarted.</p>
        <button className="btn gold" onClick={onExit}>Back to home</button>
      </div>
    )
  if (!s) return <div className="card" role="status">Connecting to your game...</div>

  async function act(action: HostAction) {
    if (action === 'end' && !window.confirm('End the game now? Players will see the final results.')) return
    setBusy(true)
    setError('')
    const r = await api.host(session.code, session.token, action)
    setBusy(false)
    if (!r.ok) setError(r.error)
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}#/join/${s.code}`
  const q = s.question
  const isLast = q ? q.index + 1 >= q.total : false

  return (
    <div className="stack live">
      <StatusBar status={status} hostConnected={true} role="host" />
      <div aria-live="polite">{error && <p className="notice error">{error}</p>}</div>

      {s.phase === 'lobby' && (
        <div className="card center stack">
          <h1>Join this game</h1>
          <p>Players open the site, choose “Join a game” and enter the code:</p>
          <div><span className="room-code" aria-label={`Room code ${s.code.split('').join(' ')}`}>{s.code}</span></div>
          <p className="small muted">Or open <b>{joinUrl}</b></p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn ghost" onClick={() => void navigator.clipboard?.writeText(joinUrl)}>Copy join link</button>
          </div>
          <h2>Players ({s.players.length})</h2>
          <div className="players" aria-live="polite">
            {s.players.length === 0 && <span className="muted">Waiting for players to join...</span>}
            {s.players.map((p) => <span key={p.name} className="player-chip"><span className={`dot ${p.connected ? 'on' : ''}`} aria-hidden="true" />{p.name}{p.connected ? '' : ' (offline)'}</span>)}
          </div>
          <p className="hint">{s.totalQuestions} questions, {s.settings.timerSeconds} seconds each. New players can only join before you start.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn gold big" disabled={busy || s.players.length < 1} onClick={() => void act('start')}>Start game</button>
          </div>
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
            <div className="stat"><b>{s.answeredCount ?? 0}/{s.players.length}</b><span className="small">answered</span></div>
          </div>
          <Timer leftMs={left} totalSeconds={s.settings.timerSeconds} />
          <h2 className="qtext">{q.text}</h2>
          {q.choices && <ChoiceList choices={q.choices} disabled correctIndex={null} />}
          <div className="host-key"><b>Host only:</b> correct answer is “{s.hostKey?.correctAnswer}”</div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn gold" disabled={busy} onClick={() => void act('reveal')}>Reveal answer now</button>
            <button className="btn ghost" disabled={busy} onClick={() => void act('end')}>End game</button>
          </div>
        </div>
      )}

      {s.phase === 'reveal' && q && s.reveal && (
        <>
          <div className="card">
            <strong>Question {q.index + 1} of {q.total}</strong>
            <h2 className="qtext">{q.text}</h2>
            {q.choices ? (
              <ChoiceList choices={q.choices} disabled correctIndex={q.choices.indexOf(s.reveal.correctAnswer)} counts={s.reveal.distribution} />
            ) : (
              <div className="feedback info"><strong>Correct answer: {s.reveal.correctAnswer}</strong></div>
            )}
            <div className="feedback info" role="status">
              <strong>{s.reveal.correctCount} of {s.reveal.answered} answering players were correct.</strong>
              {s.reveal.explanation}
            </div>
            <div className="row" style={{ marginTop: '1rem' }}>
              <button className="btn gold" disabled={busy} onClick={() => void act('next')}>{isLast ? 'Show final results' : 'Next question'}</button>
              <button className="btn ghost" disabled={busy} onClick={() => void act('end')}>End game</button>
            </div>
          </div>
          <div className="card"><h2>Standings</h2><Leaderboard rows={s.leaderboard} caption="Standings after this question" /></div>
        </>
      )}

      {s.phase === 'finished' && (
        <div className="card stack">
          <h1>Final results</h1>
          <Leaderboard rows={s.leaderboard} caption="Final standings" />
          <p className="hint">Tie rule: players are ranked by points, then by correct answers; equal on both share a rank. This room closes automatically about 30 minutes after the game ends.</p>
          <button className="btn gold" onClick={onExit}>Back to home</button>
        </div>
      )}
    </div>
  )
}
