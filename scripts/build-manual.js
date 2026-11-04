// 수동 대조용 표 만들기: node scripts/build-manual.js → data/school/verification_manual.md (verification.md는 건드리지 않는다)
const fs = require('fs'), path = require('path');
const g = require('../lib/geo');
const D = path.join(__dirname, '..', 'data', 'school');
const J = JSON.parse(fs.readFileSync(path.join(D, 'sw_judge.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(D, 'complex_district.json'), 'utf8'));
const WANT = ['101동', '102동', '103동', '104동', '105동', '106동', '107동', '108동', '111동', '112동', '113동'];   // 확인필요 11개 동 (경계 60m 이내)
const REP = { 동: '대표점(인계로 21)', 위도: 37.2703753379, 경도: 127.0212229456 };   // 카카오 주소검색 좌표

function judge(lat, lng) {
  const [x, y] = g.toTM(lat, lng), r = {};
  for (const k of ['elem', 'mid', 'high']) {
    let inside = null;
    for (const f of J[k]) if (g.inPoly(x, y, f.rings)) inside = f;
    let other = null;
    for (const f of J[k]) { if (f === inside) continue; const d = g.distBoundary(x, y, f.rings); if (!other || d < other.d) other = { d, nm: f.nm }; }
    r[k] = { nm: inside ? inside.nm : '[확인 필요]', near: inside ? g.distBoundary(x, y, inside.rings) : null, other: other && other.nm };
  }
  return r;
}
const link = (n, la, lo) => `https://map.kakao.com/link/map/${encodeURIComponent(n)},${la},${lo}`;
const pt = [REP, ...WANT.map((n) => C.dongs.find((d) => d.동 === n))];
const repJ = judge(REP.위도, REP.경도), key = (j) => `${j.elem.nm}/${j.mid.nm}/${j.high.nm}`;
let t = `# 수동 대조용 동별 좌표 (학구도안내서비스에서 사람이 직접 확인)

> 좌표 출처: 카카오 SDK 장소검색, 건물 중심 여부 미확인, 경계 근처는 핀 위치에 따라 결과가 달라질 수 있음

- 대표점은 카카오 주소검색(경기 수원시 팔달구 인계로 21) 좌표. 동별 좌표는 카카오 지도 SDK 장소검색(2026-11-04) 결과.
- 거리는 자동판정에 쓴 좌표 기준, 해당 학구 경계까지의 최단거리(m). “↔”는 경계 맞은편 학구.
- 학구도안내서비스는 사람이 화면으로 확인하고 빈칸에 적는다(자동 호출 금지). 불일치는 임의로 맞추지 말고 좌표를 다시 확인.

| 동 | 위도 | 경도 | 카카오맵 링크 | 자동판정(초등/중학군/고교) | 경계까지 거리(m)·가장 가까운 경계 | 수동대조 결과 | 일치여부 | 비고 |
|---|---|---|---|---|---|---|---|---|
`;
for (const p of pt) {
  const j = judge(p.위도, p.경도), f = (v) => v.toFixed(1);
  const note = p === REP ? '카카오 주소검색 좌표(단지 대표점)' : key(j) !== key(repJ) ? `대표점 판정(${repJ.elem.nm})과 다름` : '';
  t += `| ${p.동} | ${p.위도} | ${p.경도} | [카카오맵](${link(p.동, p.위도, p.경도)}) | ${key(j)} | 초등 ${f(j.elem.near)} (${j.elem.nm} ↔ ${j.elem.other}) · 중학군 ${f(j.mid.near)} (${j.mid.nm} ↔ ${j.mid.other}) | | | ${note} |\n`;
}
fs.writeFileSync(path.join(D, 'verification_manual.md'), t);
console.log(t);
