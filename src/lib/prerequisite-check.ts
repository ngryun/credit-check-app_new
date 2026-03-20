import rawPrereqs from './prereqs.json'
import { normCourseName, parseHierLevel } from './normalization'

export const PREREQS = (() => {
  const m = new Map<string, string[]>()
  for (const [k, arr] of Object.entries(rawPrereqs as Record<string, string[]>)) {
    const nk = normCourseName(k)
    if (!nk) continue
    const reqs = arr.map(normCourseName).filter((x): x is string => Boolean(x))
    m.set(nk, reqs)
  }
  return m
})()

export type CheckResult = {
  hierarchyViolations: { base: string; have: number[]; missing: number[] }[]
  prereqViolations: { course: string; missing: string[] }[]
}

export function buildChecks(
  subjects: { 과목명: string }[]
): CheckResult {
  // 로마자 위계
  const byBase = new Map<string, Set<number>>()
  for (const r of subjects) {
    const ph = parseHierLevel(r.과목명)
    if (!ph) continue
    const set = byBase.get(ph.base) || new Set<number>()
    set.add(ph.level)
    byBase.set(ph.base, set)
  }
  const hierarchyViolations: CheckResult['hierarchyViolations'] = []
  for (const [base, set] of byBase) {
    const levels = Array.from(set)
    const max = Math.max(...levels)
    const missing: number[] = []
    for (let i = 1; i < max; i++) if (!set.has(i)) missing.push(i)
    if (missing.length > 0) hierarchyViolations.push({ base, have: levels.sort((a, b) => a - b), missing })
  }

  // JSON 선후수
  const have = new Set<string>()
  for (const r of subjects) {
    const nm = normCourseName(r.과목명)
    if (nm) have.add(nm)
  }
  const prereqViolations: CheckResult['prereqViolations'] = []
  for (const [course, reqs] of PREREQS) {
    if (!have.has(course)) continue
    const miss = reqs.filter((r) => !have.has(r))
    if (miss.length > 0) prereqViolations.push({ course, missing: miss })
  }

  return { hierarchyViolations, prereqViolations }
}

export function buildChecksString(
  subjects: { 과목명: string }[]
): string {
  const { hierarchyViolations, prereqViolations } = buildChecks(subjects)
  const parts: string[] = []
  if (hierarchyViolations.length) {
    parts.push(`로마자 위계 위반: ${hierarchyViolations.map((v) => `${v.base}: 누락 ${v.missing.join(', ')}`).join('; ')}`)
  }
  if (prereqViolations.length) {
    parts.push(prereqViolations.map((v) => `${v.course}: 선수 누락 → ${v.missing.join(', ')}`).join('; '))
  }
  return parts.join(' | ')
}
