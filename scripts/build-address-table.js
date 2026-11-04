// 수원교육지원청 통학구역 주소표(CSV, cp949) → data/school/sw_addr_zone.json  (초등 교차 검증용)
// 사용: node scripts/build-address-table.js [CSV 경로]
// 담는 것: 지번·도로명·건물명·학교명·임시표기 여부만 (전화번호는 제외). 원본 CSV는 저장소에 올리지 않는다(학교/ 는 .gitignore).
const fs = require('fs');
const path = require('path');
const { readCsv } = require('../lib/geo');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, '학교', '경기도교육청 경기도수원교육지원청_통합홈페이지_통학구역_20241008.csv');
const DATE = '2024-10-08';   // 주소표 기준일
const OUT = path.join(ROOT, 'data', 'school', 'sw_addr_zone.json');

const rows = readCsv(SRC, 'euc-kr');
const schools = [], sidx = new Map();
const idx = (n) => { if (!sidx.has(n)) { sidx.set(n, schools.length); schools.push(n); } return sidx.get(n); };
const areas = {}, seen = new Set();
let count = 0;
let temp = 0;
for (const r of rows) {
  const raw = (r['학교명'] || '').trim();
  if (!raw) continue;
  const name = raw.replace(/\(.*\)/, '').trim();
  const isTemp = /임시/.test(raw) ? 1 : 0;
  const jibun = (r['지번'] || '').trim(), road = (r['상세주소'] || '').trim(), bld = (r['건물명'] || '').trim();
  if (!jibun && !road && !bld) continue;
  const k = [jibun, road, bld, name, isTemp].join('|');
  if (seen.has(k)) continue;
  seen.add(k);
  if (isTemp) temp++;
  // 같은 동(洞)의 반복을 줄이려고 '구 동' 단위로 묶고 번지만 따로 둔다. 번지 형식이 아니면 지번 전체를 번지 자리에 둔다.
  const m = jibun.match(/^(.*?\S+[동가리])\s+(산?\d[\d-]*)$/);
  const area = m ? m[1] : '', lot = m ? m[2] : jibun;
  (areas[area] ||= []).push([lot, road, bld, idx(name), isTemp]); count++;
}
const json = JSON.stringify({ meta: { date: DATE, source: '경기도수원교육지원청 통합홈페이지 통학구역 주소표', fields: ['번지', '상세주소(도로명)', '건물명', '학교(schools 인덱스)', '임시표기'], areas: '구 동 → 행 목록 (지번 = 구 동 + 번지)' }, schools, areas });
fs.writeFileSync(OUT, json);
console.log(`행 ${rows.length} → ${count} (임시 표기 ${temp}), 학교 ${schools.length}개, ${(json.length / 1024).toFixed(0)}KB(문자 수 기준; 바이트 ${Buffer.byteLength(json) / 1024 | 0}KB)`);
// 화면·응답에서 기준일만 필요할 때 큰 파일을 읽지 않도록 따로 둔다
fs.writeFileSync(path.join(path.dirname(OUT), 'sw_addr_zone_meta.json'), JSON.stringify({ date: DATE, source: '경기도수원교육지원청 통합홈페이지 통학구역 주소표', rows: count }));
