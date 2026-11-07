// kind=report&format=text: JSON 결과를 사람이 읽기 쉬운 한국어 텍스트(표 포함)로 바꾼다. 숫자는 JSON과 같은 값이다.
const SEP = '─'.repeat(40);
const table = (head, rows) => [head.join(' | '), head.map(() => '---').join(' | '), ...rows.map((r) => r.join(' | '))].map((l) => '| ' + l + ' |').join('\n');
const dispOf = (m) => (m ? m.display : '—');

function extText(e) { return e ? `${e.amount.display} (계약일 ${e.date}${e.moreText ? ' ' + e.moreText : ''})` : '—'; }

function floorsTable(floors, rent) {
  if (rent) return table(['층 구간', '건수', '보증금 범위', '월세 범위'], floors.map((f) => [`${f.floor}(${f.range})`, `${f.count}건`, f.count ? f.deposit.display : f.sample, f.count ? f.rent.display : '—']));
  return table(['층 구간', '건수', '최저~최고', '비고'], floors.map((f) => [`${f.floor}(${f.range})`, `${f.count}건`, f.count ? f.priceRange.display : '—', f.sample || '']));
}

function monthlyTable(m, rent) {
  const head = rent ? ['월', '건수', '월세 중간값', '보증금 중간값', '비교 달', '증감률'] : ['월', '건수', '중간값', '비교 달', '증감률'];
  return table(head, m.map((e) => {
    const med = e.median ? e.median.display : e.sample;
    const cmp = e.comparedTo ? `${e.comparedTo}${e.basis && e.gapMonths > 1 ? ' (' + e.basis + ')' : ''}` : '—';
    return rent ? [e.month, `${e.count}건`, med, e.median ? dispOf(e.depositMedian) : '—', cmp, e.change || '—'] : [e.month, `${e.count}건`, med, cmp, e.change || '—'];
  }));
}

function trendLines(k) {
  const o = k.overall, l = k.latest, out = [];
  if (o.from) out.push(`기간 전체 변화: ${o.from.month} ${o.from.median.display} → ${o.to.month} ${o.to.median.display} = ${o.change}${o.status ? ' (중간값을 낸 달 ' + o.monthsWithMedian + '개월)' : ''}`);
  else out.push(`기간 전체 변화: ${o.status}`);
  if (l) out.push(`가장 최근 증감: ${l.month} ${l.change} (${l.basis}${l.comparedTo ? ', 비교 ' + l.comparedTo : ''}, ${l.diff.sign}${l.diff.amount.display})`);
  return out;
}

function recent6Lines(r, rent) {
  const out = [`최근 6개월 기준: ${r.basis}`];
  out.push(`${rent ? '보증금 ' : ''}실거래 범위: ${r.range ? r.range.display : '거래 없음'}`);
  if (rent) out.push(`보증금 중간값 ${dispOf(r.depositMedian)} · 월세 중간값 ${dispOf(r.rentMedian)}`);
  out.push(table(['층 구간', '건수', rent ? '보증금 범위' : '최저~최고', '비고'], r.floors.map((f) => [`${f.floor}(${f.range})`, `${f.count}건`, f.count ? f.priceRange.display : '—', f.sample || ''])));
  return out;
}

