// Работа со Stepik API. Секрет и токен живут только на сервере.
const API = 'https://stepik.org/api'
let cached = { value: null, exp: 0 }

async function getToken() {
  const { STEPIK_CLIENT_ID: id, STEPIK_CLIENT_SECRET: secret } = process.env
  if (!id || !secret) throw new Error('В .env нет STEPIK_CLIENT_ID / STEPIK_CLIENT_SECRET')
  if (cached.value && Date.now() < cached.exp) return cached.value
  const res = await fetch('https://stepik.org/oauth2/token/', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Stepik: токен не получен (${res.status})`)
  const j = await res.json()
  cached = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
  return cached.value
}

// Объекты по id пачками: длинные списки сервер отклоняет
async function load(resource, ids, token) {
  const out = []
  const clean = [...new Set(ids.filter(x => x != null))]
  for (let i = 0; i < clean.length; i += 20) {
    const qs = clean.slice(i, i + 20).map(x => `ids[]=${encodeURIComponent(x)}`).join('&')
    const res = await fetch(`${API}/${resource}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Stepik: ${resource} — ${res.status}`)
    out.push(...(await res.json())[resource])
  }
  return out
}

export async function fetchSnapshot(courseIds) {
  const token = await getToken()
  const loaded = await load('courses', courseIds, token)
  const courses = courseIds.map(id => loaded.find(c => c.id === id)).filter(Boolean)
  const sections = await load('sections', courses.flatMap(c => c.sections), token)
  const progresses = await load('progresses', sections.map(s => s.progress), token)
  const prog = Object.fromEntries(progresses.map(p => [p.id, p]))
  const courseOf = {}
  courses.forEach(c => c.sections.forEach(id => { courseOf[id] = c.id }))
  return {
    syncedAt: new Date().toISOString(),
    courses: courses.map(c => ({ id: c.id, title: c.title, sections: c.sections })),
    sections: sections.map(s => ({
      id: s.id, courseId: courseOf[s.id], title: s.title,
      n: prog[s.progress]?.n_steps ?? 0, passed: prog[s.progress]?.n_steps_passed ?? 0,
    })),
  }
}
