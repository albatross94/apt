// 리포트 데이터 조회: GET /api/trades?kind=report&apt=<단지명>&area=<면적|all>&months=12&type=all[&format=text][&list=areas][&lawd=41115][&dong=<동>]
// 그래프 이미지: …&type=<trade|jeonse|rent>&chart=<scatter|floor|monthly|deposit|all>&format=<png|svg|gallery|zip> (lib/report-image.js, lib/zip.js)
// PDF 분석리포트에 들어가는 계산 결과를 JSON(또는 한국어 텍스트)으로 돌려준다. 계산은 PDF 화면과 같은 public/report-stats.js를 쓴다.
// Vercel Hobby 함수 한도 때문에 별도 api 파일을 만들지 않고 기존 trades 라우트(lib/core.js)가 kind=report로 이 파일을 부른다.
const RS = require('../public/report-stats.js');

const SOURCE = '국토교통부 실거래가 공개자료';
const TYPE_KEYS = { trade: 'sale', jeonse: 'jeonse', rent: 'wolse' };   // 요청 type → 내부 종류
const TYPE_NAMES = { sale: '매매', jeonse: '전세', wolse: '월세' };
const OUT_KEY = { sale: 'trade', jeonse: 'jeonse', wolse: 'rent' };
const DEFAULT_LAWD = '41115';   // 앱 기본 조회 지역(수원시 팔달구). lawd로 바꾼다.

const fail = (status, error, extra) => ({ status, body: { error, ...(extra || {}) }, maxAge: 0 });

/* ---------- 표기 도우미 ---------- */
const money = (manwon) => ({ won: Math.round(manwon * 10000), display: RS.won(manwon) });
const rentMoney = (manwon) => ({ won: Math.round(manwon * 10000), display: RS.rentTxt(manwon) });
const rng = (lo, hi, mf) => (lo == null ? null : { min: mf(lo), max: mf(hi), display: RS.rngTxt(lo, hi) });
const sampleOf = (n) => (n === 0 ? '거래 없음' : n < RS.LOW ? '표본 적음' : null);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

function ext(x, mf) {   // 최저·최고 거래
  if (!x) return null;
  const o = { amount: mf(x.v), date: x.date, more: x.more, moreText: x.more > 0 ? `외 ${x.more}건` : null };
  return o;
}

function floorsOut(floors, kind) {
  return RS.FLOOR_BANDS.map((b) => {
    const f = floors[b.k], n = f.n;
    const o = { floor: b.name, range: b.rng, count: n, sample: sampleOf(n) };
    if (kind === 'wolse') {
      o.deposit = n ? rng(f.dLo, f.dHi, money) : null;
      o.rent = n ? { min: rentMoney(f.rLo), max: rentMoney(f.rHi), display: RS.rngTxt(f.rLo, f.rHi) } : null;
    } else {
      const lo = kind === 'sale' ? f.lo : f.dLo, hi = kind === 'sale' ? f.hi : f.dHi;
      o.priceRange = n ? rng(lo, hi, money) : null;   // 최저~최고(중간값 없음). 1건이면 값 하나(display)
    }
    return o;
  });
}

function monthlyOut(L, rent) {
  const mf = rent ? rentMoney : money;
  return L.map((o, i) => {
    const e = { month: o.mo, count: o.n, median: o.med != null ? mf(o.med) : null, sample: o.med != null ? null : (o.n ? '표본 적음' : '거래 없음') };
    if (rent) e.depositMedian = o.dep != null ? money(o.dep) : null;
    if (o.pct == null) { e.comparedTo = null; e.diff = null; e.changePct = null; e.change = o.med != null ? '비교 달 없음' : null; }
    else {
      e.comparedTo = L[i - o.gap].mo;
      e.diff = { sign: o.diff > 0 ? '+' : o.diff < 0 ? '−' : '', amount: mf(Math.abs(o.diff)) };
      e.gapMonths = o.gap;
      if (o.gap >= RS.GAP_FAR) { e.changePct = null; e.change = '간격 큼'; e.basis = `${o.gap}개월 전 대비`; }
      else { e.changePct = r2(o.pct); e.change = RS.pctTxt(o.pct); e.basis = o.gap > 1 ? `${o.gap}개월 전 대비` : '전월 대비'; }
    }
    return e;
  });
}

