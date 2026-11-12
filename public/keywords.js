/* ---------- 키워드 검색량 탭 ----------
   자료: 네이버 검색광고 API 키워드도구 → /api/school?kind=keywords (scripts/build-keywords.js 가 매달 만든 data/keywords/YYYY-MM.json)
   화면에서는 그 달 자료를 CSV로 받기만 하고, 조회·그래프는 없다. */
(() => {
  const kw = { months: [], loaded: false, loading: false };
  const urlFor = (month, related) => '/api/school?' + new URLSearchParams({ kind: 'keywords', month, ...(related ? { related: '1' } : {}) });

  async function load() {
    if (kw.loaded || kw.loading) return;
    kw.loading = true;
    try {
      const res = await fetch('/api/school?' + new URLSearchParams({ kind: 'keywords', list: 'months' })), j = await res.json();
      if (!res.ok) throw new Error(j.error || '키워드 자료 목록을 불러오지 못했습니다.');
      kw.months = j.months || []; kw.loaded = true;
      const sel = $('kw-month'); sel.replaceChildren();
      if (!kw.months.length) {
        $('kw-note').textContent = '아직 쌓인 자료가 없습니다. PC에서 scripts/build-keywords.js 를 실행해 data/keywords/YYYY-MM.json 을 만들고 배포하세요.';
        return;
      }
      for (const m of kw.months) sel.append(new Option(m, m));
      $('kw-note').textContent = `${kw.months.length}개월치 자료가 있습니다. 월을 고르고 CSV를 내려받으세요.`;
      $('kw-dl').disabled = $('kw-dl-rel').disabled = false;
    } catch (e) { $('kw-note').textContent = e.message; }
    kw.loading = false;
  }

  $('kw-dl').onclick = () => { if ($('kw-month').value) location.href = urlFor($('kw-month').value, false); };
  $('kw-dl-rel').onclick = () => { if ($('kw-month').value) location.href = urlFor($('kw-month').value, true); };

  window.onKeywordsTab = (on) => { if (on) load(); };
  if (!$('tab-keywords').hidden) window.onKeywordsTab(true);
})();
