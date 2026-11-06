/* ---------- 유치원 탭 ----------
   자료: 한국교육학술정보원 유치원 공시정보(유치원알리미) → /api/kinder (data/kinder/kinder.json), 지도: 카카오맵
   단지 대표점 기준 직선거리 1km 안의 유치원을 가까운 순으로 보여 준다. */
(() => {
  const kd = { map: null, markers: [], pop: null, rows: [], loaded: false, loading: false };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const distTxt = (m) => `약 ${Math.max(10, Math.round(m / 10) * 10).toLocaleString()}m`;
  const fmtDate = (s) => String(s || '').replace(/-/g, '.');
  const telHref = (t) => 'tel:' + t.replace(/[^0-9+]/g, '');

  function popupFor(r) {
    const d = el('div', 'hs-pop');
    d.append(el('b', '', r.n));
    d.append(el('div', '', r.est));
    d.append(el('div', '', r.a));
    d.append(el('div', '', `직선거리 ${distTxt(r.d)}`));
    if (r.h) d.append(el('div', '', '운영시간 ' + r.h));
    if (r.t) { const a = el('a', '', '☎ ' + r.t); a.href = telHref(r.t); d.append(a); }
    const u = /^https?:\/\//i.test(r.u) ? r.u : (r.u ? 'http://' + r.u : '');
    if (/^https?:\/\/[^\s]+$/i.test(u)) { d.append(document.createTextNode(' ')); const a = el('a', '', '누리집'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
    return d;
  }
  function openPop(i) {
    const r = kd.rows[i], m = kd.markers[i];
    if (!m) return;
    if (kd.pop) kd.pop.setMap(null);
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:38px';
    w.append(popupFor(r));
    kd.pop = new kakao.maps.CustomOverlay({ map: kd.map, position: m.getPosition(), content: w, yAnchor: 1, zIndex: 3 });
    kd.map.panTo(m.getPosition());
    for (const li of $('kd-ul').children) li.classList.toggle('on', Number(li.dataset.i) === i);
    const on = $('kd-ul').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  // 단지 대표점은 흰 네모, 유치원은 노란 핀으로 구분한다
  function img(svg, w, h, ox, oy) { return new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(ox, oy) }); }
  const pinImg = () => img('<svg xmlns="http://www.w3.org/2000/svg" width="29" height="42" viewBox="0 0 29 42"><path d="M14.5 1C7 1 1 7 1 14.5 1 24 14.5 41 14.5 41S28 24 28 14.5C28 7 22 1 14.5 1z" fill="#e8a317" stroke="#8a5d00" stroke-width="1.5"/><circle cx="14.5" cy="14.5" r="5" fill="#fff"/></svg>', 29, 42, 14, 42);
  const homeImg = () => img('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="2" width="18" height="18" rx="3" fill="#fff" stroke="#8e1b1c" stroke-width="2.5"/><rect x="7" y="7" width="8" height="8" fill="#8e1b1c"/></svg>', 22, 22, 11, 11);

  async function draw(j) {
    await loadKakao();
    const c = new kakao.maps.LatLng(j.meta.기준점.위도, j.meta.기준점.경도);
    if (!kd.map) {
      kd.map = new kakao.maps.Map($('kd-box'), { center: c, level: 5 });
      kakao.maps.event.addListener(kd.map, 'click', () => { if (kd.pop) { kd.pop.setMap(null); kd.pop = null; } });
    }
    const bounds = new kakao.maps.LatLngBounds(); bounds.extend(c);
    new kakao.maps.Marker({ map: kd.map, position: c, title: j.meta.기준점.이름 + ' (대표점)', image: homeImg() });
    new kakao.maps.Circle({ map: kd.map, center: c, radius: j.meta.반경_m, strokeWeight: 2, strokeColor: '#8e1b1c', strokeOpacity: 0.6, strokeStyle: 'dashed', fillColor: '#8e1b1c', fillOpacity: 0.05 });
    kd.markers = j.rows.map((r, i) => {
      const pos = new kakao.maps.LatLng(r.lat, r.lng);
      const m = new kakao.maps.Marker({ map: kd.map, position: pos, title: r.n, image: pinImg() });
      kakao.maps.event.addListener(m, 'click', () => openPop(i));
      bounds.extend(pos); return m;
    });
    kd.map.relayout(); kd.map.setBounds(bounds);
  }

  async function load() {
    if (kd.loaded || kd.loading) return;
    kd.loading = true;
    try {
      const res = await fetch('/api/kinder'), j = await res.json();
      if (!res.ok) throw new Error(j.error || '유치원 정보를 불러오지 못했습니다.');
      kd.rows = j.rows; kd.loaded = true;
      const m = j.meta, km = m.반경_m / 1000;
      $('kd-h').textContent = `${m.기준점.이름} 반경 ${km}km 유치원 — ${j.rows.length}곳`;
      $('kd-note').textContent = `단지 대표점에서 직선거리 ${km}km 안, 가까운 순입니다. 노란 핀은 유치원, 흰 네모는 단지 대표점입니다. 목록에서 항목을 누르면 지도에 표시됩니다.`;
      $('kd-src').textContent = `출처: ${m.출처}, 수집일 ${fmtDate(m.수집일)}.`;
      const ul = $('kd-ul'); ul.replaceChildren();
      if (!j.rows.length) ul.append(el('li', '', '반경 안에 공시된 유치원이 없습니다.'));
      j.rows.forEach((r, i) => {
        const li = el('li'); li.dataset.i = i;
        li.append(el('span', 'nm', r.n));
        li.append(el('small', '', `${r.est} · 직선거리 ${distTxt(r.d)}`));
        li.append(el('small', '', r.a));
        if (r.t) { const s = el('small'); const a = el('a', '', '☎ ' + r.t); a.href = telHref(r.t); a.onclick = (e) => e.stopPropagation(); s.append(a); li.append(s); }
        li.onclick = () => openPop(i);
        ul.append(li);
      });
      try { await draw(j); } catch (e) { $('kd-note').textContent += ' 지도를 표시하지 못했습니다: ' + e.message; }
    } catch (e) { $('kd-note').textContent = e.message; }
    kd.loading = false;
  }

  window.onKinderTab = (on) => {
    if (!on) return;
    load();
    if (kd.map) { const c = kd.map.getCenter(); kd.map.relayout(); kd.map.setCenter(c); }
  };

  /* ----- 지도 전체 화면 (Esc로 돌아오기) ----- */
  function setFull(on) {
    const w = $('kd-wrap');
    if (w.classList.contains('full') === on) return;
    w.classList.toggle('full', on);
    $('kd-full').textContent = on ? '전체 화면 닫기 (Esc)' : '전체 화면';
    if (kd.map) { const c = kd.map.getCenter(); kd.map.relayout(); kd.map.setCenter(c); }
  }
  $('kd-full').onclick = () => setFull(!$('kd-wrap').classList.contains('full'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFull(false); });
  if (!$('tab-kinder').hidden) window.onKinderTab(true);
})();