function trendOut(L, rent) {
  const mf = rent ? rentMoney : money, cs = RS.changeSummary(L);
  const withMed = cs.ok.length;
  let overall, latest = null;
  if (cs.none) overall = { status: `한 달 ${RS.LOW}건 이상인 달이 ${withMed}개뿐이라 증감률을 낼 수 없음`, monthsWithMedian: withMed, from: null, to: null, changePct: null, change: null };
  else {
    overall = { status: cs.few ? '표본 적음' : null, monthsWithMedian: withMed,
      from: { month: cs.a.mo, median: mf(cs.a.med) }, to: { month: cs.b.mo, median: mf(cs.b.med) },
      changePct: cs.few ? null : r2(cs.tot), change: cs.few ? '표본 적음' : RS.pctTxt(cs.tot) };
    const b = cs.b, far = b.gap >= RS.GAP_FAR;
    latest = { month: b.mo, comparedTo: L[L.indexOf(b) - b.gap].mo, changePct: far ? null : r2(b.pct), change: far ? '간격 큼' : RS.pctTxt(b.pct),
      basis: b.gap > 1 ? `${b.gap}개월 전 대비` : '전월 대비', diff: { sign: b.diff > 0 ? '+' : b.diff < 0 ? '−' : '', amount: mf(Math.abs(b.diff)) } };
  }
  return { overall, latest };
}

function recent6Out(rows, mlist, kind) {
  const { cutM, rec6, recOk, use } = RS.recent6(rows, mlist);
  const fr = RS.floorStats(use, 'sale');   // 층별 거래가·보증금(price)의 최저~최고
  const o = {
    basis: recOk ? `최근 6개월(${cutM.replace('-', '.')}~) 거래 ${use.length}건` : `조회 전체 기간(최근 6개월 ${rec6.length}건뿐) 거래 ${use.length}건`,
    window: recOk ? { from: cutM, to: mlist[mlist.length - 1] } : { from: mlist[0], to: mlist[mlist.length - 1] },
    usedRecent6: recOk, count: use.length, sample: sampleOf(use.length),
    range: use.length ? rng(RS.minOf(use, (t) => t.price), RS.maxOf(use, (t) => t.price), money) : null,
    floors: RS.FLOOR_BANDS.map((b) => { const f = fr[b.k]; return { floor: b.name, range: b.rng, count: f.n, sample: sampleOf(f.n), priceRange: f.n ? rng(f.lo, f.hi, money) : null }; }),
  };
  if (kind === 'wolse') {
    o.depositMedian = use.length ? money(RS.medPrice(use)) : null;
    o.rentMedian = use.length ? rentMoney(RS.median(use, (t) => t.rent)) : null;
    o.rangeIsDeposit = true;
  }
  return o;
}

