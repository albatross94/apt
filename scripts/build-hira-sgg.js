// 일회성 생성 스크립트: regions.json의 법정동 시군구 코드(5자리) → 건강보험심사평가원(HIRA) 시도/시군구 코드 매핑을 lib/hira-sgg.json 으로 만든다.
// 실행: node scripts/build-hira-sgg.js   (.env의 SERVICE_KEY 필요, 병원정보서비스 활용신청 후)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const key = /%[0-9A-Fa-f]{2}/.test(process.env.SERVICE_KEY) ? process.env.SERVICE_KEY : encodeURIComponent(process.env.SERVICE_KEY);
const URL_ = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const SIDO = [110000, 210000, 220000, 230000, 240000, 250000, 260000, 310000, 320000, 330000, 340000, 350000, 360000, 370000, 380000, 390000, 410000];
const regions = require('../public/regions.json');
const norm = (s) => s.replace(/특별자치도|특별자치시|특별시|광역시|도$/g, '').trim();
(async () => {
  const seen = new Map();   // sgguCd → { sido, addr 앞부분 }
  for (const sido of SIDO) {
    for (let page = 1; page < 100; page++) {
      const j = await (await fetch(`${URL_}?serviceKey=${key}&_type=json&sidoCd=${sido}&clCd=31&numOfRows=1000&pageNo=${page}`)).json();
      const b = j.response.body, items = [].concat((b.items && b.items.item) || []);
      for (const it of items) if (!seen.has(it.sgguCd)) seen.set(it.sgguCd, { sidoCd: it.sidoCd, toks: it.addr.split(/\s+/).slice(0, 3) });
      if (page * 1000 >= b.totalCount || !items.length) break;
    }
    console.log(sido, seen.size);
  }
  const out = {}, miss = [];
  for (const r of regions) {
    const want = r.name === r.sido ? [r.sido] : r.name.split(/\s+/);   // '수원시 팔달구' → ['수원시','팔달구']
    let hit = null;
    for (const [cd, v] of seen) {
      const t = v.toks;
      if (!norm(r.sido).startsWith(norm(t[0]).slice(0, 2)) && !norm(t[0]).startsWith(norm(r.sido).slice(0, 2))) continue;
      const rest = t.slice(1);
      if (want.length === 1 && rest[0] === want[0] && !(/구$/.test(rest[1] || '') && /시$/.test(rest[0]) && r.name !== rest[0] + ' ' + rest[1])) { if (!hit) hit = [cd, v]; }
      if (want.length === 2 && rest[0] === want[0] && rest[1] === want[1]) { hit = [cd, v]; break; }
    }
    if (hit) out[r.code] = [Number(hit[1].sidoCd), Number(hit[0])]; else miss.push(r.code + ' ' + r.sido + ' ' + r.name);
  }
  out['36110'] = [410000, 410000]; out['47940'] = [370000, 370018];   // 세종(시도 코드와 같음)·울릉(의원 자료에 없어 직접 확인한 값)
  fs.writeFileSync(path.join(ROOT, 'lib', 'hira-sgg.json'), JSON.stringify(out));
  console.log('mapped', Object.keys(out).length, '/', regions.length, 'missing:', miss);
})();
