// 아이사랑 포털(보건복지부) 어린이집 정보공개 '기본정보조회(정기)' CSV → data/daycare/daycare.json
// 사용: node scripts/build-daycare.js [CSV경로]   (API 키 불필요. 원본 CSV는 읽기만 한다)
// 연락 외 정보(팩스·이메일 등)와 통학차량·휴지 일자는 JSON에 넣지 않는다. 단지 대표점까지 직선거리(m)를 미리 계산한다.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(root, '학교', '어린이집_수원시_20261031.csv');
const g = require('../lib/geo');
const C = require('../data/school/complex_district.json').대표점;
const BASE_DATE = '2026.10.31.';

const rad = (d) => d * Math.PI / 180;
const dist = (a, b, c, d) => { const R = 6371008.8, x = rad(c - a), y = rad(d - b), h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const GROUP = { 국공립: '국공립', 민간: '민간', 가정: '가정', 직장: '직장', 협동: '협동' };   // 그 밖(사회복지법인·법인·단체등)은 '기타'
const GU = ['장안구', '권선구', '팔달구', '영통구'];

const src = g.readCsv(SRC, 'utf-8');
const rows = [];
for (const r of src) {
  const lat = Number(r.위도), lng = Number(r.경도);
  if (!(lat > 37 && lat < 37.5 && lng > 126.8 && lng < 127.2)) throw new Error('좌표가 수원시 범위 밖입니다: ' + r.어린이집명);
  if (!GU.includes(r.구)) throw new Error('구를 알 수 없습니다: ' + r.어린이집명);
  rows.push({
    n: r.어린이집명, ty: r.유형, g: GROUP[r.유형] || '기타', st: r.운영현황, gu: r.구, a: r.주소, t: r.전화 || '',
    cap: Number(r.정원수) || 0, cur: Number(r.현원수) || 0, lat, lng, d: Math.round(dist(C.위도, C.경도, lat, lng)),
  });
}
rows.sort((a, b) => a.d - b.d);
const count = (k) => rows.reduce((a, r) => (a[r[k]] = (a[r[k]] || 0) + 1, a), {});
const meta = { 출처: '아이사랑 포털(보건복지부) 어린이집 정보공개 기본정보조회(정기)', 기준일: BASE_DATE, 기준점: { 이름: '수원센트럴아이파크자이', 위도: C.위도, 경도: C.경도 }, 건수: rows.length, 구별: count('gu'), 유형별: count('ty'), 운영현황별: count('st') };
fs.writeFileSync(path.join(root, 'data/daycare/daycare.json'), JSON.stringify({ meta, rows }));
console.log(rows.length, '곳 저장', JSON.stringify(meta.구별), JSON.stringify(meta.유형별), JSON.stringify(meta.운영현황별));
