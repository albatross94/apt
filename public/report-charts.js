// PDF 분석리포트 2쪽의 그래프를 그리는 공통 모듈(점 그래프·층별 거래가격 구간 막대·월별 중간값과 증감률 막대, 범례·캡션 문구).
// 브라우저(public/report.js, PDF)와 서버(lib/report-image.js, 그래프 이미지)가 같은 파일을 쓴다. 그래서 점 모양·색·눈금·라벨이 PDF와 이미지에서 같다.
// 입력 D는 buildReportData()(화면) 또는 lib/report-route.js의 reportData()(서버)가 report-stats.js 결과로 만든 같은 모양의 객체다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./report-stats.js'));
  else root.ReportCharts = factory(root.ReportStats);
})(typeof self !== 'undefined' ? self : this, function (RS) {
  'use strict';
  var FL = [['L', '저층'], ['M', '중층'], ['H', '고층']];
  var COL = { L: '#423f3d', M: '#ae353d', H: '#dfc10e' };
  var FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif";
  var fmt = RS.won, rngTxt = RS.rngTxt;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* 점 모양: 저층=회색 원, 중층=빨강 사각, 고층=노랑 삼각. 속이 빈 점은 갱신 계약 */
  function mark(k, r, x, y) {
    var f = function (v) { return v.toFixed(1); };
    if (k === 'L') return r ? '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="3" fill="#fff" stroke="#423f3d" stroke-width="1.5"/>' : '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="3" fill="#423f3d" fill-opacity="0.6"/>';
    if (k === 'M') return r ? '<rect x="' + f(x - 2.3) + '" y="' + f(y - 2.3) + '" width="4.6" height="4.6" fill="#fff" stroke="#ae353d" stroke-width="1.5"/>' : '<rect x="' + f(x - 2.6) + '" y="' + f(y - 2.6) + '" width="5.2" height="5.2" fill="#ae353d"/>';
    var p = 'M' + f(x) + ' ' + f(y - 4.6) + 'L' + f(x + 4.6) + ' ' + f(y + 3.6) + 'L' + f(x - 4.6) + ' ' + f(y + 3.6) + 'Z';
    return r ? '<path d="' + p + '" fill="#fff" stroke="#202227" stroke-width="1.5"/>' : '<path d="' + p + '" fill="#dfc10e" stroke="#202227" stroke-width="1"/>';
  }
  // 범례용 14px 기호
  var SV = {
    L: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="#423f3d" fill-opacity="0.6"/></svg>',
    M: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="#ae353d"/></svg>',
    H: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5L12.5 12L1.5 12Z" fill="#dfc10e" stroke="#202227" stroke-width="1"/></svg>',
    V: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M0 7H14" stroke="#202227" stroke-width="2"/><circle cx="7" cy="7" r="3.5" fill="#fff" stroke="#202227" stroke-width="2"/></svg>',
    F: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="#202227"/></svg>',
    R: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="#fff" stroke="#202227" stroke-width="2"/></svg>' };
  // 범례 기호의 안쪽 도형(이미지에서 14px 기호를 원하는 크기로 그릴 때 쓴다)
  var SVI = {};
  Object.keys(SV).forEach(function (k) { SVI[k] = SV[k].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); });

  var SVGF = 'font-family:\'Noto Sans KR\',\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif';
  function svgBox(w, h, label, inner) { return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(label) + '" style="display:block;' + SVGF + '">' + inner + '</svg>'; }
  function svgT(x, y, txt, o) { o = o || {}; return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.sz || 12) + '"' + (o.b ? ' font-weight="700"' : '') + ' fill="' + (o.fill || '#423f3d') + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.halo ? ' stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"' : '') + '>' + esc(txt) + '</text>'; }
  function ymKo(p) { var m = /(\d{4})\.(\d{2}) ~ (\d{4})\.(\d{2})/.exec(p); return m ? m[1] + '년 ' + (+m[2]) + '월 ~ ' + m[3] + '년 ' + (+m[4]) + '월' : p; }

  /* ---------- 점 그래프 (666×218) ---------- */
  function scatterLabel(D) {
    return D.type === '월세' ? '전용 ' + D.sel.a + '㎡ 월세 ' + D.kpi.n + '건의 보증금과 월세 분포' : '전용 ' + D.sel.a + '㎡ ' + D.type + ' ' + D.kpi.n + '건의 계약일별 거래 금액 산점도';
  }
  function scatterInner(D) {
    var f1 = function (v) { return v.toFixed(1); }, top = 8, H = 182;
    if (D.type === '월세') {
      var X0 = 52, X1 = 640, xt = D.xt, yt = D.yt, maxX = xt[xt.length - 1], maxY = yt[0], g = '', yl = '', xl = '';
      yt.forEach(function (v, i) { var y = top + (maxY - v) / maxY * H; if (v > 0) g += '<path d="M44 ' + f1(y) + 'H658"/>'; yl += '<text x="38" y="' + f1(y + (i === 0 ? 6 : i === yt.length - 1 ? 2 : 4)) + '">' + v + '만</text>'; });
      xt.forEach(function (v) { var x = X0 + v / maxX * (X1 - X0); xl += '<text x="' + f1(x) + '" y="212">' + (v === 0 ? '0' : v < 10000 ? (v / 1000) + '천만' : (v / 10000) + '억') + '</text>'; });
      var dots = D.dots.map(function (p) { return mark(p.k, p.r, X0 + p.x / maxX * (X1 - X0), top + (maxY - Math.max(0, Math.min(maxY, p.y))) / maxY * H); }).join('');
      return '<g stroke="#cbc8c1" stroke-width="1">' + g + '</g><path d="M44 190H658" stroke="#423f3d" stroke-width="1"/><g font-size="12" fill="#423f3d" text-anchor="end">' + yl + '</g><g font-size="12" fill="#423f3d" text-anchor="middle">' + xl + '</g>' + dots;
    }
    var X0t = 50, X1t = 646, tk = D.ticks, maxT = tk[0], minT = tk[tk.length - 1], n = tk.length;
    var xs = function (d) { return X0t + d / D.daysLast * (X1t - X0t); };
    var ys = function (p) { p = Math.max(minT, Math.min(maxT, p)); return top + (maxT - p) / (maxT - minT) * H; };
    var g2 = '', yl2 = '';
    tk.forEach(function (t, i) { var y = top + i * H / (n - 1); if (i < n - 1) g2 += '<path d="M44 ' + f1(y) + 'H658"/>'; yl2 += '<text x="38" y="' + f1(y + (i === 0 ? 6 : i === n - 1 ? 2 : 4)) + '">' + t.toFixed(1) + '억</text>'; });
    var stp = D.months.length > 30 ? 6 : D.months.length > 14 ? 3 : 1; var xl2 = D.months.map(function (m, i) { return i % stp ? '' : '<text x="' + f1(xs(D.starts[i])) + '" y="212">' + m + '</text>'; }).join('');
    var dots2 = D.dots.map(function (p) { return mark(p.k, p.r, xs(p.d), ys(p.p)); }).join('');
    return '<g stroke="#cbc8c1" stroke-width="1">' + g2 + '</g><path d="M44 190H658" stroke="#423f3d" stroke-width="1"/><g font-size="12" fill="#423f3d" text-anchor="end">' + yl2 + '</g><g font-size="12" fill="#423f3d" text-anchor="middle">' + xl2 + '</g>' + dots2;
  }
  function scatterSvg(D) { return svgBox(666, 218, scatterLabel(D), scatterInner(D)); }

  // 범례: 층 구간별(저·중·고층) 건수와 값 범위. rest는 이름 뒤에 붙는 글(앞 공백 포함)
  function legendItems(D) {
    var T = D.type;
    return FL.map(function (z) {
      var f = D.floors[z[0]], rest;
      if (T === '월세') {
        // 월세: 층별 보증금·월세 범위(1건이면 그 값 하나, 0건이면 거래 없음)
        var wr = !f.n ? ' · 거래 없음' : f.dLo == null ? '' : ' · 보증금 ' + rngTxt(f.dLo, f.dHi) + ' · 월세 ' + rngTxt(f.rLo, f.rHi);
        rest = (f.n ? ' ' + f.n + '건' : '') + wr;
      } else if (T === '전세') {
        // 전세: 층별 보증금 범위(1건이면 그 값 하나, 0건이면 거래 없음)
        var jr = !f.n ? ' · 거래 없음' : f.dLo == null ? '' : ' · 보증금 ' + rngTxt(f.dLo, f.dHi);
        rest = (f.n ? ' ' + f.n + '건' : '') + jr;
      } else rest = ' ' + (f.rng || '') + ' · ' + f.n + '건';
      return { key: z[0], name: z[1], rest: rest };
    });
  }
  // 전세·월세: 신규·갱신 건수(매매는 없음)
  function kindCounts(D) {
    if (D.type === '매매') return null;
    var k = D.kpi;
    return { nw: D.legNew != null ? D.legNew : k.newN, rn: D.legRenew != null ? D.legRenew : k.renewN };
  }
  function scatterSub(D) {
    var k = D.kpi, T = D.type, head = '전용 ' + D.sel.a + '㎡ · ' + k.n + '건 · 점 하나가 거래 한 건입니다 ';
    return head + (T === '매매' ? '(계약일 · 금액)' : T === '전세' ? '(계약일 · 보증금)' : '(가로 보증금 · 세로 월세)');
  }
  function scatterCap(D) {   // 월세는 캡션 없음
    if (D.type === '월세') return '';
    var k = D.kpi, minT = D.ticks[D.ticks.length - 1];
    return '표본 ' + k.n + '건 · ' + ymKo(D.period) + (k.lo && k.hi ? ' · 최저 ' + fmt(k.lo.v) + ' · 최고 ' + fmt(k.hi.v) : '') + '. 세로축은 0원이 아니라 ' + minT.toFixed(1) + '억 원에서 시작하니 눈금의 숫자를 함께 읽어 주세요.';
  }

  /* ---------- 층별 거래가격 구간(매매): 층마다 최저~최고 가로 막대와 건수 (666×H) ---------- */
  // 3건 미만인 층은 막대 대신 '표본 적음'. 색은 점 그래프의 층 색과 같다.
  function floorBarsParts(D) {
    var rows = FL.map(function (z) { var f = D.floors[z[0]]; return { k: z[0], name: z[1], f: f, ok: f.n >= 3 && f.lo != null }; });
    var okR = rows.filter(function (r) { return r.ok; });
    var W = 666, BX0 = 124, BX1 = 448, RH = 36, top = 6, H = top + RH * 3 + 24, x, ticks = [], t0 = 0, t1 = 1, s = '';
    if (okR.length) {
      var lo = Infinity, hi = -Infinity;
      okR.forEach(function (r) { lo = Math.min(lo, r.f.lo / 1e4); hi = Math.max(hi, r.f.hi / 1e4); });
      var span = hi - lo, step = [0.1, 0.2, 0.5, 1, 2, 5, 10].filter(function (v) { return span / v <= 5; })[0] || 10;
      t0 = Math.floor(lo / step + 1e-9) * step; t1 = Math.ceil(hi / step - 1e-9) * step; if (t1 <= t0) t1 = t0 + step;
      for (var q = 0, nq = Math.round((t1 - t0) / step); q <= nq; q++) ticks.push(+(t0 + q * step).toFixed(2));
      x = function (v) { return BX0 + (v - t0) / (t1 - t0) * (BX1 - BX0); };
      ticks.forEach(function (t) { s += '<path d="M' + x(t).toFixed(1) + ' ' + top + 'V' + (top + RH * 3) + '" stroke="#cbc8c1" stroke-width="1"/>' + svgT(x(t), top + RH * 3 + 16, t.toFixed(1) + '억', { sz: 11, anchor: 'middle' }); });
      s += '<path d="M' + BX0 + ' ' + (top + RH * 3) + 'H' + BX1 + '" stroke="#423f3d" stroke-width="1"/>';
    }
    rows.forEach(function (r, i) {
      var cy = top + RH * i + RH / 2, f = r.f;
      s += mark(r.k, 0, 9, cy - 7) + svgT(20, cy - 1.5, r.name, { sz: 14, b: 1, fill: '#202227' }) + svgT(20, cy + 14.5, f.rng || '', { sz: 10 });   // 층 구간(몇 층~몇 층)은 작은 글씨
      if (r.ok) {
        var x1 = x(f.lo / 1e4), x2 = x(f.hi / 1e4);
        s += '<rect x="' + x1.toFixed(1) + '" y="' + (cy - 8) + '" width="' + Math.max(x2 - x1, 4).toFixed(1) + '" height="16" fill="' + COL[r.k] + '"' + (r.k === 'L' ? ' fill-opacity="0.6"' : '') + (r.k === 'H' ? ' stroke="#202227" stroke-width="1"' : '') + '/>' +
          svgT(W, cy + 5, rngTxt(f.lo, f.hi) + ' (' + f.n + '건)', { sz: 13, b: 1, anchor: 'end', fill: '#202227' });
      } else {
        s += svgT(BX0 + 4, cy + 5, f.n > 0 ? '표본 적음' : '거래 없음', { sz: 13 }) + (f.n > 0 ? svgT(W, cy + 5, '(' + f.n + '건)', { sz: 13, anchor: 'end' }) : '');
      }
    });
    return { W: W, H: H, inner: s, label: '전용 ' + D.sel.a + '㎡ 층별 거래가격 구간(최저~최고)', svg: svgBox(W, H, '전용 ' + D.sel.a + '㎡ 층별 거래가격 구간(최저~최고)', s),
      hint: "막대는 최저~최고 · 3건 미만인 층은 '표본 적음' · 층 구간·색은 위 점 그래프와 같음" };
  }

  /* ---------- 월별 중간값과 증감률 (매매·전세, 666×236) ---------- */
  // 앱 monthlyChange와 같은 규칙: 3건 이상인 달(D.meds)끼리만 비교하고, 바로 앞 달이 비어 있으면 중간값이 있는 가장 가까운 앞 달과 비교하며 'N개월 전'을 작게 덧붙인다.
  // 비교 간격이 4개월 이상이면 막대 없이 '간격 큼'. 첫 표시 달의 비교 대상이 표시 구간(최근 12개월) 밖에 있어도 그 값을 쓴다. 계산은 억 단위 원값으로 하고 표시만 소수 첫째 자리.
  function chgMap(D) {
    var byM = {}, prev = null;
    D.meds.slice().sort(function (a, b) { return a.mi - b.mi; }).forEach(function (m) {
      if (prev) byM[m.mi] = { pc: (m.p - prev.p) / prev.p * 100, gap: m.mi - prev.mi };
      prev = m;
    });
    return byM;
  }
  // 위 = 월별 중간값 꺾은선+점, 아래 = 전월 대비 증감률 막대. 월 축(가로)을 공유한다. 3건 미만인 달은 점이 없고 선도 끊는다. 중간값 세로축은 0이 아니라 값 범위에 맞춘다.
  function monthBarsParts(D, c0, cols) {
    var byM = chgMap(D), n = cols - c0, W = 666, H = 236, ML = 44, i, any = false, pos = 0, neg = 0;
    var aT = 24, aB = 92, pT = 114, pB = 180, labY = 215, gapY = 231;   // 위 패널(꺾은선) 24~92, 아래 패널(막대) 114~180
    var medBy = {}; D.meds.forEach(function (m) { medBy[m.mi] = m; });
    var vals = [];
    for (i = c0; i < cols; i++) { var c = byM[i]; if (c) { any = true; if (c.gap < RS.GAP_FAR) { pos = Math.max(pos, c.pc); neg = Math.max(neg, -c.pc); } } if (medBy[i]) vals.push(medBy[i].p); }
    var sub = '3건 이상인 달끼리' + (cols - c0 < cols ? ' · 최근 12개월' : '');
    if (!any || vals.length < 2) return { empty: true, sub: sub, msg: '한 달에 3건 이상인 달이 둘 이상 없어 중간값 추이와 증감률을 그리지 않았습니다.' };
    // 중간값 세로축: 값 범위에 맞춘 눈금(억 원)
    var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals), span = vmax - vmin;
    var step = [0.1, 0.2, 0.5, 1, 2, 5, 10].filter(function (v) { return span / v <= 3; })[0] || 10;
    var lo = Math.floor(vmin / step + 1e-9) * step, hi = Math.ceil(vmax / step - 1e-9) * step; if (hi <= lo) hi = lo + step;
    var yv = function (v) { return aB - (v - lo) / (hi - lo) * (aB - aT); };
    var cw = (W - ML) / n, bw = Math.min(30, cw * 0.56), cx = function (j) { return ML + (j + 0.5) * cw; }, s = '';
    // 위 패널: 눈금선·눈금 라벨
    for (var q = 0, nq = Math.round((hi - lo) / step); q <= nq; q++) {
      var tv = lo + q * step;
      s += '<path d="M' + ML + ' ' + yv(tv).toFixed(1) + 'H' + W + '" stroke="#cbc8c1" stroke-width="1"/>' + svgT(ML - 6, yv(tv) + 4, tv.toFixed(1) + '억', { sz: 11, anchor: 'end' });
    }
    // 꺾은선: 이어진 달끼리만 잇고(3건 미만인 달에서 끊음), 점마다 위에 중간값
    var runs = [], cur = [], lab = [];
    for (i = c0; i < cols; i++) {
      var m = medBy[i];
      if (m) { cur.push({ j: i - c0, x: cx(i - c0), y: yv(m.p), p: m.p }); }
      else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    runs.forEach(function (r) { if (r.length > 1) s += '<polyline points="' + r.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '" fill="none" stroke="#202227" stroke-width="2.2" stroke-linejoin="round"/>'; });
    var all = [].concat.apply([], runs), r2 = function (v) { return (Math.round(v * 100 + 1e-7) / 100).toFixed(2); };
    all.forEach(function (p) {
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5" fill="#fff" stroke="#202227" stroke-width="2"/>';
      var txt = r2(p.p) + '억', ly = p.y - 8, prev = lab[lab.length - 1];
      // 이웃 라벨과 가로로 겹치면 아래쪽에 표시해 간격을 둔다
      if (prev && Math.abs(p.x - prev.x) < txt.length * 5.6 + 4 && prev.above) ly = p.y + 16;
      lab.push({ x: p.x, above: ly < p.y });
      s += svgT(p.x, ly, txt, { sz: 10, anchor: 'middle', fill: '#202227', halo: 1, b: 1 });
    });
    // 아래 패널: 증감률 막대
    var total = Math.max(pos + neg, 1), unit = (pB - pT) / total, y0 = pT + pos * unit;
    s += '<path d="M' + ML + ' ' + y0.toFixed(1) + 'H' + W + '" stroke="#423f3d" stroke-width="1"/>' + svgT(ML - 6, y0 + 4, '0%', { sz: 11, anchor: 'end' });
    for (i = c0; i < cols; i++) {
      var j = i - c0, x = cx(j), cc = byM[i];
      s += svgT(x, labY, D.months[i], { sz: 12, anchor: 'middle' });
      if (!cc) continue;
      if (cc.gap >= RS.GAP_FAR) { s += svgT(x, y0 - 6, '간격 큼', { sz: 11, anchor: 'middle', fill: '#6b6560' }); }
      else {
        var up = cc.pc > 0, dn = cc.pc < 0, col = up ? '#c0392b' : dn ? '#1f5fa8' : '#423f3d', h = Math.abs(cc.pc) * unit;
        if (cc.pc !== 0) h = Math.max(h, 1.5);
        s += '<rect x="' + (x - bw / 2).toFixed(1) + '" y="' + (cc.pc >= 0 ? y0 - h : y0).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + col + '"/>' +
          svgT(x, cc.pc >= 0 ? y0 - h - 4 : y0 + h + 13, (up ? '▲' : dn ? '▼' : '') + Math.abs(cc.pc).toFixed(1) + '%', { sz: 12, b: 1, anchor: 'middle', fill: col });
      }
      if (cc.gap > 1) s += svgT(x, gapY, cc.gap + '개월 전', { sz: 10, anchor: 'middle' });
    }
    var label = '전용 ' + D.sel.a + '㎡ 월별 중간값 꺾은선과 증감률 막대그래프';
    return { empty: false, sub: sub, axisNote: '중간값 세로축은 0이 아니라 ' + lo.toFixed(1) + '억부터', W: W, H: H, inner: s, label: label, svg: svgBox(W, H, label, s),
      hint: "위: 월별 중간값 · 아래: 증감률(붉은 ▲ 상승, 파란 ▼ 하락) · 앞 달이 비면 'N개월 전' · 4개월 이상 떨어지면 '간격 큼'" };
  }

  /* ---------- 보증금 구간별 월세 표 (월세) ---------- */
  function depositRows(D) { return (D.tiers || []).map(function (t) { return { lab: t.lab, n: t.n, rng: t.rngS }; }); }

  return { FL: FL, COL: COL, FONT: FONT, SV: SV, SVI: SVI, esc: esc, mark: mark, svgT: svgT, svgBox: svgBox, ymKo: ymKo,
    scatterLabel: scatterLabel, scatterInner: scatterInner, scatterSvg: scatterSvg, legendItems: legendItems, kindCounts: kindCounts, scatterSub: scatterSub, scatterCap: scatterCap,
    floorBarsParts: floorBarsParts, chgMap: chgMap, monthBarsParts: monthBarsParts, depositRows: depositRows };
});
