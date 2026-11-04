// 수원센트럴아이파크자이 101~130동 좌표(카카오 로컬 API) → 동별 학구 판정. 사용: node scripts/build-complex.js
// REST 키는 환경 변수 KAKAO_REST_API_KEY (로컬은 .env). 코드·저장소에 키를 넣지 않는다.
// 좌표는 한 번 받아 data/school/complex_dongs.json 에 저장하고, 다음 실행부터는 저장본을 쓴다(재호출 최소화).
//   --refresh : 저장본을 무시하고 다시 검색
// 출력: complex_dongs.json(좌표) , complex_district.json(동별 판정)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const { locate, NEAR_M, zoneByDong, zoneMatches, zoneTempNote, midPlanFor, ZONE_REASON } = require('../lib/school');
const ZONE_DATE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'school', 'sw_addr_zone_meta.json'), 'utf8')).date;

const COMPLEX = '수원센트럴아이파크자이';
const pickElemSchool = (L) => ((L.levels.elem.inside[0] || {}).schools || []).map((s) => s.nm)[0] || '';
const REP = { 주소: '경기 수원시 팔달구 인계로 21', 위도: 37.2703753379, 경도: 127.0212229456 };   // 단지 대표점: 카카오 주소검색 좌표(2026-11-04). 동을 고르지 않았을 때 판정 기준
const CENTER = { lat: 37.2705, lng: 127.0205, radiusKm: 1.2 };   // 단지 대략 위치(대표 주소 인계동 1173 부근). 이 범위 밖 결과는 확인필요
const DONGS = Array.from({ length: 30 }, (_, i) => 101 + i);
const OUT = path.join(ROOT, 'data', 'school');
const F_DONGS = path.join(OUT, 'complex_dongs.json');
const KEY = process.env.KAKAO_REST_API_KEY;

