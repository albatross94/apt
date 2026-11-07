// 실거래가 통계·PDF 분석리포트 계산 공통 모듈.
// 브라우저(index.html의 PDF 리포트 데이터 buildReportData·월별 증감률 카드)와 서버(lib/report-route.js의 /api/trades?kind=report)가
// 같은 파일을 쓴다. 그래서 건수·최저최고·층별 범위·월별 중간값·증감률이 PDF와 API에서 반드시 같다.
// (Vercel은 public/만 정적으로 내보내므로 이 파일은 public/ 아래에 둔다. 서버는 require('../public/report-stats.js')로 읽는다.)
//
// 규칙(실거래가 통계·PDF 리포트 규칙):
//  - 매매는 해제·직거래를 뺀다(keepOf). 전세·월세는 해제만 뺀다(전월세 자료에는 해제 구분이 없다).
//  - 3건 미만이면 '표본 적음', 0건이면 '거래 없음'. 범위가 1건이면 값 하나만 보여 준다.
//  - 월별 중간값은 한 달 3건 이상인 달만. 증감률은 바로 앞의 '중간값이 있는 달'과 비교하고, 비교 간격이 4개월 이상이면 '간격 큼'.
//  - 기간 전체 변화는 중간값을 낸 달이 3개월 미만이면 '표본 적음'.
//  - 층 구간: 저층 1~8, 중층 9~16, 고층 17층 이상. 면적 전체 기준이며 층·신규갱신 필터는 없다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LOW = 3;        // 이 건수 미만이면 '표본 적음'
  const GAP_FAR = 4;    // 비교 간격이 이 개월 수 이상이면 증감률 대신 '간격 큼'
  const PY = 3.3058;
  const FLOOR_BANDS = [
    { k: 'L', name: '저층', rng: '1~8층', lo: 1, hi: 8 },
    { k: 'M', name: '중층', rng: '9~16층', lo: 9, hi: 16 },
    { k: 'H', name: '고층', rng: '17층 이상', lo: 17, hi: Infinity },
  ];
  // 월세 보증금 구간(만원): [표시 이름, 이상, 미만]
  const DEPOSIT_BINS = [['보증금 5천만원 미만', 0, 5000], ['5천만원 ~ 1억원 미만', 5000, 10000], ['1억원 ~ 2억원 미만', 10000, 20000], ['2억원 이상 (반전세)', 20000, Infinity]];

  /* ---------- 기본 통계 (d3.median·min·max와 같은 결과) ---------- */
  const vals = (a, f) => { const o = []; for (const x of a) { const v = f ? f(x) : x; if (v != null && v === v) o.push(+v); } return o; };
  function median(a, f) {
    const v = vals(a, f).sort((x, y) => x - y), n = v.length;
    if (!n) return undefined;
    const i = (n - 1) * 0.5, i0 = Math.floor(i), v0 = v[i0];
    return i === i0 ? v0 : v0 + (v[i0 + 1] - v0) * (i - i0);
  }
  const minOf = (a, f) => { const v = vals(a, f); return v.length ? Math.min.apply(null, v) : undefined; };
  const maxOf = (a, f) => { const v = vals(a, f); return v.length ? Math.max.apply(null, v) : undefined; };
  const price = (t) => t.price;
  const medPrice = (a) => (a.length ? median(a, price) : null);

  /* ---------- 거래 걸러내기 ---------- */
  // 통계에 쓰는 거래: 해제(canceled)는 모든 종류에서, 직거래(gbn '직거래')는 매매에서 뺀다. kind: 'sale' | 'jeonse' | 'wolse'
  const keepOf = (kind) => (t) => !t.canceled && !(kind === 'sale' && t.gbn === '직거래');
  // 걸러내기 전 거래에서 뺀 건수. 해제된 직거래는 해제로만 센다.
  function exclCounts(allRows, kind) {
    return { canceled: allRows.filter((t) => t.canceled).length, direct: kind === 'sale' ? allRows.filter((t) => !t.canceled && t.gbn === '직거래').length : 0 };
  }

  /* ---------- 월·층 ---------- */
  function monthsRange(from, to) {   // 'YYYYMM' → ['YYYY-MM', …]
    const out = []; let y = +from.slice(0, 4), m = +from.slice(4);
    const ey = +to.slice(0, 4), em = +to.slice(4);
    while (y < ey || (y === ey && m <= em)) { out.push(y + '-' + String(m).padStart(2, '0')); if (++m > 12) { m = 1; y++; } }
    return out;
  }
  function bandIndex(floor) {   // 층 구간 번호(0 저층·1 중층·2 고층). 어느 구간에도 안 맞으면 저층
    const i = FLOOR_BANDS.findIndex((b) => floor >= b.lo && floor <= b.hi);
    return i < 0 ? 0 : i;
  }

  /* ---------- 월별 중간값과 증감률 ---------- */
  // 한 달 LOW(3)건 이상인 달만 중간값을 쓴다. 증감률은 바로 앞의 '중간값이 있는 달'과 비교하고,
  // 앞 달이 표본 부족이라 건너뛰었으면 gap(몇 개월 전과 비교했는지)을 함께 남긴다.
  function monthlyChange(rows, months, vf) {
    vf = vf || medPrice;
    const g = new Map();
    for (const t of rows) (g.get(t.ym) || g.set(t.ym, []).get(t.ym)).push(t);
    let prev = null;
    return months.map((mo, i) => {
      const v = g.get(mo) || [], m = v.length >= LOW ? vf(v) : null;
      const o = { mo, n: v.length, med: m, dep: m != null && vf !== medPrice ? medPrice(v) : null, diff: null, pct: null, gap: 0 };
      if (m != null) {
        if (prev) { o.diff = m - prev.med; o.pct = o.diff / prev.med * 100; o.gap = i - prev.i; }
        prev = { i, med: m };
      }
      return o;
    });
  }
  // 기간 전체 변화(처음 달 → 마지막 달). 중간값을 낸 달이 2개 미만이면 ok만 돌려주고, 3개월 미만이면 few(퍼센트를 내지 않는다).
  function changeSummary(L) {
    const ok = L.filter((o) => o.med != null);
    if (ok.length < 2) return { ok, a: null, b: null, tot: null, few: true, none: true };
    const a = ok[0], b = ok[ok.length - 1];
    return { ok, a, b, tot: (b.med - a.med) / a.med * 100, few: ok.length < 3, none: false };
  }

  /* ---------- 최저·최고, 층별, 구간별 ---------- */
  // val 기준 최저/최고 거래. 같은 값이 여러 건이면 가장 최근 계약일을 쓰고 나머지 건수를 more로 남긴다.
  function extreme(rows, val, v) {
    const m = rows.filter((t) => val(t) === v).sort((a, b) => (a.date < b.date ? 1 : -1));
    return { v, date: m[0].date, more: m.length - 1, dep: m[0].price, rent: m[0].rent };
  }
  function extremes(rows, val) {
    if (!rows.length) return { lo: null, hi: null };
    return { lo: extreme(rows, val, minOf(rows, val)), hi: extreme(rows, val, maxOf(rows, val)) };
  }
  // 층 구간별 건수·값. 매매 lo/hi=거래가 범위, 전세 dLo/dHi=보증금 범위, 월세 dLo/dHi=보증금·rLo/rHi=월세 범위
  function floorStats(rows, kind) {
    const out = {};
    FLOOR_BANDS.forEach((b, i) => {
      const v = rows.filter((t) => bandIndex(t.floor) === i), f = { rng: b.rng, n: v.length, med: null, dep: null, rent: null, lo: null, hi: null };
      if (v.length) {
        if (kind === 'wolse') {
          f.dep = medPrice(v); f.rent = median(v, (t) => t.rent);
          f.dLo = minOf(v, price); f.dHi = maxOf(v, price); f.rLo = minOf(v, (t) => t.rent); f.rHi = maxOf(v, (t) => t.rent);
        } else {
          f.med = medPrice(v);
          if (kind === 'jeonse') { f.dLo = minOf(v, price); f.dHi = maxOf(v, price); }
        }
      }
      if (kind === 'sale' && v.length) { f.lo = minOf(v, price); f.hi = maxOf(v, price); }   // 층별 거래가격 구간(최저~최고)
      out[b.k] = f;
    });
    return out;
  }
  // 보증금 구간별 월세(월세). rngS: 2쪽 표 표기(1건이면 값 하나), rng: 화면 표기
  function depositBands(rows, fmt) {
    return DEPOSIT_BINS.map(([lab, lo, hi]) => {
      const v = rows.filter((t) => t.price >= lo && t.price < hi);
      const rLo = v.length ? minOf(v, (t) => t.rent) : null, rHi = v.length ? maxOf(v, (t) => t.rent) : null;
      const f = fmt || String;
      return { lab, n: v.length, ok: v.length >= LOW, rLo, rHi,
        rngS: v.length ? (rLo === rHi ? f(rLo) + '만원' : f(rLo) + '~' + f(rHi) + '만원') : '-',
        rng: v.length ? f(rLo) + ' ~ ' + f(rHi) + '만원' : '-' };
    });
  }
  // 최근 6개월 기준 거래: 최근 6개월이 3건 이상이면 그 거래, 아니면 조회 전체 기간
  function recent6(rows, mlist) {
    const cutM = mlist.length > 6 ? mlist[mlist.length - 6] : mlist[0], rec6 = rows.filter((t) => t.ym >= cutM), recOk = rec6.length >= LOW;
    return { cutM, rec6, recOk, use: recOk ? rec6 : rows };
  }
  // 전세가율: 같은 기간 전세 중간값 ÷ 매매 중간값(%). 한쪽이 비면 null
  function ratioOf(a, sale) { return a.length && sale.length ? (medPrice(a) / medPrice(sale) * 100).toFixed(1) + '%' : null; }

  /* ---------- 그래프 데이터 (PDF 2쪽 점 그래프·월별 막대와 그래프 이미지가 같이 쓴다) ---------- */
  const niceStep = (span, cands, maxN) => cands.find((s) => span / s <= maxN) || cands[cands.length - 1];   // 눈금 간격: 칸 수가 maxN 이하인 가장 작은 간격
  const range = (a, b, s) => { const n = Math.max(0, Math.ceil((b - a) / s)), o = []; for (let i = 0; i < n; i++) o.push(a + i * s); return o; };   // d3.range
  const utcDay = (y, m, d) => Date.UTC(y, m - 1, d);
  // 조회 월 목록(['2025-12', …]) → 가로축 월 라벨('25.12' …, 끝에 다음 달 하나 더), 각 달 1일의 일수(starts), 계약일 → 일수(dayOf)
  function chartBase(mlist) {
    const first = utcDay(+mlist[0].slice(0, 4), +mlist[0].slice(5), 1), last = mlist[mlist.length - 1];
    let ny = +last.slice(0, 4), nm = +last.slice(5) + 1; if (nm > 12) { nm = 1; ny++; }
    const labels = mlist.concat([ny + '-' + String(nm).padStart(2, '0')]);
    const starts = labels.map((m) => Math.round((utcDay(+m.slice(0, 4), +m.slice(5), 1) - first) / 864e5));
    return { months: labels.map((m) => m.slice(2, 4) + '.' + m.slice(5)), starts, daysLast: starts[starts.length - 1],
      dayOf: (s) => Math.round((utcDay(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)) - first) / 864e5) };
  }
  // 점 그래프용 점·눈금과 월별 중간값(한 달 3건 이상인 달만). 매매·전세: 가로 계약일·세로 억 원, 월세: 가로 보증금·세로 월세
  function chartData(rows, kind, mlist) {
    const base = chartBase(mlist), kOf = (t) => 'LMH'[bandIndex(t.floor)], out = { months: base.months, starts: base.starts, daysLast: base.daysLast, dots: [], meds: [] };
    if (kind === 'wolse') {
      const maxP = maxOf(rows, price), maxR = maxOf(rows, (t) => t.rent);
      const sx = niceStep(maxP, [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000], 6), sy = niceStep(maxR, [5, 10, 20, 25, 50, 100, 200, 500, 1000], 5);
      out.xt = range(0, Math.ceil(maxP / sx) * sx + 1, sx); out.yt = range(0, Math.ceil(maxR / sy) * sy + 1, sy).reverse();
      out.dots = rows.map((t) => ({ k: kOf(t), r: t.gbn === '갱신' ? 1 : 0, x: t.price, y: t.rent }));
      out.warn = '월세는 보증금이 클수록 낮아집니다. 월세 금액만 비교하지 말고, 보증금이 비슷한 거래끼리 비교해 주세요.';
    } else {
      const lo0 = minOf(rows, (t) => t.price / 10000), hi0 = maxOf(rows, (t) => t.price / 10000), st = niceStep(hi0 - lo0 || 0.1, [0.1, 0.2, 0.5, 1, 2, 5, 10, 20], 6);
      const lo = Math.floor(lo0 / st + 1e-9) * st, hi = Math.max(Math.ceil(hi0 / st - 1e-9) * st, lo + st);
      out.ticks = range(Math.round(lo / st), Math.round(hi / st) + 1, 1).map((i) => +(i * st).toFixed(2)).reverse();
      out.dots = rows.map((t) => ({ k: kOf(t), r: t.gbn === '갱신' ? 1 : 0, d: base.dayOf(t.date), p: t.price / 10000 }));
      const g = new Map();
      for (const t of rows) (g.get(t.ym) || g.set(t.ym, []).get(t.ym)).push(t);
      for (const [ym, v] of g) { const mi = mlist.indexOf(ym); if (v.length >= LOW && mi >= 0) out.meds.push({ mi, d: base.starts[mi] + 15, p: medPrice(v) / 10000 }); }
      out.meds.sort((a, b) => a.d - b.d);
    }
    return out;
  }

  /* ---------- 표기 ---------- */
  function won(v) {   // 만원 단위 값 → '8억 5,000만원'
    const sign = v < 0 ? '−' : ''; v = Math.abs(Math.round(v));
    const e = Math.floor(v / 10000), m = v % 10000;
    if (e && m) return sign + e + '억 ' + m.toLocaleString('en-US') + '만원';
    if (e) return sign + e + '억원';
    return sign + m.toLocaleString('en-US') + '만원';
  }
  const rentTxt = (v) => (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '만원';   // 월세는 소수 첫째 자리까지(192.5만원)
  // 최저~최고: 8억 7,000만~11억 9,000만원 (앞 값의 끝 '원'을 떼어 붙인다). 같은 값이면 하나만.
  function rngTxt(lo, hi) { const a = won(lo); return lo === hi ? a : a.replace(/원$/, '') + '~' + won(hi); }
  const pctTxt = (p) => (p == null ? '—' : (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p).toFixed(1) + '%');
  const ymDot = (mo) => mo.replace('-', '.');
  // 층별 문장 조각: '저층 8억원(5건·표본 적음)'. 층 값을 구하는 함수 vf(f)가 null이면 건수만.
  function floorMedParts(floors, vf, fmt) {
    return FLOOR_BANDS.map((b) => {
      const f = floors[b.k];
      if (!(f.n > 0)) return b.name + '은 거래 없음';
      const v = vf(f);
      return v != null ? b.name + ' ' + fmt(v) + '(' + f.n + '건' + (f.n < LOW ? '·표본 적음' : '') + ')' : b.name + ' ' + f.n + '건';
    });
  }

  return { LOW, GAP_FAR, PY, FLOOR_BANDS, DEPOSIT_BINS, median, minOf, maxOf, medPrice, keepOf, exclCounts, monthsRange, bandIndex,
    monthlyChange, changeSummary, extremes, floorStats, depositBands, recent6, ratioOf, won, rentTxt, rngTxt, pctTxt, ymDot, floorMedParts, niceStep, chartBase, chartData };
});
