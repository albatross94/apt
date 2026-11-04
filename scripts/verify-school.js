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
  // 수원교육지원청 통학구역 주소표(data/school/sw_addr_zone.json)와 동별 초등 판정 대조. 불일치는 통과/실패에 넣지 않고 그대로 표시한다(확인필요로만 올림).
  const { zoneByDong, zoneMatches, ZONE_REASON } = require('../lib/school');
  const zmeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'school', 'sw_addr_zone_meta.json'), 'utf8'));
  const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'school', 'complex_district.json'), 'utf8'));
  lines.push(`## 수원교육지원청 통학구역 주소표(기준일 ${zmeta.date}) ↔ 동별 초등 판정(학구도 ${C.기준.학구도})`, '', '- 주소표: 수원센트럴아이파크자이(팔달구 인계로 21 / 인계동 847-3). 좌표 판정은 학구도(2026-09-20), 주소표는 수원교육지원청 자료로 기준일이 다르다.', `- 불일치는 좌표 판정을 덮어쓰지 않고 확인필요로만 올린다. 사유 문구: "${ZONE_REASON(zmeta.date)}". 임시 통학구역 표기가 있는 행은 비고에 적는다.`, '', '| 동 | 주소표 학교 | 좌표 판정(초등) | 일치 | 상태(화면) | 비고 |', '|---|---|---|---|---|---|');
  let mis = 0, nf = 0, misUp = 0;
  const misList = [];
  for (const d of C.dongs) {
    const rowsZ = zoneByDong('수원센트럴아이파크자이', Number(d.동.replace('동', '')));
    const el = d.초등학구.map((x) => x.이름.replace('통학구역', '')).join('/') || '-';
    if (!rowsZ) { nf++; lines.push(`| ${d.동} | (주소표에 없음) | ${el} | - | ${d.상태} | [확인 필요] |`); continue; }
    const same = zoneMatches(rowsZ, d.초등학구.map((x) => ({ schools: x.학교.map((nm) => ({ nm, lv: '초등' })) })));
    if (!same) { mis++; misList.push(d.동); if (d.상태 === '확인필요') misUp++; }
    const raw = rowsZ.map((r) => r.school + (r.temp ? '(임시 통학구역 표기)' : '')).join(', ');
    lines.push(`| ${d.동} | ${raw} | ${el} | ${same ? '일치' : '**불일치**'} | ${d.상태} | ${[!same && ZONE_REASON(zmeta.date), rowsZ.some((r) => r.temp) && '주소표에 임시 통학구역 표기(매교초 개교 전)'].filter(Boolean).join(' · ')} |`);
  }
  lines.push('', `- 주소표 행이 없는 동 ${nf}개, 불일치 ${mis}개 (${misList.join(', ') || '없음'}), 불일치 중 화면 상태가 확인필요인 동 ${misUp}개`, '');
  ok(misUp === mis, `주소표와 다른 동은 모두 화면에서 확인필요 (${misUp}/${mis})`);
  console.log(`\n[주소표 대조] 불일치 ${mis}개(${misList.join(',')}), 주소표 없음 ${nf}개`);
  // 주소표의 "매교초 개교 전 임시" 행 ↔ 학구도 좌표 판정 (build-maegyo-check.js 가 만든 maegyo_check.json 사용)
  const mf = path.join(ROOT, 'data', 'school', 'maegyo_check.json');
  if (fs.existsSync(mf)) {
    const M = JSON.parse(fs.readFileSync(mf, 'utf8'));
    lines.push(`## 주소표 "매교초 개교 전 임시" 행(기준일 ${M.기준.주소표}) ↔ 학구도(${M.기준.학구도}) 좌표 판정`, '', `- 추출 조건: 주소표 학교명에 "매교초 개교" 또는 "임시"가 들어간 행 — **${M.rows.length}건**. 좌표 출처: ${M.기준.좌표출처}(건물 중심 여부 미확인, 경계 근처는 핀 위치에 따라 결과가 달라질 수 있음).`, '', '| 지번 | 도로명 | 건물명 | 학교명(주소표) |', '|---|---|---|---|');
    for (const r of M.rows) lines.push(`| ${r.지번} | ${r.도로명} | ${r.건물명} | ${r.학교명} |`);
    lines.push('', '단지별 요약 (판정이 매교초통학구역인 비율):', '', '| 단지 | 주소표 행 수 | 동 수 | 좌표 있음 | 좌표 없음 | 판정 = 매교초통학구역 | 비율(좌표 있는 동 기준) | 경계 최소거리(m) |', '|---|---|---|---|---|---|---|---|');
    const groups = new Map();
    for (const r of M.rows) { const k = r.건물명.replace(/\s*\d+동.*$/, ''); (groups.get(k) || groups.set(k, []).get(k)).push(r); }
    for (const [k, rs] of groups) {
      const ds = rs.flatMap((r) => r.dongs), has = ds.filter((d) => d.좌표), yes = has.filter((d) => d.매교초);
      const mn = has.length ? Math.min(...has.map((d) => d.경계m)).toFixed(1) : '-';
      lines.push(`| ${k} | ${rs.length} | ${ds.length} | ${has.length} | ${ds.length - has.length}${ds.length - has.length ? ' (좌표 없음)' : ''} | ${yes.length} | ${has.length ? `${(yes.length / has.length * 100).toFixed(0)}% (${yes.length}/${has.length})` : '-'} | ${mn} |`);
    }
    lines.push('', '주소표 행(동 범위)별 판정:', '', '| 건물명 | 주소표 학교 | 동 수 | 좌표 있음 | 판정 = 매교초통학구역 | 비율 | 경계 최소거리(m) |', '|---|---|---|---|---|---|---|');
    for (const r of M.rows) {
      const has = r.dongs.filter((d) => d.좌표), yes = has.filter((d) => d.매교초);
      lines.push(`| ${r.건물명} | ${r.학교명} | ${r.dongs.length} | ${has.length} | ${yes.length} | ${has.length ? `${(yes.length / has.length * 100).toFixed(0)}%` : '-'} | ${has.length ? Math.min(...has.map((d) => d.경계m)).toFixed(1) : '-'} |`);
    }
    lines.push('', '동별 상세:', '', '| 단지 | 동 | 위도 | 경도 | 학구도 판정(초등) | 경계까지(m) | 주소표 학교 | 판정=매교초 |', '|---|---|---|---|---|---|---|---|');
    for (const r of M.rows) {
      for (const d of r.dongs) {
        lines.push(d.좌표
          ? `| ${r.건물명.replace(/\s*\d+동.*$/, '')} | ${d.동} | ${d.위도} | ${d.경도} | ${d.판정} | ${d.경계m} | ${r.주소표학교} | ${d.매교초 ? '예' : '아니오'} |`
          : `| ${r.건물명.replace(/\s*\d+동.*$/, '')} | ${d.동} | 좌표 없음 | 좌표 없음 | - | - | ${r.주소표학교} | - |`);
      }
    }
    lines.push('');
  }
  lines.push(`## 결과: 통과 ${pass} / 실패 ${failN}`, '');
  console.log(`\n통과 ${pass} / 실패 ${failN}`);
  fs.writeFileSync(path.join(ROOT, 'data', 'school', 'verification_auto.md'), lines.join('\n'));
  process.exit(failN ? 1 : 0);
})();
