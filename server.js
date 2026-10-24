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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
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
