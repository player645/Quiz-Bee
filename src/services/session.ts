/** Remembers the active live game in this browser so a refresh can rejoin it. */
export interface LiveSession {
  role: 'host' | 'player'
  code: string
  token: string
  name?: string
}

const KEY = 'qb.live.session'

export function loadSession(): LiveSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as LiveSession
    if ((s.role === 'host' || s.role === 'player') && typeof s.code === 'string' && typeof s.token === 'string') return s
  } catch {
    /* storage unavailable or corrupted */
  }
  return null
}

export function saveSession(s: LiveSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: rejoin-after-refresh just won't work */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
