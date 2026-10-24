import { createGameServer, DEFAULT_STATIC_DIR } from './app.ts'

const port = Number(process.env.PORT) || 8787
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const server = createGameServer({
  allowedOrigins,
  trustProxy: process.env.TRUST_PROXY === '1',
  staticDir: DEFAULT_STATIC_DIR,
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Quiz Bee game server listening on http://localhost:${port}`)
  console.log(allowedOrigins.length ? `Allowed origins: ${allowedOrigins.join(', ')}` : 'Allowed origins: any (set ALLOWED_ORIGINS for production)')
  console.log('Rooms are kept in memory and are lost if this process restarts.')
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { server.stop(); process.exit(0) })
