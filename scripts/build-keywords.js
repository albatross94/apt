// 네이버 검색광고(Searchad) API 키워드도구 → 키워드 월간 검색수 data/keywords/YYYY-MM.json
// 사용: node scripts/build-keywords.js   (PC에서만 실행. .env 의 NAVER_AD_CUSTOMER_ID·NAVER_AD_API_KEY·NAVER_AD_SECRET_KEY 필요)
// 조회할 키워드는 data/keywords/keywords.txt 에 한 줄에 하나씩 적는다(띄어쓰기는 자동 제거, #으로 시작하거나 빈 줄은 건너뜀).
// 키워드도구는 한 번에 5개까지만 받으므로 5개씩 묶어 요청한다. 사이트 화면에는 아직 연결하지 않음(결과 JSON만 생성).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
for (const l of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const CUSTOMER_ID = process.env.NAVER_AD_CUSTOMER_ID;
const API_KEY = process.env.NAVER_AD_API_KEY;
const SECRET_KEY = process.env.NAVER_AD_SECRET_KEY;
if (!CUSTOMER_ID || !API_KEY || !SECRET_KEY) { console.error('.env 에 NAVER_AD_CUSTOMER_ID, NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY 가 필요합니다.'); process.exit(1); }

const BASE = 'https://api.searchad.naver.com';
const URI = '/keywordstool';
const BATCH = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sign = (timestamp, method) => crypto.createHmac('sha256', SECRET_KEY).update(`${timestamp}.${method}.${URI}`).digest('base64');

async function keywordstool(keywords) {
  const timestamp = String(Date.now());
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Timestamp': timestamp,
    'X-API-KEY': API_KEY,
    'X-Customer': String(CUSTOMER_ID),
    'X-Signature': sign(timestamp, 'GET'),
  };
  const qs = new URLSearchParams({ hintKeywords: keywords.join(','), showDetail: '1' });
  const r = await fetch(`${BASE}${URI}?${qs}`, { headers, signal: AbortSignal.timeout(30000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`키워드도구 API ${r.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body).keywordList || [];
}

const norm = (s) => s.replace(/\s+/g, '');
const qc = (v) => (v === '< 10' ? v : Number(v) || 0);   // '< 10'은 그대로, 그 외는 숫자
const sum = (pc, mobile) => (typeof pc === 'number' && typeof mobile === 'number' ? pc + mobile : (typeof pc === 'number' ? pc : 0) + (typeof mobile === 'number' ? mobile : 0));
// 주: PC·모바일 둘 중 하나라도 '< 10'이면 합계는 그 값을 0으로 쳐서 더한 하한값입니다(네이버가 '< 10'의 정확한 수치를 주지 않음).
const toRow = (item) => {
  const pc = qc(item.monthlyPcQcCnt), mobile = qc(item.monthlyMobileQcCnt);
  return {
    키워드: item.relKeyword, PC검색수: pc, 모바일검색수: mobile, 합계: sum(pc, mobile), 경쟁정도: item.compIdx || '',
    // 광고 판단용 참고값(광고주 평균 기준, 실제 광고 성과 아님): 클릭수·클릭률·월평균노출광고수
    PC월평균클릭수: qc(item.monthlyAvePcClkCnt), 모바일월평균클릭수: qc(item.monthlyAveMobileClkCnt),
    PC클릭률: qc(item.monthlyAvePcCtr), 모바일클릭률: qc(item.monthlyAveMobileCtr), 월평균노출광고수: qc(item.plAvgDepth),
  };
};

(async () => {
  const keywords = fs.readFileSync(path.join(root, 'data/keywords/keywords.txt'), 'utf8')
    .split(/\r?\n/).map((l) => norm(l.trim())).filter((l) => l && !l.startsWith('#'));
  if (!keywords.length) { console.error('data/keywords/keywords.txt 에 키워드가 없습니다.'); process.exit(1); }

  const rows = [];
  for (let i = 0; i < keywords.length; i += BATCH) {
    const group = keywords.slice(i, i + BATCH);
    const list = await keywordstool(group);
    const groupSet = new Set(group.map(norm));
    const related = list.filter((item) => !groupSet.has(norm(item.relKeyword))).map(toRow).sort((a, b) => b.합계 - a.합계).slice(0, 20);
    for (const kw of group) {
      const hit = list.find((item) => norm(item.relKeyword) === kw);
      if (!hit) { console.error('조회 결과 없음:', kw); continue; }
      rows.push({ ...toRow(hit), 연관키워드상위20: related });
    }
    console.log('조회:', group.join(', '));
    if (i + BATCH < keywords.length) await sleep(300);
  }

  const ym = new Date().toISOString().slice(0, 7);
  const meta = { 출처: '네이버 검색광고 API 키워드도구', 수집일: new Date().toISOString().slice(0, 10), 전체_건수: rows.length };
  fs.writeFileSync(path.join(root, `data/keywords/${ym}.json`), JSON.stringify({ meta, rows }, null, 1));
  console.log('저장:', `data/keywords/${ym}.json`, `(${rows.length}건)`);
})().catch((e) => { console.error(e.message.replace(API_KEY, '<KEY>').replace(SECRET_KEY, '<SECRET>')); process.exit(1); });
