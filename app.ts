import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { randomInt } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRawQuestions } from '../src/core/questionnaire.ts'
import { LIVE_LIMITS, ROOM_CODE_ALPHABET, ROOM_CODE_PATTERN, normalizeSettings } from '../src/core/liveTypes.ts'
import type { HostAction } from '../src/core/liveTypes.ts'
import { GameRoom } from './room.ts'

export interface ServerOptions {
  allowedOrigins?: string[]
  trustProxy?: boolean
  now?: () => number
  /** Folder with the built frontend (served if it exists). */
  staticDir?: string
  limits?: { createPerWindow?: number; joinPerWindow?: number }
}

interface Client {
  res: ServerResponse
  viewer: { role: 'host' } | { role: 'player'; token: string }
}

const MAX_BODY = 2_000_000
const MAX_ROOMS = 200
const IDLE_TTL_MS = 4 * 60 * 60 * 1000
const FINISHED_TTL_MS = 30 * 60 * 1000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function createGameServer(options: ServerOptions = {}): Server & { stop: () => void; roomCount: () => number } {
  const now = options.now ?? Date.now
  const rooms = new Map<string, GameRoom>()
  const clients = new Map<string, Set<Client>>()
  const windows = new Map<string, { start: number; count: number }>()
  const createLimit = options.limits?.createPerWindow ?? 20
  const joinLimit = options.limits?.joinPerWindow ?? 120
  const staticDir = options.staticDir

  /* ------------------------------ helpers ------------------------------ */

  function corsHeaders(req: IncomingMessage): Record<string, string> {
    const origin = req.headers.origin
    const allowed = options.allowedOrigins
    const h: Record<string, string> = { Vary: 'Origin' }
    if (!allowed || allowed.length === 0) h['Access-Control-Allow-Origin'] = '*'
    else if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'Content-Type'
    return h
  }

  function json(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req) })
    res.end(JSON.stringify(body))
  }

  function clientIp(req: IncomingMessage): string {
    if (options.trustProxy) {
      const fwd = req.headers['x-forwarded-for']
      if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
    }
    return req.socket.remoteAddress ?? 'unknown'
  }

  function rateLimit(req: IncomingMessage, bucket: string, max: number, windowMs: number): void {
    const key = `${bucket}:${clientIp(req)}`
    const t = now()
    const w = windows.get(key)
    if (!w || t - w.start > windowMs) windows.set(key, { start: t, count: 1 })
    else if (++w.count > max) throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.')
  }

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY) throw new HttpError(413, 'TOO_LARGE', 'The request is too large.')
      chunks.push(chunk as Buffer)
    }
    if (size === 0) return {}
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape')
      return parsed as Record<string, unknown>
    } catch {
      throw new HttpError(400, 'BAD_JSON', 'The request body must be a JSON object.')
    }
  }

  function newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = ''
      for (let i = 0; i < LIVE_LIMITS.roomCodeLength; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
      if (!rooms.has(code)) return code
    }
    throw new HttpError(503, 'NO_CODE', 'Could not create a room code. Try again.')
  }

  function getRoom(raw: string): GameRoom {
    const code = raw.toUpperCase()
    const room = ROOM_CODE_PATTERN.test(code) ? rooms.get(code) : undefined
    if (!room) throw new HttpError(404, 'NO_ROOM', 'No game found with that code.')
    return room
  }

  /* ------------------------- real-time (SSE) push ------------------------- */

  function sendSnapshot(room: GameRoom, client: Client): void {
    try {
      client.res.write(`data: ${JSON.stringify(room.snapshot(client.viewer))}\n\n`)
    } catch {
      /* connection already closed; the 'close' handler cleans up */
    }
  }

  function broadcast(room: GameRoom): void {
    for (const c of clients.get(room.code) ?? []) sendSnapshot(room, c)
  }

  function openStream(req: IncomingMessage, res: ServerResponse, room: GameRoom, url: URL): void {
    const role = url.searchParams.get('role')
    const token = url.searchParams.get('token') ?? ''
    let viewer: Client['viewer']
    if (role === 'host' && room.isHost(token)) viewer = { role: 'host' }
    else if (role === 'player' && room.playerByToken(token)) viewer = { role: 'player', token }
    else throw new HttpError(403, 'FORBIDDEN', 'Invalid access token for this game.')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(req),
    })
    res.write('retry: 2000\n\n')
    const client: Client = { res, viewer }
    let set = clients.get(room.code)
    if (!set) clients.set(room.code, (set = new Set()))
    set.add(client)
    room.setConnection(viewer, 1)
    sendSnapshot(room, client)
    req.on('close', () => {
      set.delete(client)
      if (rooms.get(room.code) === room) room.setConnection(viewer, -1)
    })
  }

  function dropRoom(code: string): void {
    for (const c of clients.get(code) ?? []) {
      try {
        c.res.write('event: closed\ndata: {}\n\n')
        c.res.end()
      } catch {
        /* ignore */
      }
    }
    clients.delete(code)
    rooms.delete(code)
  }

  /* ------------------------------- routes ------------------------------- */

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    const method = req.method ?? 'GET'

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req))
      res.end()
      return
    }

    if (parts[0] !== 'api') return serveStatic(req, res, url)

    if (method === 'GET' && parts[1] === 'health' && parts.length === 2) return json(req, res, 200, { ok: true, rooms: rooms.size })

    if (parts[1] === 'rooms' && parts.length === 2 && method === 'POST') {
      rateLimit(req, 'create', createLimit, 10 * 60 * 1000)
      if (rooms.size >= MAX_ROOMS) throw new HttpError(503, 'BUSY', 'The server is at capacity. Try again later.')
      const body = await readBody(req)
      const validated = validateRawQuestions(body.questions)
      if (validated.errors.length) {
        const first = validated.errors.slice(0, 5).map((e) => `${e.where}${e.field ? ` (${e.field})` : ''}: ${e.message}`)
        throw new HttpError(400, 'BAD_QUESTIONS', `The questionnaire was rejected. ${first.join(' ')}`)
      }
      const s = normalizeSettings(body.settings)
      if (!s.ok) throw new HttpError(400, 'BAD_SETTINGS', s.error)
      const room = new GameRoom({ code: newCode(), questions: validated.questions, settings: s.settings, now })
      room.onChange = () => broadcast(room)
      rooms.set(room.code, room)
      return json(req, res, 201, { code: room.code, hostToken: room.hostToken, totalQuestions: room.totalQuestions })
    }

    if (parts[1] === 'rooms' && parts.length >= 3) {
      const room = getRoom(parts[2])
      room.tick()
      const sub = parts[3]

      if (!sub && method === 'GET') return json(req, res, 200, { exists: true, phase: room.phase, playerCount: room.playerCount })
      if (sub === 'events' && method === 'GET') return openStream(req, res, room, url)

      if (method === 'POST' && sub === 'join') {
        rateLimit(req, 'join', joinLimit, 60 * 1000)
        const body = await readBody(req)
        const r = room.join(body.name, body.token)
        if (!r.ok) throw new HttpError(r.status, r.code, r.error)
        return json(req, res, 200, { playerId: r.playerId, token: r.token, name: r.name, resumed: r.resumed })
      }
      if (method === 'POST' && sub === 'host') {
        const body = await readBody(req)
        const r = room.hostAction(body.token, body.action as HostAction)
        if (!r.ok) throw new HttpError(r.status, r.code, r.error)
        return json(req, res, 200, { ok: true })
      }
      if (method === 'POST' && sub === 'answer') {
        const body = await readBody(req)
        const r = room.submit(body.token, body.questionIndex, body.answer)
        if (!r.ok) throw new HttpError(r.status, r.code, r.error)
        return json(req, res, 200, { ok: true })
      }
    }
    throw new HttpError(404, 'NOT_FOUND', 'Not found.')
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): void {
    if (!staticDir || !existsSync(join(staticDir, 'index.html'))) throw new HttpError(404, 'NOT_FOUND', 'Not found. (Build the frontend with "npm run build" to serve it here.)')
    const root = normalize(staticDir).replace(/[\\/]+$/, '')
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    let file = normalize(join(root, rel))
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(403, 'FORBIDDEN', 'Forbidden.')
    if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html')
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', ...corsHeaders(req) })
    res.end(readFileSync(file))
  }

  /* ------------------------------ lifecycle ------------------------------ */

  const server = createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      if (res.headersSent) {
        res.end()
        return
      }
      if (err instanceof HttpError) json(req, res, err.status, { error: err.message, code: err.code })
      else {
        console.error(err)
        json(req, res, 500, { error: 'Something went wrong on the server.', code: 'INTERNAL' })
      }
    })
  }) as Server & { stop: () => void; roomCount: () => number }

  const ticker = setInterval(() => {
    for (const room of rooms.values()) room.tick()
  }, 250)
  const heartbeat = setInterval(() => {
    for (const set of clients.values()) for (const c of set) c.res.write(': ping\n\n')
  }, 15_000)
  const sweeper = setInterval(() => {
    const t = now()
    for (const [code, room] of rooms) {
      const expired = room.finishedAt ? t - room.finishedAt > FINISHED_TTL_MS : t - room.lastActivity > IDLE_TTL_MS
      if (expired) dropRoom(code)
    }
    for (const [k, w] of windows) if (t - w.start > 10 * 60 * 1000) windows.delete(k)
  }, 30_000)
  for (const t of [ticker, heartbeat, sweeper]) t.unref()

  server.stop = () => {
    clearInterval(ticker)
    clearInterval(heartbeat)
    clearInterval(sweeper)
    for (const code of [...rooms.keys()]) dropRoom(code)
    server.closeAllConnections()
    server.close()
  }
  server.roomCount = () => rooms.size
  return server
}

export const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