/* ---------- 한 면적·한 종류 ---------- */
function kindReport(kind, rows, saleRows, mlist) {
  const n = rows.length;
  if (!n) return { count: 0, sample: '거래 없음' };
  const nw = rows.filter((t) => t.gbn === '신규'), rn = rows.filter((t) => t.gbn === '갱신');
  const floors = RS.floorStats(rows, kind);
  if (kind === 'wolse') {
    const ex = RS.extremes(rows, (t) => t.rent), L = RS.monthlyChange(rows, mlist, (v) => RS.median(v, (t) => t.rent));
    return {
      count: n, sample: sampleOf(n),
      summary: {
        count: n, newCount: nw.length, renewCount: rn.length,
        lowestRent: { ...ext(ex.lo, rentMoney), deposit: money(ex.lo.dep) }, highestRent: { ...ext(ex.hi, rentMoney), deposit: money(ex.hi.dep) },
        depositRange: rng(RS.minOf(rows, (t) => t.price), RS.maxOf(rows, (t) => t.price), money),
      },
      depositBands: RS.depositBands(rows, (v) => v.toLocaleString('en-US')).map((b) => ({ band: b.lab, count: b.n, sample: sampleOf(b.n), rentRange: b.n ? { min: rentMoney(b.rLo), max: rentMoney(b.rHi), display: b.rngS } : null })),
      floors: floorsOut(floors, kind),
      monthly: monthlyOut(L, true), ...trendOut(L, true),
      monthlyNote: '월세는 보증금이 클수록 낮아지므로, 달마다 거래된 보증금이 다르면 월세 증감이 시세 변화가 아니라 보증금 구성 차이로 생긴 변화일 수 있습니다. 보증금 중간값을 함께 보고, 보증금이 비슷한 거래끼리 비교해 주세요.',
      points: rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((t) => ({ date: t.date, depositWon: Math.round(t.price * 10000), rentWon: Math.round(t.rent * 10000), floor: t.floor })),
      recent6: recent6Out(rows, mlist, kind),
    };
  }
  const ex = RS.extremes(rows, (t) => t.price), L = RS.monthlyChange(rows, mlist);
  const out = {
    count: n, sample: sampleOf(n),
    summary: { count: n, lowest: ext(ex.lo, money), highest: ext(ex.hi, money) },
    floors: floorsOut(floors, kind),
    monthly: monthlyOut(L, false), ...trendOut(L, false),
    points: rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((t) => ({ date: t.date, won: Math.round(t.price * 10000), display: RS.won(t.price), floor: t.floor })),
    recent6: recent6Out(rows, mlist, kind),
  };
  if (kind === 'jeonse') {
    out.summary.newCount = nw.length; out.summary.renewCount = rn.length;
    out.floorMedianSentence = '층별 중간값은 ' + RS.floorMedParts(floors, (f) => f.med, RS.won).join(' · ') + '.';
    const r = RS.ratioOf(rows, saleRows), rNew = RS.ratioOf(nw, saleRows);
    out.jeonseRatio = r ? { ratio: parseFloat(r), display: r, newOnly: rNew, formula: `전세 중간값 ${RS.won(RS.medPrice(rows))} ÷ 매매 중간값 ${RS.won(RS.medPrice(saleRows))}`, note: '같은 기간·같은 면적의 매매 중간값과 비교한 값입니다. 대출 등 권리관계는 반영되지 않았습니다.' } : null;
  }
  return out;
}

function areaReport(ctx, area) {
  const mlist = ctx.mlist, res = {};
  const meta = { ...ctx.meta, area: { exclusiveM2: area, label: `${area}㎡`, pyeong: Math.round(area / RS.PY) } };
  const sel = (k) => ctx.rows[k].filter((t) => t.area === area);
  const kept = { sale: sel('sale').filter(RS.keepOf('sale')), jeonse: sel('jeonse').filter(RS.keepOf('jeonse')), wolse: sel('wolse').filter(RS.keepOf('wolse')) };
  if (ctx.types.includes('sale')) meta.tradeExcluded = RS.exclCounts(sel('sale'), 'sale');
  res.meta = meta;
  for (const k of ctx.types) res[OUT_KEY[k]] = kindReport(k, kept[k], kept.sale, mlist);
  return res;
}

/* ---------- 데이터 불러오기·단지 찾기 ---------- */
const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
function dice(a, b) {
  const g = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const x = g(a), y = g(b); let hit = 0;
  for (const [k, n] of x) hit += Math.min(n, y.get(k) || 0);
  return (2 * hit) / (Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0) || 1);
}

async function loadRows(deps, lawd, months, needSale, needRent) {
  const jobs = [];
  for (const ym of months) { if (needSale) jobs.push([ym, false]); if (needRent) jobs.push([ym, true]); }
  const res = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; res[i] = await deps.fetchMonth(lawd, jobs[i][0], jobs[i][1]); }
  }));
  const sale = [], rent = [];
  jobs.forEach(([, isRent], i) => (isRent ? rent : sale).push(...res[i]));
  const prep = (t) => ({ ...t, ym: t.date.slice(0, 7), area: Math.round(t.area * 100) / 100 });
  return { sale: sale.map(prep), jeonse: rent.filter((t) => !t.rent).map(prep), wolse: rent.filter((t) => t.rent > 0).map(prep) };
}

function pickApt(all, query, dongWant) {
  const q = norm(query), byKey = new Map();
  for (const k of ['sale', 'jeonse', 'wolse']) for (const t of all[k]) {
    if (!RS.keepOf(k)(t)) continue;
    const key = t.dong + '|' + t.apt;
    (byKey.get(key) || byKey.set(key, { dong: t.dong, apt: t.apt, n: 0 }).get(key)).n++;
  }
  const items = [...byKey.values()], exact = items.filter((x) => norm(x.apt) === q && (!dongWant || x.dong === dongWant));
  if (exact.length) { exact.sort((a, b) => b.n - a.n); return { hit: exact[0], others: exact.slice(1) }; }
  const cand = items.map((x) => ({ ...x, s: Math.max(dice(q, norm(x.apt)), norm(x.apt).includes(q) || q.includes(norm(x.apt)) ? 0.6 : 0) }))
    .filter((x) => x.s >= 0.3).sort((a, b) => b.s - a.s || b.n - a.n).slice(0, 5);
  return { hit: null, candidates: cand.map((x) => ({ apt: x.apt, dong: x.dong, trades: x.n })) };
}

