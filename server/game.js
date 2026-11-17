// Игровая логика: из снимка Stepik и конфигурации считает XP, уровень и состояние этапов.
const PROJECT_XP = 30
const levelFrom = lvl => 10 * (lvl - 1) ** 2

export function buildState(snap, cfg, manual = {}) {
  const sec = Object.fromEntries(snap.sections.map(s => [s.id, s]))
  const courseTitle = Object.fromEntries(snap.courses.map(c => [c.id, c.title]))
  const view = id => {
    const s = sec[id]
    return s
      ? { id, title: s.title, courseId: s.courseId, course: courseTitle[s.courseId], total: s.n, passed: s.passed }
      : { id, title: 'Раздел не найден', total: 0, passed: 0, missing: true }
  }

  let stages = cfg.stages.map(st => {
    const sections = st.sections.map(x => view(x.id))
    const extra = st.manual ? { key: st.manual.key, title: st.manual.title, done: !!manual[st.manual.key] } : null
    const total = sections.reduce((n, s) => n + s.total, 0) + (extra ? 1 : 0)
    const passed = sections.reduce((n, s) => n + s.passed, 0) + (extra?.done ? 1 : 0)
    return { id: st.id, title: st.title, sections, extra, total, passed, done: total > 0 && passed >= total }
  })

  const firstOpen = stages.findIndex(s => !s.done)
  const current = firstOpen === -1 ? stages.length - 1 : firstOpen
  stages = stages.map((s, i) => ({
    ...s,
    status: s.done ? 'done' : i === current ? 'active' : i === current + 1 ? 'next' : 'later',
    revealed: s.done || s.passed > 0 || i <= current + 1,
  }))

  const bonus = cfg.bonus.map(x => view(x.id))
  const mainSections = stages.flatMap(s => s.sections)
  const stepsPassed = mainSections.reduce((n, s) => n + s.passed, 0)
  const stepsTotal = mainSections.reduce((n, s) => n + s.total, 0)
  const bonusPassed = bonus.reduce((n, s) => n + s.passed, 0)

  const xp = stepsPassed + bonusPassed + (stages.some(s => s.extra?.done) ? PROJECT_XP : 0)
  const level = Math.floor(Math.sqrt(xp / 10)) + 1

  const cur = stages[current]
  // «Продолжить»: сначала то, что уже начато (самый ранний этап), иначе первый нетронутый раздел текущего этапа
  const started = stages.flatMap(st => st.sections.map(sec => ({ st, sec }))).find(x => x.sec.passed > 0 && x.sec.passed < x.sec.total)
  const fresh = cur.sections.find(s => s.passed < s.total)
  const next = started ? { stage: started.st, section: started.sec } : fresh ? { stage: cur, section: fresh } : null
  const total = stages.reduce((n, s) => n + s.total, 0)
  const passed = stages.reduce((n, s) => n + s.passed, 0)

  return {
    syncedAt: snap.syncedAt,
    xp, level, levelFrom: levelFrom(level), levelTo: levelFrom(level + 1),
    steps: { passed: stepsPassed, total: stepsTotal },
    percent: total ? Math.round((passed / total) * 100) : 0,
    currentId: cur.id,
    stagesDone: stages.filter(s => s.done).length,
    ready: stages.every(s => s.done),
    next: next ? { stageId: next.stage.id, stageTitle: next.stage.title, section: next.section } : null,
    stages, bonus,
    courses: snap.courses.map(c => {
      const sections = c.sections.map(view)
      return {
        id: c.id, title: c.title, sections,
        total: sections.reduce((n, s) => n + s.total, 0),
        passed: sections.reduce((n, s) => n + s.passed, 0),
      }
    }),
  }
}
