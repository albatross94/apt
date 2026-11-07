// 리포트 그래프 이미지: GET /api/trades?kind=report&…&chart=<이름>&format=<png|svg|gallery>
// 그래프 모양은 PDF 2쪽과 같다. 그리는 코드는 public/report-charts.js 한 곳이고(PDF와 공유), 여기서는 그 SVG를 1080px 이미지 틀
// (제목·범례·캡션·출처 줄)에 넣고, PNG는 @resvg/resvg-js로 변환한다(가로 2160px). 한글 글꼴은 lib/fonts(Noto Sans KR, OFL)를 쓴다.
const fs = require('fs');
const path = require('path');
const RS = require('../public/report-stats.js');
const RC = require('../public/report-charts.js');

const OFFICE = '아이파크자이 한산(234-1234)';
const TEL = '031-234-1234';
const W = 1080, PAD = 40, CP = 24, CW = W - 2 * PAD - 2 * CP;   // 이미지 폭, 바깥 여백, 카드 안쪽 여백, 카드 안쪽 폭(952)
const PNG_W = 2160;
const FF = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif";

const CHARTS = { trade: ['scatter', 'floor', 'monthly'], jeonse: ['scatter', 'monthly'], rent: ['scatter', 'deposit'] };
const CHART_NAMES = { scatter: '점 그래프', floor: '층별 거래가격 구간', monthly: '월별 중간값과 증감률', deposit: '보증금 구간별 월세' };
const esc = RC.esc;