function resolveAreas(areas, raw) {
  const s = String(raw).trim();
  if (s.toLowerCase() === 'all') return { list: areas };
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: '면적 형식이 올바르지 않습니다. 59 또는 59.97 처럼 숫자로, 모든 면적은 all 로 입력해 주세요.' };
  const v = parseFloat(s), exact = areas.filter((a) => Math.abs(a - v) < 0.005);
  if (exact.length) return { list: exact };
  if (!s.includes('.')) {   // '59' 같은 평형(타입) 라벨: 전용 59㎡대 면적을 모두
    const grp = areas.filter((a) => Math.floor(a) === v);
    if (grp.length) return { list: grp, label: true };
  }
  return { error: `이 단지의 조회 기간 거래 중 전용 ${s}㎡ 면적이 없습니다.`, near: areas };
}

async function reportRoute(p, deps) {
  const apt = (p.get('apt') || '').trim();
  if (!apt || apt.length > 60) return fail(400, '단지명(apt)을 입력해 주세요. 예: apt=수원센트럴아이파크자이');
  const lawd = (p.get('lawd') || DEFAULT_LAWD).trim();
  if (!/^\d{5}$/.test(lawd)) return fail(400, '지역 코드(lawd)는 시군구 5자리 숫자입니다. 예: 41115(수원시 팔달구)');
  const mRaw = p.get('months'), months = mRaw == null || mRaw === '' ? 12 : /^\d+$/.test(mRaw) ? parseInt(mRaw, 10) : NaN;
  if (!(months >= 1 && months <= 36)) return fail(400, '조회 기간(months)은 1~36 사이의 정수입니다.');
  const typeRaw = (p.get('type') || 'all').toLowerCase();
  if (!['trade', 'jeonse', 'rent', 'all'].includes(typeRaw)) return fail(400, 'type은 trade, jeonse, rent, all 중 하나입니다.');
  const chartRaw0 = (p.get('chart') || '').trim().toLowerCase();
  const format = (p.get('format') || (chartRaw0 ? 'png' : 'json')).toLowerCase();
  if (!['json', 'text', 'png', 'svg', 'gallery', 'zip'].includes(format)) return fail(400, 'format은 json, text, png, svg, gallery, zip 중 하나입니다.');
  const chartRaw = chartRaw0 || (format === 'gallery' || format === 'zip' ? 'all' : '');
  if (chartRaw && !['scatter', 'floor', 'monthly', 'deposit', 'all'].includes(chartRaw)) return fail(400, 'chart는 scatter(점 그래프), floor(층별 거래가격 구간), monthly(월별 중간값과 증감률), deposit(보증금 구간별 월세), all 중 하나입니다.');
  if (chartRaw && !['png', 'svg', 'gallery', 'zip'].includes(format)) return fail(400, 'chart는 format=png, svg, gallery, zip과 함께 씁니다.');
  if (!chartRaw && ['png', 'svg'].includes(format)) return fail(400, '이미지는 chart를 지정해 주세요. 예: chart=scatter');
  if (chartRaw === 'all' && !['gallery', 'zip'].includes(format)) return fail(400, 'chart=all은 format=gallery 또는 zip에서만 쓸 수 있습니다. png·svg는 chart 이름을 하나 지정해 주세요.');
  const listAreas = p.get('list') === 'areas';
  const areaRaw = (p.get('area') || '').trim();
  if (!listAreas && !areaRaw) return fail(400, '면적(area)을 입력해 주세요. 예: area=59 또는 area=84.97, 모든 면적은 area=all. 면적 목록은 list=areas 로 볼 수 있습니다.');

  const types = typeRaw === 'all' ? ['sale', 'jeonse', 'wolse'] : [TYPE_KEYS[typeRaw]];
  const to = deps.currentYM(), toY = +to.slice(0, 4), toM = +to.slice(4);
  const d0 = new Date(toY, toM - 1 - (months - 1), 1), from = `${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}`;
  const ml = deps.monthsBetween(from, to), mlist = RS.monthsRange(from, to);
  if (ml[0] < '200601') return fail(400, '조회할 수 없는 기간입니다.');

  // 그래프 이미지는 기준일(이 단지의 가장 최근 계약일)을 PDF처럼 매매·전월세 전체에서 구하려고 둘 다 불러온다(받은 달은 캐시)
  const needSale = listAreas || !!chartRaw || types.includes('sale') || types.includes('jeonse');
  const needRent = listAreas || !!chartRaw || types.includes('jeonse') || types.includes('wolse');
  const all = await loadRows(deps, lawd, ml, needSale, needRent);

  const found = pickApt(all, apt, (p.get('dong') || '').trim());
  if (!found.hit) {
    return fail(400, `조회 기간(${mlist[0]} ~ ${mlist.at(-1)})에 '${apt}' 단지의 거래가 없습니다. 단지명이 정확한지 확인해 주세요. 지역이 다르면 lawd(시군구 코드)를 지정하세요.${found.candidates.length ? ' 비슷한 단지명: ' + found.candidates.map((c) => `${c.apt}(${c.dong})`).join(', ') : ''}`,
      { candidates: found.candidates, lawd });
  }
  const { dong, apt: aptName } = found.hit;
  const mine = (k) => all[k].filter((t) => t.apt === aptName && t.dong === dong);
  const rows = { sale: mine('sale'), jeonse: mine('jeonse'), wolse: mine('wolse') };
  const keptAll = (ks) => ks.flatMap((k) => rows[k].filter(RS.keepOf(k)));
  const all3 = keptAll(['sale', 'jeonse', 'wolse']);
  const latest = all3.reduce((m, t) => (t.date > m ? t.date : m), '');

  if (listAreas) {
    const areas = [...new Set(all3.map((t) => t.area))].sort((a, b) => a - b);
    const body = {
      meta: { apartment: aptName, dong, lawd, period: { from: mlist[0], to: mlist.at(-1), months: mlist.length }, source: SOURCE, latestContractDate: latest || null },
      areas: areas.map((a) => {
        const c = (k) => rows[k].filter((t) => t.area === a && RS.keepOf(k)(t)).length;
        return { exclusiveM2: a, label: `${a}㎡`, pyeong: Math.round(a / RS.PY), counts: { trade: c('sale'), jeonse: c('jeonse'), rent: c('wolse') } };
      }),
    };
    return finish(body, format, 'areas');
  }

  const kept = keptAll(types);
  const areas = [...new Set(kept.map((t) => t.area))].sort((a, b) => a - b);
  const rs = resolveAreas(areas, areaRaw);
  if (rs.error) {
    const all3areas = [...new Set(all3.map((t) => t.area))].sort((a, b) => a - b);
    return fail(400, `${rs.error} 거래가 있는 면적: ${(rs.near || areas).join(', ') || '없음'}${rs.near && !areas.length && all3areas.length ? ' (요청한 type에는 거래가 없고, 다른 type 포함 면적: ' + all3areas.join(', ') + ')' : ''}`, { areas: rs.near || areas });
  }
  if (!rs.list.length) return fail(400, `조회 기간에 선택한 type의 거래가 있는 면적이 없습니다. 면적 목록: list=areas`, { areas: [] });

  if (chartRaw) return chartRoute({ p, format, chartRaw, typeRaw, types, rs, rows, mlist, aptName, dong, lawd, latest });

  const meta = {
    apartment: aptName, dong, lawd, period: { from: mlist[0], to: mlist.at(-1), months: mlist.length, label: `${mlist[0].replace('-', '.')} ~ ${mlist.at(-1).replace('-', '.')}` },
    types: types.map((k) => OUT_KEY[k]),
    dataAsOf: { collectedAt: new Date().toISOString(), latestContractDate: latest || null, note: '계약일 기준이며 계약 후 30일 이내 신고 제도라 최근 계약은 아직 올라오지 않았을 수 있습니다.' },
    source: SOURCE,
    rules: '매매는 해제·직거래를 뺐고 전세·월세는 해제만 뺐습니다. 3건 미만은 표본 적음, 월별 중간값은 한 달 3건 이상인 달만, 비교 간격 4개월 이상은 간격 큼, 층 구간은 저층 1~8·중층 9~16·고층 17층 이상(면적 전체 기준).',
  };
  if (found.others && found.others.length) meta.sameNameApartments = found.others.map((x) => `${x.apt}(${x.dong})`);
  const ctx = { mlist, rows, types, meta };
  const results = rs.list.map((a) => areaReport(ctx, a));
  let body;
  if (results.length === 1) body = results[0];
  else body = { meta: { ...meta, areaQuery: areaRaw, areaCount: results.length, areas: rs.list }, results };
  return finish(body, format, 'report');
}

