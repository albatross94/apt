// 과거 판 학구도 SHP(학교/_hist)로 동별 판정을 날짜별로 비교한다. 사용: node scripts/build-history.js → data/school/verification_history.md
// 판: 2025-03-21(초 z4, 중 z3), 2025-09-22(초 z1, 중 z2), 2026-09-20(현재 data/school/sw_judge.json). 기준일은 dbf BASE_DT로 확인한다.
// 압축 안 폴더·파일 이름이 깨져 있으므로 이름을 쓰지 않고 폴더를 훑어 .shp/.dbf 를 찾고, dbf는 cp949(euc-kr)로 읽는다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const g = require('../lib/geo');

const ROOT = path.join(__dirname, '..'), D = path.join(ROOT, 'data', 'school'), H = path.join(ROOT, '학교', '_hist');
const EDU = '7541000';
const find = (dir, ext) => { const out = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (e.name.toLowerCase().endsWith(ext)) out.push(p); } })(dir); return out; };

// 한 층(초 또는 중)의 수원 학구를 읽는다 → { base, feats:[{id,nm,upd,rings,bbox}] }
function loadHist(zdir, root) {
  const base = root || path.join(H, zdir);
  const dbf = find(base, '.dbf')[0], shp = find(base, '.shp')[0];
  const db = g.readDbf(dbf, 'euc-kr'), sh = g.readShp(shp);
  if (db.length !== sh.length) throw new Error(zdir + ': 속성과 도형 개수가 다릅니다.');
  const bases = new Set(db.map((r) => r.BASE_DT)), feats = [];
  db.forEach((r, i) => { if (!r._del && r.EDU_CD === EDU && sh[i]) feats.push({ id: r.HAKGUDO_ID, nm: r.HAKGUDO_NM, upd: r.UPD_DT, rings: sh[i].rings, bbox: sh[i].bbox }); });
  return { base: [...bases].join(','), feats, total: db.length };
}
const V = [
  { key: '2025-03-21', src: '학교/_hist/z4(초) · z3(중)', elem: loadHist('z4'), mid: loadHist('z3') },
  { key: '2025-09-22', src: '학교/_hist/z1(초) · z2(중)', elem: loadHist('z1'), mid: loadHist('z2') },
  { key: '2026-09-20', src: '한국교육시설안전원 학교학구도 현재 판(원본 SHP)', elem: loadHist('', path.join(ROOT, '학교', '한국교육시설안전원_초등학교통학구역_20260920')), mid: loadHist('', path.join(ROOT, '학교', '한국교육시설안전원_중학교학교군_20260920')) },
];
for (const v of V) for (const k of ['elem', 'mid']) if (v[k].base !== v.key) throw new Error(`${v.key} ${k}: dbf BASE_DT(${v[k].base})가 기대한 기준일과 다릅니다.`);

function judge(feats, x, y) {
  const inside = []; let near = Infinity;
  for (const f of feats) {
    const [x0, y0, x1, y1] = f.bbox;
    if (x < x0 - 200 || x > x1 + 200 || y < y0 - 200 || y > y1 + 200) continue;
    const d = g.distBoundary(x, y, f.rings);
    if (d < near) near = d;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && g.inPoly(x, y, f.rings)) inside.push(f.nm.replace('통학구역', ''));
  }
  return { nm: inside.join('/') || '[없음]', d: near === Infinity ? null : Math.round(near * 10) / 10 };
}

const sets = [
  { name: '수원센트럴아이파크자이', file: 'complex_dongs.json' },
  { name: '매교역푸르지오SK뷰', file: 'maegyo_skview_dongs.json' },
];
const L = [];
const geomHash = (f) => crypto.createHash('md5').update(JSON.stringify(f.rings)).digest('hex').slice(0, 10);

L.push('# 과거 판 학구도 비교 기록 (verification_history)', '', `생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/build-history.js\``, '');
L.push('## 1. 기준일·출처', '', '| 판(기준일) | 초등 | 중학 | 수원 학구 수(초/중) | dbf BASE_DT |', '|---|---|---|---|---|');
for (const v of V) L.push(`| ${v.key} | ${v.key === '2026-09-20' ? '한국교육시설안전원_초등학교통학구역_20260920' : v.src.split(' · ')[0]} | ${v.key === '2026-09-20' ? '한국교육시설안전원_중학교학교군_20260920' : v.src.split(' · ')[1]} | ${v.elem.feats.length}/${v.mid.feats.length} | ${v.elem.base} / ${v.mid.base} |`);
L.push('', '- 출처: 한국교육시설안전원 학교학구도(초등학교통학구역·중학교학교군) SHP. 좌표계 EPSG:5186(Korea 2000 중부원점 2010), 수원 = 경기도수원교육지원청(EDU_CD 7541000). 기준일은 dbf의 BASE_DT로 확인했다(과거 판 파일은 압축 안 이름이 깨져 있어 폴더를 훑어 읽고 dbf는 cp949로 읽었다).');
const maegyo = V.map((v) => v.elem.feats.find((f) => f.nm === '매교초통학구역'));
L.push(`- 매교초통학구역: ${V.map((v, i) => `${v.key} ${maegyo[i] ? `있음(UPD_DT ${maegyo[i].upd})` : '**없음**'}`).join(' · ')}.`);
L.push('', '> **한계 1 — 개교 전후 변화는 이 자료로 확인 불가.** 이 세 판은 모두 매교초 개교(2025-03) 이후의 자료다. 개교 전(2024년 이전)과 비교할 수 없고, 주소표의 "매교초 개교 전 임시 통학구역"이 언제 어떻게 바뀌었는지도 이 자료만으로는 알 수 없다.', '> **한계 2 — 좌표.** 동 좌표는 카카오 지도 SDK 장소검색 결과이며 건물 중심 여부는 확인하지 못했다. 경계 근처(수십 m)에서는 핀 위치 오차에 따라 판정이 달라질 수 있다.', '> **한계 3 — 학구 경계 정밀도.** 과거 판과 현재 판은 같은 기관의 자료이나 경계 재측량·정리로 수 m 이내의 형상 차이가 생길 수 있다. 판정 차이는 "경계 변경"뿐 아니라 이런 미세 차이일 수 있다.', '');

