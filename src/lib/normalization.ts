export function toNum(v: unknown): number | null {
  if (v == null) return null
  const s = typeof v === 'string' ? v.trim() : v
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

export function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function strip(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, '') : String(s ?? '')
}

export function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k in row) out[strip(k)] = row[k]
  return out
}

export function canonGroup(raw: string | null): string {
  if (raw == null) return '기타'
  const s = String(raw).trim()
  if (s === '') return '기타'
  let normalized = s
    .normalize('NFKC')
    .replace(/[·⋅•∙・ㆍ]/g, '・')
    .replace(/／/g, '/')
    .replace(/\s*・\s*/g, '・')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\(([^)]*)\)/g, (_m, inner) => `(${String(inner).replace(/\s+/g, '')})`)

  const target = '기술・가정/제2외국어/한문/교양'
  const cmp = normalized.replace(/\s+/g, '')
  if (
    cmp === target ||
    cmp === '교양' ||
    cmp === '제2외국어' ||
    cmp === '제2외국어/한문' ||
    cmp === '한문' ||
    cmp === '기술・가정' ||
    cmp === '기술・가정/정보'
  ) {
    return target
  }
  return normalized
}

export function parseHierLevel(name: string | null): { base: string; level: number } | null {
  if (!name) return null
  const s = String(name).trim().normalize('NFKC')
  const asciiRoman = '(?:VIII|VII|VI|IV|IX|III|II|I|X)'
  const unicodeRoman = '[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]'
  const re = new RegExp(`^(.*?)\\s*(?:${unicodeRoman}|${asciiRoman})$`)
  const m = s.match(re)
  if (!m) return null
  const tail = s.slice(m[1].length).trim()
  const map: Record<string, number> = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
    'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6, 'Ⅶ': 7, 'Ⅷ': 8, 'Ⅸ': 9, 'Ⅹ': 10,
  }
  const level = map[tail]
  if (!level) return null
  const base = m[1].trim()
  if (!base) return null
  return { base, level }
}

export function normCourseName(name: string | null): string | null {
  if (!name) return null
  return String(name)
    .trim()
    .normalize('NFKC')
    .replace(/\(([^)]*)\)/g, (_m, inner) => `(${String(inner).replace(/\s+/g, '')})`)
}

export function isKoreanHistory(name: string | null): boolean {
  if (!name) return false
  const s = String(name).trim().normalize('NFKC')
  return s === '한국사' || s === '한국사1' || s === '한국사2'
}
