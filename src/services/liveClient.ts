import type { AnswerPayload, HostAction, RoomSettings, RoomSnapshot } from '../core/liveTypes.ts'
import type { Question } from '../core/types.ts'

/** Empty in local dev (Vite proxies /api). Set VITE_API_URL to your deployed game server in production. */
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

async function request<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, status: res.status, error: typeof data.error === 'string' ? data.error : 'Request failed.' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, status: 0, error: 'Cannot reach the game server. Check your connection and that the server is running.' }
  }
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  createRoom: (questions: Question[], settings: RoomSettings) =>
    request<{ code: string; hostToken: string; totalQuestions: number }>('/api/rooms', { questions, settings }),
  roomInfo: (code: string) => request<{ exists: boolean; phase: string; playerCount: number }>(`/api/rooms/${code}`),
  join: (code: string, name: string, token?: string) =>
    request<{ playerId: string; token: string; name: string; resumed: boolean }>(`/api/rooms/${code}/join`, { name, token }),
  host: (code: string, token: string, action: HostAction) => request<{ ok: true }>(`/api/rooms/${code}/host`, { token, action }),
  answer: (code: string, token: string, questionIndex: number, answer: AnswerPayload) =>
    request<{ ok: true }>(`/api/rooms/${code}/answer`, { token, questionIndex, answer }),
}

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'gone'

/**
 * Opens a Server-Sent Events stream. The browser reconnects automatically after
 * a network drop; if the server refuses the connection (room closed, bad token)
 * the stream ends and onStatus('gone') is called.
 */
export function openRoomStream(
  code: string,
  role: 'host' | 'player',
  token: string,
  handlers: { onSnapshot: (s: RoomSnapshot) => void; onStatus: (s: StreamStatus) => void },
): () => void {
  const es = new EventSource(`${API}/api/rooms/${code}/events?role=${role}&token=${encodeURIComponent(token)}`)
  es.onopen = () => handlers.onStatus('live')
  es.onmessage = (ev) => {
    try {
      handlers.onSnapshot(JSON.parse(ev.data) as RoomSnapshot)
      handlers.onStatus('live')
    } catch {
      /* ignore malformed frame */
    }
  }
  es.onerror = () => handlers.onStatus(es.readyState === EventSource.CLOSED ? 'gone' : 'reconnecting')
  es.addEventListener('closed', () => {
    es.close()
    handlers.onStatus('gone')
  })
  return () => es.close()
}