// ---- 2. 수원 학구 자체의 판 간 변화 ----
L.push('## 2. 수원 학구(경계) 자체의 판 간 변화', '');
for (const [k, label] of [['elem', '초등 통학구역'], ['mid', '중학군']]) {
  const rows = [];
  for (let i = 1; i < V.length; i++) {
    const A = new Map(V[i - 1][k].feats.map((f) => [f.id, f])), B = new Map(V[i][k].feats.map((f) => [f.id, f]));
    const added = [...B.keys()].filter((id) => !A.has(id)).map((id) => B.get(id).nm), removed = [...A.keys()].filter((id) => !B.has(id)).map((id) => A.get(id).nm);
    const upd = [...B.keys()].filter((id) => A.has(id) && A.get(id).upd !== B.get(id).upd).map((id) => `${B.get(id).nm}(${A.get(id).upd}→${B.get(id).upd})`);
    const geom = [...B.keys()].filter((id) => A.has(id) && geomHash(A.get(id)) !== geomHash(B.get(id))).map((id) => B.get(id).nm);
    rows.push(`| ${V[i - 1].key} → ${V[i].key} | ${added.join(', ') || '없음'} | ${removed.join(', ') || '없음'} | ${upd.join(', ') || '없음'} | ${geom.length}개${geom.length ? ': ' + geom.slice(0, 12).join(', ') + (geom.length > 12 ? ' …' : '') : ''} |`);
  }
  L.push(`**${label}**`, '', '| 판 | 추가된 학구 | 사라진 학구 | UPD_DT 변경 | 도형(좌표)이 달라진 학구 |', '|---|---|---|---|---|', ...rows, '');
}
L.push('- "도형이 달라진 학구"는 같은 학구ID의 좌표 배열이 한 점이라도 다르면 포함한다(재정리·정밀도 차이 포함). 의미 있는 경계 변경인지는 UPD_DT와 함께 판단해야 한다.', '');

// ---- 3. 동별 판정 ----
const summary = [];
let n3 = 0;
for (const S of sets) {
  const dongs = JSON.parse(fs.readFileSync(path.join(D, S.file), 'utf8')).dongs.filter((d) => d.위도 != null);
  const missing = JSON.parse(fs.readFileSync(path.join(D, S.file), 'utf8')).dongs.length - dongs.length;
  L.push(`## 3-${++n3}. ${S.name} (${dongs.length}개 동${missing ? `, 좌표 없음 ${missing}` : ''}) — 판별 판정`, '', '표기: 초등/중학군 판정은 `2025-03-21 → 2025-09-22 → 2026-09-20` 순서, 같으면 "(3판 동일)". 경계거리(m)는 판정된 학구의 가장 가까운 경계까지(주변 학구 포함 최소).', '', '| 동 | 초등 판정 | 초등 경계거리(m) 3월·9월·26.9 | 중학군 판정 | 중학군 경계거리(m) 3월·9월·26.9 | 판 사이 변화 |', '|---|---|---|---|---|---|');
  let changed = 0, elemChanged = 0, midChanged = 0;
  const dist = (j) => j.d == null ? '-' : j.d.toFixed(1);
  for (const d of dongs) {
    const [x, y] = g.toTM(d.위도, d.경도);
    const E = V.map((v) => judge(v.elem.feats, x, y)), M = V.map((v) => judge(v.mid.feats, x, y));
    const same = (A) => A.every((a) => a.nm === A[0].nm);
    const flow = (A) => (same(A) ? `${A[0].nm} (3판 동일)` : A.map((a) => a.nm).join(' → '));
    const ec = !same(E), mc = !same(M);
    if (ec || mc) changed++; if (ec) elemChanged++; if (mc) midChanged++;
    L.push(`| ${d.동} | ${flow(E)} | ${E.map(dist).join(' · ')} | ${flow(M)} | ${M.map(dist).join(' · ')} | ${ec || mc ? `**변화**(${[ec && '초등', mc && '중학군'].filter(Boolean).join('·')})` : '없음'} |`);
  }
  const cnt = {};
  for (const d of dongs) { const [x, y] = g.toTM(d.위도, d.경도); const e = judge(V[V.length - 1].elem.feats, x, y).nm, m = judge(V[V.length - 1].mid.feats, x, y).nm; const k = `${e}|${m}`; cnt[k] = (cnt[k] || 0) + 1; }
  L.push('', `- 판 사이에 초등 또는 중학군 판정이 달라진 동: **${changed}개** (초등 ${elemChanged}, 중학군 ${midChanged}) / ${dongs.length}개 동.`, '');
  summary.push(`${S.name}: ${changed}/${dongs.length}개 동에서 변화(초등 ${elemChanged}, 중학군 ${midChanged}); 2026-09-20 판정 분포 ${Object.entries(cnt).map(([k, v]) => `${k.replace('|', '·')} ${v}개`).join(', ')}`);
}
L.push('## 4. 요약', '', ...summary.map((s) => '- ' + s), '- 세 판은 모두 매교초 개교(2025-03) 이후 자료이므로 개교 전후 변화는 이 자료로 확인 불가.', '');
fs.writeFileSync(path.join(D, 'verification_history.md'), L.join('\n'));
console.log(summary.join('\n'));
