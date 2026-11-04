// 주소표(2024-10-08)의 "매교초 개교 전 임시" 행을 학구도(2026-09-20) 좌표 판정과 비교한다. 사용: node scripts/build-maegyo-check.js
// 입력: 학교/ 의 수원교육지원청 통학구역 주소표 CSV, data/school/maegyo_skview_dongs.json(카카오 장소검색 좌표), complex_dongs.json
// 출력: data/school/maegyo_check.json  → scripts/verify-school.js 가 verification_auto.md 에 표로 옮긴다
const fs = require('fs');
const path = require('path');
const g = require('../lib/geo');
const { locate } = require('../lib/school');
const ROOT = path.join(__dirname, '..'), D = path.join(ROOT, 'data', 'school');
const CSV = path.join(ROOT, '학교', '경기도교육청 경기도수원교육지원청_통합홈페이지_통학구역_20241008.csv');

const rows = g.readCsv(CSV, 'euc-kr').filter((r) => /매교초\s*개교|임시/.test(r['학교명']));
const SK = JSON.parse(fs.readFileSync(path.join(D, 'maegyo_skview_dongs.json'), 'utf8')).dongs;
const JA = JSON.parse(fs.readFileSync(path.join(D, 'complex_dongs.json'), 'utf8')).dongs;
const coordOf = (name, n) => (name.includes('센트럴아이파크자이') ? JA : SK).find((d) => d.동 === n + '동' && d.위도 != null);

const out = [];
for (const r of rows) {
  const m = r['건물명'].match(/(\d+)동\s*~\s*(\d+)동/);
  const from = +m[1], to = +m[2], school = r['학교명'].replace(/\(.*\)/, '').trim();
  const dongs = [];
  for (let n = from; n <= to; n++) {
    const c = coordOf(r['건물명'], n);
    if (!c) { dongs.push({ 동: n + '동', 좌표: false }); continue; }
    const L = locate(c.위도, c.경도), e = L.levels.elem;
    dongs.push({ 동: n + '동', 좌표: true, 위도: c.위도, 경도: c.경도, 판정: e.inside.map((x) => x.nm).join('/'), 경계m: e.near, 매교초: e.inside.some((x) => x.nm === '매교초통학구역') });
  }
  out.push({ 지번: r['지번'], 도로명: r['상세주소'], 건물명: r['건물명'], 학교명: r['학교명'], 주소표학교: school, 범위: [from, to], dongs });
}
fs.writeFileSync(path.join(D, 'maegyo_check.json'), JSON.stringify({ 기준: { 주소표: '2024-10-08', 학구도: '2026-09-20', 좌표출처: '카카오 지도 SDK 장소검색' }, rows: out }, null, 1));
for (const o of out) { const ok = o.dongs.filter((d) => d.매교초).length, has = o.dongs.filter((d) => d.좌표).length; console.log(o.건물명, '|', o.학교명, '| 동', o.dongs.length, '좌표', has, '매교초 판정', ok); }
