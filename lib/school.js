// 학교검색 탭 서버 로직: 좌표 → 초등 통학구역·중학군·고교구역 판정 (원본 정밀도 경계, 투영좌표 m 기준)
// 자료는 scripts/build-school.js 가 data/school/ 에 만든다. 공개 폴더가 아니므로 /api/school 로만(로그인 후) 나간다.
const fs = require('fs');
const path = require('path');
const g = require('./geo');

const DIR = path.join(__dirname, '..', 'data', 'school');
const NEAR_M = 60;   // 경계에서 이 거리 이내면 "확인필요" (초등·중학군·고교 중 하나라도 해당하면). 기준을 바꿀 땐 이 상수 하나만 고친다
const cache = {};
const load = (name) => cache[name] || (cache[name] = JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')));

const LEVELS = { elem: '초등 통학구역', mid: '중학군', high: '고교구역' };

// 한 층(elem|mid|high)에서 좌표가 속한 학구들과, 가장 가까운 경계까지의 거리
function locateLayer(layer, x, y) {
  const J = load('sw_judge.json'), dsch = load('sw_district_schools.json');
  const inside = [];
  let near = Infinity;
  for (const f of J[layer]) {
    const [x0, y0, x1, y1] = f.bbox;
    const inBox = x >= x0 - 200 && x <= x1 + 200 && y >= y0 - 200 && y <= y1 + 200;   // 가까운 경계 거리만 보면 되므로 여유를 둔다
    if (!inBox) continue;
    const isIn = x >= x0 && x <= x1 && y >= y0 && y <= y1 && g.inPoly(x, y, f.rings);
    const d = g.distBoundary(x, y, f.rings);
    if (d < near) near = d;
    if (isIn) inside.push({ id: f.id, nm: f.nm, joint: f.gb === '1', upd: f.upd, base: f.base, schools: dsch[f.id] || [], dist: Math.round(d * 10) / 10 });
  }
  return { inside, near: near === Infinity ? null : Math.round(near * 10) / 10 };
}

// 확인필요 규칙: 경계 NEAR_M 이내, 공동학구, 두 곳 이상에 동시에 듦, 어느 학구에도 안 듦
function locate(lat, lng) {
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
  if (kind === 'schools') return { status: 200, body: { ...load('sw_schools.json'), nearM: NEAR_M, district: load('sw_district_schools.json') }, maxAge: DAY };
  if (kind === 'complex') {
    const f = path.join(DIR, 'complex_district.json');
    if (!fs.existsSync(f)) return fail(404, '단지 동별 판정 자료가 아직 없습니다.');
    return { status: 200, body: load('complex_district.json'), maxAge: DAY };
  }
  if (kind === 'locate') {
    const lat = Number(p.get('lat')), lng = Number(p.get('lng'));
    if (!(lat > 37 && lat < 37.6 && lng > 126.8 && lng < 127.3)) return fail(400, '수원시 안의 좌표만 판정할 수 있습니다.');
    return { status: 200, body: locate(lat, lng), maxAge: 0 };
  }
  return fail(400, '잘못된 파라미터입니다.');
}

module.exports = { schoolRoute, locate, NEAR_M, LEVELS };
