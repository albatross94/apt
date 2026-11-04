// 학교검색 탭 서버 로직: 좌표 → 초등 통학구역·중학군·고교구역 판정 (원본 정밀도 경계, 투영좌표 m 기준)
// 자료는 scripts/build-school.js 가 data/school/ 에 만든다. 공개 폴더가 아니므로 /api/school 로만(로그인 후) 나간다.
const fs = require('fs');
const path = require('path');
const g = require('./geo');

const DIR = path.join(__dirname, '..', 'data', 'school');
const COMPLEX = '수원센트럴아이파크자이';
const NEAR_M = 60;   // 경계에서 이 거리 이내면 "확인필요" (초등·중학군·고교 중 하나라도 해당하면). 기준을 바꿀 땐 이 상수 하나만 고친다
const cache = {};
const load = (name) => cache[name] || (cache[name] = JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')));

const LEVELS = { elem: '초등 통학구역', mid: '중학군', high: '고교구역' };

// 한 층(elem|mid|high)에서 좌표가 속한 학구들과, 가장 가까운 경계까지의 거리
function locateLayer(layer, x, y) {
  const J = load('sw_judge.json'), dsch = load('sw_district_schools.json');
  const inside = [], neighbors = [];
  let near = Infinity;
  for (const f of J[layer]) {
    const [x0, y0, x1, y1] = f.bbox;
    const inBox = x >= x0 - 200 && x <= x1 + 200 && y >= y0 - 200 && y <= y1 + 200;   // 가까운 경계 거리만 보면 되므로 여유를 둔다
    if (!inBox) continue;
    const isIn = x >= x0 && x <= x1 && y >= y0 && y <= y1 && g.inPoly(x, y, f.rings);
    const d = g.distBoundary(x, y, f.rings);
    if (d < near) near = d;
    const row = { id: f.id, nm: f.nm, joint: f.gb === '1', upd: f.upd, base: f.base, schools: dsch[f.id] || [], dist: Math.round(d * 10) / 10 };
    if (isIn) inside.push(row);
    else if (d <= NEAR_M) neighbors.push({ ...row, why: 'near' });   // 경계 맞은편 후보: 경계 NEAR_M 이내의 다른 학구
  }
  neighbors.sort((a, b) => a.dist - b.dist);
  return { inside, neighbors, near: near === Infinity ? null : Math.round(near * 10) / 10 };
}

/* ---------- 수원교육지원청 통학구역 주소표 (초등 교차 검증용, 좌표 판정을 덮어쓰지 않는다) ---------- */
const nospace = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '');
const shortName = (s) => String(s || '').replace(/초등학교$/, '초').replace(/통학구역$/, '').replace(/\s+/g, '');
let zoneIdx = null;
function zone() {
  if (zoneIdx) return zoneIdx;
  const Z = load('sw_addr_zone.json'), byLot = new Map(), byRoad = new Map(), blds = [];
  const add = (m, k, v) => { if (!k) return; (m.get(k) || m.set(k, []).get(k)).push(v); };
  for (const [area, list] of Object.entries(Z.areas)) {
    const gu = area.split(' ')[0];
    for (const [lot, road, bld, si, tmp] of list) {
      const row = { school: Z.schools[si], building: bld, temp: !!tmp };
      if (area) add(byLot, nospace(area + lot), row); else add(byLot, nospace(lot), row);
      if (road) add(byRoad, nospace(/구\s/.test(road) ? road : gu + road), row);
      if (bld) blds.push({ b: nospace(bld), ...row });
    }
  }
  return (zoneIdx = { date: Z.meta.date, byLot, byRoad, blds });
}
// 카카오 주소 문자열(지번 또는 도로명)로 주소표 행을 찾는다. 못 찾으면 null.
function zoneByAddress(jibun, road) {
  const Z = zone(), cut = (s) => nospace(String(s || '').replace(/^.*?수원시/, ''));
  for (const [s, m] of [[jibun, Z.byLot], [road, Z.byRoad]]) {
    const hit = s && m.get(cut(s));
    if (hit) return dedupe(hit);
  }
  return null;
}
function dedupe(rows) {
  const seen = new Set();
  return rows.filter((r) => { const k = r.school + '|' + r.building + '|' + r.temp; if (seen.has(k)) return false; seen.add(k); return true; });
}
// 단지명 + 동 번호("수원센트럴아이파크자이" 101) → "101동~105동" 같은 범위 행
function zoneByDong(complex, dongNo) {
  const c = nospace(complex);
  const rows = zone().blds.filter((r) => {
    if (!r.b.includes(c)) return false;
    const m = r.b.match(/(\d+)동~(\d+)동/);
    if (m) return dongNo >= +m[1] && dongNo <= +m[2];
    return new RegExp('(^|\\D)' + dongNo + '동').test(r.b);
  });
  return rows.length ? dedupe(rows.map(({ school, building, temp }) => ({ school, building, temp }))) : null;
}
// 좌표 판정의 초등 학교들과 주소표 학교가 하나라도 겹치는지
function zoneMatches(rows, elemInside) {
  const mine = new Set(elemInside.flatMap((d) => d.schools.filter((s) => s.lv === '초등').map((s) => shortName(s.nm))));
  return rows.some((r) => mine.has(shortName(r.school)));
}
const ZONE_REASON = (date) => `주소표(${date})와 다름, 기준일 차이 가능`;
// 주소표가 "매교초 개교 전 임시"로 표기한 행(임시표기=1)에 붙이는 비고. 임시 표기 행 전체에 같은 문구 규칙을 쓴다.
const ZONE_UPDATED = '2024-12-16';   // 주소표 갱신 표기일 (자료 기준일 sw_addr_zone_meta.date 와 별개)
function zoneTempNote(rows, elemInside) {
  if (!rows || !rows.some((r) => r.temp)) return '';
  const base = elemInside.length ? elemInside[0].base : '';
  const judged = elemInside.length ? elemInside.map((d) => d.nm).join(', ') : '[확인 필요]';
  return `주소표(${ZONE_UPDATED} 갱신)는 '매교초 개교 전 임시 통학구역'으로 표기, 현재 학구도(${base})는 ${judged}. 교육지원청 확인 필요.`;
}