/* ---------- 글자 폭 어림(줄바꿈·한 줄 맞춤용) ---------- */
function tw(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    w += ch === ' ' ? 0.28 : /[.,:;'|!]/.test(ch) ? 0.3 : /[()\[\]]/.test(ch) ? 0.36 : ch === '·' ? 0.42 : /[-~/]/.test(ch) ? 0.58 : /[0-9]/.test(ch) ? 0.6 : c < 128 ? 0.62 : 1.02;
  }
  return w * size;
}
function wrap(text, size, maxW) {
  const lines = []; let cur = '';
  for (const ch of String(text)) {
    if (tw(cur + ch, size) > maxW && cur) { const sp = cur.lastIndexOf(' '); if (sp > cur.length * 0.5 && ch !== ' ') { lines.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; } else { lines.push(cur); cur = ch === ' ' ? '' : ch; } }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
const fitSize = (text, maxW, max, min) => { let s = max; while (s > min && tw(text, s) > maxW) s -= 0.5; return s; };
const T = (x, y, txt, o) => { o = o || {}; return `<text x="${x}" y="${y}" font-size="${o.sz || 20}" font-weight="${o.w || 400}" fill="${o.fill || '#202227'}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(txt)}</text>`; };

/* ---------- 이미지 틀 ---------- */
// parts: [{ h, svg }] 위에서 아래로 쌓을 카드 안 조각(svg는 카드 안쪽 좌표(0,0)부터)
function frame(D, chartName, parts, ctx) {
  const title = `${D.complex} · 전용 ${D.sel.a}㎡ · ${D.type} · ${CHART_NAMES[chartName]}`;
  const tsz = fitSize(title, W - 2 * PAD - 70, 34, 20);
  const headH = 132;
  let y = CP, body = '';
  parts.forEach((p, i) => { body += `<g transform="translate(${CP},${y})">${p.svg}</g>`; y += p.h + (i < parts.length - 1 ? 14 : 0); });
  const cardH = y + CP, cardY = headH + 26;
  const foot = `출처: 국토교통부 실거래가 공개자료 · 조회 ${ctx.from}~${ctx.to} · 기준일 ${ctx.latest || '—'} · ${OFFICE} ${TEL}`;
  const fsz = fitSize(foot, W - 2 * PAD, 17, 12);
  const footY = cardY + cardH + 26, H = footY + 20 + 22 + 20;
  const house = '<path d="M4 26V13L15 4L26 13V26Z" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="miter"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FF}" role="img" aria-label="${esc(title)}">` +
    `<rect width="${W}" height="${H}" fill="#e6d9ce"/>` +
    `<rect width="${W}" height="${headH}" fill="#8e1b1c"/>` +
    `<svg x="${PAD}" y="${headH / 2 - 29}" width="58" height="58" viewBox="0 0 30 30">${house}</svg>` +
    T(PAD + 70, 50, '국토교통부 실거래가 공개자료 기반 분석 리포트', { sz: 19, w: 700, fill: '#fff' }) +
    T(PAD + 70, 100, title, { sz: tsz, w: 900, fill: '#fff' }) +
    `<rect x="${PAD}" y="${cardY}" width="${W - 2 * PAD}" height="${cardH}" fill="#fff"/>` + `<g transform="translate(${PAD},${cardY})">${body}</g>` +
    `<path d="M${PAD} ${footY - 16}H${W - PAD}" stroke="#423f3d" stroke-width="1.5"/>` + T(PAD, footY + 12, foot, { sz: fsz, w: 700, fill: '#423f3d' }) +
    T(PAD, footY + 12 + 26, '이 정보는 법적 효력이 없는 참고용이며, 계약 후 30일 이내 신고 제도라 최근 계약은 아직 올라오지 않았을 수 있습니다.', { sz: 14, fill: '#423f3d' }) +
    `</svg>`;
}

/* ---------- 카드 안 조각 ---------- */
const textBlock = (text, o) => {   // 줄바꿈한 글 조각
  const sz = o.sz || 20, lh = o.lh || Math.round(sz * 1.5), ls = wrap(text, sz, CW - (o.indent || 0));
  return { h: ls.length * lh, svg: ls.map((l, i) => T(o.indent || 0, sz + 2 + i * lh - 4 + (lh - sz) / 2, l, { sz, w: o.w, fill: o.fill })).join('') };
};
const heading = (text) => ({ h: 36, svg: `<rect y="4" width="10" height="28" fill="#8e1b1c"/>` + T(22, 28, text, { sz: 28, w: 700 }) });
function legendParts(D) {
  const items = RC.legendItems(D), rows = [];
  items.forEach((it, i) => {
    const y = i * 38;
    rows.push(`<svg x="0" y="${y + 4}" width="26" height="26" viewBox="0 0 14 14">${RC.SVI[it.key]}</svg>`);
    const nameW = tw(it.name, 21) + 4;
    rows.push(T(36, y + 24, it.name, { sz: 21, w: 700 }) + T(36 + nameW, y + 24, it.rest.replace(/^ /, ' '), { sz: 21, w: 400 }));
  });
  return { h: items.length * 38, svg: rows.join('') };
}
function kindParts(D) {
  const kc = RC.kindCounts(D);
  if (!kc) return null;
  const a = `신규 ${kc.nw}건`, b = `갱신(속이 빈 점) ${kc.rn}건`;
  return { h: 34, svg: `<svg x="0" y="4" width="24" height="24" viewBox="0 0 14 14">${RC.SVI.F}</svg>` + T(32, 24, a, { sz: 21, w: 700 }) +
    `<svg x="${32 + tw(a, 21) + 34}" y="4" width="24" height="24" viewBox="0 0 14 14">${RC.SVI.R}</svg>` + T(32 + tw(a, 21) + 66, 24, b, { sz: 21, w: 700 }) };
}
function chartPart(w, h, inner) {   // 666 폭 기준 그래프를 카드 폭에 맞춰 키운다
  const k = CW / w;
  return { h: Math.round(h * k), svg: `<svg x="0" y="0" width="${CW}" height="${Math.round(h * k)}" viewBox="0 0 ${w} ${h}">${inner}</svg>` };
}
const note = (text, o) => textBlock(text, Object.assign({ sz: 19, fill: '#423f3d' }, o || {}));
const warnBox = (text) => { const b = textBlock(text, { sz: 20, w: 700, indent: 16 }); return { h: b.h + 20, svg: `<rect width="${CW}" height="${b.h + 20}" fill="#e6d9ce"/><g transform="translate(0,10)">${b.svg}</g>` }; };

/* ---------- 그래프별 구성 ---------- */
function buildChart(D, name, ctx) {
  const parts = [];
  if (name === 'scatter') {
    parts.push(textBlock(RC.scatterSub(D), { sz: 20, fill: '#423f3d' }));
    if (D.type === '월세') parts.push(warnBox(D.warn));
    const kp = kindParts(D); if (kp) parts.push(kp);
    parts.push(legendParts(D));
    parts.push(chartPart(666, 218, RC.scatterInner(D)));
    if (D.type !== '월세') parts.push(note(RC.scatterCap(D)));
  } else if (name === 'floor') {
    const p = RC.floorBarsParts(D);
    parts.push(note(p.hint));
    parts.push(chartPart(p.W, p.H, p.inner));
  } else if (name === 'monthly') {
    const cols = D.months.length - 1, c0 = Math.max(0, cols - 12), p = RC.monthBarsParts(D, c0, cols);
    parts.push(note(p.sub + (p.empty ? '' : ' · ' + p.axisNote)));
    if (p.empty) parts.push(note(p.msg, { sz: 21 }));
    else { parts.push(chartPart(p.W, p.H, p.inner)); parts.push(note(p.hint)); }
  } else if (name === 'deposit') {
    parts.push(textBlock(`전용 ${D.sel.a}㎡ · ${D.kpi.n}건 · 보증금 구간별 월세 범위`, { sz: 20, fill: '#423f3d' }));
    parts.push(warnBox(D.warn));
    const rows = RC.depositRows(D), rh = 58, X2 = CW - 230, X3 = CW;
    let s = `<path d="M0 1H${CW}" stroke="#202227" stroke-width="3"/>` + T(0, 38, '보증금 구간', { sz: 22, w: 700 }) + T(X2, 38, '건수', { sz: 22, w: 700, anchor: 'end' }) + T(X3, 38, '월세 범위', { sz: 22, w: 700, anchor: 'end' }) + `<path d="M0 54H${CW}" stroke="#202227" stroke-width="1.5"/>`;
    rows.forEach((r, i) => { const y = 54 + i * rh; s += T(0, y + 38, r.lab, { sz: 26 }) + T(X2, y + 38, r.n, { sz: 26, anchor: 'end' }) + T(X3, y + 38, r.rng, { sz: 26, w: 700, anchor: 'end' }) + `<path d="M0 ${y + rh}H${CW}" stroke="${i === rows.length - 1 ? '#202227' : '#cbc8c1'}" stroke-width="${i === rows.length - 1 ? 1.5 : 1}"/>`; });
    parts.push({ h: 54 + rows.length * rh + 6, svg: s });
  }
  return frame(D, name, parts, ctx);
}

/* ---------- PNG 변환 ---------- */
// 글꼴: resvg는 글꼴이 클수록 글자마다 느려져서(6MB 원본은 PNG 하나 약 3초) 쓰는 글자만 남긴 부분집합을 쓴다(scripts/build-report-fonts.js).
// 기본은 흔한 한글 2,350자(common, 약 0.3초), SVG에 그 밖의 글자가 있으면 한글 음절 전체(full)로 만든다.
let ResvgCls = null, commonSet = null;
const fontSet = (kind) => ['Regular', 'Bold', 'Black'].map((w) => path.join(__dirname, 'fonts', `${kind}-NotoSansKR-${w}.ttf`));
function needsFullFont(svg) {
  if (!commonSet) commonSet = new Set(fs.readFileSync(path.join(__dirname, 'fonts', 'common-chars.txt'), 'utf8'));
  for (const ch of svg) if (ch.codePointAt(0) > 0x7e && !commonSet.has(ch)) return true;
  return false;
}
function toPng(svg) {
  if (!ResvgCls) ResvgCls = require('@resvg/resvg-js').Resvg;
  const r = new ResvgCls(svg, { fitTo: { mode: 'width', value: PNG_W }, background: '#e6d9ce', font: { fontFiles: fontSet(needsFullFont(svg) ? 'full' : 'common'), loadSystemFonts: false, defaultFontFamily: 'Noto Sans KR' } });
  return r.render().asPng();
}

/* ---------- 저장 파일 이름·번호 ---------- */
// 번호 순서: ①매매 점 ②매매 층별 ③매매 월별 ④전세 점 ⑤전세 월별 ⑥월세 점 ⑦월세 보증금구간
const SLOT = { 'trade/scatter': 1, 'trade/floor': 2, 'trade/monthly': 3, 'jeonse/scatter': 4, 'jeonse/monthly': 5, 'rent/scatter': 6, 'rent/deposit': 7 };
const CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦'];
const TYPE_KO = { trade: '매매', jeonse: '전세', rent: '월세' };
const CHART_KO = { scatter: '점그래프', floor: '층별', monthly: '월별', deposit: '보증금구간' };
const slotOf = (typeKey, chart) => SLOT[typeKey + '/' + chart];
const safeName = (s) => String(s).replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
// 예) 01_수원센트럴아이파크자이_59.99_매매_점그래프.png
function fileName(apt, area, typeKey, chart, ext) {
  return `${String(slotOf(typeKey, chart)).padStart(2, '0')}_${safeName(apt)}_${area}_${TYPE_KO[typeKey]}_${CHART_KO[chart]}.${ext}`;
}

/* ---------- 갤러리(HTML) ---------- */
const attr = (s) => esc(s).replace(/'/g, '&#39;');
// head: { title, meta, zips:[{ label, url, name }] }, groups: [{ title, zip:{label,url,name}|null, items:[{ svg, title, pngUrl, file }], empty:[문구] }]
function galleryHtml(head, groups) {
  const zipBtn = (z, cls) => `<a class="${cls}" href="${attr(z.url)}" download="${attr(z.name)}">${esc(z.label)}</a>`;
  const sections = groups.map((g) => `<section class="area"><div class="ah"><h2>${esc(g.title)}</h2>${g.zip && groups.length > 1 ? zipBtn(g.zip, 'save all small') : ''}</div>${g.empty ? g.empty.map((e) => `<p class="empty">${esc(e)}</p>`).join('') : ''}${g.items.map((it) => `<figure id="${attr(it.id)}"><div class="bar"><span class="ttl">${esc(it.title)}</span><a class="save" href="${attr(it.pngUrl)}" download="${attr(it.file)}">PNG 저장</a></div><div class="img">${it.svg}</div></figure>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(head.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap">
<style>:root{color-scheme:light}body{margin:0;background:#e6d9ce;color:#202227;font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:20px 16px 60px}h1{font-size:24px;margin:0 0 4px}.meta{margin:0 0 14px;color:#423f3d;font-size:14px;line-height:1.6}
.top{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 24px}
.ah{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.area{margin:0 0 36px}.area h2{font-size:21px;margin:0;padding-left:10px;border-left:8px solid #8e1b1c}
figure{margin:0 0 22px;background:#fff;border:1px solid #cbc8c1}.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #cbc8c1}
.ttl{font-size:16px;font-weight:700;min-width:0}
.save,.all{display:inline-block;flex:none;box-sizing:border-box;background:#8e1b1c;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-weight:900;font-size:16px;line-height:1.2;text-align:center;border:2px solid #8e1b1c}
.save:hover,.all:hover{background:#6f1516;border-color:#6f1516}.save:focus-visible,.all:focus-visible{outline:3px solid #202227;outline-offset:2px}
.all{background:#202227;border-color:#202227}.all:hover{background:#000;border-color:#000}.small{padding:8px 16px;font-size:14px}
.img svg{display:block;width:100%;height:auto}.empty{margin:0 0 12px;color:#423f3d;font-size:14px}
@media (max-width:600px){.bar{flex-direction:column;align-items:stretch}.save,.top .all{width:100%}.ah{flex-direction:column;align-items:stretch}.small{width:100%}}</style></head>
<body><div class="wrap"><h1>${esc(head.title)}</h1><p class="meta">${esc(head.meta)}</p>${head.zips && head.zips.length ? `<div class="top">${head.zips.map((z) => zipBtn(z, 'all')).join('')}</div>` : ''}${sections}</div></body></html>`;
}

module.exports = { CHARTS, CHART_NAMES, buildChart, toPng, galleryHtml, fileName, slotOf, CIRCLED, TYPE_KO, OFFICE, TEL, PNG_W };
