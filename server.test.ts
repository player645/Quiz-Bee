import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createGameServer } from '../server/app.ts'
import type { RoomSnapshot } from '../src/core/liveTypes.ts'
import type { Question } from '../src/core/types.ts'

const QUESTIONS: Question[] = [
  { id: 'q1', type: 'mc', category: 'A', difficulty: 'easy', text: 'Pick two', choices: ['one', 'two', 'three'], correct: 'two', explanation: 'x', points: 1 },
  { id: 'q2', type: 'id', category: 'A', difficulty: 'easy', text: 'Name it', correct: 'Rizal', accepted: ['rizal'], explanation: 'y', points: 2 },
]

const server = createGameServer({ allowedOrigins: ['https://example.github.io'], limits: { createPerWindow: 1000 } })
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
after(() => server.stop())

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

/** Minimal SSE client built on fetch streaming. */
function sse(path: string) {
  const ac = new AbortController()
  const snaps: RoomSnapshot[] = []
  const waiters: (() => void)[] = []
  let status = 0
  const ready = (async () => {
    const res = await fetch(base + path, { signal: ac.signal })
    status = res.status
    if (status !== 200) return
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    ;(async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let i
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const line = chunk.split('\n').find((l) => l.startsWith('data: '))
            if (line && line.length > 8) {
              snaps.push(JSON.parse(line.slice(6)))
              waiters.splice(0).forEach((w) => w())
            }
          }
        }
      } catch {
        /* aborted */
      }
    })()
  })()
  return {
    ready,
    get status() { return status },
    get last() { return snaps[snaps.length - 1] },
    async until(pred: (s: RoomSnapshot) => boolean, ms = 8000) {
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (snaps.length && pred(snaps[snaps.length - 1])) return snaps[snaps.length - 1]
        await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 100) })
      }
      throw new Error('timed out waiting for snapshot; last = ' + JSON.stringify(snaps[snaps.length - 1]?.phase))
    },
    close: () => ac.abort(),
  }
}

test('full game across separate connections: host + 2 players, real-time snapshots, scoring, final board', async () => {
  const created = await post('/api/rooms', { questions: QUESTIONS, settings: { timerSeconds: 30, shuffleChoices: false } })
  assert.equal(created.status, 201)
  const { code, hostToken } = created.body as { code: string; hostToken: string }
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/)

  assert.equal((await post(`/api/rooms/${code}/join`, { name: '' })).status, 400)
  const ana = (await post(`/api/rooms/${code}/join`, { name: 'Ana' })).body as { token: string }
  const ben = (await post(`/api/rooms/${code}/join`, { name: 'Ben' })).body as { token: string }
  assert.equal((await post(`/api/rooms/${code.toLowerCase()}/join`, { name: 'ANA' })).status, 409) // duplicate name, code is case-insensitive

  const host = sse(`/api/rooms/${code}/events?role=host&token=${hostToken}`)
  const pAna = sse(`/api/rooms/${code}/events?role=player&token=${ana.token}`)
  const pBen = sse(`/api/rooms/${code}/events?role=player&token=${ben.token}`)
  await Promise.all([host.ready, pAna.ready, pBen.ready])
  await host.until((s) => s.players.length === 2 && s.players.every((p) => p.connected))
  assert.equal((await pAna.until((s) => s.hostConnected)).phase, 'lobby')

  // Players cannot run host actions; a wrong token is rejected.
  assert.equal((await post(`/api/rooms/${code}/host`, { token: ana.token, action: 'start' })).status, 403)
  assert.equal((await post(`/api/rooms/${code}/host`, { token: hostToken, action: 'start' })).status, 200)

  const q = await pAna.until((s) => s.phase === 'question')
  await pBen.until((s) => s.phase === 'question')
  assert.equal(q.question!.text, 'Pick two')
  assert.deepEqual(q.question!.choices, ['one', 'two', 'three'])
  assert.ok(q.deadline! > q.serverNow)
  assert.ok(!JSON.stringify(q).includes('"correctAnswer"'), 'players must not receive the answer key')

  assert.equal((await post(`/api/rooms/${code}/answer`, { token: ana.token, questionIndex: 0, answer: { choice: 1 } })).status, 200)
  assert.equal((await post(`/api/rooms/${code}/answer`, { token: ana.token, questionIndex: 0, answer: { choice: 0 } })).status, 409)
  const hostView = await host.until((s) => s.answeredCount === 1)
  assert.equal(hostView.hostKey!.correctAnswer, 'two')

  await post(`/api/rooms/${code}/answer`, { token: ben.token, questionIndex: 0, answer: { choice: 2 } })
  const rev = await pAna.until((s) => s.phase === 'reveal') // auto-reveal: everyone answered
  assert.equal(rev.reveal!.correctAnswer, 'two')
  assert.equal(rev.self!.lastResult!.correct, true)
  assert.equal((await pBen.until((s) => s.phase === 'reveal')).self!.lastResult!.correct, false)

  await post(`/api/rooms/${code}/host`, { token: hostToken, action: 'next' })
  await pAna.until((s) => s.phase === 'question' && s.question!.index === 1)
  await post(`/api/rooms/${code}/answer`, { token: ana.token, questionIndex: 1, answer: { text: 'RIZAL' } })
  await post(`/api/rooms/${code}/answer`, { token: ben.token, questionIndex: 1, answer: { text: 'wrong' } })
  await pAna.until((s) => s.phase === 'reveal' && s.question!.index === 1)
  await post(`/api/rooms/${code}/host`, { token: hostToken, action: 'next' })

  const fin = await host.until((s) => s.phase === 'finished')
  assert.deepEqual(fin.leaderboard.map((r) => [r.rank, r.name, r.score, r.correct, r.incorrect, r.unanswered]), [
    [1, 'Ana', 3, 2, 0, 0],
    [2, 'Ben', 0, 0, 2, 0],
  ])
  const pubFinal = await pBen.until((s) => s.phase === 'finished')
  assert.equal(pubFinal.leaderboard.find((r) => r.you)!.name, 'Ben')

  // Reconnect: same token, new stream, state is restored.
  pBen.close()
  const again = sse(`/api/rooms/${code}/events?role=player&token=${ben.token}`)
  await again.ready
  assert.equal((await again.until((s) => s.phase === 'finished')).self!.name, 'Ben')
  for (const c of [host, pAna, again]) c.close()
})

