import { useState } from 'react'
import { LIVE_LIMITS, ROOM_CODE_PATTERN } from '../../core/liveTypes.ts'
import { api } from '../../services/liveClient.ts'
import { saveSession } from '../../services/session.ts'
import type { LiveSession } from '../../services/session.ts'

export function PlayerJoin({ initialCode, onJoined }: { initialCode: string; onJoined: (s: LiveSession) => void }) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const codeOk = ROOM_CODE_PATTERN.test(code)
  const nameOk = name.trim().length >= 1 && name.trim().length <= LIVE_LIMITS.nameMax

  async function join() {
    if (!codeOk || !nameOk || busy) return
    setBusy(true)
    setError('')
    const r = await api.join(code, name.trim())
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const session: LiveSession = { role: 'player', code, token: r.data.token, name: r.data.name }
    saveSession(session)
    onJoined(session)
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void join() }}>
      <div className="hero"><h1>Join a game</h1><p>Enter the room code shown on the host's screen and pick a display name.</p></div>
      <div className="card">
        <div className="field">
          <label htmlFor="j-code">Room code</label>
          <input id="j-code" className="input" value={code} maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            style={{ fontSize: '1.6rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-describedby="j-code-hint" />
          <span id="j-code-hint" className="hint">6 characters, letters and numbers.</span>
        </div>
        <div className="field">
          <label htmlFor="j-name">Display name</label>
          <input id="j-name" className="input" value={name} maxLength={LIVE_LIMITS.nameMax} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
          <span className="hint">Up to {LIVE_LIMITS.nameMax} characters. Each player in a game needs a different name.</span>
        </div>
        <div aria-live="polite">{error && <p className="notice error">{error}</p>}</div>
        <button type="submit" className="btn gold big" disabled={!codeOk || !nameOk || busy}>{busy ? 'Joining...' : 'Join game'}</button>
      </div>
    </form>
  )
}