/* ---------- 그래프 이미지 ---------- */
// PDF 2쪽 그래프에 넣는 입력(D)을 report-stats.js 결과로 만든다. 화면(buildReportData)이 만드는 D와 같은 모양·같은 값이다.
function chartInput(kind, rows, mlist, area, aptName, latest) {
  const nw = rows.filter((t) => t.gbn === '신규'), rn = rows.filter((t) => t.gbn === '갱신');
  const ex = RS.extremes(rows, kind === 'wolse' ? (t) => t.rent : (t) => t.price);
  const D = {
    type: TYPE_NAMES[kind], complex: aptName, sel: { a: String(area) }, period: mlist[0].replace('-', '.') + ' ~ ' + mlist.at(-1).replace('-', '.'),
    kpi: { n: rows.length, lo: ex.lo, hi: ex.hi, newN: nw.length, renewN: rn.length }, floors: RS.floorStats(rows, kind), latest,
    ...RS.chartData(rows, kind, mlist),
  };
  if (kind !== 'sale') { D.legNew = nw.length; D.legRenew = rn.length; }
  if (kind === 'wolse') D.tiers = RS.depositBands(rows, (v) => v.toLocaleString('en-US')).map((t) => ({ lab: t.lab, n: t.n + '건', ok: t.ok, rngS: t.rngS, rng: t.rng }));
  return D;
}

