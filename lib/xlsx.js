// 외부 패키지 없이 xlsx(zip+XML)를 읽는 최소 도구. 읽기 전용, 값(문자열·숫자)만 돌려준다. 수식·서식은 무시.
// readXlsx(file) → [{ name, rows: [[셀값 …] …], merges: ['A1:B2' …] }]
const fs = require('fs');
const zlib = require('zlib');

function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip 형식이 아닙니다.');
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const ln = buf.readUInt16LE(lo + 26), le = buf.readUInt16LE(lo + 28), ds = lo + 30 + ln + le;
    const raw = buf.subarray(ds, ds + csize);
    files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nl + el + cl;
  }
  return files;
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const colIdx = (ref) => { let n = 0; for (const c of ref.replace(/\d/g, '')) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

function readXlsx(file) {
  const z = unzip(fs.readFileSync(file));
  // 네임스페이스 접두사(<x:sheet> 등)가 있는 파일도 읽도록 접두사를 걷어 낸다
  const txt = (n) => (z[n] ? z[n].toString('utf8').replace(/<(\/?)[a-zA-Z0-9]+:(?=[a-zA-Z])/g, '<$1') : '');
  const ss = [];
  for (const m of txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const wb = txt('xl/workbook.xml'), rels = txt('xl/_rels/workbook.xml.rels');
  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = (m[0].match(/\bId="([^"]*)"/) || [])[1], t = (m[0].match(/\bTarget="([^"]*)"/) || [])[1]; if (id) relTarget[id] = t; }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc((m[0].match(/\bname="([^"]*)"/) || [])[1] || ''), rid = (m[0].match(/\br:id="([^"]*)"/) || [])[1];
    let t = relTarget[rid] || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
    const xml = txt(t), rows = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = (rm[0].match(/\br="(\d+)"/) || [])[1], row = [];
      for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1], type = (attrs.match(/\bt="([^"]*)"/) || [])[1], body = cm[2] || '';
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (type === 's') val = ss[Number(v)] ?? '';
        else if (type === 'inlineStr') val = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (v !== undefined) val = type === 'str' ? unesc(v) : (isNaN(Number(v)) ? unesc(v) : Number(v));
        row[ref ? colIdx(ref) : row.length] = val;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      rows[(r ? Number(r) : rows.length + 1) - 1] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows, merges: [...xml.matchAll(/<mergeCell\b[^>]*\bref="([^"]*)"/g)].map((x) => x[1]) });
  }
  return sheets;
}
module.exports = { readXlsx };
