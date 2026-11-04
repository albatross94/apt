// 2027학년도 수원시 중학교 중학군 및 중학구 개정(안) xlsx → data/school/sw_mid_plan2027.json
// 사용: node scripts/build-mid-plan.js [xlsx 경로]   (기본: 학교/ 폴더, 없으면 다운로드 폴더의 같은 이름)
// 개정(안)이므로 확정이 아니다. 화면·문서에는 반드시 "확정 아님, 기준 학년도 2027"로 표기한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readXlsx } = require('../lib/xlsx');

const ROOT = path.join(__dirname, '..');
const NAME = '[게시용] 2027학년도 수원시 중학교 중학군 및 중학구 현황.xlsx';
const cand = [process.argv[2], path.join(ROOT, '학교', NAME), path.join(os.homedir(), 'Downloads', NAME)].filter(Boolean);
const SRC = cand.find((f) => fs.existsSync(f));
if (!SRC) { console.error('xlsx 파일을 찾지 못했습니다:', cand.join(' | ')); process.exit(2); }

const sheet = readXlsx(SRC)[0];
const cell = (r, c) => String((sheet.rows[r] || [])[c] ?? '').replace(/\s+/g, ' ').trim();   // r: 0부터 (엑셀 행 - 1)
const groups = [];
let cur = null, region = '', pendingNote = '', school = { type: '' };

// 비고(⊙…)를 종류별로 나눈다: 공동학구 · 거주지 학구별 배정 · 일부 지역(통반·동) 예외 · 그 밖
function classify(note, group) {
  if (!note) return null;
  const out = { 비고: note.replace(/^⊙\s*/, '') };
  if (/거주지 초등학교 학구별/.test(note)) out.종류 = '거주지 학구별 배정';
  else if (/폐지/.test(note)) out.종류 = group === '호매실중학군' ? '원칙' : '공동학구 폐지(다른 중학군에 반영)';   // 당수초: 북부2·3 공동학구 폐지, 호매실중학군 반영
  else if (/통학구역\s*중/.test(note) && /공동학구/.test(note)) { out.종류 = '공동학구(일부 지역)'; out.지역 = ((note.match(/통학구역\s*중\s*(.+?)(?:는|은)\s/) || [])[1] || '').trim(); }   // 곡반초: 신동택지지구 거주졸업(예정)자만 남부·영통 공동학구
  else if (/통학구역\s*중/.test(note)) {
    // "통학구역 중 ○○" 는 그 지역만 해당. 뒤에 "은 △△중학군"이 붙으면 이 중학군이 원칙이고 ○○ 지역이 △△로 예외.
    out.종류 = '일부 지역';
    const m = note.match(/통학구역\s*중\s*(.+?)(?:은\s*([가-힣0-9]+중학군))?\s*[)\]]/);
    if (m) { const region = m[1].trim(); if (m[2]) { out.지역 = '그 밖의 지역(원칙)'; out.예외 = { 지역: region, 중학군: m[2] }; } else out.지역 = region; }
  } else if (/공동학구/.test(note)) { out.종류 = '공동학구'; out.공동학구 = ((note.match(/⊙(.*?)(?:과|와) 공동학구/) || [])[1] || '').split(/[,，]\s*/).map((x) => x.trim()).filter(Boolean); }
  else if (/반영|대체이전/.test(note)) out.종류 = '변경';
  else out.종류 = '기타';
  return out;
}

for (let r = 4; r < sheet.rows.length; r++) {
  const B = cell(r, 1), C = cell(r, 2), D = cell(r, 3), E = cell(r, 4), F = cell(r, 5);
  if (B === '합계') break;
  if (/^- .+ -$/.test(E)) { region = E.replace(/[- ]/g, ''); pendingNote = F.replace(/^※\s*/, ''); continue; }
  if (B === '소계') { if (cur) { cur.소계 = { 남녀공학: C, 단성: D }; cur = null; } continue; }
  if (B) { cur = { 중학군: B, 소재: region, 그룹비고: pendingNote, 남녀공학: [], 남중: [], 여중: [], 공동학구_중학교: [], 초등학교: [] }; groups.push(cur); pendingNote = ''; school = { type: '' }; }
  if (!cur) continue;
  if (C) { const j = /^\((.*)\)$/.test(C); (j ? cur.공동학구_중학교 : cur.남녀공학).push(j ? C.slice(1, -1) : C); }
  if (D) { if (/^\(남중\)$/.test(D)) school.type = '남'; else if (/^\(여중\)$/.test(D)) school.type = '여'; else (school.type === '여' ? cur.여중 : cur.남중).push(D); }
  if (E) cur.초등학교.push({ 이름: E, ...(classify(F, cur.중학군) || {}) });
  else if (F && cur.초등학교.length === 0) cur.그룹비고 = [cur.그룹비고, F].filter(Boolean).join(' / ');
}

// 초등학교 → 중학군 목록 (같은 초등학교가 여러 중학군에 나오면 모두 담는다)
const byElem = {};
for (const g of groups) for (const e of g.초등학교) {
  (byElem[e.이름] ||= []).push({ 중학군: g.중학군 === '오목고색중학군' ? g.중학군 : g.중학군, 종류: e.종류 || '원칙', ...(e.지역 ? { 지역: e.지역 } : {}), ...(e.예외 ? { 예외: e.예외 } : {}), ...(e.공동학구 ? { 공동학구: e.공동학구 } : {}), ...(e.비고 ? { 비고: e.비고 } : {}) });
}
const out = {
  meta: { 제목: '2027학년도 수원시 중학교 중학군 및 중학구 개정(안)', 기준학년도: 2027, 상태: '개정(안) — 확정 아님', 파일: NAME, 변환일: new Date().toISOString().slice(0, 10), 주의: '개정안이며 확정이 아니다. 통·반 단위 예외는 이 표만으로 단지 동에 적용할 수 없다 [확인 필요].' },
  중학군: groups.map((g) => ({ ...g, 초등학교수: g.초등학교.length })),
  초등학교_중학군: byElem,
};
fs.writeFileSync(path.join(ROOT, 'data', 'school', 'sw_mid_plan2027.json'), JSON.stringify(out, null, 1));
console.log('원본:', SRC);
console.log('중학군', groups.length, '| 초등학교(고유)', Object.keys(byElem).length, '| 초등학교 행', groups.reduce((a, g) => a + g.초등학교.length, 0));
for (const g of groups) console.log(' ', g.중학군, `(${g.소재})`, '중 공학', g.남녀공학.length, '남', g.남중.length, '여', g.여중.length, '공동', g.공동학구_중학교.length, '| 초', g.초등학교.length, '| 소계', JSON.stringify(g.소계));
const multi = Object.entries(byElem).filter(([, v]) => v.length > 1);
console.log('여러 중학군에 나오는 초등학교', multi.length);
for (const [k, v] of multi) console.log(' ', k, '→', v.map((x) => `${x.중학군}[${x.종류}${x.지역 ? ':' + x.지역 : ''}${x.예외 ? '→' + x.예외.중학군 : ''}]`).join(' | '));
