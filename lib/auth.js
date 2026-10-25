// 공용 비밀번호 로그인 (APP_PASSWORD). 세션은 서명한 쿠키로만 유지해서 DB나 서버 저장소가 필요 없다.
// APP_PASSWORD가 없으면 로그인을 요구하지 않는다(로컬 개발용). 배포할 때는 반드시 설정할 것.
const crypto = require('crypto');

const COOKIE = 'apt_session';
const TTL = 7 * 24 * 3600;   // 초

const password = () => process.env.APP_PASSWORD || '';
const required = () => password() !== '';
// 비밀번호가 바뀌면 이전에 발급한 쿠키가 모두 무효가 되도록 서명 키를 비밀번호에서 만든다
const secret = () => crypto.createHash('sha256').update('apt-session|' + password()).digest();
const sign = (exp) => crypto.createHmac('sha256', secret()).update(String(exp)).digest('base64url');

function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function cookieOf(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return '';
}

function isAuthed(req) {
  if (!required()) return true;
  const [exp, sig] = cookieOf(req).split('.');
  if (!exp || !sig || !(Number(exp) > Date.now() / 1000)) return false;
  return same(sig, sign(exp));
}

const secure = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || !!req.socket?.encrypted;
const setCookie = (req, res, value, maxAge) =>
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`);

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return typeof req.body === 'string' ? safeJson(req.body) : req.body;   // Vercel은 미리 풀어 준다
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 4096) return {}; chunks.push(c); }
  return safeJson(Buffer.concat(chunks).toString('utf8'));
}
const safeJson = (s) => { try { return JSON.parse(s) || {}; } catch { return {}; } };

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

// kind: 'login' | 'logout' | 'me'
async function respond(kind, req, res) {
  if (kind === 'me') return send(res, 200, { required: required(), authed: isAuthed(req) });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'POST만 가능합니다.' }); }
  if (kind === 'logout') { setCookie(req, res, '', 0); return send(res, 200, { ok: true }); }
  if (!required()) return send(res, 200, { ok: true });
  const body = await readBody(req);
  if (typeof body.password === 'string' && same(body.password, password())) {
    const exp = Math.floor(Date.now() / 1000) + TTL;
    setCookie(req, res, `${exp}.${sign(exp)}`, TTL);
    return send(res, 200, { ok: true });
  }
  await new Promise((r) => setTimeout(r, 800));   // 비밀번호를 연속으로 대입해 보기 어렵게 실패 응답을 늦춘다
  return send(res, 401, { error: '비밀번호가 맞지 않습니다.' });
}

module.exports = { respond, isAuthed, required };
