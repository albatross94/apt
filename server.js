// 아파트 매매 실거래가 분석 서버: 공공데이터포털 API 프록시 + 정적 파일 서빙 (외부 의존성 없음)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, 'cache');
const PORT = process.env.PORT || 3000;
const ENDPOINT =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

// .env 로드 (SERVICE_KEY=...)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

fs.mkdirSync(CACHE_DIR, { recursive: true });

const TAGS = {
  aptNm: 'apt', umdNm: 'dong', jibun: 'jibun', excluUseAr: 'area', dealYear: 'y',
  dealMonth: 'm', dealDay: 'd', dealAmount: 'price', floor: 'floor', buildYear: 'built',
  dealingGbn: 'gbn', cdealType: 'canceled', cdealDay: 'cancelDay', sggCd: 'sgg',
};

function parseItems(xml) {
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
    for (const [src, dst] of Object.entries(TAGS)) {
      const v = (body.match(new RegExp(`<${src}>([\\s\\S]*?)</${src}>`)) || [])[1];
      o[dst] = v === undefined ? '' : v.trim();
    }
    const price = Number(o.price.replace(/,/g, ''));
    items.push({
      apt: o.apt, dong: o.dong, jibun: o.jibun, area: Number(o.area),
      date: `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`,
      price, floor: Number(o.floor), built: Number(o.built), gbn: o.gbn,
      canceled: o.canceled === 'O',
    });
  }
  return { total, items };
}

async function fetchMonth(lawd, ym) {
  const file = path.join(CACHE_DIR, `${lawd}_${ym}.json`);
  const now = new Date();
  const isCurrent = ym === `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  // 지난 달 데이터는 변하지 않으므로 영구 캐시, 이번 달은 1시간만 캐시
  if (fs.existsSync(file) && (!isCurrent || Date.now() - fs.statSync(file).mtimeMs < 3600e3)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const key = process.env.SERVICE_KEY;
  if (!key) throw new Error('.env 파일에 SERVICE_KEY가 설정되지 않았습니다.');
  const all = [];
  const rows = 1000;
  for (let page = 1; ; page++) {
    // 포털에서 복사한 키가 이미 인코딩된 경우(%)와 디코딩된 경우 모두 처리
    const k = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
    const url = `${ENDPOINT}?serviceKey=${k}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=${rows}`;
    const res = await fetch(url);
    const { total, items } = parseItems(await res.text());
    all.push(...items);
    if (all.length >= total || items.length === 0) break;
  }
  fs.writeFileSync(file, JSON.stringify(all));
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
const crypto = require('crypto');
const VW = 'https://api.vworld.kr';
const NED = `${VW}/ned/data/getApartHousingPriceAttr`;
const DAY = 24 * 3600e3;

// .env 의 VWORLD_KEY 를 사용. 오류 메시지에 키가 섞여 나가지 않도록 가린다.
async function vwFetch(url, params) {
  const key = process.env.VWORLD_KEY;
  if (!key) throw new Error('.env 파일에 VWORLD_KEY가 설정되지 않았습니다.');
  const u = new URL(url);
  for (const [k, v] of Object.entries({ key, format: 'json', ...params })) u.searchParams.set(k, v);
  const res = await fetch(u);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`V-World 응답을 해석할 수 없습니다 (HTTP ${res.status}): ${text.slice(0, 120).split(key).join('<KEY>')}`); }
}
const readJson = (f, maxAgeMs) => {
  try {
    if (maxAgeMs == null || Date.now() - fs.statSync(f).mtimeMs < maxAgeMs) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  return null;
};

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
      fs.writeFileSync(f, JSON.stringify(out));
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
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < ys.length) {
      const y = ys[i++];
      if ((await nedPage(pnu, y, 1, 1)).total) out.push(y);
    }
  }));
  out.sort((a, b) => b - a);
  fs.writeFileSync(f, JSON.stringify(out));
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
  await Promise.all(Array.from({ length: 4 }, async () => {
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
  fs.writeFileSync(f, JSON.stringify(out));
  return out;
}

async function gongsiRoute(u, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (u.pathname === '/api/gongsi/years') {
      const addr = (u.searchParams.get('addr') || '').trim();
      if (!addr) { res.statusCode = 400; return res.end(JSON.stringify({ error: '주소가 필요합니다.' })); }
      const r = await resolvePnu(addr);
      if (!r) { res.statusCode = 404; return res.end(JSON.stringify({ error: `주소로 필지를 찾지 못했습니다: ${addr}` })); }
      return res.end(JSON.stringify({ ...r, years: await gongsiYears(r.pnu) }));
    }
    const pnu = u.searchParams.get('pnu') || '', year = Number(u.searchParams.get('year'));
    if (!/^\d{19}$/.test(pnu) || !(year >= 2006 && year <= 2100)) { res.statusCode = 400; return res.end(JSON.stringify({ error: '잘못된 파라미터입니다.' })); }
    return res.end(JSON.stringify(await gongsiUnits(pnu, year)));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e.message }));
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/gongsi/')) return gongsiRoute(u, res);
  if (u.pathname === '/api/trades') {
    const lawd = u.searchParams.get('lawd') || '';
    const from = u.searchParams.get('from') || '';
    const to = u.searchParams.get('to') || '';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!/^\d{5}$/.test(lawd) || !/^\d{6}$/.test(from) || !/^\d{6}$/.test(to) || from > to) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: '잘못된 파라미터입니다.' }));
    }
    const months = monthsBetween(from, to);
    if (months.length > 36) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: '조회 기간은 최대 36개월입니다.' }));
    }
    try {
      const trades = [];
      for (const ym of months) trades.push(...(await fetchMonth(lawd, ym)));
      res.end(JSON.stringify({ trades }));
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
  const file = path.join(ROOT, 'public', rel);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