const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return R * Math.hypot(x, y); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function kakao(pathname, params) {
  const r = await fetch('https://dapi.kakao.com/v2/local/search/' + pathname + '.json?' + new URLSearchParams(params), { headers: { Authorization: 'KakaoAK ' + KEY } });
  if (!r.ok) throw new Error(`카카오 로컬 API ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).documents || [];
}

async function findDong(n) {
  const q = `${COMPLEX} ${n}동`;
  const near = { x: CENTER.lng, y: CENTER.lat, radius: 3000 };
  let docs = await kakao('keyword', { query: q, ...near, size: 15 });
  // 장소명이 "수원센트럴아이파크자이 101동"처럼 단지명+동 번호를 모두 포함하는 것만 인정
  const want = (d) => d.place_name.replace(/\s/g, '').includes(COMPLEX) && new RegExp(`(^|\\D)${n}동`).test(d.place_name.replace(/\s/g, ''));
  let hit = docs.find(want);
  if (hit) return { hit, via: `keyword:${q}` };
  // 못 찾으면 위치 제한 없이 한 번 더
  docs = await kakao('keyword', { query: q, size: 15 });
  hit = docs.find(want);
  if (hit) return { hit, via: `keyword(전국):${q}` };
  return null;
}

(async () => {
  let saved = [];
  try { saved = JSON.parse(fs.readFileSync(F_DONGS, 'utf8')).dongs || []; } catch {}
  if (process.argv.includes('--refresh')) saved = [];
  const have = new Map(saved.filter((d) => d.위도 != null).map((d) => [d.동, d]));
  const dongs = [];
  const todo = DONGS.filter((n) => !have.has(n + '동'));
  if (todo.length && !KEY) {
    console.error('KAKAO_REST_API_KEY 가 없습니다. .env 에 KAKAO_REST_API_KEY=… 를 추가한 뒤 다시 실행하세요.\n(카카오 개발자 콘솔 > 앱 > 앱 키 > REST API 키. JavaScript 키와 다른 값입니다.)');
    process.exit(2);
  }
  for (const n of DONGS) {
    const name = n + '동';
    if (have.has(name)) { dongs.push(have.get(name)); continue; }
    let rec = { 동: name, 위도: null, 경도: null, 출처: '', 장소명: '', 확인필요: true, 사유: '카카오 검색 결과 없음 — 지도에서 좌표를 직접 확인' };
    try {
      const f = await findDong(n);
      if (f) {
        const lat = Number(f.hit.y), lng = Number(f.hit.x), far = km(CENTER.lat, CENTER.lng, lat, lng) > CENTER.radiusKm;
        rec = { 동: name, 위도: lat, 경도: lng, 출처: f.via, 장소명: f.hit.place_name, 주소: f.hit.road_address_name || f.hit.address_name, 확인필요: far, 사유: far ? '단지 예상 위치에서 멀리 떨어진 결과' : '' };
      }
    } catch (e) { rec.사유 = e.message; console.error(name, e.message); }
    dongs.push(rec);
    console.log(name, rec.위도 ?? '-', rec.경도 ?? '-', rec.장소명 || rec.사유);
    await sleep(150);
  }
  // 동마다 좌표가 달라야 한다 (모두 같으면 실패로 간주)
  const found = dongs.filter((d) => d.위도 != null);
  const uniq = new Set(found.map((d) => d.위도.toFixed(5) + ',' + d.경도.toFixed(5))).size;
  if (found.length >= 2 && uniq < Math.ceil(found.length / 2)) { console.error(`실패: 동 좌표가 거의 같습니다(고유 ${uniq}/${found.length}). 단지 대표 지점으로만 잡힌 것으로 보입니다.`); process.exit(3); }
  fs.writeFileSync(F_DONGS, JSON.stringify({ complex: COMPLEX, note: '카카오 로컬 키워드 검색 결과. 확인필요=true 는 사람이 지도에서 좌표를 확인할 것.', dongs }, null, 1));

  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'sw_schools.json'), 'utf8')).meta;
  const rows = dongs.map((d) => {
    if (d.위도 == null) return { 동: d.동, 위도: null, 경도: null, 상태: '확인필요', 확인필요: true, 사유: [d.사유] };
    const L = locate(d.위도, d.경도), pick = (k) => L.levels[k].inside.map((x) => ({ id: x.id, 이름: x.nm, 공동학구: x.joint, 변경일: x.upd, 기준일: x.base, 학교: x.schools.map((s) => s.nm) }));
    const dists = ['elem', 'mid', 'high'].map((k) => L.levels[k].near).filter((v) => v != null);
    // 수원교육지원청 통학구역 주소표(초등)와 비교. 다르면 확인필요로만 올리고 좌표 판정은 바꾸지 않는다.
    const zr = zoneByDong(COMPLEX, Number(d.동.replace('동', '')));
    const zMatch = zr ? zoneMatches(zr, L.levels.elem.inside) : null;
    const 주소표 = zr ? { 기준일: ZONE_DATE, 학교: [...new Set(zr.map((r) => r.school))], 임시표기: zr.some((r) => r.temp), 건물명: zr[0].building, 일치: zMatch, 비고: zoneTempNote(zr, L.levels.elem.inside) } : { 기준일: ZONE_DATE, 학교: [], 일치: null };
    const mp = midPlanFor(pickElemSchool(L),L.levels.mid.inside.map((x) => x.nm));   // 개정안 표 기준 비고만 (상태·판정은 그대로)
    const check = L.check || d.확인필요 || zMatch === false, why = [...L.reasons, ...(zMatch === false ? [`초등 통학구역: ${ZONE_REASON(ZONE_DATE)}`] : []), ...(mp && mp.사유 ? [mp.사유] : []), ...(d.확인필요 && d.사유 ? [d.사유] : [])];
    return { 동: d.동, 위도: d.위도, 경도: d.경도, 초등학구: pick('elem'), 중학구: pick('mid'), 고교구역: pick('high'), 주소표, 중학군_개정안: mp, 경계거리_m: { 초등: L.levels.elem.near, 중: L.levels.mid.near, 고: L.levels.high.near, 최소: dists.length ? Math.min(...dists) : null }, 상태: check ? '확인필요' : '확정', 확인필요: check, 사유: why };
  });
  fs.writeFileSync(path.join(OUT, 'complex_district.json'), JSON.stringify({ complex: COMPLEX, 기준: { 학구도: meta.baseDate, 확인필요_경계거리_m: NEAR_M, 주소표: ZONE_DATE }, 대표점: REP, dongs: rows }, null, 1));
  const c = rows.filter((r) => r.확인필요).length;
  console.log(`\n동 ${rows.length}개 중 좌표 확보 ${found.length}, 확인필요 ${c}`);
  for (const r of rows) if (r.초등학구) console.log(r.동, r.초등학구.map((x) => x.이름).join('/'), r.중학구.map((x) => x.이름).join('/'), r.고교구역.map((x) => x.이름).join('/'), '최소경계', r.경계거리_m.최소 + 'm', r.상태);
})();
