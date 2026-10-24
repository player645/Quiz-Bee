import { useCallback, useEffect, useRef, useState } from 'react'
import { openRoomStream } from './liveClient.ts'
import type { StreamStatus } from './liveClient.ts'
import type { RoomSnapshot } from '../core/liveTypes.ts'

/** Subscribes to a room and keeps a clock offset so countdowns follow the SERVER clock. */
export function useRoom(code: string, role: 'host' | 'player', token: string) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const offset = useRef(0)

  useEffect(() => {
    setStatus('connecting')
    const close = openRoomStream(code, role, token, {
      onSnapshot: (s) => {
        offset.current = s.serverNow - Date.now()
        setSnapshot(s)
      },
      onStatus: setStatus,
    })
    return close
  }, [code, role, token])

  const serverNow = useCallback(() => Date.now() + offset.current, [])
  return { snapshot, status, serverNow }
}

/** Milliseconds remaining until `deadline` (server time), updated ~5 times a second. */
export function useCountdown(deadline: number | undefined, serverNow: () => number): number {
  const [left, setLeft] = useState(() => (deadline ? Math.max(0, deadline - serverNow()) : 0))
  useEffect(() => {
    if (!deadline) {
      setLeft(0)
      return
    }
    const tick = () => setLeft(Math.max(0, deadline - serverNow()))
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [deadline, serverNow])
  return left
}
