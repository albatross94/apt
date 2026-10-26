// 데이터 처리 공통 로직: 공공데이터포털(실거래가) + V-World(주소 검색, 공동주택가격)
// 로컬 서버(server.js)와 Vercel 서버리스 함수(api/*.js)가 같이 쓴다. 외부 의존성 없음.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const auth = require('./auth');

// 캐시 위치: 로컬은 ./cache, Vercel은 쓰기 가능한 /tmp (함수 인스턴스가 살아 있는 동안만 유지).
// 영구 캐시는 응답의 Cache-Control(s-maxage)로 Vercel CDN이 맡는다.
const CACHE_DIR = process.env.CACHE_DIR
  || (process.env.VERCEL ? path.join(os.tmpdir(), 'apt-cache') : path.join(__dirname, '..', 'cache'));
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

const DAY = 24 * 3600;   // 초
const readJson = (f, maxAgeSec) => {
  try {
    if (maxAgeSec == null || Date.now() - fs.statSync(f).mtimeMs < maxAgeSec * 1000) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  return null;
};
const writeJson = (f, obj) => { try { fs.writeFileSync(f, JSON.stringify(obj)); } catch {} };   // 읽기 전용 환경이어도 동작은 계속
const currentYM = () => { const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`; };
const keyHint = (name) => `${name}가 설정되지 않았습니다 (로컬은 .env 파일, Vercel은 프로젝트 환경 변수에 추가하세요).`;

/* ---------- 아파트 매매·전월세 실거래가 (공공데이터포털) ---------- */
const TRADE_API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const RENT_API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
const RENT_TAGS = {
  aptNm: 'apt', umdNm: 'dong', jibun: 'jibun', excluUseAr: 'area', dealYear: 'y',
  dealMonth: 'm', dealDay: 'd', deposit: 'price', monthlyRent: 'rent', floor: 'floor', buildYear: 'built',
  contractType: 'gbn',
};
const TAGS = {
  aptNm: 'apt', umdNm: 'dong', jibun: 'jibun', excluUseAr: 'area', dealYear: 'y',
  dealMonth: 'm', dealDay: 'd', dealAmount: 'price', floor: 'floor', buildYear: 'built',
  dealingGbn: 'gbn', cdealType: 'canceled', cdealDay: 'cancelDay', sggCd: 'sgg',
};

function parseItems(xml, rent) {
  const code = (xml.match(/<resultCode>(.*?)<\/resultCode>/) || [])[1];
  if (code && code !== '000' && code !== '00') {
    const msg = (xml.match(/<resultMsg>(.*?)<\/resultMsg>/) || [])[1] || '';
    throw new Error(`API 오류 ${code}: ${msg}`);
  }
  if (!code && /<returnAuthMsg>/.test(xml)) {
    throw new Error('API 인증 오류: ' + xml.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)[1]);
  }
  const total = Number((xml.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || 0);
  const items = [];
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const o = {};
    for (const [src, dst] of Object.entries(rent ? RENT_TAGS : TAGS)) {
      const v = (body.match(new RegExp(`<${src}>([\\s\\S]*?)</${src}>`)) || [])[1];
      o[dst] = v === undefined ? '' : v.trim();
    }
    const item = {
      apt: o.apt, dong: o.dong, jibun: o.jibun, area: Number(o.area),
      date: `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`,
      price: Number(o.price.replace(/,/g, '')), floor: Number(o.floor), built: Number(o.built), gbn: o.gbn,
      canceled: o.canceled === 'O',
    };
    // 전월세: price = 보증금, rent = 월세(0이면 전세). 전월세 자료에는 해제 거래가 없다
    if (rent) item.rent = Number(o.rent.replace(/,/g, '')) || 0;
    items.push(item);
  }
  return { total, items };
}

async function fetchMonth(lawd, ym, rent) {
  const file = path.join(CACHE_DIR, `${rent ? 'rent_' : ''}${lawd}_${ym}.json`);
  // 지난 달 데이터는 변하지 않으므로 영구 캐시, 이번 달은 1시간만 캐시
  const hit = readJson(file, ym === currentYM() ? 3600 : null);
  if (hit) return hit;
  // 전월세는 RENT_SERVICE_KEY 가 있으면 그것을, 없으면 SERVICE_KEY 를 쓴다
  const key = (rent && process.env.RENT_SERVICE_KEY) || process.env.SERVICE_KEY;
  if (!key) throw new Error(keyHint('SERVICE_KEY'));
  const all = [];
  for (let page = 1; ; page++) {
    // 포털에서 복사한 키가 이미 인코딩된 경우(%)와 디코딩된 경우 모두 처리
    const k = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
    const res = await fetch(`${rent ? RENT_API : TRADE_API}?serviceKey=${k}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000`);
    const { total, items } = parseItems(await res.text(), rent);
    all.push(...items);
    if (all.length >= total || items.length === 0) break;
  }
  writeJson(file, all);
  return all;
}

function monthsBetween(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(4));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(4));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/* ---------- 공동주택 공시가격 (V-World NED API) ---------- */
const VW = 'https://api.vworld.kr';
const NED = `${VW}/ned/data/getApartHousingPriceAttr`;

// VWORLD_KEY 를 사용. 오류 메시지에 키가 섞여 나가지 않도록 가린다.
async function vwFetch(url, params) {
  const key = process.env.VWORLD_KEY;
  if (!key) throw new Error(keyHint('VWORLD_KEY'));
  const u = new URL(url);
  for (const [k, v] of Object.entries({ key, format: 'json', ...params })) u.searchParams.set(k, v);
  // 네트워크 오류·타임아웃·5xx 는 일시적일 수 있어 간격을 늘려가며 재시도한다
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      try { return JSON.parse(text); } catch {}
      lastErr = new Error(`V-World 응답을 해석할 수 없습니다 (HTTP ${res.status}): ${text.slice(0, 120).split(key).join('<KEY>')}`);
      if (res.status < 500) throw lastErr;
    } catch (e) {
      if (e === lastErr) throw e;
      const why = (e.cause && (e.cause.code || e.cause.message)) || e.name;   // fetch failed 의 실제 원인
      lastErr = new Error(`V-World 연결 실패 (${e.message}: ${why})`);
    }
  }
  throw lastErr;
}

// 주소(시도 시군구 법정동 지번) → PNU(필지고유번호 19자리). 시도명이 안 맞으면 시도를 빼고 한 번 더 시도한다.
async function resolvePnu(addr) {
  const f = path.join(CACHE_DIR, `pnu_${crypto.createHash('md5').update(addr).digest('hex')}.json`);
  const hit = readJson(f);
  if (hit) return hit;
  const tokens = addr.split(/\s+/);
  for (const query of [addr, tokens.slice(1).join(' ')]) {
    if (!query) continue;
    const j = await vwFetch(`${VW}/req/search`, {
      service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', size: '1', page: '1',
      query, type: 'address', category: 'parcel',
    });
    const st = j.response && j.response.status;
    if (st === 'ERROR') throw new Error('V-World 오류: ' + JSON.stringify(j.response.error || j.response));
    const it = st === 'OK' && j.response.result.items[0];
    // V-World는 비슷한 주소를 대신 돌려주는 경우가 있어, 요청한 법정동·지번으로 끝나는 필지만 인정한다
    if (it && it.address.parcel.endsWith(tokens.slice(-2).join(' '))) {
      const out = { pnu: it.id, address: it.address.parcel, bldnm: it.address.bldnm || '' };
      writeJson(f, out);
      return out;
    }
  }
  return null;
}

async function nedPage(pnu, year, page, rows) {
  const j = await vwFetch(NED, { pnu, stdrYear: String(year), numOfRows: String(rows), pageNo: String(page) });
  const r = j.apartHousingPrices || j.response;
  if (!r || r.status === 'ERROR' || r.error || r.totalCount === undefined) {
    throw new Error('V-World 공시가격 오류: ' + JSON.stringify(j).slice(0, 200));
  }
  return { total: Number(r.totalCount || 0), field: r.field || [] };
}

// 공시가격이 존재하는 연도 목록 (연도별 1건만 요청해 건수 확인)
async function gongsiYears(pnu) {
  const f = path.join(CACHE_DIR, `ned_years_${pnu}.json`);
  const hit = readJson(f, DAY);
  if (hit) return hit;
  const ys = [];
  for (let y = new Date().getFullYear(); y >= 2006; y--) ys.push(y);
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < ys.length) {
      const y = ys[i++];
      if ((await nedPage(pnu, y, 1, 1)).total) out.push(y);
    }
  }));
  out.sort((a, b) => b - a);
  writeJson(f, out);
  return out;
}

// 한 해의 동·호별 공시가격. 같은 동·호가 중복으로 내려오는 경우가 있어 합치고(갱신일이 최신인 것), 가격은 만원 단위로 줄인다.
async function gongsiUnits(pnu, year) {
  const f = path.join(CACHE_DIR, `ned_${pnu}_${year}.json`);
  const hit = readJson(f, year < new Date().getFullYear() ? null : 7 * DAY);
  if (hit) return hit;
  const PAGE = 1000;
  const first = await nedPage(pnu, year, 1, PAGE);
  const all = [...first.field];
  const pages = Math.ceil(first.total / PAGE);
  let next = 2;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next <= pages) all.push(...(await nedPage(pnu, year, next++, PAGE)).field);
  }));
  const uniq = new Map();
  for (const x of all) {
    const k = `${x.dongNm}|${x.hoNm}`, old = uniq.get(k);
    if (!old || String(x.lastUpdtDt) > String(old.lastUpdtDt)) uniq.set(k, x);
  }
  const names = [...new Set([...uniq.values()].map((x) => x.aphusNm))];
  const num = (s) => { const n = parseInt(s, 10); return Number.isNaN(n) ? Infinity : n; };
  const rows = [...uniq.values()]
    .sort((a, b) => num(a.dongNm) - num(b.dongNm) || String(a.dongNm).localeCompare(String(b.dongNm), 'ko') || num(a.hoNm) - num(b.hoNm))
    .map((x) => [x.dongNm, x.hoNm, Number(x.floorNm), Number(x.prvuseAr), Math.round(Number(x.pblntfPc) / 10000), names.indexOf(x.aphusNm)]);
  const out = { pnu, year, names, total: all.length, rows };   // rows: [동, 호, 층, 전용면적㎡, 공시가격(만원), 단지명 인덱스]
  writeJson(f, out);
  return out;
}

/* ---------- 토지이용계획 (V-World NED 토지이용계획속성) ---------- */
// 필지에 걸린 용도지역·지구·구역 목록. 계획은 자주 바뀌지 않아 30일 캐시한다.
async function landUse(pnu) {
  const f = path.join(CACHE_DIR, `landuse_${pnu}.json`);
  const hit = readJson(f, 30 * DAY);
  if (hit) return hit;
  const PAGE = 100, field = [];
  for (let page = 1; page <= 10; page++) {
    const j = await vwFetch(`${VW}/ned/data/getLandUseAttr`, { pnu, numOfRows: String(PAGE), pageNo: String(page) });
    const r = j.landUses || j.response;
    if (!r || r.status === 'ERROR' || r.error) throw new Error('V-World 토지이용계획 오류: ' + JSON.stringify(j).slice(0, 200));
    field.push(...(r.field || []));
    if (field.length >= Number(r.totalCount || 0) || !(r.field || []).length) break;
  }
  // 같은 이름은 한 번만. 포함(1) → 저촉(2) → 접합(3) 순으로 보여 준다
  const seen = new Set(), items = [];
  for (const x of field.sort((a, b) => Number(a.cnflcAt) - Number(b.cnflcAt))) {
    const k = `${x.prposAreaDstrcCodeNm}|${x.cnflcAtNm}`;
    if (seen.has(k)) continue;
    seen.add(k); items.push([x.prposAreaDstrcCodeNm, x.cnflcAtNm]);
  }
  const out = { items, updated: field.map((x) => x.lastUpdtDt || '').sort().pop() || '' };   // items: [지역·지구명, 포함|저촉|접합]
  writeJson(f, out);
  return out;
}

/* ---------- API 라우팅 (로컬 서버·Vercel 함수 공통) ---------- */
// 반환: { status, body, maxAge }  maxAge(초)는 공유 캐시(CDN) 보관 시간, 0이면 캐시하지 않음
const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });

async function tradesRoute(p) {
  const lawd = p.get('lawd') || '';
  if (!/^\d{5}$/.test(lawd)) return fail(400, '잘못된 파라미터입니다.');
  let months;
  if (p.get('ym')) {
    if (!/^\d{6}$/.test(p.get('ym'))) return fail(400, '잘못된 파라미터입니다.');
    months = [p.get('ym')];
  } else {
    const from = p.get('from') || '', to = p.get('to') || '';
    if (!/^\d{6}$/.test(from) || !/^\d{6}$/.test(to) || from > to) return fail(400, '잘못된 파라미터입니다.');
    months = monthsBetween(from, to);
  }
  if (months.length > 36) return fail(400, '조회 기간은 최대 36개월입니다.');
  if (months[0] < '200601' || months[months.length - 1] > currentYM()) return fail(400, '조회할 수 없는 기간입니다.');
  const rent = p.get('type') === 'rent';
  const trades = [];
  for (const ym of months) trades.push(...(await fetchMonth(lawd, ym, rent)));
  return { status: 200, body: { trades }, maxAge: months.includes(currentYM()) ? 3600 : 30 * DAY };
}

async function gongsiYearsRoute(p) {
  const addr = (p.get('addr') || '').trim();
  if (!addr || addr.length > 100) return fail(400, '주소가 필요합니다.');
  const r = await resolvePnu(addr);
  if (!r) return fail(404, `주소로 필지를 찾지 못했습니다: ${addr}`);
  return { status: 200, body: { ...r, years: await gongsiYears(r.pnu) }, maxAge: DAY };
}

async function gongsiUnitsRoute(p) {
  const pnu = p.get('pnu') || '', year = Number(p.get('year'));
  if (!/^\d{19}$/.test(pnu) || !(year >= 2006 && year <= 2100)) return fail(400, '잘못된 파라미터입니다.');
  return { status: 200, body: await gongsiUnits(pnu, year), maxAge: year < new Date().getFullYear() ? 30 * DAY : DAY };
}

/* ---------- 지도: 지번 주소 → 좌표 (V-World 지오코더), 카카오맵 키 전달 ---------- */
// 단지 좌표는 거의 바뀌지 않으므로 주소별로 영구 캐시한다. 못 찾은 주소도 캐시해 다시 묻지 않는다.
async function geocode(addr) {
  const f = path.join(CACHE_DIR, `geo_${crypto.createHash('md5').update(addr).digest('hex')}.json`);
  const hit = readJson(f);
  if (hit) return hit.lat == null ? null : hit;
  const j = await vwFetch(`${VW}/req/address`, {
    service: 'address', request: 'getcoord', version: '2.0', crs: 'epsg:4326', type: 'PARCEL', address: addr,
  });
  const st = j.response && j.response.status;
  if (st === 'ERROR') throw new Error('V-World 오류: ' + JSON.stringify(j.response.error || j.response));
  const pt = st === 'OK' && j.response.result && j.response.result.point;
  const out = pt ? { lat: Number(pt.y), lng: Number(pt.x) } : { lat: null, lng: null };
  writeJson(f, out);
  return pt ? out : null;
}

async function geocodeRoute(p) {
  const addr = (p.get('addr') || '').trim();
  if (!addr || addr.length > 100) return fail(400, '주소가 필요합니다.');
  const r = await geocode(addr);
  return r ? { status: 200, body: r, maxAge: 30 * DAY } : fail(404, `주소의 좌표를 찾지 못했습니다: ${addr}`);
}

async function landuseRoute(p) {
  const addr = (p.get('addr') || '').trim();
  if (!addr || addr.length > 100) return fail(400, '주소가 필요합니다.');
  const r = await resolvePnu(addr);
  if (!r) return fail(404, `주소로 필지를 찾지 못했습니다: ${addr}`);
  return { status: 200, body: { address: r.address, ...(await landUse(r.pnu)) }, maxAge: DAY };
}

// 카카오 JavaScript 키는 브라우저에 노출되는 값이다(도메인 등록으로 보호). 로그인한 사용자에게만 내려 준다.
async function configRoute() {
  return { status: 200, body: { kakaoKey: process.env.KAKAO_JS_KEY || '' }, maxAge: 0 };
}

const ROUTES = { trades: tradesRoute, 'gongsi/years': gongsiYearsRoute, 'gongsi/units': gongsiUnitsRoute, geocode: geocodeRoute, landuse: landuseRoute, config: configRoute };

async function handle(route, params) {
  const fn = ROUTES[route];
  if (!fn) return fail(404, 'Not found');
  try { return await fn(params); }
  catch (e) { return fail(502, e.message); }
}

// Node 기본 req/res(로컬 http 서버, Vercel Node 함수 모두 호환)에 응답을 쓴다
async function respond(route, req, res) {
  // 로그인하지 않은 요청은 외부 API(인증키 사용량)를 건드리지 않고 돌려보낸다
  const r = auth.isAuthed(req) ? await handle(route, new URL(req.url, 'http://localhost').searchParams) : fail(401, '로그인이 필요합니다.');
  res.statusCode = r.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 성공 응답은 브라우저에만 잠깐 캐시한다. 공유 캐시(CDN)에 두면 로그인하지 않은 사람에게도 나갈 수 있어서 private으로 둔다.
  // 외부 API 호출을 줄이는 캐시는 서버 쪽 파일 캐시가 맡는다.
  res.setHeader('Cache-Control', r.maxAge ? `private, max-age=${Math.min(r.maxAge, 300)}` : 'no-store');
  res.end(JSON.stringify(r.body));
}

module.exports = { handle, respond, CACHE_DIR };
