import type { StreamStatus } from '../services/liveClient.ts'

export function StatusBar({ status, hostConnected, role }: { status: StreamStatus; hostConnected: boolean; role: 'host' | 'player' }) {
  if (status === 'reconnecting' || status === 'connecting')
    return <div className="status-bar bad" role="status">Reconnecting to the game... your progress is saved on the server.</div>
  if (role === 'player' && !hostConnected)
    return <div className="status-bar bad" role="status">The host is disconnected. The game will continue when they return.</div>
  return <div className="status-bar" role="status"><span className="dot on" aria-hidden="true" /> Connected</div>
}

export function Timer({ leftMs, totalSeconds }: { leftMs: number; totalSeconds: number }) {
  const secs = Math.ceil(leftMs / 1000)
  const pct = Math.max(0, Math.min(100, (leftMs / (totalSeconds * 1000)) * 100))
  return (
    <div className="timer" role="timer" aria-label="Time left">
      <span className={`secs ${secs <= 5 ? 'low' : ''}`}>{secs}</span>
      <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
