import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, Map as MapIcon, BookOpen, Sun, Moon, Check, ChevronDown, ArrowUpRight,
  RefreshCw, Lock, Rocket, Code2, Settings, Database, FileText, Wrench, Plug, Target, Sparkles
} from 'lucide-react'

const STAGE_ICONS = { 1: Rocket, 2: Code2, 3: Settings, 4: Database, 5: FileText, 6: Wrench, 7: Plug, 8: Target }
const NAV = [
  { id: 'dashboard', label: 'Главная', icon: LayoutDashboard },
  { id: 'roadmap', label: 'Карта', icon: MapIcon },
  { id: 'learning', label: 'Обучение', icon: BookOpen },
]
const TITLES = { dashboard: 'Главная', roadmap: 'Карта', learning: 'Обучение' }
const STALE_MS = 15 * 60 * 1000

const stepik = courseId => `https://stepik.org/course/${courseId}`
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const ago = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} д назад`
}

// В production адрес API берём из Vercel Environment Variables.
// Локально VITE_API_URL пустой, поэтому работает proxy из vite.config.js.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

async function api(url, opts) {
  const res = await fetch(`${API_BASE}${url}`, opts)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Ошибка ${res.status}`)
  return json
}

/* ---------- Данные с сервера ---------- */

function useQuest() {
  const [state, setState] = useState(null)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const sync = useCallback(async () => {
    setSyncing(true); setError('')
    try { setState((await api('/api/sync', { method: 'POST' })).state) }
    catch (e) { setError(e.message) }
    finally { setSyncing(false) }
  }, [])

  useEffect(() => {
    (async () => {
      let s = null
      try { s = (await api('/api/state')).state; setState(s) } catch (e) { setError('Сервер недоступен. Запусти npm run dev') }
      setReady(true)
      if (!s || Date.now() - new Date(s.syncedAt) > STALE_MS) sync()
    })()
  }, [sync])

  const setProject = async done => {
    try {
      const body = JSON.stringify({ key: 'project', done })
      setState((await api('/api/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).state)
    } catch (e) { setError(e.message) }
  }
  return { state, ready, syncing, error, sync, setProject }
}

/* ---------- App ---------- */

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [dark, setDark] = useState(() => localStorage.getItem('dq-theme') !== 'light')
  const [toast, setToast] = useState('')
  const q = useQuest()
  const { state } = q

  useEffect(() => { try { localStorage.setItem('dq-theme', dark ? 'dark' : 'light') } catch {} }, [dark])

  // Поздравление: новый уровень или пройденный этап
  useEffect(() => {
    if (!state) return
    let seen = null
    try { seen = JSON.parse(localStorage.getItem('dq-seen')) } catch {}
    const done = state.stages.filter(s => s.done).map(s => s.id)
    if (seen) {
      const fresh = state.stages.find(s => s.done && !seen.done.includes(s.id))
      if (fresh) setToast(`Этап «${fresh.title}» пройден`)
      else if (state.level > seen.level) setToast(`Уровень ${state.level}`)
    }
    try { localStorage.setItem('dq-seen', JSON.stringify({ level: state.level, done })) } catch {}
  }, [state])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className={`app ${dark ? 'dark' : 'light'}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Code2 size={18} /></span><strong>1С Quest</strong></div>
        <nav>
          {NAV.map(n => {
            const Icon = n.icon
            return (
              <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
                <Icon size={19} /><span>{n.label}</span>
              </button>
            )
          })}
        </nav>
        <button className="nav-item theme" onClick={() => setDark(!dark)} aria-label="Сменить тему">
          {dark ? <Sun size={19} /> : <Moon size={19} />}<span>{dark ? 'Светлая' : 'Тёмная'}</span>
        </button>
      </aside>

      <main className="main" key={page}>
        {state && (
          <header className="topbar"><h1>{TITLES[page]}</h1><SyncButton q={q} /></header>
        )}
        {!state ? <Empty q={q} /> : (
          <>
            {q.error && <div className="content err-wrap"><div className="card error">{q.error}</div></div>}
            {page === 'dashboard' && <Dashboard q={q} go={setPage} />}
            {page === 'roadmap' && <Roadmap q={q} />}
            {page === 'learning' && <Learning state={state} />}
          </>
        )}
      </main>
      {toast && <div className="toast"><Sparkles size={16} /> {toast}</div>}
    </div>
  )
}

const Bar = ({ value }) => <div className="bar"><i style={{ width: `${Math.min(100, value)}%` }} /></div>

function Empty({ q }) {
  return (
    <div className="content">
      <section className="card center">
        {!q.ready ? <span className="muted">Загрузка…</span> : (
          <>
            <h2>Нет данных</h2>
            {q.error && <p className="muted">{q.error}</p>}
            <button className="btn primary" onClick={q.sync} disabled={q.syncing}>
              <RefreshCw size={16} className={q.syncing ? 'spin' : ''} /> Синхронизировать со Stepik
            </button>
          </>
        )}
      </section>
    </div>
  )
}

function SyncButton({ q }) {
  return (
    <button className="btn small-btn" onClick={q.sync} disabled={q.syncing} aria-label="Обновить из Stepik">
      <RefreshCw size={14} className={q.syncing ? 'spin' : ''} /> {q.syncing ? 'Обновляю' : ago(q.state.syncedAt)}
    </button>
  )
}

/* ---------- Главная ---------- */

function Dashboard({ q, go }) {
  const s = q.state
  const span = s.levelTo - s.levelFrom
  const n = s.next
  return (
    <div className="content dash">
      <section className="card level-card">
        <div className="row between">
          <span className="pill">Уровень {s.level}</span>
          <span className="muted">{s.xp} XP</span>
        </div>
        <div className="big">{s.xp - s.levelFrom}<small> / {span}</small></div>
        <Bar value={pct(s.xp - s.levelFrom, span)} />
        <div className="small muted">До уровня {s.level + 1}</div>
      </section>

      <section className="card next">
        {s.ready ? (
          <><h2>Готов к собеседованию</h2><p className="muted">Все этапы пройдены.</p></>
        ) : n ? (
          <>
            <div className="small muted">Этап {n.stageId} · {n.stageTitle}</div>
            <h2>{n.section.title}</h2>
            <div className="small muted">{n.section.course}</div>
            <Bar value={pct(n.section.passed, n.section.total)} />
            <div className="row between">
              <span className="small muted">{n.section.passed} / {n.section.total} шагов</span>
              <a className="btn primary" href={stepik(n.section.courseId)} target="_blank" rel="noreferrer">
                Продолжить на Stepik <ArrowUpRight size={16} />
              </a>
            </div>
          </>
        ) : (
          <>
            <h2>Разделы этапа пройдены</h2>
            <button className="btn primary" onClick={() => go('roadmap')}>Открыть карту</button>
          </>
        )}
      </section>

      <div className="card stat"><div className="big">{s.steps.passed}<small> / {s.steps.total}</small></div><div className="small muted">Шагов пройдено</div></div>
      <div className="card stat"><div className="big">{s.stagesDone}<small> / {s.stages.length}</small></div><div className="small muted">Этапов пройдено</div></div>

      <section className="card goal" onClick={() => go('roadmap')} role="button" tabIndex={0}>
        <div className="row between"><strong>Путь к собеседованию</strong><span className="muted">{s.percent}%</span></div>
        <Bar value={s.percent} />
      </section>
    </div>
  )
}

/* ---------- Карта мира ---------- */

const W = 1000, H = 460
// Положение этапов на карте, % от размера холста
const POINTS = [[7, 70], [19, 33], [32, 68], [45, 30], [58, 68], [71, 32], [84, 66], [93, 28]]

// Плавная кривая через точки (Catmull-Rom → кубические Безье)
function curve(pts) {
  const p = pts.map(([x, y]) => [(x * W) / 100, (y * H) / 100])
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}
const PATH = curve(POINTS)

// Узлы-уровни этапа: разделы курсов (+ ручной мини-проект). Последний узел — «босс».
const levelsOf = st => [
  ...st.sections.map(sec => ({ key: sec.id, title: sec.title, r: sec.total ? sec.passed / sec.total : 0, label: `${sec.passed}/${sec.total}` })),
  ...(st.extra ? [{ key: st.extra.key, title: st.extra.title, r: st.extra.done ? 1 : 0, label: st.extra.done ? 'готово' : 'не сделано' }] : []),
]

function Roadmap({ q }) {
  const s = q.state
  const [sel, setSel] = useState(null)
  const stage = s.stages.find(x => x.id === (sel ?? s.currentId)) || s.stages[0]
  const curIdx = s.stages.findIndex(x => x.id === s.currentId)
  const cur = s.stages[curIdx]
  const last = s.stages.length - 1
  const reach = s.ready ? 1 : Math.min(1, (curIdx + (cur.total ? cur.passed / cur.total : 0)) / last)
  const pos = i => POINTS[i] || POINTS[POINTS.length - 1]
  const [hx, hy] = pos(curIdx)

  return (
    <div className="content roadmap">
      <section className="card map-wrap">
        <div className="map">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={PATH} pathLength="100" className="trail" vectorEffect="non-scaling-stroke" />
            <path d={PATH} pathLength="100" className="trail-done" vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: `${reach * 100} 100` }} />
          </svg>

          {s.stages.map((st, i) => {
            const Icon = STAGE_ICONS[st.id] || Target
            const [x, y] = pos(i)
            const locked = !st.revealed
            return (
              <button key={st.id} disabled={locked} style={{ left: `${x}%`, top: `${y}%` }}
                className={`pin ${st.status} ${stage.id === st.id ? 'selected' : ''}`} onClick={() => setSel(st.id)}>
                <span className="pin-icon">{locked ? <Lock size={20} /> : st.done ? <Check size={24} /> : <Icon size={24} />}</span>
                <span className="pin-title">{st.title}</span>
                {!locked && (
                  <span className="levels">
                    {levelsOf(st).map((lv, k, arr) => (
                      <i key={lv.key} title={`${lv.title} · ${lv.label}`} style={{ '--p': `${lv.r * 100}%` }}
                        className={`lv ${lv.r >= 1 ? 'done' : lv.r > 0 ? 'part' : ''} ${k === arr.length - 1 ? 'boss' : ''}`} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}

          <div className="hero" style={{ left: `${hx}%`, top: `${hy}%` }}><span>Ур. {s.level}</span></div>
        </div>
      </section>

      <section className="card detail">
        <div className="row between">
          <h2>{stage.id}. {stage.title}</h2>
          <span className="muted small">{stage.passed}/{stage.total}</span>
        </div>
        <Bar value={pct(stage.passed, stage.total)} />
        <div className="sections">
          {stage.sections.map(sec => <SectionRow key={sec.id} sec={sec} />)}
          {stage.extra && (
            <button className={`section-row manual ${stage.extra.done ? 'done' : ''}`} onClick={() => q.setProject(!stage.extra.done)}>
              <span className="dot">{stage.extra.done && <Check size={13} />}</span>
              <span className="section-title">{stage.extra.title}</span>
              <span className="tag">+30 XP</span>
            </button>
          )}
        </div>
      </section>

      <aside className="side">
        {s.bonus.map(b => (
          <div key={b.id} className="card bonus">
            <div className="row between"><span className="small muted">Бонус</span><span className="small muted">{b.passed}/{b.total}</span></div>
            <strong>{b.title}</strong>
            <Bar value={pct(b.passed, b.total)} />
          </div>
        ))}
        <div className="card legend small muted">
          <span><i className="lv" /> не начат</span>
          <span><i className="lv part" style={{ '--p': '50%' }} /> в процессе</span>
          <span><i className="lv done" /> пройден</span>
          <span><i className="lv boss" /> финал этапа</span>
        </div>
      </aside>
    </div>
  )
}

function SectionRow({ sec }) {
  const done = sec.total > 0 && sec.passed >= sec.total
  return (
    <div className={`section-row ${done ? 'done' : ''}`}>
      <span className="dot">{done && <Check size={13} />}</span>
      <div className="section-body">
        <span className="section-title">{sec.title}</span>
        <span className="small muted">{sec.course}</span>
        <div className="bar thin"><i style={{ width: `${pct(sec.passed, sec.total)}%` }} /></div>
      </div>
      <span className="muted small">{sec.passed}/{sec.total}</span>
    </div>
  )
}

/* ---------- Обучение ---------- */

function Learning({ state }) {
  const nextCourse = state.next?.section.courseId
  const [open, setOpen] = useState(nextCourse ?? null)
  return (
    <div className="content learning">
      {state.courses.map(c => (
        <section key={c.id} className="card course">
          <button className="course-head" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <div className="course-info">
              <strong>{c.title}</strong>
              <Bar value={pct(c.passed, c.total)} />
            </div>
            <span className="muted small">{c.passed}/{c.total}</span>
            <ChevronDown size={18} className={`chev ${open === c.id ? 'open' : ''}`} />
          </button>
          {open === c.id && (
            <div className="sections">
              {c.sections.map(sec => <SectionRow key={sec.id} sec={sec} />)}
              <a className="btn small-btn open-link" href={stepik(c.id)} target="_blank" rel="noreferrer">
                Открыть на Stepik <ArrowUpRight size={14} />
              </a>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

export { Dashboard, Roadmap, Learning }
