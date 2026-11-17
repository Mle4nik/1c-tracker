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
app.use(express.json())

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
app.listen(port, () => console.log(`Quest API: http://localhost:${port}`))
