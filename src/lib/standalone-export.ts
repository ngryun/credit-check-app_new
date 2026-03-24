import type { Row } from '../types'
import { canonGroup, isKoreanHistory } from './normalization'
import { buildChecks } from './prerequisite-check'

/**
 * mergedRows 데이터를 내장한 완전 자체 완결형 HTML 대시보드를 생성합니다.
 * React 없이 vanilla JS + inline CSS로 동작합니다.
 */
export function downloadStandaloneHtml(rows: Row[]) {
  // Pre-compute all student data server-side (in-browser)
  const students = buildStudentData(rows)
  const dataJson = JSON.stringify(students).replace(/<\/script>/gi, '<\\/script>')
  const html = buildHtml(dataJson)

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  a.download = `이수현황_대시보드_${stamp}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

type StudentExport = {
  key: string
  label: string
  className: string
  totalCredits: number
  completedCredits: number
  futureCredits: number
  foundationPct: number
  foundationDetail: string
  hasViolation: boolean
  violations: string[]
  subjects: {
    교과: string
    과목명: string
    학점: number
    학기: string
    isFuture: boolean
  }[]
}

function buildStudentData(rows: Row[]): { classes: string[]; students: StudentExport[] } {
  const classSet = new Set<string>()
  const studentMap = new Map<string, { 학년: number; 반: number; 번호: number; 이름: string | null; rows: Row[] }>()

  for (const r of rows) {
    if (r.학년 == null || r.반 == null || r.번호 == null) continue
    classSet.add(`${r.학년}-${r.반}`)
    const key = `${r.학년}-${r.반}-${r.번호}`
    const prev = studentMap.get(key)
    if (!prev) studentMap.set(key, { 학년: r.학년, 반: r.반, 번호: r.번호, 이름: r.이름 ?? null, rows: [r] })
    else prev.rows.push(r)
  }

  const classes = Array.from(classSet).sort((a, b) => {
    const [ag, ac] = a.split('-').map(Number)
    const [bg, bc] = b.split('-').map(Number)
    return ag - bg || ac - bc
  })

  const students: StudentExport[] = []
  for (const [key, s] of studentMap) {
    const label = `${String(s.번호).padStart(2, '0')} ${s.이름 ?? ''}`
    const className = `${s.학년}-${s.반}`

    const subjects = s.rows.map((r) => ({
      교과: canonGroup(r.교과),
      과목명: r.과목명 || '',
      학점: r.학점 || 0,
      학기: r.과목학년 != null && r.과목학기 != null ? `${r.과목학년}-${r.과목학기}` : '미정',
      isFuture: r._source === 'future',
    }))

    const totalCredits = subjects.reduce((s, r) => s + r.학점, 0)
    const completedCredits = subjects.filter(r => !r.isFuture).reduce((s, r) => s + r.학점, 0)
    const futureCredits = subjects.filter(r => r.isFuture).reduce((s, r) => s + r.학점, 0)

    const foundation = new Set(['국어', '수학', '영어'])
    const baseOnly = subjects.reduce((s, r) => s + (foundation.has(r.교과) ? r.학점 : 0), 0)
    const khOnly = subjects.reduce((s, r) => s + (isKoreanHistory(r.과목명) ? r.학점 : 0), 0)
    const combined = baseOnly + khOnly
    const foundationPct = totalCredits > 0 ? Math.round((combined / totalCredits) * 1000) / 10 : 0
    const foundationDetail = `기초교과 ${baseOnly} + 한국사 ${khOnly} = ${combined}학점`

    const checks = buildChecks(subjects)
    const hasViolation = checks.hierarchyViolations.length > 0 || checks.prereqViolations.length > 0
    const violations: string[] = []
    for (const v of checks.hierarchyViolations) {
      violations.push(`${v.base}: 이수 ${v.have.join(', ')}, 누락 ${v.missing.join(', ')}`)
    }
    for (const v of checks.prereqViolations) {
      violations.push(`${v.course}: 선수 누락 → ${v.missing.join(', ')}`)
    }

    students.push({ key, label, className, totalCredits, completedCredits, futureCredits, foundationPct, foundationDetail, hasViolation, violations, subjects })
  }

  students.sort((a, b) => a.key.localeCompare(b.key))
  return { classes, students }
}

function buildHtml(dataJson: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>학점 이수 현황 대시보드 (담임교사용)</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard Variable',Pretendard,system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;-webkit-font-smoothing:antialiased}
.header{background:rgba(255,255,255,.95);backdrop-filter:blur(8px);border-bottom:1px solid #e2e8f0;position:fixed;top:0;left:0;right:0;z-index:50}
.header-inner{max-width:1280px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#4338ca);border-radius:8px;display:flex;align-items:center;justify-content:center}
.logo-icon svg{width:18px;height:18px;color:white}
.logo h1{font-size:14px;font-weight:700;color:#1e293b}
.badge-ro{font-size:11px;color:#94a3b8}
.main{max-width:1280px;margin:0 auto;padding:80px 16px 24px}
.dash-title{font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.025em;margin-bottom:4px}
.dash-sub{font-size:13px;color:#64748b}
.layout{display:grid;grid-template-columns:280px 1fr;gap:20px;margin-top:20px}
.card{background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}
.sidebar-title{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;padding:16px 16px 8px}
select,input{width:100%;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;padding:10px 12px;font-size:13px;outline:none;font-family:inherit;transition:box-shadow .15s}
select:focus,input:focus{box-shadow:0 0 0 2px #818cf8;border-color:#818cf8}
.search-wrap{padding:0 16px 12px;position:relative}
.search-wrap svg{position:absolute;left:28px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#94a3b8}
.search-wrap input{padding-left:36px}
.stu-list{max-height:560px;overflow:auto}
.stu-btn{width:100%;text-align:left;padding:10px 16px;font-size:13px;border:none;background:none;cursor:pointer;border-left:2px solid transparent;transition:all .15s;display:flex;align-items:center;justify-content:space-between;font-family:inherit;color:#334155}
.stu-btn:hover{background:#f8fafc}
.stu-btn.active{background:#eef2ff;border-left-color:#6366f1;color:#4338ca;font-weight:500}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot-red{background:#f43f5e}
.dot-green{background:#10b981}
.dot-amber{background:#f59e0b}
.empty{padding:48px;text-align:center;color:#94a3b8;font-size:13px}
/* Student detail */
.stu-header{background:linear-gradient(to right,#4f46e5,#6366f1,#6366f1);padding:20px 24px;color:white}
.stu-class{font-size:13px;color:rgba(255,255,255,.7);margin-bottom:2px}
.stu-name{font-size:20px;font-weight:700;letter-spacing:-0.025em}
.stu-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,.2);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.2)}
.kpi-row{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #f1f5f9}
.kpi-row>div{padding:20px 24px;border-right:1px solid #f1f5f9}
.kpi-row>div:last-child{border-right:none}
.kpi-label{font-size:11px;font-weight:500;color:#94a3b8;margin-bottom:4px}
.kpi-value{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}
.kpi-sub{font-size:11px;color:#64748b;margin-top:8px}
.kpi-dot{display:inline-flex;align-items:center;gap:4px;font-size:11px;margin-right:12px}
.kpi-dot span{width:8px;height:8px;border-radius:50%;display:inline-block}
/* Violation */
.vio-ok{display:flex;align-items:center;gap:12px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px}
.vio-ok-icon{width:36px;height:36px;border-radius:12px;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.vio-bad{border:1px solid #fecdd3;border-radius:16px;overflow:hidden}
.vio-bad-header{padding:12px 20px;background:#fff1f2;border-bottom:1px solid #fecdd3;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#9f1239}
.vio-item{display:flex;align-items:start;gap:12px;padding:8px 0;font-size:13px}
.vio-dot{margin-top:4px;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
/* Tabs */
.tabs{display:flex;gap:4px;padding:4px;background:#f1f5f9;border-radius:12px;width:fit-content;margin-top:16px}
.tab-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;transition:all .2s;background:none;color:#64748b}
.tab-btn.active{background:white;color:#4338ca;box-shadow:0 1px 3px rgba(0,0,0,.08)}
/* Subject tables */
.subj-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.subj-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f1f5f9}
.subj-head span:first-child{font-size:13px;font-weight:600;color:#1e293b}
.subj-head span:last-child{font-size:11px;font-weight:500;color:#94a3b8;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:13px}
thead{background:#f8fafc}
th{padding:8px 16px;text-align:left;font-size:11px;font-weight:500;color:#64748b}
th:nth-child(2){text-align:right}
th:nth-child(3){text-align:center}
td{padding:10px 16px;border-top:1px solid #f8fafc}
td:nth-child(2){text-align:right;font-variant-numeric:tabular-nums;color:#475569}
td:nth-child(3){text-align:center;font-variant-numeric:tabular-nums;font-size:11px;color:#64748b}
tr.future{background:#fffbeb}
tr.future:hover{background:#fef3c7}
tr:not(.future):hover{background:#f8fafc}
.future-tag{display:inline-flex;align-items:center;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fef3c7;color:#d97706;margin-left:6px}
/* Semester grid */
.sem-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.sem-head{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f1f5f9}
.sem-label{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
.sem-body{padding:12px 16px;min-height:60px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;font-size:12px;margin:3px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;transition:all .15s}
.chip:hover{background:white;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.chip.future{background:#fffbeb;border-color:#fde68a;color:#92400e}
.chip-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.chip-credit{font-size:10px;font-variant-numeric:tabular-nums;color:#94a3b8}
.chip.future .chip-credit{color:#d97706}
/* Footer */
.footer{border-top:1px solid #e2e8f0;background:white;margin-top:48px;padding:24px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.8}
.footer a{color:#64748b;text-decoration:underline;text-underline-offset:2px}
.footer a:hover{color:#4f46e5}
@media(max-width:768px){.layout{grid-template-columns:1fr}.subj-grid,.sem-grid{grid-template-columns:1fr}.kpi-row{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="header"><div class="header-inner">
  <div class="logo">
    <div class="logo-icon"><svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15v-3.375c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125V15"/></svg></div>
    <h1>고교학점제 학점 이수 현황 확인 및 과목선택 시뮬레이션</h1>
  </div>
  <span class="badge-ro">담임교사용 열람 전용</span>
</div></div>

<div class="main">
  <div class="dash-title">이수현황 대시보드</div>
  <div class="dash-sub">학급과 학생을 선택하여 이수현황을 점검하세요.</div>

  <div class="layout">
    <div>
      <div class="card">
        <div class="sidebar-title">학급 선택</div>
        <div style="padding:0 16px 12px"><select id="classSelect"><option value="">학급을 선택하세요</option></select></div>
        <div style="border-top:1px solid #f1f5f9" id="studentPanel" hidden>
          <div class="search-wrap" style="padding-top:12px">
            <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
            <input id="searchInput" placeholder="이름 또는 번호 검색" />
          </div>
          <div class="stu-list" id="stuList"></div>
        </div>
      </div>
    </div>
    <div id="detail"><div class="card empty">좌측에서 학급과 학생을 선택하세요.</div></div>
  </div>
</div>

<div class="footer">
  <p>&copy; 2026 Namgung Yeon (Selak High School). Some rights reserved.</p>
  <p>Licensed under <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a></p>
  <p><a href="https://namgungyeon.tistory.com" target="_blank" rel="noopener">namgungyeon.tistory.com</a></p>
</div>

<script>
const DATA = ${dataJson};
const classes = DATA.classes;
const students = DATA.students;
let currentClass = '';
let currentStudent = '';
let viewTab = 'subject';

const classSelect = document.getElementById('classSelect');
const studentPanel = document.getElementById('studentPanel');
const stuList = document.getElementById('stuList');
const searchInput = document.getElementById('searchInput');
const detail = document.getElementById('detail');

classes.forEach(c => {
  const o = document.createElement('option');
  o.value = c; o.textContent = c.replace('-', '학년 ') + '반';
  classSelect.appendChild(o);
});

classSelect.addEventListener('change', () => {
  currentClass = classSelect.value;
  currentStudent = '';
  searchInput.value = '';
  if (currentClass) { studentPanel.hidden = false; renderStudentList(); }
  else { studentPanel.hidden = true; }
  renderDetail();
});

searchInput.addEventListener('input', renderStudentList);

function renderStudentList() {
  const q = searchInput.value;
  const list = students.filter(s => s.className === currentClass && s.label.includes(q));
  stuList.innerHTML = '';
  list.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'stu-btn' + (s.key === currentStudent ? ' active' : '');
    btn.innerHTML = '<span>' + esc(s.label) + '</span>' + (s.hasViolation ? '<span class="dot dot-red"></span>' : '');
    btn.onclick = () => { currentStudent = s.key; renderStudentList(); renderDetail(); };
    stuList.appendChild(btn);
  });
  if (!list.length) stuList.innerHTML = '<div class="empty">검색 결과 없음</div>';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderDetail() {
  const s = students.find(x => x.key === currentStudent);
  if (!s) { detail.innerHTML = '<div class="card empty">좌측에서 학급과 학생을 선택하세요.</div>'; return; }

  const pctClass = s.foundationPct > 50 ? 'color:#e11d48' : 'color:#0f172a';
  const statusHtml = s.hasViolation
    ? '<span class="stu-badge"><span class="dot dot-red" style="width:8px;height:8px"></span> 점검 필요</span>'
    : '<span class="stu-badge"><span class="dot dot-green" style="width:8px;height:8px"></span> 정상</span>';

  // Group by 교과
  const groupMap = {};
  s.subjects.forEach(r => { (groupMap[r.교과] = groupMap[r.교과] || []).push(r); });
  const groups = Object.entries(groupMap).sort((a,b) => a[0].localeCompare(b[0],'ko'));

  let subjHtml = groups.map(([g, list]) => {
    list.sort((a,b) => a.학기.localeCompare(b.학기) || a.과목명.localeCompare(b.과목명,'ko'));
    const gc = list.reduce((s,r) => s + r.학점, 0);
    const rows = list.map(r =>
      '<tr class="' + (r.isFuture ? 'future' : '') + '">' +
      '<td>' + esc(r.과목명) + (r.isFuture ? '<span class="future-tag">예정</span>' : '') + '</td>' +
      '<td>' + r.학점 + '</td><td>' + esc(r.학기) + '</td></tr>'
    ).join('');
    return '<div class="card"><div class="subj-head"><span>' + esc(g) + '</span><span>' + gc + '학점</span></div>' +
      '<table><thead><tr><th>과목명</th><th style="width:50px">학점</th><th style="width:60px">학기</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).join('');

  // Group by semester
  const sems = ['1-1','1-2','2-1','2-2','3-1','3-2'];
  const semMap = {};
  s.subjects.forEach(r => { (semMap[r.학기] = semMap[r.학기] || []).push(r); });
  let semHtml = sems.map(sl => {
    const [y,t] = sl.split('-');
    const rows = (semMap[sl] || []).sort((a,b) => a.교과.localeCompare(b.교과,'ko') || a.과목명.localeCompare(b.과목명,'ko'));
    const isFut = rows.some(r => r.isFuture);
    const sc = rows.reduce((s,r) => s + r.학점, 0);
    const isEmpty = !rows.length;
    const chips = rows.map(r =>
      '<span class="chip' + (r.isFuture ? ' future' : '') + '">' +
      '<span class="chip-dot" style="background:' + (r.isFuture ? '#fbbf24' : '#818cf8') + '"></span>' +
      esc(r.과목명) + '<span class="chip-credit">' + r.학점 + '</span></span>'
    ).join('');
    return '<div class="card" style="' + (isEmpty ? 'opacity:.4' : '') + '">' +
      '<div class="sem-head"><div style="display:flex;align-items:center;gap:10px">' +
      '<div class="sem-label" style="background:' + (isFut ? '#fef3c7;color:#b45309' : isEmpty ? '#f1f5f9;color:#94a3b8' : '#e0e7ff;color:#4338ca') + '">' + sl + '</div>' +
      '<div><div style="font-size:13px;font-weight:600;color:#1e293b">' + y + '학년 ' + t + '학기</div>' +
      (!isEmpty ? '<div style="font-size:11px;color:#64748b">' + rows.length + '과목 · ' + sc + '학점</div>' : '') +
      '</div></div>' + (isFut ? '<span style="display:inline-flex;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:500;background:#fef3c7;color:#b45309">수강예정</span>' : '') +
      '</div><div class="sem-body">' + (isEmpty ? '<div style="font-size:11px;color:#94a3b8;padding:8px 0">수강 과목 없음</div>' : chips) + '</div></div>';
  }).join('');

  let vioHtml;
  if (!s.hasViolation) {
    vioHtml = '<div class="vio-ok"><div class="vio-ok-icon"><svg style="width:20px;height:20px;color:#16a34a" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div><div style="font-size:13px;font-weight:500;color:#166534">위계/선후수 위반 없음</div><div style="font-size:11px;color:#16a34a">모든 과목이 정상적으로 이수되고 있습니다.</div></div></div>';
  } else {
    const items = s.violations.map(v => '<div class="vio-item"><span class="vio-dot" style="background:#ffe4e6"><span class="dot dot-red" style="width:6px;height:6px"></span></span><span>' + esc(v) + '</span></div>').join('');
    vioHtml = '<div class="vio-bad"><div class="vio-bad-header"><svg style="width:16px;height:16px;color:#f43f5e" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>위계 과목 점검 결과<span style="margin-left:auto;font-size:11px;color:#f43f5e">' + s.violations.length + '건</span></div><div style="padding:16px 20px">' + items + '</div></div>';
  }

  detail.innerHTML = '<div class="card" style="margin-bottom:16px">' +
    '<div class="stu-header"><div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div><div class="stu-class">' + esc(currentClass.replace('-', '학년 ') + '반') + '</div><div class="stu-name">' + esc(s.label) + '</div></div>' + statusHtml + '</div></div>' +
    '<div class="kpi-row"><div><div class="kpi-label">전체 이수학점</div><div class="kpi-value" style="color:#0f172a">' + s.totalCredits + '</div>' +
    '<div class="kpi-sub"><span class="kpi-dot"><span style="background:#6366f1"></span> 이수 ' + s.completedCredits + '</span>' +
    (s.futureCredits > 0 ? '<span class="kpi-dot"><span style="background:#fbbf24"></span> 예정 ' + s.futureCredits + '</span>' : '') + '</div></div>' +
    '<div><div class="kpi-label">기초교과 + 한국사</div><div class="kpi-value" style="' + pctClass + '">' + s.foundationPct + '%</div>' +
    '<div class="kpi-sub">' + esc(s.foundationDetail) + '</div>' +
    (s.foundationPct > 50 ? '<div style="font-size:11px;color:#e11d48;font-weight:500;margin-top:4px">50% 초과 — 점검 필요</div>' : '') + '</div>' +
    '<div><div class="kpi-label">교과별 학점</div><div style="margin-top:4px" id="barChart"></div></div></div></div>' +
    '<div style="margin-bottom:16px">' + vioHtml + '</div>' +
    '<div class="tabs" id="tabBar"><button class="tab-btn' + (viewTab==='subject'?' active':'') + '" data-tab="subject">교과(군)별</button><button class="tab-btn' + (viewTab==='semester'?' active':'') + '" data-tab="semester">학기별 타임라인</button></div>' +
    '<div id="viewSubject"' + (viewTab!=='subject'?' hidden':'') + '><div class="subj-grid">' + subjHtml + '</div></div>' +
    '<div id="viewSemester"' + (viewTab!=='semester'?' hidden':'') + '><div class="sem-grid">' + semHtml + '</div></div>';

  // Bar chart
  const bc = document.getElementById('barChart');
  if (bc) {
    const grpArr = Object.entries(groupMap).map(([k,v]) => ({g:k, c:v.reduce((s,r)=>s+r.학점,0)})).sort((a,b)=>b.c-a.c);
    const mx = Math.max(1,...grpArr.map(x=>x.c));
    bc.innerHTML = grpArr.map(x =>
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<div style="width:60px;font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(x.g)+'">' + esc(x.g) + '</div>' +
      '<div style="flex:1;height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden"><div style="height:100%;width:' + Math.round(x.c/mx*100) + '%;background:linear-gradient(to right,#818cf8,#6366f1);border-radius:99px;transition:width .5s"></div></div>' +
      '<div style="width:20px;text-align:right;font-size:10px;font-weight:600;color:#475569;font-variant-numeric:tabular-nums">' + x.c + '</div></div>'
    ).join('');
  }

  // Tab switching
  document.getElementById('tabBar').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    viewTab = btn.dataset.tab;
    document.querySelectorAll('#tabBar .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === viewTab));
    document.getElementById('viewSubject').hidden = viewTab !== 'subject';
    document.getElementById('viewSemester').hidden = viewTab !== 'semester';
  });
}
</script>
</body>
</html>`
}
