import { useEffect, useState } from 'react'
import { PracticeSetup } from './modes/practice/PracticeSetup.tsx'
import type { PracticeRunSetup, PlayItem } from './modes/practice/PracticeSetup.tsx'
import { PracticePlay } from './modes/practice/PracticePlay.tsx'
import { PracticeResults } from './modes/practice/PracticeResults.tsx'
import { ReviewList } from './modes/practice/ReviewList.tsx'
import { HostSetup } from './modes/live/HostSetup.tsx'
import { HostRoom } from './modes/live/HostRoom.tsx'
import { PlayerJoin } from './modes/live/PlayerJoin.tsx'
import { PlayerRoom } from './modes/live/PlayerRoom.tsx'
import { clearSession, loadSession } from './services/session.ts'
import type { LiveSession } from './services/session.ts'
import type { PracticeAnswer } from './core/scoring.ts'
import { ROOM_CODE_PATTERN } from './core/liveTypes.ts'

type Screen =
  | { name: 'home' }
  | { name: 'practice-setup' }
  | { name: 'practice-play'; run: PracticeRunSetup }
  | { name: 'practice-results'; name_: string; answers: PracticeAnswer[] }
  | { name: 'practice-review'; name_: string; answers: PracticeAnswer[] }
  | { name: 'host-setup' }
  | { name: 'host-room'; session: LiveSession }
  | { name: 'player-join'; code: string }
  | { name: 'player-room'; session: LiveSession }

function codeFromHash(): string | null {
  const m = window.location.hash.match(/^#\/join\/([A-Za-z0-9]{6})$/)
  const code = m?.[1].toUpperCase()
  return code && ROOM_CODE_PATTERN.test(code) ? code : null
}

function Sun() {
  return (
    <svg className="sun" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="17" fill="#f4b400" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="46" y="6" width="8" height="20" rx="4" fill="#f4b400" transform={`rotate(${i * 45} 50 50)`} />
      ))}
    </svg>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const code = codeFromHash()
    return code ? { name: 'player-join', code } : { name: 'home' }
  })
  const [lastName, setLastName] = useState('')
  const [saved, setSaved] = useState<LiveSession | null>(() => loadSession())

  useEffect(() => {
    const onHash = () => {
      const code = codeFromHash()
      if (code) setScreen({ name: 'player-join', code })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const goHome = () => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search)
    setSaved(loadSession())
    setScreen({ name: 'home' })
  }
  const exitLive = () => {
    clearSession()
    setSaved(null)
    goHome()
  }

  let body: JSX.Element
  switch (screen.name) {
    case 'practice-setup':
      body = <PracticeSetup initialName={lastName} onStart={(run) => { setLastName(run.name); setScreen({ name: 'practice-play', run }) }} />
      break
    case 'practice-play':
      body = <PracticePlay items={screen.run.items as PlayItem[]} onFinish={(answers) => setScreen({ name: 'practice-results', name_: screen.run.name, answers })} />
      break
    case 'practice-results':
      body = <PracticeResults name={screen.name_} answers={screen.answers} onReview={() => setScreen({ name: 'practice-review', name_: screen.name_, answers: screen.answers })} onAgain={() => setScreen({ name: 'practice-setup' })} />
      break
    case 'practice-review':
      body = <ReviewList answers={screen.answers} onBack={() => setScreen({ name: 'practice-results', name_: screen.name_, answers: screen.answers })} />
      break
    case 'host-setup':
      body = <HostSetup onCreated={(session) => setScreen({ name: 'host-room', session })} />
      break
    case 'host-room':
      body = <HostRoom session={screen.session} onExit={exitLive} />
      break
    case 'player-join':
      body = <PlayerJoin initialCode={screen.code} onJoined={(session) => setScreen({ name: 'player-room', session })} />
      break
    case 'player-room':
      body = <PlayerRoom session={screen.session} onExit={exitLive} />
      break
    default:
      body = (
        <div className="stack">
          <div className="hero">
            <h1>Philippine Social Science Quiz Bee</h1>
            <p>History, Culture, Geography and Government. Practice on your own, or compete live with a host and players.</p>
          </div>

          {saved && (
            <div className="notice warn">
              <b>You have an active {saved.role === 'host' ? 'hosted' : ''} game ({saved.code}).</b>{' '}
              <button className="btn link" onClick={() => setScreen(saved.role === 'host' ? { name: 'host-room', session: saved } : { name: 'player-room', session: saved })}>Rejoin</button>
              <button className="btn link" onClick={exitLive}>Forget it</button>
            </div>
          )}

          <div className="grid-2">
            <section className="card stack" aria-labelledby="m-practice">
              <h2 id="m-practice">Practice Mode</h2>
              <p>Self-paced study. Pick categories, difficulty and length. Instant feedback and a full answer review.</p>
              <button className="btn gold big" onClick={() => setScreen({ name: 'practice-setup' })}>Start practicing</button>
            </section>
            <section className="card stack" aria-labelledby="m-live">
              <h2 id="m-live">Actual Game</h2>
              <p>A live, timed competition. One host controls the game; players join with a room code.</p>
              <div className="row">
                <button className="btn big" onClick={() => setScreen({ name: 'host-setup' })}>Host a game</button>
                <button className="btn ghost big" onClick={() => setScreen({ name: 'player-join', code: '' })}>Join a game</button>
              </div>
            </section>
          </div>
        </div>
      )
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <Sun />
        <button className="brand" onClick={goHome} aria-label="Quiz Bee home">Philippine Social Science Quiz Bee</button>
      </header>
      <main id="main" className="app-main">{body}</main>
    </>
  )
}
