/* ---------- 탭 전환 + 병원·약국검색 ----------
   index.html 의 본문 스크립트 뒤에 불러온다($, loadKakao 같은 전역 함수를 쓴다).
   병원 자료: 건강보험심사평가원 병원정보서비스(/api/hospital), 지도: 카카오맵 */
(() => {
  const TABS = ['trade', 'hospital', 'school', 'kinder', 'daycare', 'keywords'];
  const hs = { map: null, markers: [], pop: null, rows: [], items: [], regionsReady: false };

  /* ----- 탭 전환 ----- */
  function showTab(t, remember) {
    if (!TABS.includes(t)) t = 'trade';
    for (const k of TABS) {
      $('tab-' + k).hidden = k !== t;
      $('mt-' + k).setAttribute('aria-selected', String(k === t));
    }
    if (remember) {
      try { localStorage.setItem('apt_tab', t); } catch {}
      history.replaceState(null, '', '#' + t);
    }
    if (window.onSchoolTab) window.onSchoolTab(t === 'school');
    if (window.onKinderTab) window.onKinderTab(t === 'kinder');
    if (window.onDaycareTab) window.onDaycareTab(t === 'daycare');
    if (window.onKeywordsTab) window.onKeywordsTab(t === 'keywords');
    if (t === 'hospital') {
      initRegions();
      // 숨겨져 있던 지도는 크기를 다시 계산해야 제대로 그려진다
      if (hs.map) { const c = hs.map.getCenter(); hs.map.relayout(); hs.map.setCenter(c); }
    } else if (typeof kmap !== 'undefined' && kmap.map) {
      const c = kmap.map.getCenter(); kmap.map.relayout(); kmap.map.setCenter(c);
    }
  }
  for (const b of document.querySelectorAll('#main-tabs button')) b.onclick = () => showTab(b.dataset.t, true);

  let first = location.hash.slice(1);
  if (!TABS.includes(first)) { try { first = localStorage.getItem('apt_tab'); } catch { first = ''; } }
  showTab(first, false);

  /* ----- 시군구 목록 (실거래가 탭과 같은 regions.json) ----- */
  function initRegions() {
    if (hs.regionsReady) return;
    hs.regionsReady = true;
    fetch('/regions.json').then((r) => r.json()).then((list) => {
      const sel = $('hs-region'), groups = new Map();
      for (const r of list) (groups.get(r.sido) || groups.set(r.sido, []).get(r.sido)).push(r);
      for (const [sido, items] of groups) {
        const og = document.createElement('optgroup'); og.label = sido;
        for (const r of items) og.append(new Option(r.name === r.sido ? r.name : r.name, r.code));
        sel.append(og);
      }
      sel.value = '41115';   // 수원시 팔달구
    }).catch(() => { hs.regionsReady = false; });
  }

  /* ----- 지도 ----- */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function popupFor(r) {
    const d = el('div', 'hs-pop');
    d.append(el('b', '', r.n));
    d.append(el('div', '', r.c + (r.d ? ` · 의사 ${r.d}명` : '')));
    d.append(el('div', '', r.a));
    if (r.t) d.append(el('div', '', r.t));
    if (/^https?:\/\//i.test(r.u)) { const a = el('a', '', '누리집'); a.href = r.u; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
    d.append(hoursBox(r));
    return d;
  }

  /* ----- 진료시간 (국립중앙의료원 자료, 팝업을 열 때 불러옴) ----- */
  const hoursCache = new Map();
  function hoursBox(r) {
    const box = el('div', 'hs-hrs', '진료시간 확인 중…');
    const key = r.n + '|' + r.a;
    let p = hoursCache.get(key);
    if (!p) {
      p = fetch('/api/hospital?' + new URLSearchParams({ hours: '1', name: r.n, addr: r.a, tel: r.t, pharm: r.c === '약국' ? '1' : '0' }))
        .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || '진료시간을 불러오지 못했습니다.'); return j; });
      hoursCache.set(key, p);
      p.catch(() => hoursCache.delete(key));   // 실패는 다음에 다시 시도할 수 있게
    }
    p.then((j) => {
      box.replaceChildren();
      if (!j.found || !j.hours.some(Boolean)) { box.textContent = '진료시간 정보가 없습니다.'; return; }
      const today = (new Date().getDay() + 6) % 7;   // 월=0 … 일=6
      const t = el('table');
      j.days.forEach((day, i) => {
        const tr = el('tr'); if (i === today) tr.className = 'today';
        tr.append(el('th', '', day), el('td', '', j.hours[i] || (i === 7 ? '정보 없음' : '휴진·정보 없음')));
        t.append(tr);
      });
      box.append(el('b', '', '진료시간'), t);
      if (j.note) box.append(el('div', 'hs-etc', j.note));   // 점심시간 등 기관이 적은 안내
      box.append(el('small', '', '국립중앙의료원 자료 · 방문 전 전화로 확인하세요'));
    }).catch((e) => { box.textContent = e.message; });
    return box;
  }

  function openPop(i) {
    const r = hs.rows[i], m = hs.markers[i];
    if (!m) return;
    if (hs.pop) hs.pop.setMap(null);
    hs.pop = new kakao.maps.CustomOverlay({ map: hs.map, position: m.getPosition(), content: (() => {
      const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:38px';
      w.append(popupFor(r)); return w;
    })(), yAnchor: 1, zIndex: 3 });
    hs.map.panTo(m.getPosition());
    for (const li of $('hs-ul').children) li.classList.toggle('on', Number(li.dataset.i) === i);
    const on = $('hs-ul').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  // 약국은 초록색 핀으로 구분한다 (병원은 카카오 기본 파란 핀)
  let pharmImg = null;
  function pharmImage() {
    if (!pharmImg) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="29" height="42" viewBox="0 0 29 42"><path d="M14.5 1C7 1 1 7 1 14.5 1 24 14.5 41 14.5 41S28 24 28 14.5C28 7 22 1 14.5 1z" fill="#2e9d5b" stroke="#17653a" stroke-width="1.5"/><path d="M12.5 8h4v4.5H21v4h-4.5V21h-4v-4.5H8v-4h4.5z" fill="#fff"/></svg>';
      pharmImg = new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(29, 42), { offset: new kakao.maps.Point(14, 42) });
    }
    return pharmImg;
  }

  async function draw(rows) {
    await loadKakao();
    if (!hs.map) {
      hs.map = new kakao.maps.Map($('hs-box'), { center: new kakao.maps.LatLng(37.5665, 126.978), level: 6 });
      kakao.maps.event.addListener(hs.map, 'click', () => { if (hs.pop) { hs.pop.setMap(null); hs.pop = null; } });
    }
    for (const m of hs.markers) if (m) m.setMap(null);
    if (hs.pop) { hs.pop.setMap(null); hs.pop = null; }
    hs.markers = [];
    hs.rows = rows;
    const bounds = new kakao.maps.LatLngBounds();
    let placed = 0;
    rows.forEach((r, i) => {
      if (!r.x || !r.y) { hs.markers.push(null); return; }
      const pos = new kakao.maps.LatLng(r.y, r.x);
      const m = new kakao.maps.Marker({ map: hs.map, position: pos, title: r.n, ...(r.c === '약국' ? { image: pharmImage() } : {}) });
      kakao.maps.event.addListener(m, 'click', () => openPop(i));
      hs.markers.push(m); bounds.extend(pos); placed++;
    });
    hs.map.relayout();
    if (placed) hs.map.setBounds(bounds);
  }

  /* ----- 검색 ----- */
  let seq = 0;
  async function search() {
    const my = ++seq, status = $('hs-status');
    const lawd = $('hs-region').value;
    if (!lawd) { status.textContent = '시군구를 고르세요.'; return; }
    const p = new URLSearchParams({ lawd, cl: $('hs-cl').value, dgsbjt: $('hs-dg').value, name: $('hs-name').value.trim() });
    $('hs-go').disabled = true; status.textContent = '병원을 찾는 중…';
    try {
      const res = await fetch('/api/hospital?' + p), j = await res.json();
      if (!res.ok) throw new Error(j.error || '병원 정보를 불러오지 못했습니다.');
      if (my !== seq) return;
      const rows = j.rows.slice().sort((a, b) => a.n.localeCompare(b.n, 'ko'));
      const label = $('hs-region').selectedOptions[0].parentNode.label + ' ' + $('hs-region').selectedOptions[0].textContent;
      const cond = [$('hs-cl').value && $('hs-cl').selectedOptions[0].textContent, $('hs-dg').value && $('hs-dg').selectedOptions[0].textContent, p.get('name') && `“${p.get('name')}”`].filter(Boolean);
      $('hs-card').hidden = false;
      $('hs-h').textContent = `${label}${cond.length ? ' · ' + cond.join(' · ') : ''} — ${rows.length.toLocaleString()}곳`;
      const noPos = rows.filter((r) => !r.x || !r.y).length;
      $('hs-note').textContent = [
        j.truncated ? `전체 ${j.total.toLocaleString()}곳 중 앞의 ${rows.length.toLocaleString()}곳만 보여 줍니다. 종별·진료과목·이름으로 좁혀 보세요.` : '',
        !$('hs-cl').value && $('hs-dg').value ? '진료과목을 고르면 약국은 빠집니다.' : '',
        rows.some((r) => r.c === '약국') ? '초록 핀은 약국, 파란 핀은 병원입니다.' : '',
        noPos ? `위치 정보가 없는 ${noPos}곳은 목록에만 나옵니다.` : '',
        '출처: 건강보험심사평가원 병원정보서비스·약국정보서비스',
      ].filter(Boolean).join(' ');
      const ul = $('hs-ul'); ul.replaceChildren();
      if (!rows.length) { const li = el('li', 'nol', '조건에 맞는 병원이 없습니다.'); ul.append(li); }
      rows.forEach((r, i) => {
        const li = el('li'); li.dataset.i = i;
        li.append(el('span', 'nm', r.n));
        li.append(el('small', '', r.c + (r.d ? ` · 의사 ${r.d}명` : '')));
        li.append(el('small', '', r.a));
        if (r.t) li.append(el('small', '', r.t));
        if (!r.x || !r.y) li.classList.add('nol'); else li.onclick = () => openPop(i);
        ul.append(li);
      });
      status.textContent = '';
      try { await draw(rows); } catch (e) { $('hs-note').textContent += ' 지도를 표시하지 못했습니다: ' + e.message; }
    } catch (e) {
      if (my === seq) status.textContent = e.message;
    }
    if (my === seq) $('hs-go').disabled = false;
  }
  /* ----- 지도 전체 화면 (Esc로 돌아오기) ----- */
  function setFull(on) {
    const w = $('hs-wrap');
    if (w.classList.contains('full') === on) return;
    w.classList.toggle('full', on);
    $('hs-full').textContent = on ? '전체 화면 닫기 (Esc)' : '전체 화면';
    if (hs.map) { const c = hs.map.getCenter(); hs.map.relayout(); hs.map.setCenter(c); }   // 크기가 바뀌면 다시 계산하고 보던 중심은 유지
  }
  $('hs-full').onclick = () => setFull(!$('hs-wrap').classList.contains('full'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFull(false); });

  $('hs-go').onclick = search;
  $('hs-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
})();
