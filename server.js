// 로컬 실행용 서버: API 라우팅(lib/core.js) + 정적 파일 서빙 (외부 의존성 없음)
// Vercel에서는 이 파일 대신 api/*.js 서버리스 함수와 public/ 정적 파일이 쓰인다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

// .env 로드 (SERVICE_KEY, VWORLD_KEY, KAKAO_JS_KEY)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const core = require('./lib/core');
const auth = require('./lib/auth');

const API_ROUTES = { '/api/trades': 'trades', '/api/gongsi/years': 'gongsi/years', '/api/gongsi/units': 'gongsi/units', '/api/geocode': 'geocode', '/api/landuse': 'landuse','/api/config': 'config' };
const AUTH_ROUTES = { '/api/login': 'login', '/api/logout': 'logout', '/api/me': 'me' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    if (AUTH_ROUTES[u.pathname]) return auth.respond(AUTH_ROUTES[u.pathname], req, res);
    const route = API_ROUTES[u.pathname];
    if (!route) { res.statusCode = 404; return res.end('Not found'); }
    return core.respond(route, req, res);
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