function chartRoute(c) {
  const img = require('./report-image');
  const q = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const base = { kind: 'report', apt: c.aptName, lawd: c.p.get('lawd') || '', dong: c.p.get('dong') || '', months: c.mlist.length };
  const dotted = (d) => (d ? d.replaceAll('-', '.') : '');
  const ctx = { from: c.mlist[0].replace('-', '.'), to: c.mlist.at(-1).replace('-', '.'), latest: dotted(c.latest) };
  const keptOf = (k, a) => c.rows[k].filter((t) => t.area === a && RS.keepOf(k)(t));
  const typeKeyOf = (kind) => Object.keys(TYPE_KEYS).find((k) => TYPE_KEYS[k] === kind);
  // 한 면적의 (종류, 그래프) 목록. 번호 순서(①~⑦)대로이고 거래가 없는 종류는 뺀다
  const slots = (area, only) => {
    const out = [], empty = [];
    for (const kind of c.types) {
      const tk = typeKeyOf(kind), rows = keptOf(kind, area), names = img.CHARTS[tk].filter((n) => !only || n === only);
      if (!names.length) continue;
      if (!rows.length) { empty.push(TYPE_NAMES[kind] + ': 조회 기간에 거래 없음'); continue; }
      const D = chartInput(kind, rows, c.mlist, area, c.aptName, ctx.latest);
      for (const n of names) out.push({ kind, tk, n, D });
    }
    return { out, empty };
  };
  const attach = (name) => ({ filename: name, disposition: 'attachment' });

  if (c.format === 'png' || c.format === 'svg') {   // 면적 하나, 종류 하나, 그래프 하나
    if (c.rs.list.length !== 1) return fail(400, '이미지는 면적 하나씩 만들 수 있습니다. 면적을 정확히 지정하거나(예: area=' + c.rs.list[c.rs.list.length - 1] + '), 면적 전체는 format=gallery를 쓰세요. 이 조건의 면적: ' + c.rs.list.join(', '));
    if (c.typeRaw === 'all') return fail(400, '이미지는 type을 trade, jeonse, rent 중 하나로 지정해 주세요.');
    const allowed = img.CHARTS[c.typeRaw];
    if (!allowed.includes(c.chartRaw)) return fail(400, c.typeRaw + '에서 쓸 수 있는 chart: ' + allowed.join(', '));
    const kind = TYPE_KEYS[c.typeRaw], area = c.rs.list[0], rows = keptOf(kind, area);
    if (!rows.length) return fail(400, '전용 ' + area + '㎡의 ' + TYPE_NAMES[kind] + ' 거래가 조회 기간에 없어 그래프를 만들 수 없습니다.');
    const svg = img.buildChart(chartInput(kind, rows, c.mlist, area, c.aptName, ctx.latest), c.chartRaw, ctx);
    if (c.format === 'svg') return { status: 200, text: svg, contentType: 'image/svg+xml; charset=utf-8', maxAge: 3600, shared: true, filename: img.fileName(c.aptName, area, c.typeRaw, c.chartRaw, 'svg') };
    return { status: 200, buffer: img.toPng(svg), contentType: 'image/png', maxAge: 3600, shared: true, ...attach(img.fileName(c.aptName, area, c.typeRaw, c.chartRaw, 'png')) };
  }

  if (c.format === 'zip') {   // 한 면적의 그래프를 PNG로 만들어 zip 하나로
    if (c.rs.list.length !== 1) return fail(400, 'zip은 면적 하나씩 만들 수 있습니다. 면적을 정확히 지정해 주세요(예: area=' + c.rs.list[c.rs.list.length - 1] + '). 이 조건의 면적: ' + c.rs.list.join(', '));
    const area = c.rs.list[0], { out } = slots(area, c.chartRaw === 'all' ? '' : c.chartRaw);
    if (!out.length) return fail(400, '전용 ' + area + '㎡의 거래가 조회 기간에 없어 그래프를 만들 수 없습니다.');
    const files = out.map((s) => ({ name: img.fileName(c.aptName, area, s.tk, s.n, 'png'), data: img.toPng(img.buildChart(s.D, s.n, ctx)) }));
    const buf = require('./zip').zip(files);
    return { status: 200, buffer: buf, contentType: 'application/zip', maxAge: 3600, shared: true, ...attach(c.aptName + '_' + area + '_그래프' + files.length + '개.zip') };
  }

  const groups = [];
  for (const area of c.rs.list) {
    const { out, empty } = slots(area, c.chartRaw === 'all' ? '' : c.chartRaw);
    const items = out.map((s) => {
      const no = img.slotOf(s.tk, s.n);
      return { id: 'g' + area + '-' + no, title: img.CIRCLED[no] + ' ' + TYPE_NAMES[s.kind] + ' · ' + img.CHART_NAMES[s.n],
        pngUrl: '/api/trades?' + q({ ...base, area, type: s.tk, chart: s.n, format: 'png' }), file: img.fileName(c.aptName, area, s.tk, s.n, 'png') };
    });
    out.forEach((s, i) => { items[i].svg = img.buildChart(s.D, s.n, ctx); });
    const zipName = c.aptName + '_' + area + '_그래프' + items.length + '개.zip';
    const zip = items.length ? { label: items.length + '개 모두 저장', url: '/api/trades?' + q({ ...base, area, type: c.typeRaw, chart: c.chartRaw, format: 'zip' }), name: zipName } : null;
    groups.push({ title: '전용 ' + area + '㎡ (' + Math.round(area / RS.PY) + '평)', items, empty, zip });
  }
  const zips = groups.filter((g) => g.zip).map((g, i, a) => (a.length > 1 ? { ...g.zip, label: g.title.replace(/ \(.*$/, '').replace('전용 ', '') + ' ' + g.zip.label } : g.zip));
  const head = { title: c.aptName + ' 실거래가 그래프 모음', zips,
    meta: '조회 ' + ctx.from + '~' + ctx.to + ' · 전용 ' + c.rs.list.map((a) => a + '㎡').join(', ') + ' · 출처 국토교통부 실거래가 공개자료 · 기준일 ' + (ctx.latest || '—') + ' · 그래프마다 "PNG 저장"을 누르면 가로 2160px 이미지가 바로 내려받아집니다.' };
  return { status: 200, text: img.galleryHtml(head, groups), contentType: 'text/html; charset=utf-8', maxAge: 3600, shared: true };
}

function finish(body, format, what) {
  const maxAge = 3600;
  if (format === 'text') return { status: 200, text: require('./report-text').toText(body, what), contentType: 'text/plain; charset=utf-8', maxAge, shared: true };
  return { status: 200, body, maxAge, shared: true };
}

module.exports = { reportRoute };