function kindText(name, k, key) {
  const out = [`■ ${name}`];
  if (!k.count) { out.push('거래 없음'); return out.join('\n'); }
  const s = k.summary, rent = key === 'rent';
  out.push(`거래 건수: ${s.count}건` + (s.newCount != null ? ` (신규 ${s.newCount}건 · 갱신 ${s.renewCount}건)` : '') + (k.sample ? ` · ${k.sample}` : ''));
  if (rent) {
    out.push(`가장 낮은 월세: ${s.lowestRent.amount.display} · 보증금 ${s.lowestRent.deposit.display} (계약일 ${s.lowestRent.date}${s.lowestRent.moreText ? ' ' + s.lowestRent.moreText : ''})`);
    out.push(`가장 높은 월세: ${s.highestRent.amount.display} · 보증금 ${s.highestRent.deposit.display} (계약일 ${s.highestRent.date}${s.highestRent.moreText ? ' ' + s.highestRent.moreText : ''})`);
    out.push(`보증금 범위: ${s.depositRange.display}`);
    out.push('', '[보증금 구간별 월세]', table(['보증금 구간', '건수', '월세 범위'], k.depositBands.map((b) => [b.band, `${b.count}건`, b.count ? b.rentRange.display : (b.sample || '—')])));
  } else {
    out.push(`최저: ${extText(s.lowest)}`, `최고: ${extText(s.highest)}`);
  }
  out.push('', rent ? '[층별 보증금·월세 범위]' : '[층별 ' + (key === 'trade' ? '거래가격' : '보증금') + ' 범위]', floorsTable(k.floors, rent));
  if (k.floorMedianSentence) out.push(k.floorMedianSentence);
  if (k.jeonseRatio) out.push(`전세가율 ${k.jeonseRatio.display}${k.jeonseRatio.newOnly ? ' (신규 계약만 ' + k.jeonseRatio.newOnly + ')' : ''} — ${k.jeonseRatio.formula}. ${k.jeonseRatio.note}`);
  else if (key === 'jeonse') out.push('전세가율: 같은 기간 매매 거래가 없어 계산할 수 없음');
  out.push('', rent ? '[월별 월세 중간값·증감률]' : '[월별 중간값·증감률]', monthlyTable(k.monthly, rent), ...trendLines(k));
  if (rent) out.push(`※ ${k.monthlyNote}`);
  out.push('', '[최근 6개월]', ...recent6Lines(k.recent6, rent));
  out.push(`(점 그래프용 거래 ${k.points.length}건은 JSON의 points에 있습니다)`);
  return out.join('\n');
}

function areaText(r) {
  const m = r.meta, out = [];
  out.push(`${SEP}\n${m.apartment} · 전용 ${m.area.exclusiveM2}㎡(${m.area.pyeong}평) 실거래가 리포트\n${SEP}`);
  out.push(`조회 기간: ${m.period.label} (${m.period.months}개월) · 출처: ${m.source}`);
  out.push(`데이터 기준: 계약일 기준 · 이 단지 가장 최근 계약일 ${m.dataAsOf.latestContractDate || '—'}`);
  if (m.tradeExcluded) out.push(`매매 제외: 직거래 ${m.tradeExcluded.direct}건 · 해제 ${m.tradeExcluded.canceled}건`);
  for (const [key, name] of [['trade', '매매'], ['jeonse', '전세'], ['rent', '월세']]) if (r[key]) out.push('', kindText(name, r[key], key));
  return out.join('\n');
}

const MONTH_NOTE = '※ 최근 달은 신고 기간 중이라 바뀔 수 있습니다.';

function toText(body, what) {
  return MONTH_NOTE + '\n\n' + bodyText(body, what);
}

function bodyText(body, what) {
  if (what === 'areas') {
    const m = body.meta;
    return [`${m.apartment}(${m.dong}) 면적 목록 · 조회 기간 ${m.period.from} ~ ${m.period.to} (${m.period.months}개월) · 출처 ${m.source}`, '',
      table(['전용면적', '평형', '매매', '전세', '월세'], body.areas.map((a) => [a.label, `${a.pyeong}평`, `${a.counts.trade}건`, `${a.counts.jeonse}건`, `${a.counts.rent}건`])),
      '', '※ 매매는 해제·직거래 제외, 전세·월세는 해제 제외 건수입니다.'].join('\n') + '\n';
  }
  if (body.results) {
    const m = body.meta;
    const head = `${m.apartment} · 면적 ${m.areaCount}개(${m.areas.map((a) => a + '㎡').join(', ')}) 실거래가 리포트 · 조회 기간 ${m.period.label}`;
    return head + '\n\n' + body.results.map(areaText).join('\n\n') + '\n';
  }
  return areaText(body) + '\n';
}

module.exports = { toText };
