// 외부 패키지 없이 쓰는 지리 도구: SHP/DBF 읽기, CSV 읽기, EPSG:5186(Korea 2000 중부원점 2010) ↔ WGS84, 점-다각형 판정, 경계까지 거리
const fs = require('fs');

/* ---------- CSV (따옴표·줄바꿈 처리) ---------- */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f.replace(/\r$/, '')); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
const readCsv = (file, enc) => parseCsv(new TextDecoder(enc).decode(fs.readFileSync(file)));

/* ---------- DBF ---------- */
function readDbf(file, enc = 'euc-kr') {
  const b = fs.readFileSync(file), dec = new TextDecoder(enc);
  const n = b.readUInt32LE(4), hlen = b.readUInt16LE(8), rlen = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) {
    fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), type: String.fromCharCode(b[o + 11]), len: b[o + 16] });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    let o = hlen + i * rlen; const rec = { _del: b[o] === 0x2a }; o += 1;
    for (const f of fields) { rec[f.name] = dec.decode(b.subarray(o, o + f.len)).replace(/\0/g, '').trim(); o += f.len; }
    out.push(rec);
  }
  return out;
}

/* ---------- SHP (Polygon, type 5) → [{rings:[[ [x,y],… ],…], bbox}] ---------- */
function readShp(file) {
  const b = fs.readFileSync(file), out = [];
  if (b.readInt32BE(0) !== 9994) throw new Error('SHP 파일이 아닙니다: ' + file);
  let o = 100;
  while (o + 8 <= b.length) {
    const clen = b.readInt32BE(o + 4) * 2, s = o + 8; o = s + clen;
    const type = b.readInt32LE(s);
    if (type === 0) { out.push(null); continue; }
    if (type !== 5) throw new Error('다각형이 아닌 도형 유형: ' + type);
    const bbox = [b.readDoubleLE(s + 4), b.readDoubleLE(s + 12), b.readDoubleLE(s + 20), b.readDoubleLE(s + 28)];
    const np = b.readInt32LE(s + 36), npt = b.readInt32LE(s + 40);
    const parts = []; for (let i = 0; i < np; i++) parts.push(b.readInt32LE(s + 44 + 4 * i));
    parts.push(npt);
    const p0 = s + 44 + 4 * np, rings = [];
    for (let i = 0; i < np; i++) {
      const r = [];
      for (let k = parts[i]; k < parts[i + 1]; k++) r.push([b.readDoubleLE(p0 + 16 * k), b.readDoubleLE(p0 + 16 * k + 8)]);
      rings.push(r);
    }
    out.push({ rings, bbox });
  }
  return out;
}

/* ---------- 좌표 변환: GRS80 횡메르카토르 (중앙경선 127°, 위도원점 38°, 축척 1, 가산 X200000 Y600000) ---------- */
const A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const LON0 = 127 * Math.PI / 180, LAT0 = 38 * Math.PI / 180, FE = 200000, FN = 600000, K0 = 1;
const mer = (p) => A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * p - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * p) + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * p) - (35 * E2 ** 3 / 3072) * Math.sin(6 * p));
const M0 = mer(LAT0);

function toTM(lat, lon) {   // WGS84 위경도(도) → [x, y] (m)
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  const N = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2), T = Math.tan(p) ** 2, C = EP2 * Math.cos(p) ** 2, Aa = (l - LON0) * Math.cos(p);
  const x = FE + K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120);
  const y = FN + K0 * (mer(p) - M0 + N * Math.tan(p) * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  return [x, y];
}

function fromTM(x, y) {   // [x, y] (m) → [경도, 위도] (도)
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const M = M0 + (y - FN) / K0, mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = EP2 * Math.cos(p1) ** 2;
  const R1 = A * (1 - E2) / (1 - E2 * Math.sin(p1) ** 2) ** 1.5, D = (x - FE) / (N1 * K0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}

/* ---------- 판정 (투영 좌표 m 기준) ---------- */
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// 외곽/구멍 구분 없이 짝-홀 규칙(even-odd)으로 판정한다 (SHP는 시계=외곽, 반시계=구멍)
function inPoly(x, y, rings) {
  let c = false;
  for (const r of rings) if (inRing(x, y, r)) c = !c;
  return c;
}
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
function distBoundary(x, y, rings) {   // 모든 고리(외곽·구멍)까지의 최단거리 m
  let d = Infinity;
  for (const r of rings) for (let i = 1; i < r.length; i++) d = Math.min(d, distSeg(x, y, r[i - 1], r[i]));
  return d;
}

/* ---------- 화면 표시용 단순화 (Douglas–Peucker, 허용오차 m) ---------- */
function simplifyRing(r, tol) {
  if (r.length <= 4) return r;
  const keep = new Uint8Array(r.length); keep[0] = keep[r.length - 1] = 1;
  const st = [[0, r.length - 1]];
  while (st.length) {
    const [s, e] = st.pop(); let md = -1, mi = -1;
    for (let i = s + 1; i < e; i++) { const d = distSeg(r[i][0], r[i][1], r[s], r[e]); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([s, mi], [mi, e]); }
  }
  const o = r.filter((_, i) => keep[i]);
  return o.length >= 4 ? o : r;
}

module.exports = { readCsv, readDbf, readShp, toTM, fromTM, inPoly, distBoundary, simplifyRing };