test('timer expiry closes the question on the server', async () => {
  const { body } = await post('/api/rooms', { questions: QUESTIONS, settings: { timerSeconds: 5, autoReveal: false } })
  const { code, hostToken } = body as { code: string; hostToken: string }
  const ana = (await post(`/api/rooms/${code}/join`, { name: 'Ana' })).body as { token: string }
  const stream = sse(`/api/rooms/${code}/events?role=player&token=${ana.token}`)
  await stream.ready
  await post(`/api/rooms/${code}/host`, { token: hostToken, action: 'start' })
  await stream.until((s) => s.phase === 'question')
  const started = Date.now()
  await stream.until((s) => s.phase === 'reveal', 9000)
  assert.ok(Date.now() - started >= 4500, 'closed no earlier than the configured timer')
  const late = await post(`/api/rooms/${code}/answer`, { token: ana.token, questionIndex: 0, answer: { choice: 1 } })
  assert.equal(late.status, 409)
  stream.close()
})

test('access control: bad codes, bad tokens, hostile payloads', async () => {
  assert.equal((await post('/api/rooms/ZZZZZZ/join', { name: 'x' })).status, 404)
  assert.equal((await post('/api/rooms/abc/join', { name: 'x' })).status, 404)
  const { body } = await post('/api/rooms', { questions: QUESTIONS, settings: {} })
  const { code, hostToken } = body as { code: string; hostToken: string }
  const bad = sse(`/api/rooms/${code}/events?role=host&token=not-the-token`)
  await bad.ready
  assert.equal(bad.status, 403)
  const asPlayer = sse(`/api/rooms/${code}/events?role=host&token=${'0'.repeat(48)}`)
  await asPlayer.ready
  assert.equal(asPlayer.status, 403)

  assert.equal((await post('/api/rooms', { questions: [], settings: {} })).status, 400)
  assert.equal((await post('/api/rooms', { questions: [{ type: 'mc' }], settings: {} })).status, 400)
  assert.equal((await post('/api/rooms', { questions: QUESTIONS, settings: { timerSeconds: 1 } })).status, 400)
  const res = await fetch(`${base}/api/rooms`, { method: 'POST', body: '{not json' })
  assert.equal(res.status, 400)
  assert.equal((await post(`/api/rooms/${code}/host`, { token: hostToken, action: 'explode' })).status, 400) // unknown action

  const info = await (await fetch(`${base}/api/rooms/${code}`)).json()
  assert.deepEqual(info, { exists: true, phase: 'lobby', playerCount: 0 })
})

test('CORS: only the configured origin is echoed; preflight works', async () => {
  const ok = await fetch(`${base}/api/health`, { headers: { Origin: 'https://example.github.io' } })
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://example.github.io')
  const other = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } })
  assert.equal(other.headers.get('access-control-allow-origin'), null)
  const pre = await fetch(`${base}/api/rooms`, { method: 'OPTIONS', headers: { Origin: 'https://example.github.io' } })
  assert.equal(pre.status, 204)
})

test('rate limit on room creation', async () => {
  const limited = createGameServer({ limits: { createPerWindow: 2 } })
  await new Promise<void>((r) => limited.listen(0, '127.0.0.1', r))
  const b = `http://127.0.0.1:${(limited.address() as AddressInfo).port}`
  const make = () => fetch(`${b}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: QUESTIONS }) })
  assert.equal((await make()).status, 201)
  assert.equal((await make()).status, 201)
  assert.equal((await make()).status, 429)
  limited.stop()
})

test('static hosting: serves the built frontend, SPA fallback, blocks path traversal', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'qb-dist-'))
  writeFileSync(join(dir, 'index.html'), '<h1>app</h1>')
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)')
  const s = createGameServer({ staticDir: dir + '/' }) // trailing slash must work
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`
  assert.equal(await (await fetch(`${b}/`)).text(), '<h1>app</h1>')
  const js = await fetch(`${b}/assets/a.js`)
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(await (await fetch(`${b}/some/client/route`)).text(), '<h1>app</h1>')
  const trav = await fetch(`${b}/..%2f..%2fetc%2fpasswd`)
  assert.notEqual(await trav.text(), '')
  assert.ok(!(await (await fetch(`${b}/..%2f..%2fetc%2fpasswd`)).text()).includes('root:'))
  assert.equal((await fetch(`${b}/api/nope`)).status, 404)
  s.stop()
})
