// 대조 테스트(작업지시서 2-4): 학구도안내서비스 2026-11-04 확인값과 우리 판정을 비교한다. 사용: node scripts/verify-school.js
// 주소 → 좌표는 V-World 지오코더(.env의 VWORLD_KEY)를 쓴다. schoolzone 사이트는 호출하지 않는다.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const core = require('../lib/core');
const { locate } = require('../lib/school');

const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
let pass = 0, failN = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); cond ? pass++ : failN++; };

(async () => {
  const MID_EAST = ['동수원중학교', '동성중학교', '창용중학교', '매원중학교', '수원원일중학교', '원천중학교', '산남중학교'];
  const cases = [
    { addr: '경기도 수원시 팔달구 인계로 21', fixed: { lat: 37.2703753379, lng: 127.0212229456, src: '카카오 주소검색(2026-11-04 브라우저 확인)' }, elem: '매교초통학구역', elemSchools: ['매교초등학교'], mid: '동부중학군', midSchools: MID_EAST, high: '수원2구역', highN: 18 },
    { addr: '경기도 수원시 팔달구 인계동 257-2', elem: '인계초통학구역', elemSchools: ['인계초등학교'] },
  ];
  const lines = ['# 학구 판정 대조 기록', '', `실행: ${new Date().toISOString().slice(0, 10)}  /  기준: 학구도안내서비스 2026-11-04 확인값(사람이 화면으로 확인)`, ''];
  for (const c of cases) {
    const r = c.fixed ? { status: 200, body: c.fixed } : await core.handle('geocode', new URLSearchParams({ addr: c.addr }));
    if (r.status !== 200) { ok(false, `${c.addr} 좌표 변환 실패: ${r.body.error}`); continue; }
    const { lat, lng } = r.body;
    const L = locate(lat, lng), e = L.levels.elem.inside, m = L.levels.mid.inside, h = L.levels.high.inside;
    console.log(`\n[${c.addr}] (${lat}, ${lng}) 경계거리 초${L.levels.elem.near}m 중${L.levels.mid.near}m 고${L.levels.high.near}m 확인필요=${L.check}`);
    lines.push(`## ${c.addr}`, `- 좌표(${c.fixed ? c.fixed.src : 'V-World'}): ${lat}, ${lng}`, `- 초등: ${e.map((d) => d.nm).join(', ')} (경계 ${L.levels.elem.near}m) / 중: ${m.map((d) => d.nm).join(', ')} (${L.levels.mid.near}m) / 고: ${h.map((d) => d.nm).join(', ')} (${L.levels.high.near}m)`, `- 확인필요: ${L.check}${L.reasons.length ? ' — ' + L.reasons.join('; ') : ''}`);
    ok(e.length === 1 && e[0].nm === c.elem, `초등 통학구역 = ${c.elem} (판정: ${e.map((d) => d.nm)})`);
    if (c.elemSchools) ok(e[0] && same(e[0].schools.map((s) => s.nm), c.elemSchools), `초등 구역 안 학교 = ${c.elemSchools}`);
    if (c.mid) { ok(m.length === 1 && m[0].nm === c.mid, `중학군 = ${c.mid} (판정: ${m.map((d) => d.nm)})`); ok(m[0] && same(m[0].schools.map((s) => s.nm), c.midSchools), `동부중학군 7개교 일치`); }
    if (c.high) ok(h.length === 1 && h[0].nm === c.high, `고교구역 = ${c.high} (판정: ${h.map((d) => d.nm)})`);
    lines.push('');
  }
  // 연계정보 3: 남부중학군 10개교에 수원중학교 포함, 동부중학군에는 없음
  const dsch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'school', 'sw_district_schools.json'), 'utf8'));
  const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'school', 'sw_judge.json'), 'utf8'));
  const south = J.mid.find((f) => f.nm === '남부중학군'), east = J.mid.find((f) => f.nm === '동부중학군');
  console.log('\n[연계정보]');
  ok(south && dsch[south.id].length === 10, `남부중학군 학교 수 = 10 (실제 ${south && dsch[south.id].length})`);
  ok(south && dsch[south.id].some((s) => s.nm === '수원중학교'), '남부중학군에 수원중학교 포함');
  ok(east && !dsch[east.id].some((s) => s.nm === '수원중학교'), '동부중학군에는 수원중학교 없음');
  lines.push('## 연계정보', `- 남부중학군 ${south && dsch[south.id].length}개교: ${south && dsch[south.id].map((s) => s.nm).join(', ')}`, `- 동부중학군 ${east && dsch[east.id].length}개교: ${east && dsch[east.id].map((s) => s.nm).join(', ')}`, '');
  // 수원교육지원청 통학구역 주소표(2024-10-08)와 동별 초등 판정 대조 (표 파일이 있을 때만; 정보 제공용, 통과/실패에 넣지 않는다)
  const TABLE = path.join(ROOT, '학교', '경기도교육청 경기도수원교육지원청_통합홈페이지_통학구역_20241008.csv'), TABLE_DATE = '2024-10-08';
  if (fs.existsSync(TABLE) && fs.existsSync(path.join(ROOT, 'data', 'school', 'complex_district.json'))) {
    const rowsT = require('../lib/geo').readCsv(TABLE, 'euc-kr').filter((r) => /수원센트럴아이파크자이/.test(r['건물명']));
    const byDong = new Map();
    for (const r of rowsT) {
      const m = r['건물명'].match(/(\d+)동\s*~\s*(\d+)동/);
      const school = r['학교명'].replace(/\(.*\)/, '').trim(), temp = (r['학교명'].match(/\((.*)\)/) || [])[1] || '';
      if (!m) continue;
      for (let n = +m[1]; n <= +m[2]; n++) byDong.set(n + '동', { school, temp, raw: r['학교명'], row: r['건물명'] });
    }
    const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'school', 'complex_district.json'), 'utf8'));
    lines.push(`## 수원교육지원청 통학구역 주소표(기준일 ${TABLE_DATE}) ↔ 동별 초등 판정(학구도 ${C.기준.학구도})`, '', `- 주소표 행(팔달구 인계로 21 / 인계동 847-3): ${rowsT.map((r) => `"${r['건물명']}" → ${r['학교명']}`).join(' ; ')}`, '- 좌표 판정은 한국교육시설안전원 학구도(2026-09-20), 주소표는 수원교육지원청 자료(2024-10-08)로 기준일이 다르다. 임시 통학구역 표기가 있는 행은 비고에 적는다. 불일치는 임의로 맞추지 않고 그대로 표시한다.', '', '| 동 | 주소표 학교 | 좌표 판정(초등) | 일치 | 비고 |', '|---|---|---|---|---|');
    let mis = 0, nf = 0;
    for (const d of C.dongs) {
      const t = byDong.get(d.동), el = d.초등학구.map((x) => x.이름.replace('통학구역', '')).join('/') || '-';
      if (!t) { nf++; lines.push(`| ${d.동} | (주소표에 없음) | ${el} | - | [확인 필요] |`); continue; }
      const same = d.초등학구.length === 1 && el === t.school;
      if (!same) mis++;
      lines.push(`| ${d.동} | ${t.school} | ${el} | ${same ? '일치' : '**불일치**'} | ${[t.temp && `주소표: "${t.raw}"`, !same && '기준일 차이 가능(주소표 2024-10-08 / 학구도 2026-09-20), 교육지원청 확인'].filter(Boolean).join(' · ')} |`);
    }
    lines.push('', `- 주소표 행이 없는 동 ${nf}개, 불일치 ${mis}개 (${C.dongs.filter((d) => { const t = byDong.get(d.동); return t && !(d.초등학구.length === 1 && d.초등학구[0].이름.replace('통학구역', '') === t.school); }).map((d) => d.동).join(', ') || '없음'})`, '');
    console.log(`
[주소표 대조] 불일치 ${mis}개, 주소표 없음 ${nf}개`);
  }
  lines.push(`## 결과: 통과 ${pass} / 실패 ${failN}`, '');
  console.log(`\n통과 ${pass} / 실패 ${failN}`);
  fs.writeFileSync(path.join(ROOT, 'data', 'school', 'verification_auto.md'), lines.join('\n'));
  process.exit(failN ? 1 : 0);
})();
