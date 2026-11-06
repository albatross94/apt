// 유치원알리미(한국교육학술정보원) 공시정보 → data/kinder/kinder.json
// 사용: node scripts/build-kinder.js   (.env 의 KINDER_API_KEY 필요. 키는 이 스크립트 실행 때만 쓰며 결과 JSON에는 넣지 않는다)
// 수원시 전체 유치원을 받아 단지 대표점(data/school/complex_district.json)까지의 직선거리와 함께 저장한다.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
for (const l of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const KEY = process.env.KINDER_API_KEY;
if (!KEY) { console.error('KINDER_API_KEY 가 .env 에 없습니다.'); process.exit(1); }
const RADIUS_M = 1000, SGG = ['41110', '41111', '41113', '41115', '41117'];   // 수원시(구 미지정 7곳)·장안·권선·팔달·영통
const C = require('../data/school/complex_district.json').대표점;

const rad = (d) => d * Math.PI / 180;
const dist = (a, b, c, d) => { const R = 6371008.8, x = rad(c - a), y = rad(d - b), h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function page(sgg, n) {
  const u = `https://e-childschoolinfo.moe.go.kr/api/notice/basicInfo2.do?key=${encodeURIComponent(KEY)}&sidoCode=41&sggCode=${sgg}&pageCnt=100&currentPage=${n}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) }), j = await r.json();
  if (j.status !== 'SUCCESS') throw new Error('유치원 API 오류: ' + (j.message || j.status));
  return j.kinderInfo || [];
}
(async () => {
  const all = [];
  for (const sgg of SGG) for (let n = 1; n < 50; n++) { const it = await page(sgg, n); all.push(...it); if (it.length < 100) break; }
  const seen = new Set(), out = []; let noPos = 0, pbnt = new Set();
  for (const x of all) {
    if (seen.has(x.kindercode)) continue; seen.add(x.kindercode);
    pbnt.add(x.pbnttmng);
    const lat = Number(x.lttdcdnt), lng = Number(x.lngtcdnt);
    if (!lat || !lng) { noPos++; continue; }
    const d = dist(C.위도, C.경도, lat, lng);
    const gu = (String(x.addr).match(/수원시 *(장안구|권선구|팔달구|영통구)/) || [])[1] || '';   // 구 코드가 없는 곳은 주소로 구를 정한다
    out.push({
      n: x.kindername, est: x.establish, a: x.addr, t: x.telno || '', u: x.hpaddr || '', h: x.opertime || '',
      gu, kind: /사립/.test(x.establish) ? '사립' : '공립',
      lat, lng, d: Math.round(d),
    });
  }
  out.sort((a, b) => a.d - b.d);
  const meta = { 출처: '한국교육학술정보원 유치원 공시정보(유치원알리미)', 수집일: new Date().toISOString().slice(0, 10), 공시차수: [...pbnt].join(','), 기준점: { 이름: '수원센트럴아이파크자이', 위도: C.위도, 경도: C.경도 }, 반경_m: RADIUS_M, 전체_건수: seen.size, 좌표없음: noPos };
  fs.writeFileSync(path.join(root, 'data/kinder/kinder.json'), JSON.stringify({ meta, rows: out }, null, 1));
  console.log('수신', all.length, '건 / 좌표 없음', noPos, '/ 저장', out.length, '건 / 공시차수', meta.공시차수);
})().catch((e) => { console.error(e.message.replace(KEY, '<KEY>')); process.exit(1); });
