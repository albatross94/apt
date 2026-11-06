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
/* ---------- 2027학년도 중학군 개정(안) 교차 검증 (확정 아님, 개정안 표 기준 비고만. 좌표 판정·상태를 바꾸지 않는다) ---------- */
const PLAN_SRC = '수원교육지원청 2027학년도 중학군 및 중학구 개정(안)';
const TONGBAN_SRC = '수원시 통·반 설치 조례 별표 2(2026-08-18 시행본, 이후 개정 여부 미확인)';
const TONGBAN_CITE = '조례 별표 2, 2026-08-18 시행본';
const sE = (n) => String(n).replace(/등학교$/, ''), sM = (n) => String(n).replace(/중학군$/, '');

// 통·반 조례 자료(선택적, data/school/complex_tongban.json): 예외 문구("OO통 A~B반, …")가 특정 단지·동에 적용되는지 확인
function tongbanFile() { try { return load('complex_tongban.json'); } catch { return null; } }
// "인계동 53통 1~2반, 54통 1~3반" → [{통:53,반:[1,2]}, {통:54,반:[1,2,3]}]
function parseTongbanRanges(text) {
  const out = []; const re = /(\d+)\s*통\s*(\d+)(?:\s*[~\-]\s*(\d+))?\s*반/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const tong = +m[1], from = +m[2], to = m[3] ? +m[3] : from, ban = [];
    for (let b = from; b <= to; b++) ban.push(b);
    out.push({ 통: tong, 반: ban });
  }
  return out;
}
// 단지의 특정 동이 예외 통·반 범위에 드는지. complex_tongban.json이 그 단지 걸로 없으면 null(알 수 없음 — 기존처럼 "확인 필요"로 둔다)
function tongbanConfirm(complex, dongNo, regionText) {
  const T = tongbanFile();
  if (!T || T.complex !== complex || !dongNo) return null;
  const assigns = T.동별_통반[dongNo + '동'];
  if (!assigns) return null;
  const ranges = parseTongbanRanges(regionText);
  if (!ranges.length) return null;
  return assigns.some((a) => ranges.some((r) => r.통 === a.통 && r.반.includes(a.반)));
}
function midPlanFor(school, curMid, ctx) {   // school: 초등학교 이름, curMid: 학구도 좌표 판정 중학군 이름들, ctx: { complex, dongNo } (통·반 예외 확인용, 선택)
  const es = (load('sw_mid_plan2027.json').초등학교_중학군[school]) || [];
  if (!es.length) return null;
  const main = es.filter((e) => e.종류 === '원칙' || e.지역 === '그 밖의 지역(원칙)').map((e) => e.중학군);
  const exc = es.filter((e) => e.종류 !== '원칙' && e.지역 && e.지역 !== '그 밖의 지역(원칙)').map((e) => ({ 중학군: e.중학군, 지역: e.지역 }));
  const cur = curMid.join(', ') || '[확인 필요]';
  const cmp = main.some((m) => curMid.includes(m)) ? '일치' : exc.some((x) => curMid.includes(x.중학군)) ? '예외 지역 해당 시에만 일치' : '불일치';
  const excTxt = exc.map((x) => `${x.지역.replace(/,\s*/g, '·')}은 ${sM(x.중학군)}`).join(', ');
  // 통·반 자료로 "이 동이 예외 범위에 드는지"를 확인할 수 있으면 확정 문구를 쓰고, 그렇지 않으면 기존처럼 확인 필요로 둔다
  const confirmed = cmp === '예외 지역 해당 시에만 일치' && ctx
    ? exc.find((x) => curMid.includes(x.중학군) && tongbanConfirm(ctx.complex, ctx.dongNo, x.지역))
    : null;
  let 비고, 사유;
  if (cmp === '일치') {
    비고 = `개정안(2027, 확정 아님): ${main.join(', ')} 일치${exc.length ? ` (통·반 예외 있음: ${excTxt}. 해당 여부 확인 필요)` : ''}`;
    사유 = '';
  } else if (confirmed) {
    비고 = `개정안(2027, 확정 아님)의 예외 통·반(${confirmed.지역.replace(/,\s*/g, '·')})에 해당(${TONGBAN_CITE} 기준), 학구도 ${confirmed.중학군}과 일치.`;
    사유 = '';
  } else {
    비고 = `중학군 교차검증(${PLAN_SRC}, 확정 아님): 표상 ${sE(school)}=${main.join('·')}${exc.length ? `(${excTxt})` : ''}, 현재 학구도는 ${cur}. 통·반 해당 여부 확인 필요.`;
    사유 = `중학군: 개정안 표 기준 ${sE(school)}=${main.map(sM).join('·')}${exc.length ? ', 일부 통반 예외' : ''} (2027학년도, 확정 아님)`;
  }
  return { 출처: PLAN_SRC, 확정: false, 학년도: 2027, 초등: school, 개정안: { 원칙: main, 예외: exc }, 현재: curMid, 비교: cmp, 비고, 사유 };
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
  if (kind === 'schools') return { status: 200, body: { ...load('sw_schools.json'), nearM: NEAR_M, addrZone: load('sw_addr_zone_meta.json'), midPlan: { 출처: PLAN_SRC, 상태: '확정 아님', 학년도: 2027, 파일기준일: '미확인', 게시일: '미확인', 통반출처: TONGBAN_SRC }, district: load('sw_district_schools.json') }, maxAge: DAY };
  if (kind === 'complex') {
    const f = path.join(DIR, 'complex_district.json');
    if (!fs.existsSync(f)) return fail(404, '단지 동별 판정 자료가 아직 없습니다.');
    return { status: 200, body: load('complex_district.json'), maxAge: DAY };
  }
  if (kind === 'tongban') {
    const f = path.join(DIR, 'complex_tongban.json');
    if (!fs.existsSync(f)) return fail(404, '단지 동별 통·반 자료가 아직 없습니다.');
    return { status: 200, body: load('complex_tongban.json'), maxAge: DAY };
  }
  if (kind === 'zones') {
    const f = path.join(DIR, 'namb_zones.geojson');
    if (!fs.existsSync(f)) return fail(404, '구역 레이어 자료가 아직 없습니다.');
    return { status: 200, body: load('namb_zones.geojson'), maxAge: DAY };
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

module.exports = { schoolRoute, locate, zoneByDong, zoneMatches, zoneTempNote, midPlanFor, PLAN_SRC, TONGBAN_SRC, zoneByAddress, ZONE_REASON, NEAR_M, LEVELS };
