import express from 'express'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { fetchSnapshot } from './stepik.js'
import { buildState } from './game.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAP = path.join(root, 'data', 'snapshot.json')
const MANUAL = path.join(root, 'data', 'manual.json')
const cfg = JSON.parse(await readFile(path.join(root, 'quest.config.json'), 'utf8'))

const read = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return fallback }
}
const write = async (file, data) => {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(data))
}
const state = async () => {
  const snap = await read(SNAP, null)
  return snap ? buildState(snap, cfg, await read(MANUAL, {})) : null
}

const app = express()

// Разрешаем запросы с production-фронтенда Vercel и локального Vite.
// FRONTEND_URL на Railway: точный production-домен Vercel.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

app.use((req, res, next) => {
  const origin = req.headers.origin
  const isLocalDev = origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173'

  if (origin && (allowedOrigins.includes(origin) || isLocalDev)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true, service: '1c-developer-quest-api' }))
app.get('/api/state', async (_req, res) => res.json({ state: await state() }))

let syncing = null
app.post('/api/sync', async (_req, res) => {
  try {
    syncing ??= fetchSnapshot(cfg.courses).finally(() => { syncing = null })
    await write(SNAP, await syncing)
    res.json({ state: await state() })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.post('/api/manual', async (req, res) => {
  const { key, done } = req.body || {}
  if (typeof key !== 'string' || typeof done !== 'boolean') return res.status(400).json({ error: 'Некорректный запрос' })
  await write(MANUAL, { ...(await read(MANUAL, {})), [key]: done })
  res.json({ state: await state() })
})

const dist = path.join(root, 'dist')
if (existsSync(dist)) app.use(express.static(dist))

const port = process.env.PORT || 3001
app.listen(port, '0.0.0.0', () => console.log(`Quest API listening on port ${port}`))
