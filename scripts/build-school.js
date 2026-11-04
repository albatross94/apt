// 학교검색 탭 자료 만들기 (재실행 가능). 사용: node scripts/build-school.js [원본폴더]
// 입력: 학교/ 폴더의 한국교육시설안전원 SHP·CSV, 학교기본정보 CSV (수정하지 않음)
// 출력: data/school/  (공개 폴더가 아니라 /api/school 이 로그인 확인 후 내려 준다)
//   sw_judge.json            판정용 원본 정밀도 경계 (투영좌표 m)
//   sw_elem|mid|high.geojson 화면 표시용 단순화 경계 (WGS84, 오차 약 1.5m 이내)
//   sw_district_schools.json 학구ID → 소속 학교 목록
//   sw_schools.json          학교 카드(위치·설립·전화·누리집)
// 갱신(3월·9월 재배포): 새 파일을 학교/ 에 풀고 아래 SRC 폴더명·기준일만 바꾼 뒤 다시 실행 → 대조 테스트(scripts/verify-school.js)
const fs = require('fs');
const path = require('path');
const g = require('../lib/geo');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, '학교');
const OUT = path.join(ROOT, 'data', 'school');
const EDU_CD = '7541000';            // 경기도수원교육지원청
const SIMPLIFY_M = 1.5;              // 표시용 단순화 허용오차(m). 판정은 원본으로 한다.
const META = {
  baseDate: '2026-09-20',            // 학구도 자료 기준일 (BASE_DT)
  locationDate: '2026-10-01',        // 학교 위치 자료 기준일
  infoDate: '2026-08-31',            // 학교 기본정보 기준일
};
const LAYERS = [
  { key: 'elem', dir: '한국교육시설안전원_초등학교통학구역_20260920', name: '초등학교통학구역' },
  { key: 'mid', dir: '한국교육시설안전원_중학교학교군_20260920', name: '중학교학교군' },
  { key: 'high', dir: '한국교육시설안전원_고등학교학교군_20260920', name: '고등학교학교군' },
];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const r2 = (n) => Math.round(n * 100) / 100;
const write = (name, obj) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj)); console.log('저장', name, (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0) + 'KB'); };

fs.mkdirSync(OUT, { recursive: true });

/* ---------- 1. 학구 경계 ---------- */
const judge = { meta: META, crs: 'EPSG:5186', elem: [], mid: [], high: [] };
for (const L of LAYERS) {
  const base = path.join(SRC, L.dir, L.name);
  const dbf = g.readDbf(base + '.dbf'), shp = g.readShp(base + '.shp');
  if (dbf.length !== shp.length) throw new Error(L.name + ': 속성과 도형 개수가 다릅니다.');
  const feats = [];
  dbf.forEach((r, i) => {
    if (r._del || r.EDU_CD !== EDU_CD || !shp[i]) return;
    const rings = shp[i].rings;
    judge[L.key].push({ id: r.HAKGUDO_ID, nm: r.HAKGUDO_NM, gb: r.HAKGUDO_GB, upd: r.UPD_DT, base: r.BASE_DT, bbox: shp[i].bbox.map(r2), rings: rings.map((ring) => ring.map(([x, y]) => [r2(x), r2(y)])) });
    // 표시용: 단순화 후 WGS84
    // SHP는 시계 방향 고리가 외곽, 반시계가 구멍이다. 외곽마다 다각형을 만들고 구멍은 앞선 외곽에 붙인다.
    const area = (ring) => ring.reduce((a, p, i) => a + (i ? (ring[i - 1][0] * p[1] - p[0] * ring[i - 1][1]) : 0), 0) / 2;
    const polys = [];
    for (const ring of rings) {
      const out = g.simplifyRing(ring, SIMPLIFY_M).map(([x, y]) => g.fromTM(x, y).map(r6));
      if (area(ring) <= 0 || !polys.length) polys.push([out]); else polys[polys.length - 1].push(out);
    }
    feats.push({ type: 'Feature', properties: { id: r.HAKGUDO_ID, nm: r.HAKGUDO_NM, gb: r.HAKGUDO_GB, upd: r.UPD_DT, base: r.BASE_DT }, geometry: { type: 'MultiPolygon', coordinates: polys } });
  });
  console.log(L.key, '수원 학구', feats.length);
  write(`sw_${L.key}.geojson`, { type: 'FeatureCollection', features: feats });
}
write('sw_judge.json', judge);

/* ---------- 2. 학구 ↔ 학교 ---------- */
const link = g.readCsv(path.join(SRC, '한국교육시설안전원_학교학구도연계정보_20260920.csv'), 'euc-kr');
const ids = new Set([...judge.elem, ...judge.mid, ...judge.high].map((f) => f.id));
const dsch = {};
for (const r of link) {
  if (!ids.has(r['학구ID'])) continue;
  (dsch[r['학구ID']] ||= []).push({ id: r['학교ID'], nm: r['학교명'], lv: r['학교급구분'].replace('학교', '') });
}
for (const k of Object.keys(dsch)) dsch[k].sort((a, b) => a.nm.localeCompare(b.nm, 'ko'));
write('sw_district_schools.json', dsch);

/* ---------- 3. 학교 카드 (위치 + 기본정보) ---------- */
const loc = g.readCsv(path.join(SRC, '한국교육시설안전원_초중등학교위치_20260920.csv'), 'utf-8').filter((r) => r['교육지원청코드'] === EDU_CD && r['운영상태'] === '운영');
const info = g.readCsv(path.join(SRC, '학교기본정보_2026년8월31일기준.csv'), 'euc-kr').filter((r) => r['관할조직명'] === '경기도수원교육지원청' || /경기도 수원시/.test(r['도로명주소']));
const norm = (s) => String(s || '').replace(/\s+/g, '');
const byAddr = new Map(), byName = new Map();
for (const r of info) { byAddr.set(norm(r['도로명주소']) + '|' + r['학교종류명'], r); byName.set(r['학교명'] + '|' + r['학교종류명'], r); }
const cards = []; let miss = 0;
for (const r of loc) {
  const lv = r['학교급구분'];
  const m = byAddr.get(norm(r['소재지도로명주소']) + '|' + lv) || byName.get(r['학교명'] + '|' + lv) || null;
  if (!m) miss++;
  const url = m ? m['홈페이지주소'].trim() : '';
  cards.push({
    id: r['학교ID'], nm: r['학교명'], lv: lv.replace('학교', ''),
    addr: r['소재지도로명주소'], lat: Number(r['위도']), lng: Number(r['경도']),
    est: r['설립형태'] || (m && m['설립명']) || '',
    tel: m ? m['전화번호'].trim() : '', url: /^https?:\/\//i.test(url) ? url : (url ? 'http://' + url : ''),
    coed: m ? m['남녀공학구분명'].trim() : '',
  });
}
cards.sort((a, b) => a.nm.localeCompare(b.nm, 'ko'));
console.log('학교', cards.length, '기본정보 매칭 실패', miss, miss ? '(' + cards.filter((c) => !c.tel).map((c) => c.nm).slice(0, 12).join(', ') + ' …)' : '');
const cnt = {}; for (const c of cards) cnt[c.lv] = (cnt[c.lv] || 0) + 1; console.log(cnt);
write('sw_schools.json', { meta: META, schools: cards });