// 확인필요 규칙: 경계 NEAR_M 이내, 공동학구, 두 곳 이상에 동시에 듦, 어느 학구에도 안 듦, 초등이 주소표와 다름
function locate(lat, lng, addr) {
  const [x, y] = g.toTM(lat, lng);
  const out = { lat, lng, levels: {}, check: false, reasons: [] };
  for (const k of Object.keys(LEVELS)) {
    const r = locateLayer(k, x, y), L = LEVELS[k];
    out.levels[k] = r;
    if (!r.inside.length) { out.check = true; out.reasons.push(`${L}: 해당 학구를 찾지 못함`); continue; }
    if (r.inside.length > 1) { out.check = true; out.reasons.push(`${L}: 여러 학구에 동시에 포함`); }
    if (r.inside.some((d) => d.joint)) { out.check = true; out.reasons.push(`${L}: 공동학구`); }
    if (r.near != null && r.near <= NEAR_M) { out.check = true; out.reasons.push(`${L}: 경계까지 약 ${Math.round(r.near)}m (${NEAR_M}m 이내)`); }
  }
  if (addr && (addr.dong || addr.jibun || addr.road)) {
    const rows = addr.dong ? zoneByDong(COMPLEX, addr.dong) : zoneByAddress(addr.jibun, addr.road), date = zone().date;
    if (!rows) out.addrZone = { date, found: false };
    else {
      const match = out.levels.elem.inside.length ? zoneMatches(rows, out.levels.elem.inside) : null;
      out.addrZone = { date, found: true, rows, match, tempNote: zoneTempNote(rows, out.levels.elem.inside) };
      if (match === false) {
        out.check = true; out.reasons.push(`초등 통학구역: ${ZONE_REASON(date)}`);
        // 주소표 학교가 속한 초등 통학구역도 경계 맞은편 후보로 보여 준다(좌표 판정은 그대로)
        const want = new Set(rows.map((r) => shortName(r.school))), E = out.levels.elem, J = load('sw_judge.json'), dsch = load('sw_district_schools.json');
        for (const f of J.elem) {
          if (E.inside.some((d) => d.id === f.id) || E.neighbors.some((d) => d.id === f.id)) continue;
          const sch = dsch[f.id] || [];
          if (sch.some((x) => want.has(shortName(x.nm)))) E.neighbors.push({ id: f.id, nm: f.nm, joint: f.gb === '1', upd: f.upd, base: f.base, schools: sch, dist: Math.round(g.distBoundary(x, y, f.rings) * 10) / 10, why: 'zone' });
        }
      }
    }
  }
  return out;
}

const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });
const DAY = 86400;

// GET /api/school?kind=meta|geo|schools|locate|complex
async function schoolRoute(p) {
  const kind = p.get('kind') || '';
  if (kind === 'meta') return { status: 200, body: { ...load('sw_schools.json').meta, nearM: NEAR_M, levels: LEVELS }, maxAge: DAY };
  if (kind === 'geo') {
    const lv = p.get('level');
    if (!LEVELS[lv]) return fail(400, '잘못된 파라미터입니다.');
    return { status: 200, body: load(`sw_${lv}.geojson`), maxAge: DAY };
  }
  if (kind === 'schools') return { status: 200, body: { ...load('sw_schools.json'), nearM: NEAR_M, addrZone: load('sw_addr_zone_meta.json'), district: load('sw_district_schools.json') }, maxAge: DAY };
  if (kind === 'complex') {
    const f = path.join(DIR, 'complex_district.json');
    if (!fs.existsSync(f)) return fail(404, '단지 동별 판정 자료가 아직 없습니다.');
    return { status: 200, body: load('complex_district.json'), maxAge: DAY };
  }
  if (kind === 'locate') {
    const lat = Number(p.get('lat')), lng = Number(p.get('lng'));
    if (!(lat > 37 && lat < 37.6 && lng > 126.8 && lng < 127.3)) return fail(400, '수원시 안의 좌표만 판정할 수 있습니다.');
    const cl = (k) => String(p.get(k) || '').slice(0, 120);
    const dong = /^\d{3}$/.test(p.get('dong') || '') ? Number(p.get('dong')) : 0;
    return { status: 200, body: locate(lat, lng, { jibun: cl('jibun'), road: cl('road'), dong }), maxAge: 0 };
  }
  return fail(400, '잘못된 파라미터입니다.');
}

module.exports = { schoolRoute, locate, zoneByDong, zoneMatches, zoneTempNote, zoneByAddress, ZONE_REASON, NEAR_M, LEVELS };
